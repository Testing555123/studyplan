# StudyPlan 重建：现成项目替代性调研

> 调研日期：2026-10-09
> 对象：基于 `docs/SELFBUILD-AUDIT.md` §2 拆解的约 19 处「需自己写代码实现」模块，逐模块评估是否存在现成开源项目 / 框架 / SaaS 可替代，从而减少或消除自建代码
> 配套文档：`docs/SELFBUILD-AUDIT.md`（自建模块统计）
> 交付物：纯调研报告，**不含任何实现代码**

---

## 0. 调研方法与判定标准

### 0.1 依据来源
- **既有选型**：项目自有 `docs/TECH-SELECTION.md`（已含 stars/license/pushed_at，复核日 2026-10-09 的选型结论）。
- **补充核实**：今日（2026-10-09）`web_search` 调研 TECH 未充分评估的方向：AI 聊天 UI、Agent/RAG 框架、限流/安全、错误/类型安全、全栈 RAG 平台。

### 0.2 判定标准（现成项目能否「替代自建」）
1. **许可证**：MIT / Apache-2.0 等可商用开源优先；
2. **部署形态**：可同进程嵌入 Next.js 单容器，不引入独立服务；
3. **约束兼容**：与「数据不出网（本地 Qwen3 嵌入/重排）」「RAG 检索对象仅为电子书」「评论用 Giscus」一致；
4. **剩余自研量**：替代后是否趋近于 0，还是仅"加速通用部分、领域逻辑仍自写"。

---

## 1. 逐模块替代性分析

表头：**#** · **模块（见 Audit §2）** · **现成项目** · **替代程度** · **剩余自研** · **约束兼容性** · **证据**

### 1.1 可近乎零自研替代（2 处）

| # | 模块 | 现成项目 | 替代程度 | 剩余自研 | 约束兼容 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 统一错误/成功包络 + requestId | **next-safe-action**（MIT） | 直接替代自研包络中间件 | 仅声明 `ErrorBodySchema`/`SuccessBodySchema` 对齐层 | ✅ 纯库、同进程 | web_search；对齐 SPEC §1 |
| 16 | AI 助手 UI（全局组件 + useChat 流式） | **assistant-ui**（`@assistant-ui/react`，MIT） | 直接替代手写聊天 UI 组件 | 仅接 `useChat` runtime + 主题 | ✅ 纯 React 组件、shadcn 风格 | web_search：`assistant-ui/react` npm，MIT，streaming/tools/persistence |

> 对比项：
> - `tRPC`（#1 候选）：需另起 API 层，与 App Router 单应用冲突，不取。
> - `CopilotKit`（#16 候选）：更重，带后端 runtime，有违单容器风险，不优先。

### 1.2 可显著加速、但领域逻辑仍自研（2 处，Audit §2 仅有的「纯自研业务逻辑」）

| # | 模块 | 现成项目 | 替代程度 | 剩余自研 | 约束兼容 | 证据 |
|---|---|---|---|---|---|---|
| 10 | RAG 检索编排层 | **Vercel AI SDK**（已选）+ `LlamaIndex.ts` 或 `Mastra` | 框架承担通用编排（嵌入/检索/重排/生成原语） | 检索→重排→拒答→缓存→领域拼接仍产品特有 | ✅ 可同进程、可用本地模型 | TECH §12.3；web_search：Mastra/LangGraph/LlamaIndex 对比 |
| 14 | Agent loop / tool calling | **Mastra**（TS 原生、MIT）或 `LangGraph.js`（1.0 成熟） | 替代手写 ReAct loop | 业务 tool 与状态定义仍自研 | ✅ Mastra 可同进程嵌入 Next.js | web_search：Mastra vs LangGraph.js vs LlamaIndex.ts 2026 |

> 说明：这两块是 Audit §2 中**唯一真正"纯自研业务逻辑"**。采用框架后，从"写编排"降为"配框架 + 胶水"，但领域编排（拒答原则、缓存键、额度）无法被框架消除。

### 1.3 库/SDK/SaaS 已选定、剩余仅为产品特有胶水/配置（约 13 处，无整体替代「现成项目」）

