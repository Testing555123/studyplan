/**
 * 同机 Postgres 备份：pg_dump（custom 格式，已压缩）→ 上传 GitHub 私有仓库。
 *
 * 背景：HF Spaces 免费档容器文件系统是临时的，冷启动即重置，因此必须把数据落到外部；
 * 本脚本与 scripts/db-restore.mjs 构成持久化闭环（见 docs/deploy/huggingface-spaces.md §4）。
 *
 * 设计：
 *  - 每次写两份：`latest.dump`（固定名，恢复时优先取）+ `<UTC 时间戳>.dump`（历史，便于回溯）。
 *  - 历史按 BACKUP_KEEP（默认 24）滚动清理，失败不影响本次备份。
 *  - 失败语义：默认只告警、不阻断（容器继续对外服务）；BACKUP_STRICT=1 时以非零码退出。
 *
 * 用法：
 *   node scripts/db-backup.mjs                       # 容器内（space 形态，由 backup-loop.sh 调用）
 *   BACKUP_STRICT=1 node scripts/db-backup.mjs       # 需要严格失败的场景
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deleteBackups, listBackups, readConfig, uploadBackup } from './lib/backup-store.mjs'

const LATEST = 'latest.dump'
const HISTORY_NAME_RE = /^\d{8}T\d{6}Z\.dump$/
const KEEP = Number(process.env.BACKUP_KEEP ?? 24)

function timestampName() {
  // 形如 20261010T101500Z.dump，字典序即时间序，便于排序取舍。
  return `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.dump`
}

function dumpToFile(connectionString, file) {
  const res = spawnSync(
    'pg_dump',
    ['--format=custom', '--compress=9', '--no-owner', '--no-acl', `--dbname=${connectionString}`, `--file=${file}`],
    { encoding: 'utf8' },
  )
  if (res.error) throw res.error
  if (res.status !== 0) {
    throw new Error(`pg_dump 退出码 ${res.status}：${(res.stderr ?? '').slice(0, 500)}`)
  }
  return statSync(file)
}

async function main() {
  const cfg = readConfig()
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL 未设置')

  const workdir = mkdtempSync(join(tmpdir(), 'sp-backup-'))
  const file = join(workdir, 'dump.pgc')
  try {
    const stat = dumpToFile(connectionString, file)
    console.log(`[backup] pg_dump 完成：${(stat.size / 1024 / 1024).toFixed(2)} MB`)

    const buffer = readFileSync(file)

    const history = timestampName()
    await uploadBackup(cfg, history, buffer)
    console.log(`[backup] 已上传历史备份：${history}`)
    const latest = await uploadBackup(cfg, LATEST, buffer)
    console.log(`[backup] 已更新 ${LATEST}：${latest.path}`)

    // 滚动清理：保留最近 KEEP 份历史（latest.dump 不算历史）。
    try {
      const files = await listBackups(cfg)
      const historyNames = files
        .map((f) => f.name)
        .filter((name) => HISTORY_NAME_RE.test(name))
        .sort()
      const stale = historyNames.slice(0, Math.max(0, historyNames.length - KEEP))
      if (stale.length) {
        await deleteBackups(cfg, stale)
        console.log(`[backup] 已清理 ${stale.length} 份历史备份（保留最近 ${KEEP} 份）`)
      }
    } catch (err) {
      console.warn('[backup] 历史清理失败（忽略）：', err.message)
    }
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
}

const isCli = import.meta.url === `file://${process.argv[1]}`
if (isCli) {
  main()
    .then(() => {
      console.log('[backup] OK')
      process.exit(0)
    })
    .catch((err) => {
      console.error('[backup] FAIL:', err.message)
      process.exit(process.env.BACKUP_STRICT === '1' ? 1 : 0)
    })
}

export { main }
