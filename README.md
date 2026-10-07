# studyplan · 学习/技术分享社区

一个**从零到上线**的全栈项目的完整实现记录与技术决策复盘。项目跑起来了，
文档也写完了；这里保留的是**怎么想、为什么这么选、哪些方案被否决了**。

  **本文档的双重职责**：
  - 「技术栈 / 快速开始 / Docker / 部署」等章节描述的是**当前仓库里实际运行的代码**（NestJS 11 + MongoDB + VitePress），照着做能跑起来。
  - 「技术选型 / 设计决策复盘」两节描述的是**重构的目标态**（Payload 3 + PostgreSQL 16 + Nuxt Content），这部分**尚未实施**，只作为下一阶段的依据。
 
  两者刻意分开，避免把「目标态」误当成「现在就能用」。

---

## 技术栈（当前运行版本）

  下表是**当前代码实际依赖的版本**。重构目标态见下一节「技术选型」。

| 层 | 选型 | 版本 | 为什么选它 |
| --- | --- | --- | --- |
| 运行时 | Node.js | ≥ 20.19.0 | NestJS 11 与 Nuxt 4 的共同下限（根 `package.json` 的 `engines` 声明）<br **重构后需升到 ≥ 22** |
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
| 面试题库 | MongoDB 集合 `interview_questions` + REST | — | 路线页「面试怎么考」：读接口公开，写接口需登录；未灌种子时前端降级 |

  **关于 AI**：项目原本用 LangChain 三件套调用智谱 GLM，后为压缩技术栈把那三个
  依赖连同 `zod` 一起移除（净删 54 个包）。现在改用 **NVIDIA NIM** ——
  它是 OpenAI 兼容接口，用 Node 内置 `fetch` 直接调用即可，**零新增依赖**。
  未配置 `NVNIM_API_KEY` 时自动降级为「AI 未启用」，应用其余部分完全正常。
 
  ⚠️ **模型会下线**：实测有模型返回 `410 Gone`，所以模型名由 `NVNIM_MODEL`
  配置而非写死。可用清单：`GET https://integrate.api.nvidia.com/v1/models`

---

