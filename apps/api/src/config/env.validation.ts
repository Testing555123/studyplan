import { z } from 'zod'

/**
 * 环境变量校验（Zod 4）。
 *
 * 为什么必须做这件事？
 *   环境变量的类型是"字符串或 undefined"。如果代码里直接写
 *   `process.env.MONGODB_URI`，TypeScript 只知道它是 `string | undefined`，
 *   而运行时它可能是空字符串。与其等到第一个数据库查询或第一次登录
 *   才报错，不如**启动时就直接崩掉**——这叫 fail fast。
 *
 * 为什么从 class-validator 换成 Zod 4（批次 2）？
 *   1. class-validator 依赖 `reflect-metadata` 与装饰器：单测里少 import 一次
 *      就整份校验直接 `Reflect.getMetadata is not a function`；
 *   2. 校验完的值仍然是"类实例上的属性"，TypeScript 并不知道 PORT 已经是 number，
 *      于是每个读取点都要再 `Number(config.get(...))` 一遍，容错口径各处漂移；
 *   3. 跨字段规则（两个 JWT 密钥不能相同）装饰器表达不了，
 *      结果就是"写在注释里的规则"永远不落进代码。
 *   Zod 一份 schema 同时给出运行时校验与编译期类型，三件事一起解决。
 *
 * 这份校验是**随阶段逐步收紧**的：
 *   阶段 1 只要求 PORT → 阶段 3 追加 MONGODB_URI → 阶段 5 追加两个 JWT 密钥
 *   → 阶段 7 追加 AI 供应商的 Key（智谱 GLM → 现为 NVIDIA NIM）。
 *   不要一开始就把所有变量都列成必填，否则你在阶段 1 就会被一堆还没用到的配置拦住。
 */
