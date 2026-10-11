# 环境准备

## 一、本机已具备的条件

在开工前已经实际检测过本机环境，结论如下：

| 工具 | 版本 | 状态 |
| --- | --- | --- |
| Node.js | `≥ 20.19.0` | 已装。下限来自根 `package.json` 的 `engines`（NestJS 11 与 Nuxt 4 的共同要求） |
| npm | — | 已装（用来装全局 CLI） |
| pnpm | `11.20.0` | 已装。版本由根 `package.json` 的 `packageManager` 锁定，不要手动升级 |
| git | — | 已装 |
| Docker | — | **可选**。纯本地开发不需要；只有"自己构建/运行容器镜像"时才要装（部署阶段会用到） |
| MongoDB（mongod） | — | **未安装**，改用云端 Atlas |

> 版本号刻意不写死具体小版本：真正有约束力的只有两条——
> Node 的 `engines` 下限，以及 pnpm 由 `packageManager` 锁定。
> 其余工具写死版本只会在你升级后被文档误导。

> **为什么不用 Docker 跑数据库？**
> 数据库的运维（副本集、备份、连接池）不是这个项目的学习目标，
> 而 Docker 会额外引入"镜像、卷、网络"三套新概念。
> 把数据库交给 Atlas，可以把注意力集中在"数据怎么建模、查询怎么写"上。

---

## 二、MongoDB Atlas（阶段 3 之前必须完成）

### 1. 注册与建集群

1. 打开 <https://www.mongodb.com/cloud/atlas/register> 注册账号；
2. 创建一个 **Free 集群**（即以前的 M0 档，永久免费、不过期，够教学用）；
3. 集群区域选择离你最近的（例如 `AWS / ap-southeast-1` 新加坡）。

> **注意**：一个账号只能建**一个** Free 集群。如果你已经建过，直接复用即可，
> 不需要删掉重建 —— 连接串可以重复使用，不同项目用不同数据库名区分就好。

### 2. 创建数据库用户

`Security → Database Access → Add New Database User`

- 认证方式选 **Password**
- 用户名例如 `studyplan_app`
- 密码请点 **Autogenerate Secure Password** 并**立刻保存**——它只会显示一次
- 权限保持默认的 `Read and write to any database`

### 3. 放行你的 IP

`Security → Network Access → Add IP Address`

- 开发阶段最省事的做法是选 **Allow Access from Anywhere**（`0.0.0.0/0`）
- ⚠️ 这是"开发方便"与"安全"之间的取舍：**上线前必须收紧为具体 IP**。
  这里是你第一次遇到真实的工程权衡，请记住它。

### 4. 拿到连接串

`Database → Connect → Drivers → Node.js`，复制形如下面的字符串：

```
mongodb+srv://studyplan_app:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

需要手工改两处：

1. 把 `<password>` 换成刚才保存的真实密码；
2. 在 `.net/` 后面补上数据库名 `studyplan`：

```
mongodb+srv://studyplan_app:真实密码@cluster0.xxxxx.mongodb.net/studyplan?retryWrites=true&w=majority
```

> 第 2 步经常被漏掉。不写数据库名时，MongoDB 会默认连到 `test` 库，
> 你会困惑"数据到底写哪去了"。

#### 5. 单独验证连接串（推荐先做）

把连接串写进 `apps/api/.env` 之后，**先别急着启动整个项目**。
用下面这条命令单独验证数据库能不能连通：

```bash
cd apps/api
node --env-file=.env -e "const m=require('mongoose');m.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000}).then(async()=>{console.log('连接成功',await m.connection.db.admin().ping());await m.disconnect()}).catch(e=>{console.error('连接失败:',e.message);process.exit(1)})"
```

成功会打印 `连接成功 { ok: 1 }`。

**为什么值得单独做这一步？** 因为连接串写错是**最常见**的失败原因
（密码含特殊字符没转义、数据库名漏了、IP 没放行），而它的报错
往往出现在一堆启动日志中间，很容易被误判成"代码有问题"。
把数据库单独拎出来验证，可以把"环境问题"和"代码问题"彻底分开 ——
这是排查故障最基本的一招：**一次只怀疑一个变量。**

常见报错对照：

| 报错关键词 | 真正的原因 |
| --- | --- |
| `Authentication failed` | 用户名或密码错了。注意密码里的 `@ : / # ? %` 等符号必须做 URL 编码 |
| `Could not connect to any servers` / 超时 | IP 没放行。回去检查 `Network Access` |
| `querySrv ENOTFOUND` | 集群地址抄错了，或集群还在创建中（刚建好要等 1-2 分钟） |
| `querySrv ECONNREFUSED` | DNS 没拒绝这个名字，而是**拒绝回答 SRV 查询**。见下方专节 |
| 连上了但数据找不到 | 连接串里漏了 `/studyplan`，数据写进了 `test` 库 |

