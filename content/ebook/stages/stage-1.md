# 阶段 1 · 工程地基与 TypeScript 起步

> 这是整个项目的地基阶段。目标不是"写出功能"，而是**让四层服务各自活起来、彼此能看见**。

---

## 一、本阶段要交付什么

| 交付物 | 具体内容 |
| --- | --- |
| 可运行实现 | monorepo 骨架；共享契约包；Nuxt 首页状态面板；后端 `/api/health` |
| 笔记 | 就是本文。核心概念每节都附了「实现方法 / 原理 / 与相关技术栈的关系 / 面试常见问题与解题思路」四件套，建议先合上书自己讲一遍，再对照 |
| 规划练习 | [练习 1 · 拆解阶段 2](/ebook/exercises/stage-1) |

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

## 三、核心概念

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

#### 实现方法

本项目把"分离"落到实处的方式是：前端 Nuxt 跑在 3001，后端 NestJS 跑在 3000，两边通过 `/api/health` 这类 JSON 接口通信。接口字段只在一处定义，放在 `packages/shared` 的 `types/` 下，前后端都 import 同一个文件，改错字段名会两边一起报类型错误。

#### 原理

分离的本质是职责边界，不是物理上的人或机器：前端只关心渲染和交互，后端只关心数据的正确性与业务规则。这条边界能在运行时成立，是因为双方遵守同一份契约（字段名、类型、状态码）。任何一方改了契约而不通知另一方，都会在编译期或联调期立刻暴露，而不是等到线上才崩。

#### 与相关技术栈的关系

传统 PHP/JSP 把数据库查询和 HTML 混在一个文件里，属于服务端渲染加模板，没有清晰边界。本项目的 Nuxt 加 NestJS 是前端框架加后端框架的分离模式，更接近 BFF（Backend For Frontend）的思路。再往前一步是 SSR（Nuxt 在服务器先画好首屏 HTML 再下发），再往后是微服务（多个后端按领域拆分，前端经网关聚合）。和 GraphQL 相比，REST 用固定 URL 加 HTTP 动词描述资源，契约更扁平、调试更直观。

#### 面试常见问题与解题思路

**Q1：说说你对前后端分离的理解，它解决了什么问题？**
怎么想：不要从"两个团队"切入，要从"职责"切入。怎么答：分离把 UI 渲染和数据处理解耦，让两端能独立开发、独立部署，关键产物是接口契约。追问：前后端语言或框架不同时，怎么保证契约一致？（引出契约文件、OpenAPI、类型共享）

**Q2：前后端分离之后首屏白屏、SEO 变差，怎么解决？**
怎么想：分离常伴随 CSR（客户端渲染），下发的 HTML 里没有内容。怎么答：用 SSR 或预渲染，在服务器端先取数据、拼出首屏 HTML，Nuxt 的 SSR 就是这个思路。追问：SSR 下接口请求发生在哪一端？客户端 hydration（水合）是什么意思？

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

#### 实现方法

本项目用 pnpm workspace 把 `packages/shared` 提成独立包，只放类型与常量，不放业务逻辑。前端 `apps/web` 和后端 `apps/api` 都 `import { Post } from '@studyplan/shared'`，子包范围由 `pnpm-workspace.yaml` 里的 `packages:` 声明。改 `Post` 字段时，两处引用同时报错。

#### 原理

monorepo 把多个包放在一个仓库、共用一份依赖与工具链，包与包之间用符号链接互相引用。因为前后端读的是同一份 `packages/shared` 源码，字段定义只有一份，所以"类型不一致"从联调时的运行期崩溃，被提前成了编译期的报错。

#### 与相关技术栈的关系

多仓库（multi-repo）让前后端各自独立，但契约要手写两份，最容易在改字段名时失同步。monorepo 用共享包解决同步，代价是仓库变大、CI 要能处理多包。比它更进一步的是单体应用（所有代码一个包，没有跨包边界），以及 Nx、Turborepo 这类在 monorepo 之上加任务编排和缓存的工具。Lerna 是更早的 monorepo 方案，如今多被 pnpm workspace 加 Turborepo 取代。

#### 面试常见问题与解题思路