const booleanish = ['true', 'false', '1', '0'] as const

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    PORT: z.coerce.number('PORT 必须是整数').int('PORT 必须是整数').min(1).max(65535).default(3000),

    CORS_ORIGIN: z.string().default('http://localhost:3001'),

    /**
     * MongoDB 连接串。
     *
     * 用 min(20) 而不是"非空"：漏填时值是空字符串，而"不能为空"的报错不够直白。
     * 长度下限同时拦下了"填了个明显不是连接串的东西"。
     */
    MONGODB_URI: z
      .string('MONGODB_URI 必须是字符串')
      .min(
        20,
        'MONGODB_URI 未配置或格式明显不对。它应该形如 mongodb+srv://<用户>:<密码>@<集群>/studyplan',
      ),

    /**
     * JWT 密钥。
     *
     * 要求最少 32 个字符，是因为密钥强度直接决定 Token 能不能被暴力破解。
     * 一个 8 位的弱密钥，用现成的字典工具几分钟就能撞出来 ——
     * 而一旦密钥被猜中，攻击者就能**自己签发任意用户**的 Token。
     *
     * 生成方式（在仓库根目录执行）：
     *   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     * 两个密钥绝不能相同（见文件末尾的跨字段规则），也绝不能提交到 Git。
     */
    JWT_ACCESS_SECRET: z
      .string('JWT_ACCESS_SECRET 必须是字符串')
      .min(32, 'JWT_ACCESS_SECRET 至少需要 32 个字符，请用随机字节生成'),

    JWT_REFRESH_SECRET: z
      .string('JWT_REFRESH_SECRET 必须是字符串')
      .min(32, 'JWT_REFRESH_SECRET 至少需要 32 个字符，请用随机字节生成'),

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
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    /**
     * Refresh Cookie 的 SameSite 策略。
     *
     * 本地开发用 lax 即可（3001 → 3000 属于同站）。
     * 部署后如果前后端在不同域名下，必须改成 none，且后端要跑在 HTTPS 上，
     * 否则浏览器会直接丢弃这个 Cookie。
     */
    COOKIE_SAME_SITE: z
      .enum(['lax', 'none', 'strict'], 'COOKIE_SAME_SITE 只能是 lax / none / strict')
      .default('lax'),

    // ────────────────────────────────────────────────────────────────
    // AI 能力（NVIDIA NIM）
    //
    // ⚠️ NVNIM_API_KEY 是**可选**的 —— 与 MONGODB_URI 的处理刻意不同，
    //    而这个区别本身就是一条重要的设计经验：
    //
    //      · 数据库是**核心依赖**：没有它，这个后端没有任何存在意义
    //        → 必须 fail fast，启动时就崩；
    //      · AI 是**增强功能**：没有它，应用依然完整可用（只是没有摘要与问答）
    //        → 降级运行，并在日志里说清楚。
    //
    //    "哪些依赖必须存在"是一个**产品判断**，不是一个技术判断。
    //    把增强功能做成硬依赖，等于用一个可选项卡住整个系统 ——
    //    新人第一次跑项目时，会因为没填一个他根本不需要的 Key 而完全跑不起来。
    // ────────────────────────────────────────────────────────────────

    NVNIM_API_KEY: z.string().optional(),

    /**
     * 模型名。
     *
     * ⚠️ **必须可配，绝不能写死**：NV NIM 的模型会下线。
     * 实测请求 `meta/llama-3.1-8b-instruct` 返回 410 Gone，正文写着
     * "has reached its end of life on 2026-08-26T09:00:00Z and is no longer available"。
     * 写死模型名的代码会在某一天毫无征兆地全线报错。
     *
     * 当前默认 `openai/gpt-oss-20b` 是实测中**产出答案最快**的（约 36 字/秒）。
     * 别被名字误导：先前默认的 `deepseek-v4-flash-0731` 虽然带 "flash"，
     * 却是推理模型，思考链能占掉一半以上输出，简单问题 22 秒、复杂问题直接撞超时。
     *
     * 可用模型清单可随时查询：GET https://integrate.api.nvidia.com/v1/models
     */
    NVNIM_MODEL: z.string().default('openai/gpt-oss-20b'),

    /**
     * AI 单次调用超时（毫秒）。
     *
     * 上限卡在 60 秒，是因为超时设置**必须小于**用户能忍受的等待极限 ——
     * 即使做成旁路（不阻塞发帖），超时太长也会让日志里堆积大量"还在跑"的请求。
     */
    NVNIM_TIMEOUT_MS: z.coerce
      .number('NVNIM_TIMEOUT_MS 必须是整数')
      .int('NVNIM_TIMEOUT_MS 必须是整数')
      .min(1000, 'NVNIM_TIMEOUT_MS 至少 1000 毫秒')
      .max(60000, 'NVNIM_TIMEOUT_MS 最多 60000 毫秒')
      .default(25000),

    /**
     * 每日调用上限（命中缓存的请求不计）。
     *
     * 因为 AI 对**所有人开放**，而 NIM 的免费额度有限（公开资料约 40 RPM，
     * 且按 token 计费）。没有这道闸，链接一旦被分享出去，额度可能在几小时内耗尽。
     * 这是"产品决策（对所有人开放）必须配一个技术手段兜底"的典型例子。
     */
    NVNIM_DAILY_LIMIT: z.coerce
      .number('NVNIM_DAILY_LIMIT 必须是整数')
      .int('NVNIM_DAILY_LIMIT 必须是整数')
      .min(1, 'NVNIM_DAILY_LIMIT 至少为 1')
      .max(100000, 'NVNIM_DAILY_LIMIT 过大')
      .default(300),

    // ────────────────────────────────────────────────────────────────
    // GitHub 热门项目榜（两个变量都可选：榜单是增强功能）
    // ────────────────────────────────────────────────────────────────

    /**
     * GitHub 个人访问令牌（可选）。
     *
     * ⚠️ 注意它对限流的提升**远不如想象中大**：
     *   Search API 独立限流 —— 未认证 10 次/分钟，认证后**只有 30 次/分钟**，
     *   而不是 core 接口的 5000 次/小时。
     *
     * 所以这个 Token 是"锦上添花"，真正保证不撞限流的是 Service 层的缓存
     * 与最小刷新间隔。别指望配了它就能随便刷。
     *
     * 只需要 public_repo 级别的只读权限；只查公开仓库时不配置也能正常工作。
     */
    GITHUB_TOKEN: z.string().optional(),

    /**
     * 榜单缓存的软过期时长（分钟）。
     *
     * 下限 5 分钟是防止有人配成 0 导致每次请求都打上游；
     * 上限 7 天则是因为再久就称不上"热门榜"了。
     */
    GITHUB_TRENDING_CACHE_TTL_MINUTES: z.coerce
      .number('GITHUB_TRENDING_CACHE_TTL_MINUTES 必须是整数')
      .int('GITHUB_TRENDING_CACHE_TTL_MINUTES 必须是整数')
      .min(5, 'GITHUB_TRENDING_CACHE_TTL_MINUTES 至少 5 分钟')
      .max(10080, 'GITHUB_TRENDING_CACHE_TTL_MINUTES 最多 10080 分钟（7 天）')
      .default(360),

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
    DAILY_DIGEST_ENABLED: z
      .enum(booleanish, 'DAILY_DIGEST_ENABLED 只能是 true / false')
      .default('false'),

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
    DAILY_DIGEST_CRON_TOKEN: z.string().optional(),

    /**
     * 计算"今天"所用的时区，必须是 IANA 时区名（如 `Asia/Shanghai`）。
     *
     * 用它而不是 UTC，是为了让"每天一篇"符合人的直觉：
     * 否则北京时间早上发的那篇会被记到前一天，当天再触发就被判成已发过。
     */
    DAILY_DIGEST_TIMEZONE: z.string().default('Asia/Shanghai'),

    /**
     * 一天中从第几个小时开始允许发布（0-23，按上面的时区）。
     *
     * 它约束的是**惰性触发**：不到点就不补发，
     * 否则凌晨有人访问一次，当天那篇就在半夜发出去了。
     *
     * ⚠️ 0 是**合法取值**（"0 点就能发"），不是"没配"。
     *    这也是批次 2 验收点名要守住的那条语义。
     */
    DAILY_DIGEST_PUBLISH_HOUR: z.coerce
      .number('DAILY_DIGEST_PUBLISH_HOUR 必须是整数')
      .int('DAILY_DIGEST_PUBLISH_HOUR 必须是整数')
      .min(0, 'DAILY_DIGEST_PUBLISH_HOUR 必须在 0-23 之间')
      .max(23, 'DAILY_DIGEST_PUBLISH_HOUR 必须在 0-23 之间')
      .default(9),

    /**
     * 候选项目的最小 star 数。
     *
     * 这是"新项目"和"有人用的新项目"之间的分界线。调低会推到很多刚建好、
     * 还没人验证的仓库；调高则只能推到已经很火的项目，而那些读者多半早就看过了。
     *
     * ⚠️ 0 同样是有意义值（"不限 star"）。
     */
    DAILY_DIGEST_MIN_STARS: z.coerce
      .number('DAILY_DIGEST_MIN_STARS 必须是整数')
      .int('DAILY_DIGEST_MIN_STARS 必须是整数')
      .min(0, 'DAILY_DIGEST_MIN_STARS 不能为负数')
      .max(100000, 'DAILY_DIGEST_MIN_STARS 过大')
      .default(50),

    /**
     * 只看最近多少天内新建的仓库：它决定"新"的定义，也决定候选池的大小。
     * 30 天是个平衡点：足够窄以保证新鲜，又足够宽以避免某天没得选。
     */
    DAILY_DIGEST_LOOKBACK_DAYS: z.coerce
      .number('DAILY_DIGEST_LOOKBACK_DAYS 必须是整数')
      .int('DAILY_DIGEST_LOOKBACK_DAYS 必须是整数')
      .min(1, 'DAILY_DIGEST_LOOKBACK_DAYS 至少为 1')
      .max(365, 'DAILY_DIGEST_LOOKBACK_DAYS 最多 365 天')
      .default(30),

    /**
     * 语言白名单，逗号分隔（如 `TypeScript,JavaScript`）。
     *
     * **留空表示不限语言** —— 这里的"空"是有意义的取值，不是"没配"。
     * 想只推前端项目就填 `TypeScript,JavaScript,Vue`。
     */
    DAILY_DIGEST_LANGUAGES: z.string().default(''),

    /** 从候选池里最多考虑前几个项目（榜单最多返回 100 条） */
    DAILY_DIGEST_CANDIDATE_LIMIT: z.coerce
      .number('DAILY_DIGEST_CANDIDATE_LIMIT 必须是整数')
      .int('DAILY_DIGEST_CANDIDATE_LIMIT 必须是整数')
      .min(1, 'DAILY_DIGEST_CANDIDATE_LIMIT 至少为 1')
      .max(100, 'DAILY_DIGEST_CANDIDATE_LIMIT 最多 100')
      .default(100),

    /**
     * 报道的 AI 输出上限。
     *
     * 比问答场景的 800 大得多，因为报道是几百字的长文。但也不是越大越好：
     * `max_tokens` 同时决定最坏等待时间，给得太多，模型会一直写到撞上超时。
     */
    DAILY_DIGEST_AI_MAX_TOKENS: z.coerce
      .number('DAILY_DIGEST_AI_MAX_TOKENS 必须是整数')
      .int('DAILY_DIGEST_AI_MAX_TOKENS 必须是整数')
      .min(200, 'DAILY_DIGEST_AI_MAX_TOKENS 至少 200')
      .max(8000, 'DAILY_DIGEST_AI_MAX_TOKENS 过大，会显著拉长等待时间')
      .default(3000),

    /**
     * 报道的 AI 超时。默认 90 秒是实测出来的：一篇 400 到 800 字的中文报道，
     * 模型耗时在 27 到 41 秒之间浮动。原本的 40 秒让**线上每一篇都退回了模板版**，
     * 而且不报错，只是在日志里留一句 warn。
     *
     * 上限 120 秒的依据是平台量级：Hobby 套餐的 Vercel Function 默认值与上限都是
     * 300 秒，所以 90 秒很安全，120 秒也仍在安全区内。
     * 仍然设上限，是为了不让一次卡住的请求一直占着连接。
     */
    DAILY_DIGEST_AI_TIMEOUT_MS: z.coerce
      .number('DAILY_DIGEST_AI_TIMEOUT_MS 必须是整数')
      .int('DAILY_DIGEST_AI_TIMEOUT_MS 必须是整数')
      .min(1000, 'DAILY_DIGEST_AI_TIMEOUT_MS 至少 1000 毫秒')
      .max(120000, 'DAILY_DIGEST_AI_TIMEOUT_MS 最多 120000 毫秒')
      .default(90000),

    /**
     * 是否允许惰性触发（读取接口顺带补发）。
     *
     * 配置 Cron 之后可以关掉它，让发布时机完全由 Cron 决定；
     * 没配 Cron 的环境则靠它兜底，避免"上线了却永远不发文"。
     */
    DAILY_DIGEST_LAZY_TRIGGER: z
      .enum(booleanish, 'DAILY_DIGEST_LAZY_TRIGGER 只能是 true / false')
      .default('true'),

    /**
     * 机器人账号的用户名。
     *
     * 它会成为帖子上显示的作者名，也会用来推导机器人邮箱
     * （`<用户名>@studyplan.local`）。改这个值等于换一个作者身份，
     * 之前的报道仍然挂在旧账号名下 —— 所以**上线后不要随便改**。
     */
    DAILY_DIGEST_BOT_USERNAME: z
      .string('DAILY_DIGEST_BOT_USERNAME 必须是字符串')
      .min(2, 'DAILY_DIGEST_BOT_USERNAME 至少 2 个字符')
      .max(20, 'DAILY_DIGEST_BOT_USERNAME 最多 20 个字符')
      .default('github-daily'),

    // ────────────────────────────────────────────────────────────────
    // 项目简介的 AI 润色（榜单卡片与仓库详情页）
    // 同样全部可选、全部带默认值 —— 一个可选功能不该有能力让整个应用启动失败。
    // ────────────────────────────────────────────────────────────────

    /** 总开关。关掉之后接口仍然可用，只是不再生成新简介（已生成的照常返回）。 */
    GITHUB_INTRO_ENABLED: z
      .enum(booleanish, 'GITHUB_INTRO_ENABLED 只能是 true / false')
      .default('true'),

    /**
     * 单次调用最多生成几条简介。
     *
     * 它直接决定"一次请求最坏要挂多久"：生成一条实测 20-40 秒。
     * 所以必须和下面的时间预算放在一起看 —— 设得太大，请求会撞上平台的
     * 执行时长上限，结果一条都拿不到。
     */
    GITHUB_INTRO_BATCH_LIMIT: z.coerce
      .number('GITHUB_INTRO_BATCH_LIMIT 必须是整数')
      .int('GITHUB_INTRO_BATCH_LIMIT 必须是整数')
      .min(1, 'GITHUB_INTRO_BATCH_LIMIT 至少为 1')
      .max(20, 'GITHUB_INTRO_BATCH_LIMIT 最多 20，再大请求会超时')
      .default(3),

    /** 单次调用的时间预算（毫秒）。到了就交卷，没做完的留给前端下一轮轮询 */
    GITHUB_INTRO_TIME_BUDGET_MS: z.coerce
      .number('GITHUB_INTRO_TIME_BUDGET_MS 必须是整数')
      .int('GITHUB_INTRO_TIME_BUDGET_MS 必须是整数')
      .min(1000, 'GITHUB_INTRO_TIME_BUDGET_MS 至少 1000 毫秒')
      .max(120000, 'GITHUB_INTRO_TIME_BUDGET_MS 最多 120000 毫秒')
      .default(20000),

    /**
     * 单条简介的输出上限。
     *
     * 看着和"简介只有 120 字"很不成比例，但**不能按正文长度估**：
     * 推理模型的思考链也从同一个额度里扣，而思考链长度波动很大。
     * 实测同一份 prompt：300 与 1200 都被截断成空内容，2500 才稳定写出正文。
     * 依据见 `repo-intro.service.ts` 里 `DEFAULTS` 的注释。
     */
    GITHUB_INTRO_AI_MAX_TOKENS: z.coerce
      .number('GITHUB_INTRO_AI_MAX_TOKENS 必须是整数')
      .int('GITHUB_INTRO_AI_MAX_TOKENS 必须是整数')
      .min(200, 'GITHUB_INTRO_AI_MAX_TOKENS 至少 200')
      .max(8000, 'GITHUB_INTRO_AI_MAX_TOKENS 最多 8000，再大只会拉长等待')
      .default(3000),

    /**
     * 单条简介的 AI 超时（毫秒）。
     *
     * 比问答的 25 秒宽：这一条要连思考链一起生成，
     * 实测耗时在 16～25 秒之间浮动，卡在 20 秒会有一部分直接超时。
     */
    GITHUB_INTRO_AI_TIMEOUT_MS: z.coerce
      .number('GITHUB_INTRO_AI_TIMEOUT_MS 必须是整数')
      .int('GITHUB_INTRO_AI_TIMEOUT_MS 必须是整数')
      .min(1000, 'GITHUB_INTRO_AI_TIMEOUT_MS 至少 1000 毫秒')
      .max(60000, 'GITHUB_INTRO_AI_TIMEOUT_MS 最多 60000 毫秒')
      .default(45000),

    /**
     * 简介的有效期（天）。到期后下次读取视为失效并重新生成。
     *
     * 这是为了兜住"作者改了官方简介"这种情况：读取时我们手里只有仓库 id，
     * 无法判断内容是否已经变了，用时间兜底最省事。
     */
    GITHUB_INTRO_TTL_DAYS: z.coerce
      .number('GITHUB_INTRO_TTL_DAYS 必须是整数')
      .int('GITHUB_INTRO_TTL_DAYS 必须是整数')
      .min(1, 'GITHUB_INTRO_TTL_DAYS 至少为 1')
      .max(365, 'GITHUB_INTRO_TTL_DAYS 最多 365 天')
      .default(30),
  })
  /**
   * 跨字段规则：两个 JWT 密钥必须不同。
   *
   * 这条规则原本只写在注释与 `.env.example` 里，从来没有落成代码 ——
   * class-validator 的字段级装饰器表达不了"A 不等于 B"。
   * 而一旦两个密钥相同，Refresh Token 与 Access Token 就互相等价，
   * "泄露 Access 不能当 Refresh 用"这条设计前提直接失效。
   */
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message:
      'JWT_ACCESS_SECRET 与 JWT_REFRESH_SECRET 不能相同：两个 Token 共用一个密钥，等于双 Token 方案退化成一个',
    path: ['JWT_REFRESH_SECRET'],
  })

export type EnvironmentVariables = z.infer<typeof envSchema>

/**
 * Nest `ConfigModule.forRoot({ validate })` 的入口。
 *
 * 签名与替换前保持一致（收 `Record<string, unknown>`，返回校验后的对象），
 * 所以调用方与 `config.get('PORT')` 拿到的类型都不变。
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const parsed = envSchema.safeParse(config)

  if (!parsed.success) {
    // 把字段名和原因都打出来。只说"环境变量校验失败"会让人无从下手。
    // 同一个字段的多条问题合并成一行，与替换前的输出形状一致。
    const byField = new Map<string, string[]>()
    for (const issue of parsed.error.issues) {
      const field =
        issue.path.length > 0 ? String(issue.path[issue.path.length - 1]) : '（跨字段规则）'
      byField.set(field, [...(byField.get(field) ?? []), issue.message || '取值非法'])
    }

    const details = [...byField.entries()]
      .map(([field, reasons]) => `【${field}】${reasons.join('、')}`)
      .join('\n  - ')

    throw new Error(
      `环境变量校验失败，请检查 apps/api/.env：\n  - ${details}\n` +
        '提示：可以从仓库根的 .env.example 复制一份重新填写。',
    )
  }

  return parsed.data
}
