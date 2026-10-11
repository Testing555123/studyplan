import { z } from 'zod'

/**
 * 机器可读错误码（SPEC §3 错误码表）。
 * 此处保留为字符串集合文档，ErrorBodySchema.code 按 SPEC §1.1 用 z.string() 以兼容未知未来码。
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** SPEC §1.1 错误体（唯一形状）。所有失败路径归一到此结构。 */
export const ErrorBodySchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  timestamp: z.string(),
  details: z.array(z.string()).optional(),
})

export type ErrorBody = z.infer<typeof ErrorBodySchema>

/** SPEC §1.2 成功体。Route Handler 返回此形状；requestId 必须真进响应体（v2.0 缺陷修正）。 */
export const SuccessBodySchema = <T extends z.ZodType>(data: T) =>
  z.object({
    statusCode: z.number().int(),
    data,
    requestId: z.string(),
    timestamp: z.string(),
  })

export type SuccessBody<T extends z.ZodType> = z.infer<
  ReturnType<typeof SuccessBodySchema<T>>
>