## 技术选型（重构目标态，尚未实施）

  **状态**：已完成**五轮调研**与逐条评审，**15 条决策 + T1–T5 最终裁定全部裁定**。权威结论见 [`TECH-SELECTION.md` §0 最终裁定](TECH-SELECTION.md#0-最终裁定2026-10-07)。
  **依据**：[`FUNCTIONALITY.md`](FUNCTIONALITY.md)（现状基线）124 条功能需求 × [`REFRACTOR-SPEC.md`](REFRACTOR-SPEC.md)（重构需求）11 个批次，逐条评估覆盖率。
  **单页清单**：[`docs/archive/tech-selection/final-stack.md`](docs/archive/tech-selection/final-stack.md)

### 最终技术栈（11 项）

  **原 15 项 → 11 项。** 差额来自「囊括」关系的识别：2 项重复计数 + 1 项传递依赖 + 1 项功能替代。

| # | 层 | 选择 | 许可证 | 囊括了什么 |
| --- | --- | --- | --- | --- |
| 1 | 运行时 | **Node.js ≥ 22** / pnpm workspace | — | Vercel AI SDK / OTel / Nuxt Content 的共同下限 |
| 2 | 数据 | **PostgreSQL 16** | PostgreSQL License | **pgvector**（向量）· **tsvector**（全文）· **pg_trgm**（模糊）· JSONB · `ON CONFLICT`（幂等） |
| 3 | 后端基座 | **Payload 3** | MIT | 集合/字段 · REST+GraphQL · **auth** · access control · hooks · **Jobs Queue** · **内置 Drizzle** · migrations · env 校验 |
| 4 | 校验与契约 | **Zod 4**（Standard Schema V1） | MIT | 后端 DTO · 前端表单 · AI 工具入参 · 环境变量 |
| 5 | 限流 | **rate-limiter-flexible**（内存后端） | ISC | 逐路由 14 处档位 · 热门榜单豁免 |
| 6 | 缓存 | **lru-cache v11**（进程内）+ PG 落库 | BlueOak-1.0.0 | 7 天答案缓存 · 键空间隔离 · 毫秒 TTL · 零部署 |
| 7 | GitHub 客户端 | **Octokit** | MIT | ETag · 限流重试 · 分页 · `User-Agent` |
| 8 | 可观测性 | **OpenTelemetry JS** + **Langfuse**（OTLP sink） | Apache-2.0 / MIT | trace 传播 · 命名 span（分段计时）· 采样分级 · LLM 追踪 · 评测集与门禁 |
| 9 | AI 调用与 Agent | **Vercel AI SDK 6.x**（含 `ToolLoopAgent`） | Apache-2.0 | chat/embed · 结构化输出 · 工具循环 + 步数上限 · 流式 |
| 10 | Agent 对比实现 | **LangGraph.js**（可选项） | MIT | 图编排对照 · `RetryPolicy` 异常分类 |
| 11 | 前端与文档 | **Nuxt 4** + **Nuxt UI 4** + **Nuxt Content 3** + **Meilisearch CE** | MIT / MIT（CE） | Vue/Vite/Nitro · Reka UI + Tailwind + Lucide + ⌘K · markdown/Shiki/SQLite/MDC · 文档检索 |

**统一栈的落点**：100% TypeScript；**Zod 4 schema 为唯一来源**——后端 DTO 校验、前端表单校验、AI 工具入参校验三处共用同一份定义（Standard Schema V1 使其可被三方消费）；**Drizzle 不是独立依赖，是 Payload 的内部依赖**（`payload.db.drizzle`）。

**许可证**：11 项中 10 项为 MIT / Apache-2.0 / PostgreSQL License / ISC，唯一非标准宽松许可是 lru-cache 的 BlueOak-1.0.0。**无 AGPL / SSPL / MSCL / GPL 风险。**

### 覆盖率

| 方案 | 原始覆盖率 | 加权覆盖率 |
| --- | --- | --- |
| 沿用现状全自研 | 95.2% | — |
| 只换技术栈不换库 | 66.1% | 55.3% |
| **最终栈** | **91.9%（114.0/124）** | **73.7%（182.0/247）** |

**得分分布**：1 分 108 条 + 0.5 分 12 条 + 0 分 4 条 = **114**

**剩余 4 条 0 分全部是业务编排**（每日报道九步流程、候选筛选、撤回四步、简介清洗）——这类规则的参数值、执行顺序、边界范围全部由产品自己定，交给任何框架都只是「框架 + 一堆 if」，而 if 才是真正承载产品逻辑的部分。加权天花板约 **78%**。

### 自研量变化

| 项 | 现状 | 最终栈 | 变化 |
| --- | --- | --- | --- |
| 后端生产代码 | 10,266 行 | 约 5,600 行 | −4,666 行 |
| 后端横切 | 887 行 | 约 550 行 | −337 行 |
| 前端源码 | 8,677 行 | 8,677 行 | 持平 |
| 契约包 | 3,291 行 | 约 1,700 行 | −1,591 行 |
| 部署与工具链 | 2,300 行 | 约 3,100 行 | +800 行 |
| **合计** | **28,800 行** | **约 21,500 行** | **−7,300 行（−25.3%）** |

  省下 7,300 行**不是主要收益**。主要收益是**不再自己承担 auth、访问控制、CRUD、迁移、种子、向量检索、缓存、额度、限流、HTTP 客户端、代码索引、评测门禁这十二类的正确性责任**。

### 下一步不是写代码

**PoC 已从 8 项阻塞重组为 6 组执行，真阻塞 4 项**：

| 组 | 内容 | 工作量 |
| --- | --- | --- |
| **① 立即做** | P2（`trust proxy` + curl）· P3（`afterOperation` 查文档）· P7（NIM 端点 20 行验证）· P32（cron 时区源码 grep） | **3.5h** |
| **② 需先决策** | 建 PG 实例 + 定部署区域 + 验证 R-A 缓解措施 | **0.5d** |
| **③ 真阻塞** | **P1 + P30 + P31 + 缺口 #4 合并为 schema 迁移验证包**（共用同一 PG 实例） | **2d** |
| **④ 真阻塞** | P19（31 篇文档迁移 + 实机构建） | **1d** |

**总工期约 5 天。** 第 ① 组无任何环境依赖，**应当立即做掉**。

  **⬇️ 两项降级**：**P3**（无论 `afterOperation` 是否等待，处置代码都是 `void` + `.catch()` 不 await，答案不改变任何一行实现）· **P32**（唯一影响 D12，而 D12 已有回退方案选 C = BullMQ，回退代价仅栈项 11→12）。**不应因有回退方案的验证点卡住整个开工。**
 
  **✅ P20 已解除**：`@nuxt/content` 3.16.1 的 npm 包元数据证实支持 Nuxt 4。

### 换库代价与风险

换 PostgreSQL 需改**61 个文件 + 12 个测试文件（约 2,682 行）+ 4 个全新脚本 + 35 个索引手写 DDL**（PG 无 `autoIndex`）。

三个**静默失效**风险（失效时不报错，最容易漏）：

| # | 风险 | 症状 |
| --- | --- | --- |
| **R-A** | `maxIdleTimeMS:45000` 背后的 6.6s 延迟尖峰换库后无对应解 | 尖峰复活。**根因是物理链路**（Vercel 美东 → Atlas 新加坡跨区），不是连接池问题。**需同区部署 + Supavisor/连接池 + 重新实测**，不能沿用现有结论 |
| **R-B** | `daily_picks.postId` 是 `String` **弱引用**无外键 | **两层静默失效**。第二层（`:342-347` 级联删互动不检查删帖是否成功）后果**更严重**：帖子留存但**互动数据永久丢失**、计数永久错误 |
| **R-C** | `select: false` 密码哈希保护无 PG 等价物 | 该路径**零测试覆盖** → 静默通过率 100%。**现状是三道闸门**（`select: false` / `UserLean` 类型隔离 / `toPublicUser()` 逐字段挑选），换库后**三道全部需重建** + 补两条测试 |

  **✅ 已裁定**：**D-R1 = 免费**（Supabase Free，17 个 AWS 区域含 `us-east-1` 与 Vercel 默认 iad 同区）· **D-R2 = A**（Langfuse 一体作 OTLP 后端，**不引 OpenTelemetry Collector**）。两条裁定均**不新增技术栈项**，仍为 11 项。
 
  **完整方案见 [`TECH-SELECTION.md` §8.5](TECH-SELECTION.md)**，含四条硬约束：Supabase transaction pooling 的 prepared statement 与 `LISTEN`/`NOTIFY` 限制 · `ai_answer_cache` 禁 TTL · `posts.tags` 数组索引需拆 `GIN` + `BTREE`。

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

  **想彻底搞懂为什么这么分？** 读电子书里的
  [项目目录地图](./apps/docs/guide/project-structure.md)：
  完整目录树、设计理由、与高星项目的对照，以及一张"想找什么去哪"的速查表。

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

  **这是当前代码的启动方式。** 重构后需改两处：Node 升到 ≥ 22、数据库从
  `MONGODB_URI` 换成 `DATABASE_URL`（PostgreSQL）。逐项改动见
  [`docs/archive/tech-selection/final-stack.md`](docs/archive/tech-selection/final-stack.md)。

---

## 本地容器化运行（Docker Compose）

不想在本地装一整套 Node/pnpm 依赖、只想把整套服务跑在容器里？用 Docker Compose
一键起 **MongoDB + 后端(NestJS) + 前端(Nuxt SSR)** 三个服务。电子书文档不在此编排内
（它只是静态产物，按需另跑 `pnpm dev:docs` 或单独部署）。

  **重构后本节会变**：`mongo:7` 服务将换成 `postgres:16` + pgvector 扩展初始化，
  且需新增一个数据迁移服务。编排改动清单见
  [`docs/archive/tech-selection/final-stack.md`](docs/archive/tech-selection/final-stack.md)。

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

  `AI`（`NVNIM_*`）与 `GitHub`（`GITHUB_TOKEN`）相关变量**全部可留空**——未配 Key 时
  AI 自动降级为「未启用」，应用其余部分完全正常。当前仓库里的 `apps/api/.env`
  已按此填好，可直接用于本地 Docker。

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

  ⚠️ **待办：应用 AI 状态修复**。源码已修好「空 `NVNIM_API_KEY` 被误报为已启用」的问题
  （`apps/api/src/modules/ai/nv-nim.client.ts`），但**运行中的 api 镜像还没包含它**——
  因为构建需从 Docker Hub 拉取 `node:24-alpine` 基础镜像，而当时本机网络不通、镜像未缓存。
  待网络恢复后，跑下面任一命令即可重建并生效：
  ```bash
  powershell scripts/rebuild-api.ps1            # 带退避重试，网络抖动会自动重连（pwsh 亦可）
  # 或：pnpm docker:rebuild:api
  ```
  验证：未配 Key 时 `curl http://localhost:3000/api/ai/status` 应返回
  `enabled:false`、`keyConfigured:false`（与「未启用」设计行为一致）。

### 6. Docker Hub 网络注意事项（国内常见）

`docker-compose.yml` 用的基础镜像（`node:24-alpine`、`mongo:7`）都来自 Docker Hub。
大陆网络可能遭遇 TLS 阻断导致拉取超时（`net/http: TLS handshake timeout`）。

- **重试即可恢复**：多数情况是瞬时封锁，用上面的 `scripts/rebuild-api.ps1`
  （默认 60 次、指数退避封顶 60s）能自动扛过去；
- **加速 / 绕开（本机环境设置，不改仓库）**：在 Docker Desktop 的
  `Settings → Docker Engine` 里配置 `registry-mirrors`，例如：
  ```json
  "registry-mirrors": ["https://<你的镜像加速地址 "]
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

  **为什么这件事值得做**：能用同一套测试验证本地与线上，
  就同时证明了"部署成功"和"测试可信"。
 
  ⚠️ 注意：E2E 会往目标库**写真实数据**（真注册、真发帖）。
  指向线上库之前，先确认你能接受这些测试数据，或者先做一次快照
  （见 `deploy/snapshot.mjs`）。

---

## 部署

项目备了**两条路径**，可执行的那一刻起就能二选一。

  本节描述的是**当前代码的部署形态**。重构后 `/api` 的分流目标会从 NestJS
  变为 Payload，`/ebook` 会被主站的 `/docs` 取代（Nuxt Content 产出），
  但「单容器 + 按路径分流」这个结构不变——它是 Vercel 平台没有「构建上下文」
  字段这一约束的产物。详见 [`final-stack.md`](docs/archive/tech-selection/final-stack.md)。

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

  ⚠️ **已知网络限制**：`*.vercel.app` 这类域名在中国大陆会遭遇 DNS 污染与 TLS SNI 阻断
  （实测：同一 IP 换成其他 SNI 可正常访问，说明被针对的是域名而非 IP）。
  因此本机浏览器可能需要代理；正式对外使用应绑定**自有域名**。
  完整实测记录见电子书 [部署经验：上线时踩过的十个坑](./apps/docs/guide/deployment-lessons.md) 文末附录。

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

  未配 Key 时应用**照常启动**，`/ai/status` 返回 `enabled:false`，前端提示"去部署平台配置后重新部署"——这是设计行为，不是故障。完整踩坑见
  [部署经验：上线时踩过的十个坑](./apps/docs/guide/deployment-lessons.md) 的「坑 11」。

### 部署前必读

上线前请对照电子书「部署经验」一篇末尾的**上线前检查清单**逐项勾选
（密钥轮换、白名单、健康检查、备份、验证、回滚），详见
[部署经验：上线时踩过的十个坑](./apps/docs/guide/deployment-lessons.md)。
那次部署踩过的坑与排查过程都记在同一篇与它的姊妹篇里。

  这里刻意不写"带锚点的链接"：GitHub 与 VitePress 对中文标题生成的锚点规则不同
  （前者去掉顿号、后者保留），带锚点的链接总有一边会失效。

---

## 站内功能：`/roadmap` Agent 岗位学习路线

一条**从岗位反推**出来的路线：起点是 Python，终点是拿到 Agent 开发实习 Offer。
7 个阶段 / 45 个节点，每个节点带 `P0 必考 / P1 进阶 / P2 加分 / 贯穿` 优先级
与"岗位证据"（跨项目覆盖率、JD 频次、面试怎么问）。

- **双轨结构**：每阶段拆「主脊线（必经最少路径）」与「分支（完整技术栈 / 加分项）」两栏，
  时间不够就只走脊线；
- **优先级来源**：GitHub 11 个高相关项目「教什么」× 大厂 29 道真题「考什么」双向交叉，
  按跨项目覆盖率量化（P0 ≥ 9/11，P1 ≈ 4–8/11，P2 ≤ 6/11），页面底部「数据与方法」可自查；
- **面试题库**：题目落 `interview_questions` 集合，抽屉里按节点展示真题、公司与答题要点；
  读接口公开（未登录也能看），写接口需登录；题库不可用时降级为提示，路线主体照常显示；
- **学习材料＝外链索引**：45 个节点的学习材料直接指向下列 11 个开源项目里的 Markdown 原文
  （`adongwanai/AgentGuide`、`didilili/ai-agents-from-zero`、`kiwiwu02/LLM-RAG-Agent-LangChain-learing`、
  `pyigpt/AIRoadmap`、`limouren2000/llms-dev-study`、`Earth-OL-Player/ai_learn_project`、
  `bcefghj/ai-agent-interview-guide`、`liyupi/mianshiya`、`KalyanKS-NLP/RAG-Interview-Questions-and-Answers-Hub`、
  `KalyanKS-NLP/LLM-Interview-Questions-and-Answers-Hub`、`neurarch-ai/awesome-llm-system-design`），
  由 `scripts/scan-learning-materials.mjs` 扫描生成，不搬运正文、不涉及版权。
  重新选材：`node scripts/scan-learning-materials.mjs scan && ... build`（需要 `GITHUB_TOKEN` 提额）；
- **个人进度**：官方路线是只读模板，个人标记是独立覆盖层（localStorage + 登录云同步），
  进度区额外给出 **P0 完成度** —— 它才回答"能不能去面了"。

灌入种子真题（幂等，可重复执行）：

```bash
pnpm --filter @studyplan/api seed:interview
```

  ⚠️ 路线内容整体替换时**必须 bump `ROADMAP_VERSION`**：覆盖层按节点 id 关联，
  不升版本会让老用户拿着旧 id 的覆盖层去匹配新路线，变成一批永远读不到的孤儿数据。

---

## 实施阶段（8 个阶段 · 已完成记录）

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

每个阶段都交付了三样东西：

1. **可运行的最小实现**——能看见、能点、能验证；
2. **电子书笔记**——AI 出结构与初稿，**核心概念自己用话重写**，并记录踩坑；
3. **规划小练习**——写下阶段的功能三步拆解与工时估算，再对照修正。

  **下一阶段不是阶段 9，而是重构。** 当前代码库已冻结为对照基线
  （[`FUNCTIONALITY.md`](FUNCTIONALITY.md) 记录了它的全部功能与设计取舍），
  重构的 11 个批次见 [`REFRACTOR-SPEC.md`](REFRACTOR-SPEC.md)，
  目标技术栈见上文「技术选型」。
 
  上表 8 个阶段的**实现路径叙述仍有价值**——它记录了「怎么从零搭起来」的顺序，
  而这个顺序本身是复盘素材，不是要被覆盖的旧内容。

---

## 经验档案

电子书里有三篇**实战复盘**，记录的是"做的时候会撞上什么"：

| 文档 | 内容 |
| --- | --- |
| [部署经验：上线时踩过的十个坑](./apps/docs/guide/deployment-lessons.md) | 平台识别容器入口、启动超时掩盖真实报错、冷启动窗口、环境变量被污染、monorepo 构建上下文、构建工具依赖容器外的东西、白名单取舍、免费库无快照、多实例限流失效 + **上线前检查清单** |
| [调试经验：出问题时先看什么](./apps/docs/guide/debugging-lessons.md) | 定位顺序、只在线上复现的问题、SSR 水合竞态、失败位置远离成因时看什么、网络三段式排查、代理识别 + **排查动作清单** |
| [集成经验：从接口到浏览器](./apps/docs/guide/integration-lessons.md) | 契约两端不一致、**SSR 正常但交互全死**、构建期产物只在容器里生成、按名字猜模型性能、中文检索的分词与计分 + **集成检查清单** |

另有第四篇：[路线重写经验](./apps/docs/guide/roadmap-rewrite-lessons.md)——记录路线整体换轨时
「45 个新节点 id 与旧 18 个无一重合」这个发现，以及**为什么必须 bump 版本号**
（不升版本会让老用户拿着旧 id 的覆盖层去匹配新路线，变成一批永远读不到的孤儿数据，且不报任何错）。

其中调试篇里**如实保留了一条尚未查明根因的本地开发环境问题**，
所以"同一套测试本地与线上都绿"这个结论目前还不完全成立——细节见那篇的最后一节。

集成篇记录的是最近一次功能开发（热门项目榜 + AI 学习助手）的真实过程：
功能第一次被宣布"完成"时其实是坏的 —— 页面能看、数据都在，只是**所有按钮都是死的**。
那一篇的重点不是"怎么写功能"，而是**怎么发现自己写的功能其实没在工作**。

---

## 设计决策复盘

  这一节记录**被否决的方案**。技术选型里最值钱的不是「选了什么」，而是「没选什么、为什么不选」。
  完整版见 [`FUNCTIONALITY.md`](FUNCTIONALITY.md) 第 6 章与 [`TECH-SELECTION.md`](TECH-SELECTION.md) 第 6 章。

### 实现期踩过的坑（写进代码注释的那批）

| 坑 | 当时的错误做法 | 为什么错 | 现在的做法 |
| --- | --- | --- | --- |
| Mongoose 的 `updatePipeline` 漏了 | 用 `$inc` 改计数 | `$inc` 保不丢更新，但**保不出负数** | 聚合管道 `$max([0, $add])`（换库后为 `GREATEST(0, col + delta)`） |
| `forbidNonWhitelisted` 前端传了 `undefined` | 可选筛选条件直接传 | 多传一个未声明字段即 400 | 只在有值时才带该键 |
| 点赞用 `toggle` 语义 | `POST /like/toggle` | 手抖、客户端重试、401 刷新重放三种情况都会**翻转**结果 | 改用幂等的 `PUT` / `DELETE` |
| 报告 401 状态却挂了守卫 | 用 `@Public` 装饰器 | 装饰器根本不生效 | 显式不注册全局 `ThrottlerGuard` |
| `monorepo` 契约包 CJS 打包 | 依赖 Vite 预打包兜底 | 兜底失效时**整页客户端 JS 全死但 SSR HTML 正常** | 契约包转ESM，移除兜底并验证 |
| 入口中间件用方法引用 | `app.use(logger)` 直接传方法 | 丢 `this`，`res.on('finish')` 里访问 `this.logger` 会崩进程 | 必须包一层箭头函数 |
| 分段计时放在拦截器 | 在 `next.handle()` 外计时 | `next.handle()` 只是构造 Observable，**不是订阅**，分段会静默丢失 | 必须放中间件层 |

### 选型期否决的方案（重构调研）

| 否决项 | 一句话理由 |
| --- | --- |
| **Directus** | v12 起改用 MSCL 1.0（source-available，非OSI 开源），带 500 万美元营收 / 50 人门槛 |
| **NocoBase** | 自带 React 客户端，与 Nuxt 二选一 |
| **NestJS 作为第二后端** | 双后端制造比现状更复杂的边界 |
| **tRPC** | 官方README 未列 Nuxt / Nitro adapter |
| **Redis** | BullMQ 支持 PG 后端，引 Redis 等于新增一个运维面 |
| **Sentry** | SaaS 数据出境，与「日志不写敏感数据」冲突 |
| **LangGraph（Python）** | Python-first，部署复杂度翻倍 |
| **LanceDB / Qdrant** | pgvector 已在库内，再引数据层是重复运维 |
| **保留 VitePress** | 重构需求要求「构建链不再产出独立文档站」 |

### 四条贯穿全程的取舍

| 取舍 | 内容 |
| --- | --- |
| **幂等优于切换** | 同一操作重复调用结果不变，因此前端可以放心重试 |
| **旁路永不抛异常** | AI、检索、外部数据源一律返回空值 / 失败标记 / 降级原因，**不让增强能力打挂核心链路** |
| **失败用返回值表达** | 「未配置 / 额度用尽 / 被限流 / 上游报错」四种情况用户该做的事完全不同，统一成错误码等于把判断责任推给前端猜 |
| **检索为空时宁可拒答** | 宁可说「没有资料」，也不能让模型自由发挥 |

完整的 13 条取舍记录见 [`FUNCTIONALITY.md`](FUNCTIONALITY.md) 第 6 章。

---

## 密钥安全（不是可选项）

- 真实密钥只写在 `apps/api/.env`，该文件已被 `.gitignore` 忽略；
- 仓库里只保留 `.env.example`（全部为空值）；
- 如果密钥曾经被提交过，**立刻去平台重置密钥**，再清理 Git 历史。

  **实测教训（来自本项目的真实经历）**：
  曾经有一个示例文件被误填了真实数据库连接串，虽然它**没有进入提交历史**（清空即可），
  但那条**曾经外泄过的旧密码，在事后多日仍然可以连上数据库**。
 
  所以：**"清空文件"只消除了继续扩散，不等于风险消失。**
  凭据一旦外泄，正确动作是**立即轮换**，而不是等有空再说。

---

## 电子书

`apps/docs` 既可以在本地 `pnpm dev:docs` 预览，也可以单独构建成静态站点发布：

```bash
pnpm --filter @studyplan/docs build     # 产物：apps/docs/.vitepress/dist
```

  **迁移计划已定**：重构会把 31 篇并入主站，改用 Nuxt Content 3 渲染，
  弃用独立文档站（`FR-DOC-1` 要求「构建链不再产出独立文档站」）。
  旧链接会做 301 重定向到新路径。详见
  [`REFRACTOR-SPEC.md`](REFRACTOR-SPEC.md) 批次 10。
