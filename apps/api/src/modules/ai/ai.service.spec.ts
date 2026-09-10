import { ConfigService } from '@nestjs/config'
import { AiService } from './ai.service'

/**
 * AiService 的单元测试。
 *
 * ⚠️ 这里**刻意只测"没有配置 Key"这条路径**，原因要说清楚：
 *
 *   真正调用模型需要网络与有效的 API Key，那不是单元测试该做的事
 *   （它会变慢、会因为网络抖动而偶发失败、还会真的花钱）。
 *   而"调用失败后能否正确降级"这条最关键的路径，
 *   靠的是两层保证：
 *     ① `post-meta.sanitizer.spec.ts` 覆盖了"结果不可用"的全部情形；
 *     ② `generatePostMeta` 内部把**所有**异常都收敛成 `return null`，
 *        这一段是"看一眼就能确认"的代码 —— 它没有分支逻辑，
 *        只有 try/catch。
 *
 *   端到端的降级验证（把 Key 改错 → 发帖依然成功）需要真实数据库，
 *   属于阶段 8 的验证范围。**知道哪些东西没被自动测试覆盖，比假装覆盖了更重要。**
 */

/** 伪造 ConfigService，只提供 AiService 用到的几个键 */
function createConfigStub(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key]
      if (value === undefined) throw new Error(`缺少环境变量 ${key}`)
      return value
    },
  } as unknown as ConfigService
}

describe('AiService', () => {
  describe('未配置 API Key 时', () => {
    let service: AiService

    beforeEach(() => {
      service = new AiService(createConfigStub({}))
    })

    it('enabled 为 false（调用方据此跳过整个流程）', () => {
      expect(service.enabled).toBe(false)
    })

    it('generatePostMeta 返回 null，且不抛异常', async () => {
      await expect(service.generatePostMeta({ title: '标题', content: '正文' })).resolves.toBeNull()
    })

    it('构造时不会因为缺 Key 而抛错（AI 是增强功能，不是核心依赖）', () => {
      expect(() => new AiService(createConfigStub({}))).not.toThrow()
    })
  })

  describe('配置了 API Key 时', () => {
    it('enabled 为 true', () => {
      const service = new AiService(
        createConfigStub({
          // 只检查"是否启用"，不会真的发请求，所以这里用假 Key 是安全的
          ZHIPUAI_API_KEY: 'fake-key-for-enabled-check',
          ZHIPUAI_MODEL: 'glm-4-flash',
          ZHIPUAI_TIMEOUT_MS: '15000',
        }),
      )

      expect(service.enabled).toBe(true)
    })

    it('超时配置非法（NaN）时不会让服务崩掉', () => {
      expect(
        () =>
          new AiService(
            createConfigStub({
              ZHIPUAI_API_KEY: 'fake-key',
              ZHIPUAI_TIMEOUT_MS: '不是数字',
            }),
          ),
      ).not.toThrow()
    })
  })
})
