import type { AppLogger } from '@/lib/logger'

export type TestLogger = AppLogger & {
  calls: Array<{ level: string; obj?: unknown; msg?: string }>
}

/**
 * 测试用内存 logger（T15 测试工具）：记录所有调用，不触碰真实 pino，便于断言脱敏/观测行为。
 */
export function createTestLogger(): TestLogger {
  const calls: TestLogger['calls'] = []
  const make =
    (level: string) =>
    (obj?: unknown, msg?: string) => {
      calls.push({ level, obj, msg })
    }
  const base: AppLogger = {
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    debug: make('debug'),
    child: () => base,
  }
  return Object.assign(base, { calls })
}
