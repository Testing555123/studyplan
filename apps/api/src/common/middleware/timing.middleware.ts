import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { runWithTimingStore } from '../utils/with-timing'

/**
 * 计时上下文中间件。
 *
 * 它自己什么都不记，唯一职责是为整条请求链路**开启** AsyncLocalStorage 上下文，
 * 让 Service 深处的 `withTiming()` 与拦截器里的汇总读到同一份数据。
 *
 * ── 为什么必须放在中间件，而不能放进 SlowRequestInterceptor ──
 * Express 适配器的执行顺序是：中间件 → 守卫 → 拦截器 → 处理器。
 * 拦截器的 `next.handle()` 只是**构造**出一个 Observable，
 * 真正的业务处理发生在 Nest 统一**订阅**它的时候 ——
 * 那已经脱离了拦截器里开启的上下文，所有分段会静默丢失。
 * 中间件则不同：`next()` 之后的整条异步链都在这个上下文里，
 * 这正是社区里 nestjs-cls 这类库选择在中间件层建上下文的原因。
 *
 * ⚠️ 参数带下划线前缀：这个中间件不关心请求与响应，
 *    前缀是为了让"未使用参数"的 lint 规则放行（约定见 eslint 配置）。
 */
@Injectable()
export class TimingMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    runWithTimingStore(() => next())
  }
}
