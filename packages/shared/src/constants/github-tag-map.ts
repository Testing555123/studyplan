import { isPostTag, MAX_TAGS_PER_POST, type PostTag } from './tags'

/**
 * GitHub 仓库 → 本站标签的映射表。
 *
 * 为什么单独放一个文件：
 *   「每日报道」要把 GitHub 的 `language` / `topics` 翻译成本站白名单里的标签，
 *   而这份映射是**配置而不是逻辑** —— 加一行就能支持一个新话题，不用改任何代码。
 *   把它塞进 service 里，"改个映射"就会变成"改业务代码"。
 *
 * 为什么必须映射、不能直接透传 GitHub 的原值：
 *   `POST_TAGS` 是白名单，后端 DTO 与前端筛选都拿它校验。
 *   GitHub 上的语言名（`Rust`、`Docker`、`Vite`…）大多不在白名单里，
 *   直接存进去会被校验拒绝，所以必须落到已有的标签上。
 *
 * 为什么放在 shared 而不是后端：
 *   前端也可能想按同一套规则预览某个仓库会打到什么标签，
 *   规则只有一份才不会两边不一致。
 */

/** 兜底标签：一个仓库既没匹配到语言、也没匹配到任何话题时用它 */
export const FALLBACK_TAG: PostTag = '工程化'

/**
 * GitHub `language` 字段 → 标签。
 *
 * 这里**只放语言**。NestJS / Nuxt / MongoDB 是框架和数据库不是语言，
 * 它们出现在 `topics` 里，走下面的 `TOPIC_TAG_MAP`。
 */
const LANGUAGE_TAG_MAP: Record<string, PostTag> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  vue: 'Vue',
}

/** GitHub `topics` → 标签。键统一小写、空格转成短横线（见 `normalize`） */
const TOPIC_TAG_MAP: Record<string, PostTag> = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  nodejs: 'JavaScript',
  node: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  vue: 'Vue',
  vue3: 'Vue',
  vuejs: 'Vue',
  nuxt: 'Nuxt',
  nuxtjs: 'Nuxt',
  nuxt3: 'Nuxt',
  nestjs: 'NestJS',
  nest: 'NestJS',
  mongodb: 'MongoDB',
  mongoose: 'MongoDB',
  mongo: 'MongoDB',
  langchain: 'LangChain',
  llm: 'LangChain',
  monorepo: '工程化',
  devops: '工程化',
  docker: '工程化',
  ci: '工程化',
  'ci-cd': '工程化',
  tooling: '工程化',
  'build-tool': '工程化',
  vite: '工程化',
  webpack: '工程化',
  eslint: '工程化',
  testing: '工程化',
  interview: '求职面试',
  'interview-questions': '求职面试',
  'interview-preparation': '求职面试',
  job: '求职面试',
  career: '求职面试',
  book: '读书笔记',
  books: '读书笔记',
  reading: '读书笔记',
  ebook: '读书笔记',
}

/**
 * 归一化：小写 + 去首尾空格 + 空格转短横线。
 *
 * 最后一步是为了让 `interview questions` 和 `interview-questions`
 * 命中同一条规则 —— GitHub 的 topic 两种写法都存在。
 */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

export interface RepoTagInput {
  /** GitHub 的 `language` 字段，可能是 null */
  language?: string | null
  /** GitHub 的 `topics` 数组 */
  topics?: readonly string[]
}

/**
 * 把仓库的语言与话题映射成本站标签。
 *
 * 顺序是**先语言后话题**：语言通常更能代表这个项目的主体技术。
 * 结果已去重，且每一项都过了 `isPostTag` ——
 * 万一有人在映射表里写了个不在白名单里的值，这里会静默跳过，
 * 而不是让发帖请求在校验层 400。
 *
 * @param limit 最多返回几个标签，默认 `MAX_TAGS_PER_POST`
 */
export function mapRepoToTags(
  input: RepoTagInput,
  limit: number = MAX_TAGS_PER_POST,
): PostTag[] {
  if (limit <= 0) return [FALLBACK_TAG]

  const candidates: string[] = []
  if (input.language) candidates.push(input.language)
  for (const topic of input.topics ?? []) candidates.push(topic)

  const tags: PostTag[] = []

  for (const candidate of candidates) {
    const key = normalize(candidate)
    if (!key) continue

    const mapped = LANGUAGE_TAG_MAP[key] ?? TOPIC_TAG_MAP[key]
    if (!mapped) continue
    if (!isPostTag(mapped)) continue
    if (tags.includes(mapped)) continue

    tags.push(mapped)
    if (tags.length >= limit) break
  }

  return tags.length > 0 ? tags : [FALLBACK_TAG]
}
