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

图标不走「引入组件」这条路：全站统一用 Nuxt UI 的 `<UIcon>` 配 Iconify 图标集
（`i-lucide-heart` 这种写法），由 `@iconify-json/lucide` 提供，
**不需要**任何 import，也不会出现「忘了 import 就静默渲染不出来」的问题。

```vue
<UIcon name="i-lucide-heart" class="size-4" />
```

> 曾经这里用的是 `import { Heart } from 'lucide-vue-next'`，那也正是上面那段
> 「必须显式 import」说法的来源。现已全数改为 UIcon，该依赖也已移除 ——
> 两种写法并存会让图标尺寸与描边粗细不一致，统一一种更好维护。

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
pnpm dev              # 开发服务器  http://localhost:3001
pnpm build            # 生产构建，产物在 .output/
pnpm preview          # 预览构建产物
pnpm typecheck        # 类型检查
pnpm e2e              # 端到端测试（需后端已在 :3000 运行）
pnpm e2e:headed       # 看着浏览器跑，适合排查
pnpm e2e:report       # 查看上次运行的报告
```

首次跑端到端测试要先下载浏览器（约 100MB，只需一次）：

```bash
pnpm exec playwright install chromium
```

在仓库根目录下用过滤参数调用：

```bash
pnpm --filter @studyplan/web dev
```

### 端到端测试的两个环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `E2E_BASE_URL` | 被测站点地址。**同一套用例既能打本地也能打线上** | `http://localhost:3001` |
| `E2E_PROXY` | 浏览器走代理。只在设置时才生效 | 不设置（直连） |

```powershell
# 打线上环境（PowerShell）
$env:E2E_BASE_URL='https://你的域名'
pnpm e2e

# 若本机访问境外站点受限，再给浏览器配代理
$env:E2E_PROXY='http://127.0.0.1:7897'
```

> ⚠️ 端到端测试会往目标环境**写真实数据**（真注册、真发帖）。
> 指向线上库前先确认能接受这些数据，或先做一次快照（见 `deploy/snapshot.mjs`）。

## 环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `NUXT_PUBLIC_API_BASE` | 后端接口地址（**浏览器侧**使用） | `http://localhost:3000/api` |
| `NUXT_API_BASE_INTERNAL` | 后端接口地址（**SSR 服务端**使用，不进浏览器） | `http://127.0.0.1:3000/api` |
| `HOST` / `PORT` | 生产运行时（Nitro）的监听地址与端口 | 容器里设为 `0.0.0.0` / `3000` |

前两个变量的分工是刻意的：

```text
浏览器  →  NUXT_PUBLIC_API_BASE   （请求从用户机器发出，走同域或公网地址）
SSR     →  NUXT_API_BASE_INTERNAL （请求从容器内部发出，走回环最快）
```

原因有两个：

1. `$fetch` 在服务端**不接受相对路径**（没有 origin 可解析），所以同域部署时浏览器能用 `/api`，
   服务端必须另给一个绝对地址；
2. 服务端请求从容器内部发出，走回环比绕公网域名更快，也不受域名解析与证书影响。

以 `NUXT_PUBLIC_` 开头的变量会被**打包进浏览器代码**，所以**绝对不能放密钥**。
密钥只能待在后端的 `apps/api/.env` 里。

⚠️ 另外注意：`NUXT_PUBLIC_API_BASE` 是**构建期常量**——它会被烘焙进客户端 bundle，
改了环境变量**必须重新构建**才生效。这也是同域部署时建议直接写相对路径 `/api` 的原因：
不带域名，换域名就不用重新构建。

---

## 容器化部署形态

前端在容器里的构建与启动：

```text
apps/web/Dockerfile（多阶段）
  ├─ deps      只复制清单文件 → pnpm install --filter @studyplan/web...
  ├─ build     先构建 packages/shared，再 nuxt build（产物 .output）
  └─ runtime   只搬 .output，CMD node .output/server/index.mjs
```

两个要点：

1. **构建上下文必须是仓库根**——同样是 `workspace:*` 依赖 `packages/shared` 造成的约束；
2. **接口地址在构建期注入**（`ARG NUXT_PUBLIC_API_BASE`）。忘了传，线上页面会去请求
   `localhost`，而本地完全看不出来——所以 Dockerfile 里加了断言，没传就直接让构建失败。

⚠️ 容器内监听地址必须是 `0.0.0.0`（不能是 `127.0.0.1`），
否则网关从容器网络访问不到它，表现是"部署成功但站点 502"，且容器日志一切正常。

> 单容器部署时前后端同处一个镜像、由入口脚本按路径分流，
> 见仓库根的 `Dockerfile.vercel` 与 `docker/vercel/entrypoint.mjs`。
