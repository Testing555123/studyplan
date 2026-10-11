# 项目目录地图

> 这一页解决一个很具体的问题：**东西在哪，以及为什么在那里**。
> 读完你应该能不靠搜索就推出"我要改的功能应该在哪个目录"。

---

## 一句话总原则

```text
apps/     = 能独立启动的程序（有自己的 package.json、能 pnpm dev）
packages/ = 被复用但不独立启动的库（只被别人 import）
根目录     = 管住所有 app 的配置
```

就这一条。下面全是对它的展开。

---

## 完整目录树

```text
studyplan/
│
├── apps/                                  ← 三个可独立启动的应用
│   │
│   ├── web/                               ① 前端：Nuxt 4
│   │   ├── app/                             ├─ Nuxt 4 约定的源码根目录
│   │   │   ├── app.vue                      │   根布局：页头 / <slot> / 页脚
│   │   │   ├── app.config.ts                │   Nuxt UI 主色配置
│   │   │   ├── assets/css/main.css          │   设计令牌 + 全局组件类
│   │   │   ├── components/                  │   可复用组件（自动全局可用）
│   │   │   ├── composables/                 │   逻辑复用（useApi / useAuth）
│   │   │   ├── middleware/                  │   路由守卫（未登录禁止发帖）
│   │   │   ├── pages/                       │   文件路由（文件路径 = URL）
│   │   │   ├── plugins/                     │   启动时执行一次的插件
│   │   │   ├── stores/                      │   Pinia 跨页面状态
│   │   │   └── utils/                       │   纯函数（自动导入）
│   │   ├── e2e/                             ├─ Playwright 端到端测试
│   │   ├── nuxt.config.ts                   ├─ Nuxt 配置入口
│   │   ├── playwright.config.ts             ├─ E2E 配置
│   │   └── package.json                     └─ 包名 @studyplan/web
│   │
│   ├── api/                               ② 后端：NestJS 11
│   │   ├── src/
│   │   │   ├── main.ts                       ├─ 启动入口（全局管道/CORS/Swagger）
│   │   │   ├── app.module.ts                 ├─ 根模块：把各模块装起来
│   │   │   ├── config/env.validation.ts      ├─ 环境变量校验（缺失即启动失败）
│   │   │   ├── common/                       ├─ 横切关注点（不专属于某个业务）
│   │   │   │   ├── decorators/               │   @CurrentUser()
│   │   │   │   ├── filters/                  │   全局异常过滤器
│   │   │   │   ├── guards/                   │   JwtAuthGuard
│   │   │   │   ├── interceptors/             │   链路 ID + 统一响应包装
│   │   │   │   ├── middleware/               │   访问日志
│   │   │   │   ├── schemas/                  │   可复用子文档（Author）
│   │   │   │   ├── strategies/               │   Passport JWT 策略
│   │   │   │   ├── types/                    │   后端内部类型
│   │   │   │   └── utils/                    │   Cookie / Mongo 错误转换
│   │   │   └── modules/                      └─ 业务模块（每个都自包含）
│   │   │       ├── health/                      健康检查（Terminus，断连返回 503）
│   │   │       ├── users/                       用户
│   │   │       ├── auth/                        注册登录 + JWT 双 Token
│   │   │       ├── posts/                       帖子
│   │   │       ├── comments/                    评论
│   │   │       ├── likes/                       点赞
│   │   │       └── ai/                          摘要与标签（依赖已移除，恒降级）
│   │   ├── nest-cli.json / tsconfig.json    构建配置
│   │   └── package.json                     包名 @studyplan/api
│   │
│   └── docs/                              ③ 电子书：VitePress（线上挂在 /ebook）
│       ├── .vitepress/config.ts             导航 / 侧边栏 / 搜索 / base
│       ├── index.md                         电子书首页
│       ├── guide/                           路线图、环境准备、Git、本页、经验档案
│       ├── stages/                          八篇阶段正文
│       └── exercises/                       八份规划练习
│
├── packages/                              ← 被复用但不独立启动的库
│   └── shared/                             前后端共享契约
│       └── src/
│           ├── types/                       user / post / comment / api
│           ├── constants/                   标签白名单、长度限制
│           └── index.ts                     统一出口
│
├── docker/vercel/entrypoint.mjs            容器入口（监听平台端口 + 按路径分流）
├── deploy/                                 部署脚本与手册（快照/恢复、平台清单、实测报告）
├── Dockerfile.vercel                       单容器镜像（前后端同镜像，仓库根 = 构建上下文）
├── vercel.json                             平台配置：显式声明容器服务与公开路由
├── .dockerignore                           构建上下文忽略清单
├── eslint.config.mjs                       全仓 lint 规则
├── .prettierrc / .prettierignore           全仓格式规则
├── .env.example                            环境变量模板（真实 .env 被忽略）
├── pnpm-workspace.yaml                     workspace 范围 + 构建白名单
├── package.json                            根脚本：dev / build / test / lint
└── README.md                               项目总览
```