#### 6. 专节：`querySrv ECONNREFUSED` 怎么解

这是一个**真实踩到过**的坑，而且它的表现极具迷惑性 ——

```text
在 PowerShell 里：Resolve-DnsName -Type SRV _mongodb._tcp.xxx.mongodb.net   → 成功
在 Node 里：      mongoose.connect('mongodb+srv://...')                     → ECONNREFUSED
```

同一个域名、同一台机器，一个通一个不通。原因是 **Node 有两套 DNS 解析器**：

| 解析路径 | 谁在用 | 走哪条路 | 本环境表现 |
| --- | --- | --- | --- |
| `dns.lookup()` | 普通网络连接（`net.connect`） | 操作系统的 `getaddrinfo` | ✅ 正常 |
| `dns.resolve*()` | **`mongodb+srv://` 查 SRV 记录** | Node 内置的 c-ares 库 | ❌ 拿到 `127.0.0.1`，无人监听 |

**为什么 `+srv` 非要走 SRV 查询？** 因为 `mongodb+srv://` 是一个"简写"：
它只写一个域名，靠一条 DNS SRV 记录去发现集群的三个真实节点。
所以 SRV 查询被挡，证书再对也连不上。

**先确认是不是这个问题**：

```bash
node -e "const dns=require('dns');dns.lookup('你的集群地址',(e,a)=>console.log('getaddrinfo:',e?e.code:a));dns.setServers(['8.8.8.8']);dns.resolve4('你的集群地址',(e2,a2)=>console.log('c-ares:',e2?e2.code:a2))"
```

如果第一条成功、第二条失败，就是这个问题。

**修复方案：改用非 SRV 连接串。**

`mongodb+srv://` 能做的事，标准连接串全都能做 —— 只是把 DNS 帮你的活手动写出来：

```text
mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/studyplan?retryWrites=true&w=majority
                            ↓ 展开成
mongodb://user:pass@ac-xxxx-shard-00-00.xxxxx.mongodb.net:27017,ac-xxxx-shard-00-01.xxxxx.mongodb.net:27017,ac-xxxx-shard-00-02.xxxxx.mongodb.net:27017/studyplan?ssl=true&authSource=admin&retryWrites=true&w=majority
```

三个节点的真实地址可以从 SRV 记录里查到：

```powershell
Resolve-DnsName -Type SRV _mongodb._tcp.cluster0.xxxxx.mongodb.net | Select NameTarget, Port
```

> **⚠️ 从 `+srv` 换成 `mongodb://` 时，有两个参数必须手工补上**，这是最容易翻车的地方：
>
> | 参数 | 为什么必须加 |
> | --- | --- |
> | `ssl=true` | `+srv` 会自动启用 TLS，**标准连接串不会**。漏了会连不上或报超时 |
> | `authSource=admin` | Atlas 的用户建在 `admin` 库；`+srv` 会隐式带上，标准串不会。漏了会报 `Authentication failed` |

**代价（也需要知道）**：非 SRV 串把三个节点地址**写死**了。
如果哪天 Atlas 迁移了集群，地址会变，而 SRV 串能自动适应。
所以这不是"哪个更好"，而是"在当前网络环境下哪个能用"——
**能用的那个才是对的。** 如果你的环境 SRV 正常，优先用 `+srv`。

### 连接串的 SRV 解析：为什么 PowerShell 能连、Node 连不上

#### 实现方法
连接串写在 `apps/api/.env` 的 `MONGODB_URI`。遇到 `querySrv ECONNREFUSED` 时，先分开验证：PowerShell 的 `Resolve-DnsName -Type SRV` 能解析，但 Node 的 `mongoose.connect('mongodb+srv://…')` 报 ECONNREFUSED，基本就是 c-ares 解析器被拦。修复办法是把 `+srv` 串展开成标准 `mongodb://` 串，手动列出三个 shard 节点，并补上 `ssl=true` 与 `authSource=admin`。

