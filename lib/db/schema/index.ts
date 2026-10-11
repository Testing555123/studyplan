// 各任务（T1/T3/T10/T11）在此聚合自己的 schema 文件，供 drizzle-kit 统一读取。
// 新增 schema 时只追加自己的 export 行，禁止改动他人文件。
export * from './base'
export * from './auth'
export * from './embeddings'
export * from './ai-cache'
