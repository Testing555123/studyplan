/**
 * 全站标签白名单。
 *
 * 为什么用"白名单"而不是让用户随便打标签？
 *   1. 自由标签必然产生 `vue` / `Vue` / `vuejs` 三种写法，筛选功能立刻失效；
 *   2. 白名单是一份常量，前端拿它渲染选择器、后端拿它做校验，
 *      两边引用同一份定义 —— 新增标签只需改这一行。
 */
export const POST_TAGS = [
  'JavaScript',
  'TypeScript',
  'Vue',
  'Nuxt',
  'NestJS',
  'MongoDB',
  'LangChain',
  '工程化',
  '读书笔记',
  '求职面试',
  'GitHub',
] as const

/** 由数组推导出的联合类型：'JavaScript' | 'TypeScript' | ... */
export type PostTag = (typeof POST_TAGS)[number]

/** 运行时判断某个字符串是不是合法标签（后端 DTO 与前端都用它） */
export function isPostTag(value: string): value is PostTag {
  return (POST_TAGS as readonly string[]).includes(value)
}

/**
 * 「每日 GitHub 项目报道」专用的**来源标签**。
 *
 * 它和其余标签不是一类：其余标签描述"这篇讲什么技术"，
 * 而这个标签描述"这篇从哪来"。单独起名是为了让前端能靠它
 * 识别出报道贴并加角标，也让用户能按它把报道筛出来或筛掉。
 */
export const GITHUB_SOURCE_TAG: PostTag = 'GitHub'

// ---------- 全站共享的数值约束 ----------
// 放在 shared 里，是为了让前端的"字数提示"和后端的校验规则永远一致。
export const MAX_TAGS_PER_POST = 5
export const TITLE_MAX_LENGTH = 80
export const TITLE_MIN_LENGTH = 4
export const CONTENT_MIN_LENGTH = 10
export const CONTENT_MAX_LENGTH = 20000
export const COMMENT_MAX_LENGTH = 500
export const USERNAME_MIN_LENGTH = 2
export const USERNAME_MAX_LENGTH = 20
export const PASSWORD_MIN_LENGTH = 8

/**
 * 密码长度上限是 72，这不是随便定的。
 *
 * bcrypt 算法会把输入**截断到前 72 个字节**（注意是字节，不是字符）。
 * 也就是说，如果不设上限，下面两个不同的密码
 * 会得到完全相同的哈希、互相都能登录成功：
 *
 *   一个非常长的密码A（前 72 字节相同，后面不同）
 *   一个非常长的密码B（前 72 字节相同，后面不同）
 *
 * 用户以为自己设了两个不同的密码，实际上安全性只等于前 72 字节。
 * 显式限制在 72 以内并给出提示，比让这个隐患静默存在要好得多。
 */
export const PASSWORD_MAX_LENGTH = 72

export const POST_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50

/**
 * AI 摘要的最大长度。
 *
 * 放在共享常量里，是因为它同时约束三处：
 *   1. 后端的 Zod Schema（要求模型输出不超过它）；
 *   2. 后端的截断兜底（模型不听话时按它裁）；
 *   3. 前端的卡片布局（摘要按两行截断显示）。
 * 三处用同一个数字，才不会出现"后端存了 300 字、前端布局被撑破"这种事。
 */
export const AI_SUMMARY_MAX_LENGTH = 200
