# 阶段 2 · 前端原型（mock 数据）

> 反直觉的一点：**在后端还不存在的时候，前端反而能更快做完。**
> 因为契约已经把"后端长什么样"固定住了，剩下的事与后端无关。

---

## 一、本阶段交付什么

| 交付物 | 具体内容 |
| --- | --- |
| 可运行实现 | 首页帖子流、帖子详情、发帖页、登录注册页，四个页面全部可点通 |
| 数据来源 | `app/mock/posts.ts`（12 篇真实感文章，类型来自 `packages/shared`） |
| 笔记 | 就是本文 |
| 规划练习 | [练习 2 · 拆解阶段 3](/exercises/stage-2) |

## 二、验收清单

```bash
pnpm dev:web     # 只需启动前端，不需要后端
```

- [ ] `http://localhost:3001` 能看到 12 张帖子卡片
- [ ] 点标签能筛选，地址栏会变成 `/?tag=Vue`
- [ ] 浏览器后退能回到"全部"（因为筛选条件在 URL 里）
- [ ] 点卡片能进详情，正文的 Markdown 已渲染（代码块、引用块排版正常）
- [ ] 详情页能看到「AI 摘要」区块；**有一篇没有摘要**，那一篇整块隐藏
- [ ] 点赞按钮能点，数字会变，动画有反馈
- [ ] 能发表评论，评论立刻出现在列表里
- [ ] 发帖页左右分栏，**左侧输入右侧实时变化**
- [ ] 发帖页标签最多选 5 个，选第 6 个会被拦下
- [ ] 登录/注册页两个页签能切换

---

## 三、核心概念

### 1. 文件路由：路径即文件名

```text
app/pages/index.vue            →  /
app/pages/login.vue            →  /login
app/pages/posts/new.vue        →  /posts/new
app/pages/posts/[id].vue       →  /posts/任意值
```

`[id]` 这种方括号是**动态段**。访问 `/posts/p-1001` 时，
`useRoute().params.id` 就是 `'p-1001'`。

> 注意 `posts/new.vue` 与 `posts/[id].vue` 的关系：
> Nuxt 会优先匹配**静态**路由，所以 `/posts/new` 进的是 `new.vue`，
> 不会被 `[id]` 吃掉。这个优先级规则一定要记住。

#### 实现方法

本项目用 Nuxt 的文件路由：`app/pages/index.vue` 对应 `/`，`login.vue` 对应 `/login`，`posts/new.vue` 对应 `/posts/new`，`posts/[id].vue` 里的 `[id]` 是动态段，访问 `/posts/p-1001` 时 `useRoute().params.id` 为 `'p-1001'`。新页面只需新建文件，不用改路由表。

#### 原理

路由表由文件系统生成，框架在构建期扫描 `pages/` 目录、把路径编译成路由配置。静态段优先于动态段，所以 `/posts/new` 命中 `new.vue` 而不是被 `[id]` 吞掉。这样 URL 结构和文件结构一一对应，不容易写错路由。

#### 与相关技术栈的关系

和传统 Vue 项目手写 vue-router 配置相比，文件路由省掉了路由表维护，但牺牲了一点灵活性（复杂嵌套要遵循约定）。React 生态的 Next.js 也有同样的文件路由思路（app router），思想一致。Nuxt 默认用 history 模式，和 hash 路由的底层差异无关。

#### 面试常见问题与解题思路

**Q1：Nuxt 的文件路由是怎么工作的？**
怎么想：从"目录即路由"切入。怎么答：构建期扫描 pages 目录生成路由配置，文件名即路径。追问：动态路由 `[id]` 和嵌套路由怎么写？静态段和动态段优先级如何？

**Q2：`/posts/new` 为什么不会匹配到 `/posts/[id]`？**
怎么想：从"静态优先"切入。怎么答：Nuxt 优先匹配静态路由，new 是静态段，所以先进 new.vue。追问：如果把文件名改成 `[new].vue` 会怎样？

