# `@studyplan/web` · 前端

**这是前端。** 用户能看到和点到的一切都在这里：页面、样式、交互、请求封装。

技术栈：Nuxt 4 + TypeScript + Nuxt UI（内置 Tailwind CSS 4）+ Pinia。

---

## 为什么源码在 `app/` 里面？

你打开这个目录会看到 `app/` 里还有一层结构，看起来像"套了两层"。这不是写错了，
是 **Nuxt 4 的约定**，而且是有意为之的。

Nuxt 4 把"源码"和"非源码"明确分开了：

```text
apps/web/
├── app/                  ← 源码（会被编译、会进入产物）
│   ├── pages/            页面
│   ├── components/       组件
│   └── ...
├── public/               ← 静态文件（原样复制，不做任何处理）
├── server/               ← 后端 API 路由（本项目不用，后端是独立的 NestJS）
├── e2e/                  ← 端到端测试（Playwright）
└── nuxt.config.ts        ← 配置
```

Nuxt 3 时代这些东西全堆在项目根目录下，导致根目录里"源码"、"配置"、"静态资源"、
"测试"混在一起，文件一多就分不清哪些能改、哪些别动。
Nuxt 4 把源码收进 `app/`，剩下的目录各自有明确用途。

> 想改这个行为可以用 `srcDir` 配置，但那属于**偏离框架默认**。
> 偏离的代价是：以后你看任何 Nuxt 4 教程、问 AI、查官方文档，路径都对不上。
> 所以这里保持默认。

---

## `app/` 里每个目录负责什么

| 目录 | 职责 | 例子 |
| --- | --- | --- |
| `pages/` | **文件路由**：文件路径 == URL 路径 | `pages/posts/[id].vue` → `/posts/123` |
| `components/` | 可复用 UI 组件，**自动全局可用**，不用 import | `PostCard.vue` |
| `composables/` | 组合式函数，跨组件复用逻辑，**自动导入** | `useApi()`、`useAuth()` |
| `stores/` | Pinia 状态仓库，**跨页面共享**的数据 | `stores/post.ts` |
| `middleware/` | 路由守卫，跳转前拦截 | `auth.ts` 拦截未登录发帖 |
| `plugins/` | Nuxt 插件，应用启动时执行一次 | `auth-restore.client.ts` |
| `utils/` | 纯函数工具，**自动导入** | `formatRelativeTime()` |
| `assets/css/main.css` | 设计令牌 + 全局组件类 | 主色、圆角、卡片样式 |
| `app.vue` | 根组件 / 全局布局 | 页头 + 内容 + 页脚 |
| `app.config.ts` | 应用级配置（非环境相关） | Nuxt UI 主色别名 |

**自动导入**是 Nuxt 最省事的机制：`components/`、`composables/`、`utils/` 里的东西
不用写 `import` 就能直接用。

但它有个必须记住的例外：**第三方库的组件不在自动导入范围内**。
比如 `lucide-vue-next` 的图标，必须自己显式 import：

```vue
<script setup lang="ts">
import { Heart } from 'lucide-vue-next' // 漏掉这行不会报错，只会静默渲染不出来
</script>
```

---

## 数据是从哪来的

```text
pages/index.vue
    │  读
    ▼
stores/post.ts  ──调用──▶  composables/useApi.ts  ──HTTP──▶  NestJS 后端 /api/posts
    │                              │
    │                              └─ 自动附带 Access Token、401 时自动刷新
    ▼
类型来自 packages/shared（前后端唯一契约）
```

关键约定：**组件不直接发请求**。请求逻辑收在 `stores/` 或 `composables/`，
组件只消费数据。这样后端接口改了，需要改的地方是确定的几处，而不是散落在每个组件里。

类型**不在这里定义**，全部从 `packages/shared` 引入 —— 那是前后端共用的唯一真相。

---

## 常用命令

在本目录下：

```bash
pnpm dev          # 开发服务器  http://localhost:3001
pnpm build        # 生产构建，产物在 .output/
pnpm preview      # 预览构建产物
pnpm typecheck    # 类型检查
pnpm e2e          # 端到端测试（需后端已在 :3000 运行）
```

在仓库根目录下用过滤参数调用：

```bash
pnpm --filter @studyplan/web dev
```

## 环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `NUXT_PUBLIC_API_BASE` | 后端接口地址 | `http://localhost:3000/api` |

以 `NUXT_PUBLIC_` 开头的变量会被**打包进浏览器代码**，所以**绝对不能放密钥**。
密钥只能待在后端的 `apps/api/.env` 里。
