# 阶段 3 · 后端与数据库

> 这一阶段你会第一次遇到"程序跑不起来，但不是语法错误"这类问题。
> 它来自你的代码之外：连接串、IP 白名单、环境变量。

---

## 一、动手之前：必须先完成 Atlas 配置

**这一步不做，后端会拒绝启动**（这是故意设计的，见下文）。

完整步骤见 [环境准备](/guide/environment)。最短路径：

1. 注册 <https://cloud.mongodb.com>，建一个 **M0 免费集群**；
2. `Database Access` 建一个数据库用户，保存好密码；
3. `Network Access` 把你当前 IP 加进白名单；
4. `Connect → Drivers → Node.js` 复制连接串，把 `<password>` 换成真实密码，
   并在 `.net/` 后面补上数据库名 `studyplan`；
5. 填进 `apps/api/.env` 的 `MONGODB_URI`。

> **第 3 步是新手最常漏的一步。** 症状是"连接串看起来完全正确，
> 但就是连不上"。原因是 Atlas 默认拒绝所有未列入白名单的 IP。

## 二、验收清单

```bash
pnpm dev:api
```

- [ ] 启动日志里没有报错，能看到"后端已启动"
- [ ] 打开 `http://localhost:3000/api/health`，`database` 是 `"connected"`
- [ ] 打开 `http://localhost:3000/docs`，能看到 Swagger 接口文档
- [ ] 在 Swagger 里调 `POST /api/posts` 创建一条帖子，返回 201
- [ ] 用返回的 id 调 `GET /api/posts/{id}`，能拿到刚才那条
- [ ] 调 `GET /api/posts?tag=NestJS`，能筛出对应帖子
- [ ] 去 Atlas 网页控制台，在 `Collections` 里**亲眼看到**这条数据
- [ ] 故意请求一个不存在的 id，返回 404 且错误体形状是统一的
- [ ] `pnpm test` 通过（13 个用例）

---

## 三、核心概念

### 1. 三层职责：Controller / Service / Model

```text
HTTP 请求
   ▼
Controller  解析请求、调用 service、返回结果   ← 不写业务判断
   ▼
Service     业务规则 + 数据访问                 ← 不知道 HTTP 的存在
   ▼
Model       只和数据库对话
```

判断分层是否清晰，有一个很实用的标准：**Controller 里有没有 `if`？**
本项目 `posts.controller.ts` 里每个方法都只有一行。

为什么 Service 不能碰 HTTP？因为它要能被复用和测试。
本项目的 `PostsService` 是一个纯 TypeScript 类，
单测里 `Test.createTestingModule` 直接把它 new 出来就能跑，不需要假装有个请求。

#### 实现方法

本项目 `posts.controller.ts` 每个方法只有一行：解析请求、调用 service、返回结果，不写业务判断；`PostsService` 是纯 TypeScript 类，承载业务规则和数据访问；Model 只和数据库对话。判断分层是否清晰，看 Controller 里有没有 `if`。

#### 原理

分层把"处理 HTTP"和"处理业务"拆开：Controller 只负责协议边界（取参数、给状态码），Service 只关心规则和持久化，Model 只关心存储。Service 不依赖 HTTP，因此能在没有请求的情况下被直接调用和测试。这一层边界让每层各司其职、可独立替换。

#### 与相关技术栈的关系

和"把查询和逻辑都写在路由 handler 里"（早期 Express 常见写法）相比，三层结构更易测试和复用。MVC 是更老的说法（Model/View/Controller），这里 View 由前端承担，后端只剩 Controller/Service/Model。和 Clean Architecture、DDD 的分层相比，本项目只分三层，没有用例层和应用层，复杂度适配规模。

#### 面试常见问题与解题思路

**Q1：Controller、Service、Model 各自负责什么？**
怎么想：从"职责边界"切入。怎么答：Controller 处理 HTTP 边界，Service 写业务规则，Model 管数据访问；Controller 不应有业务 if。追问：为什么 Service 不能抛 HTTP 异常？