### 2. 自动导入：省掉的不是两行 import，是设计压力

Nuxt 会自动导入 `app/components`、`app/composables`、`app/utils`、`app/stores`
里的东西，以及 Vue 的 `ref` / `computed` / `watch` 等。

**副作用（也是好处）**：你不再需要维护一长串 import 清单，
于是"新建一个文件"的心理成本变得很低 —— 这反过来鼓励你
把大文件拆小。这是框架在**引导你的设计习惯**。

**例外**：第三方库（包括 `lucide-vue-next` 的图标）**不在**自动导入范围内。
漏写 import 不会报错，只会静默渲染不出来 —— 见本文踩坑记录。

#### 实现方法

Nuxt 自动导入 `app/components`、`app/composables`、`app/utils`、`app/stores` 以及 Vue 的 `ref`/`computed`/`watch`，直接用不用 import。第三方库如 `lucide-vue-next` 的图标不在范围内，必须手写 import。

#### 原理

Nuxt 在编译期扫描约定目录，为每个导出生成隐式 import，页面和组件里就能当全局符号用。这降低了"新建文件"的心理成本，反过来鼓励把大文件拆小。自动导入是编译期注入，不影响运行时。

#### 与相关技术栈的关系

和 Vue CLI 时代手动 import 所有组件相比，自动导入更省事，但可读性上要依赖编辑器跳转才能知道符号从哪来。unplugin-auto-import 是通用实现，Nuxt 内置了它。和显式 import 相比，自动导入的代价是 newcomer 不易定位来源，所以本项目对第三方库仍要求显式 import。

#### 面试常见问题与解题思路

**Q1：Nuxt 的自动导入是怎么实现的？有什么坑？**
怎么想：从"编译期注入"切入。怎么答：扫描约定目录生成隐式 import。追问：哪些东西不会被自动导入？漏了 import 会怎样？

**Q2：自动导入会影响打包体积吗？**
怎么想：从"tree-shaking"切入。怎么答：自动导入仍是按需静态分析，没用到的不会进包，但有循环或全局副作用时要小心。追问：和全量 import 一个 barrel 文件相比呢？

### 3. `ref` 与 `computed`：先问"能不能算出来"

```ts
// ❌ 多余的状态：两个 ref 加一个 watch
const remaining = ref(0)
watch(draft, () => { remaining.value = MAX - draft.value.length })

// ✅ 派生状态用 computed
const remaining = computed(() => MAX - draft.value.length)
```

判断标准只有一句：**这个值能不能由别的状态算出来？**
能就用 `computed`，不能才用 `ref`。

`computed` 有三个额外好处：惰性求值、自带缓存、永远不会有中间态。

`CommentList.vue` 里的 `canSubmit`、`tooLong`、`remaining` 三个都是 `computed`，
一个 `ref` 都没有 —— 这就是这条原则的落地样子。

#### 实现方法

本项目用 `computed` 表达能算出来的值：`CommentList.vue` 的 `remaining`、`tooLong`、`canSubmit` 全是 computed，一个 ref 都没有。判断标准只有一句：这个值能不能由别的状态算出来？能就用 computed，不能才用 ref。

#### 原理

`computed` 是派生状态：它依赖的响应式值变化时自动重算，且惰性求值、带缓存、没有中间态。`ref` 是独立可变状态，需要你手动 `watch` 去同步。把"算得出来的"写成 ref 加 watch，既多余又容易和源状态失同步。

#### 与相关技术栈的关系

和 React 的 `useState` 加 `useMemo` 对应：ref 近似 useState，computed 近似 useMemo 但更自动（自动追踪依赖）。和 `watch` 的区别是关键：computed 产出值、watch 执行副作用。把"派生展示"误用 watch 去更新另一个 ref 是常见的反模式。

#### 面试常见问题与解题思路

