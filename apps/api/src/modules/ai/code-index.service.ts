import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 索引里一条记录（与构建期脚本生成的 JSON 结构一致） */
export interface CodeIndexEntry {
  /** 相对仓库根的路径，如 `apps/api/src/modules/ai/ai.service.ts` */
  path: string
  /** 所属包：api / web / shared */
  pkg: string
  /** 该文件导出的符号名（正则粗提取，够用即可） */
  exports: string[]
  /** 首部注释摘要 —— 本项目注释密度极高，这往往就是最好的说明 */
  summary: string
}

/**
 * 索引文件的候选路径。
 *
 * 为什么要列好几个？
 *   因为进程的"当前工作目录"在不同环境下并不一致：
 *     · 本地 `pnpm dev`      → apps/api
 *     · 本地 `node dist/main.js` → apps/api（或仓库根）
 *     · 容器里由入口脚本拉起 → 取决于入口脚本怎么 spawn
 *   `process.cwd()` 会跟着变，而 `__dirname`（编译后指向 dist 内）
 *   才是稳定的锚点。这里把几种可能都列上，找到第一个存在的就用。
 *
 * 索引文件由构建期脚本 `scripts/generate-code-index.mjs` 生成，
 * 因为**运行层没有源码**（Dockerfile.vercel 只搬构建产物）。
 */
function candidatePaths(): string[] {
  return [
    join(process.cwd(), 'dist', 'code-index.json'),
    join(process.cwd(), 'apps', 'api', 'dist', 'code-index.json'),
    join(__dirname, '..', 'code-index.json'),
    join(__dirname, '..', '..', 'code-index.json'),
  ]
}

/** 匹配时的停用词：出现频率高但对定位文件毫无帮助 */
const STOP_WORDS = new Set([
  '什么', '怎么', '为什么', '如何', '这个', '那个', '请问', '一下', '可以', '是不是',
  'the', 'is', 'are', 'how', 'what', 'why', 'and', 'for', 'with', 'this', 'that',
])

/**
 * 从问题里提取关键词。
 *
 * 英文按单词切；中文**必须按 2 字滑窗切**，不能整段留着。
 *
 * 为什么？中文没有空格，`[一-龥]{2,}` 会把"后端缓存是怎么设计的"
 * 整段抓成**一个**词。而文件路径里不可能出现这么长的串，
 * 于是这个"关键词"永远匹配不到任何文件 —— 等于白提。
 *
 * 实测教训：问"GitHub 榜单的后端缓存是怎么设计的"，因为唯一有效的
 * 关键词只有 `github`，topK 名额就被 github.client / controller / module
 * 这些同目录文件瓜分了，而**真正实现了缓存的 github.service 反而被挤出去**。
 *
 * 滑窗会产生一些碎片词（"端缓"、"存是"），但代价几乎为零 —— 它们命不中
 * 任何文件。而"缓存"、"刷新"这类真词一旦命中，就是区分同目录文件的决定性一票。
 */
function extractKeywords(question: string): string[] {
  const lower = question.toLowerCase()
  const words = lower.match(/[a-z][a-z0-9_.-]{1,}/g) ?? []
  const runs = lower.match(/[一-龥]{2,}/g) ?? []

  const chinese = runs.flatMap((run) => {
    // 本身就很短的片段（如"缓存"）直接保留，切开反而丢信息
    if (run.length <= 3) return [run]

    const grams: string[] = []
    for (let i = 0; i + 2 <= run.length; i++) {
      grams.push(run.slice(i, i + 2))
    }
    return grams
  })

  // 去重：问题里重复出现的词（比如"GitHub 榜单…请求 GitHub"里的两个 github）
  // 不该被重复计分。否则一个高频词就能把分数刷到盖过真正有区分度的关键词 ——
  // 实测就是它把 github.service 挤出了 topK。
  return [...new Set([...words, ...chinese])].filter((word) => !STOP_WORDS.has(word))
}

/**
 * 代码索引服务：把"用户的问题"映射成"最可能相关的几个源文件"。
 *
 * 刻意**没有用向量检索**：那需要嵌入模型 + 向量库，是两套新依赖。
 * 而本项目的源码文件数量有限、且注释极其详细 ——
 * 关键词匹配 + 注释摘要已经足够准，成本却几乎为零。
 */
