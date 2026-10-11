import { z } from 'zod'

/** SPEC §2 HealthStatusSchema。健康检查返回形状；HTTP 码与 status 联动（§8.1）。 */
export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptimeSeconds: z.number().int(),
  database: z.enum(['connected', 'disconnected']),
  timestamp: z.string(),
})

export type HealthStatus = z.infer<typeof HealthStatusSchema>
