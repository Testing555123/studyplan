import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, isValidObjectId } from 'mongoose'
import type { Post as PostContract, PostListResponse } from '@studyplan/shared'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { AiService } from '../ai/ai.service'
import { Post } from './schemas/post.schema'
import { PostLean, toPostContract } from './posts.mapper'
import { CreatePostDto } from './dto/create-post.dto'
import { UpdatePostDto } from './dto/update-post.dto'
import { QueryPostsDto } from './dto/query-posts.dto'

/**
 * 帖子业务逻辑。
 *
 * 分层职责（这是 NestJS 最核心的约定，值得背下来）：
 *   Controller —— 只做"解析请求、调用 service、返回结果"，不写业务判断
 *   Service    —— 业务规则与数据访问都在这里，**它不知道 HTTP 的存在**
 *   Model      —— 只负责和数据库对话
 *
 * 为什么 Service 不该碰 HTTP？
 *   因为它要能被复用和测试。如果 Service 里出现 `@Req()` 或
 *   `HttpException`，它就只能被 HTTP 触发，单测也必须伪造一个请求对象。
 *   本项目里的 Service 是纯 TypeScript 类，单测直接 new 出来就能跑。
 */
@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name)

  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    /**
     * AI 增强服务。
     *
     * 依赖方向是单向的：posts → ai。
     * AiService 不知道帖子的存在，回填落库由本类负责 ——
     * 这样两个模块之间不会形成循环依赖（详见 ai.module.ts 的注释）。
     */
    private readonly aiService: AiService,
  ) {}

  /**
   * 分页查询帖子列表。
   *
   * 三个性能相关的决策都在这一个方法里，值得逐条理解：
   *
   * 1. **并行执行 count 与 find**（`Promise.all`）。
   *    两者互不依赖，串行执行等于白白多等一个往返。
   *
   * 2. **`.lean()`**。不加它，Mongoose 会把每条记录包装成
   *    带 `save()` / `validate()` 等方法的文档实例，内存与 CPU 开销显著更高。
   *    列表是只读场景，用不到那些方法。
   *
   * 3. **`skip` + `limit` 而不是把全部数据取回来在内存里切**。
   *    数据量小的时候两种写法没区别，数据量一大就是"能用"和"不能用"的差别。
   *    （顺带说一个未来会遇到的坑：`skip` 在很深的页码上会变慢，
   *     因为数据库仍要扫描并丢弃前面所有文档。到时候的解法是游标分页，
   *     但那属于这个项目规模之外的问题。）
   */
  async findAll(query: QueryPostsDto): Promise<PostListResponse> {
    const { page, pageSize, tag } = query

    // 数组字段用标量去匹配，语义是"数组里包含这个值"，
    // 这正是我们要的"筛选带该标签的帖子"。
    //
    // 这里**故意不显式标注筛选条件的类型**。
    // 原因是一个真实的踩坑：Mongoose 8 里那个 `FilterQuery<T>` 类型，
    // 在 Mongoose 9 中已被彻底移除（全部类型声明文件里都搜不到了），
    // 照旧写 `import { FilterQuery } from 'mongoose'` 会直接编译失败。
    //
    // 而 `find()` 的入参类型本来就能从调用处自动推断，
    // 显式标注在最简单的情况下只会引入一个必须随库版本变动的名字。
    // 一般原则：**能用推断就别写注解；只有当推断不出来时才手写。**
    const filter = tag ? { tags: tag } : {}

    const [docs, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.postModel.countDocuments(filter).exec(),
    ])

    return {
      // lean() 的静态类型是 Mongoose 的 FlattenMaps 包装，
      // 与我们的读取形状等价但 TS 不认识，因此显式断言。
      // 断言的安全性由 toPostContract 内部的逐字段读取来保证。
      items: (docs as unknown as PostLean[]).map(toPostContract),
      total,
      page,
      pageSize,
    }
  }

  /** 按 id 查询单篇帖子 */
  async findOne(id: string): Promise<PostContract> {
    this.assertValidId(id)

    const doc = await this.postModel.findById(id).lean().exec()

    if (!doc) {
      throw new NotFoundException(`找不到 id 为 ${id} 的帖子`)
    }

    return toPostContract(doc as unknown as PostLean)
  }

  /**
   * 创建帖子。
   *
   * 作者来自 `actor` —— 而它不是从请求体里读的，
   * 是从**已通过签名校验的 JWT** 里解析出来的（见 JwtStrategy）。
   * 这就是"身份必须由服务端认定"这条原则在代码里的样子。
   */
  async create(dto: CreatePostDto, actor: AuthenticatedUser): Promise<PostContract> {
    const created = await this.postModel.create({
      title: dto.title,
      content: dto.content,
      tags: dto.tags,
      author: { id: actor.id, username: actor.username },
    })

    this.logger.log(`帖子已创建：${String(created._id)}（作者 ${actor.username}）`)

    // create() 返回 Mongoose 文档（带实例方法），
    // 而 mapper 只认纯对象，所以显式转一次。
    const contract = toPostContract(created.toObject() as unknown as PostLean)

    /**
     * ── 触发 AI 增强，注意**没有 await** ──
     *
     * 这是整个阶段 7 最关键的一行设计。
     *
     * 如果写成 `await this.enrichWithAi(...)`，会发生三件坏事：
     *   1. 用户点"发布"之后要**等模型想完**才跳转 —— 通常 2-5 秒，
     *      慢的时候十几秒。而这跟他的目标（把文章发出去）毫无关系；
     *   2. 模型服务慢，用户就得一直等；模型服务挂了，用户就发不出文章；
     *   3. API Key 失效、限流、网络抖动，全都变成了"发帖失败"。
     *
     * **一句话：await 一下，AI 就从"增强功能"变成了"核心链路的单点故障"。**
     *
     * 不 await 之后，用户立刻拿到响应，摘要在一两秒后悄悄出现在
     * 详情页上（需要刷新才能看到，这是这个方案的代价，见笔记里的说明）。
     *
     * 用一个 `void` 明确表达"我故意不等它"，比偷偷省略 await 好 ——
     * 后者会被 lint 规则警告，也会让读代码的人以为你忘了。
     */
    void this.enrichWithAi(contract.id, dto.title, dto.content)

    return contract
  }

  /**
   * AI 增强（旁路）：生成摘要与推荐标签，回填到帖子上。
   *
   * 这个方法**保证不会抛异常**。三层保险：
   *   1. `aiService.generatePostMeta` 自己已经把所有失败转成了 null；
   *   2. 这里再包一层 try/catch，兜住"回填落库"可能出现的数据库错误；
   *   3. 整体不 await，所以即使它真的抛了，也已经脱离了请求链路 ——
   *      但那样会变成一个未处理的 Promise 拒绝，可能让进程告警甚至退出，
   *      所以第 2 层不能省。
   *
   * > 旁路代码的纪律：**它的失败绝不能影响到它旁边的主链路。**
   */
  private async enrichWithAi(postId: string, title: string, content: string): Promise<void> {
    if (!this.aiService.enabled) return

    try {
      const meta = await this.aiService.generatePostMeta({ title, content })
      if (!meta) return

      await this.postModel
        .updateOne({ _id: postId }, { $set: { summary: meta.summary, aiTags: meta.tags } })
        .exec()

      this.logger.log(`AI 元数据已回填：${postId}`)
    } catch (error) {
      // 这里只记日志、不抛出、不重试。
      // 最坏结果是"这篇没有摘要"，而用户在意的文章已经发布成功了。
      this.logger.warn(
        `AI 元数据回填失败（帖子 ${postId}）：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /** 更新帖子（只更新传进来的字段，且只能改自己的） */
  async update(id: string, dto: UpdatePostDto, actor: AuthenticatedUser): Promise<PostContract> {
    this.assertValidId(id)

    /**
     * 过滤掉值为 undefined 的字段。
     *
     * 为什么必须做？因为 `$set: { title: undefined }` 在 MongoDB 里
     * 是"把 title 设成 undefined"，而不是"不要动 title"。
     * 客户端只想改标题、没传 content 时，这一步决定了 content 会不会被清空。
     */
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    )

    if (Object.keys(patch).length === 0) {
      // 没有可更新字段：先确认真实存在且属于自己，再返回当前状态
      const current = await this.findOne(id)
      if (current.author.id !== actor.id) {
        throw new ForbiddenException('只能修改自己发布的文章')
      }
      return current
    }

    /**
     * 注意这里把"是不是自己的帖子"直接写进了**查询条件**，
     * 而不是"先查出来、判断、再更新"。
     *
     * 这样做有两个好处：
     *   1. 少一次数据库往返（happy path 只有一个查询）；
     *   2. 避免了 TOCTOU（检查时与使用时不一致）的竞态 ——
     *      理论上两步之间别人可能把作者改掉。
     *
     * 能用一个查询表达的条件，就不要拆成两步。
     */
    const updated = await this.postModel
      .findOneAndUpdate(
        { _id: id, 'author.id': actor.id },
        { $set: patch },
        {
          /**
           * 返回更新后的文档，而不是更新前的。
           *
           * ⚠️ Mongoose 9 弃用了 `new: true`（同时它也是"最容易被误读成
           * '新建文档'的选项名"），改用语义明确的 `returnDocument: 'after'`。
           * 两者行为等价，但新写法不会有弃用警告，也不会在未来大版本里消失。
           */
          returnDocument: 'after',
          /**
           * ⚠️ 极易踩的坑：findOneAndUpdate 默认**不执行** Schema 校验！
           * 跳过 DTO 校验（或将来某个内部调用）时，
           * 可以把 title 写成一个超长字符串而数据库毫不阻拦。
           * 必须显式打开 runValidators。
           */
          runValidators: true,
        },
      )
      .lean()
      .exec()

    if (!updated) {
      /**
       * 查不到有两种可能：不存在，或者不是你的。
       * 必须再查一次把它区分开 —— 因为 404 和 403 对调用方
       * 意味着完全不同的事情（"没有这个资源" vs "你不被允许"）。
       *
       * 顺带说一个安全上的取舍：把"别人的帖子"也返回 404
       * 能更好地隐藏资源是否存在（更保守）。
       * 本项目选择返回 403，因为它在学习项目里更直观、
       * 也更容易让人理解"权限"这个概念确实生效了。
       */
      const exists = await this.postModel.exists({ _id: id })
      throw exists
        ? new ForbiddenException('只能修改自己发布的文章')
        : new NotFoundException(`找不到 id 为 ${id} 的帖子`)
    }

    return toPostContract(updated as unknown as PostLean)
  }

  /** 删除帖子（只能删自己的；阶段 6 会在这里级联删除它的评论） */
  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    this.assertValidId(id)

    // 同 update：把权限条件放进查询本身
    const deleted = await this.postModel
      .findOneAndDelete({ _id: id, 'author.id': actor.id })
      .lean()
      .exec()

    if (!deleted) {
      const exists = await this.postModel.exists({ _id: id })
      throw exists
        ? new ForbiddenException('只能删除自己发布的文章')
        : new NotFoundException(`找不到 id 为 ${id} 的帖子`)
    }

    this.logger.log(`帖子已删除：${id}（操作者 ${actor.username}）`)
  }

  /**
   * 原子调整计数字段（点赞数 / 评论数）。
   *
   * ── 为什么需要它？这是本项目第一个真正的并发问题。 ──
   *
   * 直觉写法是这样的：
   *   ```ts
   *   post.likeCount = post.likeCount + 1
   *   await post.save()
   *   ```
   * 这是典型的"**读 → 改 → 写**"三步结构，而它有一个致命窗口：
   * 两个人同时读到 `10`，各自加 1 写回 `11` ——
   * 两次点赞，计数只涨了 1。
   *
   * 正确做法是让**数据库**来做这个加法，中间不给别人插队的机会：
   *   ```ts
   *   { $inc: { likeCount: 1 } }
   *   ```
   *
   * ── 为什么这里用聚合管道而不是简单的 $inc？ ──
   *
   * 因为取消点赞时要 `-1`，而 `$inc: -1` 在计数已经是 0 时会把它
   * 变成 **-1**。一个"-1 个赞"的界面比少一个赞难看得多，
   * 而且它会一直留在数据库里。
   *
   * 聚合管道里可以写 `$max: [0, ...]` 来兜底：
   *   `[ { $set: { [field]: { $max: [0, { $add: [`$${field}`, delta] }] } } } ]`
   *
   * 一句话：**$inc 保证不丢更新，$max 保证不出负数。**
   *
   * ── ⚠️ 一个真实的坑：Mongoose 9 要求显式声明 updatePipeline ──
   *
   * 上面那种"数组形式的更新"叫**聚合管道更新**（aggregation pipeline update），
   * 它的能力比 `$inc` 强（可以引用旧值、做条件运算），但也更危险 ——
   * 写错了会静默改坏数据。
   *
   * Mongoose 8 之前，传数组就自动当成管道；**从 9 开始改成了必须显式开启**，
   * 否则直接抛：
   *   `Cannot pass an array to query updates unless the 'updatePipeline' option is set.`
   *
   * 这个坑值得单独记一笔，因为**单元测试抓不到它**：
   * 单测里 `postModel` 是替身，替身不会去校验"更新语句的形状合不合法"。
   * 只有真实连上 MongoDB 才会暴露 —— 也就是只有集成测试 / E2E 能抓到。
   * 这正是阶段 8 存在的意义：**mock 证明逻辑对，E2E 证明连起来能用。**
   *
   * @returns 调整后的计数；帖子不存在时返回 null
   */
  private async adjustCounter(
    postId: string,
    field: 'likeCount' | 'commentCount',
    delta: 1 | -1,
  ): Promise<number | null> {
    const updated = await this.postModel
      .findOneAndUpdate(
        { _id: postId },
        [
          {
            $set: {
              [field]: { $max: [0, { $add: [`$${field}`, delta] }] },
            },
          },
        ],
        {
          returnDocument: 'after',
          projection: { [field]: 1 },
          // Mongoose 9：使用聚合管道更新必须显式开启，否则抛 MongooseError
          updatePipeline: true,
        },
      )
      .lean()
      .exec()

    if (!updated) return null

    return (updated as unknown as Record<string, number>)[field] ?? 0
  }

  /**
   * 调整点赞数。供 LikesService 调用。
   *
   * 注意它是被**别的模块**调用的 —— 这正是 PostsModule 里
   * `exports: [PostsService]` 的用途。点赞模块不直接碰 posts 集合，
   * 而是通过帖子模块暴露的接口来改数据，
   * 这样"帖子文档长什么样"这件事依然只有帖子模块知道。
   */
  async incrementLikeCount(postId: string, delta: 1 | -1): Promise<number | null> {
    if (!isValidObjectId(postId)) return null
    return this.adjustCounter(postId, 'likeCount', delta)
  }

  /** 调整评论数。供 CommentsService 调用 */
  async incrementCommentCount(postId: string, delta: 1 | -1): Promise<number | null> {
    if (!isValidObjectId(postId)) return null
    return this.adjustCounter(postId, 'commentCount', delta)
  }

  /** 判断帖子是否存在（供评论/点赞模块做前置校验） */
  async exists(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false
    const found = await this.postModel.exists({ _id: id })
    return Boolean(found)
  }

  /**
   * 只读取计数字段。
   *
   * 为什么不直接用 findOne（取整个帖子）？
   *   因为计数字段被**高频**读取（每次点赞都要回一次值），
   *   用 `projection` 只取两个数字，省掉把正文（可能很大）
   *   从数据库搬过来的开销。
   *
   *   这类优化在数据量小的时候"看不出差别"，
   *   但它是"顺手就做对了"和"事后才补"的区别。
   */
  async getCounters(
    postId: string,
  ): Promise<{ likeCount: number; commentCount: number } | null> {
    if (!isValidObjectId(postId)) return null

    const doc = await this.postModel
      .findById(postId)
      .select('likeCount commentCount')
      .lean()
      .exec()

    if (!doc) return null

    const counters = doc as unknown as { likeCount?: number; commentCount?: number }
    return {
      likeCount: counters.likeCount ?? 0,
      commentCount: counters.commentCount ?? 0,
    }
  }

  /**
   * 校验 id 是否是合法的 ObjectId。
   *
   * 为什么非法 id 返回 **404 而不是 400**？
   *   因为对调用方来说，"这个 id 对应的资源不存在"是有意义的信息；
   *   而"你的 id 格式不对"暴露的是我们的存储实现细节。
   *   如果非法 id 返回 400、合法但不存在的 id 返回 404，
   *   调用方就得处理两种错误，而且能推断出我们的 id 生成规则。
   *
   * 另一个更实际的原因是：不校验的话，MongoDB 会抛一个
   * `CastError`，那是个 500 —— 把一个客户端的输入问题变成了服务端故障。
   */
  private assertValidId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`找不到 id 为 ${id} 的帖子`)
    }
  }
}
