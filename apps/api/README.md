# `@studyplan/api` · 后端

**这是后端。** 前端看不到的逻辑都在这里：数据库读写、密码哈希、JWT 签发与校验、
权限判定、调用大模型。对外只暴露 REST 接口。

技术栈：NestJS 11 + TypeScript + Mongoose（MongoDB Atlas）+ Swagger，
外加两个官方包：`@nestjs/terminus`（健康检查）与 `@nestjs/throttler`（限流）。
配套：Jest 单测（54 个用例）。

---

## `src/` 下只有五样东西

这是刻意的设计。目录结构就是心智模型 —— 找东西时不用靠记忆，靠推理。

```text
apps/api/src/
├── main.ts                   启动入口：全局管道、CORS、Swagger、日志
├── app.module.ts             根模块：把下面所有模块装起来
│
├── common/                   横切关注点（不专属于任何业务）
│   ├── decorators/           @CurrentUser() 从请求里取当前用户
│   ├── filters/              全局异常过滤器，统一错误响应形状
│   ├── guards/               JwtAuthGuard，保护需要登录的接口
│   ├── interceptors/         ① 生成链路 ID  ② 统一成功响应包装
│   ├── middleware/           访问日志：状态码 / 耗时 / 链路 ID
│   ├── schemas/              可复用子文档（Author 被帖子/评论共用）
│   ├── strategies/           Passport 的 JWT 校验策略
│   ├── types/                仅后端内部使用的类型
│   └── utils/                Cookie 读写、Mongo 错误码转换
│
├── config/
│   └── env.validation.ts     启动时校验环境变量，缺失就直接崩
│
└── modules/                  业务模块，每个都自包含
    ├── health/               健康检查（服务活着吗？数据库连上了吗？）
    ├── users/                用户：Schema、查询
    ├── auth/                 注册、登录、刷新 Token
    ├── posts/                帖子：CRUD、分页、标签筛选
    ├── comments/             评论
    ├── likes/                点赞（原子计数）
    └── ai/                   摘要与标签（LangChain 依赖已移除，当前恒为降级）
```

**"横切"是什么意思？** 指那些被很多业务用到的通用能力。
`JwtAuthGuard` 要被帖子、评论、点赞都用，但它本身不属于任何一个业务，
所以放 `common/`。判断标准很简单：

> 这个文件**服务于某个具体业务**吗？是 → `modules/`；否 → `common/`。

---

## 一个模块内部长什么样

NestJS 的价值就是**每个模块结构完全一致**。学会一个，其他七个不用重新学。

以 `modules/posts/` 为例：

```text
modules/posts/
├── posts.module.ts         装配说明书：声明谁负责什么、依赖谁
├── posts.controller.ts     只做三件事：收参数 → 调 service → 返回
├── posts.service.ts        真正的业务逻辑（唯一值得写单测的地方）
├── posts.mapper.ts         Mongoose Document → 共享契约类型
├── dto/                    入参校验规则（class-validator）
│   ├── create-post.dto.ts
│   ├── update-post.dto.ts
│   └── query-posts.dto.ts
├── schemas/
│   └── post.schema.ts      Mongoose Schema = 数据在数据库里的形状
└── posts.service.spec.ts   Jest 单测
```

四个角色的边界，**这是后端的核心纪律**：

| 文件 | 只该干什么 | 不该干什么 |
| --- | --- | --- |
| Controller | 解析请求、调用 Service、决定状态码 | 写业务逻辑、碰数据库 |
| Service | 业务规则、编排数据访问 | 知道 HTTP 的存在（不碰 req/res） |
| Schema | 数据形状、索引、校验 | 写业务规则 |
| Mapper | 字段裁剪与改名 | 查数据库、做判断 |

**为什么坚持这条纪律？** 因为 Service 不知道 HTTP 是什么，所以你可以直接
`new PostsService(mockModel)` 写单测，不需要起服务器、不需要连数据库。
一旦业务逻辑漏进 Controller，你就再也测不动了。

---

## 一次请求的完整生命周期

以 `POST /api/posts`（发帖）为例。**执行顺序是 Nest 规定的，不是随意排的**：

```text
HTTP 请求
   │
   ├─ ① HttpLoggerMiddleware（common/middleware · 中间件层，最先执行）
   │     生成链路 ID（优先复用上游传来的 x-request-id），写进响应头 X-Request-Id；
   │     响应结束时打一行访问日志：
   │       [HTTP] POST /api/posts 201 42ms rid=3f2a…
   │     ⚠️ 必须排在最前：它之后的所有环节才能共用同一个 ID
   │
   ├─ ② JwtAuthGuard（common/guards · 守卫层）
   │     校验 Authorization 头里的 Access Token，无效 → 401
   │     ⚠️ 守卫**先于管道**执行：所以无效 Token 得到 401，
   │        而不是"参数校验失败"的 400
   │
   ├─ ③ ThrottlerGuard（限流，只挂在需要的接口上）
   │     超过配额 → 429
   │
   ├─ ④ RequestIdInterceptor（common/interceptors · 拦截器前置阶段）
   │     取出/补齐链路 ID，供最后写进响应体
   │
   ├─ ⑤ ValidationPipe（main.ts 全局注册 · 管道层）
   │     按 CreatePostDto 上的装饰器校验 body，不合法 → 400
   │
   ├─ ⑥ CurrentUser 装饰器（common/decorators）
   │     把 Token 里的用户信息塞进方法参数
   │
   ├─ ⑦ PostsController.create(dto, user)
   │     只做转发
   │
   ├─ ⑧ PostsService.create()
   │     业务逻辑：写库、更新计数（AI 摘要当前恒为降级）
   │
   ├─ ⑨ PostsMapper.toPost()
   │     把内部数据结构转成 packages/shared 定义的契约形状
   │
   ├─ ⑩ TransformInterceptor（common/interceptors · 拦截器后置阶段）
   │     把返回值包成统一成功响应，并把链路 ID 一起带上
   │
   └─ 响应
   
   ※ 任何一步抛异常 → AllExceptionsFilter（common/filters）
     统一压成 ApiErrorBody
```

