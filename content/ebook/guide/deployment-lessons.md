# 部署经验：上线时踩过的十个坑

> 这一页解决一个很具体的问题：**本地明明跑得好好的，推上线上却各种不对——那些问题长什么样、为什么本地复现不出来、怎么修。**
>
> 每个问题按「现象 → 为什么 → 怎么修 → 如何预防」四段写。末尾是一份可以直接对照勾选的上线前检查清单。
>
> 本文提炼了可复用的部分；完整的原始实测数据（镜像 digest、请求耗时、逐条日志、平台踩坑、性能基线）见文末「附录：Vercel 验证性部署原始记录」。

---

## 一、一句话总原则

```text
本地是"进程一直活着"的世界，线上是"实例随时生灭"的世界。
所有只在线上出现的问题，几乎都源于这一个差别。
```

就这一条。下面十个坑，回头看全都挂在它上面。

---

## 二、先记住三条平台级规律

这三条不是某个平台的怪癖，而是"容器化托管"的通用约束。**先接受它们，后面的问题就不用一个个重新理解。**

| 规律 | 具体含义 | 不接受的后果 |
| --- | --- | --- |
| **容器要自己提供 HTTP 服务，并监听平台给的端口** | 平台把请求转发到容器里由 `PORT` 环境变量指定的端口（默认 80） | 写死监听的端口，平台连不上，报"容器未在启动超时内接受 TCP 连接" |
| **平台上的环境变量会覆盖镜像里的值** | 镜像里 `ENV NODE_ENV=production` 是对的，但如果你在平台上又设了一个脏值，脏值赢 | 把本来正确的配置覆盖坏，且本地完全看不出问题 |
| **实例会缩容到零，也会横向扩多个** | 无流量若干分钟后实例被回收；流量上来又开新实例 | 依赖"进程一直活着"的假设（内存态缓存、内存态限流、启动时初始化）全部失效 |

---

## 三、十个坑的复盘

### 坑 1：平台没认出我的容器入口文件

**现象**

我在仓库根放了 `Dockerfile.vercel`（官方文档说会被自动检测），部署却走了普通前端构建：

```text
Detected `pnpm-lock.yaml` ... Installing dependencies...
Scope: all 5 workspace projects
...
Error: No Output Directory named "public" found after the Build completed.
```

日志里**没有任何 Docker 构建步骤**，而且依赖缓存路径是平台自己的（`/vercel/path0/.pnpm-store`），不是我 Dockerfile 里设的。

**为什么**

"自动检测容器入口文件"这件事在实践里并不可靠，官方文档也没写清楚触发条件。Vercel 社区有同题帖（标题就是《Dockerfile.vercel is not detected》），结论是：**必须显式声明**。

**怎么修**

在仓库根加 `vercel.json`，用 `services` 把容器服务声明出来，并把公开路由指向它：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "studyplan": {
      "root": ".",
      "entrypoint": "Dockerfile.vercel",
      "runtime": "container"
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": { "service": "studyplan" } }
  ]
}
```

两个容易忽略的点：

- **`rewrites` 不能省**。服务默认是"内部的"，不写这条就没有任何公网流量。社区帖的原话是："构建出容器函数本身不够，公开路由也必须显式指向该 service。"
- **`vercel.json` 做严格校验，不接受注释**。写 `//` 说明会直接报 `should NOT have additional property '//'`。

**如何预防**

判断"到底走没走容器路径"有个可靠信号：**看依赖缓存的路径**。走容器时是 Dockerfile 里设置的路径（本项目是 `/pnpm/store`）；走普通构建时是平台自己的路径（`/vercel/path0/...`）。

**别拿文档当承诺。** 文档说"会自动检测"，你就该在第一次部署时用日志确认它真的发生了。

---

### 坑 2：容器起来了却立刻 502，日志只说"启动超时"

**现象**

平台报：

```text
Error: could not connect to $PORT=80. Vercel forwards requests to the port defined by
the `PORT` environment variable, but your server did not accept TCP connections on that
port within the startup timeout (28.64420488s). Detected ports your server listened on: 3001.
```

这句话看起来像"端口配错了"。但真实原因在**更下游**：后端进程启动时因为环境变量校验失败直接退出了。

**为什么**

我把入口脚本写成了"**等两个子进程都就绪，再 `server.listen`**"。后端一崩，就永远等不到就绪，`$PORT` 也就永远不开——平台的启动超时先到，于是抛出上面那条错误。

**真正的报错被这条超时错误盖住了**，而"检测到你监听了 3001"这个提示又会把人往"端口问题"上带。

**怎么修**

顺序倒过来：**先 listen，再异步探测就绪**。

```js
// 先监听：无论子进程成败，平台都能连上容器，日志与请求都能说话
server.listen(PORT, '0.0.0.0')

// 再异步探测，只用于日志提示，不阻塞对外服务
void (async () => {
  const apiReady = await waitForPort(API_PORT)
  if (!apiReady) console.error('[entrypoint] 后端未就绪，/api 请求会得到 502')
})()
```

改完之后，同一个场景下的日志直接给出了根因：`NODE_ENV must be one of the following values: development, production, test`。

**如何预防**

> **"先让平台能连上我，再谈我内部准备得怎么样。"**

#### 实现方法

本项目入口脚本改成先 `server.listen(PORT, '0.0.0.0')`，再异步探测子进程就绪只用于日志提示，不阻塞对外服务。这样无论子进程成败，平台都能连上容器。

#### 原理

监听端口是"对外承诺"，子进程就绪是"内部状态"。把承诺押在内部状态上，一旦子进程崩溃，端口永远不开，平台的启动超时先到，真正的报错被超时错误盖住。先 listen 再探测，把平台的唯一观测手段（能否连上端口）保住。

#### 与相关技术栈的关系

和有启动超时的容器平台（Vercel、Cloud Run、K8s）都适用：探针要能在超时前拿到连接。和"等依赖全就绪再 listen"的传统写法相比，这种"先暴露再准备"更抗局部失败。和 K8s 的 readinessProbe 同理：就绪与否与生死是两件事。

#### 面试常见问题与解题思路

**Q1：为什么先 listen 再准备，而不是等准备好了再 listen？**
怎么想：从"观测窗口"切入。怎么答：先 listen 平台才能连上、日志才能说话，否则真实报错被启动超时盖住。追问：readiness 和 liveness 探针为什么要分开？

