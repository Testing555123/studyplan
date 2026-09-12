/**
 * 生产库快照 / 恢复（零额外依赖，用项目已有的 mongoose）
 * ============================================================
 *
 * 为什么需要它？
 *   Atlas 免费集群（M0）**没有平台级自动快照**（Cloud Backup 需要 M10+），
 *   而我们的验证流程会往生产库写真实数据（E2E 真注册、真发帖）。
 *   一旦写脏，往回退的唯一手段就是动数据库本身 —— 项目里又没有
 *   admin / 删帖接口（这是刻意的安全设计）。所以"能回到上一个已知状态"
 *   必须由这个脚本提供。
 *
 *   ⚠️ 为什么不用 mongodump？它是业界标准，但需要额外装一套工具；
 *      而本项目全栈都是 Node，用 mongoose 写 40 行即可，跨平台、零安装。
 *      数据量大到几十万行时再换 mongodump 更合适 —— 那时它的压缩与并发才有意义。
 *
 * 用法（在 apps/api 目录下，借它已经装好的 mongoose）：
 *   cd apps/api
 *   node --env-file=.env ../../deploy/snapshot.mjs dump    [目标库名] [输出目录]
 *   node --env-file=.env ../../deploy/snapshot.mjs restore [源库名] [输入目录]
 *
 * 默认库名 studyplan-prod，默认目录 ./.snapshots/<时间戳>
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

/**
 * 为什么用 createRequire 而不是直接 `import mongoose from 'mongoose'`？
 *   这是 pnpm monorepo：依赖装在**各自的包**里（mongoose 在 apps/api/node_modules），
 *   而 ESM 的模块解析是按**文件所在位置**进行的 ——
 *   本文件在 deploy/ 下，默认解析不到，会直接 ERR_MODULE_NOT_FOUND。
 *   这里显式声明"从 apps/api 的依赖里解析"，意图清楚，也不依赖 cwd。
 */
const require = createRequire(new URL('../apps/api/package.json', import.meta.url))
const mongoose = require('mongoose')

const [, , action, dbNameArg, dirArg] = process.argv
const dbName = dbNameArg ?? 'studyplan-prod'

if (action !== 'dump' && action !== 'restore') {
  console.error('用法：node --env-file=.env ../deploy/snapshot.mjs <dump|restore> [库名] [目录]')
  process.exit(1)
}

const baseUri = process.env.MONGODB_URI
if (!baseUri) {
  console.error('缺少 MONGODB_URI（请用 --env-file=.env 运行）')
  process.exit(1)
}

// 只替换库名，其余（用户、密码、集群、参数）沿用
const uri = baseUri.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`)
const masked = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')

const dir = dirArg ?? path.join(process.cwd(), '.snapshots', new Date().toISOString().replace(/[:.]/g, '-'))

console.log(`模式：${action}｜目标：${masked}`)
console.log(`目录：${dir}`)

const conn = await mongoose.createConnection(uri, { maxPoolSize: 2 }).asPromise()

if (action === 'dump') {
  fs.mkdirSync(dir, { recursive: true })
  const collections = await conn.db.listCollections().toArray()

  for (const { name } of collections) {
    const docs = await conn.db.collection(name).find({}).toArray()
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2))
    console.log(`  导出 ${name}：${docs.length} 条`)
  }

  // 元信息：恢复时要按原样重建索引，所以索引也必须一起存
  const indexInfo = {}
  for (const { name } of collections) {
    indexInfo[name] = await conn.db.collection(name).indexes()
  }
  fs.writeFileSync(path.join(dir, '_indexes.json'), JSON.stringify(indexInfo, null, 2))
  console.log(`快照完成：${dir}`)
} else {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== '_indexes.json')
  const indexInfo = fs.existsSync(path.join(dir, '_indexes.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, '_indexes.json'), 'utf8'))
    : {}

  for (const file of files) {
    const name = file.replace(/\.json$/, '')
    const docs = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))

    // 先清空再灌回，避免与快照之后的写入混在一起
    await conn.db.collection(name).deleteMany({})
    if (docs.length > 0) {
      await conn.db.collection(name).insertMany(docs)
    }

    // 索引：`_id_` 是内置的，重复创建会报错，跳过
    for (const idx of indexInfo[name] ?? []) {
      if (idx.name === '_id_') continue
      await conn.db
        .collection(name)
        .createIndex(idx.key, { name: idx.name, unique: Boolean(idx.unique) })
    }

    console.log(`  恢复 ${name}：${docs.length} 条`)
  }
  console.log(`恢复完成：${dir}`)
}

await conn.close()
process.exit(0)
