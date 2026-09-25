/**
 * 学习路线的"用户状态覆盖层"入口。
 *
 * ── 它管什么 ──
 *
 * 官方路线（ROADMAP_STAGES）是只读模板，用户标记的状态是独立覆盖层。
 * 本 composable 就是覆盖层的唯一读写口：
 *   · 内存中的响应式状态（useState，全站共享一份 —— 侧栏与路线页看到的是同一个"我"）；
 *   · localStorage 持久化（键带 ROADMAP_VERSION，路线结构变更时旧数据自然失效）；
 *   · 登录后的云同步（GET 合并 + 写操作双发，见文件末尾的取舍说明）。
 *
 * ── SSR 策略 ──
 *
 * 服务端读不到 localStorage，所以 SSR 渲染的是官方默认进度；
 * 覆盖层由 roadmap-hydrate.client 插件在浏览器接管后才应用。
 * 这与登录态恢复是同一套"先渲染默认、后台 hydrate"的模式（见 useAuth.restore）。
 *
 * ⚠️ 与 useApi / useAuth 一样，这里靠 Nuxt 自动导入互相调用而不写静态
 *    import，避免 composables 之间形成循环依赖。
 */
import type {
  Course,
  CourseStatus,
  RoadmapOverrides,
  RoadmapProgressResponse,
} from '@studyplan/shared'
import { ROADMAP_VERSION, isKnownCourseId, resolveCourseStatus } from '@studyplan/shared'

/** 键带版本号：路线数据结构变更时 bump ROADMAP_VERSION，旧缓存整体失效而不是脏读 */
const STORAGE_KEY = `studyplan:roadmap:v${ROADMAP_VERSION}`

/** 覆盖层里单条记录的结构（读缓存时做形状校验用） */
function isValidEntry(value: unknown): value is RoadmapOverrides[string] {
  const entry = value as RoadmapOverrides[string]
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.status === 'string' &&
    typeof entry.updatedAt === 'string'
  )
}

function readLocal(): RoadmapOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}

    /**
     * 逐项校验而不是直接信任缓存：
     * localStorage 是用户可以碰到的存储（控制台、其它脚本），
     * 一条坏数据不该让整个进度计算崩掉。未知 courseId 在这里就被丢掉。
     */
    const clean: RoadmapOverrides = {}
    for (const [courseId, entry] of Object.entries(parsed)) {
      if (isKnownCourseId(courseId) && isValidEntry(entry)) clean[courseId] = entry
    }
    return clean
  } catch {
    // JSON 解析失败 / 隐私模式下 localStorage 抛异常：当作没有本地数据
    return {}
  }
}

function writeLocal(overrides: RoadmapOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // 写失败（配额满 / 隐私模式）只影响"刷新后不保留"，内存状态仍然正确，不打断交互
  }
}

/**
 * 逐节点 LWW（last-write-wins）合并：比较 updatedAt 取较新的一条。
 *
 * 为什么按节点合并而不是整包覆盖？
 * 因为冲突的真实粒度就是节点 —— 在 A 设备勾了"React"、
 * 在 B 设备改了"Git"，两边都该保留；整包覆盖必然丢一边的操作。
 */
function mergeByUpdatedAt(local: RoadmapOverrides, remote: RoadmapOverrides): RoadmapOverrides {
  const merged: RoadmapOverrides = { ...local }
  for (const [courseId, entry] of Object.entries(remote)) {
    if (!isKnownCourseId(courseId)) continue
    const mine = merged[courseId]
    if (!mine || entry.updatedAt >= mine.updatedAt) merged[courseId] = entry
  }
  return merged
}