**Q2：容器启动超时报错看不出真因怎么办？**
怎么想：从"错误掩盖"切入。怎么答：先确保端口能开，把子进程错误留在自己的日志里单独看。追问：怎么设计入口脚本让根因不丢？

监听端口是"对外承诺"，子进程就绪是"内部状态"。把承诺押在内部状态上，你就把平台唯一的观测手段（能不能连上端口）也一起赌掉了。任何有启动超时的环境都适用这一条。

---

### 坑 3：冷启动窗口里，第一个访客看到"上游服务暂时不可用"

**现象**

线上端到端测试的第一条用例，整页内容只有一行字：**「上游服务暂时不可用」**——那是我自己写在入口脚本里的 502 兜底文案。

**为什么**

平台是**缩容到零**的：无流量几分钟后实例被回收，下一个访客打在**全新实例**上，而容器里两个子进程还要 2–5 秒才监听端口。

第一版入口脚本在这个窗口里直接回 502。本地永远复现不到——本地的进程一直活着。

**怎么修**

给"请求路径"加一层**等待**，而不是立刻失败：

```js
const readyPorts = new Set()

async function waitUntilReady(port, timeoutMs = 20_000) {
  if (readyPorts.has(port)) return true          // 已就绪过，零等待
  const ok = await waitForPort(port, timeoutMs)
  if (ok) readyPorts.add(port)
  return ok
}

// 请求处理里：等一下，而不是打回 502
if (!(await waitUntilReady(targetPort))) {
  res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('上游服务暂时不可用')
  return
}
```

本地复现验证：容器启动 **1.5 秒**后立刻发请求 → 返回 `200`、总耗时 2.05 秒（旧实现会返回 502）。实测冷启动到首个成功响应约 **4.5 秒**。

**如何预防**

区分两种"还没准备好"：

| 情况 | 正确反应 |
| --- | --- |
| 启动中（几秒内会好） | **等一下** |
| 真的坏了（等也没用） | 快速失败 + 留下可诊断的日志 |

把两者都当第二种处理，就会让"每天第一个访客"这类问题永远存在——而且它**最难被自己发现**，因为你刷新一下就好了。

#### 实现方法

本项目在请求处理里加 `waitUntilReady(port)`：未就绪时等待（最多 20 秒），就绪过则零等待；超时仍未就绪才回 502，并留下可诊断日志。

#### 原理

平台缩容到零，新实例子进程要几秒才监听端口。这个窗口里如果立刻失败，每天第一个访客就会看到"上游不可用"，且自己刷新一下就好了，最难被发现。区分"启动中（几秒内会好）"和"真的坏了"两种状态：前者等一下，后者快速失败。

#### 与相关技术栈的关系

和"启动即阻塞等待依赖"相比，按请求懒等待更友好，避免启动期长时间卡住触发平台超时。和无服务器（Lambda、Cloud Functions）的冷启动同理：首次调用慢，需优雅等待而非硬失败。和预热（warm-up）机制互补。

#### 面试常见问题与解题思路

**Q1：冷启动导致首访失败怎么处理？**
怎么想：从"区分两种未就绪"切入。怎么答：启动中则等待，真坏了才快速失败。追问：为什么不能统一直接失败？

**Q2：为什么这类问题最难被自己发现？**
怎么想：从"可复现性"切入。怎么答：本地进程一直活着无冷启动，且刷新即好，问题不暴露。追问：怎么在本地复现冷启动？

---

### 坑 4：连接串是错的，报错却是 `MongoParseError: Invalid scheme`

**现象**

容器日志里数据库连接反复重试失败：

```text
MongoParseError: Invalid scheme, expected connection string to start with
"mongodb://" or "mongodb+srv://"
```

本地 `apps/api/.env` 里那串明明是对的。

**为什么**

我用 PowerShell 管道把值写进平台的环境变量：

```powershell
# ❌ 错误写法：管道会把换行/多余字符一起写进去
$value | vercel env add MONGODB_URI production
```

平台存下的值前缀被污染了（多出换行或多余字符），于是"看起来像连接串，但开头不对"。同一个原因还让 `NODE_ENV` 校验失败。

**怎么修**

把值写进文件（**不要结尾换行**），再用输入重定向：

```powershell
[System.IO.File]::WriteAllText("$env:TEMP\v1.txt", $prodUri)
cmd /c "vercel env add MONGODB_URI production < `"$env:TEMP\v1.txt`""
```

**核对方式**：用 `--type config` 存的值可以拉回来逐字校对。

```bash
# 注意：默认拉的是 development 环境，要显式指定 production
vercel env pull .env.check --environment=production --yes
```

本项目用一个 87 字符、含 `?` 与 `&` 的探针值验证过：该写法逐字节精确。

**如何预防**

- **需要长期核对的配置用 config 类型，只有真正的密钥才用 secret 类型**（secret 类型的值无法被 pull 回来，写错了你也看不见）。
- **镜像里已经设对的值，不要在平台上再设一遍**。`NODE_ENV` 就是典型：Dockerfile 里 `ENV NODE_ENV=production` 是对的，平台上的脏值把它覆盖坏了——这是本坑最反直觉的部分。
- 换任何平台都一样：**用管道给 CLI 喂值，先怀疑换行。**

---

### 坑 5：monorepo 容器化，构建上下文必须是仓库根

**现象**

构建时 `COPY` 不到共享包，或者平台的服务配置里根本找不到地方指定"用哪个目录当构建上下文"。

**为什么**

`apps/api` 和 `apps/web` 都通过 `workspace:*` 依赖 `packages/shared`。Docker 有一条硬规则：**不能 COPY 构建上下文之外的文件**。所以上下文如果设成 `apps/api`，就永远拿不到 `packages/`。

而平台的 `services` 模型用 `root` 把每个服务限定在子目录，**官方文档没有提供 `context` 字段**。

**怎么修**

放弃"前后端两个服务"，改成**仓库根单容器**：一个 Dockerfile 同时构建前后端，容器内跑两个进程，由一个零依赖入口按路径分流。

```text
/app
├── apps/api/dist           后端产物
├── apps/web/.output        前端 SSR 产物
├── packages/shared/dist    共享契约产物
└── entrypoint.mjs          入口：/api 与 /docs → 3000，其余 → 3001
```

**顺带拿到两个红利**（这是"被迫选择"带来的意外收益）：

| 红利 | 说明 |
| --- | --- |
| **Cookie 天然同源** | 浏览器只看到一个域名，`SameSite=Lax` + `Secure` 直接可用，不需要任何跨站配置 |
| **接口地址可用相对路径** | `NUXT_PUBLIC_API_BASE=/api`，不带域名，于是**换域名不用重新构建前端** |

第二条尤其值钱：`NUXT_PUBLIC_API_BASE` 是**构建期常量**（会被烘焙进客户端 bundle），一旦写成完整域名，每次换域名都要重新构建。

代价是：服务端的 `$fetch` **不接受相对路径**，所以要给 SSR 单独一个容器内回环地址（本项目是 `NUXT_API_BASE_INTERNAL`，默认 `http://127.0.0.1:3000/api`）。

