import { NextResponse } from 'next/server'
import { toErrorBody, toSuccessBody } from './error'
import { createRequestId } from '@app/shared'

/**
 * HTTP 响应包络（T6）。Route Handler 统一经此返回，确保 ErrorBody/SuccessBody 形状唯一、requestId 入体。
 */
export function successEnvelope<T>(data: T, requestId?: string) {
  return NextResponse.json(toSuccessBody(data, requestId), { status: 200 })
}

export function errorEnvelope(
  input: { statusCode: number; code: string; message: string; details?: string[] },
  requestId?: string,
) {
  return NextResponse.json(toErrorBody({ ...input, requestId }), {
    status: input.statusCode,
  })
}

/** 便捷：从请求头或上下文取 requestId，未带则生成新值。 */
export function requestIdFrom(req?: Request): string {
  return req?.headers.get('x-request-id') ?? createRequestId()
}
