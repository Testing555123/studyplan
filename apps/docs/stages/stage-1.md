# 阶段 1 · 工程地基与 TypeScript 起步

> 这是整个项目的地基阶段。目标不是"写出功能"，而是**让四层服务各自活起来、彼此能看见**。

---

## 一、本阶段要交付什么

| 交付物 | 具体内容 |
| --- | --- |
| 可运行实现 | monorepo 骨架；共享契约包；Nuxt 首页状态面板；后端 `/api/health` |
| 笔记 | 就是本文（**核心概念那几节请你自己重写一遍**） |
| 规划练习 | [练习 1 · 拆解阶段 2](/exercises/stage-1) |

## 二、验收清单（逐条亲手验证，不接受"应该可以"）

```bash
pnpm install          # ① 无报错
pnpm run build:shared # ② 能看到 packages/shared/dist 里生成 index.js 与 index.d.ts
pnpm dev:api          # ③ 另一个终端里访问 http://localhost:3000/api/health 有 JSON
pnpm dev:web          # ④ 访问 http://localhost:3001 能看到状态面板，且"后端"卡片变绿
pnpm dev:docs         # ⑤ 访问 http://localhost:3002 能看到这本电子书
```

> 第 ④ 步是阶段 1 最关键的验证：**前端能拿到后端的数据**。
> 它意味着 `3001 → 3000 → 3001` 这条链路已经存在，虽然还很简陋。

---

## 三、核心概念（这部分请用你自己的话重写）

### 1. 前后端分离，到底分离了什么

刚学编程时，一个页面是这样来的：PHP / JSP 把 HTML 和数据库查询写在一个文件里，
浏览器请求一次，服务器吐出一整页 HTML。

前后端分离之后，同一次页面访问变成了这样：

```text
浏览器
  │  ① 请求 HTML
  ▼
Nuxt（前端服务器，3001）
  │  ② 请求数据（JSON）
  ▼
NestJS（后端服务器，3000）
  │  ③ 查询
  ▼
MongoDB Atlas
```

**分离的不是"人"，是"职责"**：

| | 前端（Nuxt） | 后端（NestJS） |
| --- | --- | --- |
| 关心 | 用户看到什么、怎么交互 | 数据对不对、谁能改、规则是什么 |
| 输出 | HTML / CSS / JS | JSON |
| 不知道 | 数据存在哪、怎么查 | 按钮长什么样、什么颜色 |

这条边界的**物理体现**就是那个 JSON 接口。凡是"接口里传什么字段"的事，
两边必须商量；凡是"按钮圆角几像素"的事，后端完全不用管。

**所以：前后端分离的第一产物不是页面，是接口契约。**

### 2. monorepo：为什么不用两个仓库

传统做法是前端一个仓库、后端一个仓库。在你这个项目里它会立刻带来一个麻烦：

`Post` 到底有哪些字段？前端要写一份类型，后端也要写一份。
改字段名时你改了后端、忘了前端 —— 直到联调那天才发现，
浏览器里一片 `undefined`。

monorepo 的解法是**把契约放进一个共享包**：

```text
packages/shared/     ← 只放类型 + 常量，不放业务逻辑
   ├── types/post.ts
   ├── types/user.ts
   └── constants/tags.ts

apps/web/   ─── 依赖 shared
apps/api/   ─── 依赖 shared
apps/docs/  ─── 独立的文档站
```

改错一个字段名后，**后端和前端会同时报类型错误**。
问题从"联调时的运行时事故"提前成了"敲代码时的编译错误"。

> 这就是你说的"契约先行"。它不是流程口号，它是**一个目录**。

### 3. pnpm workspace 做了什么

三个包 + 一个共享包，如果各自 `npm install`，会装四份重复依赖，
而且 `apps/web` 根本找不到 `packages/shared`。

pnpm workspace 做两件事：

1. **统一安装**：`pnpm install` 在根目录执行一次，四份 `node_modules` 一起建好；
2. **建立符号链接**：`apps/web/node_modules/@studyplan/shared` 被指向本地 `packages/shared`，
   所以 `import { Post } from '@studyplan/shared'` 就像引入一个普通 npm 包，
   但它读的是**你正在改的源码**。

`pnpm-workspace.yaml` 里那两行 `packages:` 就是在声明"哪些目录算我的子包"。

---

## 四、TypeScript 最小语法集（零基础起步）

你选择了 TypeScript 为主语言。好消息是：**你不需要学完 TS 才能开工**。
下面这些就是阶段 1 真正用到的全部语法，全都能在项目里找到对应代码。

### 1. 类型注解：给变量贴标签

```ts
// packages/shared/src/constants/tags.ts
export const MAX_TAGS_PER_POST = 5
```

