import { NextResponse } from 'next/server'
import { toErrorBody, toSuccessBody } from './error'
import { createRequestId } from '@app/shared'

/**
 * HTTP 响应包络（T6）。Route Handler 统一经此返回，确保 ErrorBody/SuccessBody 形状唯一、requestId 入体。
 */
export function successEnvelope<T>(data: T, requestId?: string) {
  const body = toSuccessBody(data, requestId)
  return NextResponse.json(body, { status: 200, headers: { 'X-Request-Id': body.requestId } })
}

export function errorEnvelope(
  input: { statusCode: number; code: string; message: string; details?: string[] },
  requestId?: string,
) {
  const body = toErrorBody({ ...input, requestId })
  return NextResponse.json(body, {
    status: input.statusCode,
    headers: { 'X-Request-Id': body.requestId },
  })
}

/** 便捷：从请求头或上下文取 requestId，未带则生成新值。 */
export function requestIdFrom(req?: Request): string {
  return req?.headers.get('x-request-id') ?? createRequestId()
}