**Q2：为什么业务逻辑要放在 Service 而不是 Controller？**
怎么想：从"可测试与可复用"切入。怎么答：Service 不依赖请求对象，可在单测里直接 new 出来跑；同一份逻辑能被多个 Controller 或定时任务复用。追问：如果业务很薄，有没有必要分三层？

### 2. 依赖注入：容器是怎么知道该塞什么的

```ts
constructor(
  @InjectModel(Post.name) private readonly postModel: Model<Post>,
) {}
```

注意这里没有 `new`。容器靠 `@InjectModel(Post.name)` 这个装饰器
知道该注入哪个 Model —— 而 Model 是在 `PostsModule` 的
`MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }])` 里注册的。

于是有一条必然成立的推论：

> **`forFeature` 注册在哪个模块，`@InjectModel` 才能用在哪个模块。**
> 其它模块要用，必须 import 那个模块，而且那个模块必须把它 `exports` 出去。

"注入进来是 undefined"的报错，九成是因为这条链断了一环。

#### 实现方法

本项目在 Service 构造函数里写 `constructor(@InjectModel(Post.name) private readonly postModel: Model<Post>)`，没有 `new`。Model 在 `PostsModule` 的 `MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }])` 注册；其它模块要用，必须 import 该模块且它 `exports` 出去。

#### 原理

NestJS 启动时构建一个依赖容器（IOC）。它读取构造函数上的装饰器（如 `@InjectModel`），去已注册的 provider 里找对应实例并注入。所以"注入进来是 undefined"九成是因为 `forFeature` 注册、`@InjectModel` 使用、模块 import 或 exports 这条链断了一环。

#### 与相关技术栈的关系

和手写 `new Service(new Model())` 相比，依赖注入把"对象怎么造"交给容器，调用方只声明需要什么。React 没有 DI 容器，靠 context 或 prop 透传；Angular 也有自己的 DI 系统，理念类似。和 Spring 的 DI 相比，NestJS 的设计明显借鉴了 Spring，但用 TypeScript 装饰器实现。

#### 面试常见问题与解题思路

**Q1：NestJS 的依赖注入是怎么工作的？**
怎么想：从"容器加装饰器"切入。怎么答：启动时扫描 provider，按构造函数装饰器把实例注入。追问：`forFeature` 注册的 Model 为什么只能在注册它的模块里注入？

**Q2：遇到注入进来是 undefined 怎么排查？**
怎么想：从"链条断点"切入。怎么答：依次查 Model 是否在 `forFeature` 注册、是否在模块 `exports`、消费方模块是否 `import` 了该模块。追问：怎么让一个 provider 被全局共享？（`@Global` 模块）

### 3. DTO + 校验管道：把不可信输入变成可信数据

```ts
@Length(TITLE_MIN_LENGTH, TITLE_MAX_LENGTH)
title!: string
```

这些常量来自 `@studyplan/shared`，前端 `posts/new.vue` 显示的字数上限
用的是**同一批常量**。这一条就消灭了"前后端校验规则不一致"这个经典问题。

全局管道配了三件事，每一件都有明确用意：

| 选项 | 作用 | 不配的后果 |
| --- | --- | --- |
| `whitelist` | 剥掉 DTO 未声明的字段 | 客户端能塞进 `likeCount: 99999` |
| `forbidNonWhitelisted` | 有多余字段直接报错 | 同上，但静默丢弃，更难发现 |
| `transform` | 按 DTO 类型做转换 | `?page=2` 永远是字符串 `'2'` |

**最后一条最阴险**：`'2'` 参与 `(page - 1) * pageSize` 会算出 `NaN`，
然后你得到一份空列表，却完全看不出哪里错了。

#### 实现方法

本项目用 class-validator 装饰器定义 DTO，如 `@Length(TITLE_MIN_LENGTH, TITLE_MAX_LENGTH) title!: string`，常量来自 `@studyplan/shared`，前端字数上限用同一批常量。全局管道开 `whitelist`（剥掉未声明字段）、`forbidNonWhitelisted`（多余字段直接报错）、`transform`（按 DTO 类型转换，避免 `'2'` 永远是字符串）。

#### 原理

