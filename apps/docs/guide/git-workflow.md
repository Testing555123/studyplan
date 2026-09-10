# Git 工作流

## 一、为什么一个人写代码也要用分支

"只有我一个人，直接往 main 提交不就行了？"

可以，但你会失去两样东西：

1. **可回退的最小单位**。阶段 7 的 AI 接入把发帖链路改坏了，
   如果所有改动都堆在 main 上，你只能整体回退，连带把阶段 5、6 一起丢掉；
2. **"一次提交只做一件事"的纪律**。这个纪律是代码可读性的源头，
   而它是靠分支 + 合并这个动作练出来的。

## 二、分支命名

| 前缀 | 用途 | 例子 |
| --- | --- | --- |
| `main` | 永远保持可运行 | — |
| `feature/` | 新功能 | `feature/post-crud` |
| `fix/` | 修 bug | `fix/like-count-race` |
| `docs/` | 只改文档 | `docs/stage-3-notes` |
| `chore/` | 配置、依赖、工具 | `chore/eslint-setup` |

本项目的约定是：**每个阶段开一个 `feature/stage-N-xxx` 分支**，
阶段验收通过后合并回 `main`，并打一个 tag：

```bash
git tag stage-3 && git push origin stage-3
```

有了 tag，任何时候都能回到"阶段 3 完成的那个状态"对照学习。

## 三、提交信息规范（Conventional Commits）

格式：

```
<类型>(<范围>): <简述>

<可选：为什么要这么改>
```

类型只能是这几种：

| 类型 | 含义 | 例子 |
| --- | --- | --- |
| `feat` | 新增功能 | `feat(posts): 新增按标签筛选帖子` |
| `fix` | 修 bug | `fix(auth): 修复刷新令牌未写入 Cookie` |
| `docs` | 文档 | `docs(stage-2): 补充 Pinia 状态管理笔记` |
| `refactor` | 重构（不改行为） | `refactor(api): 抽出公共分页参数解析` |
| `test` | 增删测试 | `test(posts): 补充分页边界用例` |
| `chore` | 杂项 | `chore: 升级 nuxt 到 4.5.2` |
| `style` | 纯格式调整 | `style: 应用 prettier 格式化` |

**为什么值得较真这个格式？**
因为它逼你在提交前回答一个问题：**"我这次到底改了什么性质的东西？"**
如果一句话说不清类型和范围，说明这次提交混杂了多件事，应该拆开。

## 四、本项目的提交节奏

一个阶段的典型提交流程：

```bash
git switch -c feature/stage-3-api-foundation

# 小步提交，每步都保证能跑
git add apps/api/src/modules/posts
git commit -m "feat(posts): 新增 Post 模块与 Mongoose Schema"

git add apps/api/src/modules/posts/dto
git commit -m "feat(posts): 新增创建帖子 DTO 与校验规则"

git add apps/api/src/modules/posts/posts.service.spec.ts
git commit -m "test(posts): 覆盖分页与标签筛选的边界情况"

# 验收通过后合回 main
git switch main
git merge --no-ff feature/stage-3-api-foundation
git tag stage-3
```

## 五、提交前必做的三件事

```bash
pnpm lint        # 代码规范
pnpm typecheck   # 类型正确
pnpm test        # 测试通过
```

> **提交前跑一次，比事后修半天便宜得多。**
> 这也是它值得写进工作流的原因：这三条命令把"问题发现时间"从
> "联调时"提前到了"提交时"。

## 六、`.gitignore` 里最重要的一行

```
.env
```

每次 `git status` 时，顺手确认一下**没看到 `.env`**。
如果看到它出现在待提交列表里，先停下来处理，而不是"先提交了再说"。

如果真的误提交了：

1. **立刻去平台重置那个密钥**（这一步最重要，删历史不能撤销泄漏）；
2. 再把文件从历史里清掉（`git filter-repo` 或 BFG）。
