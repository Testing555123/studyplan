import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { RoadmapUserProgress, RoadmapUserProgressSchema } from './schemas/roadmap-progress.schema'
import { RoadmapProgressController } from './roadmap-progress.controller'
import { RoadmapProgressService } from './roadmap-progress.service'

/**
 * 学习路线进度模块（云同步）。
 *
 * 与业务模块零依赖：它不碰 posts/comments/ai，只依赖 users 的
 * ObjectId 引用与全局的 JwtAuthGuard —— 整块删掉不影响任何其它链路。
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: RoadmapUserProgress.name, schema: RoadmapUserProgressSchema }]),
  ],
  controllers: [RoadmapProgressController],
  providers: [RoadmapProgressService],
  exports: [RoadmapProgressService],
})
export class RoadmapModule {}
