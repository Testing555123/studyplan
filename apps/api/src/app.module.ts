import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { validateEnv } from './config/env.validation'
import { AiModule } from './modules/ai/ai.module'
import { AuthModule } from './modules/auth/auth.module'
import { CommentsModule } from './modules/comments/comments.module'
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
