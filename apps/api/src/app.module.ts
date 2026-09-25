import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { TerminusModule } from '@nestjs/terminus'
import { ThrottlerModule } from '@nestjs/throttler'
import { validateEnv } from './config/env.validation'
import { AiModule } from './modules/ai/ai.module'
import { AuthModule } from './modules/auth/auth.module'
import { CommentsModule } from './modules/comments/comments.module'
import { DailyDigestModule } from './modules/daily-digest/daily-digest.module'
import { GithubModule } from './modules/github/github.module'
import { HealthController } from './modules/health/health.controller'
import { LikesModule } from './modules/likes/likes.module'
import { PostsModule } from './modules/posts/posts.module'
import { RoadmapModule } from './modules/roadmap/roadmap.module'
import { UsersModule } from './modules/users/users.module'

/**
 * 根模块 —— 整个后端的组装说明书。
 *
 * NestJS 的核心思想是"依赖注入容器"：你不在代码里手动 new 对象，
 * 而是声明"我需要什么"，由容器负责创建并塞给你。
 * `@Module()` 就是声明的地方：
 *   - imports：    本模块要用到的其它模块
 *   - controllers：处理 HTTP 请求的类
 *   - providers：  可被注入的服务
 *
 * 阶段 5 会追加 AuthModule / UsersModule，阶段 6 追加 CommentsModule，
 * 阶段 7 追加 AiModule。**模块在这里逐个长出来**，而不是一次性规划完。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      // isGlobal: true 之后，任何模块都不用再 import 就能注入 ConfigService
      isGlobal: true,
      // 两个路径都试：从 apps/api 目录启动、从仓库根启动都能读到
      envFilePath: ['.env', 'apps/api/.env'],
      // 启动即校验，配置有问题直接崩，不留到运行期
      validate: validateEnv,
    }),

    /**
     * 数据库连接。
     *
     * 用 `forRootAsync` 而不是 `forRoot`，是因为连接串来自 ConfigService ——
     * 而 ConfigService 要等 ConfigModule 初始化完才可用。
     * `forRootAsync` 就是"等依赖准备好了再创建"的标准做法。
     *
     * 注意 `uri` 用的是 `getOrThrow`：
     * 虽然 env.validation 已经保证它存在，但 `get` 的返回类型仍是
     * `string | undefined`。用 getOrThrow 可以让类型收敛成 `string`，
     * 省掉一次没意义的空值判断 —— 这叫"让类型系统承接运行时保证"。
     */
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),

        /**
         * 服务器选择超时。
         *
         * 默认 30 秒：连接串写错时你会对着卡住的终端等半分钟。
         * 这里收到 3000 —— **再低就会误伤正常请求**：
         * 本项目的数据库在 asia、容器在美东，跨区选主本身就要几百毫秒，
         * 设成 1000 会让"本来能成功的请求"在重试前就先失败了。
         */
        serverSelectionTimeoutMS: 3000,

        /**
         * 连接池上限 —— **serverless 环境必须显式设置**。
         *
         * 不设的话走驱动默认值 100。这在常驻单进程里没问题，
         * 但在"按流量自动扩缩"的平台上，**每个实例都会独立开一个池**：
         * 10 个实例 = 1000 条连接，直接超过 Atlas 免费集群 500 条的上限。
         * 表现是"流量一上来整站报数据库错误"，而且本地永远复现不出来。
         *
         * 取 5 的理由：单实例 5 条足够应付 SSR 取数 + 并发接口；
         * 即使扩到 100 个实例也刚好是 500 条，压在上限之内。
         */
        maxPoolSize: 5,

        /**
         * 连接池下限（常驻 1 条）。
         *
         * 为什么需要它：默认值是 0，也就是"池空了再临时建连接"。
         * 而本项目是**容器在美东、数据库在 asia** 的跨区链路 ——
         * 建一条连接要付 DNS + TCP + TLS + SCRAM 握手，实测几百毫秒。
         * 实例冷启动后的第一个业务请求，就会把这几百毫秒算进用户等待里。
         *
         * 保活 1 条之后，这笔握手成本挪到了启动期，不再出现在请求路径上。
         * 只取 1 而不是更多：Atlas M0 的连接总量上限只有 500，
         * 每个常驻连接都会被每个实例各自占住一份。
         */
        minPoolSize: 1,

        /**
         * 空闲连接最长存活时间 —— **本次延迟问题最关键的一个参数**。
         *
         * ── 它解决什么 ──
         * 线上实测：连续打同一个接口，TTFB 严格交替出现
         *   0.49s → 6.65s → 0.49s → 6.97s → 0.46s → 6.79s
         * 而只做 `ping` 的 `/api/health` 连续 20 次**全部**是 0.25~0.30s。
         *
         * 差别在于：ping 走驱动的 SDAM 心跳连接，**不经过连接池**；
         * 其它所有查询都要从池里取连接。于是结论只有一个 ——
         * 池里存在"驱动以为还活着、实际已被中间设备掐断"的连接，
         * 取到它的那次请求要等超时 + 重连，实测约 6.6 秒。
         *
         * 掐断来自哪里？容器（美东）到 Atlas（asia）是一条跨区链路，
         * 中间要经过出网 NAT 与 Atlas 侧的负载均衡，两者都有空闲连接超时。
         * 而驱动默认 `maxIdleTimeMS = 0`（永不主动回收），
         * 于是只能等到"用的时候才发现是坏的"。
         *
         * ── 为什么是 45 秒 ──
         * 上游设备的空闲超时我们查不到，也控制不了。
         * 取 45 秒的思路是"**在它掐断之前，我自己先换掉**"：
         *   · 够长，正常访问间隙不会频繁重建连接（跨区握手不便宜）；
         *   · 够短，短于绝大多数 LB / NAT 的空闲超时（常见 60s~350s）。
         * 换掉一条连接的代价是几百毫秒握手，
         * 而用错一条死连接的代价是 6.6 秒 —— 这个交换非常划算。
         */
        maxIdleTimeMS: 45_000,

        /**
         * 等待空闲连接的最长时间。
         *
         * 默认 0 = **无限等待**。池里 5 条连接全被慢查询占住时，
         * 后续请求会无声地排进队列，表现成"接口突然集体变慢但没人报错"。
         * 给 5 秒上限：宁可快速失败并留下一条明确日志，
         * 也不要让请求在一个看不见的队列里排队。
         */
        waitQueueTimeoutMS: 5000,

        /**
         * 断线自动重连。
         *
         * Atlas 的免费集群偶尔会抖一下。没有自动重连时，
         * 一次网络抖动会让后端彻底失去数据库连接，
         * 表现成"网站突然所有接口都 500"，而你会以为是代码问题。
         *
         * ⚠️ `retryDelay` 原为 3000 —— 它与实测到的 6.6 秒尖峰高度吻合
         *    （两次重试各等 3 秒）。收到 500 之后，即使真的要重连，
         *    代价也从 6 秒级降到毫秒级；而"重试 4 次"比"重试 5 次"
         *    少一次机会去掩盖真正的配置错误。
         */
        retryAttempts: 4,
        retryDelay: 500,
      }),
    }),

    /**
     * 健康检查的指示器体系。
     *
     * 只有 import 了它，HealthController 才能注入 HealthCheckService
     * 与 MongooseHealthIndicator。详见 modules/health/health.controller.ts。
     */
    TerminusModule,

    /**
     * 限流。
     *
     * 这里只声明**默认档位**，真正的启用发生在具体控制器/方法上
     * （`@UseGuards(ThrottlerGuard)` + `@Throttle()`）。
     *
     * 为什么刻意不做成全局守卫？因为只读接口（列表、详情）不该消耗配额——
     * 否则一个正常浏览的用户就可能把自己挡在门外，
     * 而我们要拦的是"暴力请求注册与登录"这类针对性滥用。
     *
     * ⚠️ `ttl` 的单位是**毫秒**（v5 起），60000 = 1 分钟。
     *    旧版本是秒，复制网上的写法很容易在这里踩坑。
     */
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', limit: 30, ttl: 60_000 }],
      errorMessage: '请求过于频繁，请稍后再试',
    }),

    PostsModule,
    /**
     * 用户模块与认证模块。
     *
     * 注意 AuthModule 内部已经 import 了 UsersModule ——
     * 这里不需要再单独引入 UsersModule（除非别的模块也要直接用 UsersService）。
     * 重复引入不会报错，但会让依赖关系看起来比实际更复杂。
     */
    UsersModule,
    AuthModule,
    /**
     * 互动模块。
     *
     * 注意这两个模块都 `imports: [PostsModule]` —— 它们要用 PostsService
     * 来调整帖子上的计数字段。而**订单无关**的一点是：
     * 它们并不需要在这里再写一次 PostsModule，因为模块是被各自引用的。
     * 只有"当前模块自己想直接用"才需要出现在 imports 里。
     */
    CommentsModule,
    LikesModule,
    /**
     * AI 模块。它本身没有依赖，被 PostsModule 引用用于发帖后的摘要生成。
     * 在这里注册一次即可，其它模块通过 imports AiModule 使用它。
     */
    AiModule,
    /**
     * GitHub 热门项目榜。
     * 它自己带缓存 Model，不依赖其它业务模块，与其它模块也没有交集。
     */
    GithubModule,
    /**
     * 每日 GitHub 项目报道。
     *
     * 它单向依赖 github（候选池）/ ai（写稿）/ posts（发帖）/ users（机器人账号），
     * 没有任何模块依赖它 —— 所以把它整个删掉，或者它运行时全程报错，
     * 都不会影响用户发帖、评论、登录中的任何一条路径。
     */
    DailyDigestModule,
    /**
     * 学习路线进度（云同步）。
     * 只依赖 users 的 ObjectId 与全局 JWT 鉴权，与其它业务模块零交集。
     */
    RoadmapModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