这里没有写 `: number`，因为 TS 会**自动推断**。只有当推断不出来、
或者你想固定住类型时才需要手写：

```ts
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN')
}
```

`iso: string` 是入参类型，`): string` 是返回值类型。
写注解的价值不在于"让编译器满意"，而在于**下一个读代码的人（包括三个月后的你）
不用猜这个函数吃什么、吐什么**。

### 2. `interface`：描述一个对象的形状

```ts
// packages/shared/src/types/post.ts
export interface PostAuthor {
  id: string
  username: string
}
```

读作："一个 `PostAuthor` 必须有 `id` 和 `username`，两个都是字符串。"

注意它**没有** `=`、没有 `new`、也不会出现在编译后的 JS 里 ——
`interface` 是纯粹的"描述"，运行时不存在。这就是它零成本的原因。

### 3. 可选属性 `?`：允许"没有"

```ts
export interface Post {
  title: string
  summary?: string   // ← 可能没有摘要
}
```

`summary?: string` 的真实含义是 `string | undefined`。

**为什么这里必须可选？** 因为摘要由 AI 生成，而 AI 调用可能超时或失败。
如果写成必填，那么在 AI 失败时你就得编一个假摘要来骗过类型系统 ——
类型系统是用来暴露问题的，不是用来被绕过的。

> 一个规律：**凡是"可能失败所以可能没有"的字段，就必须是可选**，
> 并且调用方必须处理它不存在的情况。前端 `index.vue` 里那些
> `service.detail` 的三元判断，就是这个约定的产物。

### 4. 联合类型 `|`：取值只能是几个之一

```ts
// packages/shared/src/types/api.ts
export interface HealthStatus {
  status: 'ok' | 'degraded'
  database: 'connected' | 'disconnected'
}
```

`'ok' | 'degraded'` 读作"只能是这两个字符串之一"。
写成这样之后，你打错成 `'degraded '`（多个空格）会立刻报错，
而写成 `string` 就不会。

### 5. `as const` + `typeof`：从值推导出类型

这是本项目里最值得学的一段：

```ts
// packages/shared/src/constants/tags.ts
export const POST_TAGS = ['JavaScript', 'TypeScript', 'Vue', 'Nuxt'] as const

export type PostTag = (typeof POST_TAGS)[number]
```

逐句拆：

- `POST_TAGS` 本来会被推断成 `string[]`（一个任意字符串数组，丢了信息）；
- `as const` 把它固定成**只读元组**，每个元素的类型是那个**具体字面量**；
- `typeof POST_TAGS` 取出这个变量的类型；
- `[number]` 表示"用数字去索引它"，得到所有元素的联合：
  `'JavaScript' | 'TypeScript' | 'Vue' | 'Nuxt'`。

**收益**：以后往 `POST_TAGS` 里加一个标签，`PostTag` 类型**自动变宽**，
所有用到它的地方立刻认得新标签。你只改了一行，而类型定义自己跟上了。

### 6. 类型守卫：把 `string` 收窄成 `PostTag`

```ts
export function isPostTag(value: string): value is PostTag {
  return (POST_TAGS as readonly string[]).includes(value)
}
```

返回类型 `value is PostTag` 是一个**类型断言（守卫）**。
它告诉编译器："这个函数返回 true 时，你传入的那个值就是 `PostTag`。"

于是用起来是这样：

```ts
if (isPostTag(input)) {
  // 这个分支里，input 的类型已经是 PostTag 了，不是 string
}
```

### 7. `import type`：只引类型，不引代码

```ts
import type { HealthStatus } from '@studyplan/shared'
```

加了 `type` 之后，这行 import 在编译产物里**会被完全删掉**。
好处是：它绝不会因为"模块副作用"而把后端代码打进前端包。

**规则**：只用来标注类型时，一律加 `type`。

### 8. 泛型初识：`Record<K, V>` 与 `Promise<T>`

你现在会看到这两种写法：

```ts
Record<string, unknown>   // 一个对象，键是字符串，值类型未知
Promise<void>             // 一个 Promise，完成后不产出任何值
```

`Record<K, V>` 里的 `K`、`V` 是**占位符**，用的时候才填。
泛型本质是"类型层面的函数"：给进去一个类型，还回来一个新类型。
阶段 3 你会写出自己的泛型（比如分页响应的统一包装），到时再深入。

### 9. `strict` 与 `null` / `undefined`

我们的 `tsconfig` 开了 `strict: true`。它带来的最大日常影响是：

```ts
// ❌ 报错：config.get('PORT') 可能是 undefined
const port = config.get<number>('PORT')

// ✅ 明确给了兜底
const port = config.get<number>('PORT') ?? 3000
```

