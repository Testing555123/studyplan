import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import type { ApiSuccessBody } from '@studyplan/shared'
import type { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/**
 * 需要**跳过**包装的路径。
 *
 * 为什么要排除？
 *   因为有两个使用者对自己的响应形状有硬性约定，包一层就会失效：
 *     · Terminus 健康检查：探针按它的 schema 判断存活与就绪；
 *     · Swagger 文档：Swagger UI 按 OpenAPI 规范读取接口自述。
 *
 *   "统一"不等于"无差别地包住一切"。知道什么时候**不**应用规则，
 *   和知道规则本身一样重要。
 */
const WRAPPER_EXCLUDED = /^\/(api\/)?(health|docs)(\/|$)/

/**
 * 统一成功响应拦截器。
 *
 * 它把每个 Controller 的返回值包成 ApiSuccessBody，
 * 与全局异常过滤器（负责失败）形成一对：
 *   · 失败 → ApiErrorBody { statusCode, message, details }
 *   · 成功 → ApiSuccessBody { statusCode, data, requestId }
 *
 * 前端因此只需要在一处判断、一处解包，
 * 而不是在几十个调用点里各写一遍"这个接口返回的是数组还是对象"。
 *
 * ⚠️ 必须与前端 useApi.ts 的解包逻辑**同时**落地：
 *    只改后端不改前端，类型系统不会报错（泛型是 T），
 *    但运行时所有页面会静默取不到数据——这类错误最难查，
 *    因为它看起来像是"页面坏了"，而不是"契约变了"。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccessBody<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessBody<T>> {
    const http = context.switchToHttp()
    const request = http.getRequest<{ originalUrl?: string; url?: string; requestId?: string }>()
    const response = http.getResponse<{ statusCode?: number }>()

    const rawPath = (request?.originalUrl ?? request?.url ?? '').split('?')[0] ?? ''

    // 排除清单内的路径原样透传，不做任何包装
    if (WRAPPER_EXCLUDED.test(rawPath)) {
      return next.handle() as unknown as Observable<ApiSuccessBody<T>>
    }

    return next.handle().pipe(
      map((data) => ({
        statusCode: response?.statusCode ?? 200,
        // 204 No Content 时 data 为 undefined，统一收敛成 null
        data: (data ?? null) as T | null,
        requestId: request?.requestId ?? '',
        timestamp: new Date().toISOString(),
      })),
    )
  }
}
