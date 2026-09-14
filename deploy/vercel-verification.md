# Vercel 验证性部署报告

> 目的：用最低成本回答三个此前无法从文档确定的未知，据此决定"省下服务器费用"还是"回到 Dokploy"。
> 结论先说：**三个标准全部通过（技术上可行），但由于 DNS 污染与网络阻断，它不能作为面向中国大陆用户的生产环境。**

## 一、最终状态

| 项 | 值 |
| --- | --- |
| 项目 | `studying5/studyplan`（Hobby 套餐，单区域默认美东 iad1） |
| 生产域名 | `https://studyplan-teal.vercel.app` |
| 本次部署 | `https://studyplan-15hrjrlgh-studying5.vercel.app` |
| 镜像 | `vcr.vercel.com/studying5/studyplan/studyplan@sha256:6346e937…`（本地同构镜像 352MB） |
| 构建耗时 | 约 3 分钟（`pnpm install` + `build:shared` + api build + web build + 推镜像） |
| 数据库 | Atlas M0 → `studyplan-prod`，专用用户 `verify-bot` |

## 二、三个验收标准的实测结果

### ① 容器能否在 Vercel 构建并运行 —— **通过**

镜像由平台构建并推送到 VCR，容器内两个子进程（NestJS:3000、Nuxt SSR:3001）由零依赖入口脚本按路径分流。
入口日志：

```
[entrypoint] 已启动 api（pid=14）
[entrypoint] 已启动 web（pid=15）
[entrypoint] 监听 0.0.0.0:80｜/api、/docs → 3000｜其余 → 3001
```

### ② 同域 Cookie 链路 —— **通过**

生产环境（HTTPS）实测注册 → 刷新 → 登出：

| 步骤 | 结果 |
| --- | --- |
| `POST /api/auth/register` | `201 Created`，`Set-Cookie: sp_refresh_token=…; Max-Age=604800; Path=/api/auth; Expires=…; HttpOnly; Secure; SameSite=Lax` |
| `POST /api/auth/refresh`（携带该 Cookie） | `200 OK`，返回轮换后的新 Cookie 与 `accessToken` |
| `POST /api/auth/logout` | `200 OK`，`Set-Cookie: sp_refresh_token=; Expires=Thu, 01 Jan 1970…` |

关键点：`Secure` 出现，证明 `NODE_ENV=production` 生效；`SameSite=Lax` 在同域下正常工作。
响应体同时确认统一包装与链路 ID：

```json
{"statusCode":200,"data":{"user":{…},"tokens":{"accessToken":"…","expiresIn":900}},
 "requestId":"e74f4ee6-…","timestamp":"2026-09-12T05:16:22.833Z"}
```

### ③ Atlas 连接与冷启动 —— **通过**

- `GET /api/health` → `{"status":"ok","info":{"mongodb":{"status":"up"}},"error":{},"details":{"mongodb":{"status":"up"}}}`
- 业务接口实测：`GET /api/posts?page=1&pageSize=10&tag=Vue` → `200`，`198ms`（另一次 1666ms）
- 冷启动：容器启动到首个成功响应约 **4.5 秒**；启动窗口内的请求被入口脚本挡成可诊断的 502，而不是平台级的"容器未提供 HTTP 服务"

### ④ 真实浏览器端到端（Playwright 直打线上）—— **通过（6/6）**

```
6 passed (39.9s)
```

覆盖：注册并自动登录（含**整页刷新后仍保持登录**）→ 发布文章 → Markdown 渲染 → 点赞（乐观更新）→ 评论与删除 → 标签筛选 → 未登录访问发帖页被拦下。
其中「整页刷新后仍保持登录」这一条，正是同域 Cookie 在**真实浏览器**中的行为验证（`Secure` + `SameSite=Lax` + httpOnly 全部按预期工作）。

运行方式（本机需经代理访问境外域名）：

```powershell
$env:E2E_BASE_URL='https://studyplan-teal.vercel.app'
$env:E2E_PROXY='http://127.0.0.1:7897'   # 已在 playwright.config.ts 中支持
pnpm --filter @studyplan/web e2e
```

## 三、发现的阻断问题（决定成败的一项）

**从这台机器所在网络，`*.vercel.app` 不可达：**

```
studyplan-teal.vercel.app → 解析为 31.13.92.5（Meta 段）/ 205.251.x（AWS 段）… 每次不同
TCP 443 → 连接超时；对照 vercel.com → 200 / 0.96s
用已知边缘 IP 直连（--resolve）→ 0.1s 内被拒
```

即：**DNS 被污染，且到边缘节点的路径本身被阻断**。而浏览器能打开（浏览器自带 DoH 解析），命令行不能。

