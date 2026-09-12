import type { NextFunction, Request, Response } from 'express'
import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware'
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'

/**
 * 应用入口。整个后端从这里开始执行。
 *
 * 这个文件只做"全局装配"，不写任何业务逻辑 —— 业务属于各个模块。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  /**
   * 0) 信任第一层代理 —— **必须放在所有中间件之前**。
   *
   * 上线后请求先到 Caddy 再转发到本机，不开启的话
   * `request.ip` 拿到的永远是网关的内网地址，后果是：
   *   ① 限流退化成"所有用户共用一个桶"，一个人触发就全站被封；
   *   ② 日志里全是同一个 IP，事后无法定位真实来源。
   *
   * 参数 1 表示"只信任直接相连的那一跳"，正好对应单层反代。
   */
  const expressApp = app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }
  expressApp.set('trust proxy', 1)

  /**
   * 0.5) 访问日志中间件。
   *
   * 放在最前面，是为了让 requestId 覆盖**全部**后续环节
   * （限流、鉴权、业务、统一响应），详细理由见中间件内的注释。
   */
  /**
   * ⚠️ 这里必须包一层，不能直接写 `app.use(new HttpLoggerMiddleware().use)`。
   *
   * 直接传方法引用会**丢失 this**，等 `res.on('finish')` 回调触发时
   * `this.logger` 是 undefined，抛出的异常发生在事件回调里、
   * 不在请求调用栈上，Nest 捕获不到 —— 结果是**整个进程直接崩掉**。
   * 这类 bug 的特点是"服务跑起来一切正常，第一个请求打完就死"，
   * 不看日志根本猜不到原因。
   */
  const httpLogger = new HttpLoggerMiddleware()
  app.use((req: Request, res: Response, next: NextFunction) => httpLogger.use(req, res, next))

  // 1) 统一路由前缀：所有接口都变成 /api/xxx
  app.setGlobalPrefix('api')

  // 2) 跨域。
  //    credentials: true 是必须的 —— 刷新令牌存在 httpOnly Cookie 里，
  //    浏览器只有在"允许携带凭据"时才会把它带上，否则登录态永远续不上。
  //    注意：credentials 为 true 时，origin 不能写成 '*'，必须列出具体来源。
  const corsOrigin = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  })

  // 3) 全局校验管道：配合 DTO 上的 class-validator 装饰器自动校验请求体。
  //    whitelist            —— 剥掉 DTO 未声明的字段（防止客户端偷偷塞字段）
  //    forbidNonWhitelisted —— 发现多余字段直接报错，而不是静默丢弃
  //    transform            —— 把 JSON / 查询字符串按 DTO 的类型转成 number / boolean
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // 4) 全局异常过滤器：所有错误都归一化成 ApiErrorBody 的一种形状
  app.useGlobalFilters(new AllExceptionsFilter())

  /**
   * 5) 全局拦截器（**顺序敏感**）。
   *
   * RequestIdInterceptor 必须排在前面：它生成 requestId 并挂到 request 上，
   * TransformInterceptor 随后把这个 ID 写进响应体，
   * 从而让"响应里的 ID"与"日志里的 ID"是同一个值。
   * 反过来的话，响应体里的 requestId 永远为空，追踪链就断了。
   */
  app.useGlobalInterceptors(new RequestIdInterceptor(), new TransformInterceptor())

  // 5) Swagger 接口文档。
  //    它的价值不只是"给前端看" —— 它还是一个**可交互的调试台**：
  //    在阶段 4 联调之前，你可以直接在这里把每个接口点一遍。
  const swaggerConfig = new DocumentBuilder()
    .setTitle('studyplan API')
    .setDescription(
      '学习 / 技术分享社区的后端接口。\n\n' +
        '约定：所有错误响应都遵循 packages/shared 中的 ApiErrorBody 结构，' +
        '前端因此只需要写一处错误处理。',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      // 这个名字要与 @ApiBearerAuth('access-token') 里的一致，阶段 5 会用到
      'access-token',
    )
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      // 刷新页面后保留已填入的 Token，调试受保护接口时省事很多
      persistAuthorization: true,
      // 显示每个请求的耗时，方便一眼看出哪个接口慢
      displayRequestDuration: true,
    },
  })

  const port = config.get<number>('PORT') ?? 3000

  /**
   * 监听全部网卡 —— 容器化部署的**硬性要求**。
   *
   * 之前为 systemd 方案把它在生产改成过 `127.0.0.1`（网关与后端同机）。
   * 改用容器后，Traefik 是通过 Docker 网络访问这个容器的，
   * 若绑 127.0.0.1，**容器外谁也连不上**，表现为"部署成功但站点 502"，
   * 而且容器日志一切正常 —— 非常难查。
   *
   * 安全性不再依赖监听地址，改由两条保证：
   *   ① 容器端口不 publish 到宿主；
   *   ② 只有 Traefik 对外暴露 80/443。
   */
  await app.listen(port, '0.0.0.0')

  Logger.log(`后端已启动：http://localhost:${port}/api`, 'Bootstrap')
  Logger.log(`接口文档：  http://localhost:${port}/docs`, 'Bootstrap')
  Logger.log(`健康检查：  http://localhost:${port}/api/health`, 'Bootstrap')
  Logger.log(`允许跨域：  ${corsOrigin.join(', ')}`, 'Bootstrap')
}

void bootstrap()
