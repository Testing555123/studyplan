import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types, isValidObjectId } from 'mongoose'
import type { LikeResult } from '@studyplan/shared'
import { isDuplicateKeyError } from '../../common/utils/mongo-errors'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { PostsService } from '../posts/posts.service'
import { Like } from './schemas/like.schema'

/**
 * 点赞服务。
 *
 * ── 为什么接口设计成 `like` / `unlike` 两个方法，而不是一个 `toggle`？ ──
 *
 * 因为 **toggle 不是幂等操作**。
 *
 * 假设用 `POST /like` 做切换：
 *   - 用户手抖点了两次 → 点赞又被取消了；
 *   - 网络超时后客户端重试一次 → 同样把刚点的赞取消了；
 *   - 任何"重放"行为都会翻转结果。
 *
 * 而 `PUT /like`（点赞）和 `DELETE /like`（取消）是**幂等**的：
 * 调用一次和调用十次，结果完全一样。重试是安全的。
 *
 * > 一个判断标准：**这个操作重复执行一次，结果会变吗？**
 * > 会变 → 不该用可重试的语义表达它。
 *
 * 前端因此需要知道自己想达成什么状态（而不是"切换一下"），
 * 这反而让交互逻辑更清晰：乐观更新时它本来就是知道目标状态的。
 */
@Injectable()
export class LikesService {
  private readonly logger = new Logger(LikesService.name)

  constructor(
    @InjectModel(Like.name)
    private readonly likeModel: Model<Like>,
    private readonly postsService: PostsService,
  ) {}

  /**
   * 点赞。
   *
   * 注意这里**没有"先查有没有赞过"这一步**。
   * 直接插入，让唯一索引来裁决 —— 这正是复合唯一索引存在的意义：
   * 把"不能重复点赞"这条业务规则下沉到数据库，
   * 应用层不需要（也做不到）用"查一次再插入"来保证它。
   */
  async like(postId: string, actor: AuthenticatedUser): Promise<LikeResult> {
    await this.ensurePostExists(postId)
    const userId = this.assertValidUserId(actor.id)

    try {
      await this.likeModel.create({
        postId: new Types.ObjectId(postId),
        userId,
      })
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error

      /**
       * 唯一索引冲突 = 这个人已经赞过了。
       *
       * 这是一个**成功的幂等结果**，不是错误 ——
       * 用户想要的状态（已点赞）已经达成了。
       * 所以返回 200 而不是 409，且**不重复增加计数**。
       *
       * 如果这里也去 `$inc`，快速连点就会把计数点出天际。
       */
      const counters = await this.postsService.getCounters(postId)
      return { liked: true, likeCount: counters?.likeCount ?? 0 }
    }

    const likeCount = await this.postsService.incrementLikeCount(postId, 1)
    this.logger.log(`点赞：帖子 ${postId} ← ${actor.username}`)

    return { liked: true, likeCount: likeCount ?? 0 }
  }

  /** 取消点赞（同样幂等：没赞过也返回成功） */
  async unlike(postId: string, actor: AuthenticatedUser): Promise<LikeResult> {
    await this.ensurePostExists(postId)
    const userId = this.assertValidUserId(actor.id)

    const result = await this.likeModel
      .deleteOne({ postId: new Types.ObjectId(postId), userId })
      .exec()

    if (result.deletedCount === 0) {
      // 本来就没赞过 —— 目标状态（未点赞）已经达成，不重复减计数
      const counters = await this.postsService.getCounters(postId)
      return { liked: false, likeCount: counters?.likeCount ?? 0 }
    }

    const likeCount = await this.postsService.incrementLikeCount(postId, -1)
    this.logger.log(`取消点赞：帖子 ${postId} ← ${actor.username}`)

    return { liked: false, likeCount: likeCount ?? 0 }
  }

  /**
   * 删除某篇帖子的**全部**点赞，返回删除条数。
   *
   * 和评论那边同构：系统级清理，**不看是谁点的赞**，
   * 所以只该由内部流程调用，不要挂到任何 HTTP 端点上。
   *
   * 同样**不调整 `likeCount`**：唯一的调用场景是整篇帖子被撤回，
   * 帖子马上就没了，`$inc` 一个即将消失的计数字段没有意义。
   * 将来若有别的场景复用（比如删帖子但保留数据），必须在这里补上。
   */
  async deleteByPost(postId: string): Promise<number> {
    const result = await this.likeModel.deleteMany({ postId: new Types.ObjectId(postId) }).exec()

    if (result.deletedCount > 0) {
      this.logger.log(`删除帖子 ${postId} 的全部点赞，共 ${result.deletedCount} 条`)
    }

    return result.deletedCount
  }

  private async ensurePostExists(postId: string): Promise<void> {
    if (!isValidObjectId(postId)) {
      throw new NotFoundException(`找不到 id 为 ${postId} 的帖子`)
    }
    const exists = await this.postsService.exists(postId)
    if (!exists) {
      throw new NotFoundException(`找不到 id 为 ${postId} 的帖子`)
    }
  }

  /**
   * actor.id 来自已验签的 JWT，理论上一定是合法 ObjectId。
   * 但 `new Types.ObjectId(非法串)` 会抛异常（500），
   * 所以这里挡一道，把它变成 401 —— 那才是"你的凭证有问题"的正确语义。
   */
  private assertValidUserId(userId: string): Types.ObjectId {
    if (!isValidObjectId(userId)) {
      throw new NotFoundException('当前登录用户不存在')
    }
    return new Types.ObjectId(userId)
  }
}
