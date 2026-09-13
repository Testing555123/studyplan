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
         * 默认值是 30 秒。如果连接串写错了（比如密码里有个特殊字符没转义），
         * 你会对着一个"卡住不动的终端"等半分钟，然后看到一句很模糊的报错。
         * 收紧到 8 秒，失败得快一点，排查也快一点。
         */
        serverSelectionTimeoutMS: 8000,

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
         * 断线自动重连。
         *
         * Atlas 的免费集群偶尔会抖一下。没有自动重连时，
         * 一次网络抖动会让后端彻底失去数据库连接，
         * 表现成"网站突然所有接口都 500"，而你会以为是代码问题。
         */
        retryAttempts: 5,
        retryDelay: 3000,
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
