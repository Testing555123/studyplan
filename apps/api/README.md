# `@studyplan/api` · 后端

**这是后端。** 前端看不到的逻辑都在这里：数据库读写、密码哈希、JWT 签发与校验、
权限判定、调用大模型。对外只暴露 REST 接口。

技术栈：NestJS 11 + TypeScript + Mongoose（MongoDB Atlas）+ Swagger。
配套：Jest 单测。

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
    └── ai/                   LangChain + 智谱 GLM，生成摘要与标签
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

以 `POST /api/posts`（发帖）为例，看横切件在哪一步生效：

```text
HTTP 请求
   │
   ├─ ① ValidationPipe（main.ts 全局注册）
   │     按 CreatePostDto 上的装饰器校验 body，不合法 → 400
   │
   ├─ ② JwtAuthGuard（common/guards）
   │     校验 Authorization 头里的 Access Token，无效 → 401
   │
   ├─ ③ CurrentUser 装饰器（common/decorators）
   │     把 Token 里的用户信息塞进方法参数
   │
   ├─ ④ PostsController.create(dto, user)
   │     只做转发
   │
   ├─ ⑤ PostsService.create()
   │     业务逻辑：写库、更新计数、调用 AI 生成摘要
   │
   ├─ ⑥ PostsMapper.toPost()
   │     把内部数据结构转成 packages/shared 定义的契约形状
   │
   └─ 响应
   
   ※ 任何一步抛异常 → AllExceptionsFilter（common/filters）
     统一压成 { statusCode, message, error } 形状
```

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

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 默认 `3000` |
| `MONGODB_URI` | **是** | Atlas 连接串，含用户名密码 |
| `JWT_ACCESS_SECRET` | **是** | Access Token 签名密钥，至少 32 字符 |
| `JWT_REFRESH_SECRET` | **是** | Refresh Token 签名密钥，**必须与上面不同** |
| `CORS_ORIGIN` | 否 | 允许的前端来源，默认 `http://localhost:3001` |
| `ZHIPUAI_API_KEY` | 否 | 智谱 Key。缺失时 AI 功能自动降级，不影响发帖 |

缺失必填项时，`config/env.validation.ts` 会让进程**启动即失败**并打印哪个变量有问题 ——
配置错误要在启动时暴露，而不是等到用户点了发帖才报错。