**Q1：computed 和 watch 的区别？**
怎么想：从"产出值 vs 执行副作用"切入。怎么答：computed 返回派生值、自动缓存；watch 监听变化做副作用。追问：能用 watch 去同步派生状态吗？（能但容易失同步，优先 computed）

**Q2：computed 的缓存机制是怎样的？**
怎么想：从"依赖追踪"切入。怎么答：只有依赖的响应式值变化才重算，且取值时才算（惰性），不会暴露半算完的状态。追问：依赖是显式声明的还是自动收集的？

### 4. 组件粒度：`props` 进、`emit` 出

`PostCard.vue` 值得反复看。它的设计约束是：

```text
数据从 props 进来  ←  post: Post
交互用 emit 出去   →  emit('toggle-like', post.id)
```

**它在组件内部不取数据。** 如果它自己写 `usePostStore().fetchList()`，
它就永远只能用在首页了。

> 一条实用的判断：**当一个组件开始"自己找数据"时，它就失去了复用性。**
> 组件应该只负责"展示给定的数据"和"把用户意图报告出去"。

#### 实现方法

`PostCard.vue` 的数据从 `props` 进来（`post: Post`），交互用 `emit('toggle-like', post.id)` 出去，组件内部不自己取数据。这样同一张卡片能用在首页、搜索结果、作者主页。

#### 原理

组件只负责"展示给定数据"和"报告用户意图"，数据源由外部决定。一旦组件内部自己 `usePostStore().fetchList()`，它就和特定页面绑死，失去复用性。这条边界让组件成为可搬运的零件。

#### 与相关技术栈的关系

这就是"受控组件"思路，和 React 的 props 加回调（onToggleLike）一致。和"容器组件 / 展示组件"分层是同一套思想：展示组件不关心数据来源。和把数据请求塞进组件里（如 useEffect 里 fetch）相比，这种写法更利于测试和复用。

#### 面试常见问题与解题思路

**Q1：怎么判断一个组件该不该自己取数据？**
怎么想：从"复用性"切入。怎么答：如果数据只在该组件用、不需跨页共享，可在组件内取；若会被多处复用或需跨页，把数据提到 store 或父级，组件只收 props。追问：什么时候把取数逻辑抽成 composable？

**Q2：props 和 emit 分别解决什么问题？**
怎么想：从"数据流方向"切入。怎么答：props 向下传数据（单向），emit 向上报事件；子组件不直接改 props。追问：Vue 怎么保证单向数据流？（props 只读，改了会警告）

### 5. Pinia：什么时候才需要它

`app/stores/post.ts` 管了四类状态：列表、详情、评论、点赞。

判断该不该进 store 的标准是：

> **这份状态需要跨页面存活，或者被多个互不相邻的组件共享吗？**

- 帖子列表要在首页和（将来的）搜索结果页共用 → 进 store ✅
- 发帖页的"当前选中的预览标签页"只有它自己用 → 留在组件里 ✅

滥用 store 的典型症状是：**状态从一个路由泄漏到另一个路由**。
你从详情页返回首页，发现它还记着上一篇的内容 —— 就是这个问题。

#### 实现方法

`app/stores/post.ts` 管四类状态：列表、详情、评论、点赞。判断该不该进 store 的标准是：这份状态需要跨页面存活，或被多个互不相邻的组件共享吗？需要就进 store；只一个页面自己用的（如发帖页的预览标签）留在组件里。

#### 原理

Pinia 是全局单例的状态容器。把"跨页或共享"状态放进 store，避免 `prop` 层层透传和重复取数；把"局部"状态留在组件，避免状态溢出到无关页面。滥用 store 的典型症状是状态从一个路由泄漏到另一个路由。

#### 与相关技术栈的关系

Pinia 是 Vuex 的继任者，去掉了 mutations、用组合式 API 风格定义 store，类型推导更好。和 React 的 Redux、Zustand 相比，Pinia 更轻、样板更少。和组件内 `ref` 相比，store 适合共享，组件 state 适合局部；混淆两者会导致状态泄漏和难以追踪的 bug。

