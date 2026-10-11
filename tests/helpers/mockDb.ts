import { vi } from 'vitest'

/**
 * 链式 Drizzle db 测试桩（T15 测试工具）。
 * 每个方法都是 vi.fn；select/insert/update/delete/from/where/set/values 返回可继续链式的子对象，
 * returning/execute 返回 Promise，transaction 透传当前桩，便于覆盖查询与写入两条路径。
 * 测试内按需覆盖具体方法行为（如 execute.mockRejectedValue 模拟断连）。
 */
export interface MockDb {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  onConflictDoNothing: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}

export function createMockDb(): MockDb {
  const link = () => {
    const o: Record<string, ReturnType<typeof vi.fn>> = {
      values: vi.fn(() => link()),
      set: vi.fn(() => link()),
      where: vi.fn(() => link()),
      returning: vi.fn(() => Promise.resolve([])),
      onConflictDoUpdate: vi.fn(() => link()),
      onConflictDoNothing: vi.fn(() => link()),
      insert: vi.fn(() => link()),
      select: vi.fn(() => link()),
      update: vi.fn(() => link()),
      delete: vi.fn(() => link()),
      from: vi.fn(() => link()),
      execute: vi.fn(() => Promise.resolve({ rows: [] })),
      transaction: vi.fn((fn: (d: MockDb) => unknown) => fn(o as unknown as MockDb)),
    }
    return o
  }
  return link() as unknown as MockDb
}