管道在请求进入 handler 前运行：先按规则校验字段，再把字符串参数转换成 DTO 声明的类型。没有 `transform` 时，`?page=2` 永远是字符串，`(page-1)*pageSize` 会算出 `NaN` 得到空列表，且看不出错在哪。`whitelist` 防止客户端塞进 `likeCount: 99999` 这类未声明字段。

#### 与相关技术栈的关系

和手写 `if (!body.title) throw` 相比，DTO 加装饰器声明式校验更集中、可复用，且和前端共用常量保证规则一致。和 JSON Schema、OpenAPI 校验相比，class-validator 和 NestJS 管道集成更顺。和 zod（运行时 schema 校验，社区越来越流行）相比，class-validator 偏向装饰器风格。

#### 面试常见问题与解题思路

**Q1：DTO 和实体（Entity）有什么区别？**
怎么想：从"输入 vs 存储"切入。怎么答：DTO 描述接口接受的输入与校验，Entity 描述数据库模型；两者字段常不同。追问：为什么不在 Controller 直接收 Entity？

**Q2：全局管道里的 whitelist 有什么用？**
怎么想：从"防越权字段"切入。怎么答：剥掉 DTO 未声明的字段，防止客户端塞未授权字段（如改自己文章的作者）。追问：`transform` 不开启会有什么隐蔽 bug？

### 4. 建模取舍：为什么作者是"内嵌快照"

阶段 3 最值得思考的一个决定：帖子里怎么存作者？

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| 只存 `authorId` | 无冗余 | 列表页要再查一次用户表（N+1） |
| 内嵌完整用户文档 | 一次查询拿全 | 用户改了昵称，历史帖子显示旧名；还会把密码哈希带进 posts 集合 |
| **内嵌最小快照** ✅ | 列表一次查完，无敏感字段 | 用户名变更后历史帖子显示旧名 |
| 独立 `post_authors` 集合 | 无冗余 | 多一次 join，本项目规模不值得 |

我们选了第三种，并**主动接受**"旧名"这个代价 —— 对技术社区来说，
"这篇文章发布时作者叫这个名字"甚至更符合直觉。

> 建模的核心能力不是"知道有几种方案"，而是**能说清每种方案放弃了什么**。

#### 实现方法

帖子存作者时本项目选"内嵌最小快照"：列表一次查完、不含敏感字段，主动接受"用户名变更后历史帖子显示旧名"。其它方案（只存 authorId、内嵌完整文档、独立集合）的取舍都在文档表里列清楚了。

#### 原理

建模不是选"最对的"，而是在冗余、查询次数、数据新鲜度之间权衡，并清楚说出每种方案放弃了什么。内嵌快照用少量冗余换掉每次列表的额外用户表查询（避免 N+1），同时不把密码哈希带进 posts 集合。对技术社区，"发布时作者叫这个名字"甚至更符合直觉。

#### 与相关技术栈的关系

和关系型数据库的"外键加 join"相比，MongoDB 文档模型更倾向内嵌以减少查询，但代价是冗余和一致性。和只存 id 的规范化做法相比，内嵌快照牺牲新鲜度换性能。和 CQRS（为读模型单独建投影）相比，本项目规模不需要那么重的方案。

#### 面试常见问题与解题思路

**Q1：帖子里的作者信息怎么存？有几种方案？**
怎么想：从"冗余 vs 查询次数"切入。怎么答：只存 id、内嵌完整文档、内嵌最小快照、独立集合，各自权衡；本项目选快照。追问：用户名改了历史帖子怎么办？（接受旧名或异步更新快照）

**Q2：MongoDB 建模和关系型有什么不同？**
怎么想：从"内嵌 vs 范式"切入。怎么答：Mongo 倾向内嵌减少 join，关系型倾向外键规范化；选哪种看读写比。追问：什么情况下内嵌会出问题？（数组无限增长、需跨文档事务）

### 5. 索引：等值在前，排序在后

```ts
PostSchema.index({ createdAt: -1 })
PostSchema.index({ tags: 1, createdAt: -1 })
```

