import { z } from 'zod'

/** SPEC §2 PublicUserSchema。响应只暴露白名单字段，绝不透传 DB 行（§1.3）。 */
export const PublicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
})

export type PublicUser = z.infer<typeof PublicUserSchema>