#### 面试常见问题与解题思路

**Q1：什么时候用 Pinia，什么时候用组件内 ref？**
怎么想：从"共享范围"切入。怎么答：跨组件或跨路由共享、需长期存活用 store；单组件局部用 ref。追问：store 用多了会有什么问题？（状态泄漏、排查困难）

**Q2：Pinia 和 Vuex 的主要区别？**
怎么想：从"样板量"切入。怎么答：Pinia 无 mutations、API 更组合式、类型更好。追问：Pinia 怎么持久化状态？怎么在 SSR 下避免状态串味？

### 6. SSR 与 `useAsyncData`

首页的首次数据获取包在 `useAsyncData` 里：

```ts
await useAsyncData('post-list-initial', async () => {
  await postStore.fetchList(true)
  return postStore.items.length
})
```

它带来两个结果：

1. **服务端就把数据取好了**，浏览器拿到的 HTML 里已经有帖子内容，
   而不是先看到骨架再闪一下（这个闪烁叫 FOUC，是你后面会反复遇到的体验问题）；
2. 数据会被序列化进 HTML，客户端"注水"（hydration）时**不会重复请求**。

代价是：`useAsyncData` 会让页面变成异步组件，首屏响应要等数据回来。
所以详情页里评论是**并行**获取的（第二个 `useAsyncData`），
它不会阻塞正文渲染。

#### 实现方法

首页首次取数包在 `useAsyncData('post-list-initial', ...)` 里，服务端就把帖子取好，HTML 里已有内容；数据序列化进 HTML，客户端 hydration 不重复请求。详情页的评论用第二个 `useAsyncData` 并行获取，不阻塞正文。

#### 原理

`useAsyncData` 在服务端执行一次数据获取，把结果随 HTML 一起下发，客户端复用这份数据而不重发请求，避免 FOUC（首屏闪烁）。代价是页面变成异步组件，首屏要等数据回来。把非关键数据（如评论）并行获取，能缩短阻塞时间。

#### 与相关技术栈的关系

和纯 CSR（客户端渲染）相比，SSR 首屏更快、利于 SEO，代价是服务端要能跑取数逻辑、注意状态不串味。Next.js 的 `getServerSideProps` 或 RSC 是类似思路。和 SSG（预渲染）相比，SSR 每次请求实时取数，适合个性化内容。和 `useFetch` 相比，`useAsyncData` 多了 key 去重，适合手动控制。

#### 面试常见问题与解题思路

**Q1：SSR 相比 CSR 有什么优缺点？**
怎么想：从"首屏/SEO vs 复杂度"切入。怎么答：SSR 首屏快、利于 SEO、避免闪烁；代价是服务端要跑取数、注意并发与状态隔离。追问：hydration 是什么？为什么不能重复请求？

**Q2：useAsyncData 和 useFetch 有什么区别？**
怎么想：从"key 去重"切入。怎么答：useAsyncData 用 key 缓存去重、手动包函数；useFetch 更自动、默认基于当前 URL。追问：客户端 hydration 时怎么避免重复请求？

### 7. 四种状态：这才是"做完了"

`CommentList.vue` 刻意覆盖了四种状态：

| 状态 | 界面 |
| --- | --- |
| 加载中 | 两条骨架条，形状和真实评论一致 |
| 空列表 | "还没有人评论，来说第一句吧" |
| 未登录 | 输入框换成"登录后即可参与讨论"+ 按钮 |
| 提交中 | 按钮禁用、文案变"发表中…" |

**Demo 和可用产品的差别，几乎全在这四种状态里。**
只做"有数据时"的情况，交付的是一张截图，不是一个页面。

#### 实现方法

`CommentList.vue` 刻意覆盖四种状态：加载中（骨架条）、空列表（引导文案）、未登录（替换为登录入口）、提交中（按钮禁用）。验收清单里专门列了这几项。

#### 原理

