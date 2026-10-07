// @ts-check
/**
 * P31 · 密码哈希三道闸门在 PostgreSQL / Drizzle 时代的重建
 * =========================================================
 *
 * 现状（Mongoose）的三道闸门与它们在换库后的命运：
 *
 * | 闸门 | 现状实现 | 换 PG 后 | 本文件的重建方式 |
 * | --- | --- | --- | --- |
 * | 1 · 查询期 | `user.schema.ts:57` 的 `select: false` | **消失**（Drizzle/PG 无此概念） | 不存在「默认全列查询」：只提供两个**列清单写死**的专用查询 |
 * | 2 · 编译期 | `UserLean` 接口不含 `passwordHash` | **今天就已经失效** | 两个返回类型是**不同且窄**的 typedef，调用处访问不存在的字段即类型错误 |
 * | 3 · 输出期 | `toPublicUser()` 逐字段挑选 | 可直接移植（纯 TS） | 原样保留，并额外做**输出键集合**校验 |
 *
 * ⚠️ 现状闸门 2 失效的实测证据（code-explorer 全仓核实）：
 *   `apps/api/src/modules/auth/auth.service.ts:181` 与 `:195` 写的是
 *       toPublicUser(user.toObject() as unknown as UserLean)
 *   `as unknown as X` 是**双重断言**，会把 TypeScript 的结构化检查彻底关掉。
 *   所以「接口不含 passwordHash → 编译报错」这条注释所宣称的保护，
 *   在注册 / 登录 / refresh / me 四条路径上**一条都不成立**。
 *   本文件因此**禁止**任何 `as unknown as` 形态的断言。
 *
 * 另注：`.lean()` 在现状里一次都没用过（`users.service.ts` 全方法实测），
 * 所以 `UserLean` 这个「lean 形状」其实从未描述过任何真实查询结果，
 * 它只被用作上面那两处双重断言的目标类型 —— 即它一直是「文档上的闸门」。
 */

import { Pool } from 'pg'

/**
 * 认证用行类型 —— **含** passwordHash。
 * 只由 findAuthByEmail 返回，函数名刻意带 Auth/WithPassword 语义，
 * 让调用处一眼看出「我正在取一个敏感字段」（沿用现状 `findByEmailWithPassword` 的命名约定）。
 * @typedef {Object} UserAuthRow
 * @property {string} id
 * @property {string} email
 * @property {string} passwordHash
 */

/**
 * 公开用行类型 —— **不含** passwordHash。
 * 这是闸门 2 的载体：它与 UserAuthRow 是两个类型，
 * 在 UserPublicRow 上访问 `.passwordHash` 会是编译错误。
 * @typedef {Object} UserPublicRow
 * @property {string} id
 * @property {string} email
 * @property {string} username
 * @property {string|null} bio
 * @property {number} avatarGradient
 * @property {Date} createdAt
 */

/**
 * 对外契约。与 `packages/shared` 的 `PublicUser` 一一对应（6 个字段）。
 * @typedef {Object} PublicUser
 * @property {string} id
 * @property {string} email
 * @property {string} username
 * @property {string} avatarColor
 * @property {string|undefined} bio
 * @property {string} createdAt
 */

/**
 * 认证查询的**显式列清单**（闸门 1）。
 * 只查三列 —— 不查全表再删字段。
 */
export const AUTH_COLUMNS = /** @type {const} */ (['id', 'email', 'password_hash'])

/**
 * 公开查询的**显式列清单**（闸门 1）。
 * 刻意不含 password_hash / updated_at。
 */
export const PUBLIC_COLUMNS = /** @type {const} */ ([
  'id',
  'email',
  'username',
  'bio',
  'avatar_gradient',
  'created_at',
])

/** `toPublicUser` 允许输出的键集合（闸门 3 的机器可校验形式） */
export const PUBLIC_USER_KEYS = /** @type {const} */ ([
  'id',
  'email',
  'username',
  'avatarColor',
  'bio',
  'createdAt',
])

/**
 * 头像渐变色板 —— 与 `packages/shared/src/constants/avatar.ts` 的 `AVATAR_GRADIENTS` 一致。
 * ⚠️ 顺序与长度不可变（改了会让所有人的头像集体跳变）。
 * 这里内联一份是为了让 PoC 不依赖 shared 的构建产物；
 * 正式实现必须改为从 `@studyplan/shared` 导入，避免双份维护。
 */
const AVATAR_GRADIENTS = [
  'from-brand-400 to-brand-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-sky-500 to-blue-600',
]

/**
 * 由任意字符串稳定地得到一个色板下标（与 shared 的实现一致）。
 * @param {string} seed
 * @returns {number}
 */
export function avatarGradientIndex(seed) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997
  }
  return hash % AVATAR_GRADIENTS.length
}

/**
 * 创建闸门实例。
 * @param {import('pg').Pool} pool
 */
export function createUserGates(pool) {
  /**
   * 按 email 查**认证用**数据（含 passwordHash）。
   *
   * 这是唯一被允许读出 passwordHash 的查询。
   * 列清单写死在 AUTH_COLUMNS，不存在「顺便把整行取出来」的写法。
   *
   * @param {string} email
   * @returns {Promise<UserAuthRow | null>}
   */
  async function findAuthByEmail(email) {
    // 显式列清单 —— 不用 SELECT *
    const { rows } = await pool.query(
      `SELECT ${AUTH_COLUMNS.join(', ')} FROM users WHERE email = $1`,
      [email.trim().toLowerCase()],
    )
    const row = rows[0]
    if (!row) return null
    return { id: String(row.id), email: row.email, passwordHash: row.password_hash }
  }

  /**
   * 按 id 查**公开用**数据（不含 passwordHash）。
   * @param {string} id
   * @returns {Promise<UserPublicRow | null>}
   */
  async function findPublicById(id) {
    // 非法 uuid 直接返回 null，而不是让 PG 抛 invalid input syntax
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null
    }
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS.join(', ')} FROM users WHERE id = $1`,
      [id],
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: String(row.id),
      email: row.email,
      username: row.username,
      bio: row.bio ?? null,
      avatarGradient: Number(row.avatar_gradient),
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    }
  }

  return { findAuthByEmail, findPublicById }
}

/**
 * 输出期闸门（闸门 3）。
 *
 * 逐字段挑选，而不是「整体展开再删掉敏感的」。
 * 安全的默认值应该是「不发送」，而不是「发送后记得删」。
 *
 * @param {UserPublicRow} row
 * @returns {PublicUser}
 */
export function toPublicUser(row) {
  return {
    id: String(row.id),
    email: row.email,
    username: row.username,
    avatarColor: AVATAR_GRADIENTS[avatarGradientIndex(row.username)],
    bio: row.bio ?? undefined,
    createdAt: row.createdAt.toISOString(),
  }
}