**如何预防**

> 一个 monorepo 只要内部有 `workspace:*` 依赖，**它的容器构建上下文就只能是仓库根。**

#### 实现方法

本项目放弃"前后端两个服务"，改成仓库根单容器：一个 Dockerfile 同时构建前后端，容器内跑两个进程，由零依赖入口按路径分流（`/api`、`/docs` → 3000，其余 → 3001）。

#### 原理

Docker 不能 COPY 构建上下文之外的文件，所以上下文若设成 `apps/api` 就拿不到 `packages/`。而平台 `services` 模型用 `root` 限定子目录、且官方无 `context` 字段。因此含 `workspace:*` 依赖的 monorepo，构建上下文只能是仓库根。

#### 与相关技术栈的关系

和"每服务一个 Dockerfile、各自构建"相比，单容器多进程更简单但牺牲独立扩缩。和 Docker BuildKit 的 `context` 指定、或构建插件相比，平台若不支持只能退而求其次。附带红利：同源 Cookie、接口用相对路径（换域名免重建）。

#### 面试常见问题与解题思路

**Q1：monorepo 容器化为什么构建上下文必须是仓库根？**
怎么想：从"COPY 范围"切入。怎么答：Docker 不能 COPY 上下文外文件，子目录上下文拿不到 packages/。追问：平台不支持 context 字段怎么办？

**Q2：单容器多进程 vs 每服务一容器，怎么选？**
怎么想：从"部署形态限制"切入。怎么答：平台不支持多服务或 context 时，单容器多进程是务实解，代价是失去独立扩缩。追问：同源带来的两个红利是什么？

把这个约束写在 Dockerfile 的头注释里（本项目就是这么做的），否则半年后你自己都会忘。

---

### 坑 6：共享包没有运行时依赖，`COPY` 它反而让构建失败

**现象**

```text
ERROR: failed to calculate checksum: "/app/packages/shared/node_modules": not found
```

**为什么**

`packages/shared` 是纯类型 + 常量的包，**运行时零依赖**（只有一个 devDependency：`typescript`）。因此 `pnpm install --prod` **根本不会为它创建 `node_modules` 目录**。

而我在两个 Dockerfile 里都写了：

```dockerfile
# ❌ 目录不存在，COPY 必然失败
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
```

**怎么修**

删掉那一行，并写上注释说明"这不是漏写"：

```dockerfile
# shared 运行时零依赖，prod 安装不会生成它的 node_modules
# 它运行时只需要 dist 与 package.json
```

**如何预防**

这个坑的价值在于它**同时出现在两个地方**：新写的平台 Dockerfile 和为另一条部署路径准备的 Dockerfile。**同一个错误假设会被复制到多处**，所以修的时候要全仓搜一遍同样的写法，而不是只修报错的那一处。

另一个可推广的判断：**`COPY` 一个"可能不存在"的路径，就是在赌安装策略的细节**。赌输的代价是构建失败——而构建失败还算好的，至少它立刻告诉你。

---

### 坑 7：平台没有固定出口 IP，数据库白名单只能全放

**现象**

想给数据库配一条精确的 IP 白名单（只放行服务器 IP），却发现做不到。官方文档明确写着：**静态 IP / 私有网络连接目前不支持自定义容器镜像。**

**为什么**

容器实例的出口 IP 是平台动态分配的，你无法预知，也无法固定。于是要么放行 `0.0.0.0/0`（全放），要么换部署形态。

**怎么修**

接受这个取舍，但**把它显式记录成一条安全决策**，并配套降低风险：

| 措施 | 作用 |
| --- | --- |
| 为它单独建一个**最小权限用户**（只读写目标库） | 万一泄露，损失面被限制在一个库 |
| 验证期结束立刻回收白名单与专用用户 | 把暴露窗口压到最短 |
| 记录"白名单被迫放开"这个事实 | 否则半年后你只会看到一条全放规则，不知道为什么 |

**如何预防**

**凭据安全不能只靠"白名单"这一层。** 本项目此前发生过一次凭据外泄（示例文件里误填了真实连接串），实测结论很扎心：**那条泄露过的旧密码，在事发多日后仍然能连上数据库。**

于是"精确白名单"就成了最后一层防线——而容器化平台恰好把这一层拿掉了。这两件事叠加，才是真正的风险。

> 判断一条安全措施值不值得依赖，要问：**它在所有部署形态下都成立吗？** 不成立的那部分，必须用别的手段补上。

#### 实现方法

本项目接受"数据库白名单被迫全放"的取舍，但把它显式记录成安全决策，并配套最小权限用户（只读写目标库）、验证结束立刻回收白名单与专用用户。

#### 原理

容器实例出口 IP 动态分配、无法固定，精确白名单做不了，只能放行 0.0.0.0/0。一旦凭据外泄，没有白名单这层兜底，风险被放大。所以凭据安全不能只靠白名单，还要轮换、最小权限、记录决策。

#### 与相关技术栈的关系

和"固定出口 IP 加精确白名单"的经典部署相比，容器化平台拿掉了这层，逼你用别的手段（最小权限用户、密钥轮换、网络策略）补。和 Vault、云密钥管理相比，本项目只用平台环境变量，需靠纪律补位。

#### 面试常见问题与解题思路

**Q1：平台无固定出口 IP，数据库白名单怎么办？**
怎么想：从"取舍"切入。怎么答：接受全放但配最小权限用户、用完即回收，并记录决策。追问：只靠白名单够吗？

