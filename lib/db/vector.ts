import { customType } from 'drizzle-orm/pg-core'

/**
 * pgvector 向量列辅助（T1 建立，T10 的 embeddings 表使用）。
 * 用 customType 封装，避免依赖特定 drizzle 版本是否内置 vector 类型。
 * 物理类型为 `vector(<dimensions>)`，驱动层以 `[a,b,...]` 文本往返。
 */
export const vector = customType<{
  data: number[]
  driverData: string
  config: { dimensions: number }
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1024})`
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`
  },
  fromDriver(value: string): number[] {
    const inner = value.trim().slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((n) => Number(n))
  },
})
