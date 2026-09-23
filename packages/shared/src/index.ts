/**
 * @studyplan/shared 的统一出口。
 *
 * 前端写：  import type { Post } from '@studyplan/shared'
 * 后端写：  import { POST_TAGS } from '@studyplan/shared'
 *
 * 这个包**不应该包含任何业务逻辑**，只放"契约"（类型 + 常量 + 纯判断函数）。
 * 一旦它开始依赖数据库或 HTTP 客户端，前端就再也用不了它了。
 */

export * from './types/user.js'
export * from './types/post.js'
export * from './types/comment.js'
export * from './types/api.js'
export * from './types/github.js'
export * from './types/ai.js'
export * from './types/daily-digest.js'
export * from './types/roadmap.js'
export * from './constants/tags.js'
export * from './constants/roadmap.js'
export * from './constants/github-tag-map.js'
export * from './constants/avatar.js'
export * from './constants/trending.js'
export * from './constants/language-colors.js'