**Q1：monorepo 和多仓库有什么区别？什么场景该用哪个？**
怎么想：从"契约同步"和"协作成本"两个角度。怎么答：多仓库边界清晰但容易字段失同步；monorepo 共享类型、统一工具链，适合一个产品前后端紧密协作。追问：monorepo 仓库变大会带来什么工程问题？怎么缓解？（引出按包构建、缓存、代码所有权）

**Q2：为什么本项目把契约放进一个共享包，而不是各写一份？**
怎么想：从"单一事实来源"切入。怎么答：类型只有一份，改错字段名前后端一起报错，把联调事故提前到编译期。追问：如果前后端用不同语言实现，共享包这种方式还有效吗？

### 3. pnpm workspace 做了什么

三个包 + 一个共享包，如果各自 `npm install`，会装四份重复依赖，
而且 `apps/web` 根本找不到 `packages/shared`。

pnpm workspace 做两件事：

1. **统一安装**：`pnpm install` 在根目录执行一次，四份 `node_modules` 一起建好；
2. **建立符号链接**：`apps/web/node_modules/@studyplan/shared` 被指向本地 `packages/shared`，
   所以 `import { Post } from '@studyplan/shared'` 就像引入一个普通 npm 包，
   但它读的是**你正在改的源码**。

`pnpm-workspace.yaml` 里那两行 `packages:` 就是在声明"哪些目录算我的子包"。

#### 实现方法

根目录执行一次 `pnpm install`，pnpm 会为 workspace 里每个包建立 `node_modules`，并把 `apps/web/node_modules/@studyplan/shared` 符号链接到本地 `packages/shared`。子包范围由 `pnpm-workspace.yaml` 的 `packages:` 字段声明。

#### 原理

pnpm 用软链接把子包连到本地源码，所以 `import` 一个本地包时，读的是你正在改的源码，而不是从 npm 下载的副本。改一处，所有引用方立刻看到变化。pnpm 的严格依赖解析还保证每个包只能访问自己声明过的依赖，不会出现幽灵依赖。

#### 与相关技术栈的关系

yarn workspace 和 npm workspace 也提供类似能力，但 pnpm 用内容寻址存储加符号链接，磁盘占用更小、依赖隔离更严格。npm 的 `workspaces` 配置简单却会把依赖扁平化；pnpm 的 `node_modules` 是嵌套链接，更贴近规范。对比单仓库单包（没有 workspace 概念），workspace 让你既能拆包又能共享依赖。

#### 面试常见问题与解题思路

**Q1：pnpm 的 node_modules 为什么和 npm 不一样？**
怎么想：从"依赖隔离"和"磁盘占用"切入。怎么答：pnpm 用全局 store 加符号链接，每个包只暴露自己声明过的依赖，避免幽灵依赖，也省磁盘。追问：什么是幽灵依赖？它为什么是隐患？

**Q2：workspace 解决了什么问题？**
怎么想：从"多包共享依赖与实时引用"切入。怎么答：一次安装、跨包实时引用、统一版本。追问：子包之间出现循环依赖怎么办？

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

#### 实现方法

本项目里类型注解出现在所有函数签名和接口上：`formatDate(iso: string): string` 给入参和返回值都标了类型；常量如 `MAX_TAGS_PER_POST = 5` 则靠 TS 自动推断，不手写。能在声明处写清类型时尽量写，推断不出来的再补。

#### 原理

类型注解只在编译期做检查，编译成 JS 后会被完全擦除，不影响运行。它的作用不是让编译器"满意"，而是把"这个函数吃什么、吐什么"写死在签名上，让调用方和三个月后的你不用去猜。

#### 与相关技术栈的关系

相比 Python 的 type hints（主要靠 mypy 在外部检查）、Go 的类型即语法，TS 的类型是"可选擦除"的：你写多少都行，运行时都没了。和 JSDoc 注释类型相比，注解是语言级的，编辑器能直接跳转和补全。

#### 面试常见问题与解题思路

**Q1：TypeScript 的类型在运行时存在吗？**
怎么想：从"编译擦除"切入。怎么答：类型只在编译期检查，产物是纯 JS，类型信息被移除。追问：那运行时怎么校验数据？引出运行时校验（class-validator、zod）。

**Q2：什么时候该写类型注解，什么时候靠推断？**
怎么想：从"可读性"和"边界"切入。怎么答：函数对外接口、对象形状、拿不准的地方写；局部变量、明显字面量靠推断。追问：为什么过度注解反而碍事？

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

#### 实现方法

