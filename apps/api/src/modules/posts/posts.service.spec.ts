import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { POST_PAGE_SIZE } from '@studyplan/shared'
import { PostsService } from './posts.service'
import { Post } from './schemas/post.schema'
import { AiService } from '../ai/ai.service'
import { EmbeddingService } from '../search/embedding.service'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import type { QueryPostsDto } from './dto/query-posts.dto'
import type { UpdatePostDto } from './dto/update-post.dto'

const VALID_ID = '507f1f77bcf86cd799439011'
const OTHER_ID = '507f191e810c19729de860ea'

/** 测试里用的"当前登录用户" —— 阶段 5 之后，作者只能从这里来 */
const actor: AuthenticatedUser = { id: 'u-1', email: 'a@example.com', username: '沈亦舟' }

/**
 * 一个"链式调用替身"。
 *
 * Mongoose 的 Query 是可链式调用的：`.sort().skip().limit().lean().exec()`。
 * 所以替身里的每个中间方法都要 `return this`（返回替身自己），
 * 只有最后一步 `exec()` 才返回真正的数据。
 *
 * 如果不这样写，`await model.find(...).lean().exec()` 会直接报
 * "Cannot read properties of undefined" —— 这是给 Mongoose 写单测时
 * 第一个会撞上的墙。
 */
function createQueryStub(result: unknown) {
  const query: Record<string, jest.Mock> = {}
  query.exec = jest.fn().mockResolvedValue(result)
  for (const method of ['sort', 'skip', 'limit', 'lean']) {
    query[method] = jest.fn(() => query)
  }
  return query
}

/** 一条"数据库里的帖子"，字段与 PostLean 对齐 */
const baseDoc = {
  _id: VALID_ID,
  title: '分页设计的三个坑',
  content: '这是一段足够长的正文，用来通过最小长度校验。',
  tags: ['NestJS'],
  summary: null,
  author: { id: 'u-1', username: '沈亦舟' },
  likeCount: 7,
  commentCount: 2,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
}