#### 原理
`mongodb+srv://` 是简写：只写一个域名，靠一条 DNS SRV 记录去发现集群的三个真实节点。Node 有两套 DNS 解析器——`dns.lookup()` 用操作系统的 `getaddrinfo`，`dns.resolve*()` 用内置的 c-ares 库。`+srv` 走的是后者，它在某些网络环境下拿到的地址是 `127.0.0.1` 这种没人监听的地址，连接于是被拒绝。问题不在证书、也不在密码，是 SRV 查询这一步就没拿到正确节点。

#### 与相关技术栈的关系
`+srv` 和标准 `mongodb://` 是同一协议的两个写法：标准串把所有信息（节点、端口、TLS、authSource）写死，不依赖 DNS SRV 记录；`+srv` 把节点发现交给 DNS，节点变更时连接串不用改。代价是 `+srv` 引入了对 DNS SRV 记录的依赖。所以在 SRV 被拦截的环境里，标准串反而更稳。

#### 面试常见问题与解题思路
**Q1：为什么同一个域名在 PowerShell 能解析、Node 里却不行？**
怎么想 → 区分"谁在做 DNS 解析"；怎么答 → 指出 Node 的 c-ares 与系统 getaddrinfo 是两套实现，`+srv` 走 c-ares，环境把 c-ares 的 SRV 查询挡掉了；追问 → 如何不改连接串就验证到底哪套解析器出问题（用 `dns.setServers` 切换解析服务器）。

**Q2：`+srv` 和标准串怎么选？**
怎么想 → 看是否依赖 DNS SRV；怎么答 → 能用 `+srv` 就优先，节点漂移自动适应，环境不支持时再退化到标准串；追问 → 标准串漏了 `ssl=true` 或 `authSource=admin` 会分别报什么错。

---

## 三、NVIDIA NIM API Key（可选，用于 AI 摘要与学习助手）

1. 打开 <https://build.nvidia.com> 注册 NVIDIA 开发者账号（有免费额度，无需信用卡）；
2. 在模型页面点 `Get API Key` 生成一个以 `nvapi-` 开头的 Key；
3. 把它填进 `apps/api/.env` 的 `NVNIM_API_KEY`。

> **不填也能跑**：AI 是增强功能。缺少 Key 时后端照常启动，
> 只是发帖不生成摘要、AI 助手显示「未启用」。
>
> **接口是 OpenAI 兼容的**：`https://integrate.api.nvidia.com/v1`，
> 所以用 Node 内置的 `fetch` 就能调，**不需要安装任何 SDK**。
> （这也是它比原先的智谱方案更简单的原因：那边需要 LangChain 三件套 + zod。）
>
> ⚠️ **模型会下线**：实测某些模型返回 `410 Gone`
> （如 `meta/llama-3.1-8b-instruct` 已于 2026-08-26 下线）。
> 因此模型名由 `NVNIM_MODEL` 配置而非写死。可用清单随时可查：
> `GET https://integrate.api.nvidia.com/v1/models`

### NVIDIA NIM 的 OpenAI 兼容接入

#### 实现方法
Key 填进 `apps/api/.env` 的 `NVNIM_API_KEY`，接口地址 `https://integrate.api.nvidia.com/v1`。因为接口是 OpenAI 兼容的，后端用 Node 内置 `fetch` 直接调 `/v1/chat/completions` 即可，不需要任何 SDK。模型名由 `NVNIM_MODEL` 配置而不是写死，避免某个模型下线后代码报错。缺 Key 时后端正常启动，发帖不生成摘要、AI 助手显示「未启用」。

#### 原理
OpenAI 兼容接口指请求体（messages / model / temperature）和响应体（choices[0].message.content）都沿用 OpenAI 的约定。NVIDIA NIM 在背后把请求转发给具体模型，对调用方而言和调 OpenAI 没区别。本项目把 AI 做成旁路：调用失败不影响主链路（发帖），所以少一个 SDK 依赖反而更简单、更稳。

#### 与相关技术栈的关系
相比原先的智谱方案（需要 LangChain 三件套 + zod），OpenAI 兼容接口只用 `fetch` 就能调，依赖更轻。和本地部署的 Ollama 类似，Ollama 也暴露 OpenAI 兼容端点，差别只是指向本地还是云端。模型层面，NIM 上的模型会下线（如 `meta/llama-3.1-8b-instruct` 于 2026-08-26 下线），所以模型名必须可配置、可热替换。

