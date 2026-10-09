# 决策日志

> 每条记录：决策 / 理由 / 代价 / 回退路径。
> 调研数据见 `TECH-SELECTION.md`，契约与验收见 `SPEC.md`。

## D1 · 换栈：Nuxt 4 → Next.js 16

**决策**：全栈框架用 Next.js 16（App Router）+ React 19。

**理由**：143,035★ vs Nuxt 60,928★（2.35 倍）。标尺是"遇到报错能否搜到答案"，这个差距就是答案本身。换栈成本被两点削弱：① 已决定代码完全从零重写，Vue 代码不是沉没成本；② 换栈后不再需要 `@nuxt/content` + `better-sqlite3`，v2.0 的「Nuxt Content 干净构建不可复现」P0 整类消失，Alpine 镜像不必再装编译工具链。

**代价**：用户在 v2.0 的 Nuxt 经验作废；设计令牌需从 `lucide-vue-next` 切到 `lucide-react`、从 Nuxt UI 切到 shadcn/ui；电子书要用 Fumadocs 替代 Nuxt Content。

**回退**：不适用（已确认）。

---

## D2 · 本批次不引入 Payload

**决策**：不用 Payload，改用 better-auth + Drizzle。

**理由**（两次反转，如实记录）：
- 第一次排除：Payload 是 "fullstack **Next.js** framework"，配 Nuxt 只能走 standalone 次路径，社区答案少。
- 换到 Next.js 后该理由**反转**——Payload 可 `install directly in your existing /app folder`，装进 Next.js 应用**同一进程**，回到主路径。
- 但仍不采用：① v4 在 canary 且近乎每日发布（canary.37/38/39 = 09-24/10-07/10-08），稳定版仍是 v3.90.2（09-23），此刻上 v3 意味不久面对 v4 大版本迁移；② 第一批不需要 admin panel；③ better-auth + Drizzle 更轻。

**代价**：失去开箱即用的 admin panel、collections 抽象与迁移工具。

**回退**：后续批次需要 admin 时，直接把 Payload 装进 `/app` 目录（同进程，无架构冲突）。

---

## D3 · 认证交给 better-auth，不碰三处硬约束

**决策**：认证原语（密码哈希、会话存储、登录登出）全部交给 better-auth 1.7.7。

**Next.js 侧三处硬约束**：
1. Route Handler 必须用 `toNextJsHandler(auth.handler)`（不是 Nuxt 的 `toWebRequest`）；
2. **必须加 `nextCookies()` 插件**——否则 Server Action 中调用 `signIn` / `signOut` 无法写回 cookie；
3. Next.js 15+ 的 `headers()` / `cookies()` 是**异步**的，必须 `await`。

**理由**：30,220★ / MIT / 当天活跃，官方有 Next.js 与 Nuxt 双集成文档。自研认证（refresh/logout/Token scheme/401 重放）是文档 §3.2 七条断链里四条的根因。

**代价**：受 better-auth 的表结构约束（user / session / account / verification 四表）。

**回退**：better-auth 出问题可换 `next-auth`；业务表不依赖其内部结构，只外键引用 user id。

---

## D4 · ORM 用 Drizzle 而非 Prisma

**决策**：Drizzle ORM + drizzle-kit 0.45.2。

**理由**：纯 TS **无原生二进制**（Alpine 单容器少一个编译风险点，我们刚被 `better-sqlite3` 绊过一次）；pgvector 支持更好；better-auth 官方示例即为此组合。

**代价**：生态与调试工具（Prisma Studio）不如 Prisma（47,695★ vs 35,979★）。

**回退**：schema 层换 ORM 的成本集中在 `db/` 与 `lib/` 数据访问层，业务层不受影响。

---

## D5 · 计数用 PostgreSQL 触发器

**决策**：`comment_count` / `like_count` 由数据库触发器在互动行增删时原子增减。

**理由**：从根上消除文档 P1「互动记录与计数两步写导致漂移」。触发器是 PostgreSQL 内置成熟机制，不是自研逻辑；服务层只写一条互动记录。保留 v2.0 验证过的 `GREATEST(0, …)` 语义兜底，永不出现负计数。