export function useRoadmapState() {
  const overrides = useState<RoadmapOverrides>('roadmap:overrides', () => ({}))
  const hydrated = useState<boolean>('roadmap:hydrated', () => false)

  const auth = useAuth()
  const api = useApi()

  /** 单个节点的最终状态（覆盖层 ?? 官方默认）。UI 渲染一律问这里 */
  function statusOf(course: Course): CourseStatus {
    return resolveCourseStatus(course, overrides.value)
  }

  /** 用户是否显式标记过该节点（决定"恢复默认"入口是否出现） */
  function isOverridden(courseId: string): boolean {
    return courseId in overrides.value
  }

  /**
   * 设置节点状态。
   *
   * 本地**永远先写**、立即生效；登录态下再向云端补一发。
   * 云写失败被吞掉 —— 后端宕机时本地功能必须完整可用（降级不报错），
   * 下次进页面时 pullFromCloud 会按 LWW 把差异弥合回来。
   */
  function setStatus(courseId: string, status: CourseStatus): void {
    if (!isKnownCourseId(courseId)) return

    const next: RoadmapOverrides = {
      ...overrides.value,
      [courseId]: { status, updatedAt: new Date().toISOString() },
    }
    overrides.value = next
    if (import.meta.client) writeLocal(next)

    if (auth.isLoggedIn.value) {
      void api
        .put<RoadmapProgressResponse>(`/roadmap/progress/${courseId}`, { status })
        .then(res => {
          // 用服务端的合并结果校正（多设备并发时以服务端时钟为准）
          overrides.value = res.steps
          if (import.meta.client) writeLocal(res.steps)
        })
        .catch(() => {
          /* 静默：本地已记录，见上方说明 */
        })
    }
  }

  /** 单节点恢复官方默认：本地删除条目 + 云端 $unset */
  function resetCourse(courseId: string): void {
    if (!(courseId in overrides.value)) return

    const next = { ...overrides.value }
    delete next[courseId]
    overrides.value = next
    if (import.meta.client) writeLocal(next)

    if (auth.isLoggedIn.value) {
      void api.remove(`/roadmap/progress/${courseId}`).catch(() => undefined)
    }
  }

  /** 重置全部个人进度 */
  function resetAll(): void {
    overrides.value = {}
    if (import.meta.client) writeLocal({})

    if (auth.isLoggedIn.value) {
      void api.remove<RoadmapProgressResponse>('/roadmap/progress').catch(() => undefined)
    }
  }

  /**
   * 登录就绪后从云端拉覆盖层并 LWW 合并。
   *
   * 由 hydrate 注册的 watch 触发：应用启动恢复登录态、登录页刚登录、
   * 这些时刻就绪标志翻转会各自拉一次。失败静默（本地数据继续工作）。
   */
  async function pullFromCloud(): Promise<void> {
    try {
      const res = await api.get<RoadmapProgressResponse>('/roadmap/progress')
      overrides.value = mergeByUpdatedAt(overrides.value, res.steps)
      if (import.meta.client) writeLocal(overrides.value)
    } catch {
      // 后端不可用 / 未登录被 401 挡下且续期失败：保持本地状态即可
    }
  }

  /**
   * 浏览器接管时的初始化（只该由 .client 插件调用，幂等）。
   *
   * ⚠️ 调用时机必须是 **hydration 完成之后**（插件里挂 app:mounted）。
   *    若在插件 setup 阶段同步调用，客户端首屏渲染就会用上覆盖层，
   *    而 SSR 渲染的是官方默认 —— 二者 HTML 不一致会触发水合 mismatch，
   *    进度条更会卡在服务端默认值上。放到 app:mounted 后：首屏先与服务端对齐，
   *    再由此处一次性切到"我的"进度（这一跳是设计本就接受的）。
   *
   * 顺序：先灌本地数据（界面切到"我的"进度），
   * 再挂登录态的 watch（异步云合并到达后二次刷新是正常路径）。
   */
  function hydrate(): void {
    if (import.meta.server || hydrated.value) return
    hydrated.value = true

    overrides.value = readLocal()

    watch(
      () => auth.ready.value && auth.isLoggedIn.value,
      ready => {
        if (ready) void pullFromCloud()
      },
      { immediate: true },
    )
  }

  return {
    overrides,
    hydrated,
    statusOf,
    isOverridden,
    setStatus,
    resetCourse,
    resetAll,
    hydrate,
  }
}
