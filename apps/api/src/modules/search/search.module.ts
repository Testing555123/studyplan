import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AiModule } from '../ai/ai.module'
import { Post, PostSchema } from '../posts/schemas/post.schema'
import { EmbeddingService } from './embedding.service'
import { SearchController } from './search.controller'
import { SearchService } from './search.service'
import { PostEmbedding, PostEmbeddingSchema } from './schemas/post-embedding.schema'
import { VectorStoreService } from './vector-store.service'

/**
 * 语义搜索模块。依赖方向：posts → search → ai，单向。
 *
 * 这里重复 forFeature 注册了 PostsModule 的 Post schema ——
 * 为的是直接对 posts 集合做 $in 读，避免 import PostsModule 造成
 * posts ↔ search 的循环依赖（那个循环的正解是 forwardRef，
 * 而 forwardRef 在本项目里是「边界划错了」的信号，禁止引入）。
 * 同一个 schema 定义注册两次得到的是等价的 Model，没有第二份事实来源。
 */
@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: PostEmbedding.name, schema: PostEmbeddingSchema },
      { name: Post.name, schema: PostSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [VectorStoreService, EmbeddingService, SearchService],
  exports: [EmbeddingService, SearchService],
})
export class SearchModule {}