本项目用 `interface` 描述对象形状，例如 `packages/shared/src/types/post.ts` 里的 `PostAuthor`：`{ id: string; username: string }`。前端和后端都引用同一份接口定义。

#### 原理

`interface` 是纯描述，没有 `=`、没有 `new`，编译后不会出现在 JS 里，所以零运行时成本。它只在编译期为对象形状提供约束和补全。

#### 与相关技术栈的关系

`interface` 和 `type` 大部分场景可互换：`interface` 更适合声明对象或类的形状，且可被声明合并（declaration merging）；`type` 能表达联合、交叉、元组和更复杂的类型运算。和 Java、C# 的 interface 不同，TS 的 interface 没有运行时实现，纯粹是编译期契约。

#### 面试常见问题与解题思路

**Q1：interface 和 type 有什么区别？**
怎么想：从"合并能力"和"表达能力"切入。怎么答：interface 可被声明合并、更适合对象形状；type 能做联合、交叉、映射类型。追问：什么时候必须用 type 而不是 interface？

**Q2：interface 在编译后变成什么？**
怎么想：从"擦除"切入。怎么答：什么都不剩，运行时不存在。追问：那靠 interface 做的校验为什么不能防运行时错误？（引出运行时校验的必要性）

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

#### 实现方法

本项目里 `summary?: string` 把摘要标成可选，因为摘要由 AI 生成、可能失败。前端 `index.vue` 用 `service.detail` 的三元判断来处理它不存在的情况。

#### 原理

`summary?: string` 的真实类型是 `string | undefined`。可选属性表达"可能没有"而不是"一定没有"。凡是可能失败所以可能没有的字段，就该标可选，并让调用方处理缺失。

#### 与相关技术栈的关系

和必填字段相比，可选属性把"缺失"从运行时的 `undefined` 崩溃，提前成了编译期必须处理的提醒。和 `null` 不同，`undefined` 表示"未赋值"，`null` 常表示"主动置空"。和 Python 的 `Optional[T]`（即 `T | None`）语义接近，但 TS 用 `?` 语法更简洁。

#### 面试常见问题与解题思路

**Q1：可选属性和 `| undefined` 有什么关系？**
怎么想：直接说本质。怎么答：`x?: T` 等价于 `x: T | undefined`。追问：那 `x: T | undefined` 和 `x?: T` 有区别吗？（严格下几乎一致，但可选属性在对象字面量里可不传）

**Q2：为什么摘要字段必须可选而不是给个默认值？**
怎么想：从"失败语义"切入。怎么答：可选暴露"可能缺失"，强迫调用方处理；默认值会掩盖失败，且字段本就可能真的没有。追问：如果后端永远返回摘要，前端还有必要判空吗？

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

#### 实现方法

本项目用联合类型约束取值集合，例如 `packages/shared/src/types/api.ts` 里 `HealthStatus.status: 'ok' | 'degraded'`、`database: 'connected' | 'disconnected'`。在比较或 switch 里用错值，TS 会直接标红。

#### 原理

联合类型是"几个类型择一"，编译器会做类型收窄（narrowing）：一旦用 `if (status === 'ok')` 判断过，那个分支里 `status` 就被收窄成 `'ok'`。这把"非法取值"从运行期错误提前成了编译期报错。

#### 与相关技术栈的关系

和 `enum` 相比，字面量联合更轻、零运行时开销，也更贴合"只是一组字符串"的语义；`enum` 会编译出真实对象、还能反向映射，但容易膨胀。和 Java、Rust 的 `enum`（Rust 还能带数据的代数类型）相比，TS 联合只是类型层的并集，没有运行时判别。配合 `as const` 还能从值反推出联合类型。

#### 面试常见问题与解题思路

**Q1：联合类型和枚举怎么选？**
怎么想：从"运行时是否需要对象"切入。怎么答：只想约束取值集合、无需反向映射时用字面量联合，零开销；需要枚举对象或方法时用 enum。追问：TS 的 enum 有什么坑？（编译出对象、可被数字反向映射、tree-shaking 差）

**Q2：什么是类型收窄（narrowing）？**
怎么想：从"分支内类型变化"切入。怎么答：TS 在类型守卫（`typeof`、`===`、`in` 等）之后会把联合收窄到具体成员。追问：哪些语法能触发收窄？自定义类型守卫（`x is T`）算吗？

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

