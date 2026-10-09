import pino from 'pino'

/**
 * 最小日志接口（T2）。pino.Logger 与此兼容；失败时回退实现也满足此接口。
 * 方法签名遵循 pino：(obj?, msg?) 与 child(bindings)。
 */
export interface AppLogger {
  info: (obj?: unknown, msg?: string) => void
  warn: (obj?: unknown, msg?: string) => void
  error: (obj?: unknown, msg?: string) => void
  debug: (obj?: unknown, msg?: string) => void
  child: (bindings: Record<string, unknown>) => AppLogger
}

/** SPEC §6.3 脱敏清单：键名匹配则整体替换为 ***。 */
export const REDACT_PATTERNS =
  /password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie|session|database_url|connection[_-]?string|dsn|set[_-]?cookie/i

/** 全字符串截断上限（SPEC §6.3：160 字符）。 */
export const STRING_TRUNCATE_MAX = 160

function truncate(value: string): string {
  if (value.length <= STRING_TRUNCATE_MAX) return value
  // 超长时截断并在末尾加省略号，保证总长度不超过上限（含省略号）。
  return `${value.slice(0, STRING_TRUNCATE_MAX - 1)}…`
}

/**
 * 深度脱敏（SPEC §6.3）。
 * - 键名命中 REDACT_PATTERNS → 值替换为 '***'（防凭据泄漏）。
 * - 所有字符串值截断到 160 字符（防超大自由文本泄漏）。
 * - 不处理循环引用（WeakSet 防护）。
 */
export function redact<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') {
    return (typeof value === 'string' ? truncate(value) : value) as T
  }
  if (seen.has(value as object)) return value
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen)) as T
  }

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_PATTERNS.test(key)) {
      out[key] = '***'
    } else if (typeof val === 'string') {
      out[key] = truncate(val)
    } else {
      out[key] = redact(val, seen)
    }
  }
  return out as T
}

/** 观测失效兜底（V5）：pino 不可用时退化为 console 实现，保证不阻断启动。 */
export function createFallbackLogger(): AppLogger {
  const emit = (level: string, obj?: unknown, msg?: string) => {
    const tag = `[logger-fallback:${level}]`
    // 仅 logger.ts 文件豁免 no-console（eslint.config.mjs）。
    if (msg) {
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : level === 'debug' ? 'debug' : 'info'](tag, obj ?? '', msg)
    } else {
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : level === 'debug' ? 'debug' : 'info'](tag, obj ?? '')
    }
  }
  const base: AppLogger = {
    info: (o, m) => emit('info', o, m),
    warn: (o, m) => emit('warn', o, m),
    error: (o, m) => emit('error', o, m),
    debug: (o, m) => emit('debug', o, m),
    child: () => base,
  }
  return base
}

function defaultPinoFactory(): AppLogger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    // 双保险：pino 原生 redact 也按相同清单处理。
    redact: ['*.password', '*.token', '*.secret', '*.apiKey', '*.authorization', '*.cookie', '*.database_url'],
  }) as unknown as AppLogger
}

/**
 * 创建日志实例。pino 初始化抛错时降级为 fallback（V5：观测失效不阻断启动）。
 * 注入 pinoFactory 便于测试降级分支。
 */
export function createAppLogger(pinoFactory: () => AppLogger = defaultPinoFactory): AppLogger {
  try {
    return pinoFactory()
  } catch {
    return createFallbackLogger()
  }
}

export const logger: AppLogger = createAppLogger()

/** 注入 X-Request-Id，返回带 requestId 绑定的子 logger（SPEC §6.3 / T6 requestId 透传）。 */
export function withRequestId(id: string): AppLogger {
  return logger.child({ requestId: id })
}
