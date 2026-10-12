# 独立嵌入服务 PoC 报告（website-framing-proxy）

> 日期：2026-10-12 · 状态：**可行（四项通过标准全部达成）** · 证据截图：`services/embed-proxy/poc-verify.png`

## 1. 背景与目标

用户决策：以「单容器并行独立服务」方式引入第三方嵌入代理（`willyogo/website-framing-proxy`，MIT），先做小规模可行性验证再铺开。本报告只覆盖 Phase-0 PoC：vendored fork + 最小补丁 + 本地实测，回答一个问题——**该服务（打补丁后）能否在本项目栈内独立渲染 roadmap.sh 交互式路线图**。

上游源码级调研发现的四个硬伤（详见决策记录）：
1. 端口硬编码 3000（与 Next 冲突）；
2. `/proxy/{domain}` 前缀路由会破坏 roadmap.sh 客户端 Router 的 pathname 匹配（必渲染官方 404 页）；
3. README 自测 CloudFront 前站被拦（roadmap.sh 正是 CloudFront）——**核心未知数**；
4. `url-rewriter.ts`（含天真的 JS 改写）经确认是死代码，实际改写由注入的客户端脚本完成。

## 2. 通过标准与逐项证据

| # | 通过标准 | 结果 | 证据 |
|---|---|---|---|
| 1 | 响应无 `X-Frame-Options` | ✅ | 冒烟：`/full-stack?embed=true` 等 4 个端点 `XFO=NONE` |
| 2 | 同构路由可达（`/full-stack`、`.data`、`.json`、`/assets/*`、`/fonts/*`、`/api/*`、`/manifest/*`） | ✅ | 冒烟全部 200；浏览器 KEY REQUESTS 全 200 |
| 3 | SVG 路线图真实渲染 | ✅ | SVG COUNT 44；截图可见 Full Stack 根节点/连线/HTML-CSS-JavaScript 节点/Checkpoint/AI Tutor |
| 4 | console 无 `Invalid URL` 崩溃 | ✅ | INVALID URL ERRORS: 0 |

关键网络记录（浏览器实测）：

```
200 /full-stack.data?embed=true                      （SPA 数据端点）
200 /full-stack.json                                 （路线图数据）
200 /api/v1-official-roadmap/full-stack              （官方 API）
200 /api/v1-get-resource-tracker-count?resourceId=full-stack   （追踪计数，「Join 87,269+」来源）
200 /api/v1-official-roadmap-questions/full-stack
200 /assets/*.js、/assets/*.css、/fonts/balsamiq.woff2
```

**CloudFront 未拦截**（核心未知数解除）：服务以浏览器 UA + 完整请求头直连 roadmap.sh 全部成功。

## 3. 补丁清单（fork 内，共 3 处 + 1 项取消）

| 补丁 | 文件 | 内容 |
|---|---|---|
| 1 PORT 环境变量 | `src/server/proxy-server.ts`（入口） | `Number(process.env['PORT']) \|\| 3000` |
| 2 同构路由模式 | `src/server/proxy-server.ts` | 新增 `ISOMORPHIC_SITES` 挂载表（`full-stack → https://roadmap.sh`）；注册 `/<slug>`、`/<slug>/*`、`/<slug>.data`、`/<slug>.json`；承接目录 `assets/fonts/api/manifest`；启发式 `/proxy/` 重定向中间件跳过同构路径；3xx 重定向保持根相对路径 |
| 2b 客户端脚本同构模式 | `src/injection/injection-middleware.ts` | `getClientProcessorScript({isomorphic,targetHost})`：同构模式下根相对 URL 保持不变、本站/目标站绝对 URL 还原为根相对路径；`fetch`/`XHR` 运行时拦截（替代静态正则，天然规避 `new URL` base 崩溃） |
| 3 ~~JS base 保护~~ | — | **取消**：`url-rewriter.ts` 为死代码（唯一使用者 content-processor 被注释）；运行时绝对 URL 由客户端 fetch 拦截解决，实测 0 崩溃 |

## 4. 与项目内引擎方案（lib/roadmap-proxy.ts）对比

| 维度 | 独立服务（PoC） | 项目内引擎（已上线） |
|---|---|---|
| roadmap.sh 渲染 | ✅ 等同（SVG 44、UI 完整） | ✅（SVG 43/44） |
| tracker-count 等 API | ✅ 200（「Join 87,269+」可见） | ⚠ CORS 失败（计数不显示） |
| 部署拓扑 | 需 supervisord 双形态改造 + Caddy/compose 第二条路由 | 零拓扑改动 |
| 新增站点 | 加一条 `ISOMORPHIC_SITES` 配置（SPA 站仍需按站调怪癖） | 加配置 + 薄路由 |
| 维护负担 | 多一个 fork 上游（42 commits、Phase 1/2、Node 20 目标、依赖表含可疑包 `crypto`/`url`/`querystring`、npm audit 有告警） | 自有代码 |
| 资源吞吐 | 全部经服务中转（本地回源） | 同类 |

结论：功能上**服务方案不劣于引擎方案**（API 计数甚至更好）；代价在部署拓扑与 fork 维护。

## 5. 铺开计划要点（验证通过后的后续计划，未执行）

1. **镜像**：`services/embed-proxy` 进构建上下文（`.dockerignore` 补 `services/embed-proxy/node_modules`、`dist` 按构建期产物处理或COPY 预构建）；runner 阶段装服务依赖或构建产物。
2. **space 形态**：`docker/space/supervisord.conf` 加 `[program:embed-proxy]`（`PORT=3100`、`priority` 介于 next 之前/后按依赖定、autorestart）。
3. **standalone 形态**：引入 supervisord（alpine `apk add supervisor`）或 entrypoint 双进程编排；注意信号转发与健康检查。
4. **网络拓扑**：compose 暴露 3100（或仅内网 + Caddy 反代 `embed.<domain>` → 容器 3100）；`app/roadmap/page.tsx` 的 iframe src 指向该地址（本地开发 `http://localhost:3100/full-stack?embed=true`）。
5. **回退触发条件**：若铺开中任一步受阻（如空间形态端口策略、Caddy 配置冲突），回退到项目内引擎方案（`lib/roadmap-proxy.ts` + 6 路由仍完整可用），删除 `services/` 与本 PoC 报告标记为「未铺开」。

## 6. 风险与局限（铺开时需携带）

- 第三方追踪/广告（blueconic、doubleclick、coursera 广告位）在 iframe 内仍会加载——注意隐私合规；
- 登录/个人进度不可用（不转发 Cookie）；
- `v1-pulse`（POST 埋点）在本版实测走 `/api/*` 承接可通，但属非关键；
- 上游若改版（其 Phase 2 子域名路由落地后）需重新评估补丁兼容性；
- npm audit 告警与可疑依赖包需在铺开前处置（锁版本 + 审计记录）。

## 7. PoC 产物与复现

```bash
cd services/embed-proxy
npm ci && npm run build
PORT=3100 node dist/server/proxy-server.js
# 浏览器打开 http://localhost:3100/full-stack?embed=true
```

补丁均在内含中文注释标注「PoC 补丁」，可 `git diff` 查看；upstream remote 保留便于日后合并。
