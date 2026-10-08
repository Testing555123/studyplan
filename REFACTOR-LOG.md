# 重构日志 · refactor/payload-pg

> 本分支承载下一阶段重构：**Payload 3 + PostgreSQL 16 (pgvector) + Nuxt Content 3 + Vercel AI SDK**。
> 验证通过后以 **Squash 合并**并入 main；失败则直接弃掉本分支，main 不受影响。

## 分支信息

- 基于：`main` @ `da94fd8`（2026-10-07，含五/六轮技术选型文档与 PoC 成果同步）
- 权威依据：[`TECH-SELECTION.md`](./TECH-SELECTION.md) §0 最终裁定；[`docs/archive/tech-selection/final-stack.md`](./docs/archive/tech-selection/final-stack.md)
- 现状基线：[`FUNCTIONALITY.md`](./FUNCTIONALITY.md)（124 条功能需求）；重构批次：[`REFRACTOR-SPEC.md`](./REFRACTOR-SPEC.md)（11 批次）

## 开工指引（后续会话从这里继续）

1. `git checkout refactor/payload-pg`
2. 先做 PoC 第①组（无环境依赖，约 3.5h）：
   - P2 `trust proxy` + curl 验证
   - P3 `afterOperation` 查文档（已裁定会等待 Promise，处置代码不变）
   - P7 NIM 端点 20 行验证（需配置 `NVNIM_API_KEY`，当前为空串）
   - P32 cron 时区源码 grep（已裁定不支持 timezone，影响 D12 回退方案 C = BullMQ）
3. 再做第②组（需决策）：PG 实例区域 + R-A 缓解验证
4. 真阻塞项：③ schema 迁移验证包（P1+P30+P31+缺口#4，约 2d）、④ 文档迁移（P19，约 1d）

## 已知风险（换库三大静默失效）

| # | 风险 | 对策 |
| --- | --- | --- |
| R-A | 6.6s 延迟尖峰（Vercel 美东 → Atlas 新加坡跨区） | 同区部署 + 连接池 + 重新实测 |
| R-B | `daily_picks.postId` 弱引用级联失效 | PG 外键 + 显式级联 + 补测试 |
| R-C | `select: false` 三道闸门无 PG 等价物 | 重建闸门 + 补两条测试 |

## 合并流程（重构完成时）

```bash
git checkout main
git fetch origin && git merge --ff-only origin/main   # 确保主干最新
git merge --squash refactor/payload-pg                # 压缩并入
git commit                                            # 一条干净的合并提交
git push origin main
git branch -D refactor/payload-pg                     # 弃分支
git push origin --delete refactor/payload-pg
```

若重构效果不佳：直接弃分支（`git branch -D` + 删远程分支），main 无需任何回退操作。

## 进度记录

| 日期 | 内容 |
| --- | --- |
| 2026-10-07 | 分支创建，记录开工基线；本提交同时用于端到端验证 Squash 合并流程 |
| 2026-10-08 | 批次 1② 偏差处置 + 1③ + 1④ 完成：`idType:'uuid'`/`tags` 改 json 并重建 `payload_dev` 复测通过；五个域（auth/users/posts/comments/likes）迁移为 Payload Local API 路由（`apps/api/src/routes/`）；R-B 两层静默失效已修；R-C 闸门落在 `routes/users.ts` + `test/contract.rc-gates.test.mjs`（2/2 全绿）；`packages/shared` 转 ESM（移除 nuxt.config CJS 兜底，Nuxt build + SSR 冒烟通过）。新陷阱实录：`payload.auth()` 必须传 Web `Headers` 实例；drizzle 不把 JS 数组绑成 PG 数组；Payload 唯一冲突有两种形态（ValidationError "Value must be unique" / 23505）。已知缺口：auth 的 refresh-cookie 轮换、AI 发帖增强留待批次 6 / 4 |
| 2026-10-08 | **批次 2 完成**（Zod 4 替 class-validator / lru-cache 替手写答案缓存 / Octokit 替 259 行 GitHub client，栈项 ④⑥⑦）。新增 3 个测试文件共 41 条用例，`apps/api` 全量 jest 12 suites / 169 tests 全绿、`tsc --noEmit` 无报错。细节、实测代价与踩坑见 [`docs/REFACTOR-BATCHES.md`](./docs/REFACTOR-BATCHES.md) 的「批次 2 完成」一节。三件事需要决策：① `.github/workflows/ci.yml` 被 `d8ac2e1` 误删（main 上仍在）；② 批次 1 的 CJS→ESM 让后端单测**从此没跑过**（jest 配置是 CJS 语法、shared 的 `.js` 后缀解析不了），本轮已修；③ 选型文档里「lru-cache `namespace` 选项」在 v11 不存在，键空间隔离改用「一空间一实例」表达 |