#### 面试常见问题与解题思路
**Q1：为什么把 AI 调用做成旁路而不是主链路？**
怎么想 → 想"AI 挂了用户还能不能发帖"；怎么答 → AI 是增强功能，失败不应阻断核心业务，所以用 try/catch 包住、失败就降级；追问 → 降级时要不要重试、要不要告警、会不会静默丢失。

**Q2：为什么选 OpenAI 兼容接口而不是专有 SDK？**
怎么想 → 看依赖成本和可移植性；怎么答 → 兼容接口只需 fetch，换厂商只需改 base URL，不被 SDK 绑架；追问 → 兼容接口能不能覆盖流式输出、函数调用等高级能力。

---

## 四、写入环境变量

```bash
# Windows PowerShell（仓库根目录执行）
Copy-Item .env.example apps/api/.env

# macOS / Linux
cp .env.example apps/api/.env
```

然后编辑 `apps/api/.env`，至少填上：

```bash
PORT=3000
CORS_ORIGIN=http://localhost:3001
MONGODB_URI=mongodb+srv://...（上一步拿到的连接串）
JWT_ACCESS_SECRET=...（自己生成，见下）
JWT_REFRESH_SECRET=...
NVNIM_API_KEY=...（上一步创建的 Key；不填则 AI 功能自动降级）
```

生成 JWT 密钥（两个必须不同）：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 五、三条安全纪律

1. **`.env` 永远不提交**。它已经在 `.gitignore` 里，仓库里只有空值的 `.env.example`；
2. **密钥不要贴进聊天记录、issue、截图**。一旦贴出，立刻去平台重置；
3. **不确定某个变量会不会泄漏时，走这条判断**：任何以 `NUXT_PUBLIC_` 或 `PUBLIC_`
   开头的东西，都会被打包进浏览器可见的产物里——**绝不能放密钥**。

### 环境变量里的密钥边界：NUXT_PUBLIC_ 不存密钥

#### 实现方法
本项目 `.env` 不提交（已在 `.gitignore`），仓库只有空值的 `.env.example`；密钥不进聊天记录、issue、截图，一旦泄露立刻去平台重置。Nuxt 里任何以 `NUXT_PUBLIC_` 或 `PUBLIC_` 开头的变量都会被打包进浏览器可见的产物，所以这类变量只能放非敏感的配置（如接口 base URL），**绝不能放密钥**。真正需要保密的（JWT 密钥、数据库密码、API Key）只放在后端 `.env`，前端拿不到。

#### 原理
前端代码运行在用户浏览器里，构建时 `NUXT_PUBLIC_` 前缀的变量会被内联进 JS bundle，任何人打开页面、看网络请求或读源码都能拿到。后端 `.env` 只存在于服务器内存和进程环境里，不会进入前端产物。密钥该放哪，本质是"这段信息会不会出现在用户能下载到的文件里"。

#### 与相关技术栈的关系
这和"前端守卫不是安全边界"是同一类问题：浏览器里的东西用户都能改、都能读。对比 Vite 的 `import.meta.env.VITE_` 前缀、Create React App 的 `REACT_APP_` 前缀，约定不同但机制一样——带公开前缀的都会进 bundle。后端环境变量则参考 Twelve-Factor App 的 config 原则，靠运行环境注入，不进代码。

#### 面试常见问题与解题思路
**Q1：把 API Key 放在 `NUXT_PUBLIC_` 变量里会有什么后果？**
怎么想 → 想"这个变量最后会出现在哪"；怎么答 → 它会进前端 bundle，用户能从源码或请求里拿到 Key，进而盗用额度或产生费用；追问 → 发现 Key 泄露后第一步该做什么（去平台重置 + 轮换）。

**Q2：前端怎么安全地调用需要密钥的第三方接口？**
怎么想 → 密钥不能在前端；怎么答 → 让后端持有密钥，前端调自己的后端、后端再带密钥调第三方，密钥始终不离开服务器；追问 → 这样会不会把后端变成用户的免费代理（要做限流 / 鉴权）。

---

## 六、端口约定

| 服务 | 端口 | 地址 |
| --- | --- | --- |
| 后端 API | 3000 | <http://localhost:3000/api> |
| 接口文档 | 3000 | <http://localhost:3000/docs> |
| 前端 | 3001 | <http://localhost:3001> |
| 电子书 | 3002 | <http://localhost:3002> |

> 为什么后端占 3000 而前端占 3001？
> 因为几乎所有 Node 框架和教程的默认端口都是 3000。
> 把 3000 留给后端，可以让"后端服务在 3000"这个直觉保持成立。
