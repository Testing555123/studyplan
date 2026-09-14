import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { tap, type Observable } from 'rxjs'
import { currentTiming, formatSegments } from '../utils/with-timing'

/**
 * 慢请求拦截器 —— 让"慢"从体感变成一条可检索的日志。
 *
 * ── 它解决什么 ──
 * 用户说"慢"的时候，你需要的不是道歉，而是**哪一个请求、多慢、慢在哪**。
 * 这个拦截器给每个请求记一条总耗时，超过阈值就升级日志级别，
 * 并把 `withTiming` 收集到的分段一并输出。
 *
 * ── 阈值为什么是 1000 / 3000 ──
 * 不是拍脑袋：本项目的实测热态 TTFB 在 0.3~1.9s，冷启动 5~7s。
 * 1 秒以下属于"正常偏慢"，不值得留下任何痕迹；
 * 1~3 秒值得看一眼（WARN）；3 秒以上基本可以断定有问题（ERROR）。
 * 阈值应该随优化不断收紧 —— 它们是当前状态的快照，不是永恒真理。
 *
 * ── ⚠️ 顺序约束（见 main.ts 的注释）──
 * 必须注册在 RequestIdInterceptor **之后**：它要读 `request.requestId`，
 * 而那个值由前者生成。放在前面的话，日志里的 requestId 永远是 undefined，
 * 追踪链就断了。
 *
 * ── ⚠️ 只输出耗时数字 ──
 * 严禁打印请求体、响应体、Cookie、token。日志会长期留存、
 * 会被多人查看，把凭据写进日志等于把钥匙插在门上。
 */
@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SlowRequest')

  /** 超过该值记 WARN（毫秒） */
  private static readonly WARN_MS = 1000
  /** 超过该值记 ERROR（毫秒） */
  private static readonly ERROR_MS = 3000

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()

    const started = performance.now()

    return next.handle().pipe(
      tap({
        // 成功与失败都要记：慢的失败请求比慢的成功请求更值得看
        next: () => this.report(request, response, started),
        error: () => this.report(request, response, started),
      }),
    )
  }

  private report(request: Request, response: Response, started: number): void {
    const durationMs = Math.round(performance.now() - started)

    // 快请求直接跳过：为每个 200 打一行日志是日志噪音的主要来源
    if (durationMs < SlowRequestInterceptor.WARN_MS) return

    const segments = formatSegments(currentTiming())
    const line =
      `${request.method} ${request.originalUrl ?? request.url} ` +
      `${response.statusCode} ${durationMs}ms${segments}`

    if (durationMs >= SlowRequestInterceptor.ERROR_MS) {
      this.logger.error(line)
    } else {
      this.logger.warn(line)
    }
  }
}