#### 实现方法

本项目在 `packages/shared/src/constants/tags.ts` 写 `export const POST_TAGS = [...] as const`，再 `export type PostTag = (typeof POST_TAGS)[number]`，让标签数组和标签类型同源。新增标签只改一处，类型自动变宽。

#### 原理

`as const` 把数组固定成只读元组，每个元素的类型变成具体字面量而不是笼统的 `string`；`typeof` 取出这个变量的类型，`[number]` 用数字索引得到所有元素的联合。类型系统从"值"反推出"类型"，值和类型不再各写一遍。

#### 与相关技术栈的关系

和运行时 `Object.keys`/`values` 枚举相比，`as const + typeof` 全程在类型层完成，零运行时成本。和直接手写 `type PostTag = 'JavaScript' | 'TypeScript' ...` 相比，它让"值"成为唯一事实来源，避免值和类型两处漂移。zod 这类 schema 库也有"从 schema 推导类型"的同构思想。

#### 面试常见问题与解题思路

**Q1：`as const` 改变了什么？**
怎么想：从"字面量类型"切入。怎么答：它让变量变为只读，且每个元素保留具体字面量类型，而不是被拓宽成 `string`。追问：不加 `as const` 时 `'a'` 会被推断成什么？为什么拓宽是个问题？

**Q2：怎么让一个数组既是值又导出它的类型？**
怎么想：从"同源"切入。怎么答：`as const` 固定数组，再用 `typeof` 加 `[number]` 索引得到联合类型。追问：如果是对象，怎么做同样的推导？

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

#### 实现方法

本项目在 `packages/shared` 里写 `isPostTag(value: string): value is PostTag`，用 `POST_TAGS.includes` 判断。调用处 `if (isPostTag(input))` 之后，`input` 在该分支内就收窄为 `PostTag`。

#### 原理

返回类型写成 `value is PostTag` 是一个类型谓词（type predicate）。它向编译器承诺：函数返回 true 时，参数就是该类型。于是 TS 在 true 分支里收窄变量类型，false 分支里继续当普通 `string` 处理。

#### 与相关技术栈的关系

和简单的 `value instanceof T` 或 `typeof` 判断相比，自定义类型守卫能表达任意运行时检查（比如"这个值在白名单里"），而且携带类型信息。和类型断言 `as` 相比，守卫是带校验的收窄，断言则是无条件相信、容易埋错。Java 的 `instanceof` 思路类似，但守卫能跨类型体系工作。

#### 面试常见问题与解题思路

**Q1：类型守卫和普通返回 boolean 的函数有什么区别？**
怎么想：从"类型信息"切入。怎么答：守卫的返回类型是 `x is T`，能在调用处触发收窄；普通 boolean 函数不会。追问：什么场景必须用守卫而不是 `as` 断言？

**Q2：`as` 断言有哪些风险？**
怎么想：从"绕过检查"切入。怎么答：`as` 让编译器无条件接受，类型其实不对时运行时才会暴露，且不会收窄。追问：什么情况下 `as` 是安全的（比如先经过守卫或 `instanceof`）？

### 7. `import type`：只引类型，不引代码

```ts
import type { HealthStatus } from '@studyplan/shared'
```

加了 `type` 之后，这行 import 在编译产物里**会被完全删掉**。
好处是：它绝不会因为"模块副作用"而把后端代码打进前端包。

**规则**：只用来标注类型时，一律加 `type`。

#### 实现方法

本项目跨包引用类型时写 `import type { HealthStatus } from '@studyplan/shared'`，只引类型不引运行时代码。涉及值（如函数、常量）时才用普通 import。

#### 原理

加 `type` 后，这行 import 在编译产物里被完全删掉，不占运行时代码、不触发模块副作用。它明确告诉打包器：这里只要类型信息。

#### 与相关技术栈的关系

和循环依赖问题相关：只引类型的 import 被擦除后，不会参与模块执行顺序，能规避"模块 A 引 B、B 又引 A"造成的值级循环依赖。和普通的 `import { Type }` 相比，`import type` 语义更清晰，也帮打包器做 tree-shaking。在 `isolatedModules` 开启时，只含类型的重导出必须用 `export type`。

#### 面试常见问题与解题思路