**Q2：凭据外泄后最该先做哪一步？**
怎么想：从"泄漏不可逆"切入。怎么答：立刻轮换密钥（删历史不能撤销泄漏），再清历史、查影响面。追问：为什么删除 git 历史不能撤销泄漏？

---

### 坑 8：免费数据库没有自动快照

**现象**

准备跑"会往生产库写真实数据"的端到端测试，想先备份一下，才发现没有可用的快照。

**为什么**

云数据库的自动备份通常是**付费档位的能力**（以 Atlas 为例，Cloud Backup 需要 M10 及以上；免费档 M0 没有）。而这个项目恰好又是"没有管理后台、删数据只能直接连库"的设计。

**怎么修**

自己写一个最小可用的快照脚本（本项目是 `deploy/snapshot.mjs`），**用项目已有的依赖**，不引入新工具：

```bash
cd apps/api
node --env-file=.env ../../deploy/snapshot.mjs dump    studyplan-prod ./baseline
node --env-file=.env ../../deploy/snapshot.mjs restore studyplan-prod ./baseline
```

几个实现要点：

- **索引也要一起存**。只导出数据、不导出索引，恢复出来的库会缺少唯一约束——而唯一约束恰恰是数据正确性的一部分。
- **`_id` 索引不要重复创建**（内置的，重复建会报错）。
- 快照目录**必须被 .gitignore 忽略**：里面有真实用户数据（含密码哈希）。

**如何预防**

> **任何"会写生产数据"的动作之前，先问一句：如果写脏了，我怎么回来？**

如果答案是"不知道"，那就先别执行。这个顺序不能反——备份是**执行前的动作**，不是出事后的补救。

---

### 坑 9：多实例下，内存限流等于没限

**现象**

后端接了基于内存的限流（`@nestjs/throttler` 默认存储），本地测试有效，但线上无法确定它是真的在起作用。

**为什么**

平台按流量自动扩缩，**每个实例各有一份内存计数**。攻击者打到 5 个实例上，每个实例都认为"这个 IP 只请求了几次"。

**怎么修**

本次的处理是**如实记录为已知限制**，而不是假装它有效：

```text
限流当前只能提供"单实例内"的保护，多实例环境下计数不共享。
若需要真正的全局限流，应把计数器移到外部存储（Redis 等）。
```

**如何预防**

判断一个机制是否"与部署形态耦合"，问它**依赖什么状态存在**：

| 机制 | 依赖 | 在"实例随时生灭"的环境里 |
| --- | --- | --- |
| 内存态限流 / 内存态缓存 | 进程内存 | ❌ 失效 |
| 数据库 / 外部存储里的状态 | 外部服务 | ✅ 成立 |
| 签名凭证（JWT） | 密钥 | ✅ 成立 |

**能自证失效的限制，比假装有效的限制更安全**——至少你不会因为"以为有保护"而放松别的地方。

#### 实现方法

本项目如实把限流标记为"仅单实例内有效"，并说明多实例需把计数器移到 Redis 等外部存储，而不是假装它有效。

#### 原理

平台按流量自动扩缩，每个实例各有一份内存计数。攻击者打多个实例，每个都以为"这个 IP 只请求几次"，全局限流形同虚设。依赖"进程内存状态"的机制，在实例随时生灭的环境里都失效。

#### 与相关技术栈的关系

和集中式限流（Redis、令牌桶服务）相比，内存限流零依赖但只适用于单实例。和数据库连接池、本地缓存一样，凡是"状态在进程内存"的，多实例下都要外移。能自证失效的限制比假装有效更安全。

#### 面试常见问题与解题思路

**Q1：内存限流在多实例下为什么失效？**
怎么想：从"计数不共享"切入。怎么答：每实例各算各的，攻击分散到多实例就绕过。追问：怎么改成全局限流？

**Q2：哪些机制会受"实例生灭"影响？**
怎么想：从"状态存在哪"切入。怎么答：内存缓存、内存限流、启动时初始化、常驻连接都会失效；数据库、外部存储、JWT 这类不受影响。追问：怎么判断一个机制是否与部署形态耦合？

---

### 坑 10：构建工具悄悄依赖了容器里没有的东西

**现象**

镜像构建到电子书那一步直接失败，而**同样的命令在本地跑得好好的**：

```text
[vitepress] spawn git ENOENT
file: /app/apps/docs/exercises/stage-1.md
```

**为什么**

电子书配置里有 `lastUpdated: true` —— VitePress 会**调用 git** 去读每个文件的提交时间，
用来显示「最后更新于」。而容器里既没有 `git` 命令，也没有 `.git` 目录
（`.dockerignore` 有意排除了它，否则构建上下文要膨胀到几百 MB）。

**怎么修**

不要"让人记得在构建时传一个环境变量把功能关掉" —— 那种约定忘一次就构建失败。
改成**让配置自己适应环境**：

```ts
const hasGit = existsSync(resolve(process.cwd(), '../../.git'))
const lastUpdated =
  process.env.VITEPRESS_LAST_UPDATED === undefined
    ? hasGit // 有 .git 就启用（本地），没有就自动关（容器）
    : process.env.VITEPRESS_LAST_UPDATED === 'true' // 需要时仍可强制覆盖
```

**如何预防**

"本地能构建、容器里不能"的问题，有一个共同的检查动作：**把构建过程隐式依赖的东西列出来** ——
命令、目录、环境变量、网络、时区，然后逐个问"容器里有吗"。

本次答案是：有 `git` 吗？没有。有 `.git` 吗？也没有。

⚠️ 而且要看出这两个依赖是**与关系**：只补 `git` 没用（没有 `.git` 照样读不到提交时间），
只补 `.git` 也没用（没有 git 命令照样报 ENOENT）。
所以很多时候"**让功能可降级**"比"把依赖补齐"更划算 —— 前者一次修好，后者要一直维护。

---

### 坑 11：在平台改完环境变量，不会自动生效——必须重新部署，且把"配没配好"做成接口返回值

**现象**：AI 学习助手上线后显示「功能未启用：服务端尚未配置 NVNIM_API_KEY」，而其它功能（发帖、登录、列表）全部正常。

**真实原因不是代码，是平台的一个隐藏规则**：本项目用的 Vercel 容器（`vercel.json` 的 `services` + `runtime: "container"`）环境变量是**运行时注入**的——你写入后，**已经运行的实例不会自动拿到新值**。必须 `Deployments → 最新一条 → ⋯ → Redeploy`，新实例启动时才会把新变量注入进去。不点那一下，页面永远停留在旧的「未启用」状态。