一个页面"做完了"的标志不是有数据时能用，而是加载、空、错误、提交中这些边界都被照顾到。只做"有数据"的情况，交付的是一张截图，不是可用产品。四种状态本质是给用户在每个可能的时刻一个明确的反馈。

#### 与相关技术栈的关系

和"happy path only"的 demo 相比，生产级 UI 必须处理边界。React 的 React Query、SWR 用 `isLoading`/`isError`/`data` 把这类状态标准化；Vue 生态里常在 composable 或 Pinia 里维护 `status` 字段。和只抛错误页相比，就地呈现可恢复的状态（如未登录引导）体验更好。

#### 面试常见问题与解题思路

**Q1：为什么一个页面要处理多种状态？**
怎么想：从"可用性"切入。怎么答：加载、空、错误、提交中都是真实会发生的时刻，缺一则用户在某些时刻没有反馈。追问：怎么组织这几种状态的 UI 切换？（条件渲染、状态机、async 状态库）

**Q2：骨架屏的作用是什么？和 loading 转圈比呢？**
怎么想：从"感知性能"切入。怎么答：骨架屏用近似真实布局的占位，降低等待焦虑、避免布局跳动；转圈只表示"在加载"但不知内容结构。追问：SSR 下还需要骨架屏吗？

---

## 四、代码走读

### `app/stores/post.ts` —— 本阶段最重要的文件

它顶部有三个被明确标注的函数：

```ts
// ⚠️ 阶段 4 替换点 A：列表查询
async function requestList(query) { ... 读 mockPosts ... }

// ⚠️ 阶段 4 替换点 B：单帖查询
async function requestOne(id) { ... 读 mockPosts ... }

// ⚠️ 阶段 6 替换点：评论列表
async function requestComments(postId) { ... 读 mockComments ... }
```

**为什么要把数据源收口在这三个函数里？**

因为阶段 4 要做的事只有一句："把函数体换成 `$fetch`"。
页面、组件、store 的其余部分一行都不用改。

如果你在组件里到处 `import { mockPosts }`，阶段 4 你要改二十个文件，
而且一定会漏掉某个地方 —— 那个地方就是上线后的 bug。

另外注意 `hasMore`：

```ts
const hasMore = computed(() => items.value.length < total.value)
```

它没有自己的 `ref`。**能从已有状态推导的东西，不要再存一份** ——
否则两份状态迟早会不同步。

### `app/components/TagFilter.vue` —— `defineModel` 与移动端细节

```ts
const model = defineModel<string | null>({ required: true })
```

一行代码替代了 `props` + `emit('update:modelValue')` 的样板。
父组件写 `<TagFilter v-model="tagModel" />` 就能双向绑定。

还有一个容易被忽略的体验细节：标签条在窄屏要横向滚动，
**被选中的标签必须自动滚进可视区**。否则用户点了第 8 个标签，
界面看起来毫无反应（其实只是它滚出屏幕了）。这就是那个 `watch` + `scrollIntoView` 的作用。

### `app/components/PostCard.vue` —— 摘要为空时的处理

```vue
<p v-if="post.summary" class="... line-clamp-2">{{ post.summary }}</p>
<p v-else class="... italic">这篇还没有摘要</p>
```

`summary` 是可选字段（因为 AI 可能失败），所以**必须处理它不存在的情况**。

两种偷懒做法都不可取：
- 不管它 → 界面出现一个空洞，看起来像渲染出错；
- 编一个假摘要 → 骗过了类型系统，也骗过了用户。

### `app/utils/format.ts` —— 为什么是 `utils` 而不是 `composables`

`composables/` 放的是**带状态的逻辑**（里面有 `ref`、`watch`、生命周期）；
`utils/` 放的是**纯函数**（给同样的输入永远给同样的输出）。

`formatRelativeTime('2026-09-10')` 无论在哪里调用结果都一样，所以它是 util。
把它放进 `composables/` 不会报错，但会让人误以为它持有状态。

---

## 五、踩坑记录

