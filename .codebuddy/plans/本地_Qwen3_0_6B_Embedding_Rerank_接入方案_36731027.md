---
name: 本地 Qwen3 0.6B Embedding/Rerank 接入方案
overview: 将现有本地嵌入方案从 Xenova/bge-large-zh-v1.5 升级为全套 Qwen3 0.6B（Qwen3-Embedding-0.6B + Qwen3-Reranker-0.6B），均以 transformers.js (ONNX) 在 Node 侧本地运行，1024 维与现有 vector(1024) 对齐无需改表。本次仅实现模型接入层（embed/rerank 封装 + spike 升级 + 文档更新），RAG 检索编排留第二批。
todos:
  - id: embed-layer
    content: 新增 lib/embeddings.ts 封装 Qwen3-Embedding
    status: completed
  - id: rerank-layer
    content: 新增 lib/rerank.ts 封装 Qwen3-Reranker
    status: completed
  - id: spike-upgrade
    content: 升级 scripts/spike-embed.mjs 默认 qwen3
    status: completed
  - id: spike-verify
    content: 运行 spike 验证 qwen3 全套并核对风险项
    status: completed
    dependencies:
      - embed-layer
      - rerank-layer
      - spike-upgrade
  - id: docs-update
    content: 更新决策与选型文档为 Qwen3 0.6B
    status: completed
    dependencies:
      - spike-verify
---

## 用户需求

将现有本地嵌入方案从 `Xenova/bge-large-zh-v1.5` 升级为**全套 Qwen3 0.6B 本地方案**：Embedding 用 `Qwen3-Embedding-0.6B`，Rerank 用 `Qwen3-Reranker-0.6B`，均以 transformers.js（ONNX）在 Node 侧本地运行。

## 产品概述

在项目现有单容器 Next.js 架构内，新增两个模型接入模块，把 RAG 检索链路的第一阶段（嵌入召回）与第二阶段（重排精排）统一替换为 Qwen3 0.6B 开源模型。两者默认输出 1024 维向量 / 相关性分数，与现有 `vector(1024)` 列精确对齐，无需改表。本次仅实现模型接入层，RAG 检索编排（知识库查询接入 rerank、embed-backfill 回填脚本）留待第二批。

## 核心功能

- 新增 `lib/embeddings.ts`：Qwen3-Embedding-0.6B 本地封装，支持批量文本嵌入、query 端指令前缀、last-token pooling、L2 归一化、单例懒加载、环境变量化模型 id 与量化档位。
- 新增 `lib/rerank.ts`：Qwen3-Reranker-0.6B 本地封装，基于 transformers.js 专用 `text-ranking` pipeline 做生成式相关性打分，单例懒加载、环境变量化。
- 升级 `scripts/spike-embed.mjs`：默认改用 Qwen3 全套，新增 reranker 验证分支，保留推理后端检查。
- 本地 spike 实测并核对风险项（维度、pooling、指令格式、text-ranking 可跑性、q8 精度）。
- 更新 `docs/DECISIONS.md` 与 `docs/TECH-SELECTION.md`，将选型改写为 Qwen3 0.6B 全套。

## 技术栈

- 沿用现有栈，无新增依赖：`@huggingface/transformers` 4.3.1（transformers.js）、`onnxruntime-node` 后端（已 spike 验证）、Node 24、TypeScript 5.9、Next.js 16（单容器 `output: 'standalone'`）。
- 向量列：`pgvector` `vector(1024)`（已随第一批 D11 建好骨架），Qwen3-Embedding-0.6B 默认 1024 维精确对齐，不需改 schema。
- 模型权重：`onnx-community/Qwen3-Embedding-0.6B-ONNX` 与 `onnx-community/Qwen3-Reranker-0.6B-ONNX`（官方 transformers.js 支持，Apache 2.0）。

## 实现思路