**为什么它最容易被忽略**：改代码你会本能地重新部署；改一个环境变量，你往往以为"保存就生效"。而且它**不报错**——实例照常运行，只是读到的还是旧变量。这条特征在别处也反复出现：平台环境变量会覆盖镜像 `ENV`、CLI 写值带入换行会让后端以"校验失败"直接崩。

**怎么修（这次是配置动作，不是代码）**：

1. 面板 `Project → Settings → Environment Variables` 新增 `NVNIM_API_KEY`，Environment 勾 **Production**，Type 选 **Secret**；
2. 触发一次 **Redeploy**（环境变量不热生效）；
3. 打开线上站点 → 右下角 AI → 应显示"今日剩余 N"，并能提问。

**顺手做了一件让下次不用猜的事**：把"线上配好了没"做成接口返回值。
`GET /api/ai/status` 现在直接回答 `enabled`、`keyConfigured`、当前模型、代码索引是否加载、加载了多少个文件。部署者不用翻日志、不用读代码，一条命令自查：

```bash
curl https://你的域名/api/ai/status
# → {"enabled":true,"keyConfigured":true,"model":"openai/gpt-oss-20b",
#     "codeIndexLoaded":true,"codeIndexFiles":100,"remainingToday":300,"limitPerDay":300}
```

**为什么这条经验值得记**：

> 配置类的故障有个共同特征——**失败是静默的，且离成因很远**。
> 环境变量没进实例，表现是"某个功能没开"，根因却在"你忘了点 Redeploy"。
> 把这类状态**显式暴露成可查询的接口**，比在日志里翻、在文档里找都快，
> 而且它把"配没配好"从"看代码推断"变成"打一条命令就能确认"。

#### 实现方法

本项目改完平台环境变量后主动 Redeploy 让新实例注入新值；并把"线上配好了没"做成 `GET /api/ai/status` 返回值（`enabled`、`keyConfigured`、模型、索引文件数等），部署者一条命令自查。

#### 原理

容器服务的环境变量是运行时注入的，已运行的实例不会自动拿到新值，必须重新部署。这个失败是静默的：实例照常运行，只是读到旧变量，表现是"某功能没开"，根因却在"忘了点 Redeploy"。把状态暴露成可查询接口，把"配没配好"从推断变确认。

#### 与相关技术栈的关系

和"改配置热加载"（如 Nginx reload、Spring Cloud Config）相比，容器实例要重建才注入。和镜像内 `ENV` 相比，平台环境变量会覆盖镜像值，顺序反过来。把健康或配置状态做成自检接口，是通用的可观测性做法。

#### 面试常见问题与解题思路

**Q1：改了环境变量为什么没生效？**
怎么想：从"注入时机"切入。怎么答：容器环境变量运行时注入，已运行实例不热更新，需重新部署。追问：平台变量和镜像 ENV 谁优先？

**Q2：怎么让"配置对不对"可自查？**
怎么想：从"显式暴露"切入。怎么答：做成 `/status` 这类接口返回关键配置与依赖状态，避免翻日志猜。追问：还有哪些状态该暴露成接口？

---

## 四、上线前检查清单

下次发布前照着勾一遍。七组，每组都对应上面复盘过的坑。

### 密钥与凭据

- [ ] 生产密钥**全量重新生成**，绝不复用开发机那一份
- [ ] 曾经外泄过的凭据**立即轮换**（不是"建议"，因为它实测仍然可用）
- [ ] 平台上的环境变量用**可靠方式**写入（文件重定向，不用管道）
- [ ] 需要长期核对的配置存成可读类型，别用不可回读的密钥类型
- [ ] 镜像里已设正确默认值的变量（如 `NODE_ENV`），**不要**在平台上再设一遍

### 网络与访问控制

- [ ] 数据库白名单能精确就精确
- [ ] 若平台无固定出口 IP，**明确记录这个取舍**，并为它配最小权限用户
- [ ] 验证用的临时规则（全放行 / 临时用户）在验证结束后**立刻回收**

### 健康检查

- [ ] 健康检查能反映**真实依赖状态**（数据库断连应返回 503，而不是恒 200）
- [ ] 健康检查路径**排除**在统一响应包装之外（它是给机器看的，不是给业务用的)

### 数据与备份

- [ ] 确认平台/数据库是否自带快照；没有就**自己留基线**
- [ ] 任何写生产库的测试，**跑之前**先 dump
- [ ] 快照目录已被 `.gitignore` 忽略

### 文档与暴露面

- [ ] 接口文档（Swagger 等）默认无鉴权，生产要加口令或下线
- [ ] 部署说明里写清"两条路径"（当前用的 + 回退用的），别只写一条

### 验证

- [ ] 用**同一套端到端测试**打线上（本地通过不等于线上通过）
- [ ] 除了本机，再从一个**不同的网络环境**复核一次可达性
- [ ] 端到端测试里包含"整页刷新后仍保持登录"这类真实路径（它能验证 Cookie 语义）

### 构建与产物

- [ ] 构建过程**隐式依赖**的东西（命令、目录、环境变量、网络），容器里都有 —— 或者该功能可降级
- [ ] 构建期注入的变量在产物里**真实生效**：要检查产物内部的资源引用（例如路径前缀），
      而不是只看首页能否打开 —— 资源全部 404 时首页依然会返回 200
- [ ] 只搬产物、不搬源码：镜像里不应出现 `.ts` / `.vue` / `.env`

### 回滚

- [ ] 发布物可定位到具体版本（镜像 digest / tag），不要只用 `latest`
- [ ] 回滚动作被实际演练过至少一次，而不是"理论上可以"

---

## 五、这次经历最值得带走的三句话

1. **本地的"一直活着"和线上的"随时生灭"，是两种世界。** 几乎所有只在线上出现的问题都源于这个差别，遇到怪现象先往这儿想。
2. **日志证据优先于代码猜测。** 本次两个最费解的问题（真实报错被超时错误盖住、冷启动窗口的 502），都是读容器日志定出来的，不是靠改代码试出来的。
3. **能自证的限制，好过假装有效的保护。** 内存限流在多实例下失效、白名单被迫全放——把它们写清楚，比藏起来安全得多。

---

---