---

## 为什么这么分：对照高星项目

这不是我们自己发明的结构，而是社区收敛出来的主流做法。

| 项目 | 布局 |
| --- | --- |
| **vercel/turborepo** 官方示例 | `apps/web` · `apps/docs` · `packages/ui` · `packages/config` |
| **create-t3-turbo** | `apps/nextjs` · `apps/expo` · `packages/api` · `packages/db` |
| **cal.com** | `apps/web` · `apps/api` · `packages/*` |
| **supabase** | `apps/` · `packages/` |

**`apps/` 这一层不是多余的。** 它的作用是回答一个具体问题：

> "我现在要跑的是哪个程序？"

`apps/web`、`apps/api`、`apps/docs` 三个都是**能自己启动的完整程序**，
各有自己的 `package.json` 和启动脚本。`packages/shared` 不能启动，
它只是被前两者 import 的一堆类型。

如果去掉 `apps/` 这层，把 `web/`、`api/`、`docs/`、`shared/` 平铺在根目录，
"能启动的"和"不能启动的"就混在一起了 —— 这才是真正的乱。

### monorepo 分层：apps/ 与 packages/

#### 实现方法
根目录 `pnpm-workspace.yaml` 声明 workspace 范围，把 `apps/`（web / api / docs，各能 `pnpm dev`）和 `packages/shared`（前后端共享类型与常量，不独立启动）纳入同一仓库。`packages/shared/src/types` 放 user / post / comment / api 的 TS 类型，`constants` 放标签白名单、长度限制，`index.ts` 统一出口，前后端都 `import` 它来保证字段一致。

#### 原理
monorepo 让多个相关项目共享同一份依赖安装、同一套 lint / 构建配置、同一套类型契约，改一个类型能立刻在前后端都报错，而不是上线才发现字段对不上。`apps/` 和 `packages/` 的区别只在"能不能独立启动"：能启动的是 app，被 import 的是 package。这个分层回答了"我现在要跑的是哪个程序"。

#### 与相关技术栈的关系
对比多仓库（每个服务一个 git repo）：多仓库依赖版本容易漂移、跨仓改类型要发版本，monorepo 用 workspace 协议（`"@studyplan/shared": "workspace:*"`）把依赖指向本地源码。对比同类方案，pnpm workspace 比 yarn / lerna 的 node_modules 更省磁盘（硬链接），比 Nx / Turborepo 更轻（本项目没引入构建编排）。Vercel 的 turborepo、create-t3-turbo、cal.com 都是这个布局。

#### 面试常见问题与解题思路
**Q1：monorepo 和多仓库怎么选？**
怎么想 → 看团队规模和耦合度；怎么答 → 多个紧密相关的项目、要共享类型和配置，monorepo 改一处全局生效；服务之间松耦合、团队独立部署，多仓库边界更清；追问 → monorepo 的"大仓"会带来构建慢、权限难控的问题吗，怎么缓解（受影响构建、codeowners）。

**Q2：为什么本项目把共享类型放 packages/ 而不是各写各的？**
怎么想 → 想"前后端关于一个帖子的字段定义谁说了算"；怎么答 → 单一事实来源，后端返回、前端接收都引用同一份类型，接口字段改了编译期就能发现不一致；追问 → 只放类型不放逻辑，业务逻辑为什么不放 shared（避免前后端耦合，shared 应保持纯数据契约）。

