/**
 * 环境变量校验的行为测试。
 *
 * 这批测试锁的是**语义**，不是实现方式：批次 2 要把 class-validator 换成 Zod 4，
 * 换完这些断言必须原样成立，否则就是行为回归。
 *
 * 两类断言要分开看：
 *   · 「保留」——class-validator 版本已经满足，换成 Zod 后不许变；
 *   · 「新增」——`REFACTOR-BATCHES.md` 批次 2 验收要点里点名要求、
 *     但旧实现**只写在注释里、没有落成代码**的那一条（两个密钥必须不同）。
 *
 * 这里不需要 `import 'reflect-metadata'`：那是 class-transformer 的运行时前提，
 * Zod 一份 schema 自己就够了 —— 少掉这个隐藏依赖，也是这次替换的收益之一。
 */

/** 三个必填项的最小合法集合，其余用例在它之上做增量修改 */
function required(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.mongodb.net/studyplan',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    ...overrides,
  }
}

describe('validateEnv · 默认值（保留）', () => {
  it('只给必填项时，可选项全部落到文档约定的默认值', async () => {
    const { validateEnv } = await import('./env.validation')

    const env = validateEnv(required())

    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3000)
    expect(env.CORS_ORIGIN).toBe('http://localhost:3001')
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe('15m')
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe('7d')
    expect(env.COOKIE_SAME_SITE).toBe('lax')
    expect(env.NVNIM_MODEL).toBe('openai/gpt-oss-20b')
    expect(env.NVNIM_TIMEOUT_MS).toBe(25000)
    expect(env.NVNIM_DAILY_LIMIT).toBe(300)
    expect(env.GITHUB_TRENDING_CACHE_TTL_MINUTES).toBe(360)
    expect(env.DAILY_DIGEST_ENABLED).toBe('false')
    expect(env.DAILY_DIGEST_TIMEZONE).toBe('Asia/Shanghai')
    expect(env.DAILY_DIGEST_PUBLISH_HOUR).toBe(9)
    expect(env.DAILY_DIGEST_MIN_STARS).toBe(50)
    expect(env.DAILY_DIGEST_LOOKBACK_DAYS).toBe(30)
    expect(env.DAILY_DIGEST_CANDIDATE_LIMIT).toBe(100)
    expect(env.DAILY_DIGEST_AI_MAX_TOKENS).toBe(3000)
    expect(env.DAILY_DIGEST_AI_TIMEOUT_MS).toBe(90000)
    expect(env.DAILY_DIGEST_LAZY_TRIGGER).toBe('true')
    expect(env.DAILY_DIGEST_BOT_USERNAME).toBe('github-daily')
    expect(env.GITHUB_INTRO_ENABLED).toBe('true')
    expect(env.GITHUB_INTRO_BATCH_LIMIT).toBe(3)
    expect(env.GITHUB_INTRO_TIME_BUDGET_MS).toBe(20000)
    expect(env.GITHUB_INTRO_AI_MAX_TOKENS).toBe(3000)
    expect(env.GITHUB_INTRO_AI_TIMEOUT_MS).toBe(45000)
    expect(env.GITHUB_INTRO_TTL_DAYS).toBe(30)
  })

  it('字符串形态的数字会被转成 number（环境变量天生是字符串）', async () => {
    const { validateEnv } = await import('./env.validation')

    const env = validateEnv(required({ PORT: '8080', NVNIM_TIMEOUT_MS: '30000' }))

    expect(env.PORT).toBe(8080)
    expect(env.NVNIM_TIMEOUT_MS).toBe(30000)
  })

  it('可选的密钥类变量没配时保持 undefined，而不是空串', async () => {
    const { validateEnv } = await import('./env.validation')

    const env = validateEnv(required())

    expect(env.GITHUB_TOKEN).toBeUndefined()
    expect(env.NVNIM_API_KEY).toBeUndefined()
    expect(env.DAILY_DIGEST_CRON_TOKEN).toBeUndefined()
  })
})