**下一步**：这些坑的"排查过程"本身也是可复用的，见下一篇 [调试经验](./debugging-lessons)。


## 附录：Vercel 验证性部署原始记录（原 deploy/vercel-verification.md）

## Vercel 验证性部署报告

> 目的：用最低成本回答三个此前无法从文档确定的未知，据此决定"省下服务器费用"还是"回到 Dokploy"。
> 结论先说：**三个标准全部通过（技术上可行），但由于 DNS 污染与网络阻断，它不能作为面向中国大陆用户的生产环境。**

### 一、最终状态

| 项 | 值 |
| --- | --- |
| 项目 | `studying5/studyplan`（Hobby 套餐，单区域默认美东 iad1） |
| 生产域名 | `https://studyplan-teal.vercel.app` |
| 本次部署 | `https://studyplan-15hrjrlgh-studying5.vercel.app` |
| 镜像 | `vcr.vercel.com/studying5/studyplan/studyplan@sha256:6346e937…`（本地同构镜像 352MB） |
| 构建耗时 | 约 3 分钟（`pnpm install` + `build:shared` + api build + web build + 推镜像） |
| 数据库 | Atlas M0 → `studyplan-prod`，专用用户 `verify-bot` |

### 二、三个验收标准的实测结果

#### ① 容器能否在 Vercel 构建并运行 —— **通过**

镜像由平台构建并推送到 VCR，容器内两个子进程（NestJS:3000、Nuxt SSR:3001）由零依赖入口脚本按路径分流。
入口日志：

```
[entrypoint] 已启动 api（pid=14）
[entrypoint] 已启动 web（pid=15）
[entrypoint] 监听 0.0.0.0:80｜/api、/docs → 3000｜其余 → 3001
```

#### ② 同域 Cookie 链路 —— **通过**

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

#### ③ Atlas 连接与冷启动 —— **通过**

- `GET /api/health` → `{"status":"ok","info":{"mongodb":{"status":"up"}},"error":{},"details":{"mongodb":{"status":"up"}}}`
- 业务接口实测：`GET /api/posts?page=1&pageSize=10&tag=Vue` → `200`，`198ms`（另一次 1666ms）
- 冷启动：容器启动到首个成功响应约 **4.5 秒**；启动窗口内的请求被入口脚本挡成可诊断的 502，而不是平台级的"容器未提供 HTTP 服务"

#### ④ 真实浏览器端到端（Playwright 直打线上）—— **通过（6/6）**

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

### 三、发现的阻断问题（决定成败的一项）

**从这台机器所在网络，`*.vercel.app` 不可达：**

```
studyplan-teal.vercel.app → 解析为 31.13.92.5（Meta 段）/ 205.251.x（AWS 段）… 每次不同
TCP 443 → 连接超时；对照 vercel.com → 200 / 0.96s
用已知边缘 IP 直连（--resolve）→ 0.1s 内被拒
```

即：**DNS 被污染，且到边缘节点的路径本身被阻断**。而浏览器能打开（浏览器自带 DoH 解析），命令行不能。

本报告的全部线上验证均通过本机 Clash 代理（`127.0.0.1:7897`）完成。

### 四、平台侧踩坑记录（官方文档未写明，均为实测所得）

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

### 五、其他与既有决策的偏离（已在计划评审时说明）

| 项 | 原决策 | 实际 |
| --- | --- | --- |
| Atlas 精确 IP 白名单（Q15A） | 只放行固定 IP、禁用 `0.0.0.0/0` | **办不到**：容器镜像不支持 Static IPs，出口 IP 不固定，必须放行全量 |
| 内存态限流 | 多实例下有效 | **失效**：按流量扩缩，各实例计数不共享。仅单实例内有效 |
| 常驻模型（Q14A） | 保持 fail-fast + 常驻 | 平台为**缩容到零**模型，无流量 5 分钟后实例回收 |

### 六、结论与建议

**技术结论**：Vercel 这条路是**通的**，三个验收标准全部通过；容器化本身还额外带来两个好处——同域（Cookie 免配置）+ 接口地址可用相对路径 `/api`（换域名不必重新构建）。

**但它不适合作为面向中国大陆的生产环境**：

1. `*.vercel.app` 被 DNS 污染且路径被阻断，**用户与你自己的命令行都访问不到**（浏览器靠 DoH 侥幸可用，但不可依赖）；
2. Hobby 为**单区域**（默认美东），中国大陆访问延迟高；
3. **Atlas 白名单必须永久放开 `0.0.0.0/0`** —— 这与本项目此前"凭据已泄露一次"的安全基线直接冲突；
4. 无流量 5 分钟缩容到零 + 内存态限流失效，与"常驻 Node 进程 + 精确白名单"的原设计假设不一致。

**建议**：把本次部署保留为**验证/演示环境**，生产仍走 Dokploy + VPS（选香港/新加坡/日本等可达区域 + 自有域名），即可同时拿到：精确白名单、无冷启动、限流生效、可访问性。
本次验证的产出（同域 `/api` 相对路径改造、`maxPoolSize` 收敛、入口脚本的启动顺序修正、环境变量写入法）**对 Dokploy 方案全部可复用**。

### 七、验证结束后的待办

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

### 八、AI 学习助手启用验证（步骤与预期）

> 背景：本项目的 AI 模块是**增强功能**——不配 `NVNIM_API_KEY` 也能部署，只是降级为「未启用」。
> 线上出现「AI 功能未启用」时，根因几乎总是"平台没配这个环境变量"，而非代码故障。
> 本节能让部署者用**一条命令**确认状态，而不用翻日志或读代码。

#### 启用步骤

1. `Project → Settings → Environment Variables` 新增 `NVNIM_API_KEY`（Environment 勾 **Production**，Type 选 **Secret**），值取本地 `apps/api/.env` 里 `nvapi-` 开头那串；
2. **Redeploy**（`Deployments → 最新一条 → ⋯ → Redeploy`）—— 容器环境变量是**运行时注入**，改完不自动生效；
3. 打开线上站点 → 右下角 AI 抽屉应显示"今日剩余 N"，可正常提问。

#### 自检命令与预期返回

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

#### 验证标准

- [x] `/api/ai/status` 返回 `enabled:true`、`keyConfigured:true`、`codeIndexLoaded:true`、`codeIndexFiles>0`
- [x] AI 抽屉不再显示"未启用"，显示"今日剩余 N"
- [x] 提问能拿到答案；**问本站代码类问题时 `sources` 非空**（索引随镜像进去了的证据）
- [x] 真实浏览器验证：抽屉打开、输入、提交、Markdown 回答渲染出来

