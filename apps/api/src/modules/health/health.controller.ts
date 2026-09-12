import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger'
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus'

/**
 * 健康检查接口：GET /api/health
 *
 * ## 它为什么值得用 @nestjs/terminus
 *
 * 自己写也能做（判断 `connection.readyState === 1` 然后设状态码），
 * 但写了之后会遇到一连串"迟早要自己补"的东西：
 *   - 多个检查项怎么聚合成一个整体结论？
 *   - 单个检查项超时了怎么办？
 *   - 探针要读的是**结构化**结果，字段叫什么、嵌套几层？
 *   - 将来加磁盘、内存、外部 HTTP 探针时，控制器要不要改？
 *
 * Terminus 的答案是"指示器（Indicator）"：
 * 每个检查项是一个返回 Promise 的小函数，框架负责并发执行、
 * 超时控制、聚合状态，并在**任一项失败时自动返回 503**。
 * 加探针时只往数组里加一行，控制器不动 —— 这就是"扩展点"的价值。
 *
 * ## 两个必须知道的约定
 *
 * 1. **数据库断连时返回 503**，而不是 200。
 *    只有返回真实的失败语义，部署脚本才能用一条请求判定发布成败，
 *    容器/进程编排也才可能据此摘流。
 *
 * 2. **这个路径被全局响应拦截器排除**。
 *    见 `common/interceptors/transform.interceptor.ts`：
 *    Terminus 与 Swagger 都有第三方约定的响应形状，
 *    被我们的统一包装裹住之后，标准探针就解析不了了。
 *    "统一"不等于"无差别地包住一切"。
 *
 * 3. 前端首页 `index.vue` 只是 `$fetch` 探活、不解析 body，
 *    因此换成 Terminus 的形状对前端零影响；
 *    而且数据库掉线会变成 503，首页能更准确地显示"后端离线"。
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: MongooseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: '健康检查',
    description:
      '聚合所有指示器（当前只有 MongoDB 连通性）。任一项不健康即返回 503，可用于发布校验与存活探测。',
  })
  @ApiOkResponse({ description: '所有检查项正常' })
  @ApiServiceUnavailableResponse({ description: '至少一个检查项不健康（如数据库断连）' })
  check() {
    return this.health.check([
      // 将来要加磁盘、内存、外部服务探针，就往这个数组里继续加
      () => this.database.pingCheck('mongodb', { timeout: 5000 }),
    ])
  }
}