| # | 模块 | 已选方案 | 剩余自研 | 现成项目能否整体替代 | 证据 |
|---|---|---|---|---|---|
| 2 | 脱敏 logger | 引入 `pino`（SPEC 已引用，当前 package.json 未装）+ 自写 redact | redact 规则 + lint 规则 | ❌ 无开箱脱敏库 | SPEC §6.3、V5 |
| 3 | better-auth 接线 + 守卫 | `better-auth`（已选） | D3 三处硬约束接线 + `requireSession` | ❌ 接线必写 | D3、SPEC §2 |
| 4 | 单实例限流 12 档 | `rate-limiter-flexible`（已选，内存） | 档位配置 | ❌ `Upstash` 需 Serverless Redis、`Arcjet` 为 SaaS 无免费层，均违单容器/零外部依赖 | web_search：Upstash vs Arcjet 2026 |
| 5 | Drizzle schema + migrations | `drizzle-orm` + `drizzle-kit` | 表结构定义 | ❌ 表结构产品特有 | D4、D11 |
| 6 | pgvector 检索 SQL + 回填脚本 | `pgvector` + `drizzle` | 自定义 SQL + job | ❌ SQL 产品特有 | D5、D11 |
| 7 | 健康检查 /api/health | Next Route Handler | 查 PG 连通性逻辑 | ❌ 领域健康检查 | SPEC §8.1 |
| 8 | Zod env fail-fast | `zod` | env schema 定义 | ❌ schema 产品特有 | V4 |
| 9 | 电子书阅读页 + 搜索 UI | `fumadocs-ui` + `shadcn` | 页面/布局组装 | ❌ 引擎已提供，组装自研 | D13 |
| 11 | AI status/每日额度 300 | `zod` + `drizzle` | Route + 计数器 | ❌ 领域逻辑 | SPEC §8.4 |
| 12 | AI 答案缓存 | `lru-cache` + `drizzle` | 缓存层 | ❌ 键/失效策略产品特有 | SPEC §8.3 |
| 13 | RAG 拒答原则 | `Vercel AI SDK` `streamText` | prompt + 验收 | ❌ 领域规则 | SPEC §8.5 |
| 15 | Giscus 评论挂载 | `Giscus`（SaaS 零进程） | React 封装 | ❌ 已托管 | D16、§12.5 |
| 17 | Dockerfile + compose | Vercel Container Runtime / `node:24-alpine` | 配置 | ❌ 无现成项目 | D14 |
| 18 | CI 闸门 | GitHub Actions | workflow | ❌ 无现成项目 | V6 |
| 19 | 契约/迁移测试 | `vitest` + `playwright` | 测试用例 | ❌ 无现成项目 | V3、V6、SPEC §5 |

### 1.4 整体平台型方案不适用（重要边界）

| 方案 | 形态 | 与本项目的冲突 |
|---|---|---|
| **Dify** | 独立多容器服务（docker compose 部署，含后端/worker/DB） | 违单容器硬约束 D14；引入外部服务；RAG 知识库与本项目"电子书已在 PG+pgvector"重叠 |
| **RAGFlow** | 独立多容器服务 | 同上；且偏文档解析，与"检索对象仅为电子书"不匹配 |
| **Supabase / Firebase** | 托管 BaaS | D1/D14 已排除（多容器、外部依赖、数据出网风险） |

> 结论：**整体打包替代不可行**。维持「库 + 自研编排」路线，与 TECH §0「每一层用成熟方案，只有业务逻辑自研」一致。

---

## 2. 数量估算与结论

基于 §1 的逐模块判定：

| 替代类别 | 处数 | 占 19 处比例 | 代表模块 |
|---|---|---|---|
| **近乎零自研替代** | 2 | ~11% | #1（next-safe-action）、#16（assistant-ui） |
| **显著加速、领域逻辑仍自研** | 2 | ~11% | #10（Mastra/LlamaIndex）、#14（Mastra/LangGraph） |
| **库/SDK/SaaS 已选、仅产品特有胶水** | ~13 | ~68% | #2–#9、#11–#13、#15、#17–#19 |
| **整体平台替代** | 不可行 | — | Dify/RAGFlow/Supabase |

### 核心结论
- **19 处中约 4 处（21%）可被现成项目显著替代/加速**，其中 2 处（错误包络、AI 助手 UI）近乎零自研。
- **其余 15 处**因产品特有逻辑（表结构、SQL、页面组装、领域编排、配置/测试）或硬约束（单容器、数据不出网），**无法被任何现成项目整体替代**；但其依赖库已选好（better-auth / Drizzle / Fumadocs / Giscus / pgvector / Vercel AI SDK / pino），自研量极低。
- **"完全不自建"不可行**，"把自研降到接近 0"仅在约 1/5 的模块上成立（错误包络 + AI 助手 UI + RAG/Agent 框架加速）。
- 真正必须手写的**核心业务逻辑仅 2 块**（RAG 编排、Agent loop），且均有框架可加速。

### 采纳建议（若决定采用）
1. **#1** 改用 `next-safe-action` 替代自研包络，删除 Audit §2 中对应的自研中间件项。
2. **#16** 改用 `assistant-ui` 替代自研聊天 UI 组件，删除对应自研项。
3. **#10 / #14** 评估引入 `Mastra`（TS 原生、可同进程）承担通用 Agent/RAG 编排，保留领域编排为胶水层。
4. 其余 13 处维持既有选型，无需变更。

---

## 3. 与既有文档的关系

- 本文件是 `docs/archive/SELFBUILD-AUDIT.md` 的**补充调研**，回答"这些自建模块能否用现成项目替代"。本文件与配套 Audit 均已归档至 `docs/archive/`。
- 若采纳 §2 建议，**Audit §2 的 19 处将修订为**：2 处删除（#1、#16）、2 处降级为"框架加速+胶水"（#10、#14）、15 处不变 → 仍约 17~19 处需交付，但纯自研业务逻辑从 2 块降为「框架配置 + 胶水」。
- `PROJECT-ANALYSIS.md` 仍为已推翻的旧 Nuxt 项目分析，与本调研无关。