> ⚠️ 只凭 `/api/ai/status` 的 JSON 不足以证明前端可用：本项目经验档案里记录过
> "SSR 的 HTML 会掩盖客户端失败"——页面打得开不代表交互能用。最终仍需一次真实浏览器验证。

#### 实测记录（2026-09-13）

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

### 九、性能基线与验收标准（2026-09-15）

> 起因：用户反馈"部署到 Vercel 之后，各种点击响应都很慢"。
> 本节记录**实测方法、基线数字、根因判定、已做改动、以及被否决的改动**。
> 所有数字都用 `pnpm bench:vercel`（即 `scripts/bench-vercel.mjs`，零依赖）复现。

#### 9.1 网络环境已变更（旧结论作废）

§三 记录的"`*.vercel.app` DNS 被污染、必须走代理"**在当前网络下不成立**：

```
dns=0.010s  tcp=0.020s  tls=0.049s      X-Vercel-Id: hkg1::iad1::...
```

边缘在 **hkg1（香港）**，容器在 **iad1（美东）**。旧的"DNS 污染/路径阻断"结论仅对当时那台机器有效。

#### 9.2 基线数字（改动前）

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

#### 9.3 根因判定

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

#### 9.4 已排除（不要再往这些方向查）

1. 静态资源：`/_nuxt/**` 已带 `public, max-age=31536000, immutable`，边缘 `X-Vercel-Cache: HIT`，552KB 只要 0.025s。
2. 实例轮询 / OOM 重启：`health` 20/20 全快，`posts` 却 50% 慢，两者在同一容器里，无法用"打到了坏实例"解释。
3. 数据库索引与数据量：见 §9.3。
4. Token 预刷新 / 401 重试队列：`useApi.ts` 请求发出前的 `await` 数为 **0**。
5. Service Worker、前端节流定时器：均未注册；仅有的轮询在加载后立刻跑完，与"闲置几分钟"无关。

#### 9.5 本次改动

| 文件 | 改动 | 预期收益 |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | `minPoolSize: 1`、`maxIdleTimeMS: 45_000`、`waitQueueTimeoutMS: 5000`；`serverSelectionTimeoutMS` 8000→3000；`retryDelay` 3000→500、`retryAttempts` 5→4 | **直击主因**：主动回收将被掐断的连接，并把重连等待从 6 秒级降到毫秒级 |
| `docker/vercel/entrypoint.mjs` | 子进程就绪后主动预热 `/api/health` 与 `/`（内部回环） | 缩短真实冷启动后首个请求的额外开销 |
| `apps/web/nuxt.config.ts` | Google Fonts 阻塞 stylesheet 改为 `media="print"` + `onload` 异步 | 移除首屏唯一一条第三方阻塞外链 |
| `apps/web/app/middleware/auth.ts` | `restore()` 一次会话只执行一次（缓存 Promise，已登录则跳过） | 消除每次进入受保护页面前的一次 `/auth/refresh` 往返 |
| `apps/web/app/stores/post.ts` | 发表/删除评论改乐观更新（占位 id 前缀 `pending:`，失败回滚） | 把"点了没反应"变成"立刻有反馈" |
| `scripts/bench-vercel.mjs` | 新增零依赖量测脚本（`--series` / `--cold` / `--headers`） | 让后续每次改动都有可对比的数字 |

#### 9.6 评估后**放弃**的改动（理由留档，避免重犯）

1. **给 `/_nuxt/**` 加 `routeRules` 长缓存** —— 实测 Nitro 已注入 `immutable` 且边缘已 HIT。盲目加配置只会引入不一致。
2. **AI 代码索引改懒加载** —— 索引仅 101 条，读盘解析只有几毫秒；而 `code-index.service.ts:119-134` 已论证"启动即加载"是为了可观测性（索引缺失时静默降级成"资料中没有提到"）。为几毫秒放弃该性质不划算。
3. **点赞链路 3 次往返降到 2 次**（去掉 `ensurePostExists`，改由 `incrementLikeCount` 返回 `null` 判定）—— **已实现后回退**。原因：`likes.service.spec.ts:79-84` 断言"帖子不存在时抛 404，**且不写任何数据**"。新写法先写后回滚，若进程在两者之间崩溃会留下孤儿记录。为跨区省 200ms 破坏这条安全属性不值得。

#### 9.7 验收步骤（需重新部署后执行）

改动只在本机完成，**未经线上验证**（本机无 Vercel CLI、无 `.vercel` 目录，无法自动部署）。请按下列顺序验收：

```powershell
## 1) 部署：推送到 main（Vercel 已接 GitHub）或在面板 Redeploy

## 2) 冷启动
pnpm bench:vercel --cold --idle=300

## 3) 稳态与（最关键的）慢请求占比
pnpm bench:vercel --series=10

## 4) 静态资源缓存头
pnpm bench:vercel --headers
```

**验收标准**：

- [ ] `--series=10` 中 `/api/posts` 的慢请求(>3s) 占比从 **50% 降到 <10%**
- [ ] `/api/health` 中位数保持 ≤ 0.35s
- [ ] `/_nuxt/**` 仍是 `immutable` 且 `X-Vercel-Cache: HIT`
- [ ] 首页首屏不再被 `fonts.googleapis.com` 阻塞（Network 面板中该请求不再阻塞渲染）
- [ ] 发/删评论点击后**立即**出现变化（乐观更新生效）
- [ ] `pnpm --filter @studyplan/api test` 除 `daily-digest.service.spec.ts` 那条**日期硬编码**用例外全绿

#### 9.8 遗留建议

若上一步验收后慢请求占比仍高，说明瓶颈是**平台层的容器回收频率**，那就不再是应用代码能解决的：

1. **Hobby 无法保活** —— 官方限制 cron 每天只能跑一次，"定时 ping"这条路是死的（已核实）。
2. **真正的解法是把应用放到亚洲常驻进程上**（§六 已建议的 Dokploy 方案）。注意数据库 Atlas 集群本就在 **asia**，应用若也放到亚洲（香港/新加坡/日本），本次发现的**跨区连接被掐断**这个主因会直接消失，同时冷启动也不复存在。
3. 在此之前，§9.5 的连接参数改动是成本最低、收益最确定的一步。

