import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types, isValidObjectId } from 'mongoose'
import {
  ROADMAP_STAGES,
  ROADMAP_VERSION,
  computeRoadmapProgress,
  isKnownCourseId,
} from '@studyplan/shared'
import type { CourseStatus, RoadmapOverrides, RoadmapProgressResponse } from '@studyplan/shared'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { RoadmapUserProgress } from './schemas/roadmap-progress.schema'

/**
 * 学习路线进度服务（云同步）。
 *
 * ── 接口语义为什么全部是"幂等"的？ ──
 *
 * 和点赞模块同一个思路（见 likes.service.ts 的说明）：
 *   · PUT 设置状态 —— 表达目标状态，重试安全；
 *   · DELETE 重置 —— "这条记录不该存在"，删过一次和删十次结果一样。
 * 没有任何"切换/自增"类动作，任何一步重放都不会让数据漂移。
 *
 * ── 为什么每个写接口都返回**全量**最新结果？ ──
 *
 * 前端拿返回值可直接覆盖本地状态（含服务端时间戳），
 * 多设备并发时以服务端为准收敛 —— 和点赞返回真实计数同理。
 *
 * ── 服务端信任边界 ──
 *
 * userId 只取自已验签的 JWT；courseId 用 shared 的白名单裁决
 * （路线内容的真相在共享契约，不在数据库）；status 由 DTO 的
 * @IsIn 枚举拦截。三道关口之外，这个服务不信任任何输入。
 */
@Injectable()
export class RoadmapProgressService {
  private readonly logger = new Logger(RoadmapProgressService.name)

  constructor(
    @InjectModel(RoadmapUserProgress.name)
    private readonly progressModel: Model<RoadmapUserProgress>,
  ) {}

  /** 我的覆盖层 + 服务端算好的全量聚合（算法来自 shared，前后端同口径） */
  async getProgress(actor: AuthenticatedUser): Promise<RoadmapProgressResponse> {
    const userId = this.assertValidUserId(actor.id)
    const doc = await this.progressModel.findOne({ userId }).exec()
    const steps: RoadmapOverrides = (doc?.steps ?? {}) as RoadmapOverrides

    return {
      steps,
      progress: computeRoadmapProgress(ROADMAP_STAGES, steps),
    }
  }

  /**
   * 设置某个节点的学习状态（幂等 upsert）。
   *
   * 用一条 `findOneAndUpdate + $set steps.<courseId>` 完成，
   * 不"先查后改"：单文档单字段的原地更新本身就原子，
   * 且唯一索引保证不会出现"同一用户两份文档"。
   */
  async setStatus(
    courseId: string,
    status: CourseStatus,
    actor: AuthenticatedUser,
  ): Promise<RoadmapProgressResponse> {
    const userId = this.assertValidUserId(actor.id)
    this.ensureCourseExists(courseId)

    await this.progressModel
      .findOneAndUpdate(
        { userId },
        {
          $set: {
            [`steps.${courseId}`]: { status, updatedAt: new Date().toISOString() },
            roadmapVersion: ROADMAP_VERSION,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec()

    this.logger.log(`路线进度：用户 ${actor.username} 将 ${courseId} 标记为 ${status}`)
    return this.getProgress(actor)
  }

  /** 单节点恢复官方默认 = 从覆盖层里删掉这条（幂等：不存在也算成功） */
  async resetCourse(courseId: string, actor: AuthenticatedUser): Promise<RoadmapProgressResponse> {
    const userId = this.assertValidUserId(actor.id)
    this.ensureCourseExists(courseId)

    await this.progressModel
      .updateOne({ userId }, { $unset: { [`steps.${courseId}`]: '' } })
      .exec()

    return this.getProgress(actor)
  }

  /** 清空全部个人进度（幂等：没有记录时 deleteOne 也是 0 删除） */
  async resetAll(actor: AuthenticatedUser): Promise<RoadmapProgressResponse> {
    const userId = this.assertValidUserId(actor.id)
    await this.progressModel.deleteOne({ userId }).exec()
    this.logger.log(`路线进度：用户 ${actor.username} 重置了全部进度`)

    return {
      steps: {},
      progress: computeRoadmapProgress(ROADMAP_STAGES),
    }
  }

  /** courseId 不在路线里 → 404（"标记一个不存在的学习节点"和"访问不存在的资源"同义） */
  private ensureCourseExists(courseId: string): void {
    if (!isKnownCourseId(courseId)) {
      throw new NotFoundException(`找不到 id 为 ${courseId} 的学习节点`)
    }
  }

  /** 与 likes.service 同款的凭证兜底：理论上验签后的 id 一定合法，但仍要挡成 401 语义而不是 500 */
  private assertValidUserId(userId: string): Types.ObjectId {
    if (!isValidObjectId(userId)) {
      throw new NotFoundException('当前登录用户不存在')
    }
    return new Types.ObjectId(userId)
  }
}
