/**
 * @studyplan/shared 的统一出口。
 *
 * 前端写：  import type { Post } from '@studyplan/shared'
 * 后端写：  import { POST_TAGS } from '@studyplan/shared'
 *
 * 这个包**不应该包含任何业务逻辑**，只放"契约"（类型 + 常量 + 纯判断函数）。
 * 一旦它开始依赖数据库或 HTTP 客户端，前端就再也用不了它了。
 */

export * from './types/user'
export * from './types/post'
export * from './types/comment'
export * from './types/api'
export * from './types/github'
export * from './types/ai'
export * from './constants/tags'
export * from './constants/github-tag-map'
export * from './constants/avatar'
export * from './constants/trending'
export * from './constants/language-colors'
