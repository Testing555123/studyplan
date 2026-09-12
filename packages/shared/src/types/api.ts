/**
 * 通用 HTTP / API 契约。
 *
 * 后端有一个全局异常过滤器，把**所有**错误都归一化成 `ApiErrorBody`。
 * 这样前端只需要写一处错误处理，不用去猜"这次是字符串还是对象还是数组"。
 */
export interface ApiErrorBody {
  /** HTTP 状态码，例如 400 / 401 / 404 / 500 */
  statusCode: number
  /** 可直接展示给用户的中文提示 */
  message: string
  /** 机器可读的错误名，例如 BadRequest */
  error?: string
  /** 出错接口路径，便于排查 */
  path?: string
  timestamp?: string
  /** 字段级校验错误，来自 class-validator */
  details?: string[]
}

/**
 * 成功响应契约。
 *
 * 为什么成功也要定契约？
 *   后端有一个全局响应拦截器，把所有成功响应包成同一个形状，
 *   这样前端**只用在一处解包**，而不是在每个调用点猜返回结构。
 *
 * 它与 ApiErrorBody 是配对的：
 *   成功了拿 `data`，失败了拿 `message + details`。
 *   两边都由 packages/shared 定义，改错字段前后端会同时报错——
 *   这正是"契约"存在的意义：把联调期才能发现的字段对不上，
 *   提前到编译期。
 */
export interface ApiSuccessBody<T> {
  /** HTTP 状态码，例如 200 / 201 */
  statusCode: number
  /** 业务数据；204 之类的空响应为 null */
  data: T | null
  /** 链路追踪 ID，与响应头 X-Request-Id 一致，排错时用它串日志 */
  requestId: string
  timestamp: string
}

/** 点赞接口返回：让前端可以拿服务端真值覆盖乐观更新，避免计数漂移 */
export interface LikeResult {
  liked: boolean
  likeCount: number
}

/** 健康检查返回，用来确认"服务活着 + 数据库连上了" */
export interface HealthStatus {
  status: 'ok' | 'degraded'
  uptimeSeconds: number
  database: 'connected' | 'disconnected'
  timestamp: string
}
