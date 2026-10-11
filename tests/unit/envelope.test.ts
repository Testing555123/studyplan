import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toErrorBody, toSuccessBody } from '@/lib/actions/error'
import { successEnvelope, errorEnvelope } from '@/lib/actions/envelope'
import { actionClient } from '@/lib/actions/client'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('envelope builders (T6)', () => {
  it('toSuccessBody 含合法 requestId 与 statusCode=200', () => {
    const body = toSuccessBody({ ok: true })
    expect(body.requestId).toMatch(UUID_RE)
    expect(body.statusCode).toBe(200)
    expect(body.data).toEqual({ ok: true })
    expect(() => new Date(body.timestamp).getTime()).not.toThrow()
  })

  it('toErrorBody 含 requestId、code 与 timestamp', () => {
    const body = toErrorBody({ statusCode: 404, code: 'NOT_FOUND', message: 'x' })
    expect(body.requestId).toMatch(UUID_RE)
    expect(body.code).toBe('NOT_FOUND')
    expect(body.statusCode).toBe(404)
  })
})

describe('HTTP envelope (T6: requestId 真进响应体)', () => {
  it('successEnvelope 响应体携带 requestId', async () => {
    const res = successEnvelope({ hello: 'world' })
    const json = await res.json()
    expect(json.requestId).toMatch(UUID_RE)
    expect(json.statusCode).toBe(200)
    expect(json.data).toEqual({ hello: 'world' })
  })

  it('errorEnvelope 状态码与 code 正确', async () => {
    const res = errorEnvelope({ statusCode: 429, code: 'RATE_LIMITED', message: 'slow' })
    const json = await res.json()
    expect(json.code).toBe('RATE_LIMITED')
    expect(res.status).toBe(429)
    expect(json.requestId).toMatch(UUID_RE)
  })

  it('successEnvelope 响应头 X-Request-Id 与响应体一致', async () => {
    const res = successEnvelope({ hello: 'world' })
    const json = await res.json()
    expect(res.headers.get('x-request-id')).toBe(json.requestId)
  })

  it('errorEnvelope 响应头 X-Request-Id 与响应体一致', async () => {
    const res = errorEnvelope({ statusCode: 429, code: 'RATE_LIMITED', message: 'slow' })
    const json = await res.json()
    expect(res.headers.get('x-request-id')).toBe(json.requestId)
  })

  it('传入的 requestId 被沿用：请求头与响应体贯通', async () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const res = successEnvelope({ a: 1 }, id)
    expect(res.headers.get('x-request-id')).toBe(id)
    expect((await res.json()).requestId).toBe(id)
  })
})

describe('actionClient strict (V1: 非法字段 400)', () => {
  const makeAction = () =>
    actionClient
      .schema(z.object({ name: z.string() }).strict())
      .action(async ({ parsedInput }) => parsedInput.name)

  it('合法输入通过', async () => {
    const result = await makeAction()({ name: 'a' })
    expect(result!.data).toBe('a')
  })

  it('未知字段被 .strict() 拒绝（validationErrors 出现，data 为空）', async () => {
    const result = await makeAction()({ name: 'a', extra: 'b' } as never)
    expect(result!.data).toBeUndefined()
    expect(result!.validationErrors).toBeDefined()
  })
})
