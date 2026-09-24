# studyplan · 学习/技术分享社区

一个**边做边学**的全栈教学项目。目标不是"跑起来一个 demo"，而是把
**技术细节、技术实现、技术背景**都讲清楚，同时练会**项目规划能力**。

---

## 技术栈

| 层 | 选型 | 版本 | 为什么选它 |
| --- | --- | --- | --- |
| 运行时 | Node.js | ≥ 20.19.0 | NestJS 11 与 Nuxt 4 的共同下限（根 `package.json` 的 `engines` 声明） |
| 包管理 | pnpm workspace | 11.20.0 | monorepo 下节省磁盘、依赖隔离严格 |
| 前端 | Nuxt 4 + TypeScript | 4.5.2 | 服务端渲染 + 文件路由 + 自动导入，前后端同语言 |
| UI | Nuxt UI（内置 Tailwind CSS 4） | 4.11.1 | 官方生态，组件现成，样式可控 |
| 状态 | Pinia | 4.0.3 | Vue 官方推荐的状态管理 |
| 后端 | NestJS + TypeScript | 11.2.3 | 模块化 + 依赖注入，架构约束强，适合学"规范" |
| 数据库 | MongoDB Atlas M0（免费云集群） | — | 云端零运维，本地不需要装数据库 |
| ODM | Mongoose | 9.9.5 | Schema 即文档，天然适合学习数据建模 |
| 鉴权 | JWT 双 Token（Access + Refresh） | — | 业界标准做法，安全性优于单 Token |
| 健康检查 | `@nestjs/terminus` | 11.1.1 | 官方方案：依赖不可用时返回 **503**，平台才能判定"真的不健康" |
| 限流 | `@nestjs/throttler` | 6.5.0 | 保护注册 / 登录 / 发帖免于暴力请求 |
| 访问日志 | 自建中间件 + requestId | — | 不引第三方日志库：用 Nest 自带 Logger + 链路 ID，把响应头与日志串起来 |
| 契约 | `packages/shared` | — | 前后端唯一事实来源，字段只定义一次 |
| 容器化 | Docker（多阶段构建） | — | 本地可复现、跨平台可携带 |
| 部署 | Vercel 容器镜像 | — | 见「部署」章节 |
| 文档 | VitePress | 1.6.4 | 与 Vite 同源，边写边发布电子书 |
| 测试 | Jest（后端）+ Playwright（E2E） | 30.5.1 / 1.63.0 | 先保证业务核心，再补端到端 |
| AI | NVIDIA NIM（OpenAI 兼容） | — | 发帖摘要 + AI 学习助手，见下方说明 |
| 热门项目 | GitHub Search API + MongoDB 缓存 | — | 后端代理，浏览器不直连 GitHub |

