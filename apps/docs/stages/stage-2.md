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

### 2. 自动导入：省掉的不是两行 import，是设计压力

Nuxt 会自动导入 `app/components`、`app/composables`、`app/utils`、`app/stores`
里的东西，以及 Vue 的 `ref` / `computed` / `watch` 等。

**副作用（也是好处）**：你不再需要维护一长串 import 清单，
于是"新建一个文件"的心理成本变得很低 —— 这反过来鼓励你
把大文件拆小。这是框架在**引导你的设计习惯**。

**例外**：第三方库（包括 `lucide-vue-next` 的图标）**不在**自动导入范围内。
漏写 import 不会报错，只会静默渲染不出来 —— 见本文踩坑记录。

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

### 5. Pinia：什么时候才需要它

`app/stores/post.ts` 管了四类状态：列表、详情、评论、点赞。

判断该不该进 store 的标准是：

> **这份状态需要跨页面存活，或者被多个互不相邻的组件共享吗？**

- 帖子列表要在首页和（将来的）搜索结果页共用 → 进 store ✅
- 发帖页的"当前选中的预览标签页"只有它自己用 → 留在组件里 ✅

滥用 store 的典型症状是：**状态从一个路由泄漏到另一个路由**。
你从详情页返回首页，发现它还记着上一篇的内容 —— 就是这个问题。

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