---

## 三个最容易困惑的地方

### ① 为什么 `apps/web/` 里还有一层 `app/`？

因为 **Nuxt 4 明确规定源码放在 `app/`**，用来把源码和"非源码"分开：

```text
apps/web/
├── app/        源码（会被编译进产物）
├── public/     静态文件（原样复制，不处理）
├── server/     Nuxt 自带的后端路由（本项目不用）
└── e2e/        测试（不参与构建）
```

Nuxt 3 时代这些东西全堆在根目录，文件一多就分不清哪些能动。
Nuxt 4 收进 `app/` 是有意的改进。

> 可以用 `srcDir` 配置改掉它，但那属于偏离框架默认。
> 代价是：以后你看任何 Nuxt 4 教程、查官方文档、问 AI，路径都会对不上。

#### 实现方法
本项目的 Nuxt 4 源码全部在 `apps/web/app/` 下：`app.vue`（根布局）、`pages/`（文件路由）、`components/`（自动全局可用）、`composables/`、`stores/`、`middleware/`、`plugins/`。`public/`、`server/`、`e2e/` 与 `app/` 并列，分属静态文件、后端路由、测试，互不混进构建产物。

#### 原理
Nuxt 4 把源码约定收进 `app/`，用意是把"会被编译进产物的源码"和"原样复制的静态文件 / 不参与构建的测试 / 自带 server"分开。Nuxt 3 时代这些全堆在根目录，文件一多就分不清哪些能动。这个约定让目录职责一眼可辨。

#### 与相关技术栈的关系
`app/` 是 Nuxt 4 的 `srcDir` 默认值，可以通过配置改掉，但改了就偏离官方默认——以后看 Nuxt 4 教程、查文档、问 AI 路径都会对不上。对比 Next.js 的 `app/` 目录（App Router，是路由概念）同名但含义不同：Nuxt 的 `app/` 是"源码根"，Next 的 `app/` 是"路由根"。

#### 面试常见问题与解题思路
**Q1：Nuxt 4 为什么要把源码放进 app/？**
怎么想 → 想"项目根目录下到底哪些该进构建"；怎么答 → 区分源码、静态资源、测试、服务端，避免 Nuxt 3 根目录臃肿、职责模糊；追问 → 如果不放进 app/，哪些东西会被动进构建（public 原样复制、e2e 不进构建）。

### ② 为什么后端非要分 `common/` 和 `modules/`？

判断标准只有一条：

> 这个文件**服务于某个具体业务**吗？
> 是 → `modules/`；否 → `common/`。

`JwtAuthGuard` 被帖子、评论、点赞三个模块共用，它不属于任何一个业务，
所以它在 `common/guards/`。而 `PostsService` 只服务于帖子，所以它在 `modules/posts/`。

"横切关注点"这个名字听起来很玄，其实就是**多个人用、但不属于任何一个人**。

#### 实现方法
后端 `src/` 下分 `common/`（横切关注点：guards / filters / interceptors / decorators / strategies 等）和 `modules/`（业务模块：users / auth / posts / comments / likes / ai，每个自包含 controller + service + schema + dto）。判断标准一句话：这个文件服务于某个具体业务吗？是 → `modules/`；否 → `common/`。`JwtAuthGuard` 被多个模块共用、不属于任一业务，所以在 `common/guards/`；`PostsService` 只服务帖子，在 `modules/posts/`。

#### 原理
"横切关注点"指多个人用、但不属于任何一个人逻辑的东西。把这类代码集中到 `common/`，业务模块就能保持纯粹——只关心自己的领域。NestJS 的模块系统靠依赖注入把这些共享组件注入到需要的模块，所以位置分层不影响复用。

#### 与相关技术栈的关系
和前端 `composables/`（逻辑复用）思路一致：都是"被多处调用的东西单独放一层"。对比 Ruby on Rails 的 `app/controllers` + `app/models` 按技术角色分，NestJS 这里按"业务 / 横切"分，更贴合依赖注入的思维方式。把 `health` 也放进 `modules/`（一个不依赖任何业务的模块），能让 `src/` 下只剩 `main.ts`、`app.module.ts`、`common/`、`config/`、`modules/` 五样，无歧义。