本报告的全部线上验证均通过本机 Clash 代理（`127.0.0.1:7897`）完成。

## 四、平台侧踩坑记录（官方文档未写明，均为实测所得）

1. **`Dockerfile.vercel` 自动检测不可靠**。仅把文件放在仓库根，平台会退回普通 JS 构建，最终报
   `No Output Directory named "public" found`。**必须**在仓库根加 `vercel.json`，用 `services` + `rewrites` 显式声明容器服务并暴露路由：

   ```json
   {
     "services": { "studyplan": { "root": ".", "entrypoint": "Dockerfile.vercel", "runtime": "container" } },
     "rewrites": [{ "source": "/(.*)", "destination": { "service": "studyplan" } }]
   }
   ```

   （`vercel.json` 做严格校验，**不允许任何 `//` 之类的注释键**。）

2. **不要"等子进程就绪再 listen"**。平台对容器有约 **28 秒启动超时**；若把监听推迟到子进程就绪之后，一旦某个子进程启动失败，就永远等不到，平台会报
   `could not connect to $PORT=80 … within the startup timeout`，把子进程真正的报错**完全盖住**。
   正确做法：**先 listen，再异步探测就绪**。改完后，同一场景下的日志直接给出了根因（环境变量校验失败）。

3. **CMD 必须用绝对路径**。平台会在容器启动命令前注入证书包装脚本，该脚本不保留镜像 PATH；写裸 `node` 有概率报 `exec: node: not found` 且运行日志里看不到任何应用输出。
   本项目已改为 `CMD ["/usr/local/bin/node", "entrypoint.mjs"]`。

4. **用 CLI 写环境变量时不要用 PowerShell 管道**。`$value | vercel env add …` 会把换行/多余字符一起写进去，症状分别是：
   - `NODE_ENV` 校验失败（`NODE_ENV must be one of the following values: …`）
   - `MongoParseError: Invalid scheme, expected connection string to start with "mongodb://"`
   **可靠做法**：把值写入文件（无结尾换行），再用输入重定向：
   `cmd /c "vercel env add NAME production < value.txt"`。本报告已用 `PROBE_URI`（87 字符、含 `?`/`&`）逐字节验证该写入法精确无误。

5. `vercel env pull` 默认拉的是 **development** 环境；要拉生产需显式 `--environment=production`。Secret 类型的值**不可被 pull**。

6. **冷启动窗口内的请求会被打回 502，必须在入口层"等一等"**。
   平台是缩容到零的模型（无流量 5 分钟回收），下一个访客打在全新实例上，而子进程还要 2-5 秒才监听端口。
   第一版入口脚本在这种情况下直接回 502，**线上 E2E 的第一条用例因此整页只看到「上游服务暂时不可用」**。
   正确做法：监听立即开（满足平台启动超时），**请求到达时等待上游就绪**（本项目实现为 `waitUntilReady()`，就绪后缓存）。
   注：这个缺陷**只会在线上出现**，本地进程一直活着，永远复现不到 —— 这正是"E2E 打生产"的价值所在。

7. **E2E 用例本身要防"SSR 水合竞态"**。
   SSR 的 HTML 一到浏览器 DOM 就存在，但 Vue 事件处理器要等水合完成才挂上；
   落在中间窗口的点击**不报错也不生效**，失败位置离成因很远。
   修法（本项目已改）：用 `expect(...).toPass()` 重试点击并观察状态变化；
   对**开关型**元素（如标签按钮）要"先看状态再决定点不点"，否则重试会把已选中的取消掉。

## 五、其他与既有决策的偏离（已在计划评审时说明）

| 项 | 原决策 | 实际 |
| --- | --- | --- |
| Atlas 精确 IP 白名单（Q15A） | 只放行固定 IP、禁用 `0.0.0.0/0` | **办不到**：容器镜像不支持 Static IPs，出口 IP 不固定，必须放行全量 |
| 内存态限流 | 多实例下有效 | **失效**：按流量扩缩，各实例计数不共享。仅单实例内有效 |
| 常驻模型（Q14A） | 保持 fail-fast + 常驻 | 平台为**缩容到零**模型，无流量 5 分钟后实例回收 |

## 六、结论与建议

**技术结论**：Vercel 这条路是**通的**，三个验收标准全部通过；容器化本身还额外带来两个好处——同域（Cookie 免配置）+ 接口地址可用相对路径 `/api`（换域名不必重新构建）。

**但它不适合作为面向中国大陆的生产环境**：

1. `*.vercel.app` 被 DNS 污染且路径被阻断，**用户与你自己的命令行都访问不到**（浏览器靠 DoH 侥幸可用，但不可依赖）；
2. Hobby 为**单区域**（默认美东），中国大陆访问延迟高；
3. **Atlas 白名单必须永久放开 `0.0.0.0/0`** —— 这与本项目此前"凭据已泄露一次"的安全基线直接冲突；
4. 无流量 5 分钟缩容到零 + 内存态限流失效，与"常驻 Node 进程 + 精确白名单"的原设计假设不一致。