### 坑 1 · 模板字符串里的反引号把整个文件搞崩了

这是本阶段最有教育意义的一次事故。

mock 数据里的文章正文是 Markdown，而 Markdown 的行内代码要用反引号：

```ts
content: `NestJS 在运行时读它，于是知道了 `PostsService` 这个类。`
//                                              ↑ 这里！
```

这四个反引号里，第一对是**模板字符串的定界符**，
然后 `PostsService` 变成了一个裸标识符，接着第二个反引号
又开了一个新的模板字符串 —— 于是整个文件的语法解析全乱了。

构建报错是：

```text
Expected `,` or `}` but found Identifier
  ╭─[ app/mock/posts.ts:223:22 ]
```

**正确写法是转义**：

```ts
content: `NestJS 在运行时读它，于是知道了 \`PostsService\` 这个类。`
```

更麻烦的是**定位过程**：我一开始写了个正则去扫描"未转义的反引号"，
结果它把每一对**已转义**反引号的起始符也算了进去，报了一堆假阳性。
最后改成"按行统计未转义反引号数量、成对出现（偶数值）才可疑"才定位准确。

> **两条教训**：
> 1. 用模板字符串装 Markdown / SQL / 正则时，先想清楚里面有没有反引号；
> 2. **写检查脚本时，先验证脚本本身正确**。一个假阳性很高的检查器，
>    比没有检查器更浪费时间。

### 坑 2 · 不存在的页面返回了 200

详情页在帖子找不到时，界面显示"找不到这篇文章"，但 HTTP 状态码是 **200**。

后果：搜索引擎会把这种页面当成正常内容收录，
站点里会慢慢长出一堆"内容是不存在"的索引页。

修复是在服务端渲染时显式设置状态码：

```ts
if (notFound.value) {
  setResponseStatus(404)
}
```

### 坑 3 · `line-clamp` 需要配合 `overflow`

摘要的两行截断用 `line-clamp-2`。它在新版 Tailwind 里是内置工具类，
但要记得它依赖 `display: -webkit-box`，所以**不能同时给它加 `flex`**，
否则截断会静默失效 —— 文字会一直溢出去。

---

## 六、自检清单

- [ ] 为什么 `posts/new.vue` 不会被 `posts/[id].vue` 匹配掉？
- [ ] 什么值该用 `computed`，什么值该用 `ref`？
- [ ] `PostCard` 为什么不自己在内部调 store 取数据？
- [ ] 阶段 4 需要改哪几个函数就能接上真实接口？为什么只需要改这几个？
- [ ] 为什么 `formatRelativeTime` 放在 `utils/` 而不是 `composables/`？
- [ ] "四种状态"分别是什么？少做哪一种最影响体验？

---

## 七、术语表

| 术语 | 一句话解释 |
| --- | --- |
| 文件路由 | 文件路径直接决定 URL，不需要手写路由表 |
| 动态段 | `[id]` 这种可变的路径片段 |
| 自动导入 | 框架自动注入常用 API 与本地文件，省掉 import |
| 组合式 API | 用函数（`ref`/`computed`）组织逻辑，而不是选项对象 |
| 派生状态 | 能由其它状态算出来的值，应该用 `computed` |
| 受控组件 | 状态由外部传入、变化通过事件报出去的组件 |
| SSR | 服务端渲染：服务器就把 HTML 生成好 |
| Hydration 注水 | 浏览器接管服务端 HTML 并挂上交互逻辑 |
| `useAsyncData` | Nuxt 提供的数据获取钩子，支持 SSR 与缓存去重 |
| FOUC | 首屏内容闪烁：先显示空壳再突然出现内容 |

---

下一阶段会有一个明显的变化：**你要开始写服务端代码了**。
而且会第一次遇到"程序跑不起来，但不是语法错误"这类问题 —— 环境变量、连接串、IP 白名单。

去做 [练习 2](/exercises/stage-2) 之前，先把上面的自检清单答一遍。
