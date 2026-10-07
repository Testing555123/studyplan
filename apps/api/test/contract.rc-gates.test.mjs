/**
 * R-C 契约测试（批次 1③ 验收，对应 poc/p31-password-gates.test.mjs 的两条最小测试）
 * ================================================================================
 * 前提：被测服务已在运行（默认 http://127.0.0.1:3200，可用 PAYLOAD_API_BASE 覆盖）。
 * 运行：
 *   node --test apps/api/test/contract.rc-gates.test.mjs
 *
 * 契约 ①（R-C 闸门 3 · 输出期）：
 *   所有 user 输出的键集合必须 ⊆ PUBLIC_USER_KEYS，
 *   且绝不出现 hash / salt / passwordHash / loginAttempts / lockUntil。
 *   Payload 的 Local API 文档会带出这些内部字段，任何一条绕过
 *   toPublicUser 的路径都会在这里被抓住。
 *
 * 契约 ②（403/404 区分 · 越权不泄露内容）：
 *   「存在但非本人」403，响应体不得包含帖子标题/正文（不泄露内容）；
 *   「不存在」与「非法 id」404。
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.PAYLOAD_API_BASE ?? 'http://127.0.0.1:3200'

/** R-C 闸门 3 允许输出的键集合（与 apps/api/src/routes/users.ts 的 PUBLIC_USER_KEYS 一致） */
const PUBLIC_USER_KEYS = ['id', 'email', 'username', 'avatarColor', 'bio', 'createdAt']
const FORBIDDEN_KEYS = [
  'hash',
  'salt',
  'password',
  'passwordHash',
  'password_hash',
  'loginAttempts',
  'login_attempts',
  'lockUntil',
  'lock_until',
  'resetPasswordToken',
]

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `JWT ${token}` } : {}),
      ...(body ? {} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, text, json: text ? JSON.parse(text) : null }
}

const stamp = Date.now().toString(36)
const aliceEmail = `rc-alice-${stamp}@example.com`
const bobEmail = `rc-bob-${stamp}@example.com`
let aliceToken
let bobToken
let postId

before(async () => {
  // 健康检查：服务没起时给出可读的失败原因，而不是一堆 ECONNREFUSED
  const health = await api('GET', '/api/health')
  assert.equal(health.status, 200, `被测服务不可用（${BASE}），请先启动 node --import tsx src/server.mts`)

  const a = await api('POST', '/api/auth/register', {
    body: { email: aliceEmail, username: `rc-alice-${stamp}`, password: 'Passw0rd!123' },
  })
  assert.equal(a.status, 201, `alice 注册失败: ${a.text}`)
  aliceToken = a.json.data.token

  const b = await api('POST', '/api/auth/register', {
    body: { email: bobEmail, username: `rc-bob-${stamp}`, password: 'Passw0rd!123' },
  })
  assert.equal(b.status, 201, `bob 注册失败: ${b.text}`)
  bobToken = b.json.data.token
})

after(async () => {
  if (postId && aliceToken) {
    await api('DELETE', `/api/posts/${postId}`, { token: aliceToken })
  }
})

test('契约① R-C 闸门 3：user 输出键集合恰好是公开字段，绝无 hash/salt/锁定信息', async () => {
  // 注册响应
  const reg = await api('POST', '/api/auth/register', {
    body: { email: `rc-gate-${stamp}@example.com`, username: `rc-gate-${stamp}`, password: 'Passw0rd!123' },
  })
  assert.equal(reg.status, 201)
  const userKeys = Object.keys(reg.json.data.user).sort()
  assert.deepEqual(
    userKeys,
    ['avatarColor', 'createdAt', 'email', 'id', 'username'],
    '公开用户字段必须恰好是 5 个（无 bio 时），多一个都算泄漏',
  )
  for (const key of userKeys) {
    assert.ok(PUBLIC_USER_KEYS.includes(key), `出现契约外字段: ${key}`)
    assert.ok(!FORBIDDEN_KEYS.includes(key), `出现敏感字段: ${key}`)
  }

  // /me 与 /users/:username 走同一闸门
  const me = await api('GET', '/api/auth/me', { token: aliceToken })
  assert.equal(me.status, 200)
  for (const key of Object.keys(me.json.data.user)) {
    assert.ok(!FORBIDDEN_KEYS.includes(key), `/me 泄漏敏感字段: ${key}`)
  }
  const pub = await api('GET', `/api/users/rc-alice-${stamp}`)
  assert.equal(pub.status, 200)
  for (const key of Object.keys(pub.json.data.user)) {
    assert.ok(!FORBIDDEN_KEYS.includes(key), `/users/:username 泄漏敏感字段: ${key}`)
  }
})

test('契约② 403/404 区分：越权 403 且不泄露内容，不存在/非法 id 404', async () => {
  // alice 发帖（标题/正文含独特标记，用于检测泄露）
  const secret = `rc-secret-${stamp}`
  const created = await api('POST', '/api/posts', {
    token: aliceToken,
    body: { title: `标题${secret}`, content: `正文${secret}`, tags: ['Vue'] },
  })
  assert.equal(created.status, 201, `发帖失败: ${created.text}`)
  postId = created.json.data.id

  // bob 越权改 → 403，且响应体不得包含标题/正文
  const patch = await api('PATCH', `/api/posts/${postId}`, {
    token: bobToken,
    body: { title: 'hijack' },
  })
  assert.equal(patch.status, 403, `越权改帖应 403，实际 ${patch.status}`)
  assert.ok(!patch.text.includes(secret), '403 响应体不得泄露帖子标题/正文')

  // bob 越权删 → 403
  const del = await api('DELETE', `/api/posts/${postId}`, { token: bobToken })
  assert.equal(del.status, 403, `越权删帖应 403，实际 ${del.status}`)

  // 不存在（合法 uuid）→ 404；非法 id → 404（不暴露存储实现）
  const missing = '00000000-0000-4000-8000-000000000000'
  assert.equal((await api('GET', `/api/posts/${missing}`)).status, 404)
  assert.equal((await api('GET', '/api/posts/not-a-uuid')).status, 404)
  assert.equal((await api('PATCH', `/api/posts/${missing}`, { token: aliceToken, body: { title: 'x'.repeat(4) } })).status, 404)
})