第二个复合索引的字段顺序不是随便写的。查询是
"`tags` 等于某个值，然后按 `createdAt` 倒序"，所以：

```text
{ tags: 1, createdAt: -1 }   ✅ 能用上索引
{ createdAt: -1, tags: 1 }   ❌ 前导字段是范围/排序，筛不了标签
```

为什么不给 `title`、`content` 建索引？
因为它们不参与查询条件，只出现在返回结果里。
**索引是为了更快"找到"，不是为了更快"读出"。**

#### 实现方法

本项目建 `PostSchema.index({ createdAt: -1 })` 和复合索引 `PostSchema.index({ tags: 1, createdAt: -1 })`。查询是"tags 等于某值再按 createdAt 倒序"，所以 tags 放在前、createdAt 在后；前导字段是范围或排序的 `{ createdAt: -1, tags: 1 }` 则筛不了标签。

#### 原理

复合索引的字段顺序决定它能否被查询用上：最左前缀原则要求查询条件从索引第一个字段开始匹配。等值条件（tags=值）放前面能快速定位，后面的排序字段（createdAt）顺势用于排序；若把排序字段放前导，等值条件就享受不到索引。索引是为了更快"找到"，不是为了更快"读出"，所以不给 title、content 建索引。

#### 与相关技术栈的关系

和关系型数据库（MySQL、PostgreSQL）的联合索引一样遵循最左前缀原则。和给每个字段都建单列索引相比，复合索引更省空间、对组合查询更有效。MongoDB 的 `explain()` 能看查询是否走了索引；缺索引在数据量小看不出，量大就变全表扫描。

#### 面试常见问题与解题思路

**Q1：复合索引的字段顺序怎么定？**
怎么想：从"最左前缀"切入。怎么答：等值条件放前，范围或排序放后；查询必须能命中索引最左前缀。追问：`{ createdAt: -1, tags: 1 }` 为什么筛不了 tags？

**Q2：怎么判断一条查询有没有用上索引？**
怎么想：从"执行计划"切入。怎么答：用 `explain()` 看是 `COLLSCAN`（全表）还是 `IXSCAN`。追问：索引是不是越多越好？（写入变慢、占用空间）

### 6. 显式映射：为什么不能 `res.json(document)`

`posts.mapper.ts` 做了一件事：把数据库形状逐字段挑选成契约形状。

如果直接返回 Mongoose 文档，会发生三件坏事：

1. `_id`、`__v`、`updatedAt` 这些内部字段会发给前端，
   前端开始依赖它们，你再改结构就得同时改两端；
2. 前端拿到的是 `_id` 而不是 `id`，每个页面都要转换一次；
3. 一旦某个字段是敏感的（比如将来用户的 `passwordHash`），
   它会**自动**泄漏 —— 因为你是"整体返回"而不是"逐字段挑选"。

> **默认不发送，要发就明确写出来。** 这一层是安全性的基础设施。

#### 实现方法

`posts.mapper.ts` 把数据库文档逐字段挑选成契约形状，而不是整体返回。前端因此拿到 `id` 而不是 `_id`，也不会看到 `__v`、`updatedAt` 等内部字段。

#### 原理

直接 `res.json(document)` 会发回 `_id`、`__v`、`updatedAt`，前端开始依赖它们后改结构要两端联动；更危险的是敏感字段（如将来用户的 `passwordHash`）会被自动带上。显式映射遵循"默认不发送，要发就明确写出来"，把对外暴露的字段收口到一处，是安全性的基础设施。

#### 与相关技术栈的关系

和 ORM 的"自动序列化全部属性"相比，显式映射更可控、更安全。和 GraphQL 的"客户端声明要哪些字段"（天然防过度返回）相比，REST 返回的字段由后端决定，所以更需要手动映射层。和 DTO 出站（class-transformer 的 `Expose`/`Exclude`）相比，本项目用手写 mapper 更直观。

#### 面试常见问题与解题思路

**Q1：为什么不能直接把数据库文档返回给前端？**
怎么想：从"安全与契约"切入。怎么答：会泄露内部字段、暴露 `_id`、且可能带出敏感数据；契约也会和存储强耦合。追问：怎么防止意外返回 passwordHash？