---

### 十、作品集化改造：SEO 基础 + CI + 自建可观测性（2026-09-15）

> 背景：对标 roadmap.sh 的差距分析之后，明确本项目定位为**作品集**（给雇主看「能从零做到上线」）。
> 由此确定优先级不是加功能，而是补齐「雇主一眼就能看出缺失」的四件事。
> 四项决策（均已确认）：SEO 只做最小可用档、CI 含 Docker 构建但不含 E2E、可观测性自建不接第三方、部署由用户执行。

#### 10.1 先修掉的两个既存失败（不修它们 CI 就是红的）

| 问题 | 修法 | 为什么不那样修 |
| --- | --- | --- |
| `app/app.vue:51` TS2322（`groups.value[0]` 为 `\| undefined`） | 把初始导航分组抽成具名常量 `NAV_GROUP`，初始与重建两处共用 | 用 `!` 非空断言只是掩盖类型问题，初始分组真变空数组时运行时照样炸 |
| `daily-digest.service.spec.ts` 硬编码 `'2026-09-14'` | 新增 `todayKeyIn(zone)`，与既有 `currentHourIn()` 同一套思路，动态算出"今天" | 写死一个新日期只是把失败推迟到明天 —— 这正是本项目踩过的"没改代码测试却挂了" |

修后：后端 **128/128 通过**（原 127 通过 1 失败）；前端 typecheck **0 error**（原 1 error）。

#### 10.2 本轮新增

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

#### 10.3 本地验证结果（2026-09-15 实测）

| 检查 | 结果 |
| --- | --- |
| `pnpm run lint` | **0 error**，5 warning（全部为既存：v-html×2、未用变量×2、any×1，均在未改动或仅追加的文件里） |
| `pnpm run typecheck` | **shared / api / web 三包全部 Done，exit=0** |
| `pnpm --filter @studyplan/api test` | **10 suites / 128 tests 全部通过** |
| `pnpm --filter @studyplan/web build` | **exit=0**；产物含 `.output/server/chunks/routes/sitemap.xml.mjs` —— 证明新增服务端路由已注册，且 `@studyplan/shared` 在 Nitro 服务端上下文可正常导入（若导入失败，构建会直接报错） |
| 实跑构建产物（`node .output/server/index.mjs`） | `/robots.txt` → **200**；`/sitemap.xml` → **200** 且 `content-type: application/xml`，输出 3 条绝对 URL，**降级路径生效**（后端完全不可用时仍返回 200 而非 500）；对照 `/__definitely_missing__.txt` → **404**，证明该 200 来自真实注册的路由而非兜底 |

#### 10.4 ⚠️ 尚未验证的项（不要默认它们是好的）

1. **E2E 未执行** —— `seo.spec.ts` 已写好、lint 通过，但没有真正跑过，原因是**本地环境连不上数据库**：
   ```
   MongoServerError: bad auth : authentication failed (code 8000, AtlasError)
   ```
   本地 `apps/api/.env` 里的 `MONGODB_URI` 凭据已被服务端拒绝。**这是既存的环境问题，与本次改动无关** —— 认证失败发生在 SCRAM 握手阶段，连接池与超时参数不可能导致它。它也与 §七 挂账的「轮换 `genshin1210_db_user` 密码」事项吻合。
   连带影响：没有数据库时任何 SSR 渲染（连 404 页）都返回 500，因此本地连"只跑 SEO 断言"也做不到。
   **修法**：更新 `apps/api/.env` 的 `MONGODB_URI`（用 Atlas 控制台当前的凭据），或直接按 §10.5 在**部署后**跑 —— 后者更省事，也是本项目此前验证 E2E 的既有做法。
2. **Docker 构建未在本机执行** —— 本机未验证 `docker build -f Dockerfile.vercel .` 能过；这一步由 CI 的 `docker` job 首次验证。如果它红了，最可能的原因是构建期新增了依赖或 ARG 未传。
3. **以下全部依赖部署**，本机无法验证：sitemap/canonical/OG 的线上表现、慢请求日志的实际输出、§9.5 延迟修复的效果。

#### 10.5 必须由用户执行的线上验收（按顺序）

```powershell
## ① 部署：推送 main（Vercel 已接 GitHub），或在面板 Redeploy

## ② 延迟验收（上一轮遗留，判定线最重要）
pnpm bench:vercel --series=10
##    判定线：/api/posts 慢请求(>3s) 占比 <10%（改动前 50%）
##            /api/health 中位数 ≤ 0.35s

## ③ SEO 验收
curl -s -o NUL -w "sitemap %{http_code} %{content_type}`n" https://studyplan-teal.vercel.app/sitemap.xml
curl -s -o NUL -w "robots %{http_code}`n" https://studyplan-teal.vercel.app/robots.txt
curl -s https://studyplan-teal.vercel.app/ | Select-String -Pattern 'rel="canonical"|og:image'
##    判定线：sitemap 200 且 content-type 含 xml；首页源码含绝对地址 canonical 与 og:image

## ④ E2E（SEO 断言 + 既有 6 条）
$env:E2E_BASE_URL = 'https://studyplan-teal.vercel.app'
pnpm --filter @studyplan/web e2e
##    判定线：10 条用例（6 既有 + 4 新增）全部通过

## ⑤ 慢请求日志
##    Vercel 面板 → 该次部署 → Runtime Logs，筛 "SlowRequest"
##    判定线：能看到形如 "GET /api/posts?... 200 1234ms segments=[posts.findAll.db:1100ms]" 的行
##            —— 这一行出现，"6.6 秒到底花在哪"就不再是猜测
```

#### 10.6 部署后验收：结果与发现的缺陷（2026-09-15）

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

#### 10.7 如果验收不达标

- **慢请求占比仍 >10%** → 瓶颈是平台层的容器回收频率，应用代码已无杠杆。解法见 §9.8：迁到亚洲常驻进程（Atlas 本就在 asia，跨区连接被掐断这个主因会直接消失）。
- **sitemap 返回 500** → 说明降级路径没生效，优先查 `apiBaseInternal` 是否被环境变量覆盖成了外部地址。
- **canonical 是 `http://`** → 说明 `NUXT_PUBLIC_SITE_URL` 没进构建，检查 Dockerfile 的 ARG/ENV 是否被改动。
