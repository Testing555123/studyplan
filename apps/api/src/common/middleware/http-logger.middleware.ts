import type { NextFunction, Request, Response } from 'express'
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'

/**
 * 零依赖的访问日志中间件。
 *
 * ## 为什么它是中间件，而不是拦截器？
 *
 * 因为它需要监听**响应结束**事件（`res.on('finish')`）才能拿到最终状态码与耗时，
 * 这是传输层的职责，中间件离它最近。拦截器工作在应用层，
 * 拿到的是"控制器返回值"，看不到连接被中断这类情况。
 *
 * ## requestId 为什么在这里生成，而不是在拦截器里？
 *
 * 执行顺序是：中间件 → 守卫 → 拦截器 → 控制器。
 * 中间件**最早**执行，只有在这里生成 ID，
 * 后续所有环节（限流、鉴权、业务、统一响应）才可能共享同一个 ID。
 * 若放在拦截器里生成，中间件这一段的日志就没有 ID 可用。
 *
 * RequestIdInterceptor 会优先复用这里写入的 `requestId`。
 *
 * ## 为什么不引 nest-winston？
 *
 * 结构化日志的价值在于"可被机器检索"，而 systemd 的 journald
 * 已经为 stdout 提供了时间戳、采集与按体积回收能力。
 * 现阶段省掉两个依赖，等真的需要按字段聚合时再引入也不迟。
 */
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now()

    // 上游（网关/客户端）带过来的 ID 优先沿用，保证跨服务可追踪
    const incoming = request.headers['x-request-id']
    const requestId = typeof incoming === 'string' && incoming ? incoming : randomUUID()
    ;(request as Request & { requestId?: string }).requestId = requestId

    response.setHeader('X-Request-Id', requestId)

    response.on('finish', () => {
      const duration = Date.now() - startedAt
      const line = `${request.method} ${request.originalUrl} ${response.statusCode} ${duration}ms rid=${requestId}`

      // 按严重程度分级，方便日后用 journalctl 按级别过滤
      if (response.statusCode >= 500) this.logger.error(line)
      else if (response.statusCode >= 400) this.logger.warn(line)
      else this.logger.log(line)
    })

    next()
  }
}