describe('validateEnv · 0 与空串是有效值（保留）', () => {
  it('DAILY_DIGEST_MIN_STARS=0 保留为 0，不回落默认值 50', async () => {
    const { validateEnv } = await import('./env.validation')

    const env = validateEnv(required({ DAILY_DIGEST_MIN_STARS: '0' }))

    expect(env.DAILY_DIGEST_MIN_STARS).toBe(0)
  })

  it('DAILY_DIGEST_PUBLISH_HOUR=0 保留为 0（0 点就是合法取值）', async () => {
    const { validateEnv } = await import('./env.validation')

    const env = validateEnv(required({ DAILY_DIGEST_PUBLISH_HOUR: '0' }))

    expect(env.DAILY_DIGEST_PUBLISH_HOUR).toBe(0)
  })

  it('DAILY_DIGEST_LANGUAGES 留空是「不限语言」，不是「没配」', async () => {
    const { validateEnv } = await import('./env.validation')

    const env = validateEnv(required({ DAILY_DIGEST_LANGUAGES: '' }))

    expect(env.DAILY_DIGEST_LANGUAGES).toBe('')
  })

  it('DAILY_DIGEST_ENABLED 认 "0"，且不会把它当成假值丢掉', async () => {
    const { validateEnv } = await import('./env.validation')

    const env = validateEnv(required({ DAILY_DIGEST_ENABLED: '0' }))

    expect(env.DAILY_DIGEST_ENABLED).toBe('0')
  })
})

describe('validateEnv · 非法值即启动失败（保留）', () => {
  it('必填项缺失时抛错，并点名是哪个变量', async () => {
    const { validateEnv } = await import('./env.validation')

    const config = required()
    delete config.MONGODB_URI

    expect(() => validateEnv(config)).toThrow(/MONGODB_URI/)
  })

  it('PORT 越界时抛错，错误信息里带字段名', async () => {
    const { validateEnv } = await import('./env.validation')

    expect(() => validateEnv(required({ PORT: '70000' }))).toThrow(/PORT/)
  })

  it('PORT 不是数字时同样抛错', async () => {
    const { validateEnv } = await import('./env.validation')

    expect(() => validateEnv(required({ PORT: 'abc' }))).toThrow(/PORT/)
  })

  it('密钥短于 32 字符时抛错（弱密钥等于没有密钥）', async () => {
    const { validateEnv } = await import('./env.validation')

    expect(() => validateEnv(required({ JWT_ACCESS_SECRET: 'short' }))).toThrow(/JWT_ACCESS_SECRET/)
  })

  it('枚举型变量只接受列出的取值', async () => {
    const { validateEnv } = await import('./env.validation')

    expect(() => validateEnv(required({ NODE_ENV: 'staging' }))).toThrow(/NODE_ENV/)
    expect(() => validateEnv(required({ COOKIE_SAME_SITE: 'no-same-site' }))).toThrow(
      /COOKIE_SAME_SITE/,
    )
  })

  it('超出区间上限的时长被拒绝，而不是静默截断', async () => {
    const { validateEnv } = await import('./env.validation')

    expect(() => validateEnv(required({ NVNIM_TIMEOUT_MS: '90000' }))).toThrow(/NVNIM_TIMEOUT_MS/)
    expect(() => validateEnv(required({ GITHUB_INTRO_TTL_DAYS: '400' }))).toThrow(
      /GITHUB_INTRO_TTL_DAYS/,
    )
  })

  it('同时有多个非法项时，全部列进错误信息（只报第一个会让人来回猜）', async () => {
    const { validateEnv } = await import('./env.validation')

    let message = ''
    try {
      validateEnv(required({ PORT: '99999', NVNIM_TIMEOUT_MS: '90000' }))
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toMatch(/PORT/)
    expect(message).toMatch(/NVNIM_TIMEOUT_MS/)
  })
})

describe('validateEnv · 两个密钥必须不同（批次 2 新增）', () => {
  it('access 与 refresh 密钥相同时启动失败', async () => {
    const { validateEnv } = await import('./env.validation')

    const same = 'c'.repeat(32)

    expect(() =>
      validateEnv(required({ JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same })),
    ).toThrow(/JWT_(ACCESS|REFRESH)_SECRET/)
  })
})