**建议**：把本次部署保留为**验证/演示环境**，生产仍走 Dokploy + VPS（选香港/新加坡/日本等可达区域 + 自有域名），即可同时拿到：精确白名单、无冷启动、限流生效、可访问性。
本次验证的产出（同域 `/api` 相对路径改造、`maxPoolSize` 收敛、入口脚本的启动顺序修正、环境变量写入法）**对 Dokploy 方案全部可复用**。

## 七、验证结束后的待办

按当前决策（**先尝试救活 Vercel**）排列：

- [ ] **绑自定义域名并实测可达性**：这是"救活 Vercel"的关键一步。判定依据已经拿到——阻断只发生在 TLS SNI 阶段且只针对 `*.vercel.app`（同一 IP 用 `SNI=vercel.com` 返回 200，连接耗时 0.03-0.10s），因此自有域名极可能直连可用。
- [ ] 若最终放弃 Vercel：回收 Atlas 网络白名单中的 `0.0.0.0/0`、删除 `verify-bot` 用户、删除 `vercel.json`（`Dockerfile.vercel` 可留作演示）。
- [ ] **轮换 `genshin1210_db_user` 的密码**（本次实测确认：泄露事件中的旧密码**目前仍然可以连上数据库**；用户选择暂缓，此项挂账）。
- [ ] `studyplan-prod` 中保留着 E2E 写入的演示数据（1 个帖子 + 若干测试账号）。若要回到干净状态：
      `cd apps/api && node --env-file=.env ../../deploy/snapshot.mjs restore studyplan-prod <快照目录>`
      注：本次基线快照放在 `%TEMP%\studyplan\baseline`（临时目录，会被清理），需要长期留存请重新 dump 到仓库内并确保被忽略。
- [ ] **本地开发模式的水合异常需另行排查**（与本次部署无关，但会挡住本地 E2E）：
      本地 E2E 稳定卡在"点击页签后视图不切换"，而 SSR 输出正常（curl 可拿到完整 HTML）。
      已排除：Nuxt 缓存陈旧（已清理 `.nuxt` 重试）、开发服务器启动方式。
      待查方向：开发模式下客户端入口 / 模块解析（页面里客户端脚本引用出现 Windows 绝对路径形态
      `/_nuxt/D:/.../entry.async.js`，虽然该 URL 返回 `text/javascript`，但值得深究）、
      unifont 字体 provider 初始化失败的影响。
      ⚠️ 注意：因为这一条，**"同一套测试本地与线上都绿"这个更强的结论目前尚未成立**——
      线上 6/6 是真实通过的，本地那条仍需单独修。

## 八、AI 学习助手启用验证（步骤与预期）

> 背景：本项目的 AI 模块是**增强功能**——不配 `NVNIM_API_KEY` 也能部署，只是降级为「未启用」。
> 线上出现「AI 功能未启用」时，根因几乎总是"平台没配这个环境变量"，而非代码故障。
> 本节能让部署者用**一条命令**确认状态，而不用翻日志或读代码。

### 启用步骤

1. `Project → Settings → Environment Variables` 新增 `NVNIM_API_KEY`（Environment 勾 **Production**，Type 选 **Secret**），值取本地 `apps/api/.env` 里 `nvapi-` 开头那串；
2. **Redeploy**（`Deployments → 最新一条 → ⋯ → Redeploy`）—— 容器环境变量是**运行时注入**，改完不自动生效；
3. 打开线上站点 → 右下角 AI 抽屉应显示"今日剩余 N"，可正常提问。

### 自检命令与预期返回

```bash
curl https://你的域名/api/ai/status
```

| 字段 | 启用后预期 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | AI 总开关（与 `keyConfigured` 同源） |
| `keyConfigured` | `true` | Key 是否真的进了实例（配没配好的直白信号） |
| `model` | `openai/gpt-oss-20b` | 当前模型 |
| `codeIndexLoaded` | `true` | 代码索引是否随镜像进入运行层 |
| `codeIndexFiles` | `> 0`（约 100） | 索引文件条数；`0` 表示索引没进运行层 |
| `remainingToday` / `limitPerDay` | `300` / `300` | 今日剩余 / 每日上限 |

预期里 `codeIndexLoaded: true` 这条很关键：它证明"问本站代码"所需的索引**随镜像进去了**。
若它是 `false`，AI 答"本站代码"类问题会退化成"资料中没有提到"——而应用本身不会报错，只在运行时悄悄变笨。

