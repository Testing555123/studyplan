import { plainToInstance } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator'

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
   * Embedding 模型名。**独立于 NVNIM_MODEL 单独可配**：
   * 对话模型下线不该连累整个向量库重建，两者的生命周期完全不同。
   * baai/bge-m3 为多语言模型（中英通吃），1024 维。
   */
  @IsOptional()
  @IsString()
  NVNIM_EMBED_MODEL: string = 'baai/bge-m3'

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

  // ────────────────────────────────────────────────────────────────
  // 每日 GitHub 项目报道（Daily Digest）
  //
  // 这一组变量**全部可选、全部带默认值**，没有一个例外。
  //
  // 原因很实际：`validateEnv` 是启动即 fail fast 的。
  // 任何一个"必填但没有默认值"的新变量，都会让所有还没配它的环境
  // ——同事的电脑、CI、以及正在运行的生产实例——**直接启动失败**。
  // 对一个锦上添花的功能来说，这个代价完全不成比例。
  //
  // 总开关默认关闭，所以一个变量都不配时，这个装置等于不存在。
  // ────────────────────────────────────────────────────────────────

  /**
   * 总开关。
   *
   * 默认关，是因为这个装置会**以机器人身份发帖** ——
   * 那是写进数据库、所有用户都能看到的真实内容。
   * 让它默认静默，是"宁可不发，也不能在别人不知情时自动发"。
   */
  @IsOptional()
  @IsIn(['true', 'false', '1', '0'], { message: 'DAILY_DIGEST_ENABLED 只能是 true / false' })
  DAILY_DIGEST_ENABLED: string = 'false'

  /**
   * 定时端点的令牌。
   *
   * **留空则端点直接 401，等于关闭。** 这是第二把锁：
   * 总开关防的是"在错误的环境里跑起来"，这把锁防的是"被不相干的人跑起来"。
   *
   * 用 Vercel Cron 时，平台会把自己的 `CRON_SECRET` 放在
   * `Authorization: Bearer <secret>` 里发过来，
   * 所以把它和 `CRON_SECRET` 设成同一个值即可，不需要额外配置。
   */
  @IsOptional()
  @IsString()
  DAILY_DIGEST_CRON_TOKEN?: string

  /**
   * 计算"今天"所用的时区。
   *
   * 必须是 IANA 时区名（如 `Asia/Shanghai`）。
   * 用它而不是 UTC，是为了让"每天一篇"符合人的直觉：
   * 否则北京时间早上发的那篇会被记到前一天，当天再触发就被判成已发过。
   */
  @IsOptional()
  @IsString()
  DAILY_DIGEST_TIMEZONE: string = 'Asia/Shanghai'

  /**
   * 一天中从第几个小时开始允许发布（0-23，按上面的时区）。
   *
   * 它约束的是**惰性触发**：不到点就不补发，
   * 否则凌晨有人访问一次，当天那篇就在半夜发出去了。
   */
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'DAILY_DIGEST_PUBLISH_HOUR 必须在 0-23 之间' })
  @Max(23, { message: 'DAILY_DIGEST_PUBLISH_HOUR 必须在 0-23 之间' })
  DAILY_DIGEST_PUBLISH_HOUR: number = 9

  /**
   * 候选项目的最小 star 数。
   *
   * 这是"新项目"和"有人用的新项目"之间的分界线。
   * 调低会推到很多刚建好、还没人验证的仓库；调高则只能推到已经很火的项目，
   * 而那些项目读者多半早就在别处看过了。
   */
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'DAILY_DIGEST_MIN_STARS 不能为负数' })
  @Max(100000, { message: 'DAILY_DIGEST_MIN_STARS 过大' })
  DAILY_DIGEST_MIN_STARS: number = 50

  /**
   * 只看最近多少天内新建的仓库。
   *
   * 它决定"新"的定义，也决定候选池的大小。
   * 30 天是个平衡点：足够窄以保证新鲜，又足够宽以避免某天没得选。
   */
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'DAILY_DIGEST_LOOKBACK_DAYS 至少为 1' })
  @Max(365, { message: 'DAILY_DIGEST_LOOKBACK_DAYS 最多 365 天' })
  DAILY_DIGEST_LOOKBACK_DAYS: number = 30

  /**
   * 语言白名单，逗号分隔（如 `TypeScript,JavaScript`）。
   *
   * **留空表示不限语言** —— 这里的"空"是有意义的取值，不是"没配"。
   * 想只推前端项目就填 `TypeScript,JavaScript,Vue`。
   */
  @IsOptional()
  @IsString()
  DAILY_DIGEST_LANGUAGES: string = ''

  /** 从候选池里最多考虑前几个项目（榜单最多返回 100 条） */
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'DAILY_DIGEST_CANDIDATE_LIMIT 至少为 1' })
  @Max(100, { message: 'DAILY_DIGEST_CANDIDATE_LIMIT 最多 100' })
  DAILY_DIGEST_CANDIDATE_LIMIT: number = 100

  /**
   * 报道的 AI 输出上限。
   *
   * 比问答场景的 800 大得多，因为报道是几百字的长文。
   * 但也不是越大越好：`max_tokens` 同时决定最坏等待时间，
   * 给得太多，模型会一直写到撞上超时。
   */
  @IsOptional()
  @IsInt()
  @Min(200, { message: 'DAILY_DIGEST_AI_MAX_TOKENS 至少 200' })
  @Max(8000, { message: 'DAILY_DIGEST_AI_MAX_TOKENS 过大，会显著拉长等待时间' })
  DAILY_DIGEST_AI_MAX_TOKENS: number = 3000

  /**
   * 报道的 AI 超时。
   *
   * 默认 90 秒是实测出来的：一篇 400 到 800 字的中文报道，模型耗时在
   * 27 到 41 秒之间浮动。原本的 40 秒让**线上每一篇都退回了模板版**，
   * 而且不报错，只是在日志里留一句 warn。
   *
   * 上限 120 秒的依据是平台量级：Hobby 套餐的 Vercel Function 默认值与
   * 上限都是 300 秒（Services 的后端同样跑在 Function 上），
   * 所以 90 秒很安全，120 秒也仍然在安全区内。
   * 仍然设上限，是为了不让一次卡住的请求一直占着连接。
   */
  @IsOptional()
  @IsInt()
  @Min(1000, { message: 'DAILY_DIGEST_AI_TIMEOUT_MS 至少 1000 毫秒' })
  @Max(120000, { message: 'DAILY_DIGEST_AI_TIMEOUT_MS 最多 120000 毫秒' })
  DAILY_DIGEST_AI_TIMEOUT_MS: number = 90000

  /**
   * 是否允许惰性触发（读取接口顺带补发）。
   *
   * 配置 Cron 之后可以关掉它，让发布时机完全由 Cron 决定；
   * 没配 Cron 的环境则靠它兜底，避免"上线了却永远不发文"。
   */
  @IsOptional()
  @IsIn(['true', 'false', '1', '0'], {
    message: 'DAILY_DIGEST_LAZY_TRIGGER 只能是 true / false',
  })
  DAILY_DIGEST_LAZY_TRIGGER: string = 'true'

  /**
   * 机器人账号的用户名。
   *
   * 它会成为帖子上显示的作者名，也会用来推导机器人邮箱
   * （`<用户名>@studyplan.local`）。改这个值等于换一个作者身份，
   * 之前的报道仍然挂在旧账号名下 —— 所以**上线后不要随便改**。
   */
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'DAILY_DIGEST_BOT_USERNAME 至少 2 个字符' })
  @MaxLength(20, { message: 'DAILY_DIGEST_BOT_USERNAME 最多 20 个字符' })
  DAILY_DIGEST_BOT_USERNAME: string = 'github-daily'

  // ────────────────────────────────────────────────────────────────
  // 项目简介的 AI 润色（榜单卡片与仓库详情页）
  //
  // 同样全部可选、全部带默认值 —— 理由与每日报道那组一致：
  // 一个可选功能不该有能力让整个应用启动失败。
  // ────────────────────────────────────────────────────────────────

  /**
   * 总开关。关掉之后接口仍然可用，只是不再生成新简介（已生成的照常返回）。
   */
  @IsOptional()
  @IsIn(['true', 'false', '1', '0'], { message: 'GITHUB_INTRO_ENABLED 只能是 true / false' })
  GITHUB_INTRO_ENABLED: string = 'true'

  /**
   * 单次调用最多生成几条简介。
   *
   * 它直接决定"一次请求最坏要挂多久"：生成一条实测 20-40 秒。
   * 所以必须和下面的时间预算放在一起看 ——
   * 设得太大，请求会撞上平台的执行时长上限，结果一条都拿不到。
   */
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'GITHUB_INTRO_BATCH_LIMIT 至少为 1' })
  @Max(20, { message: 'GITHUB_INTRO_BATCH_LIMIT 最多 20，再大请求会超时' })
  GITHUB_INTRO_BATCH_LIMIT: number = 3

  /** 单次调用的时间预算（毫秒）。到了就交卷，没做完的留给前端下一轮轮询 */
  @IsOptional()
  @IsInt()
  @Min(1000, { message: 'GITHUB_INTRO_TIME_BUDGET_MS 至少 1000 毫秒' })
  @Max(120000, { message: 'GITHUB_INTRO_TIME_BUDGET_MS 最多 120000 毫秒' })
  GITHUB_INTRO_TIME_BUDGET_MS: number = 20000

  /**
   * 单条简介的输出上限。
   *
   * 看着和"简介只有 120 字"很不成比例，但**不能按正文长度估**：
   * 推理模型的思考链也从同一个额度里扣，而思考链长度波动很大。
   * 实测同一份 prompt：300 与 1200 都被截断成空内容，2500 才稳定写出正文。
   * 依据见 `repo-intro.service.ts` 里 `DEFAULTS` 的注释。
   */
  @IsOptional()
  @IsInt()
  @Min(200, { message: 'GITHUB_INTRO_AI_MAX_TOKENS 至少 200' })
  @Max(8000, { message: 'GITHUB_INTRO_AI_MAX_TOKENS 最多 8000，再大只会拉长等待' })
  GITHUB_INTRO_AI_MAX_TOKENS: number = 3000

  /**
   * 单条简介的 AI 超时（毫秒）。
   *
   * 比问答的 25 秒宽：这一条要连思考链一起生成，
   * 实测耗时在 16～25 秒之间浮动，卡在 20 秒会有一部分直接超时。
   */
  @IsOptional()
  @IsInt()
  @Min(1000, { message: 'GITHUB_INTRO_AI_TIMEOUT_MS 至少 1000 毫秒' })
  @Max(60000, { message: 'GITHUB_INTRO_AI_TIMEOUT_MS 最多 60000 毫秒' })
  GITHUB_INTRO_AI_TIMEOUT_MS: number = 45000

  /**
   * 简介的有效期（天）。
   *
   * 到期后下次读取视为失效并重新生成。这是为了兜住
   * "作者改了官方简介"这种情况：读取时我们手里只有仓库 id，
   * 无法判断内容是否已经变了，用时间兜底最省事。
   */
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'GITHUB_INTRO_TTL_DAYS 至少为 1' })
  @Max(365, { message: 'GITHUB_INTRO_TTL_DAYS 最多 365 天' })
  GITHUB_INTRO_TTL_DAYS: number = 30
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