@Injectable()
export class CodeIndexService implements OnModuleInit {
  private readonly logger = new Logger(CodeIndexService.name)

  private entries: CodeIndexEntry[] | null = null

  /** 索引是否已加载成功（供 /ai/status 展示） */
  get loaded(): boolean {
    return this.entries !== null
  }

  /**
   * 已加载的索引条数。
   *
   * 为什么新增这个只读计数？
   *   `loaded` 只能回答"有没有读过文件"，而 `load()` 的失败路径会
   *   把 `entries` 置成**空数组**（不是 null），于是"文件根本不存在"
   *   和"成功加载了 100 个文件"在 `loaded` 下都是 `true`。
   *
   *   部署排查时这俩是天壤之别：前者意味着 AI 答"本站代码"会退化成
   *   "资料中没有提到"，后者才是真的就绪。
   *   对外语义以 `fileCount > 0` 为准，正好是部署者最该一眼看清的那条线。
   *   保留 `loaded` 不动（它已有注释与潜在调用方），只做加法。
   */
  get fileCount(): number {
    return this.entries?.length ?? 0
  }

  /**
   * 启动时主动预热索引。
   *
   * 为什么不等第一次提问时再惰性加载？
   *   问题不在性能，而在**可观测性**。索引缺失时，惰性加载要等到用户提问
   *   才在日志里冒出一条 warn —— 而那时人正在看"AI 答非所问"，根本不会
   *   联想到"索引文件压根没生成"。这不是假设：本项目就踩过这个坑，
   *   表现为 AI 回答"资料中没有提到"，全程没有任何报错。
   *   启动即加载，日志里立刻能看到"已加载 N 个文件"或"未找到索引文件"。
   *
   * 这不违反"缺索引不能拖垮应用"的契约：load() 内部吞掉了所有异常，
   * 只会记 warn 并返回空数组，永远不会抛。
   */
  onModuleInit(): void {
    this.load()
  }

  /**
   * 检索与问题最相关的文件。
   *
   * @param question 用户的问题
   * @param topK     返回条数。默认 4：太少容易漏，太多会挤爆 prompt
   */
  async search(question: string, topK = 4): Promise<CodeIndexEntry[]> {
    const entries = this.load()
    if (entries.length === 0) return []

    const keywords = extractKeywords(question)
    if (keywords.length === 0) return []

    const scored = entries
      .map((entry) => ({ entry, score: scoreEntry(entry, keywords) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    return scored.map((item) => item.entry)
  }

  /**
   * 惰性加载索引。
   *
   * 为什么不在构造函数里加载？
   *   因为读文件失败会抛异常，而 AiService 的契约是"永远不抛异常"。
   *   放在构造函数里，一个缺失的索引文件会让**整个应用启动失败** ——
   *   那正是本项目反复强调要避免的"用可选项卡住核心系统"。
   *
   * 所以这里加载失败只记一条 warn 并返回空：
   * 代码问答降级成"没有参考资料"，但 AI 依然能回答，应用照常运行。
   */
  private load(): CodeIndexEntry[] {
    if (this.entries !== null) return this.entries

    for (const candidate of candidatePaths()) {
      try {
        if (!existsSync(candidate)) continue
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as CodeIndexEntry[]
        if (Array.isArray(parsed)) {
          this.entries = parsed
          this.logger.log(`已加载代码索引：${parsed.length} 个文件（${candidate}）`)
          return parsed
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        this.logger.warn(`读取代码索引失败（${candidate}）：${reason}`)
      }
    }

    this.logger.warn('未找到代码索引文件，AI 将无法引用本站代码（其余功能不受影响）')
    this.entries = []
    return []
  }
}

/** 给单个文件打分：路径命中权重最高，其次导出符号与摘要 */
function scoreEntry(entry: CodeIndexEntry, keywords: string[]): number {
  const path = entry.path.toLowerCase()
  const summary = entry.summary.toLowerCase()
  let score = 0

  for (const keyword of keywords) {
    // 路径命中权重最高：用户往往会直接说文件名，如 "ai.service.ts 是干什么的"
    if (path.includes(keyword)) score += 3
    if (entry.exports.some((name) => name.toLowerCase().includes(keyword))) score += 2
    if (summary.includes(keyword)) score += 1
  }

  return score
}