### 验证标准

- [x] `/api/ai/status` 返回 `enabled:true`、`keyConfigured:true`、`codeIndexLoaded:true`、`codeIndexFiles>0`
- [x] AI 抽屉不再显示"未启用"，显示"今日剩余 N"
- [x] 提问能拿到答案；**问本站代码类问题时 `sources` 非空**（索引随镜像进去了的证据）
- [x] 真实浏览器验证：抽屉打开、输入、提交、Markdown 回答渲染出来

> ⚠️ 只凭 `/api/ai/status` 的 JSON 不足以证明前端可用：本项目经验档案里记录过
> "SSR 的 HTML 会掩盖客户端失败"——页面打得开不代表交互能用。最终仍需一次真实浏览器验证。

### 实测记录（2026-09-13）

路径：`Vercel 面板新增 NVNIM_API_KEY（Production / Secret）→ Redeploy → 浏览器验证`。
本机 `*.vercel.app` 被 DNS 污染，下列 `curl` 与真实浏览器均经代理 `127.0.0.1:7897` 访问。

**① 接口自检（`curl https://studyplan-teal.vercel.app/api/ai/status`）**

| 字段 | 实测值 | 结论 |
| --- | --- | --- |
| `enabled` | `true` | 通过 |
| `keyConfigured` | `true` | 通过（Key 已进实例） |
| `model` | `openai/gpt-oss-20b` | 通过（代码默认值生效） |
| `codeIndexLoaded` | `true` | 通过（索引随镜像进入运行层） |
| `codeIndexFiles` | `101` | 通过（≈预期 100） |
| `remainingToday` / `limitPerDay` | `298` / `300` | 通过 |

**② 真实浏览器验证（Playwright + Chromium，经代理）**

截图：`deploy/ai-verify-1-home.png`（首页）、`deploy/ai-verify-2-drawer.png`（AI 抽屉）、`deploy/ai-verify-3-answer.png`（答案与来源）。

| 检查项 | 实测 |
| --- | --- |
| 抽屉能否打开 | 能（点右下角悬浮按钮 → "AI 学习助手"滑出） |
| 剩余额度徽标 | 提问前 `300` 档、提问后显示 **「今日剩余 297」**（正确扣减） |
| 答案是否渲染 | 是（Markdown 正文渲染，约 271 字） |
| `sources` 是否非空 | **是，4 个文件**：`apps/api/src/modules/ai/ai.service.ts`、`ai.controller.ts`、`ai.module.ts`、`schemas/ai-usage.schema.ts` |
| 控制台报错 | 仅 2 条非阻断资源错误（匿名访问的 `401` 鉴权探测 + 1 个 `404` 静态资源），**无 JS 异常**，与 AI 流程无关 |

**结论**：线上 AI 学习助手已真正可用——接口自检全绿、抽屉正常、额度正确扣减、提问有 Markdown 回答、且**问本站代码类问题时 `sources` 非空**，证明代码索引随镜像进入运行层并能被检索。根因（平台缺 `NVNIM_API_KEY`）已通过"配 Key + Redeploy"彻底解决。

---

## 九、性能基线与验收标准（2026-09-15）

> 起因：用户反馈"部署到 Vercel 之后，各种点击响应都很慢"。
> 本节记录**实测方法、基线数字、根因判定、已做改动、以及被否决的改动**。
> 所有数字都用 `pnpm bench:vercel`（即 `scripts/bench-vercel.mjs`，零依赖）复现。

### 9.1 网络环境已变更（旧结论作废）

§三 记录的"`*.vercel.app` DNS 被污染、必须走代理"**在当前网络下不成立**：

```
dns=0.010s  tcp=0.020s  tls=0.049s      X-Vercel-Id: hkg1::iad1::...
```

边缘在 **hkg1（香港）**，容器在 **iad1（美东）**。旧的"DNS 污染/路径阻断"结论仅对当时那台机器有效。

### 9.2 基线数字（改动前）

**冷启动**（久置后首个请求）：

| 请求 | DNS | TCP | TLS | TTFB | 总计 |
| --- | --- | --- | --- | --- | --- |
| `/api/health` | 0.113 | 0.124 | 0.259 | **6.609s** | 6.610s |
| `/`（紧随） | 0.010 | 0.020 | 0.049 | 1.895s | 2.093s |
| `/api/posts?page=1` | 0.009 | 0.017 | 0.046 | 1.003s | 1.003s |

**闲置梯度**（验证回收阈值）：`WARM1 0.754s → WARM2 0.282s → 闲置60s 0.525s → 闲置120s 0.313s`
→ **闲置 2 分钟不会触发回收**，"隔 2 分钟就慢"的体感不成立，真实阈值更长。

