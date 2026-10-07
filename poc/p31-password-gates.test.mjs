/**
 * P31 · 密码哈希三道闸门的两条最小测试（+ 两条强化）
 * ==================================================
 *
 * 为什么这两条必须有（TECH-SELECTION.md §8.5.3 步骤 3）：
 *   现状三道闸门**全部零测试覆盖** —— `users` 模块的 4 个文件没有一个是 spec。
 *   它们能工作是因为**代码写对了**，不是因为**有东西保证它对**。
 *   一旦有人重构掉其中一道（例如把 `toPublicUser()` 「简化」成 `{...row}`），
 *   **没有任何机制会失败**。本文件就是把「靠自觉」变成「靠测试」。
 *
 * 最小要求（缺一不可）：
 *   ① 按 email 查认证数据 → 结果**含** passwordHash
 *   ② 按 id   查公开数据 → 结果**不含** passwordHash
 *
 * 强化（用于堵住「假通过」）：
 *   ③ `toPublicUser()` 的输出键集合必须**恰好**是那 6 个键
 *      —— 否则把函数改成全量展开也能通过 ①②，因为 ① 根本不经过它
 *   ④ `SELECT *` 确实会带出 passwordHash
 *      —— 反证「约定禁止 select *」不是教条，而是闸门 1 消失后的唯一结构性兜底
 *
 * 运行：
 *   node --test poc/p31-password-gates.test.mjs
 * 依赖：
 *   PG 实例（默认 127.0.0.1:5433 的 studyplan-pg 容器）
 */

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

import {
  createUserGates,
  toPublicUser,
  PUBLIC_USER_KEYS,
  AUTH_COLUMNS,
  PUBLIC_COLUMNS,
} from './p31-gates.mjs'

const HOST = process.env.PGHOST ?? '127.0.0.1'
const PORT = Number(process.env.PGPORT ?? 5433)
const USER = process.env.PGUSER ?? 'postgres'
const PASSWORD = process.env.PGPASSWORD ?? 'postgres'
const DATABASE = process.env.PGDATABASE ?? 'poc_p31'

// 与 poc/p1-schema.sql 中 users 的定义保持一致（换库后以 Payload 集合定义为准）
const USERS_DDL = `
  CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL,
    username        text NOT NULL,
    password_hash   text NOT NULL,
    bio             text,
    avatar_gradient smallint NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX users_email ON users (email);
`

const SEED_EMAIL = 'p31@example.com'
const SEED_USERNAME = 'p31user'
const SEED_HASH = '$2b$10$abcdefghijklmnopqrstuvCn7Yq0Yq1Yq2Yq3Yq4Yq5Yq6Yq7Yq8Yq9'

/** @type {pg.Pool} */
let pool
/** @type {string} */
let seededId

before(async () => {
  // 数据库不存在则先创建（连接 maintenance 库）
  const probe = new pg.Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE })
  try {
    await probe.connect()
    await probe.end()
  } catch (err) {
    if (err?.code !== '3D000') throw err
    const admin = new pg.Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: 'postgres' })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${DATABASE}`)
    await admin.end()
  }

  pool = new pg.Pool({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE })
  await pool.query('DROP TABLE IF EXISTS users')
  await pool.query(USERS_DDL)
  const { rows } = await pool.query(
    `INSERT INTO users (email, username, password_hash, bio, avatar_gradient)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [SEED_EMAIL, SEED_USERNAME, SEED_HASH, 'p31 seed', 2],
  )
  seededId = rows[0].id
})

after(async () => {
  if (pool) await pool.end()
})

describe('P31 · 密码哈希三道闸门', () => {
  test('① 按 email 查认证数据 → 结果含 passwordHash', async () => {
    const gates = createUserGates(pool)
    const row = await gates.findAuthByEmail(SEED_EMAIL)

    assert.ok(row, '应当查到用户')
    assert.ok('passwordHash' in row, '认证查询必须带出 passwordHash')
    assert.equal(row.passwordHash, SEED_HASH, 'passwordHash 值必须与库中一致')

    // 顺带确认「只查了三列」——不多不少
    assert.deepEqual(Object.keys(row).sort(), ['email', 'id', 'passwordHash'])
  })

  test('② 按 id 查公开数据 → 结果不含 passwordHash', async () => {
    const gates = createUserGates(pool)
    const row = await gates.findPublicById(seededId)

    assert.ok(row, '应当查到用户')
    assert.ok(!('passwordHash' in row), '公开查询结果不得包含 passwordHash')
    assert.ok(!('password_hash' in row), '不得泄漏底层列名形态的 password_hash')
    assert.ok(!('updatedAt' in row), 'updatedAt 也不在公开列清单里')

    // 该有的字段都在
    assert.equal(row.email, SEED_EMAIL)
    assert.equal(row.username, SEED_USERNAME)
    assert.equal(row.avatarGradient, 2)
  })

  test('③ toPublicUser 的输出键集合恰好是那 6 个键', async () => {
    const gates = createUserGates(pool)
    const row = await gates.findPublicById(seededId)
    const out = toPublicUser(row)

    assert.deepEqual(
      Object.keys(out).sort(),
      [...PUBLIC_USER_KEYS].sort(),
      '输出键集合必须恰好等于 PUBLIC_USER_KEYS —— 防止有人改成 {...row} 全量展开',
    )
    assert.ok(!('passwordHash' in out))
    assert.ok(!('password_hash' in out))
    assert.equal(typeof out.createdAt, 'string')
    assert.equal(out.id, String(row.id))
  })

  test('④ 反证：SELECT * 确实会带出 passwordHash（故须禁止）', async () => {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [SEED_EMAIL])
    const row = rows[0]

    assert.ok('password_hash' in row, 'SELECT * 会带出 password_hash —— 这正是必须禁止它的原因')

    // 两个显式列清单都不含该列
    assert.ok(!AUTH_COLUMNS.includes('updated_at'), '认证清单刻意只查三列')
    assert.ok(!PUBLIC_COLUMNS.includes('password_hash'), '公开清单刻意不含 password_hash')
    assert.ok(AUTH_COLUMNS.includes('password_hash'), '认证清单必须含 password_hash')
  })

  test('⑤ 非法 uuid 不触达数据库（换库后不能让 PG 抛 invalid input syntax）', async () => {
    const gates = createUserGates(pool)
    assert.equal(await gates.findPublicById('not-a-uuid'), null)
    assert.equal(await gates.findPublicById(''), null)
  })
})
