import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'

/**
 * 链路追踪 ID 的请求头名。
 *
 * 为什么每个请求都要有一个 ID？
 *   因为排错时你面对的不是"一个请求"，而是"成千上万个请求里的某一个"。
 *   有了 ID，用户报障时只要把响应头里的 X-Request-Id 给你，
 *   你就能在成千上万行日志里精确定位到那一次调用——
 *   这是从"猜"到"查"的分界线。
 */
export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * 给每个请求注入唯一 ID，并写回响应头。
 *
 * 它必须是**第一个**全局拦截器：
 * 后面的统一响应拦截器要把 `requestId` 放进响应体，
 * 而这个值由它生成。顺序错了，响应体里的 ID 就会是空的。
 *
 * 另一个细节：如果上游（网关或前端）已经带了合法的 X-Request-Id，
 * 我们就**沿用**它而不是覆盖——这是分布式追踪的基本礼仪，
 * 让一次用户操作的所有下游调用共享同一个 ID。
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    const http = context.switchToHttp()
    const request = http.getRequest<Record<string, unknown> & { headers?: Record<string, unknown> }>()
    const response = http.getResponse<{ setHeader?: (name: string, value: string) => void }>()

    /**
     * 优先复用**中间件已经生成**的 ID。
     *
     * 执行顺序是 中间件 → 守卫 → 拦截器，HttpLoggerMiddleware 比这里更早执行，
     * 它写的 `requestId` 才是"全生命周期唯一"的那一个。
     * 若中间件没有（比如某些内部调用），再退回读上游请求头，最后才自己生成。
     */
    const existing = (request as Record<string, unknown>)?.requestId
    const incoming = request?.headers?.[REQUEST_ID_HEADER]
    const requestId =
      typeof existing === 'string' && existing.length > 0
        ? existing
        : typeof incoming === 'string' && incoming.length > 0
          ? incoming
          : randomUUID()

    // 挂在 request 上，供后续拦截器与日志读取
    ;(request as Record<string, unknown>).requestId = requestId

    response?.setHeader?.('X-Request-Id', requestId)

    return next.handle()
  }
}
