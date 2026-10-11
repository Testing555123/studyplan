import { vi } from 'vitest'

/**
 * 可控的 requireSession mock（T15 测试工具，V1 唯一身份来源）。
 * 在测试文件中 `import { sessionMock }` 即激活对 @/lib/auth/session 的覆盖：
 * requireSession 被替换为本 mock，测试内用 mockResolvedValue / mockRejectedValue 控制身份。
 * 其余导出（getSession / AuthRequiredError / Session 类型）保持真实实现。
 */
export const sessionMock = vi.fn()

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>()
  return { ...actual, requireSession: sessionMock }
})
