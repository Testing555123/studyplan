---
name: 社区模块决策反转：Giscus 替代自研评论并砍掉主帖/点赞
overview: 用户确认「社区内容不重要」后，反转 TECH-SELECTION.md §12 原「帖子/评论/点赞维持自研」裁定：砍掉主帖(posts)与点赞(likes)自研，评论改用 Giscus（SaaS，契合单容器、GitHub 登录可接受）；RAG 仍只检索电子书（既定不变）。交付为纯文档修订（不含 Giscus 落地代码），需同步 TECH-SELECTION.md、SPEC.md、DECISIONS.md 三处，并新增一条决策日志记录本次反转（参照 D2 的「如实记录反转」风格）。
todos:
  - id: revise-tech-selection
    content: 修订 TECH-SELECTION.md §12：裁定改为 Giscus、新增 §12.5 接入设计要点
    status: completed
  - id: revise-spec
    content: 同步 SPEC.md 社区契约章节（§2/§3/§5/§6/§1.3/§7）移除帖子评论点赞
    status: completed
    dependencies:
      - revise-tech-selection
  - id: revise-decisions
    content: DECISIONS.md 新增 D16 记录反转，并标注 D5/D7/D8 社区相关条目
    status: completed
    dependencies:
      - revise-tech-selection
---

## 用户需求
将本轮社区反转相关的决策文档改简短，并严格遵循"已推翻的决策仅保留原因"原则。

## 精简原则
- **被推翻项仅留原因**：原"自研社区"裁定（TECH-SELECTION §12）、D7 的"帖子正文走 MDX"、D8 的"评论/点赞用 useOptimistic"已被推翻，删除其原决策详述（理由/代价/回退中社区相关部分），只保留一句"为何被推翻：社区模块反转（见 D16）"。
- **D16 缩为简短反转原因**：保留核心因果（社区内容不重要 → 放松进 PG/强一致/SSR-SEO/绑 better-auth 硬约束 → Giscus 的 SaaS 零进程反而契合单容器、主帖点赞无承载价值移除），去掉长列表式理由/代价/回退，最多留一行极简回退。
- **未推翻部分保留但压缩**：D5 触发器机制、D7 MDX 服务电子书、D8 useOptimistic 机制、RAG/技术选型内容保留，仅缩短新增标注。
- **SPEC 作为契约**：保留指明 schema/错误码/不变量失效的必要行内标注，但去掉冗长 blockquote，§2 代码块内三处废弃注释合并为极简。

## 涉及文档
- `docs/DECISIONS.md`（D16、D5/D7/D8 标注）
- `docs/TECH-SELECTION.md`（§12.0/§12.1/§12.3/§12.4/§12.5）
- `docs/SPEC.md`（§1.3、§2、§3、§5、§7 的标注）

## 不在范围
- 不改动 RAG/Spike/技术选型（D9–D15、§9–§11）等未推翻内容。
- 不删除仍生效的领域对象（PublicUserSchema、HealthStatusSchema）。
- 不落地 Giscus 组件代码。

## Agent Extensions
### Skill
- **humanizer**
  - Purpose: 精简并重写三份决策文档的文字，去除 AI 腔、冗余列举与 stock phrases，使表述简短自然；同时落实"被推翻项仅留原因"的结构性要求，不改变事实与引用关系。
  - Expected outcome: 三份文档字数明显缩短、文字自然；D16 变短；被推翻决策不再有原决策详述，只留"为何被推翻"的原因；SPEC 契约失效标记仍清晰。
