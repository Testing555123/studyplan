import { createRequestId, ErrorBodySchema, SuccessBodySchema } from '@app/shared'
import { z } from 'zod'

export interface ErrorBodyInput {
  statusCode: number
  code: string
  message: string
  details?: string[]
  requestId?: string
}

/**
 * 统一错误体（T6）。requestId 真进响应体（v2.0 缺陷修正），缺失时现场生成。
 * 经 @app/shared 的 ErrorBodySchema 校验，保证形状唯一。
 */
export function toErrorBody(input: ErrorBodyInput) {
  return ErrorBodySchema.parse({
    statusCode: input.statusCode,
    code: input.code,
    message: input.message,
    requestId: input.requestId ?? createRequestId(),
    timestamp: new Date().toISOString(),
    ...(input.details ? { details: input.details } : {}),
  })
}

/**
 * 统一成功体（T6）。data 经 SuccessBodySchema 校验，requestId 必含。
 */
export function toSuccessBody<T>(data: T, requestId?: string) {
  return SuccessBodySchema(z.unknown()).parse({
    statusCode: 200,
    data,
    requestId: requestId ?? createRequestId(),
    timestamp: new Date().toISOString(),
  }) as {
    statusCode: number
    data: T
    requestId: string
    timestamp: string
  }
}
