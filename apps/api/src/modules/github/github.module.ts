import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { GithubClient } from './github.client'
import { GithubController } from './github.controller'
import { GithubService } from './github.service'
import { TrendingCache, TrendingCacheSchema } from './schemas/trending-cache.schema'

/**
 * GitHub 模块。
 *
 * `MongooseModule.forFeature` 把 `TrendingCache` 这个 Model 注册进来，
 * 只在本模块可见 —— 它强制你回答"这个模块到底需要哪几个 Model"。
 *
 * `exports: [GithubService]` 是为将来的 AI 模块准备的：
 * 问 AI"这个项目值不值得学"时，需要拿到榜单里的项目上下文。
 * 模块**只有导出之后**，别的模块才能 import 它拿到里面的 provider ——
 * 这是 NestJS 里最容易被忽略、也最容易导致"注入不到"报错的一条规则。
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: TrendingCache.name, schema: TrendingCacheSchema }]),
  ],
  controllers: [GithubController],
  providers: [GithubService, GithubClient],
  exports: [GithubService],
})
export class GithubModule {}
