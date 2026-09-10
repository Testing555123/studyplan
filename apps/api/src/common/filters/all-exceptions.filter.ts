import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import type { ApiErrorBody } from '@studyplan/shared'

/**
 * 全局异常过滤器 —— 后端所有错误的**唯一出口**。
 *
 * 为什么需要它？
 *   如果不做统一处理，同一个后端会返回好几种错误形状：
 *     抛 HttpException  →  { statusCode, message, error }
 *     校验失败          →  { statusCode, message: [ '字段A...', '字段B...' ] }
 *     未捕获的异常      →  空响应 + 500
 *   前端于是被迫写三套错误处理，而且永远猜不准 message 是字符串还是数组。
 *
 * 这个过滤器的职责就是：**把这些全部压成 ApiErrorBody 一种形状**。
 * （`ApiErrorBody` 定义在 packages/shared 里，所以前端拿到的类型是准的。）
 *
 * 另一个关键点是**区分对待两类错误**：
 *   - HttpException：是我们主动抛的，属于"预期内的业务错误"，
 *     只记一行 warn 即可；
 *   - 其它异常：是我们没预料到的 bug，必须打完整堆栈，否则线上无从排查。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const isHttpException = exception instanceof HttpException
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR

    let message = '服务器内部错误，请稍后重试'
    let error = isHttpException ? exception.name : 'InternalServerError'
    let details: string[] | undefined

    if (isHttpException) {
      const body = exception.getResponse()

      if (typeof body === 'string') {
        message = body
      } else if (body !== null && typeof body === 'object') {
        const typed = body as { message?: unknown; error?: unknown }

        if (Array.isArray(typed.message)) {
          // class-validator 校验失败时，message 是一个字符串数组。
          // 把它放进 details，同时给一个人类可读的总述，
          // 这样前端既能直接显示 message，也能逐条高亮字段错误。
          details = typed.message.map(String)
          message = '请求参数校验未通过'
        } else if (typeof typed.message === 'string') {
          message = typed.message
        }

        if (typeof typed.error === 'string') error = typed.error
      }
    }

    /**
     * ── 日志策略：按"这是不是我们的锅"来分级 ──
     *
     * 判断标准**不是**"抛的是不是 HttpException"，而是**状态码**：
     *
     *   · 5xx（>= 500）→ 一定是我们的锅。**必须打完整堆栈**，
     *     否则出了故障你只有一个 500，无从下手。
     *     注意这里刻意把 `InternalServerErrorException` 这类
     *     "由我们主动抛出的 500" 也包含进来 ——
     *     早期版本只记录非 HttpException，结果主动抛的 500
     *     会变成**完全静默**的故障，排查时极其痛苦。
     *
     *   · 4xx → 是调用方的问题（参数错、未登录、没权限）。
     *     记一行 warn 就够，不需要堆栈 —— 那不是 bug，是预期内的拒绝。
     *     401 / 404 尤其高频（未登录访问、资源不存在），
     *     全部打出来会把真正有用的日志淹没，所以它们降为不记。
     *
     * **堆栈只进日志，绝不进响应体**：堆栈里有文件路径和依赖版本，
     * 对攻击者是很好的情报。
     */
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${isHttpException ? '业务异常' : '未捕获异常'} ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    } else if (status !== HttpStatus.UNAUTHORIZED && status !== HttpStatus.NOT_FOUND) {
      this.logger.warn(`${request.method} ${request.url} → ${status} ${message}`)
    }

    const payload: ApiErrorBody = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {}),
    }

    response.status(status).json(payload)
  }
}