**序列模式（关键）**——连续打同一路径 8 次，慢请求占比：

| 路径 | 逐次 TTFB（秒） | 慢请求(>3s) |
| --- | --- | --- |
| `/api/health` | 0.31 0.26 0.24 0.23 0.24 0.23 0.24 0.26 | **0/8** |
| `/` | 1.12 0.60 1.22 0.53 **3.75** 0.52 **3.48** 0.44 | 2/8 |
| `/api/posts` | **6.53** 0.72 **6.96** 0.49 **6.97** 0.46 **6.79** 0.52 | **4/8** |

**注意**：`posts` 的**中位数**是 3.6s，而真实体感是"一半的点击在等 6.6 秒"。这正是 §9.5 里脚本必须提供序列模式的原因——**中位数会把冷启动藏起来**。

### 9.3 根因判定

**主因：Mongoose 连接池里存在"驱动以为活着、实际已被掐断"的连接，取到它的那次请求要等重连，实测约 6.6 秒。**

判定依据是这一组对照：

| 端点 | 是否经过连接池 | 连续 20 次结果 |
| --- | --- | --- |
| `/api/health`（`ping`） | **否**（走驱动 SDAM 心跳连接） | 20/20 全部 0.25~0.30s |
| `/api/posts`、`/api/posts/:id`、`/api/ai/status`、SSR `/` | **是** | 出现 3.5~7.0s 尖峰 |

补充证据：

- 数据库里只有 **2 条帖子**，单条 `findById` 同样交替 0.56s / 6.74s → 排除索引、扫描、数据量。
- `/api/ai/status` 也会尖峰 → 排除"只有列表查询慢"。
- `health` 响应头是 `no-cache, no-store, must-revalidate` 且 `X-Vercel-Cache: MISS` → 排除边缘缓存造成的假快。
- `6.6s ≈ retryDelay(原 3000) × 2` —— 与重连等待高度吻合。

**次因：真实冷启动约 6.6 秒**（久置后首个请求，影响所有端点，包含 `health`）。

### 9.4 已排除（不要再往这些方向查）

1. 静态资源：`/_nuxt/**` 已带 `public, max-age=31536000, immutable`，边缘 `X-Vercel-Cache: HIT`，552KB 只要 0.025s。
2. 实例轮询 / OOM 重启：`health` 20/20 全快，`posts` 却 50% 慢，两者在同一容器里，无法用"打到了坏实例"解释。
3. 数据库索引与数据量：见 §9.3。
4. Token 预刷新 / 401 重试队列：`useApi.ts` 请求发出前的 `await` 数为 **0**。
5. Service Worker、前端节流定时器：均未注册；仅有的轮询在加载后立刻跑完，与"闲置几分钟"无关。

### 9.5 本次改动

| 文件 | 改动 | 预期收益 |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | `minPoolSize: 1`、`maxIdleTimeMS: 45_000`、`waitQueueTimeoutMS: 5000`；`serverSelectionTimeoutMS` 8000→3000；`retryDelay` 3000→500、`retryAttempts` 5→4 | **直击主因**：主动回收将被掐断的连接，并把重连等待从 6 秒级降到毫秒级 |
| `docker/vercel/entrypoint.mjs` | 子进程就绪后主动预热 `/api/health` 与 `/`（内部回环） | 缩短真实冷启动后首个请求的额外开销 |
| `apps/web/nuxt.config.ts` | Google Fonts 阻塞 stylesheet 改为 `media="print"` + `onload` 异步 | 移除首屏唯一一条第三方阻塞外链 |
| `apps/web/app/middleware/auth.ts` | `restore()` 一次会话只执行一次（缓存 Promise，已登录则跳过） | 消除每次进入受保护页面前的一次 `/auth/refresh` 往返 |
| `apps/web/app/stores/post.ts` | 发表/删除评论改乐观更新（占位 id 前缀 `pending:`，失败回滚） | 把"点了没反应"变成"立刻有反馈" |
| `scripts/bench-vercel.mjs` | 新增零依赖量测脚本（`--series` / `--cold` / `--headers`） | 让后续每次改动都有可对比的数字 |

### 9.6 评估后**放弃**的改动（理由留档，避免重犯）

1. **给 `/_nuxt/**` 加 `routeRules` 长缓存** —— 实测 Nitro 已注入 `immutable` 且边缘已 HIT。盲目加配置只会引入不一致。
2. **AI 代码索引改懒加载** —— 索引仅 101 条，读盘解析只有几毫秒；而 `code-index.service.ts:119-134` 已论证"启动即加载"是为了可观测性（索引缺失时静默降级成"资料中没有提到"）。为几毫秒放弃该性质不划算。
3. **点赞链路 3 次往返降到 2 次**（去掉 `ensurePostExists`，改由 `incrementLikeCount` 返回 `null` 判定）—— **已实现后回退**。原因：`likes.service.spec.ts:79-84` 断言"帖子不存在时抛 404，**且不写任何数据**"。新写法先写后回滚，若进程在两者之间崩溃会留下孤儿记录。为跨区省 200ms 破坏这条安全属性不值得。

