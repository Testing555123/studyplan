import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * 分段计时工具 —— 回答"慢请求的时间到底花在哪"。
 *
 * ── 为什么需要它 ──
 * 只有一个总耗时，排查就是猜：6.6 秒是数据库慢？还是渲染慢？
 * 有了分段，日志会直接告诉你 `posts.findAll.db=6400ms`，
 * 猜测变成了阅读。
 *
 * ── 为什么用 AsyncLocalStorage ──
 * 计时发生在**业务 Service 深处**，而汇总发生在**拦截器** ——
 * 两者隔着好几层调用。把"计时上下文"作为参数一路传下去，
 * 等于让所有函数签名都为一个日志功能服务。
 * AsyncLocalStorage 让上下文**顺着调用链自动流动**，
 * 业务代码只需要包一层 `withTiming('名字', () => ...)`，别的什么都不用改。
 *
 * ── 失败模式必须是"什么都不做" ──
 * 埋点是可观测性手段，不是业务依赖。任何时候拿不到上下文
 * （比如在请求链路之外调用），就直接执行、不记录、**绝不抛错**。
 * 让一个日志工具能影响业务结果，是最典型的本末倒置。
 */

/** 一次请求的分段耗时记录 */
export interface RequestTiming {
  segments: Array<{ name: string; ms: number }>
}

const storage = new AsyncLocalStorage<RequestTiming>()

/**
 * 为一段请求链路开启计时上下文。
 *
 * ⚠️ 必须在**中间件层**调用，而不是在拦截器里：
 * Express 适配器是"先收集完所有拦截器、再统一订阅"，
 * 在拦截器里开上下文时，真正的业务处理发生在上下文之外，
 * 所有分段都会静默丢失。中间件则天然包住整条链路。
 */
export function runWithTimingStore<T>(run: () => T): T {
  return storage.run({ segments: [] }, run)
}

/** 读当前请求的计时上下文；不在请求链路里时返回 null */
export function currentTiming(): RequestTiming | null {
  return storage.getStore() ?? null
}

/**
 * 包裹一个异步操作并记录耗时。
 *
 * @param name 分段名。用 `模块.动作` 形式（如 `posts.findAll.db`），
 *             日志里才能一眼看出是哪段
 * @param run   被计时的异步操作
 */
export function withTiming<T>(name: string, run: () => Promise<T>): Promise<T> {
  const store = storage.getStore()
  // 没有上下文：直接执行。埋点在任何情况下都不能改变业务行为
  if (!store) return run()

  const started = performance.now()
  return run().finally(() => {
    // 取整到毫秒：日志里的 0.3ms 没有意义，只会增加噪音
    store.segments.push({ name, ms: Math.round(performance.now() - started) })
  })
}

/** 把分段列表格式化成日志友好的一行；没有分段时返回空串 */
export function formatSegments(timing: RequestTiming | null): string {
  if (!timing || timing.segments.length === 0) return ''
  return ` segments=[${timing.segments.map((s) => `${s.name}:${s.ms}ms`).join(' ')}]`
}
