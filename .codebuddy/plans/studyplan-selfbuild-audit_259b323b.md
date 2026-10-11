---
name: studyplan-selfbuild-audit
overview: 统计 studyplan-rebuild-test（Next.js 16）从现状到目标态还需自建的功能模块数量，逐项拆解并标注可复用库（better-auth / shadcn / Drizzle / Vercel AI SDK 等）。
todos:
  - id: confirm-scope
    content: 确认统计口径：以 docs/ 为目标态，澄清与 PROJECT-ANALYSIS.md 冲突
    status: completed
  - id: inventory-current
    content: 盘点现状已落地资产，确认非自建缺口项（embeddings/rerank/fumadocs/ui/auth/drizzle 等）
    status: completed
    dependencies:
      - confirm-scope
  - id: breakdown-selfbuild
    content: 逐项拆解需自建模块，标注可复用库、自研性质与 spec/decision 证据
    status: completed
    dependencies:
      - inventory-current
  - id: tier-estimate
    content: 汇总数量估算与第一批/第二批划分，附完整平台口径扩展清单
    status: completed
    dependencies:
      - breakdown-selfbuild
  - id: produce-report
    content: 产出统计分析文档（拆解表 + 分层数量估算 + 关键假设）
    status: completed
    dependencies:
      - tier-estimate
---

## 用户需求

统计当前 Next.js 项目「studyplan-rebuild-test」从现状到目标态还需自建的功能模块数量，要求逐项拆解，并标注哪些可用现有库（better-auth、shadcn、Drizzle、Vercel AI SDK 等）加速。

## 统计口径与关键假设

- **范围**：以当前项目自己的 `docs/`（SPEC / TECH-SELECTION / DECISIONS）为「目标态」，即现状到目标态的缺口。
- **「自建」定义**：需自己写代码实现的功能（相对直接调用现成库 / SDK / 托管服务）。例如 better-auth 配置即完成不算自建，但其接线、守卫、限流档位仍属自研；shadcn 组件不算自建，但页面 / 布局 / Server Actions 的组装算自研。
- **关键冲突澄清**：根目录 `PROJECT-ANALYSIS.md` 描述的是另一个已被推翻的旧 Nuxt4 monorepo（D1 换栈 Next、D16 社区模块反转），不再作为目标态；本次统计以 `docs/` 为准，交付物中需点明此冲突。
- **目标态边界（由 D16 + SPEC §7 显式划定）**：主帖/点赞已移除、评论改 Giscus（SaaS 零进程）、第一批不做 GitHub 趋势/每日推荐与 cron/Meilisearch/路线进度与面试题/帖子编辑删除 UI/个人主页/真实 Mongo 导入/多实例全局限流/admin 后台；RAG 检索对象仅为电子书。

## 数量估算（初判）

需自己写代码实现的模块约 **18–22 处**，分层如下：

- 横切 / 基础设施约 8 处：统一错误/成功包络 + requestId 中间件、脱敏 logger + 禁 console.* lint、better-auth 接线 + 守卫、单实例限流 12 档、Drizzle schema + migrations、pgvector 检索 SQL + 嵌入回填、健康检查 503 语义、Zod env fail-fast。
- 业务功能约 8 处：电子书阅读页 + 目录/上下篇 + 搜索 UI、RAG 检索编排层（核心自研）、/api/ai/status + 每日额度 + 降级、AI 答案缓存、RAG 拒答原则、Agent loop / tool calling、Giscus 评论挂载、AI 助手 UI。
- 运维 / 测试约 3–4 处：Dockerfile + docker-compose、CI 闸门、契约/迁移测试。

若用户坚持采用「完整平台」字面口径（含 GitHub 趋势/仓库详情/AI 简介、每日推荐+cron、路线进度、面试题、个人主页、帖子编辑删除、admin），则额外 +8~10 处。