import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types, isValidObjectId } from 'mongoose'
import type { Comment as CommentContract, CommentListResponse } from '@studyplan/shared'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { PostsService } from '../posts/posts.service'
import { Comment } from './schemas/comment.schema'
import { CommentLean, toCommentContract } from './comments.mapper'
import type { CreateCommentDto } from './dto/create-comment.dto'

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name)

  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<Comment>,
    /**
     * 注入**另一个模块的 Service**。
     *
     * 这要求 PostsModule 把 PostsService 放进 `exports` 数组里 ——
     * 否则这里会注入失败（报错是"依赖无法解析"，不会告诉你少了 exports）。
     *
     * 为什么用 PostsService 而不是直接注入 Post 这个 Model？
     *   因为那样评论模块就"知道"了帖子文档的结构。
     *   将来帖子加一个字段、改一次计数字段名，评论模块也得跟着改。
     *   通过 Service 交互，两边只共享"调整计数"这一个语义明确的接口。
     */
    private readonly postsService: PostsService,
  ) {}

  /** 取某篇帖子的全部评论（按时间正序，最早的在前） */
  async findByPost(postId: string): Promise<CommentListResponse> {
    this.assertValidPostId(postId)

    const docs = await this.commentModel
      .find({ postId: new Types.ObjectId(postId) })
      .sort({ createdAt: 1 })
      .lean()
      .exec()

    return {
      items: (docs as unknown as CommentLean[]).map(toCommentContract),
      total: docs.length,
    }
  }

  /**
   * 发表评论。
   *
   * 三步：校验帖子存在 → 写入评论 → 原子增加帖子的评论计数。
   *
   * ⚠️ 这三步**不是原子**的。如果第 3 步失败，评论已经写进去了，
   *    但计数没涨 —— 数据会不一致。
   *    彻底解决需要数据库事务（MongoDB 的副本集支持，
   *    Atlas M0 也支持）。本项目没用事务，理由是：
   *      - 计数是**展示用的派生数据**，偶发偏差不影响业务正确性；
   *      - 引入事务会给这个教学项目增加一层不必要的心智负担。
   *    **但你要知道这个缺口在哪**，以及生产环境下该怎么补。
   */
  async create(
    postId: string,
    dto: CreateCommentDto,
    actor: AuthenticatedUser,
  ): Promise<CommentContract> {
    this.assertValidPostId(postId)

    const postExists = await this.postsService.exists(postId)
    if (!postExists) {
      throw new NotFoundException(`找不到 id 为 ${postId} 的帖子`)
    }

    const created = await this.commentModel.create({
      postId: new Types.ObjectId(postId),
      content: dto.content.trim(),
      author: { id: actor.id, username: actor.username },
    })

    await this.postsService.incrementCommentCount(postId, 1)

    this.logger.log(`新增评论 ${String(created._id)} → 帖子 ${postId}`)

    return toCommentContract(created.toObject() as unknown as CommentLean)
  }

  /**
   * 删除评论（只能删自己的）。
   *
   * 权限条件同样直接写进查询：`{ _id, 'author.id': actor.id }`。
   * 这样"是不是我的"由数据库在一次操作里裁决，不存在
   * "检查通过之后、删除之前权限被改掉"的窗口。
   */
  async remove(commentId: string, actor: AuthenticatedUser): Promise<void> {
    if (!isValidObjectId(commentId)) {
      throw new NotFoundException(`找不到 id 为 ${commentId} 的评论`)
    }

    const deleted = await this.commentModel
      .findOneAndDelete({ _id: commentId, 'author.id': actor.id })
      .lean()
      .exec()

    if (!deleted) {
      // 区分"不存在"和"不是你的"，理由与帖子模块一致
      const exists = await this.commentModel.exists({ _id: commentId })
      throw exists
        ? new ForbiddenException('只能删除自己发表的评论')
        : new NotFoundException(`找不到 id 为 ${commentId} 的评论`)
    }

    // 删成功了才减计数，所以正常情况下不会减到负数
    // （PostsService 里还有 $max: [0, ...] 兜底）
    await this.postsService.incrementCommentCount(String(deleted.postId), -1)

    this.logger.log(`删除评论 ${commentId}（操作者 ${actor.username}）`)
  }

  /**
   * 删除某篇帖子的**全部**评论，返回删除条数。
   *
   * 与 `remove` 的关键区别：它**不看作者**。调用它的是系统级清理
   * （目前只有"撤回每日报道"一处），不是用户操作，所以不存在
   * "只能删自己的"这回事。也正因为它放开了权限，**不要把它接到任何
   * HTTP 端点上** —— 那等于给所有人一个批量删评论的接口。
   *
   * 它**不调整帖子的 `commentCount`**：目前唯一的调用场景里，
   * 帖子本身紧接着就被删掉了，去 `$inc` 一个即将消失的字段没有意义。
   * 将来若有"只删评论、留着帖子"的场景，这里必须补上计数调整。
   *
   * 不在这里校验 `postId` 的合法性：调用方传的是刚从数据库读出来的 id。
   * 为一种不可能发生的情况加一个分支，只会让撤回路径多一条要维护的岔路。
   */
  async deleteByPost(postId: string): Promise<number> {
    const result = await this.commentModel
      .deleteMany({ postId: new Types.ObjectId(postId) })
      .exec()

    if (result.deletedCount > 0) {
      this.logger.log(`删除帖子 ${postId} 的全部评论，共 ${result.deletedCount} 条`)
    }

    return result.deletedCount
  }

  /**
   * 校验 postId 是不是合法的 ObjectId。
   *
   * 不校验的话，`new Types.ObjectId('abc')` 会抛异常 ——
   * 那是个 500，把客户端的输入问题伪装成了服务端故障。
   */
  private assertValidPostId(postId: string): void {
    if (!isValidObjectId(postId)) {
      throw new NotFoundException(`找不到 id 为 ${postId} 的帖子`)
    }
  }
}