### 9.7 验收步骤（需重新部署后执行）

改动只在本机完成，**未经线上验证**（本机无 Vercel CLI、无 `.vercel` 目录，无法自动部署）。请按下列顺序验收：

```powershell
# 1) 部署：推送到 main（Vercel 已接 GitHub）或在面板 Redeploy

# 2) 冷启动
pnpm bench:vercel --cold --idle=300

# 3) 稳态与（最关键的）慢请求占比
pnpm bench:vercel --series=10

# 4) 静态资源缓存头
pnpm bench:vercel --headers
```

**验收标准**：

- [ ] `--series=10` 中 `/api/posts` 的慢请求(>3s) 占比从 **50% 降到 <10%**
- [ ] `/api/health` 中位数保持 ≤ 0.35s
- [ ] `/_nuxt/**` 仍是 `immutable` 且 `X-Vercel-Cache: HIT`
- [ ] 首页首屏不再被 `fonts.googleapis.com` 阻塞（Network 面板中该请求不再阻塞渲染）
- [ ] 发/删评论点击后**立即**出现变化（乐观更新生效）
- [ ] `pnpm --filter @studyplan/api test` 除 `daily-digest.service.spec.ts` 那条**日期硬编码**用例外全绿

### 9.8 遗留建议

若上一步验收后慢请求占比仍高，说明瓶颈是**平台层的容器回收频率**，那就不再是应用代码能解决的：

1. **Hobby 无法保活** —— 官方限制 cron 每天只能跑一次，"定时 ping"这条路是死的（已核实）。
2. **真正的解法是把应用放到亚洲常驻进程上**（§六 已建议的 Dokploy 方案）。注意数据库 Atlas 集群本就在 **asia**，应用若也放到亚洲（香港/新加坡/日本），本次发现的**跨区连接被掐断**这个主因会直接消失，同时冷启动也不复存在。
3. 在此之前，§9.5 的连接参数改动是成本最低、收益最确定的一步。

---

## 十、作品集化改造：SEO 基础 + CI + 自建可观测性（2026-09-15）

> 背景：对标 roadmap.sh 的差距分析之后，明确本项目定位为**作品集**（给雇主看「能从零做到上线」）。
> 由此确定优先级不是加功能，而是补齐「雇主一眼就能看出缺失」的四件事。
> 四项决策（均已确认）：SEO 只做最小可用档、CI 含 Docker 构建但不含 E2E、可观测性自建不接第三方、部署由用户执行。

### 10.1 先修掉的两个既存失败（不修它们 CI 就是红的）

| 问题 | 修法 | 为什么不那样修 |
| --- | --- | --- |
| `app/app.vue:51` TS2322（`groups.value[0]` 为 `\| undefined`） | 把初始导航分组抽成具名常量 `NAV_GROUP`，初始与重建两处共用 | 用 `!` 非空断言只是掩盖类型问题，初始分组真变空数组时运行时照样炸 |
| `daily-digest.service.spec.ts` 硬编码 `'2026-09-14'` | 新增 `todayKeyIn(zone)`，与既有 `currentHourIn()` 同一套思路，动态算出"今天" | 写死一个新日期只是把失败推迟到明天 —— 这正是本项目踩过的"没改代码测试却挂了" |

修后：后端 **128/128 通过**（原 127 通过 1 失败）；前端 typecheck **0 error**（原 1 error）。

### 10.2 本轮新增