一开始你会觉得它很烦。但请记住：**它拦下的不是"错误"，而是"你没想到这种情况"**。
线上崩掉的服务，绝大多数都崩在这里。

---

## 五、`tsconfig` 里那几个关键开关

打开 `apps/api/tsconfig.json`，只有这几个字段值得你记住：

| 字段 | 作用 | 为什么这么设 |
| --- | --- | --- |
| `experimentalDecorators` | 允许 `@Module()` 这类装饰器语法 | NestJS 的全部代码都建立在装饰器上 |
| `emitDecoratorMetadata` | 把参数的类型信息写进编译产物 | 依赖注入靠它才能在运行时"看见"你声明的类型 |
| `strict` | 打开全部严格检查 | 零基础阶段更需要它兜底 |
| `strictPropertyInitialization: false` | 允许类属性不初始化 | Mongoose 的 `@Prop()` 属性由框架赋值，TS 无法证明 |
| `module: commonjs` | 输出 CommonJS | NestJS 11 运行在 CJS 上 |

`packages/shared/tsconfig.json` 里有一个**最容易被忽略的坑**：

```jsonc
"module": "CommonJS"
```

如果这里改成 `ESM`，后端 `require('@studyplan/shared')` 会直接失败。
共享包的模块格式必须迁就**最保守的那个消费者**（这里是 NestJS），
而不是最新潮的那个。

---

## 六、架构图

```text
                     ┌──────────────────────────────────────┐
                     │   packages/shared  （共享契约）       │
                     │   types/  constants/                 │
                     │   只有类型 + 常量，没有业务逻辑        │
                     └───────┬──────────────────┬───────────┘
                             │ 依赖              │ 依赖
                             ▼                  ▼
   ┌─────────────────────────────┐   ┌─────────────────────────────┐
   │  apps/web · Nuxt 4 · :3001  │   │  apps/api · NestJS 11 · :3000│
   │  app/pages/   页面           │   │  src/main.ts      全局装配   │
   │  app/components/ 组件        │   │  src/app.module   模块组装   │
   │  app/assets/css/main.css     │   │  modules/health/  健康检查   │
   │      设计令牌 + 组件类        │   │  src/config/      环境校验   │
   └──────────┬──────────────────┘   └──────────┬──────────────────┘
              │                                  │
              │  HTTP GET /api/health  (JSON)    │
              └──────────────────────────────────┘
                                                 │ Mongoose（阶段 3）
                                                 ▼
                                       ┌────────────────────┐
                                       │  MongoDB Atlas M0   │
                                       └────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │  apps/docs · VitePress · :3002                           │
   │  你正在读的这本书。与运行时代码完全解耦，只依赖 Markdown。 │
   └──────────────────────────────────────────────────────────┘
```

---

## 七、代码走读：四个必须看懂的文件

### 1. `packages/shared/src/constants/tags.ts`

看两件事：`as const` 如何把数组变成"字面量元组"；
以及 `MAX_TAGS_PER_POST` 这类常量**为什么必须共享** ——
它是前端字数提示与后端校验规则的唯一来源。不共享，两边就一定会不一致。

### 2. `apps/api/src/config/env.validation.ts`

这是全仓最"工程味"的文件。核心思路是：

```text
环境变量（都是字符串或 undefined）
   → 用 class-validator 校验并转型
   → 合法才允许应用启动，否则直接抛错退出
```

**为什么要 fail fast？** 因为"端口号是 NaN"这种问题，
如果不在启动时暴露，就会在某个半夜的用户请求里暴露。

### 3. `apps/api/src/app.module.ts`

`@Module()` 的 `imports / controllers / providers` 三个字段，
就是 NestJS 的组装说明书。请重点体会：**这里没有任何 `new`**。
对象由容器创建并注入，你只负责声明"我需要什么"。

### 4. `apps/web/app/pages/index.vue`

它用 `$fetch<HealthStatus>` 调用后端。
`<HealthStatus>` 是泛型参数 —— 你告诉 `$fetch` "返回的 JSON 是这个形状"，
于是 `health.value.uptimeSeconds` 有类型提示，写错字段名会报错。

**这就是契约在干活的样子**：类型来自 `packages/shared`，
前端拿到的字段名和后端返回的字段名由同一个文件保证一致。

---

## 八、踩坑记录（本阶段真实发生过的坑）

这些都是**实际踩到并已修复**的问题，不是假想：

### 坑 1 · pnpm 11 的构建脚本白名单键名变了

现象：`pnpm install` 结束后出现 `ERR_PNPM_IGNORED_BUILDS`，
esbuild / @parcel/watcher / unrs-resolver 的 postinstall 全被跳过。

