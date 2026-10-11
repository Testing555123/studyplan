import { describe, expect, it, vi } from 'vitest'
import {
  createAppLogger,
  createFallbackLogger,
  redact,
  STRING_TRUNCATE_MAX,
} from '@/lib/logger'

describe('redact (SPEC §6.3)', () => {
  it('遮蔽 authorization / cookie / password* / token* / secret / apiKey 的值', () => {
    const input = {
      authorization: 'Bearer secret-token',
      cookie: 'sessionid=abc',
      password: 'hunter2',
      passwordHash: 'xyz',
      token: 'tok-123',
      refreshToken: 'rt-123',
      secret: 'topsecret',
      apiKey: 'sk-123',
      nested: { api_key: 'sk-456', keep: 'visible' },
    }
    const out = redact(input) as Record<string, unknown>
    expect(out.authorization).toBe('***')
    expect(out.cookie).toBe('***')
    expect(out.password).toBe('***')
    expect(out.passwordHash).toBe('***')
    expect(out.token).toBe('***')
    expect(out.refreshToken).toBe('***')
    expect(out.secret).toBe('***')
    expect(out.apiKey).toBe('***')
    expect((out.nested as Record<string, unknown>).api_key).toBe('***')
    expect((out.nested as Record<string, unknown>).keep).toBe('visible')
  })

  it('DATABASE_URL 明文不出现（键名命中即遮蔽）', () => {
    const out = redact({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }) as Record<
      string,
      unknown
    >
    expect(out.DATABASE_URL).toBe('***')
  })

  it('所有字符串截断到 160 字符', () => {
    const long = 'a'.repeat(500)
    const out = redact({ note: long }) as Record<string, unknown>
    expect((out.note as string).length).toBeLessThanOrEqual(STRING_TRUNCATE_MAX)
  })

  it('不修改原对象（纯函数）', () => {
    const original = { token: 'x', name: 'y' }
    redact(original)
    expect(original.token).toBe('x')
  })
})

describe('createAppLogger (V5: 观测失效不阻断启动)', () => {
  it('pino 工厂抛错时降级为可用 fallback', () => {
    const throwing = vi.fn(() => {
      throw new Error('pino init failed')
    })
    const fallback = createAppLogger(throwing)
    expect(fallback).toBeDefined()
    expect(typeof fallback.info).toBe('function')
    expect(typeof fallback.error).toBe('function')
    expect(typeof fallback.child).toBe('function')
    // 降级后调用不抛错
    expect(() => fallback.error({ code: 'X' }, 'msg')).not.toThrow()
  })

  it('默认工厂成功时返回具备方法的 logger', () => {
    const log = createAppLogger()
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.child).toBe('function')
  })
})

describe('fallback logger', () => {
  it('child 返回同样可用的 logger', () => {
    const fb = createFallbackLogger()
    const child = fb.child({ requestId: 'r1' })
    expect(typeof child.info).toBe('function')
  })
})