> **关于 AI**：项目原本用 LangChain 三件套调用智谱 GLM，后为压缩技术栈把那三个
> 依赖连同 `zod` 一起移除（净删 54 个包）。现在改用 **NVIDIA NIM** ——
> 它是 OpenAI 兼容接口，用 Node 内置 `fetch` 直接调用即可，**零新增依赖**。
> 未配置 `NVNIM_API_KEY` 时自动降级为「AI 未启用」，应用其余部分完全正常。
>
> ⚠️ **模型会下线**：实测有模型返回 `410 Gone`，所以模型名由 `NVNIM_MODEL`
> 配置而非写死。可用清单：`GET https://integrate.api.nvidia.com/v1/models`

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
│   │   ├── Dockerfile                    前端镜像（多阶段，产物 .output）
│   │   └── README.md                     ← 前端详细说明
│   │
│   ├── api/                            ② 后端 · NestJS 11     → :3000
│   │   ├── src/
│   │   │   ├── main.ts                   启动入口
│   │   │   ├── app.module.ts             根模块
│   │   │   ├── common/                   横切关注点（守卫 / 过滤器 / 装饰器 / 拦截器 / 中间件）
│   │   │   │   ├── interceptors/           requestId + 统一响应包装
│   │   │   │   └── middleware/             访问日志（含链路 ID）
│   │   │   ├── config/                   环境变量校验
│   │   │   └── modules/                  业务模块（各自自包含）
│   │   │       health users auth posts comments likes ai github
│   │   ├── Dockerfile                    后端镜像（多阶段，产物 dist）
│   │   └── README.md                     ← 后端详细说明
│   │
│   └── docs/                           ③ 电子书 · VitePress   → :3002
│       ├── guide/                        路线图 / 目录地图 / 环境 / Git / 经验档案
│       ├── stages/                       八篇阶段正文
│       └── exercises/                    八份规划练习
│
├── packages/
│   └── shared/                         前后端共享契约（唯一事实来源）
│       └── src/types/  constants/
│
├── docker/vercel/entrypoint.mjs        容器入口：监听平台端口、按路径分流 /api 与页面
├── deploy/                             部署脚本与手册（快照/恢复、平台配置清单、实测报告）
├── Dockerfile.vercel                   单容器镜像（前后端同镜像，仓库根 = 构建上下文）
├── vercel.json                         平台配置：显式声明容器服务与公开路由
├── .dockerignore                       构建上下文忽略清单
├── .env.example                        后端环境变量模板
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
#    然后至少要填 MONGODB_URI / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 三项
#    两个密钥的生成方式见 .env.example 里的注释

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

## 本地容器化运行（Docker Compose）

不想在本地装一整套 Node/pnpm 依赖、只想把整套服务跑在容器里？用 Docker Compose
一键起 **MongoDB + 后端(NestJS) + 前端(Nuxt SSR)** 三个服务。电子书文档不在此编排内
（它只是静态产物，按需另跑 `pnpm dev:docs` 或单独部署）。

### 前置条件

- Docker Desktop 已安装且**守护进程在运行**（`docker ps` 能正常返回）；
- `docker compose` 是 v2（`docker compose version` 有输出）。

### 1. 准备后端环境变量

后端强依赖 MongoDB，缺 `MONGODB_URI` 进程启动即失败。先用模板生成 `apps/api/.env`：

```powershell
# Windows PowerShell：复制模板
Copy-Item .env.example apps/api/.env
```

然后**至少填三项**：

| 变量 | 说明 |
| --- | --- |
| `MONGODB_URI` | 本地 Docker 里写 `mongodb://localhost:27017/studyplan` 即可；`docker-compose.yml` 的 api 服务会用 `mongodb://mongo:27017/studyplan` 覆盖它（容器内走服务名 DNS） |
| `JWT_ACCESS_SECRET` | Access Token 签名密钥，96 字符随机串 |
| `JWT_REFRESH_SECRET` | Refresh Token 签名密钥，同上，另生成一个 |

两个密钥生成方式（各跑一次，把输出分别粘进 `.env`）：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> `AI`（`NVNIM_*`）与 `GitHub`（`GITHUB_TOKEN`）相关变量**全部可留空**——未配 Key 时
> AI 自动降级为「未启用」，应用其余部分完全正常。当前仓库里的 `apps/api/.env`
> 已按此填好，可直接用于本地 Docker。

### 2. 构建并启动

```bash
docker compose up --build -d
#   或等价地走根脚本：pnpm docker:up
```

编排关系（`docker-compose.yml` 已写好）：

| 服务 | 镜像 | 宿主端口 | 说明 |
| --- | --- | --- | --- |
| `mongo` | mongo:7 | 27017 | 数据卷 `mongo-data` 持久化；健康检查通过后才起 api |
| `api` | 本地构建 | 3000 | NestJS；`depends_on` mongo healthy |
| `web` | 本地构建 | 3001←3000 | Nuxt SSR；浏览器侧接口地址烘焙进 bundle |

