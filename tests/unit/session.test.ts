import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { sessionMock } from '@/tests/helpers/mockSession'

const { authedActionClient } = await import('@/lib/actions/client')
const { AuthRequiredError } = await import('@/lib/auth/session')

describe('V1: 身份只来自会话（requireSession 唯一来源）', () => {
  beforeEach(() => {
    sessionMock.mockReset()
  })

  it('未登录时受保护 action 返回 UNAUTHORIZED（401），不读取任何输入身份', async () => {
    sessionMock.mockRejectedValue(new AuthRequiredError())
    const action = authedActionClient
      .schema(z.object({ text: z.string() }).strict())
      .action(async ({ parsedInput }) => parsedInput.text)
    const res = await action({ text: 'hi' })
    expect(res!.serverError).toBe('UNAUTHORIZED')
    expect(res!.data).toBeUndefined()
  })

  it('已登录时 action 经由 ctx.session 取得身份，且等于会话用户而非输入', async () => {
    const session = { user: { id: 'session-u', email: 'a@b.c' } }
    sessionMock.mockResolvedValue(session)
    const action = authedActionClient
      .schema(z.object({ text: z.string() }).strict())
      .action(async ({ parsedInput, ctx }) => ({
        text: parsedInput.text,
        userId: ctx.session.user.id,
      }))
    const res = await action({ text: 'hello' })
    expect(res!.serverError).toBeUndefined()
    expect(res!.data).toEqual({ text: 'hello', userId: 'session-u' })
  })

  it('请求体携带身份类字段被 .strict() 拒绝（无法伪装身份），合法时身份仍来自会话', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'session-u' } })
    const action = authedActionClient
      .schema(z.object({ text: z.string() }).strict())
      .action(async ({ ctx }) => ctx.session.user.id)

    // 携带 authorId/role 的非法输入 → 校验失败，action 不执行，身份无从注入。
    const bad = await action({ text: 'hi', authorId: 'evil', role: 'admin' } as never)
    expect(bad!.data).toBeUndefined()
    expect(bad!.validationErrors).toBeDefined()

    // 合法输入 → 身份始终等于会话用户，与请求体无关。
    const good = await action({ text: 'hi' })
    expect(good!.data).toBe('session-u')
  })
})