- **封装分层**：两个独立 lib 模块分别持有各自的 transformers.js pipeline 单例，避免重复加载（模型 ~300–600MB，冷加载 ~18s）；通过环境变量 `EMBED_MODEL` / `EMBED_DTYPE` / `RERANK_MODEL` / `RERANK_DTYPE` 切换，默认 q8 量化。
- **Embedding 关键处理**：`pipeline('feature-extraction', ...)` + `pooling: 'last_token'`（Qwen3 因果 LM 取末 token 隐状态，非 mean）+ `normalize: true`（L2 归一化，与现有余弦距离检索一致）；query 端拼官方指令前缀（检索场景建议 `Represent the query for retrieving relevant passages: `，中文可 `为检索相关文档表示查询：`），document 端不加指令。
- **Rerank 关键处理**：`pipeline('text-ranking', ...)` 为 transformers.js v4 对 Qwen3-Reranker 的专用支持，内部以生成式打分（取 yes/no 特殊 token logits）输出 query-document 相关性分数，直接返回排序结果。
- **降级不变量**：封装层捕获加载/推理异常并抛出明确错误，保留 D9/V5「模型不可用降级到 LLM+网络搜索」的契约（本次仅约定接口与错误语义，编排第二批接入）。

## 实现注意

- 严格遵守 D9 三个已记录坑：① 用 `onnx-community/*-ONNX` 而非非 ONNX 原仓；② transformers.js v4 用 `dtype: 'q8'`，禁用会被静默忽略的 `quantized: true`；③ 模型缓存 `node_modules/.pnpm/.../.cache/` 会被 `pnpm install` 清空，Docker 须显式拷进镜像层（本次编写代码时确保缓存目录与 D11/D14 镜像约定一致）。
- 推理只在独立脚本/后台 job，绝不进入请求路径（D9/D14 约束）；单例确保进程内只加载一次。
- 不新增 npm 依赖、不破坏单容器约束、不改变 `vector(1024)` 物理列与命名映射（snake_case/camelCase 由 Drizzle 单一来源控制）。

## 架构设计

```mermaid
flowchart TD
  A[lib/embeddings.ts] -->|feature-extraction + last_token + normalize| B[Embedding Pipeline 单例]
  C[lib/rerank.ts] -->|text-ranking| D[Reranker Pipeline 单例]
  B --> E[@huggingface/transformers]
  D --> E
  E --> F[onnxruntime-node 后端]
  F --> G[(ONNX 权重: Qwen3-Embedding-0.6B / Qwen3-Reranker-0.6B)]
  G -->|缓存目录需 Docker 显式拷贝| H[(node_modules/.pnpm/.cache)]
```

## 目录结构

```
studyplan-rebuild-test/
├── lib/
│   ├── embeddings.ts   # [NEW] Qwen3-Embedding-0.6B 封装。单例 pipeline('feature-extraction')，last_token pooling，L2 归一化，query 指令前缀，env 化 modelId/dtype，返回 number[][]（1024 维）。
│   └── rerank.ts       # [NEW] Qwen3-Reranker-0.6B 封装。单例 pipeline('text-ranking')，env 化 modelId/dtype，输入 query+documents 返回带 score 的排序结果。
├── scripts/
│   └── spike-embed.mjs # [MODIFY] 默认模型改为 Qwen3-Embedding-0.6B-ONNX，新增 reranker 分支（text-ranking 实测打分），保留后端/维度检查。
├── docs/
│   ├── DECISIONS.md    # [MODIFY] D9 改写为 Qwen3 0.6B 全套（保留已验证后端与降级路径）；D15 Spike 3 补 qwen3 实测数据。
│   └── TECH-SELECTION.md # [MODIFY] 第 9 节 RAG 选型、第 10 节本地嵌入将 bge 改为 Qwen3 0.6B 全套。
```

## 关键代码结构

```ts
// lib/embeddings.ts
export interface EmbedConfig {
  modelId: string   // 默认 onnx-community/Qwen3-Embedding-0.6B-ONNX
  dtype: 'q8' | 'fp16' | 'fp32' | 'int8'
  dimension: number // 1024
}
export function embedTexts(texts: string[], opts?: { isQuery?: boolean }): Promise<number[][]>
export function embedQuery(query: string): Promise<number[]>

// lib/rerank.ts
export interface RankedItem { index: number; score: number }
export function rerank(query: string, documents: string[]): Promise<RankedItem[]>
```