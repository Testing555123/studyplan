import { plainToInstance } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator'

/**
 * 环境变量校验。
 *
 * 为什么必须做这件事？
 *   环境变量的类型是"字符串或 undefined"。如果代码里直接写
 *   `process.env.MONGODB_URI`，TypeScript 只知道它是 `string | undefined`，
 *   而运行时它可能是空字符串。与其等到第一个数据库查询或第一次登录
 *   才报错，不如**启动时就直接崩掉**——这叫 fail fast。
 *
 * 这份校验是**随阶段逐步收紧**的：
 *   阶段 1 只要求 PORT
 *   阶段 3 追加 MONGODB_URI
 *   阶段 5 追加两个 JWT 密钥
 *   阶段 7 追加 AI 供应商的 Key（智谱 GLM → 现为 NVIDIA NIM 的 NVNIM_API_KEY）
 *
 * 这也是一种规划：**不要一开始就把所有变量都列成必填**，
 * 否则你在阶段 1 就会被一堆还没用到的配置拦住。
 */
export class EnvironmentVariables {
  @IsOptional()
  @IsString()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development'

  @IsOptional()
  @IsInt({ message: 'PORT 必须是整数' })
  @Min(1)
  @Max(65535)
  PORT: number = 3000

  @IsOptional()
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3001'

  /**
   * MongoDB Atlas 连接串。
   *
   * 用 MinLength 而不是 IsNotEmpty：漏填时值是空字符串，
   * 而 IsNotEmpty 的报错不够直白。MinLength(20) 同时也拦下了
   * "填了个明显不是连接串的东西"。
   */
  @IsString({ message: 'MONGODB_URI 必须是字符串' })
  @MinLength(20, {
    message:
      'MONGODB_URI 未配置或格式明显不对。它应该形如 mongodb+srv://<用户>:<密码>@<集群>/studyplan',
  })
  MONGODB_URI!: string

  /**
   * JWT 密钥。
   *
   * 要求最少 32 个字符，是因为密钥强度直接决定 Token 能不能被暴力破解。
   * 一个 8 位的弱密钥，用现成的字典工具几分钟就能撞出来 ——
   * 而一旦密钥被猜中，攻击者就能**自己签发任意用户**的 Token。
   *
   * 生成方式（在仓库根目录执行）：
   *   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   * 两个密钥必须不同，且绝不能提交到 Git。
   */
  @IsString({ message: 'JWT_ACCESS_SECRET 必须是字符串' })
  @MinLength(32, { message: 'JWT_ACCESS_SECRET 至少需要 32 个字符，请用随机字节生成' })
  JWT_ACCESS_SECRET!: string

  @IsString({ message: 'JWT_REFRESH_SECRET 必须是字符串' })
  @MinLength(32, { message: 'JWT_REFRESH_SECRET 至少需要 32 个字符，请用随机字节生成' })
  JWT_REFRESH_SECRET!: string

  /**
   * 两个 Token 的有效期。
   *
   * Access Token 要**短**（15 分钟）：它存在内存里，一旦被 XSS 窃取，
   * 攻击者能用它的时间窗口越小越好。
   * Refresh Token 要**长**（7 天）：它是 httpOnly Cookie，窃取难度高得多，
   * 长一点换来"不用频繁重新登录"的体验。
   *
   * 这一短一长就是双 Token 方案的全部动机：
   * **让"高风险凭证"短命，让"长命凭证"难以窃取。**
   */
  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN: string = '15m'

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN: string = '7d'

  /**
   * Refresh Cookie 的 SameSite 策略。
   *
   * 本地开发用 lax 即可（3001 → 3000 属于同站）。
   * 部署后如果前后端在不同域名下，必须改成 none，且后端要跑在 HTTPS 上，
   * 否则浏览器会直接丢弃这个 Cookie。
   */
  @IsOptional()
  @IsIn(['lax', 'none', 'strict'], { message: 'COOKIE_SAME_SITE 只能是 lax / none / strict' })
  COOKIE_SAME_SITE: string = 'lax'

  // ────────────────────────────────────────────────────────────────
  // AI 能力（NVIDIA NIM）
  //
  // ⚠️ 注意 NVNIM_API_KEY 是**可选**的 —— 这与 MONGODB_URI 的处理
  //    刻意不同，而这个区别本身就是一条重要的设计经验：
  //
  //      · 数据库是**核心依赖**：没有它，这个后端没有任何存在意义
  //        → 必须 fail fast，启动时就崩；
  //      · AI 是**增强功能**：没有它，应用依然完整可用（只是没有摘要与问答）
  //        → 降级运行，并在日志里说清楚。
  //
  //    "哪些依赖必须存在"是一个**产品判断**，不是一个技术判断。
  //    把增强功能也做成硬依赖，等于用一个可选项卡住了整个系统 ——
  //    新人第一次跑项目时，会因为没填一个他根本不需要的 Key 而完全跑不起来。
  //
  // 供应商沿革：这里原本是智谱 GLM，需要 LangChain 三件套 + zod；
  // 换成 NIM 之后因为它是 **OpenAI 兼容接口**，用 Node 内置 fetch 就能调，
  // 那几个依赖就全都不需要了 —— 这是"选对供应商也能简化架构"的现成例子。
  // ────────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  NVNIM_API_KEY?: string

