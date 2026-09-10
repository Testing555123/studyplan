import { NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { PostsService } from '../posts/posts.service'
import { Like } from './schemas/like.schema'
import { LikesService } from './likes.service'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'

const POST_ID = '507f1f77bcf86cd799439011'

const actor: AuthenticatedUser = {
  id: '507f191e810c19729de860ea',
  email: 'a@example.com',
  username: '沈亦舟',
}

/** 伪造一个"唯一索引冲突"错误：MongoDB 用 code 11000 表示它 */
function duplicateKeyError(): Error & { code: number } {
  const error = new Error('E11000 duplicate key error') as Error & { code: number }
  error.code = 11000
  return error
}

describe('LikesService', () => {
  let service: LikesService
  let likeModel: { create: jest.Mock; deleteOne: jest.Mock }
  let postsService: {
    exists: jest.Mock
    incrementLikeCount: jest.Mock
    getCounters: jest.Mock
  }

  beforeEach(async () => {
    likeModel = {
      create: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) })),
    }

    postsService = {
      exists: jest.fn().mockResolvedValue(true),
      incrementLikeCount: jest.fn().mockResolvedValue(1),
      getCounters: jest.fn().mockResolvedValue({ likeCount: 5, commentCount: 2 }),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        LikesService,
        { provide: getModelToken(Like.name), useValue: likeModel },
        { provide: PostsService, useValue: postsService },
      ],
    }).compile()

    service = moduleRef.get(LikesService)
  })

  describe('like（幂等）', () => {
    it('首次点赞：写入记录并把计数 +1', async () => {
      postsService.incrementLikeCount.mockResolvedValueOnce(6)

      const result = await service.like(POST_ID, actor)

      expect(likeModel.create).toHaveBeenCalledTimes(1)
      expect(postsService.incrementLikeCount).toHaveBeenCalledWith(POST_ID, 1)
      expect(result).toEqual({ liked: true, likeCount: 6 })
    })

    it('已经赞过时：不重复计数，且返回成功（幂等，不是错误）', async () => {
      // 模拟唯一索引冲突：说明这个人已经赞过了
      likeModel.create.mockRejectedValueOnce(duplicateKeyError())

      const result = await service.like(POST_ID, actor)

      // 关键断言：计数绝不能被加第二次
      expect(postsService.incrementLikeCount).not.toHaveBeenCalled()
      expect(postsService.getCounters).toHaveBeenCalledWith(POST_ID)
      expect(result).toEqual({ liked: true, likeCount: 5 })
    })

    it('帖子不存在时抛 404，且不写任何数据', async () => {
      postsService.exists.mockResolvedValueOnce(false)

      await expect(service.like(POST_ID, actor)).rejects.toBeInstanceOf(NotFoundException)
      expect(likeModel.create).not.toHaveBeenCalled()
    })

    it('id 非法时抛 404，且不去查数据库', async () => {
      await expect(service.like('not-an-id', actor)).rejects.toBeInstanceOf(NotFoundException)
      expect(postsService.exists).not.toHaveBeenCalled()
    })
  })

  describe('unlike（幂等）', () => {
    it('成功取消：删除记录并把计数 -1', async () => {
      postsService.incrementLikeCount.mockResolvedValueOnce(4)

      const result = await service.unlike(POST_ID, actor)

      expect(postsService.incrementLikeCount).toHaveBeenCalledWith(POST_ID, -1)
      expect(result).toEqual({ liked: false, likeCount: 4 })
    })

    it('本来就没赞过时：不重复减计数，返回成功', async () => {
      likeModel.deleteOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      })

      const result = await service.unlike(POST_ID, actor)

      // 关键断言：没删到东西就不能减计数，否则会把计数减成负数
      expect(postsService.incrementLikeCount).not.toHaveBeenCalled()
      expect(result).toEqual({ liked: false, likeCount: 5 })
    })
  })

  describe('并发语义', () => {
    it('20 次并发的 like：只有 1 次会真正增加计数', async () => {
      /**
       * 这个用例验证的是"把正确性交给唯一索引"这个设计：
       *   只有第一次 create 成功，其余 19 次都会抛唯一索引冲突，
       *   于是只有 1 次 $inc。
       *
       * 注意这不是真的并发（Promise.all 在单线程里也是顺序执行），
       * 但它验证了**每种结果分支的行为**。
       * 真正的并发验证需要真实数据库（见阶段 8 的 E2E）。
       */
      let created = 0
      likeModel.create.mockImplementation(() => {
        created += 1
        if (created > 1) return Promise.reject(duplicateKeyError())
        return Promise.resolve({})
      })

      await Promise.all(Array.from({ length: 20 }, () => service.like(POST_ID, actor)))

      expect(likeModel.create).toHaveBeenCalledTimes(20)
      expect(postsService.incrementLikeCount).toHaveBeenCalledTimes(1)
    })
  })
})
