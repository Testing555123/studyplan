# studyplan · 学习/技术分享社区

一个**边做边学**的全栈教学项目。目标不是"跑起来一个 demo"，而是把
**技术细节、技术实现、技术背景**都讲清楚，同时练会**项目规划能力**。

---

## 技术栈

| 层 | 选型 | 版本 | 为什么选它 |
| --- | --- | --- | --- |
| 运行时 | Node.js | 24.18.1 | 本机已装，满足 NestJS 11（≥20.19）与 Nuxt 4（≥20） |
| 包管理 | pnpm workspace | 11.20.0 | monorepo 下节省磁盘、依赖隔离严格 |
| 前端 | Nuxt 4 + TypeScript | 4.5.2 | 服务端渲染 + 文件路由 + 自动导入，前后端同语言 |
| UI | Nuxt UI（内置 Tailwind CSS 4） | 4.11.1 | 官方生态，组件现成，样式可控 |
| 状态 | Pinia | 4.0.3 | Vue 官方推荐的状态管理 |
| 后端 | NestJS + TypeScript | 11.2.3 | 模块化 + 依赖注入，架构约束强，适合学"规范" |
| 数据库 | MongoDB Atlas M0（免费云集群） | — | 本机无 Docker / 无 mongod，云端零运维 |
| ODM | Mongoose | 9.9.5 | Schema 即文档，天然适合学习数据建模 |
| 鉴权 | JWT 双 Token（Access + Refresh） | — | 业界标准做法，安全性优于单 Token |
| AI | LangChain JS + 智谱 GLM | 1.5.11 | 已有智谱 API Key，国内直连、成本低 |
| 文档 | VitePress | 1.6.4 | 与 Vite 同源，边写边发布电子书 |
| 测试 | Jest（后端）+ Playwright（E2E） | — | 先保证业务核心，再补端到端 |

---

## 目录结构

一句话记住：**`apps/` 是能独立启动的程序，`packages/` 是只被复用的库。**

```
studyplan/
├── apps/                              可独立启动的三个应用
│   ├── web/                            ① 前端 · Nuxt 4        → :3001
│   │   ├── app/                          Nuxt 4 约定的源码根目录
│   │   │   ├── pages/                    文件路由（文件路径 = URL）
│   │   │   ├── components/               可复用组件
│   │   │   ├── composables/              逻辑复用（useApi / useAuth）
│   │   │   ├── stores/                   Pinia 跨页面状态
│   │   │   ├── middleware/               路由守卫
│   │   │   ├── plugins/ utils/ assets/   插件 / 工具 / 设计令牌
│   │   │   └── app.vue                  根布局
│   │   ├── e2e/                          Playwright 端到端测试
│   │   └── README.md                     ← 前端详细说明
│   │
│   ├── api/                            ② 后端 · NestJS 11     → :3000
│   │   └── src/
│   │       ├── main.ts                   启动入口
│   │       ├── app.module.ts             根模块
│   │       ├── common/                   横切关注点（守卫 / 过滤器 / 装饰器）
│   │       ├── config/                   环境变量校验
│   │       └── modules/                  业务模块（各自自包含）
│   │           health users auth posts comments likes ai
│   │   └── README.md                     ← 后端详细说明
│   │
│   └── docs/                           ③ 电子书 · VitePress   → :3002
│       ├── guide/                        路线图 / 目录地图 / 环境 / Git
│       ├── stages/                       八篇阶段正文
│       └── exercises/                    八份规划练习
│
├── packages/
│   └── shared/                         前后端共享契约（唯一事实来源）
│       └── src/types/  constants/
│
├── .env.example                        环境变量模板
├── pnpm-workspace.yaml                 workspace 范围
└── package.json                        根脚本：dev / build / test / lint
```

> **想彻底搞懂为什么这么分？** 读电子书里的
> [项目目录地图](./apps/docs/guide/project-structure.md)：
> 完整目录树、设计理由、与高星项目的对照，以及一张"想找什么去哪"的速查表。