**代价**：测试必须进真实数据库（CI 需起 PG）。

**回退**（按优先级）：
1. 触发器在 Windows 本地链路出问题 → 退回 v2.0 已验证的服务层原子 SQL `UPDATE … SET x = GREATEST(0, x + delta) RETURNING x`；
2. 仍有问题 → 列表/详情直接 `COUNT(*)` 子查询，永远正确，数据量上千后再优化。

配套 `scripts/reconcile-counters.mjs` 对账与修复命令——**提供对账，而不是假装强一致**。

> 社区模块反转（D16）后暂无互动表，触发器暂挂，机制保留待复用。

---

## D6 · 单包单应用，不设 pnpm workspace

**决策**：不拆 `apps/*` + `packages/*`，前后端同包。

**理由**：单进程架构下没有跨包契约问题；Nuxt/Nitro 时代需要 `packages/shared` 是因为有跨进程边界，Next.js 单应用不存在这个边界。少一层就少一处错配。

**代价**：若未来拆出独立服务需重新划分。

**回退**：需要时再拆，成本可控。

---

## D7 · Markdown 走 MDX，不引入 markdown-it

电子书走 Fumadocs 的 MDX 管线，零额外依赖、样式统一。社区模块反转（D16）后不再有帖子正文，MDX 现在只服务电子书。

---

## D8 · 乐观更新用 `useOptimistic`

用 React 19 内置 `useOptimistic` + Server Actions，不引入 TanStack Query。社区模块反转（D16）后评论走 Giscus、点赞移除，暂无可做的本站乐观更新，机制保留。

---

## D9 · Embedding / Rerank 本地跑 Qwen3 0.6B 全套（含一手证据）

**决策**：本地跑**全套 Qwen3 0.6B** —— `Qwen3-Embedding-0.6B`（嵌入，1024 维）+ `Qwen3-Reranker-0.6B`（重排，生成式 yes/no 打分），均用 transformers.js（ONNX）在 Node 侧推理；Apache-2.0 可商用。

**理由（实证优先）**：D9 第一版选定 `Xenova/bge-large-zh-v1.5`（1024 维，已 spike 全绿）作为第一代本地嵌入。经 2026-10-09 调研与实测，升级为 Qwen3 0.6B 全套：
- 维度同为 1024，与现有 `vector(1024)` 精确对齐，**不需改表**；
- Qwen3-Embedding-0.6B 多语言 MTEB 平均 64.33，接近自家 8B（70.58）的九成，且 32K 上下文优于 bge；
- 补上 Rerank 短板：Qwen3-Reranker-0.6B MTEB-R 65.80、MTEB-Code 73.42，是本地 32K 开源重排器里的最小档；
- 已 spike 实测全套全绿（见 D15 Spike 4）。**已验证的组合优先于纸面更强的组合。**

**Qwen3 接入要点（必须遵守，已落地 lib/embeddings.ts、lib/rerank.ts）**：
1. Embedding：`onnx-community/Qwen3-Embedding-0.6B-ONNX` + `pipeline('feature-extraction')` + `pooling:'last_token'` + `normalize:true`（Qwen3 因果 LM 取末 token 隐状态，非 mean）；query 端拼官方指令前缀，且 tokenizer 须 `padding_side='left'`；
2. Reranker **不能用 `pipeline('text-ranking')`**（那是传统 cross-encoder 单 logit 接口）。它是生成式重排器，须 `AutoModelForCausalLM` + 构造 `<Query>/<Document>/<score>` prompt，取末 token 的 yes/no token logits 做 softmax 归一化；
3. 两个模型均有官方 ONNX 权重（onnx-community 组织，Apache-2.0），用 `dtype:'q8'`；禁用会被静默忽略的 `quantized:true`；
4. 模型缓存 `node_modules/.pnpm/.../.cache/` 会被 pnpm 清空，**Docker 必须显式拷进镜像层**；
5. Reranker 为 stateful 模型，**必须串行推理**（并发会污染 KV cache 状态），且两模型均单例懒加载，进程内只加载一次。