无需反向代理：浏览器直连 `http://localhost:3000/api`，SSR 服务端走容器内部
`http://api:3000/api`（前后端用两套接口地址，天然兼容）。

### 3. 访问地址

| 用途 | 地址 |
| --- | --- |
| 前端首页 | http://localhost:3001 |
| 后端接口 | http://localhost:3000/api |
| Swagger 文档 | http://localhost:3000/docs |
| 健康检查 | http://localhost:3000/api/health |

验证后端真正健康（MongoDB 可达）：

```bash
curl http://localhost:3000/api/health
# → {"status":"ok","info":{"mongodb":{"status":"up"}}}
```

### 4. 数据与生命周期

```bash
docker compose ps              # 看三个服务状态
docker compose logs -f api     # 跟踪 api 日志（web / mongo 同理）
docker compose down            # 停服务，保留 mongo 数据卷
docker compose down -v         # 停服务，连 mongo 数据卷一起删（数据清空）
```

### 5. 改源码后如何重建 / 更新

改了某个服务源码，单独重建它即可，不用全量重来：

```bash
docker compose up --build -d api     # 只重建后端
docker compose up --build -d web     # 只重建前端
```

> ⚠️ **待办：应用 AI 状态修复**。源码已修好「空 `NVNIM_API_KEY` 被误报为已启用」的问题
> （`apps/api/src/modules/ai/nv-nim.client.ts`），但**运行中的 api 镜像还没包含它**——
> 因为构建需从 Docker Hub 拉取 `node:24-alpine` 基础镜像，而当时本机网络不通、镜像未缓存。
> 待网络恢复后，跑下面任一命令即可重建并生效：
> ```bash
> powershell scripts/rebuild-api.ps1            # 带退避重试，网络抖动会自动重连（pwsh 亦可）
> # 或：pnpm docker:rebuild:api
> ```
> 验证：未配 Key 时 `curl http://localhost:3000/api/ai/status` 应返回
> `enabled:false`、`keyConfigured:false`（与「未启用」设计行为一致）。

### 6. Docker Hub 网络注意事项（国内常见）

`docker-compose.yml` 用的基础镜像（`node:24-alpine`、`mongo:7`）都来自 Docker Hub。
大陆网络可能遭遇 TLS 阻断导致拉取超时（`net/http: TLS handshake timeout`）。

- **重试即可恢复**：多数情况是瞬时封锁，用上面的 `scripts/rebuild-api.ps1`
  （默认 60 次、指数退避封顶 60s）能自动扛过去；
- **加速 / 绕开（本机环境设置，不改仓库）**：在 Docker Desktop 的
  `Settings → Docker Engine` 里配置 `registry-mirrors`，例如：
  ```json
  "registry-mirrors": ["https://<你的镜像加速地址>"]
  ```
  保存后 `Apply & Restart`，再重新 `docker compose up --build -d`。

---

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 并行启动 web / api / docs |
| `pnpm build` | 先构建 shared，再构建全部子包 |
| `pnpm typecheck` | 全仓类型检查 |
| `pnpm test` | 运行后端单测（76 个用例） |
| `pnpm lint` | ESLint 检查 |
| `pnpm format` | Prettier 格式化 |

### 端到端测试

需要**三个服务都在跑**：MongoDB Atlas 可达、`pnpm dev:api`、`pnpm dev:web`。

```bash
# 首次需下载浏览器（约 100MB，只需一次）
pnpm --filter @studyplan/web exec playwright install chromium

pnpm --filter @studyplan/web e2e            # 无头运行
pnpm --filter @studyplan/web e2e:headed     # 看着浏览器跑
pnpm --filter @studyplan/web e2e:report     # 查看上次报告
```

也可以让同一套用例去验证线上环境：

```powershell
# PowerShell：指向线上地址
$env:E2E_BASE_URL='https://你的域名'
pnpm --filter @studyplan/web e2e

# 如果本机访问境外站点受限，再给浏览器也配一个代理（可选）
$env:E2E_PROXY='http://127.0.0.1:7897'
```

