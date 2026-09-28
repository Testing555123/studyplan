/**
 * 浏览器接管时灌入学习路线的个人覆盖层。
 *
 * 与 auth-restore.client 同构：这是**应用级启动逻辑**，
 * 不属于任何一个页面 —— 侧栏的学习进度卡在每个页面都在，
 * 它必须和 /roadmap 页用同一份已 hydrate 的覆盖层。
 *
 * `.client` 后缀保证只在浏览器执行：服务端没有 localStorage，
 * SSR 渲染官方默认进度是刻意行为（见 useRoadmapState 顶部说明）。
 */
export default defineNuxtPlugin(nuxtApp => {
  /**
   * 覆盖层必须等到 `app:mounted`（hydration 完成之后）再灌入，
   * 不能在插件 setup 阶段同步应用。
   *
   * 原因：若在 setup 里同步 `overrides.value = readLocal()`，客户端
   * **首屏渲染（正处在 hydration 阶段）就用上了覆盖层**，而服务端渲染的是
   * 官方默认 —— 两者 HTML 不一致，浏览器会抛
   *   "Hydration completed but contains mismatches"，
   * 并且进度条这类带 style/aria 的节点会停留在服务端的默认值上，
   * 与它旁边的数字标签自相矛盾，直到下一次交互才被 patch 正确。
   *
   * 挂到 app:mounted 后：首屏与服务端对齐（无 mismatch），随后一次干净的
   * 响应式更新把界面切到"我的"进度。这一跳是设计本就接受的（先默认、后台 hydrate）。
   */
  nuxtApp.hook('app:mounted', () => {
    useRoadmapState().hydrate()
  })
})