**Q1：`import type` 和普通 import 有什么不同？**
怎么想：从"编译擦除"切入。怎么答：`import type` 只在类型层存在，编译后被删，不引入运行时代码。追问：什么时候必须用 `import type`？（isolatedModules 下只含类型的导入或导出）

**Q2：它能解决循环依赖吗？**
怎么想：从"执行顺序"切入。怎么答：被擦除的类型 import 不参与模块执行，因此不会造成值级循环依赖。追问：值级循环依赖还能怎么解？

### 8. 泛型初识：`Record<K, V>` 与 `Promise<T>`

你现在会看到这两种写法：

```ts
Record<string, unknown>   // 一个对象，键是字符串，值类型未知
Promise<void>             // 一个 Promise，完成后不产出任何值
```

`Record<K, V>` 里的 `K`、`V` 是**占位符**，用的时候才填。
泛型本质是"类型层面的函数"：给进去一个类型，还回来一个新类型。
阶段 3 你会写出自己的泛型（比如分页响应的统一包装），到时再深入。

#### 实现方法

本项目里泛型出现在 `$fetch<HealthStatus>`、`Record<string, unknown>`、`Promise<void>` 等写法。`$fetch<HealthStatus>` 告诉调用方返回 JSON 的形状；`Record<string, unknown>` 描述"键是字符串、值任意"的对象。

#### 原理

泛型是"类型层面的函数"：给进去一个类型参数，得到一个新的具体类型。比如 `Promise<T>` 用 `T` 表示异步结果类型，`Record<K, V>` 用 `K`、`V` 描述键和值。编译器在实例化时把占位符替换成实参，从而在不牺牲类型的情况下复用逻辑。

#### 与相关技术栈的关系

和 Java、C# 的泛型一样，TS 泛型提供参数化类型，但 TS 的类型擦除意味着泛型只在编译期，运行时没有 `T`。和 `any` 相比，泛型保留具体类型、不丢失信息；和函数重载相比，泛型更通用、写法更短。阶段 3 会自己写泛型，比如把分页响应 `{ data: T[]; total: number }` 统一包装。

#### 面试常见问题与解题思路

**Q1：泛型解决了什么问题？**
怎么想：从"复用加保型"切入。怎么答：让同一段逻辑适配多种类型而不退化成 `any`，既复用又保留类型检查。追问：泛型约束（`T extends ...`）有什么用？

**Q2：`any`、`unknown`、泛型分别适合什么场景？**
怎么想：从"类型信息保留程度"切入。怎么答：能确定类型用具体类型；不确定但想保留时用泛型；完全不想检查或作兜底用 `unknown` 再收窄；`any` 基本应避免。追问：为什么 `any` 危险？

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

#### 实现方法

本项目的 `tsconfig` 开 `strict: true`。受影响最大的是取值可能为空的地方：`config.get<number>('PORT')` 可能返回 `undefined`，必须用 `?? 3000` 给兜底，否则编译不过。

#### 原理

`strict` 是一组严格检查的总开关，包含 `strictNullChecks`（区分 `null`/`undefined` 与具体类型）、`noImplicitAny`、`strictPropertyInitialization` 等。它把"你没想到的情况"在编译期拦下来，而不是等运行时崩溃。

#### 与相关技术栈的关系

和 `any` 泛滥的代码相比，`strict` 强迫你显式处理空值，提升健壮性，代价是初期要写更多兜底。和 Flow（Meta 的类型系统）相比，TS 的 `strict` 更主流。注意本项目把 `strictPropertyInitialization` 关掉了：因为 Mongoose 的 `@Prop()` 属性由框架赋值，TS 无法证明它已初始化。

#### 面试常见问题与解题思路

**Q1：strict 模式都包含哪些检查？**
怎么想：从"一组开关"切入。怎么答：核心是 `strictNullChecks`、`noImplicitAny`、`strictPropertyInitialization` 等的总开关。追问：`strictNullChecks` 关掉后会发生什么？（`null`/`undefined` 可赋给任意类型，空值 bug 更隐蔽）

**Q2：为什么有的属性初始化检查要关掉？**
怎么想：从"框架赋值的属性"切入。怎么答：像 ORM、DI 容器这类由框架在运行时赋值的属性，TS 静态分析证明不了，只能关掉该检查或用 `!` 断言。追问：`!` 非空断言的风险？

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

去做 [练习 1](/ebook/exercises/stage-1) 之前，先别往下看。