> **为什么这件事值得做**：能用同一套测试验证本地与线上，
> 就同时证明了"部署成功"和"测试可信"。
>
> ⚠️ 注意：E2E 会往目标库**写真实数据**（真注册、真发帖）。
> 指向线上库之前，先确认你能接受这些测试数据，或者先做一次快照
> （见 `deploy/snapshot.mjs`）。

---

## 部署

项目备了**两条路径**，可执行的那一刻起就能二选一。

### 路径 A：Vercel 容器镜像（当前演示环境用的）

把前后端与电子书打成一个容器镜像推上平台，一个域名同时提供页面、接口与文档。

```text
浏览器 ──▶ 平台边缘 ──▶ 容器（入口脚本按路径分流）
                          ├── /ebook      ──▶ VitePress 静态产物（直接读盘，不额外起进程）
                          ├── /api、/docs ──▶ NestJS（内部 3000，/docs 是 Swagger）
                          └── 其余        ──▶ Nuxt SSR（内部 3001）
```

要点：

- 仓库根的 `Dockerfile.vercel` 是构建入口，**构建上下文必须是仓库根**（要 COPY `packages/shared`）；
- `vercel.json` 用来**显式声明**容器服务并把公开路由指向它——只放 Dockerfile 不够，平台未必识别；
- 容器入口 `docker/vercel/entrypoint.mjs` 监听平台给的端口，并在冷启动窗口内**等待**子进程就绪，而不是立刻返回 502；
- 同域部署带来两个好处：Cookie 天然同源（`SameSite=lax` 即可），接口地址可以用**相对路径 `/api`**（换域名不用重新构建前端）；
- **电子书挂在 `/ebook`**（主站的 `/docs` 已被 Swagger 占用）。它的静态产物由入口脚本直接提供，**不依赖任何子进程**，因此冷启动期间也能立刻打开；
  容器构建时会注入 `VITEPRESS_BASE=/ebook/`，产物里的资源引用会自动带上该前缀（本地开发仍是根路径 `/`，见 `apps/docs/.vitepress/config.ts` 的注释）。

> ⚠️ **已知网络限制**：`*.vercel.app` 这类域名在中国大陆会遭遇 DNS 污染与 TLS SNI 阻断
> （实测：同一 IP 换成其他 SNI 可正常访问，说明被针对的是域名而非 IP）。
> 因此本机浏览器可能需要代理；正式对外使用应绑定**自有域名**。
> 完整实测记录见电子书 [部署经验：上线时踩过的十个坑](./apps/docs/guide/deployment-lessons.md) 文末附录。

### 线上启用 AI 学习助手（三步 + 一条自检命令）

AI 是**增强功能**：不配 Key 也能正常部署与运行，只是 AI 入口显示"未启用"。要启用只需在平台配一个环境变量：

1. 面板 `Project → Settings → Environment Variables` 新增 `NVNIM_API_KEY`，Environment 勾 **Production**，Type 选 **Secret**，值填你本地 `apps/api/.env` 里那一串（`nvapi-` 开头）；
   - 可选：`NVNIM_MODEL=openai/gpt-oss-20b`（不填则用代码默认值）；
2. **重新部署**：`Deployments → 最新一条 → ⋯ → Redeploy`（环境变量是运行时注入，**改完不自动生效**）；
3. 打开线上站点 → 右下角 AI → 应显示"今日剩余 300"，并能提问。

一条命令自查配好没有（不用翻日志、不用读代码）：

```bash
curl https://你的域名/api/ai/status
# → {"enabled":true,"keyConfigured":true,"model":"openai/gpt-oss-20b",
#     "codeIndexLoaded":true,"codeIndexFiles":100,"remainingToday":300,"limitPerDay":300}
```