  /**
   * 模型名。
   *
   * ⚠️ **必须可配，绝不能写死**：NV NIM 的模型会下线。
   * 实测请求 `meta/llama-3.1-8b-instruct` 返回 410 Gone，正文写着
   * "has reached its end of life on 2026-08-26T09:00:00Z and is no longer available"。
   * 写死模型名的代码会在某一天毫无征兆地全线报错。
   *
   * 当前默认取 `openai/gpt-oss-20b` —— 它是实测中**产出答案最快**的
   * （约 36 字/秒）。别被名字误导：先前默认的 `deepseek-v4-flash-0731`
   * 虽然带 "flash"，却是推理模型，思考链能占掉一半以上输出，
   * 简单问题 22 秒、复杂问题直接撞 60 秒超时。
   *
   * 可用模型清单可随时查询：GET https://integrate.api.nvidia.com/v1/models
   */
  @IsOptional()
  @IsString()
  NVNIM_MODEL: string = 'openai/gpt-oss-20b'

  /**
   * AI 单次调用超时（毫秒）。
   *
   * 上限卡在 60 秒，是因为超时设置**必须小于**用户能忍受的等待极限 ——
   * 即使我们把它做成旁路（不阻塞发帖），超时太长也会让日志里
   * 堆积大量"还在跑"的请求，浪费连接与额度。
   */
  @IsOptional()
  @IsInt()
  @Min(1000, { message: 'NVNIM_TIMEOUT_MS 至少 1000 毫秒' })
  @Max(60000, { message: 'NVNIM_TIMEOUT_MS 最多 60000 毫秒' })
  NVNIM_TIMEOUT_MS: number = 25000

  /**
   * 每日调用上限（命中缓存的请求不计）。
   *
   * 为什么需要它？因为 AI 对**所有人开放**，而 NIM 的免费额度有限
   * （公开资料约 40 RPM，且按 token 计费）。没有这道闸，
   * 链接一旦被分享出去，额度可能在几小时内耗尽。
   *
   * 这是"产品决策（对所有人开放）必须配一个技术手段兜底"的典型例子。
   */
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'NVNIM_DAILY_LIMIT 至少为 1' })
  @Max(100000, { message: 'NVNIM_DAILY_LIMIT 过大' })
  NVNIM_DAILY_LIMIT: number = 300

  // ────────────────────────────────────────────────────────────────
  // GitHub 热门项目榜
  //
  // 两个变量都是**可选**的 —— 与上面的 AI 配置同理：
  // 榜单是增强功能，没有 Token 也能跑（只是限流从 30 次/分钟
  // 降到 10 次/分钟），没配缓存时长就用默认的 6 小时。
  // ────────────────────────────────────────────────────────────────

  /**
   * GitHub 个人访问令牌（可选）。
   *
   * ⚠️ 注意它对限流的提升**远不如想象中大**：
   *   Search API 独立限流 —— 未认证 10 次/分钟，认证后**只有 30 次/分钟**，
   *   而不是 core 接口的 5000 次/小时。
   *
   * 所以这个 Token 是"锦上添花"，真正保证不撞限流的是
   * Service 层的缓存与最小刷新间隔。别指望配了它就能随便刷。
   *
   * 只需要 public_repo 级别的只读权限；如果只查公开仓库，
   * 实际上不配置也能正常工作。
   */
  @IsOptional()
  @IsString()
  GITHUB_TOKEN?: string

  /**
   * 榜单缓存的软过期时长（分钟）。
   *
   * 下限 5 分钟是防止有人配成 0 导致每次请求都打上游；
   * 上限 7 天则是因为再久就称不上"热门榜"了。
   */
  @IsOptional()
  @IsInt()
  @Min(5, { message: 'GITHUB_TRENDING_CACHE_TTL_MINUTES 至少 5 分钟' })
  @Max(10080, { message: 'GITHUB_TRENDING_CACHE_TTL_MINUTES 最多 10080 分钟（7 天）' })
  GITHUB_TRENDING_CACHE_TTL_MINUTES: number = 360
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    // 环境变量全是字符串，开启隐式转换后 '3000' 会自动变成 3000
    enableImplicitConversion: true,
  })

  const errors = validateSync(validated, { skipMissingProperties: false })

  if (errors.length > 0) {
    // 把字段名和原因都打出来。只说"环境变量校验失败"会让人无从下手。
    const details = errors
      .map((error) => {
        const constrained = Object.values(error.constraints ?? {})
        return `【${error.property}】${constrained.join('、') || '取值非法'}`
      })
      .join('\n  - ')

    throw new Error(
      `环境变量校验失败，请检查 apps/api/.env：\n  - ${details}\n` +
        '提示：可以从仓库根的 .env.example 复制一份重新填写。',
    )
  }

  return validated
}