**为什么 `packages/shared` 是这个项目最重要的一环？**
它是"契约"的物理载体：接口字段只定义一次，前端和后端同时引用。
改错一个字段名，两端会同时报类型错误——把"联调时才发现字段对不上"这类经典事故提前到编译期。

---

## 快速开始

```bash
# 1. 安装全部子包依赖（根目录执行一次即可）
pnpm install

# 2. 准备环境变量：把模板复制到后端目录并填写真实值
#    Windows PowerShell:
Copy-Item .env.example apps/api/.env
#    macOS / Linux:
#    cp .env.example apps/api/.env

# 3. 启动全部开发服务
pnpm dev
#    前端      http://localhost:3001
#    后端      http://localhost:3000/api
#    接口文档  http://localhost:3000/docs
#    电子书    http://localhost:3002

# 也可以单独启动
pnpm dev:web
pnpm dev:api
pnpm dev:docs
```

---

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 并行启动 web / api / docs |
| `pnpm build` | 先构建 shared，再构建全部子包 |
| `pnpm typecheck` | 全仓类型检查 |
| `pnpm test` | 运行后端单测（54 个用例） |
| `pnpm lint` | ESLint 检查 |
| `pnpm format` | Prettier 格式化 |

### 端到端测试（阶段 8）

需要**三个服务都在跑**：MongoDB Atlas 可达、`pnpm dev:api`、`pnpm dev:web`。

```bash
# 首次需下载浏览器（约 100MB，只需一次）
pnpm --filter @studyplan/web exec playwright install chromium

pnpm --filter @studyplan/web e2e            # 无头运行
pnpm --filter @studyplan/web e2e:headed     # 看着浏览器跑
pnpm --filter @studyplan/web e2e:report     # 查看上次报告
```

也可以让同一套用例去验证线上环境：

```bash
# PowerShell
$env:E2E_BASE_URL='https://你的前端域名'; pnpm --filter @studyplan/web e2e
```

> **为什么这件事值得做**：能用同一套测试验证本地与线上，
> 就同时证明了"部署成功"和"测试可信"。

---

## 学习路线（8 个阶段）

阶段切法是**先横切、后纵切**：先用 4 个阶段把地基（工程 / 前端 / 后端 / 联调）打通，
再用 4 个阶段逐个功能点前后端一次做穿。

| 阶段 | 主题 | 交付物 |
| --- | --- | --- |
| 1 | 工程地基与 TypeScript 起步 | monorepo 跑起来，Nuxt 首页可见，电子书可访问 |
| 2 | 前端原型（mock 数据） | 列表 / 详情 / 发帖 / 登录注册四个页面可点 |
| 3 | 后端与数据库 | Post 模块 REST CRUD + Swagger + 单测 |
| 4 | 首次前后端联调 | 列表与详情改接真实接口 |
| 5 | 认证与发帖 | 注册登录、JWT 双 Token、路由守卫、Markdown 发帖 |
| 6 | 互动功能 | 评论、点赞、标签筛选、分页与索引 |
| 7 | AI 能力 | 发帖自动生成摘要与标签，失败降级 |
| 8 | 测试与上线 | E2E 验证 + 部署到云端 |

每个阶段都会交付三样东西：

1. **可运行的最小实现**——能看见、能点、能验证；
2. **电子书笔记**——AI 出结构与初稿，**核心概念由你自己用话重写**，并记录踩坑；
3. **规划小练习**——自己写下阶段的功能三步拆解与工时估算，再对照修正。

---

## 密钥安全（不是可选项）

- 真实密钥只写在 `apps/api/.env`，该文件已被 `.gitignore` 忽略；
- 仓库里只保留 `.env.example`（全部为空值）；
- 如果密钥曾经被提交过，**立刻去平台重置密钥**，再清理 Git 历史。

---

## 电子书

`apps/docs` 既可以在本地 `pnpm dev:docs` 预览，也可以单独构建成静态站点发布：

```bash
pnpm --filter @studyplan/docs build     # 产物：apps/docs/.vitepress/dist
```
