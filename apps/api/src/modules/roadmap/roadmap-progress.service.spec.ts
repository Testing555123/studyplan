import { NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { ROADMAP_STAGES, computeRoadmapProgress } from '@studyplan/shared'
import { RoadmapProgressService } from './roadmap-progress.service'
import { RoadmapUserProgress } from './schemas/roadmap-progress.schema'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'

const USER_ID = '507f191e810c19729de860ea'

const actor: AuthenticatedUser = {
  id: USER_ID,
  email: 'a@example.com',
  username: '沈亦舟',
}

/** 路线里真实存在的节点 slug（契约变更改了名字也不会误过） */
const COURSE_ID = 'react-basics'

describe('RoadmapProgressService', () => {
  let service: RoadmapProgressService
  let progressModel: {
    findOne: jest.Mock
    findOneAndUpdate: jest.Mock
    updateOne: jest.Mock
    deleteOne: jest.Mock
  }

  /** 让 findOne 返回指定 steps 的"伪文档" */
  function stubFindOne(steps: Record<string, unknown> | null): void {
    progressModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(steps ? { steps } : null),
    })
  }

  beforeEach(async () => {
    progressModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(null) })),
      updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
      deleteOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) })),
    }
    stubFindOne(null)

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoadmapProgressService,
        { provide: getModelToken(RoadmapUserProgress.name), useValue: progressModel },
      ],
    }).compile()

    service = moduleRef.get(RoadmapProgressService)
  })

  describe('getProgress', () => {
    it('从未标记过：返回空覆盖层，聚合等于官方默认', async () => {
      const result = await service.getProgress(actor)

      expect(result.steps).toEqual({})
      expect(result.progress).toEqual(computeRoadmapProgress(ROADMAP_STAGES))
    })

    it('有覆盖层时：聚合按用户状态算', async () => {
      // 把一个"计划中"节点标成"已完成"，completed 应比官方默认多 1
      stubFindOne({ 'perf-eng': { status: 'completed', updatedAt: new Date().toISOString() } })

      const result = await service.getProgress(actor)

      const official = computeRoadmapProgress(ROADMAP_STAGES)
      expect(result.progress.completed).toBe(official.completed + 1)
      expect(result.progress.planned).toBe(official.planned - 1)
    })
  })

  describe('setStatus（幂等 upsert）', () => {
    it('写入用 $set steps.<courseId> + upsert，不"先查后插"', async () => {
      await service.setStatus(COURSE_ID, 'completed', actor)

      const [filter, update, options] = progressModel.findOneAndUpdate.mock.calls[0]
      expect(filter).toEqual({ userId: expect.any(Object) })
      expect(update.$set[`steps.${COURSE_ID}`]).toMatchObject({
        status: 'completed',
        updatedAt: expect.any(String),
      })
      expect(options).toMatchObject({ upsert: true, new: true })
    })

    it('重复提交同一状态：两次都成功，结果不漂移（幂等）', async () => {
      const first = await service.setStatus(COURSE_ID, 'completed', actor)
      const second = await service.setStatus(COURSE_ID, 'completed', actor)

      expect(progressModel.findOneAndUpdate).toHaveBeenCalledTimes(2)
      expect(second.progress).toEqual(first.progress)
    })

    it('未知 courseId：抛 404 且不写库', async () => {
      await expect(
        service.setStatus('no-such-node', 'completed', actor),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(progressModel.findOneAndUpdate).not.toHaveBeenCalled()
    })
  })

  describe('resetCourse / resetAll（幂等删除）', () => {
    it('单节点重置用 $unset 精确摘除该键', async () => {
      await service.resetCourse(COURSE_ID, actor)

      const [filter, update] = progressModel.updateOne.mock.calls[0]
      expect(filter).toEqual({ userId: expect.any(Object) })
      expect(update.$unset).toEqual({ [`steps.${COURSE_ID}`]: '' })
    })

    it('单节点重置未知 id：抛 404 且不写库', async () => {
      await expect(service.resetCourse('no-such-node', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      )
      expect(progressModel.updateOne).not.toHaveBeenCalled()
    })

    it('全部重置删除整份文档，返回官方默认聚合', async () => {
      const result = await service.resetAll(actor)

      expect(progressModel.deleteOne).toHaveBeenCalledWith({ userId: expect.any(Object) })
      expect(result.steps).toEqual({})
      expect(result.progress).toEqual(computeRoadmapProgress(ROADMAP_STAGES))
    })

    it('没标记过时全部重置：依然成功（幂等）', async () => {
      progressModel.deleteOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      })

      await expect(service.resetAll(actor)).resolves.toMatchObject({ steps: {} })
    })
  })

  describe('凭证兜底', () => {
    it('actor.id 非法 ObjectId 时抛错而不是 500', async () => {
      const broken = { ...actor, id: 'not-an-id' }
      await expect(service.getProgress(broken)).rejects.toBeInstanceOf(NotFoundException)
      expect(progressModel.findOne).not.toHaveBeenCalled()
    })
  })
})