**代价**：镜像体积增加（两模型 ~600MB q8）；冷启动需加载（实测 embedding ~36s、reranker ~71s 含首次下载）；Node 主线程推理会阻塞事件循环（故只在独立脚本/后台 job，绝不在请求路径）；Reranker 串行逐条前向，top-50 候选约 45s。

**缓解**：模型权重构建期预下载或挂载卷；嵌入回填只走独立脚本/后台 job；reranker 串行开销对 rerank 候选集（通常 20–50 条）可接受，且不在请求路径。

**回退**（明确路径）：spike 验证任一环节失败 → 优先尝试 WASM 后端 → 仍不行则回退托管 API（SiliconFlow / DashScope）。**仅替换 provider 适配层，业务代码不变。**

**降级（硬性要求）**：模型不可用时 AI 助手必须降级到「LLM + 网络搜索」兜底，不得崩溃。对应不变量 V5「观测配置失效不能阻止业务启动」。

---

## D10 · LLM 走 OpenAI 兼容端点，可配置

**决策**：用 AI SDK 的 OpenAI 兼容 provider，`baseURL` / `apiKey` / `model` 全部环境变量化。

**理由**：可接 DeepSeek / 通义 / 智谱 / Kimi 任一家，换供应商不改代码；规避单一供应商可用性风险。

**代价**：不同供应商的 tool calling 与流式格式有细微差异，需在集成测试里覆盖。

**回退**：差异过大时锁定单一厂商官方 provider。

---

## D11 · RAG 地基进第一批，实现放第二批

**决策**：第一批只建 `knowledge_chunks` 表 + `vector(1024)` 列 + pgvector 扩展 + 回填脚本**骨架**（dry-run），不做真实嵌入；HNSW 索引也延到第二批。

**理由**：与「空库起步但预留迁移接口」同一逻辑——**改表会破坏 migration 基线，先建好再填充比后补便宜**。HNSW 在小数据量下只会拖慢写入，等真有数据再建。

**代价**：第一批结束时向量列是空的。

**回退**：不适用。

---

## D12 · 命名统一：物理列 snake_case，TS 侧 camelCase

**决策**：Drizzle schema 单一来源控制命名映射。

**理由**：**[修正 v2.0 的真实 bug 源]**——v2.0 同时存在 camelCase（`likeCount`，collection 层）与 snake_case（`like_count`，SQL 层），`toPostContract` 读一种、`adjustPostCounter` 读另一种。新项目不存在两套。

**回退**：不适用。

---

## D13 · 电子书无 frontmatter，目录顺序靠 `meta.json` 或文件名前缀

**决策**：Fumadocs 的目录树不依赖 frontmatter 排序。

**理由（只读提取 v2.0 所得）**：29 篇正文**根本没有 frontmatter**，标题取自正文首个 `#`；没有 `order` 字段，顺序靠文件名数字前缀（`01-`、`stage-1`）与手写分组。只有根目录 `index.md` 有 VitePress 风格的 `layout/hero/features`。

**代价**：目录树需显式维护 `meta.json`（或按文件名前缀排序）。

**回退**：若需更灵活排序，可为 30 篇批量补 frontmatter（内容资产可改，但需确认不破坏正文）。

---

## D14 · 单容器：standalone 产物，CMD 用 node 绝对路径

**决策**：`output: 'standalone'`，Dockerfile 拷贝 `.next/standalone` 后运行 `server.js`。

**硬约束**：`CMD` 必须写 **`/usr/local/bin/node`** 绝对路径。

**理由**：v2.0 已实证——平台在容器启动命令前注入的证书入口包装脚本**不保留镜像的 PATH**，用裸 `node` 会 `exec: ... not found`，且运行日志里看不到任何应用输出，极难定位。

**代价**：无。

**回退**：不适用。

---

## D15 · 阶段 1 三处 spike 结果（已执行，2026-10-09）