两种响应形状都由 `packages/shared` 定义，前端同时引用同一份契约：

| 形状 | 类型 | 谁产生 |
| --- | --- | --- |
| 成功 | `ApiSuccessBody<T>`（`statusCode` / `data` / `requestId` / `timestamp`） | `TransformInterceptor` |
| 失败 | `ApiErrorBody`（`statusCode` / `message` / `error` / `path` / `details`） | `AllExceptionsFilter` |

**健康检查（`/api/health`）与接口文档（`/docs`）刻意排除在统一包装之外**：
它们各有自己的约定形状，硬套业务响应只会让双方都难读。

这些横切件都在 `common/` 里，各只有一个文件，改一处全局生效。

---

## 常用命令

在本目录下：

```bash
pnpm dev          # 开发模式（热重载）  http://localhost:3000/api
pnpm build        # 编译到 dist/
pnpm start        # 运行编译产物
pnpm test         # Jest 单测
pnpm test:watch   # 单测监听模式
```

接口文档（Swagger）：后端启动后访问 <http://localhost:3000/docs>

## 环境变量

真实值写在 `apps/api/.env`（该文件已被 `.gitignore` 忽略，**绝不进 Git**）。
模板见仓库根目录的 `.env.example`。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `MONGODB_URI` | **是** | — | 连接串，含用户名密码，至少 20 字符 |
| `JWT_ACCESS_SECRET` | **是** | — | Access Token 签名密钥，至少 32 字符 |
| `JWT_REFRESH_SECRET` | **是** | — | Refresh Token 签名密钥，至少 32 字符，**必须与上面不同** |
| `NODE_ENV` | 否 | `development` | 只接受 `development` / `production` / `test`。**决定 Cookie 的 `secure` 属性**：生产必须是 `production`，否则 HTTPS 下浏览器会丢弃 Refresh Cookie |
| `PORT` | 否 | `3000` | 监听端口 |
| `CORS_ORIGIN` | 否 | `http://localhost:3001` | 允许的前端来源，多个用逗号分隔 |
| `COOKIE_SAME_SITE` | 否 | `lax` | 只接受 `lax` / `none` / `strict`；非法值回落 `lax`。跨站部署才需要 `none` |
| `JWT_ACCESS_EXPIRES_IN` | 否 | `15m` | Access Token 有效期 |
| `JWT_REFRESH_EXPIRES_IN` | 否 | `7d` | Refresh Token 有效期 |
| `NVNIM_API_KEY` | 否 | 空 | 缺失时 AI 功能自动降级，不影响发帖 |
| `NVNIM_MODEL` | 否 | `deepseek-ai/deepseek-v4-flash-0731` | 模型会下线，故做成可配而非写死 |
| `NVNIM_TIMEOUT_MS` | 否 | `25000` | AI 单次调用超时 |
| `NVNIM_DAILY_LIMIT` | 否 | `300` | 每日调用上限（命中缓存不计） |
| `GITHUB_TOKEN` | 否 | 空 | 配了可把 Search 限流从 10 次/分提到 30 次/分 |
| `GITHUB_TRENDING_CACHE_TTL_MINUTES` | 否 | `360` | 榜单缓存软过期时长 |

缺失必填项时，`config/env.validation.ts` 会让进程**启动即失败**并打印哪个变量有问题 ——
配置错误要在启动时暴露，而不是等到用户点了发帖才报错。

---

## 容器化部署形态

后端在容器里的启动方式是固定的：

```text
apps/api/Dockerfile（多阶段）
  ├─ deps      只复制清单文件 → pnpm install --filter @studyplan/api...
  ├─ build     先构建 packages/shared，再 nest build
  ├─ prod-deps 只装生产依赖
  └─ runtime   只搬 dist 与生产依赖，CMD node apps/api/dist/main.js
```

两个必须记住的约束：

1. **构建上下文必须是仓库根**。`apps/api` 通过 `workspace:*` 依赖 `packages/shared`，
   而 Docker 不允许 COPY 上下文之外的文件 —— 上下文设成 `apps/api` 就必然构建失败。
2. **`packages/shared` 没有 `node_modules` 可拷**。它是纯类型 + 常量的包、运行时零依赖，
   因此 `pnpm install --prod` 不会为它生成该目录；去 COPY 它会让构建直接报
   `"/app/packages/shared/node_modules": not found`。它运行时只需要 `dist` 与 `package.json`。

另外，容器里监听地址必须是 `0.0.0.0`（**不能是 `127.0.0.1`**）——
否则网关从容器网络访问不到它，表现是"部署成功但接口 502"，而容器日志一切正常。

> 单容器部署时前后端同处一个镜像、由入口脚本按路径分流，
> 见仓库根的 `Dockerfile.vercel` 与 `docker/vercel/entrypoint.mjs`。
