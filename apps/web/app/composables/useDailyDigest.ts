import { ref } from 'vue'
import type { DailyDigestStatusResponse } from '@studyplan/shared'

/**
 * 「每日 GitHub 项目报道」的今日状态。
 *
 * ── 为什么分「读取」和「生成」两个动作 ──
 *
 * 生成一篇报道要真调一次模型，实测 20-40 秒。
 * 如果页面一加载就打一个"会生成"的接口，用户就要对着转圈区块干等半分钟，
 * 还可能撞上网关超时。
 *
 * 所以：
 *   · `refresh()`  只读状态 —— 廉价、可频繁调用，页面加载与轮询用它；
 *   · `generate()` 显式生成 —— 只在用户点「立即生成」时调用，此时他可以等。
 *
 * 页面加载时会 `refresh()`，后端顺带在**后台**补发当天那篇，
 * 所以这里会隔几秒再取一次，让补发结果自己浮出来。
 */

/** 一次页面会话内只自动读取一次，避免每次导航都打接口 */
let ensured = false

/** 加载后等待补发的轮询：2 轮 × 4 秒 */
const POLL_INTERVAL_MS = 4000
const POLL_MAX_ROUNDS = 2

export function useDailyDigest() {
  const api = useApi()

  const status = ref<DailyDigestStatusResponse | null>(null)
  const loading = ref(false)
  const generating = ref(false)
  const error = ref<string | null>(null)

  /** 只读：取今天的推荐与各项开关状态 */
  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      status.value = await api.get<DailyDigestStatusResponse>('/daily-digest/today')
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '今日推荐加载失败'
    } finally {
      loading.value = false
    }
  }

  /** 显式生成：用户点了按钮，愿意等 */
  async function generate(): Promise<void> {
    /**
     * 未到发布时间就不发请求。
     *
     * 后端也有同一个闸门，但那要等一次往返才能知道结果；更重要的是
     * **按钮本来就该是灰的** —— 能点动却什么都不发生，本身就是界面缺陷。
     * 这里再挡一道，只为让"点了没反应"不可能发生。
     * 原因由页面上的文案说明（见 `DailyDigestBanner` 的 `notice`）。
     */
    if (status.value && !status.value.canPublishNow) return

    generating.value = true
    error.value = null
    try {
      status.value = await api.post<DailyDigestStatusResponse>('/daily-digest/generate')
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '生成失败，请稍后再试'
    } finally {
      generating.value = false
    }
  }

  /** 页面挂载时调用：同一次会话只读一次，并给后台补发留出观察窗口 */
  async function ensureOnce(): Promise<void> {
    if (ensured) return
    ensured = true

    await refresh()

    // 装置没开、今天已经有了、或者还没到发布时间，都没有什么可等的。
    // 最后一项能省掉一次 8 秒的空轮询：闸门没开时后端不会补发，
    // 一直轮询只是在等一件不会发生的事。
    if (!status.value?.enabled || status.value.pick) return
    if (!status.value.canPublishNow) return

    for (let round = 0; round < POLL_MAX_ROUNDS; round += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      await refresh()
      if (status.value?.pick) break
    }
  }

  return { status, loading, generating, error, refresh, generate, ensureOnce }
}
