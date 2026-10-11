/**
 * 冷启动数据恢复：从 GitHub 私有仓库拉取 latest.dump → pg_restore 进同机 Postgres。
 *
 * 语义（重要）：恢复失败**不阻断启动**——应用可降级运行（lib/health.ts 会报告 database=disconnected），
 * 宁可空库 + drizzle 迁移，也不让 Space 卡在启动阶段无法对外服务。
 * 需要严格失败时设 BACKUP_STRICT=1。
 *
 * 用法：
 *   node scripts/db-restore.mjs          # 由 docker/space/start-next.sh 在冷启动时调用
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadBackup, readConfig } from './lib/backup-store.mjs'

const LATEST = 'latest.dump'

function restoreFromFile(connectionString, file) {
  const res = spawnSync(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--no-acl', `--dbname=${connectionString}`, file],
    { encoding: 'utf8' },
  )
  if (res.error) throw res.error
  // pg_restore 对「对象已存在/不存在」一类会输出 ERROR 并返回非 0，这里只看进程错误与致命失败。
  if (res.status !== 0) {
    throw new Error(`pg_restore 退出码 ${res.status}：${(res.stderr ?? '').slice(0, 500)}`)
  }
}

async function main() {
  const cfg = readConfig()
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL 未设置')

  const buffer = await downloadBackup(cfg, LATEST)
  if (!buffer) {
    console.log(`[restore] 未找到 ${LATEST}，跳过恢复（按空库 + 迁移继续）`)
    return { restored: false }
  }
  console.log(`[restore] 拉取 ${LATEST}：${(buffer.length / 1024 / 1024).toFixed(2)} MB`)

  const workdir = mkdtempSync(join(tmpdir(), 'sp-restore-'))
  const file = join(workdir, 'restore.pgc')
  try {
    writeFileSync(file, buffer)
    restoreFromFile(connectionString, file)
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }

  console.log('[restore] 恢复完成')
  return { restored: true, bytes: buffer.length }
}

const isCli = import.meta.url === `file://${process.argv[1]}`
if (isCli) {
  main()
    .then(() => {
      process.exit(0)
    })
    .catch((err) => {
      console.error('[restore] FAIL:', err.message)
      process.exit(process.env.BACKUP_STRICT === '1' ? 1 : 0)
    })
}

export { main }
