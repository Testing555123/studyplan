import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * 指针跟随的 3D 倾斜 + 高光。
 *
 * 使用方式：
 *   const { target, tracking, style } = useTilt({ max: 4 })
 *   <div ref="target" class="tilt" :class="{ 'tilt--tracking': tracking }" :style="style">
 *     <span class="tilt-spot" :class="{ 'tilt-spot--on': tracking }" />
 *
 * 角度与光斑位置都以 CSS 变量写进 style，插值交给 CSS transition ——
 * 这样 JS 每次指针移动只做一次赋值，不必自己维护 rAF 循环。
 *
 * ── 启用条件 ──
 * 只在「真的有悬停指针」的设备上启用（桌面鼠标 / 触控板）：
 *   · 触屏没有 hover，指针位置只在按下那一刻存在，倾斜会变成突兀的一跳；
 *   · 用户要求减少动效时同样不启用（前庭敏感用户对位移最敏感）。
 * 不满足条件时 composable 什么也不做，元素保持 transform: none。
 */
export interface UseTiltOptions {
  /** 最大倾斜角度（度）。默认 4° —— 再大就从"有质感"变成"晃眼" */
  max?: number
  /**
   * 复用外部已有的元素 ref。
   *
   * 一个元素上往往要同时挂多个行为（比如既做进入视口浮现、又做倾斜），
   * 而模板里 `ref="x"` 只能绑一个 ref。允许传入外部 ref 之后，
   * 调用方可以 `useReveal()` 拿 target，再把它交给 `useTilt({ target })`。
   */
  target?: Ref<HTMLElement | null>
}

export function useTilt(options: UseTiltOptions = {}) {
  const max = options.max ?? 4

  const target = options.target ?? ref<HTMLElement | null>(null)
  /** 指针是否停在元素上：控制"去掉过渡紧跟指针"与高光的显隐 */
  const tracking = ref(false)

  const tiltX = ref(0)
  const tiltY = ref(0)
  const spotX = ref(50)
  const spotY = ref(50)

  let el: HTMLElement | null = null

  function handleMove(event: PointerEvent) {
    if (!el) return
    const rect = el.getBoundingClientRect()
    // 归一到 [-0.5, 0.5]：中心为 0，四角各 ±0.5
    const px = (event.clientX - rect.left) / rect.width - 0.5
    const py = (event.clientY - rect.top) / rect.height - 0.5

    // 向右移 → 绕 Y 轴正向转；向下移 → 绕 X 轴反向转（符合"按压远端"的直觉）
    tiltY.value = px * 2 * max
    tiltX.value = -py * 2 * max
    spotX.value = (px + 0.5) * 100
    spotY.value = (py + 0.5) * 100
  }

  function handleEnter() {
    tracking.value = true
  }

  function handleLeave() {
    tracking.value = false
    // 归位：CSS 上的 transition 会把这段回弹补成柔和的动画
    tiltX.value = 0
    tiltY.value = 0
  }

  onMounted(() => {
    el = target.value
    if (!el) return

    const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!canHover || prefersReduced) return

    el.addEventListener('pointerenter', handleEnter)
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerleave', handleLeave)
  })

  onBeforeUnmount(() => {
    if (!el) return
    el.removeEventListener('pointerenter', handleEnter)
    el.removeEventListener('pointermove', handleMove)
    el.removeEventListener('pointerleave', handleLeave)
    el = null
  })

  /**
   * CSS 变量集合。
   * 用 computed 而不是每次事件里直接改 DOM style：
   * 让 Vue 统一批处理，也保证 SSR 时输出的 style 是确定的（全为初始值），
   * 不会出现服务端与客户端 style 不一致导致的水合告警。
   */
  const style = computed(() => ({
    '--tilt-x': `${tiltX.value}deg`,
    '--tilt-y': `${tiltY.value}deg`,
    '--spot-x': `${spotX.value}%`,
    '--spot-y': `${spotY.value}%`,
  }))

  return { target, tracking, style }
}