#### 面试常见问题与解题思路
**Q1：一个被三个业务模块共用的工具，该放 common 还是某个 module？**
怎么想 → 问"它属于某个业务吗"；怎么答 → 不属于任何单一业务就放 common，属于就放对应 module 并通过导出复用；追问 → 如果 common 越变越大怎么办（按职责再分子目录 guards / filters，而不是拆成新的一层）。

### ③ 为什么健康检查也在 `modules/` 里？

因为它确实是一个模块 —— 一个"不依赖任何业务领域"的模块。
把它放在 `src/` 根下会让人以为 `src/` 下有两类并列的东西："模块"和"非模块"。
归位之后，`src/` 下就只剩 `main.ts`、`app.module.ts`、`common/`、`config/`、
`modules/` 五样，没有任何歧义。

**目录结构就是心智模型。结构对齐了，找东西不用靠记忆，靠推理。**

---

## 速查表：想找什么，去哪

| 我要改… | 去这里 |
| --- | --- |
| 某个页面的样子 | `apps/web/app/pages/` |
| 页头 / 页脚 / 卡片这类组件 | `apps/web/app/components/` |
| 主色、圆角、阴影、深色模式 | `apps/web/app/assets/css/main.css` |
| 前端调用后端的统一封装 | `apps/web/app/composables/useApi.ts` |
| 登录状态怎么存 | `apps/web/app/composables/useAuth.ts` + `stores/` |
| 未登录不许发帖的拦截 | `apps/web/app/middleware/auth.ts` |
| 接口返回的字段定义 | **`packages/shared/src/types/`**（前后端共用） |
| 可选标签有哪些 | `packages/shared/src/constants/tags.ts` |
| 某个接口的入参校验规则 | `apps/api/src/modules/<模块>/dto/` |
| 某个接口的业务逻辑 | `apps/api/src/modules/<模块>/<模块>.service.ts` |
| 数据在数据库里的结构 | `apps/api/src/modules/<模块>/schemas/` |
| 登录 / Token 签发逻辑 | `apps/api/src/modules/auth/` |
| 哪些接口需要登录 | 看 controller 上的 `@UseGuards(JwtAuthGuard)` |
| 错误响应的统一格式 | `apps/api/src/common/filters/` |
| AI 的 Prompt 模板 | `apps/api/src/modules/ai/prompts/` |
| 环境变量有哪些 | `.env.example`（模板）与 `apps/api/src/config/env.validation.ts`（校验） |
| 容器与部署配置 | `Dockerfile.vercel`、`vercel.json`、`deploy/` |
| 部署踩过的坑 | `apps/docs/guide/deployment-lessons.md` |
| 排查问题的方法 | `apps/docs/guide/debugging-lessons.md` |
| 学习笔记 | `apps/docs/stages/` |
| 规划练习 | `apps/docs/exercises/` |

---

## 命名约定

| 对象 | 约定 | 例子 |
| --- | --- | --- |
| 目录 | 全小写，多个词用 `-` 或直接连写 | `composables`、`git-workflow.md` |
| Vue 组件 | 大驼峰 `.vue` | `PostCard.vue` |
| 后端模块 | 复数小写 | `posts`、`comments`、`likes` |
| TypeScript 文件 | 短横线小写 | `post-meta.prompt.ts` |
| 类型 / 接口 | 大驼峰，**不加 `I` 前缀** | `Post`、`PostListResponse` |
| 常量 | 全大写下划线 | `ALLOWED_TAGS`、`MAX_TITLE_LENGTH` |

**为什么接口不加 `I` 前缀？** 因为 TypeScript 里类型和值在语法上就是两个命名空间，
`Post` 类型和 `Post` 变量不会冲突，`I` 只是从 C#/Java 带过来的历史习惯。

---

## 一页纸总结

```text
找前端   →  apps/web/app/
找后端   →  apps/api/src/
找接口字段 →  packages/shared/
找原理   →  apps/docs/
```

其余的（`.vitepress/`、`dist/`、`.nuxt/`、`node_modules/`）都是**产物或配置**，
不需要你去读，也不要手动去改。
