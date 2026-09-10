import { Controller, Get } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Connection } from 'mongoose'
import type { HealthStatus } from '@studyplan/shared'

/**
 * 健康检查接口：GET /api/health
 *
 * ## 为什么它待在 modules/ 里，而不是 src/ 根下？
 *
 * 这个文件原先放在 `src/health/`，和其它功能模块不在同一个层级上。
 * 这不只是"看起来不整齐"，它会让人产生一个错误的心智模型：
 * 仿佛 `src/` 下有两类并列的东西 —— "模块"和"非模块"。
 *
 * 实际上 NestJS 里**一切能被 @Module 装起来的东西都是模块**，
 * 健康检查也只是"不依赖任何业务领域"的模块而已。
 * 放进 `modules/health/` 之后，`src/` 下就只剩三样东西：
 *
 *   - `main.ts`  启动入口
 *   - `app.module.ts` 根模块
 *   - `common/`  横切关注点（守卫、过滤器、装饰器……）
 *   - `config/`  配置与校验
 *   - `modules/` 全部业务/功能模块
 *
 * 这就是"目录即心智模型"：结构对齐之后，你找东西不用再靠记忆。
 *
 * ## 这个接口的价值
 *
 * 它的价值在阶段 3 之后才真正显现：**一眼分辨"服务挂了"还是"数据库挂了"**。
 * 这两种故障的处理方式完全不同：
 *   - 服务挂了 → 看进程、看端口、看启动日志；
 *   - 数据库挂了 → 看连接串、IP 白名单、Atlas 集群状态。
 * 如果没有这个接口，你只能看到前端报"加载失败"，然后从零开始猜。
 *
 * `connection.readyState` 是 Mongoose 的连接状态机：
 *   0 disconnected / 1 connected / 2 connecting / 3 disconnecting
 * 用数字比较可读性太差，所以映射成业务语义放在返回值里。
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  @ApiOperation({
    summary: '健康检查',
    description: '返回服务运行时长与数据库连接状态，用于快速定位故障层。',
  })
  @ApiOkResponse({ description: '服务正常（或数据库未连接时返回 degraded）' })
  check(): HealthStatus {
    const connected = this.connection.readyState === 1

    return {
      status: connected ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      database: connected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    }
  }
}
