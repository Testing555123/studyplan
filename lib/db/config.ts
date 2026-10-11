import { Pool } from 'pg'
import { parsedEnv } from '@app/shared/env'

/**
 * pg 连接池（单进程架构，单一实例）。
 * 读取 T0 校验过的 DATABASE_URL；缺失时 env 校验已在启动期抛错（SPEC §8.4）。
 */
export const pool = new Pool({
  connectionString: parsedEnv.DATABASE_URL,
  max: 10,
})