原因：pnpm 出于供应链安全**默认禁止依赖执行 postinstall**。
我一开始写的是 `onlyBuiltDependencies`，但 pnpm 11 识别的键是
**`allowBuilds`（一个映射）**，于是白名单根本没生效，
pnpm 还顺手往 `pnpm-workspace.yaml` 里写了一串
`'esbuild': set this to true or false` 的占位提示。

正确写法：

```yaml
allowBuilds:
  esbuild: true
  unrs-resolver: true
  '@parcel/watcher': true
  vue-demi: true
  '@scarf/scarf': false   # 只做匿名统计，明确拒绝
```

> 教训：**配置键名要去看该版本自己的输出提示**，不要凭记忆写。

### 坑 2 · Vue 的 `<style scoped>` 里用不了 `@apply`

现象：`nuxt build` 报
`Cannot apply unknown utility class 'gap-1.5'`。
离谱之处在于 `gap-1.5` 是 Tailwind 的核心工具类，不可能不存在。

原因：Tailwind CSS 4 的 `@apply` 必须运行在**能看到 `@theme` 与
`@import "tailwindcss"` 的上下文**里。而 Vue 单文件组件的 `<style scoped>`
是独立编译单元，看不到 `main.css`。

两种解法：

```css
/* 解法 A：在组件 style 顶部显式建立引用 */
@reference "../assets/css/main.css";
```

```css
/* 解法 B（本项目采用）：把这类样式收进全局 @layer components */
```

**为什么选 B**：同一套导航样式会在页头、页脚、筛选条复用，
放全局只写一次，也省得每个组件都重复写 `@reference`。

### 坑 3 · lucide 图标没 import，页面静默少一块

`lucide-vue-next` 的图标是普通 Vue 组件，**不在 Nuxt 自动导入范围内**。
漏写 import 不会报错，只会那个位置什么都不显示。

> 教训：Nuxt 的自动导入只覆盖 `app/components`、`app/composables` 等约定目录，
> **第三方库一律要显式 import**。这类"静默失败"最耗时间。

### 坑 4 · VitePress 把本地开发地址当成死链

现象：`vitepress build` 失败，报 `4 dead link(s) found`，
指向的是 `http://localhost:3000/api` 这种地址。

原因：VitePress 默认对所有链接做死链检查，
而本地地址在构建时**当然**不可达。

解决：在 `.vitepress/config.ts` 里 `ignoreDeadLinks: true`。

### 坑 5 · NestJS 生态包的主版本号不统一

查版本时发现：`@nestjs/core` 已经到 12，但 `@nestjs/config` **没有 11**，
最新是 12；而 `@nestjs/jwt` 是 11.0.2。

原因：并非所有官方包都严格跟随主框架版本。
如果按"@nestjs/core 是 11，那所有 @nestjs/* 都写 ^11"来配，安装会直接失败。

`@nestjs/config@4.0.4` 的 peer 是 `@nestjs/common: ^10 || ^11` ——
**看 peer 依赖，而不是看版本号像不像**，才是正确做法。

---

## 九、自检清单

不看代码，凭记忆回答：

- [ ] 前后端分离后，两边唯一需要"商量"的东西是什么？
- [ ] 为什么 `summary` 必须写成可选属性？
- [ ] `packages/shared/tsconfig.json` 里为什么必须是 `CommonJS`？
- [ ] `allowBuilds` 是在解决什么安全问题？
- [ ] 为什么 `@apply` 不能写在 `<style scoped>` 里？

能全部答上来，再进入阶段 2。

---

## 十、术语表

| 术语 | 一句话解释 |
| --- | --- |
| monorepo | 一个仓库放多个包，共用依赖与工具链 |
| workspace | pnpm 用来识别"哪些目录是我的子包"的机制 |
| 契约（contract） | 前后端约定的接口字段定义，本项目放在 `packages/shared` |
| 类型推断 | TS 自动从代码推出类型，不用手写 |
| 字面量类型 | 类型是具体的值，如 `'ok'` |
| 类型守卫 | 一个返回 `x is T` 的函数，用来收窄类型 |
| fail fast | 配置有问题就立刻崩，不留到运行期 |
| 依赖注入 | 不自己 `new` 对象，声明需要什么由容器给 |
| CJS / ESM | JavaScript 两套模块规范，本项目后端与共享包用 CJS |
| 构建脚本 | 依赖安装后自动执行的 `postinstall`，也是供应链攻击的常见入口 |

---

## 下一阶段预告

阶段 2 会用**假数据**把四个页面全部做出来：列表、详情、发帖、登录注册。
你会发现一个反直觉的事实：**在不知道后端长什么样的情况下，
前端反而能更快做完** —— 因为契约已经把"后端长什么样"这件事固定住了。

去做 [练习 1](/exercises/stage-1) 之前，先别往下看。
