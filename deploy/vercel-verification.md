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
