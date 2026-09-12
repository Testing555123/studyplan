# Dokploy 部署手册

> 这份文档是**平台侧的操作步骤**。面板操作无法脚本化，所以按本手册一步步点即可。
> 仓库侧能自动化的部分（两个 Dockerfile、`.dockerignore`）已经在仓库里了。

---

## 0. 前置检查（不满足就不要往下走）

| 项 | 要求 |
| --- | --- |
| 内存 | **≥ 2GB**（官方明确：低于此规格构建时会冻结） |
| 磁盘 | ≥ 30GB |
| 系统 | Ubuntu 22.04 / 24.04（官方已测试） |
| 端口 | **80、443、3000 必须空闲**，否则安装直接失败 |
| 网络 | 需要公网 IP（用于 Atlas 白名单与域名解析） |

---

## 1. 安装 Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

安装完成后浏览器打开 `http://<服务器公网IP>:3000`，创建管理员账号。

**立刻做的安全设置**（面板 → Settings → Domains）：给面板绑一个域名并开启 HTTPS，
之后再执行下面这条命令关闭 IP:3000 直连（**务必先确认域名能访问，否则会把自己锁在外面**）：

```bash
docker service update --publish-rm "published=3000,target=3000,mode=host" dokploy
```

---

## 2. 连接 GitHub

Settings → Git → GitHub → 授权并选中 `studyplan` 仓库。

---

## 3. 创建应用一：后端 `studyplan-api`

| 配置项 | 取值 | 说明 |
| --- | --- | --- |
| Provider | GitHub | |
| Repository / Branch | studyplan / main | |
| Build Type | **Dockerfile** | |
| Dockerfile Path | `apps/api/Dockerfile` | |
| **Docker Context Path** | **`.`** | ❗必须。否则 COPY 不到 `packages/shared`，`workspace:*` 解析失败 |
| Watch Paths | `apps/api/**`、`packages/**` | 只在后端或共享契约变化时触发构建 |

**Environment（运行时变量）** —— 键名见 `deploy/env.keys.example`，必填四项：

```
MONGODB_URI          = mongodb+srv://<生产用户>:<密码>@<集群>/studyplan-prod?retryWrites=true&w=majority
JWT_ACCESS_SECRET    = 96 位十六进制（重新生成，不要复用开发机的）
JWT_REFRESH_SECRET   = 96 位十六进制（与上一个不同）
NODE_ENV             = production
CORS_ORIGIN          = https://你的域名
```

> 生成密钥：`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

---

## 4. 创建应用二：前端 `studyplan-web`

| 配置项 | 取值 |
| --- | --- |
| Build Type | **Dockerfile** |
| Dockerfile Path | `apps/web/Dockerfile` |
| **Docker Context Path** | **`.`** |
| Watch Paths | `apps/web/**`、`packages/**` |

**Advanced → Build Time Arguments（构建期，必填）**：

```
NUXT_PUBLIC_API_BASE = https://你的域名/api
```

> 它是构建期常量，Nuxt 会把它烘焙进客户端 bundle。
> 不填的话线上页面会全部请求 `localhost`，而本地完全看不出来 —— 这是本项目最容易踩的坑。
> Dockerfile 里加了断言：没传会直接构建失败并给出提示。

**Environment（运行时变量）**：

```
NUXT_PUBLIC_API_BASE = https://你的域名/api   ← SSR 服务端取数同样需要
NODE_ENV             = production
HOST                 = 0.0.0.0
PORT                 = 3000
```

---

## 5. 域名与路由（单域名 + 路径前缀）

两个应用共用一个域名，靠路径区分：

| 应用 | Domain 配置 | Path |
| --- | --- | --- |
| `studyplan-api` | `https://你的域名` | **`/api`** |
| `studyplan-web` | `https://你的域名` | **`/`** |

证书选 **Let's Encrypt**（Traefik 自动签发与续期）。

同域保证 Cookie 同源，因此 `COOKIE_SAME_SITE=lax` 即可工作 ——
这也是当初选择"单域名拓扑"的原因：换成两个域名就要处理第三方 Cookie，
在 Safari/iOS 上登录态可能失效。

---

## 6. 保护 `/docs`（Swagger 无鉴权）

Swagger 本身没有鉴权，用 Traefik 的 basicauth 中间件补上（在 Dokploy 的 Advanced / 自定义 Traefik 配置里加）。

生成口令哈希（**用哈希，不要写明文**）：

```bash
# 输出类似：studyplan:$apr1$xxxxxxxx$yyyyyyyy
htpasswd -nb studyplan '你的口令'
```

配置要点：中间件作用在 `PathPrefix('/docs')` 与 `/docs-json`、`/docs-yaml` 上。

---

## 7. 健康检查与日志

- 健康检查端点：`/api/health`
- 它是 Terminus 实现：数据库正常返回 200，**断连返回 503**（可被平台用于摘流）
- 日志：Dokploy 面板可直接查看容器日志；后端每条访问日志都带 `requestId`，
  形如 `[HTTP] GET /api/posts 200 91ms rid=a5bc9e59-...`，与响应头 `X-Request-Id` 一致

---

## 8. 数据库白名单（别漏）

Atlas → Network Access，只保留两条：

1. **服务器公网 IP**（Dokploy 所在机器）
2. **你的开发机 IP**

把 `0.0.0.0/0` 删掉。

---

## 9. 首次部署后的验收顺序

```bash
# 1) 健康检查
curl -i https://你的域名/api/health          # 期望 200 且 mongodb: up

# 2) 列表接口（应被统一响应包装）
curl -s https://你的域名/api/posts | head -c 200
# 期望：{"statusCode":200,"data":{"items":[...],"total":...},"requestId":"...","timestamp":"..."}

# 3) SSR 首屏（应含真实帖子标题，而不是空壳 HTML）
curl -s https://你的域名/ | grep -o 'AI 修复验证' | head -1

# 4) 端到端全链路（会往生产库写数据，跑完按需恢复基线）
E2E_BASE_URL=https://你的域名 pnpm --filter @studyplan/web e2e
```

---

## 10. 回滚与备份

- **回滚**：Dokploy 内置 Rollbacks，在应用页面选择上一个成功版本即可
- **备份**（Atlas M0 没有平台级快照，必须自建）：

```bash
MONGODB_URI='...' bash deploy/backup.sh baseline    # 部署前的干净基线
MONGODB_URI='...' bash deploy/backup.sh             # 按日期归档，保留 7 天
MONGODB_URI='...' bash deploy/restore.sh baseline   # 需要时恢复
```

建议用 Dokploy 的 **Schedule** 或宿主 cron 每天跑一次归档备份。