describe('PostsService', () => {
  let service: PostsService
  let findQuery: ReturnType<typeof createQueryStub>
  let findByIdQuery: ReturnType<typeof createQueryStub>
  let ai: { enabled: boolean; generatePostMeta: jest.Mock }
  let embedding: { syncForPost: jest.Mock; removeForPost: jest.Mock }
  let model: {
    find: jest.Mock
    countDocuments: jest.Mock
    findById: jest.Mock
    create: jest.Mock
    updateOne: jest.Mock
    findOneAndUpdate: jest.Mock
    findOneAndDelete: jest.Mock
    exists: jest.Mock
  }

  beforeEach(async () => {
    findQuery = createQueryStub([baseDoc])
    findByIdQuery = createQueryStub(baseDoc)
    ai = { enabled: false, generatePostMeta: jest.fn() }
    embedding = {
      syncForPost: jest.fn().mockResolvedValue(true),
      removeForPost: jest.fn().mockResolvedValue(undefined),
    }

    model = {
      find: jest.fn(() => findQuery),
      countDocuments: jest.fn(() => createQueryStub(1)),
      findById: jest.fn(() => findByIdQuery),
      create: jest.fn().mockResolvedValue({ ...baseDoc, toObject: () => baseDoc }),
      // enrichWithAi 回填摘要时用 updateOne（链式替身，exec 返回acknowledged 即可）
      updateOne: jest.fn(() => createQueryStub({ acknowledged: true })),
      findOneAndUpdate: jest.fn(() => createQueryStub(baseDoc)),
      findOneAndDelete: jest.fn(() => createQueryStub(baseDoc)),
      exists: jest.fn().mockResolvedValue({ _id: VALID_ID }),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        PostsService,
        // 用 useValue 注入替身：这就是依赖注入带来的可测性 ——
        // PostsService 不知道、也不需要知道数据库是否真的存在。
        { provide: getModelToken(Post.name), useValue: model },
        /**
         * 阶段 7 追加：PostsService 现在依赖 AiService。
         *
         * 这里把 `enabled` 设为 false，于是发帖后的 AI 增强会立刻返回，
         * 测试里不会产生任何真实的网络调用或异步噪音。
         *
         * 顺带说：**新增一个依赖就会让所有已有的测试文件跟着改** ——
         * 这就是依赖注入的代价之一。它换来的是"依赖关系显式可见"，
         * 而不是藏在构造函数里的 `new`。
         */
        {
          provide: AiService,
          useValue: ai,
        },
        /**
         * 语义搜索追加：PostsService 现在还依赖 EmbeddingService（posts → search → ai 单向）。
         * 同 AiService 一样用 useValue 注入替身，测试里不碰真模型与真库。
         */
        {
          provide: EmbeddingService,
          useValue: embedding,
        },
      ],
    }).compile()

    service = moduleRef.get(PostsService)
  })

  describe('findAll 分页', () => {
    it('默认按第一页查询，skip 为 0，limit 为默认每页数量', async () => {
      const result = await service.findAll({ page: 1, pageSize: POST_PAGE_SIZE } as QueryPostsDto)

      expect(findQuery.skip).toHaveBeenCalledWith(0)
      expect(findQuery.limit).toHaveBeenCalledWith(POST_PAGE_SIZE)
      expect(result.page).toBe(1)
      expect(result.total).toBe(1)
      expect(result.items).toHaveLength(1)
    })

    it('第二页的 skip 等于每页数量（这是分页最容易写错的地方）', async () => {
      await service.findAll({ page: 2, pageSize: 10 } as QueryPostsDto)

      expect(findQuery.skip).toHaveBeenCalledWith(10)
    })

    it('传入 tag 时按数组包含关系筛选', async () => {
      await service.findAll({ page: 1, pageSize: POST_PAGE_SIZE, tag: 'NestJS' } as QueryPostsDto)

      expect(model.find).toHaveBeenCalledWith({ tags: 'NestJS' })
    })

    it('不传 tag 时不加任何筛选条件', async () => {
      await service.findAll({ page: 1, pageSize: POST_PAGE_SIZE } as QueryPostsDto)

      expect(model.find).toHaveBeenCalledWith({})
    })

    it('把数据库形状映射成契约形状：_id → id、null 摘要 → undefined、Date → ISO 字符串', async () => {
      const result = await service.findAll({ page: 1, pageSize: POST_PAGE_SIZE } as QueryPostsDto)

      const item = result.items[0]!
      expect(item.id).toBe(VALID_ID)
      expect(item.summary).toBeUndefined()
      expect(item.createdAt).toBe('2026-09-01T00:00:00.000Z')
      // 内部字段绝不能出现在契约里
      expect(item).not.toHaveProperty('_id')
      expect(item).not.toHaveProperty('updatedAt')
    })
  })

  describe('findOne', () => {
    it('id 非法时抛 404，且根本不去查数据库', async () => {
      await expect(service.findOne('not-an-object-id')).rejects.toBeInstanceOf(NotFoundException)
      expect(model.findById).not.toHaveBeenCalled()
    })

    it('id 合法但查不到时抛 404', async () => {
      model.findById.mockReturnValueOnce(createQueryStub(null))

      await expect(service.findOne(VALID_ID)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('正常返回契约对象', async () => {
      const post = await service.findOne(VALID_ID)

      expect(post.id).toBe(VALID_ID)
      expect(post.author).toEqual({ id: 'u-1', username: '沈亦舟' })
    })
  })

  describe('create（阶段 5：作者来自 Token，不来自请求体）', () => {
    it('作者信息取自传入的 actor，而不是 DTO', async () => {
      await service.create(
        { title: '新帖子标题', content: '一段足够长的正文内容。', tags: ['Vue'] },
        actor,
      )

      expect(model.create).toHaveBeenCalledWith({
        title: '新帖子标题',
        content: '一段足够长的正文内容。',
        tags: ['Vue'],
        author: { id: 'u-1', username: '沈亦舟' },
      })
    })

    it('摘要成功后顺带生成向量；embedding 抛错也不影响发帖结果（Review Focus #5）', async () => {
      // 打开 AI 旁路：generatePostMeta 成功返回
      ai.enabled = true
      ai.generatePostMeta.mockResolvedValue({ summary: 's', tags: [] })
      // 模拟"连永不抛的 syncForPost 都炸了"的极端情况
      embedding.syncForPost.mockRejectedValue(new Error('boom'))

      const result = await service.create(
        { title: '新帖子标题', content: '一段足够长的正文内容。', tags: ['Vue'] },
        actor,
      )

      // 旁路是 void 出去的，等它转完一圈
      await new Promise((resolve) => setImmediate(resolve))

      // 发帖主链路照常成功（create 替身返回的是 baseDoc，断 id 不断 title）
      expect(result.id).toBe(VALID_ID)
      expect(embedding.syncForPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: '新帖子标题', summary: 's' }),
      )
    })
  })

  describe('update', () => {
    it('过滤掉 undefined 字段，把权限条件写进查询，并开启 Schema 校验', async () => {
      const dto: UpdatePostDto = { title: '只改标题', content: undefined }

      await service.update(VALID_ID, dto, actor)

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        // 关键点：查询条件里带上了 author.id，权限由数据库一次裁决
        { _id: VALID_ID, 'author.id': 'u-1' },
        // content 必须不在 $set 里，否则会被清空
        { $set: { title: '只改标题' } },
        expect.objectContaining({ returnDocument: 'after', runValidators: true }),
      )
    })

    it('没有任何可更新字段时不写库', async () => {
      await service.update(VALID_ID, {}, actor)

      expect(model.findOneAndUpdate).not.toHaveBeenCalled()
      expect(model.findById).toHaveBeenCalled()
    })

    it('帖子存在但不属于自己时抛 403（而不是 404）', async () => {
      model.findOneAndUpdate.mockReturnValueOnce(createQueryStub(null))
      // exists 返回真 = 帖子确实存在 → 那就是权限问题
      model.exists.mockResolvedValueOnce({ _id: VALID_ID })

      await expect(service.update(VALID_ID, { title: '改别人的' }, actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('帖子不存在时抛 404', async () => {
      model.findOneAndUpdate.mockReturnValueOnce(createQueryStub(null))
      model.exists.mockResolvedValueOnce(null)

      await expect(service.update(VALID_ID, { title: '改不存在的' }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })

  describe('remove', () => {
    it('删帖时级联删除向量', async () => {
      await service.remove(VALID_ID, actor)

      expect(embedding.removeForPost).toHaveBeenCalledWith(VALID_ID)
    })

    it('删除时同样把作者的归属写进查询条件', async () => {
      await service.remove(VALID_ID, actor)

      expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: VALID_ID, 'author.id': 'u-1' })
    })

    it('目标不存在时抛 404', async () => {
      model.findOneAndDelete.mockReturnValueOnce(createQueryStub(null))
      model.exists.mockResolvedValueOnce(null)

      await expect(service.remove(VALID_ID, actor)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('目标存在但不属于自己时抛 403', async () => {
      model.findOneAndDelete.mockReturnValueOnce(createQueryStub(null))
      model.exists.mockResolvedValueOnce({ _id: VALID_ID })

      await expect(service.remove(OTHER_ID, actor)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('成功时不返回内容', async () => {
      await expect(service.remove(VALID_ID, actor)).resolves.toBeUndefined()
    })
  })
})
