import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 页面是否已经滚过某个阈值。
 *
 * 用途是给"滚动之后才该出现的东西"一个开关，例如页头底部的渐变分隔线 ——
 * 页面在顶部时它不该出现（内容与页头本来就贴在一起，多一条线是噪音），
 * 一旦滚动起来，它负责告诉用户"这里是页头的边界"。
 *
 * ── 两个细节 ──
 *
 * 1. **rAF 节流**：scroll 事件的触发频率远高于屏幕刷新率，
 *    直接把处理逻辑挂在 scroll 上、每次都写响应式状态，会让 Vue 在一帧内
 *    反复触发渲染。这里用一个标志位把更新压到每帧至多一次。
 * 2. **passive**：监听器声明为 passive，浏览器就不必等回调执行完再滚动 ——
 *    滚动是主线程最容易卡顿的地方，这个声明几乎是免费的收益。
 */
export function useScrolled(threshold = 24) {
  const scrolled = ref(false)

  onMounted(() => {
    let ticking = false

    const update = () => {
      scrolled.value = window.scrollY > threshold
      ticking = false
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    // 先跑一次：刷新页面时浏览器可能已经恢复了滚动位置
    update()
    window.addEventListener('scroll', onScroll, { passive: true })

    onBeforeUnmount(() => {
      window.removeEventListener('scroll', onScroll)
    })
  })

  return scrolled
}
