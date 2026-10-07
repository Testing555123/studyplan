# 依赖版本锁定（核实缺口 #1 关闭）

> **核实时间**：2026-10-07 · **方式**：`npm view <pkg> version` / `npm view <pkg> license` 实测
> **纪律**：全部来自 npm Registry 实测，不凭记忆断言。

## 与 TECH-SELECTION.md 的差异（唯一一处实质漂移）

| 项 | 文档写法 | 实测 | 处置 |
| --- | --- | --- | --- |
| **Vercel AI SDK** | 「6.x」 | **`ai@7.0.130`** | ⚠️ **文档口径已过期**。7.x 是大版本跃迁，**Embedding Model 规范版本可能不再是 `v2`**（`EmbeddingModelV2` → 可能 `V3`）。**必须在 embed PoC 前先读 `ai` 包内类型定义确认**，不得照抄 6.x 的 `doEmbed` 签名。许可证仍为 Apache-2.0，选型结论不变 |
| **Drizzle Kit** | 「Apache-2.0」 | **`drizzle-kit@0.31.11`，MIT** | 仅许可证标注差异，均为宽松许可，不影响合规性结论 |

其余 16 项与文档一致。

## 版本锁定表

| # | 栈项 | 包 | 版本 | 许可证 | 引入批次 |
| --- | --- | --- | --- | --- | --- |
| 1 | 运行时 | Node.js | **24.18.1**（实测本机）| — | 已有（`engines.node >= 22` ✅） |
| 1 | 包管理 | pnpm | **11.20.0** | — | 已有 |
| 2 | 数据 | PostgreSQL | **16.15**（容器 `studyplan-pg`）| PostgreSQL License | 1 |
| 2 | 向量 | pgvector | **0.8.7**（容器内实测）| PostgreSQL License | 1 |
| 3 | 后端基座 | `payload` | **3.90.2** | MIT | 1 |
| 3 | PG adapter | `@payloadcms/db-postgres` | **3.90.2** | MIT | 1 |
| 3 | 富文本 | `@payloadcms/richtext-lexical` | **3.90.2** | MIT | 1（按需） |
| 3 | 迁移工具 | `drizzle-kit` | **0.31.11** | MIT | 1 |
| 4 | 契约 | `zod` | **4.6.5** | MIT | 1/2 |
| 5 | 限流 | `rate-limiter-flexible` | **11.2.1** | ISC | 1 |
| 6 | 缓存 | `lru-cache` | **11.5.3** | **BlueOak-1.0.0**（非 MIT，须在 NOTICE 保留原文）| 2 |
| 7 | GitHub | `octokit` | **5.0.5** | MIT | 2 |
| 9 | AI/Agent | `ai` | **7.0.130** ⚠️ 非 6.x | Apache-2.0 | 4/9 |
| 9 | AI provider | `@ai-sdk/openai-compatible` | **3.0.65** | Apache-2.0 | 4 |
| 9 | 本地嵌入 | `@huggingface/transformers` | **4.3.1** | Apache-2.0 | 4（缺口 #5）|
| 9 | 嵌入权重 | `Xenova/bge-large-zh-v1.5` @ **dtype=q8** | **312 MB** | MIT（模型） | 4 |

> ⚠️ **嵌入模型的两个硬约束**（2026-10-08 实测，详见 `docs/POC-RESULTS.md`）：
> ① 必须用 **`Xenova/bge-large-zh-v1.5`** —— `BAAI/bge-large-zh-v1.5` 仓库**没有 ONNX 文件**，transformers.js 加载不了
> ② 必须用 **`dtype: 'q8'`** —— v4 已移除 `quantized: true`，传旧参数会**静默回退到 fp32（1,238 MB）**
| 10 | Agent 对比 | `@langchain/langgraph` | **1.4.20** | MIT | 9（可选）|
| 8 | LLM 观测 | `langfuse` | **3.39.2** | MIT（`ee/` 除外）| 3/9 |
| 8 | OTel | `@opentelemetry/sdk-node` | **0.223.0** | Apache-2.0 | 3 |
| 8 | OTel 自动埋点 | `@opentelemetry/auto-instrumentations-node` | **0.81.0** | Apache-2.0 | 3 |
| 11 | 文档 | `@nuxt/content` | **3.16.1** | MIT | 10 |
| 11 | 文档检索 | `meilisearch` | **0.62.0** | MIT | 10 |
| 7 | 代码索引 | `ts-morph` | **28.0.0** | MIT | 7 |

## Payload 3.90.2 关键实测属性

| 属性 | 实测值 | 对本项目的影响 |
| --- | --- | --- |
| `license` | MIT | ✅ 合规 |
| `type` | `module`（**纯 ESM**） | ⚠️ `packages/shared` 必须从 CJS 转 ESM |
| `engines.node` | `^18.20.2 \|\| >=20.9.0` | ✅ Node 24.18.1 满足 |
| `dependencies.croner` | `10.0.1` | 佐证 P32：cron 由 `croner` 实现，**无 timezone 字段** |
| `dependencies.uuid` | `13.0.2` | 主键用 uuid，与 P1 DDL 的 `gen_random_uuid()` 一致 |
| `dependencies.pino` | `9.14.0` | 日志走 pino，需对齐现有「截断 160 字符 + 密钥替换 `***`」脱敏约定 |
| `dependencies.jose` | `5.10.0` | JWT 实现，替现状 `jsonwebtoken` + `passport-jwt` |
| `peerDependencies` | `graphql ^16.8.1` | 只在启用 GraphQL 时需要；本项目用 REST，可不装 |

> **注意**：`payload` 主包**不含 drizzle** —— Drizzle 在 `@payloadcms/db-postgres` 内（栈项 #3 的「内置 Drizzle」指这个）。
