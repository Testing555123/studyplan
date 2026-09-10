# 环境准备

## 一、本机已具备的条件

在开工前已经实际检测过本机环境，结论如下：

| 工具 | 版本 | 状态 |
| --- | --- | --- |
| Node.js | `v24.18.1` | 已装，满足 NestJS 11（≥20.19）与 Nuxt 4（≥20） |
| npm | `11.16.0` | 已装 |
| pnpm | `11.20.0` | 已装（本项目用 pnpm workspace） |
| git | `2.53.0` | 已装 |
| Docker | — | **未安装**，本项目全程不需要 |
| MongoDB（mongod） | — | **未安装**，改用云端 Atlas |

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

---

## 三、智谱 GLM API Key（阶段 7 之前必须完成）

1. 打开 <https://open.bigmodel.cn> 注册并完成实名认证（有免费额度）；
2. 进入 `API Keys` 页面创建一个新的 Key；
3. Key 形如 `xxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx`，请立刻保存。

> **智谱的 Key 结构特殊**：它由 `id.secret` 两段组成，
> SDK 会用这两段签出一个 JWT 再调用接口。
> 所以如果你看到"需要 jsonwebtoken 这个依赖"的说法，原因就在这里。

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
ZHIPUAI_API_KEY=...（上一步创建的 Key）
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