| # | spike | 结果 | 结论 |
| --- | --- | --- | --- |
| 1 | Fumadocs MDX 能否直接处理 `.md` | ✅ **通过** | `.md` 被正常收录（`.source/server.ts` 中 `spike-plain.md` 与 `spike-mdx.mdx` 同在 docs 集合），构建产出 `/ebook/spike-plain` 路由。**30 篇内容资产不需要改扩展名。** |
| 2 | `next.config.mjs` + ESM-only 构建 | ✅ **通过** | Next.js 16.4.0 + Turbopack 在 Windows / Node 24 下构建成功，类型检查通过 |
| 3 | transformers.js 本地推理 | ✅ **通过** | 见下方实测 |

### Spike 3 实测数据（本机 Windows + Node 24）

```
模型加载完成：18,627 ms        （首次含 312MB 模型下载）
2 条文本嵌入完成：240 ms        （单条约 120 ms）
维度：2, 1024                  ← 与 vector(1024) 精确对齐
```

**关键修正（推翻原担忧）**：v2.0 的 `pnpm-workspace.yaml` 写了 `onnxruntime-node: false`，初版计划据此担忧本地推理不可行。实测表明：

- `onnxruntime-node@1.30.0` 在 Windows 上**安装成功**（postinstall 完成，46s），无需本地编译工具链（走预编译二进制）；
- 模型沿用 v2.0 已验证的 `Xenova/bge-large-zh-v1.5` + `dtype: 'q8'`，维度 1024，与 schema 对齐。

因此 **D9 的回退路径暂不需要启用**，本地模型路线按原计划推进。

### Spike 4 · Qwen3 0.6B 全套本地推理（2026-10-09）

全套本地推理实测全绿，D9 升级的 4 个风险项全部通过：

| 模型 | 加载 | 单条/每条 | 维度 / 打分 | 结论 |
| --- | ---:| ---:| --- | --- |
| Qwen3-Embedding-0.6B (q8) | 35,816 ms（含 ~312MB 下载） | ~200 ms | 1024 维；相关 0.7620 / 无关 0.4370 | last_token pooling + 指令前缀生效，对齐 vector(1024) |
| Qwen3-Reranker-0.6B (q8) | 71,472 ms（含 ~300MB 下载） | ~900 ms（串行） | yes/(yes+no)；相关 0.9975 / 0.9610 / 无关 0.0001 | 生成式 yes/no 打分方向正确 |

风险项核对：① `feature-extraction` 的 `pooling:'last_token'` 支持且语义正确；② 维度确为 1024；③ Reranker 须用底层 `AutoModelForCausalLM`（非 `text-ranking` pipeline），已落地 lib/rerank.ts；④ q8 精度满足基线（相关/无关明显分离）。原计划 D9 的 bge 方案正式升级为 Qwen3 0.6B 全套。

### Spike 过程中另外修正的三处 Fumadocs 16 API

1. `createMDX` 在 `fumadocs-mdx/next`，不是 `fumadocs-mdx/config`；
2. `.source` 产物入口是 `server` / `browser` / `dynamic`，不再是 `index`；且 `create.doc()` 导出的是数组，需改用顶层 `toFumadocsSource(docs, [])`；
3. `StructuredDataHeading` 是 `{ id, content }`，**没有 `depth` / `value`**；正文直接取 `page.data.body`（已编译 MDX 组件），不需要 `load()`。

另外：29 篇正文无 frontmatter，Fumadocs 默认 schema 要求 `title` 必需会构建失败——已在 `source.config.ts` 放宽为 optional，由 `lib/ebook-title.ts` 从 `structuredData.headings[0].content` 兜底。

---

## D16 · 社区模块反转：砍主帖+点赞，评论改用 Giscus（2026-10-09）

社区内容不重要，所以原来要求评论进自有 PG、计数强一致、SSR 渲染、绑 better-auth 的硬约束不再适用。放松后 Giscus（GitHub Discussions 托管、SaaS 零进程）的缺点都不再是问题，反而比独立评论服务更契合单容器。主帖 `posts` 与点赞 `likes` 没有承载价值，一并移除，评论挂在电子书/页面下。RAG 仍只检索电子书。

若以后社区变重要，重启自研 `posts`/`comments`/`likes`，或整体换 Discourse。