| 文件 | 作用 |
| --- | --- |
| `apps/web/public/robots.txt` | 放行公开页、拦 `/api` 与 `/docs`、声明 sitemap（绝对 URL，规范要求） |
| `apps/web/public/og-cover.png` | 全站静态封面 1200x630（标准 OG 比例）。**刻意不做每篇动态生成** —— 容器内渲染中文要数 MB 字体，拖慢构建与冷启动 |
| `apps/web/server/routes/sitemap.xml.ts` | 动态 sitemap：3 个静态路由 + 帖子列表。取数走 `apiBaseInternal` 回环（不绕公网）、`pageSize` 用共享包的 `MAX_PAGE_SIZE`（后端调上限这里跟着变）、失败降级为只输出静态路由**且仍返回 200**（500 的 sitemap 会让搜索引擎降低抓取频率）、`Cache-Control: max-age=3600`。**不装 `@nuxtjs/sitemap`**：3+1 类 URL 自己写 30 行就够，少一个依赖少一层维护 |
| `apps/web/nuxt.config.ts` | `runtimeConfig.public.siteUrl`（默认 `http://localhost:3001`，Dockerfile 注入）+ 站点级 `og:site_name` / `og:type` / `twitter:card` |
| `apps/web/app/app.vue` | 站点级 canonical + 默认 OG。**canonical 用 `useRequestURL()`**（`useRoute()` 在服务端拿不到 origin），但**域名必须用 `siteUrl`** —— 容器内是明文 HTTP，从请求推协议会得到 `http://...`，权重会分给不存在的地址 |
| `apps/web/app/pages/posts/[id].vue` | 页面级 `useSeoMeta` 覆盖：title/description 取帖子标题与 AI 摘要。用 **getter** 而非现值（SSR 取数完成前 `post` 是 null，写死现值会把 null 烤进 HTML） |
| `Dockerfile.vercel` | `ARG/ENV NUXT_PUBLIC_SITE_URL`，沿用 `NUXT_PUBLIC_API_BASE` 的既有写法 |
| `apps/api/src/common/utils/with-timing.ts` | `AsyncLocalStorage` 分段计时。**失败模式是"直接透传"**：任何情况下都不改变业务行为 |
| `apps/api/src/common/middleware/timing.middleware.ts` | 唯一职责：为整条链路开启计时上下文 |
| `apps/api/src/common/interceptors/slow-request.interceptor.ts` | 总耗时 + 分级告警（>1s WARN / >3s ERROR）+ 分段输出。**只输出耗时数字，严禁打印请求体/响应体/Cookie/token** |
| `apps/api/src/main.ts` | 注册 TimingMiddleware；SlowRequestInterceptor 按 `RequestId → Slow → Transform` 顺序（前：要读 requestId；后：要覆盖完整业务耗时） |
| `apps/api/src/modules/posts/posts.service.ts` | `findAll` 的取数用 `withTiming('posts.findAll.db', …)` 包住 —— 这里就是实测热点 |
| `.github/workflows/ci.yml` | job `quality`（install → build:shared → lint → typecheck → api test）+ job `docker`（构建 `Dockerfile.vercel`，不推送、**零 secret**）。**刻意不在 CI 跑 E2E**：要真实 MongoDB，慢且脆，偶发失败会让人养成"红了就重跑"的习惯 |
| `apps/web/e2e/seo.spec.ts` | 4 条 SEO 断言：canonical 绝对 URL 且指向自身、OG 齐全、robots.txt 声明 sitemap、sitemap 200 且 `<loc>` 为绝对地址、详情页 og:title 被页面覆盖而非落到站点默认值 |

### 10.3 本地验证结果（2026-09-15 实测）

| 检查 | 结果 |
| --- | --- |
| `pnpm run lint` | **0 error**，5 warning（全部为既存：v-html×2、未用变量×2、any×1，均在未改动或仅追加的文件里） |
| `pnpm run typecheck` | **shared / api / web 三包全部 Done，exit=0** |
| `pnpm --filter @studyplan/api test` | **10 suites / 128 tests 全部通过** |
| `pnpm --filter @studyplan/web build` | **exit=0**；产物含 `.output/server/chunks/routes/sitemap.xml.mjs` —— 证明新增服务端路由已注册，且 `@studyplan/shared` 在 Nitro 服务端上下文可正常导入（若导入失败，构建会直接报错） |
| 实跑构建产物（`node .output/server/index.mjs`） | `/robots.txt` → **200**；`/sitemap.xml` → **200** 且 `content-type: application/xml`，输出 3 条绝对 URL，**降级路径生效**（后端完全不可用时仍返回 200 而非 500）；对照 `/__definitely_missing__.txt` → **404**，证明该 200 来自真实注册的路由而非兜底 |

### 10.4 ⚠️ 尚未验证的项（不要默认它们是好的）

1. **E2E 未执行** —— `seo.spec.ts` 已写好、lint 通过，但没有真正跑过，原因是**本地环境连不上数据库**：
   ```
   MongoServerError: bad auth : authentication failed (code 8000, AtlasError)
   ```
   本地 `apps/api/.env` 里的 `MONGODB_URI` 凭据已被服务端拒绝。**这是既存的环境问题，与本次改动无关** —— 认证失败发生在 SCRAM 握手阶段，连接池与超时参数不可能导致它。它也与 §七 挂账的「轮换 `genshin1210_db_user` 密码」事项吻合。
   连带影响：没有数据库时任何 SSR 渲染（连 404 页）都返回 500，因此本地连"只跑 SEO 断言"也做不到。
   **修法**：更新 `apps/api/.env` 的 `MONGODB_URI`（用 Atlas 控制台当前的凭据），或直接按 §10.5 在**部署后**跑 —— 后者更省事，也是本项目此前验证 E2E 的既有做法。