**Q2：出站 DTO 或映射层有什么作用？**
怎么想：从"最小暴露"切入。怎么答：只暴露需要的字段、统一字段命名（id 而非 _id）、解耦存储结构与对外契约。追问：和 GraphQL 比，REST 在防过度返回上缺什么？

---

## 四、代码走读

### `posts.service.ts` —— 三个性能决策

```ts
const [docs, total] = await Promise.all([
  this.postModel.find(filter).sort({ createdAt: -1 }).skip(...).limit(...).lean().exec(),
  this.postModel.countDocuments(filter).exec(),
])
```

1. **`Promise.all` 并行**：`count` 与 `find` 互不依赖，串行等于白等一个往返；
2. **`.lean()`**：不加它，每条记录都会被包装成带 `save()` / `validate()`
   的文档实例。列表是只读场景，用不到那些方法，白白付内存与 CPU；
3. **`skip` + `limit`**：而不是取回全部再在内存里切。
   数据量小时没区别，数据量一大就是"能用"和"不能用"的差别。

（顺带记一个将来会遇到的坑：`skip` 在很深的页码上会变慢，
因为数据库仍要扫描并丢弃前面所有文档。解法是游标分页，
但那超出本项目的规模。）

### `all-exceptions.filter.ts` —— 为什么必须有全局错误出口

不统一处理的话，同一个后端会返回好几种错误形状：

```text
抛 HttpException      → { statusCode, message, error }
DTO 校验失败          → { statusCode, message: ['字段A...', '字段B...'] }
未捕获异常            → 空响应 + 500
```

前端于是被迫写三套错误处理，而且永远猜不准 `message` 是字符串还是数组。

这个过滤器把它们压成 `ApiErrorBody` 一种形状（类型定义在 `packages/shared`，
所以前端拿到的类型是准的），并且**区分对待两类错误**：

- `HttpException`：我们主动抛的，是预期内的业务错误，记一行 warn 即可；
- 其它异常：是没预料到的 bug，**必须打完整堆栈** ——
  但**绝不能返回给客户端**（堆栈里有文件路径和依赖版本，是很好的攻击情报）。

### `env.validation.ts` —— fail fast

`MONGODB_URI` 被声明成必填。用 `@MinLength(20)` 而不是 `@IsNotEmpty`，
是因为漏填时值是空字符串，`IsNotEmpty` 的报错不够直白。

实测的两种失败路径（都已验证过）：

```text
未配置 MONGODB_URI：
  环境变量校验失败，请检查 apps/api/.env：
    - 【MONGODB_URI】MONGODB_URI 未配置或格式明显不对。它应该形如 mongodb+srv://...</
  退出码 1

配置了但地址不可达：
  [MongooseModule] Unable to connect to the database. Retrying (1)...
  MongooseServerSelectionError: connect ECONNREFUSED
  退出码 1
```

这两条信息的区别至关重要：前者告诉你**配置错了**，后者告诉你**网络/服务有问题**。
如果不在启动时做校验，这两种情况都会在第一个用户请求时才暴露，
而且都表现成"接口 500"，你得从零开始猜。

---

## 五、踩坑记录

### 坑 1 · Mongoose 9 删掉了 `FilterQuery`

```ts
import { FilterQuery } from 'mongoose'   // ❌ TS2614: has no exported member
```

在 Mongoose 9 的全部类型声明里，`FilterQuery` 这个名字**一次都没有出现**。
这是主版本升级的破坏性变更，而且报错信息很迷惑 ——
它建议你 "use `import FilterQuery from "mongoose"`"，但那样只会错得更远。

**正确做法是不给它写类型注解**：

```ts
const filter = tag ? { tags: tag } : {}
```

`find()` 的入参类型可以直接从调用处推断，显式标注反而引入了一个
必须跟随库版本变动的名字。

> 一般原则：**能用推断就别写注解；只有当推断不出来时才手写。**

### 坑 2 · `ValidatorProps` 是内部类型，import 不到

