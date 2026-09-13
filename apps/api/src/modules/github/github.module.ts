import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AiModule } from '../ai/ai.module'
import { GithubClient } from './github.client'
import { GithubController } from './github.controller'
import { GithubService } from './github.service'
import { RepoDetailService } from './github-detail.service'
import { RepoIntroService } from './repo-intro.service'
import { RepoIntroDoc, RepoIntroSchema } from './schemas/repo-intro.schema'
import { RepoSnapshotDoc, RepoSnapshotSchema } from './schemas/repo-snapshot.schema'
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
    MongooseModule.forFeature([
      { name: TrendingCache.name, schema: TrendingCacheSchema },
      { name: RepoIntroDoc.name, schema: RepoIntroSchema },
      { name: RepoSnapshotDoc.name, schema: RepoSnapshotSchema },
    ]),
    /**
     * 项目简介要用 AI 生成，所以这里引入 AiModule。
     *
     * 依赖方向是单向的 `github → ai`：AiModule 不认识"仓库"这个概念，
     * 它只提供"给文本、还我文本"和"能不能用一次额度"。
     * 这个方向不会形成环（AiModule 不依赖任何业务模块）。
     */
    AiModule,
  ],
  controllers: [GithubController],
  providers: [GithubService, GithubClient, RepoDetailService, RepoIntroService],
  //
  // `GithubClient` 一并导出：榜单走 `GithubService`（带缓存），
  // 而"每日报道"抓 README 是一次性的、不需要缓存的调用，直接用客户端更合适。
  exports: [GithubService, GithubClient],
})
export class GithubModule {}