2. **Docker 构建未在本机执行** —— 本机未验证 `docker build -f Dockerfile.vercel .` 能过；这一步由 CI 的 `docker` job 首次验证。如果它红了，最可能的原因是构建期新增了依赖或 ARG 未传。
3. **以下全部依赖部署**，本机无法验证：sitemap/canonical/OG 的线上表现、慢请求日志的实际输出、§9.5 延迟修复的效果。

### 10.5 必须由用户执行的线上验收（按顺序）

```powershell
# ① 部署：推送 main（Vercel 已接 GitHub），或在面板 Redeploy

# ② 延迟验收（上一轮遗留，判定线最重要）
pnpm bench:vercel --series=10
#    判定线：/api/posts 慢请求(>3s) 占比 <10%（改动前 50%）
#            /api/health 中位数 ≤ 0.35s

# ③ SEO 验收
curl -s -o NUL -w "sitemap %{http_code} %{content_type}`n" https://studyplan-teal.vercel.app/sitemap.xml
curl -s -o NUL -w "robots %{http_code}`n" https://studyplan-teal.vercel.app/robots.txt
curl -s https://studyplan-teal.vercel.app/ | Select-String -Pattern 'rel="canonical"|og:image'
#    判定线：sitemap 200 且 content-type 含 xml；首页源码含绝对地址 canonical 与 og:image

# ④ E2E（SEO 断言 + 既有 6 条）
$env:E2E_BASE_URL = 'https://studyplan-teal.vercel.app'
pnpm --filter @studyplan/web e2e
#    判定线：10 条用例（6 既有 + 4 新增）全部通过

# ⑤ 慢请求日志
#    Vercel 面板 → 该次部署 → Runtime Logs，筛 "SlowRequest"
#    判定线：能看到形如 "GET /api/posts?... 200 1234ms segments=[posts.findAll.db:1100ms]" 的行
#            —— 这一行出现，"6.6 秒到底花在哪"就不再是猜测
```

### 10.6 部署后验收：结果与发现的缺陷（2026-09-15）

提交 `c9cf05f` 推送到 main、Vercel 构建完成后（约 3 分钟）立即做了线上验收：

| 检查项 | 线上结果 |
| --- | --- |
| `/robots.txt` | **200** |
| `/sitemap.xml` | **200**，`content-type: application/xml`，`<loc>` 为 `https://studyplan-teal.vercel.app/...` |
| `NUXT_PUBLIC_SITE_URL` 注入 | **生效** —— 证明 `Dockerfile.vercel` 的 `ARG/ENV` 注入链路是通的 |

**发现一个缺陷**（已修复）：

- **现象**：sitemap 只有 3 条静态路由，一条帖子 URL 都没有，而 `/api/posts` 明明返回 `total: 2`。
- **根因**：后端 `TransformInterceptor` 会把所有成功响应包成 `{ statusCode, data, requestId, timestamp }`，而 sitemap 路由按裸的 `PostListResponse` 去读 `result.items` —— 拿到 `undefined`，`for...of` 抛 TypeError 掉进降级分支，于是产出**永远只有静态路由**。
- **为什么本地没发现**：本地数据库连不上（§10.4），一直在走降级路径，把它完全掩盖了。这正是「降级路径不能静默」最有力的论据。
- **修复**：改用共享契约类型 `ApiSuccessBody<PostListResponse>` 并读取 `.data`；同时把降级时的静默改为 `console.warn`。
- **补上的防线**：新增 E2E 用例「sitemap 收录的帖子数与接口返回的 total 一致」。原先那条 `test.skip(!matched, '没有帖子可验证')` 的善意跳过，恰好放过了这个 bug —— **能跳过的关键断言，等于没有断言。**

> ⚠️ 本轮修复**尚未推送**。本地无法重建验证：`pnpm --filter @studyplan/web build` 被环境的批量删除保护拦下
> （清理 `.output` 时 622 个文件超过 500 阈值）。Vercel 侧没有此限制，推送后即可验证。

### 10.7 如果验收不达标

- **慢请求占比仍 >10%** → 瓶颈是平台层的容器回收频率，应用代码已无杠杆。解法见 §9.8：迁到亚洲常驻进程（Atlas 本就在 asia，跨区连接被掐断这个主因会直接消失）。
- **sitemap 返回 500** → 说明降级路径没生效，优先查 `apiBaseInternal` 是否被环境变量覆盖成了外部地址。
- **canonical 是 `http://`** → 说明 `NUXT_PUBLIC_SITE_URL` 没进构建，检查 Dockerfile 的 ARG/ENV 是否被改动。
