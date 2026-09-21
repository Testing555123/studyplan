import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 元素"进入视口时浮现"的能力。
 *
 * 使用方式：
 *   const { target, state } = useReveal()
 *   <div ref="target" :class="['reveal', `reveal--${state}`]">
 *
 * 配套样式在 main.css 的 `.reveal` / `.reveal--pending` / `.reveal--in`。
 *
 * ── 为什么自己写而不用动效库的 initial={{ opacity: 0 }} ──
 *
 * 关键区别在于**初始可见性归谁管**：
 *
 *   · 动效库的写法是「初始就隐藏，靠 JS 点亮」。SSR 渲染出来的 HTML 里
 *     带着 opacity:0，一旦客户端脚本没跑起来（加载失败、水合报错、被拦截），
 *     这块内容就永远不显示 —— 页面结构在，内容是空的。
 *   · 这里的写法是「默认可见，只有确认元素在视口外、且 JS 正常运行时才隐藏」。
 *     SSR 输出里没有任何隐藏样式，JS 挂了也只是没有动画，内容照常显示。
 *
 * 这是渐进增强：动效是锦上添花，不该成为内容可见性的前提。
 */
export type RevealState = 'idle' | 'pending' | 'in'

export interface UseRevealOptions {
  /** 露出多少比例算"进入视口"。默认 0.12 */
  threshold?: number
  /**
   * 触发边界。默认底部收 10%，让卡片稍微进入屏幕中段才浮现，
   * 而不是刚露出一条边就开始动。
   */
  rootMargin?: string
}

export function useReveal(options: UseRevealOptions = {}) {
  /** 绑定到要观察的元素（模板里写 ref="target"） */
  const target = ref<HTMLElement | null>(null)
  /**
   * idle    —— 服务端与挂载前的状态：元素完全可见（no hidden styles）
   * pending —— 已确认在视口之外，先隐藏等待
   * in      —— 已经浮现
   */
  const state = ref<RevealState>('idle')

  let observer: IntersectionObserver | null = null

  onMounted(() => {
    const el = target.value
    if (!el) return

    /**
     * 两条"不值得动画"的短路：
     *   1. 用户要求减少动效 —— 直接可见，不做任何隐藏；
     *   2. 浏览器没有 IntersectionObserver（老浏览器）—— 同样直接可见。
     * 两者都落到同一个结果：内容一定能看到。
     */
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      state.value = 'in'
      return
    }

    /**
     * 挂载时先判一次"此刻是否已经在视口内"。
     *
     * 少了这一步，首屏可见的卡片会经历「先被设成隐藏、下一帧又点亮」，
     * 表现为进页面时内容闪一下。首屏元素应当直接就是可见的。
     */
    const rect = el.getBoundingClientRect()
    const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0
    if (alreadyVisible) {
      state.value = 'in'
      return
    }

    state.value = 'pending'

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          state.value = 'in'
          // 浮现是一次性的，触发后立刻释放观察器
          observer?.disconnect()
          observer = null
        }
      },
      {
        threshold: options.threshold ?? 0.12,
        rootMargin: options.rootMargin ?? '0px 0px -10% 0px',
      },
    )

    observer.observe(el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { target, state, revealClass }
}

/**
 * 把状态转成模板里要用的 class 数组。
 *
 * 单独抽出来是为了让各处的写法一致：不写这三元的组件迟早会漏掉 idle 态，
 * 而漏掉的表现是"SSR 首屏正常、客户端挂载瞬间内容消失"。
 */
function revealClass(state: RevealState): string[] {
  return ['reveal', `reveal--${state}`]
}
