---
name: supplement-functional-gaps
overview: 从 studyplan-v2.0 源码提取功能级行为（健康检查、限流、缓存、AI 状态与降级/额度、RAG 拒答），补写进 docs/SPEC.md（新增继承功能契约章节），并在 docs/TECH-SELECTION.md 增加一节「继承功能缺口对照」，明确各项在新方案中的归属（第一批/第二批/暂缓）。
todos:
  - id: extract-v2-functional-facts
    content: 用 [subagent:code-explorer] 只读提取 studyplan-v2.0 功能事实：health 503 判定、逐路由限流档位与豁免路由、AI 缓存 TTL/键空间、/ai/status 字段与每日额度常量、检索空结果拒答分支、daily_picks 弱引用级联删
    status: completed
  - id: write-spec-inherited-contracts
    content: 在 docs/SPEC.md 新增「§8 继承功能契约」：健康检查、单实例限流行为、AI 答案缓存、/ai/status 状态与降级、RAG 拒答原则，逐项写明契约/验收条目与归属标注（第一批/第二批/暂缓-恢复时须知）
    status: completed
    dependencies:
      - extract-v2-functional-facts
  - id: annotate-spec-section7
    content: 核对并按需在 docs/SPEC.md §7「第一批不做的」补充对新 §8 条目的交叉引用与 R-B 数据建模教训归档（daily_picks 弱引用级联删）
    status: completed
    dependencies:
      - write-spec-inherited-contracts
  - id: write-selection-gap-mapping
    content: 在 docs/TECH-SELECTION.md 末尾新增「§13 继承功能缺口对照」小节：每项缺口 → 新方案归属 → 指向 SPEC §8 / DECISIONS D 编号，注明「模型名配置化」理由补充（对应 D10，不改 D10 原文）
    status: completed
    dependencies:
      - write-spec-inherited-contracts
  - id: consistency-check
    content: 全文一致性检查：新增内容与 D16、SPEC §7 边界无冲突，decisions/选型/spec 三份文档交叉引用有效
    status: completed
    dependencies:
      - annotate-spec-section7
      - write-selection-gap-mapping
---

## 需求概述

对比主支 README（studyplan-v2.0）与 `docs/TECH-SELECTION.md` 后，将**功能级缺口**补写进本仓库文档。范围仅限功能部分，不含可观测性、生产 PG 部署、密钥安全、E2E 快照等基建/运维项。

## 待补写的功能缺口

1. **健康检查**：`/health` 503 语义（依赖不可用才返回 503，供平台判定容器真不健康）
2. **限流行为**：逐路由档位、热门榜单豁免路由（SPEC 仅留 `RATE_LIMITED` 429 错误码，单实例行为无记录；多实例全局限流已被 SPEC §7 显式推迟）
3. **缓存行为**：AI 答案 7 天缓存、键空间隔离、「`ai_answer_cache` 禁 TTL」硬约束
4. **AI 状态与降级**：`/ai/status` 契约（`enabled` / `keyConfigured` / `model` / `remainingToday` / `limitPerDay`）、未配 Key 照常启动降级为「未启用」、每日额度；「模型下线 410 → 模型名必须配置化」的理由未写进 D10（不改 D10，在对照表中注明）
5. **RAG 拒答原则**：「检索为空时宁可拒答」（README 四条贯穿取舍之一；RAG 编排在 TECH-SELECTION §12.3 自研范围内）
6. **数据建模教训（归档）**：`daily_picks.postId` 弱引用 → 级联删静默丢互动数据（R-B），恢复每日精选/互动模块时须知

## 约束

- 事实来源：`C:\Users\User\Documents\studyplan-v2.0` 源码**只读**提取，不凭 README 记忆转写
- 不改动 `docs/DECISIONS.md` 既有 D1–D16
- 新增内容须与 D16 / SPEC §7「第一批不做」边界一致，逐项标注归属（第一批 / 第二批 / 暂缓-恢复时须知）

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 只读探索 `C:\Users\User\Documents\studyplan-v2.0\apps\api\src`（modules/health、modules/ai、app.module.ts、collections 等），提取健康检查判定逻辑、逐路由限流档位与豁免清单、AI 答案缓存 TTL 与键空间、`/ai/status` 字段与额度常量、检索空结果拒答分支、`daily_picks` 弱引用级联删的准确行为
- Expected outcome: 每项功能缺口均有源码级事实（文件路径 + 行为描述），作为 SPEC 补写内容的依据