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

### 6. 显式映射：为什么不能 `res.json(document)`

`posts.mapper.ts` 做了一件事：把数据库形状逐字段挑选成契约形状。

如果直接返回 Mongoose 文档，会发生三件坏事：

1. `_id`、`__v`、`updatedAt` 这些内部字段会发给前端，
   前端开始依赖它们，你再改结构就得同时改两端；
2. 前端拿到的是 `_id` 而不是 `id`，每个页面都要转换一次；
3. 一旦某个字段是敏感的（比如将来用户的 `passwordHash`），
   它会**自动**泄漏 —— 因为你是"整体返回"而不是"逐字段挑选"。

> **默认不发送，要发就明确写出来。** 这一层是安全性的基础设施。

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
