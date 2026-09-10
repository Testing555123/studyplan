import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

/**
 * 应用入口。整个后端从这里开始执行。
 *
 * 这个文件只做"全局装配"，不写任何业务逻辑 —— 业务属于各个模块。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

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
  await app.listen(port, '0.0.0.0')

  Logger.log(`后端已启动：http://localhost:${port}/api`, 'Bootstrap')
  Logger.log(`接口文档：  http://localhost:${port}/docs`, 'Bootstrap')
  Logger.log(`健康检查：  http://localhost:${port}/api/health`, 'Bootstrap')
  Logger.log(`允许跨域：  ${corsOrigin.join(', ')}`, 'Bootstrap')
}

void bootstrap()
