# Git 工作流

## 一、为什么一个人写代码也要用分支

"只有我一个人，直接往 main 提交不就行了？"

可以，但你会失去两样东西：

1. **可回退的最小单位**。阶段 7 的 AI 接入把发帖链路改坏了，
   如果所有改动都堆在 main 上，你只能整体回退，连带把阶段 5、6 一起丢掉；
2. **"一次提交只做一件事"的纪律**。这个纪律是代码可读性的源头，
   而它是靠分支 + 合并这个动作练出来的。

#### 实现方法

本项目约定每个阶段开一个 `feature/stage-N-xxx` 分支，验收通过后 `--no-ff` 合并回 `main` 并打 tag（`git tag stage-3`）。分支是回退的最小单位。

#### 原理

不用分支，所有改动堆在 main，一旦某阶段改坏就只能整体回退，连带丢掉后续工作。分支加合并这个动作，强制你"一次提交只做一件事"，而这正是代码可读性的源头。

#### 与相关技术栈的关系

和直接 main 提交相比，分支带来可回退粒度与审查边界。和 Git Flow（develop、release 分支）相比，本项目用极简的 feature 分支加 tag，适配单人学习项目。和 trunk-based（高频合 main）相比，本项目用长生命周期阶段分支。

#### 面试常见问题与解题思路

**Q1：一个人开发为什么也要用分支？**
怎么想：从"回退粒度"切入。怎么答：分支让回退精确到一次改动，且养成单职责提交习惯。追问：为什么合并要用 --no-ff？

**Q2：feature 分支合回 main 要注意什么？**
怎么想：从"历史可读"切入。怎么答：小步提交、合后打 tag 便于回溯。追问：tag 在持续学习中起什么作用？

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

#### 实现方法

本项目提交遵循 `<类型>(<范围>): <简述>` 格式（feat、fix、docs、refactor、test、chore、style），每次提交前先问"这次改了什么性质"，一句话说不清就拆开。

#### 原理

这个格式逼你在提交前回答"我到底改了什么性质的东西"。类型和范围说不清，说明这次提交混杂了多件事，应该拆开。规范化的提交历史让 `git log`、自动生成 changelog、回溯定位都更省事。

#### 与相关技术栈的关系

和自由格式提交信息相比，Conventional Commits 可被工具解析（standard-version、semantic-release 自动发版）。和 Git Flow 的提交习惯相比，它关注"提交本身的描述"，不绑定分支模型。和变更日志自动化结合价值最大。

#### 面试常见问题与解题思路

**Q1：为什么提交信息要规范化？**
怎么想：从"可解析"切入。怎么答：规范化能自动生成 changelog、辅助回溯、强制单职责。追问：类型和范围怎么定？

**Q2：一次提交混杂多件事怎么办？**
怎么想：从"拆分"切入。怎么答：按性质拆成多个提交；能用交互式 rebase 调整。追问：已经推上去的提交怎么改？

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

#### 实现方法

本项目根 `.gitignore` 把 `.env` 排除；提交前顺手确认 `git status` 没出现 `.env`。误提交则立刻去平台重置密钥（删历史不能撤销泄漏），再用 `git filter-repo` 或 BFG 清历史。

#### 原理

`.env` 含数据库密码、JWT 密钥、API Key，一旦进仓库就等于公开。重置密钥要排在第一位，因为删历史只清除仓库副本，已经泄露出去的副本无法收回。这是"泄漏不可逆"原则。

#### 与相关技术栈的关系

和把密钥写进代码相比，`.env` 加 `.gitignore` 是基本隔离。和密钥管理（Vault、云 Secrets Manager、CI 注入）相比，本项目用本地 `.env` 加纪律。和 `.env.example` 放占位、真实 `.env` 忽略，是通用约定。

#### 面试常见问题与解题思路

**Q1：密钥误提交到 git 怎么办？**
怎么想：从"泄漏不可逆"切入。怎么答：先重置密钥（首位），再清历史；清历史不能撤销已发生的泄漏。追问：为什么重置比清历史更紧急？

**Q2：`.env` 该不该进版本控制？**
怎么想：从"敏感分级"切入。怎么答：真实 `.env` 绝不进库，只提交 `.env.example` 占位。追问：前端 public 变量和密钥怎么区分？