> 未配 Key 时应用**照常启动**，`/ai/status` 返回 `enabled:false`，前端提示"去部署平台配置后重新部署"——这是设计行为，不是故障。完整踩坑见
> [部署经验：上线时踩过的十个坑](./apps/docs/guide/deployment-lessons.md) 的「坑 11」。

### 部署前必读

上线前请对照电子书「部署经验」一篇末尾的**上线前检查清单**逐项勾选
（密钥轮换、白名单、健康检查、备份、验证、回滚），详见
[部署经验：上线时踩过的十个坑](./apps/docs/guide/deployment-lessons.md)。
那次部署踩过的坑与排查过程都记在同一篇与它的姊妹篇里。

> 这里刻意不写"带锚点的链接"：GitHub 与 VitePress 对中文标题生成的锚点规则不同
> （前者去掉顿号、后者保留），带锚点的链接总有一边会失效。

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
| 7 | AI 能力 | 发帖自动生成摘要与标签；AI 学习助手（问榜上项目 / 问本站代码），失败降级 |
| 8 | 测试与上线 | E2E 验证 + 部署到云端 |

每个阶段都会交付三样东西：

1. **可运行的最小实现**——能看见、能点、能验证；
2. **电子书笔记**——AI 出结构与初稿，**核心概念由你自己用话重写**，并记录踩坑；
3. **规划小练习**——自己写下阶段的功能三步拆解与工时估算，再对照修正。

---

## 经验档案

电子书里有三篇**实战复盘**，记录的是"做的时候会撞上什么"：

| 文档 | 内容 |
| --- | --- |
| [部署经验：上线时踩过的十个坑](./apps/docs/guide/deployment-lessons.md) | 平台识别容器入口、启动超时掩盖真实报错、冷启动窗口、环境变量被污染、monorepo 构建上下文、构建工具依赖容器外的东西、白名单取舍、免费库无快照、多实例限流失效 + **上线前检查清单** |
| [调试经验：出问题时先看什么](./apps/docs/guide/debugging-lessons.md) | 定位顺序、只在线上复现的问题、SSR 水合竞态、失败位置远离成因时看什么、网络三段式排查、代理识别 + **排查动作清单** |
| [集成经验：从接口到浏览器](./apps/docs/guide/integration-lessons.md) | 契约两端不一致、**SSR 正常但交互全死**、构建期产物只在容器里生成、按名字猜模型性能、中文检索的分词与计分 + **集成检查清单** |

其中调试篇里**如实保留了一条尚未查明根因的本地开发环境问题**，
所以"同一套测试本地与线上都绿"这个结论目前还不完全成立——细节见那篇的最后一节。

集成篇记录的是最近一次功能开发（热门项目榜 + AI 学习助手）的真实过程：
功能第一次被宣布"完成"时其实是坏的 —— 页面能看、数据都在，只是**所有按钮都是死的**。
那一篇的重点不是"怎么写功能"，而是**怎么发现自己写的功能其实没在工作**。

---

## 密钥安全（不是可选项）

- 真实密钥只写在 `apps/api/.env`，该文件已被 `.gitignore` 忽略；
- 仓库里只保留 `.env.example`（全部为空值）；
- 如果密钥曾经被提交过，**立刻去平台重置密钥**，再清理 Git 历史。

> **实测教训（来自本项目的真实经历）**：
> 曾经有一个示例文件被误填了真实数据库连接串，虽然它**没有进入提交历史**（清空即可），
> 但那条**曾经外泄过的旧密码，在事后多日仍然可以连上数据库**。
>
> 所以：**"清空文件"只消除了继续扩散，不等于风险消失。**
> 凭据一旦外泄，正确动作是**立即轮换**，而不是等有空再说。

---

## 电子书

`apps/docs` 既可以在本地 `pnpm dev:docs` 预览，也可以单独构建成静态站点发布：

```bash
pnpm --filter @studyplan/docs build     # 产物：apps/docs/.vitepress/dist
```