给 Schema 字段写自定义校验消息时，参数类型不该省略（会触发
`noImplicitAny`），但 `ValidatorProps` 并没有从包根导出。

解法是就地写它的一小部分形状：

```ts
message: (props: { value: unknown }) => `...收到 ${JSON.stringify(props.value)}`
```

TypeScript 是**结构性**类型系统：只要形状兼容就成立。
依赖库的内部类型没导出时，用它的一小部分形状，比自己想办法撬出来更稳妥。

### 坑 3 · `findByIdAndUpdate` 默认不执行 Schema 校验

这是最容易造成"脏数据入库"的坑：

```ts
await this.postModel.findByIdAndUpdate(id, { $set: patch }, {
  new: true,
  runValidators: true,   // ← 不加这一行，超长 title 也能写进去
})
```

`findByIdAndUpdate` 走的是原子更新路径，**默认跳过** Schema 校验。
于是 DTO 校验成了唯一防线，而任何绕过 DTO 的内部调用都是漏洞。

### 坑 4 · `$set` 里的 `undefined` 会清空字段

```ts
{ $set: { title: '新标题', content: undefined } }
```

MongoDB 把 `content: undefined` 理解为"把 content 设成空"，
而不是"不要动 content"。客户端只想改标题时，正文会被静默清空。

所以必须先过滤：

```ts
const patch = Object.fromEntries(
  Object.entries(dto).filter(([, value]) => value !== undefined),
)
```

单测里专门有一个用例守着这个行为。

### 坑 5 · 校验 id 的合法性，而不是让数据库抛 CastError

`isValidObjectId(id)` 为假时，我们主动抛 404。不做这一步的话，
MongoDB 会抛 `CastError`，那是个 **500** ——
把一个客户端的输入问题伪装成了服务端故障，还污染了错误监控。

### 坑 6 · 非法 id 返回 404 而不是 400

因为对调用方来说，"这个 id 对应的资源不存在"是有意义的信息；
而"你的 id 格式不对"暴露的是存储实现细节。
如果非法 id 返回 400、合法但不存在的 id 返回 404，
调用方要处理两种错误，还能反推出我们的 id 生成规则。

---

## 六、自检清单

- [ ] 为什么 Service 里不该出现 `HttpException`？
- [ ] `forFeature` 和 `@InjectModel` 之间是什么关系？跨模块用 Model 要做什么？
- [ ] `.lean()` 省掉了什么？什么场景下不能用它？
- [ ] `{ tags: 1, createdAt: -1 }` 和 `{ createdAt: -1, tags: 1 }` 有什么不同？
- [ ] 为什么不能直接 `res.json(mongooseDocument)`？
- [ ] 为什么 `findByIdAndUpdate` 一定要加 `runValidators: true`？
- [ ] 为什么非法 id 返回 404 而不是 400？

---

## 七、术语表

| 术语 | 一句话解释 |
| --- | --- |
| DTO | 数据传输对象：描述"这个接口接受什么输入" |
| 校验管道 | 请求进入 handler 前自动执行校验与类型转换的机制 |
| Schema | 数据库文档的结构定义与校验规则 |
| 索引 | 让数据库不必扫描全表就能定位数据的有序结构 |
| 复合索引 | 多个字段组成的索引，**字段顺序决定它能不能被用上** |
| 投影 / 映射 | 只挑选需要的字段返回，而不是整体返回 |
| `.lean()` | 让 Mongoose 返回纯对象而不是文档实例 |
| fail fast | 配置有问题就立刻崩，不留到运行期 |
| 纵深防御 | 同一件事在多处校验，防止某一处被绕过 |
| Swagger / OpenAPI | 由代码自动生成的接口文档，可交互调试 |

---

## 下一阶段预告

阶段 4 是整个项目最有"全栈感"的一步：**删掉 mock 数据，让前端真正去调后端**。

你会遇到 CORS、环境变量注入、错误处理这几件事。
其中 CORS 的报错信息是出了名的难懂，提前剧透一句：
**它永远发生在浏览器端，后端日志里什么都不会有。**

去做 [练习 3](/exercises/stage-3) 之前，先把自检清单答一遍。
