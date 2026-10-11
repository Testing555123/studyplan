# 每日 GitHub 项目报道装置

> 这一页讲的是项目里唯一一个**会自己发内容**的功能：每天挑一个 GitHub 新项目，用 AI 写成中文报道，以机器人身份发成一篇普通帖子。
>
> 它默认关闭。这一页分两部分：前半是运维手册（怎么开、怎么查、怎么撤），后半是六个设计取舍（为什么这么写，以及面试里会怎么被问）。
>
> 想直接看"怎么开"，跳到第一节就够。

---

## 一、运维手册

### 1. 启用：两把锁，都得开

装置默认是关的，而且**故意的**：它会以机器人身份往公开帖子流里写内容。让它默认静默，比让它默认说话安全。

开启需要两个环境变量，缺任何一个都不行：

| 变量 | 值 | 作用 |
| --- | --- | --- |
| `DAILY_DIGEST_ENABLED` | `true` | 总开关。关着时主流程直接返回 `disabled`，不发任何东西 |
| `DAILY_DIGEST_CRON_TOKEN` | 一个随机串 | 定时端点的令牌。**没配时端点直接 401**，等于关闭 |

这两把锁分工不同。总开关管的是"别在错误的环境里跑起来"，令牌管的是"别被不相干的人跑起来"。只留一把的话，一次环境变量配错就等于把内部写接口挂在了公网上。

用 Vercel Cron 时还有一项：在项目里新建 `CRON_SECRET`，把它的值填成和 `DAILY_DIGEST_CRON_TOKEN` **一样**。Vercel 触发 Cron 时不允许自定义请求头，只会把 `CRON_SECRET` 放在 `Authorization: Bearer <secret>` 里发过来，而后端两种头都认，所以两个值一致就能打通，不需要中间加一层转发。

生成随机串：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

三个注意事项：

- **只勾 Production**。MongoDB 是同一个 Atlas 库，Production 与 Preview 共用。变量一旦勾了 Preview，每次预览部署都会真的发帖，还会抢掉当天的名额。
- **确认 `NVNIM_API_KEY` 已配**。没配不会阻止发布，只会让内容退化成模板版（帖子上会标出来，前端也会提示）。
- **改完必须重新部署**。环境变量和 `vercel.json` 里的 `crons` 都要新部署才生效。

### 2. 发布时间

定时时刻写在 `vercel.json`：

```json
"crons": [
  { "path": "/api/internal/daily-digest", "schedule": "0 1 * * *" }
]
```

`0 1 * * *` 是 UTC，对应北京时间 09:00。Vercel 的 cron 表达式只支持 UTC，这一点没有商量余地。

免费套餐有两条限制要知道：**每天最多跑一次**，而且**只保证在指定小时内的某一刻触发**，不保证正好 09:00。再叠上容器缩容到零的冷启动，实际发布时刻落在 09:00 到 09:15 之间都算正常。

另外还有一道**惰性触发**：访问「GitHub 热门项目」页时，如果当天还没发、且已经过了 `DAILY_DIGEST_PUBLISH_HOUR`，后台会顺手补一篇。它是给"没配 Cron"的环境兜底的。配好 Cron 之后可以把 `DAILY_DIGEST_LAZY_TRIGGER` 设成 `false`，让发布时刻完全由 Cron 决定。

### 3. 自检：它到底是没开、没到点，还是没得选

这个装置最难查的状态不是"失败"，而是"什么都没发生"。所以状态接口和页面都会把原因说出来：

```bash
curl https://你的域名/api/daily-digest/today
```

返回里这几个字段是排查的入口：

| 字段 | 含义 |
| --- | --- |
| `enabled` | 总开关开没开 |
| `cronConfigured` | 定时令牌配没配。**注意它只回答"配没配"，不会返回令牌本身** |
| `lazyTrigger` | 惰性触发开没开 |
| `aiEnabled` | AI 有没有 Key |
| `publishHour` | 每天几点之后才允许生成 |
| `canPublishNow` | 现在能不能生成。**已经含了 `enabled`** |
| `pick` | 今天推了哪个项目。`null` 就是还没有 |

页面上对应的是「GitHub 热门项目」顶部的「每日 GitHub 项目报道」区块。它会按顺序说明"装置是关的""既没配令牌也关了惰性触发""还没到发布时间""今天的还没生成"，不用去翻环境变量猜。

### 4. 撤回

报道发出去之后是**可以在界面上删的**，但路径只有一条：机器人账号用随机密码创建，没有登录能力，而删帖的权限校验绑定 `author.id`，应用里也没有管理员入口。所以撤回做成了一个独立端点：

```bash
# 撤今天那篇
curl -X POST https://你的域名/api/internal/daily-digest/revoke \
  -H "x-daily-token: <与 DAILY_DIGEST_CRON_TOKEN 相同的值>"

# 撤历史某一天
curl -X POST https://你的域名/api/internal/daily-digest/revoke \
  -H "x-daily-token: <令牌>" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"2026-09-13\"}"
```

四种返回，对应四件不同的事：

| `status` | 含义 | 接下来做什么 |
| --- | --- | --- |
| `revoked` | 撤下来了 | 不用做什么；当天可以再点「立即生成」换一篇 |
| `already-revoked` | 之前撤过（这是幂等，不是错误） | 不用做什么 |
| `no-pick` | 那天没有报道 | 检查日期是不是敲错了 |
| `failed` | 别的错 | 看 `reason` |

撤回做四件事，按顺序：把项目写进"不再推荐"名单、删帖、连带删掉那篇的评论与点赞、最后释放当天名额。顺序不能换，理由见第三节。

### 5. 回滚

把 `DAILY_DIGEST_ENABLED` 改回 `false` 就停止发布，重新部署后生效。

**已经发出去的内容不会自动删除。** 想清掉就用上面的撤回命令。这一点值得记住：关开关只影响"以后还发不发"。

### 6. 可调项

都有默认值，通常不用配。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DAILY_DIGEST_TIMEZONE` | `Asia/Shanghai` | 算"今天"用哪个时区 |
| `DAILY_DIGEST_PUBLISH_HOUR` | `9` | 几点之后允许生成（0 到 23） |
| `DAILY_DIGEST_MIN_STARS` | `50` | 候选项目的最小 star |
| `DAILY_DIGEST_LOOKBACK_DAYS` | `30` | 只看最近多少天新建的仓库 |
| `DAILY_DIGEST_LANGUAGES` | 空 | 语言白名单，逗号分隔。**空表示不限** |
| `DAILY_DIGEST_CANDIDATE_LIMIT` | `100` | 从候选池里最多考虑前几个 |
| `DAILY_DIGEST_AI_MAX_TOKENS` | `3000` | 报道的输出上限 |
| `DAILY_DIGEST_AI_TIMEOUT_MS` | `90000` | 报道的 AI 超时（**别往小调**，理由见第三节第 3 条） |
| `DAILY_DIGEST_BOT_USERNAME` | `github-daily` | 机器人用户名，会显示成帖子作者 |

`DAILY_DIGEST_BOT_USERNAME` 改起来要小心：改它等于换一个作者身份，之前的报道仍挂在旧账号名下。上线后不要随手改。

---

## 二、它由哪些东西拼成

```text
Vercel Cron ──┐
              ├──▶ runDailyDigest ──┬──▶ GithubService.getTrending   候选池（走缓存）
页面访问 ─────┘                     ├──▶ GithubClient.fetchReadme    报道素材
                                   ├──▶ NvNimClient.chat           AI 写稿（失败退模板）
                                   ├──▶ UsersService               惰性建机器人账号
                                   └──▶ PostsService.create        发帖
                                              │
                              daily_picks ◀───┘   date 唯一（一天一篇）
                                                  repoId 唯一（永不重复推荐）

撤回 ──▶ runRevoke ──┬──▶ daily_pick_excludes   写"不再推荐"名单
                    ├──▶ PostsService.remove    删帖
                    ├──▶ CommentsService.deleteByPost / LikesService.deleteByPost
                    └──▶ daily_picks            删掉当天那行，释放名额
```

它单向依赖 `github`、`ai`、`posts`、`users`、`comments`、`likes` 六个模块，没有任何模块依赖它。所以把这个模块整个删掉，用户发帖、评论、登录那几条路径都不受影响。

---

## 三、六个设计取舍

### 1. 为什么不用内存定时器

**实现方法**

定时不写在进程里，而是由外部调度器打一个带令牌的 HTTP 端点：

```ts
@Post('internal/daily-digest')
@HttpCode(200)
async trigger(
  @Headers('x-daily-token') token: string | undefined,
  @Headers('authorization') authorization: string | undefined,
): Promise<DailyDigestResult> {
  const expected = this.config.get<string>('DAILY_DIGEST_CRON_TOKEN')
  if (!expected || !this.matchesToken(expected, token, authorization)) {
    throw new UnauthorizedException('定时令牌无效')
  }
  return this.dailyDigestService.runDailyDigest()
}
```

**原理**

本项目线上是单容器，无流量若干分钟后缩容到零，有流量时又可能同时开出多个实例。内存里的定时器在这两种情况下都不成立：实例被回收时定时器跟着消失，那一天就永远不触发了；实例多开时每个实例都有自己的定时器，于是同一件事被触发多次。

把"什么时候该跑"交给外部调度器，"这次要不要真的干活"交给数据库的唯一索引，两边各管一件自己擅长的事。

**与相关技术栈的关系**

NestJS 提供 `@nestjs/schedule`，用 `@Cron()` 装饰器几行就能写定时任务，在常驻单实例的部署形态下很好用。本项目的部署形态让它不适用，所以全仓没有引入这个依赖。

同类取舍在别处也出现过：Vercel Cron 用平台级调度，而 Kubernetes 的 CronJob、AWS EventBridge 也走"外部触发 + 幂等处理"这条路。判断标准是部署形态，不是框架有没有这个功能。

**面试常见问题与解题思路**

**Q1：为什么不用 `@nestjs/schedule`？**

怎么想 → 先问部署形态，再问功能。怎么答 → 在缩容到零、可能多实例的容器平台上，内存定时器会漏触发或重复触发；改成外部调度器打 HTTP 端点，再用数据库唯一索引保证只执行一次。追问 → 如果应用改成常驻单实例，你会换回去吗？（可以，但幂等那层不该撤，因为实例重启和手工重跑仍会重复触发。）

**Q2：外部调度器打进来时，怎么保证不重复发帖？**

怎么想 → 想"两个请求同时到达会怎样"。怎么答 → 不做"先查有没有"的判断，直接往 `daily_picks` 插一行，让 `date` 的唯一索引裁决，撞键的那个返回 `already-published`。追问 → 如果被触发了十次呢？（九次拿到 `already-published` 立刻返回，只有一次真干活。）

---

### 2. 幂等为什么靠唯一索引

**实现方法**

```ts
try {
  await this.pickModel.create({ date, repoId: candidate.id, /* ... */ postId: null })
} catch (error) {
  if (isDuplicateKeyError(error)) {
    return { status: 'already-published', date, reason: '并发触发，已有实例在发布' }
  }
  throw error
}
```

`daily_picks` 上两个唯一索引各管一件事：`date` 保证一天至多一篇，`repoId` 保证同一个项目永远不被推第二次。`isDuplicateKeyError` 判的是 MongoDB 错误码 `11000`。

**原理**

"先查一遍，没有就插入"在并发下是不成立的：两个请求可能同时查到"不存在"，然后都去插入。查询和插入之间有一个时间窗口，应用层的检查跨不过它。

唯一索引由数据库维护，任何并发都绕不过去。所以正确做法是**直接写，让数据库裁决**，再把数据库错误翻译成业务语义：撞 `date` 是"今天发过了"，撞 `repoId` 是"这个项目推过了"。

**与相关技术栈的关系**

这是本项目从阶段 6 的点赞功能就定下的规矩。"同一个人对同一篇帖子只能赞一次"用的是 `{ postId, userId }` 复合唯一索引，靠的也是同一个 `isDuplicateKeyError`。第二个使用者出现时，这个工具函数被从 `users.service.ts` 提取到了 `common/utils/mongo-errors.ts`。

换成 PostgreSQL 也是同一套思路，只是错误码从 `11000` 变成 `23505`。用 Redis 做分布式锁是另一条路，但它多引入一个组件，还得处理锁超时和续期；能用唯一索引表达约束时，那条路更重。

**面试常见问题与解题思路**

**Q1：为什么不用分布式锁？**

怎么想 → 想"约束能不能让数据库直接表达"。怎么答 → "一天一篇"和"项目不重复"本身就是唯一性约束，唯一索引直接表达它，不需要额外的锁；锁要考虑超时、续期、锁服务挂掉，而唯一索引没有这些状态。追问 → 什么情况下还是得上锁？（需要保护的是一段跨多步的业务流程，而不是单次写入的唯一性时。）

**Q2：唯一键冲突时该返回 409 还是成功？**

怎么想 → 问"用户想要的状态达成了没有"。怎么答 → 点赞那种幂等操作，目标状态已达成，返回成功并说明"已赞过"，不重复加计数；这里的 `already-published` 同理，它不是错误状态，只是今天不用再干活了。追问 → 那什么情况该报错？（同一操作产生了不同结果、或需要调用方换参数时。）

---

### 3. AI 挂了照样发

**实现方法**

```ts
const aiContent = await this.generateWithAi(candidate, readme, settings)
const source: 'ai' | 'template' = aiContent ? 'ai' : 'template'
const content = aiContent ?? buildFallbackReport(candidate, readme).content
```

`generateWithAi` 内部把所有异常都吞掉返回 `null`：没配 Key、请求超时、输出过短，统统退回模板版。模板版是一张数据卡片，带上项目名、语言、star、官方描述和 README 摘要。发帖时把用的是哪条路径记进 `source` 字段，前端在 `source === 'template'` 时显示"AI 不可用，这是模板版"。

**原理**

AI 在这个功能里是增强，不是前提。它挂掉时正确的行为是"内容朴素一点"，而不是"今天没有更新"。所以调用点包了兜底，失败路径通向一个仍然完整可读的结果。

`source` 字段的存在是为了让降级**说得出来**。静默降级比不降级更麻烦：用户看到一段干巴巴的文字，会以为是"AI 写得不好"，而不是"AI 没工作"。

超时这一项有具体来历。它最初配成 40 秒，上线后**每一篇都退回了模板版**，而界面上完全正常。日志里只有一句：

```text
AI 生成报道失败，改用模板兜底：AI 响应超时（40000ms），请稍后再试
```

实测一篇 400 到 800 字的中文报道要 27 到 41 秒，最慢的一次正好 40.6 秒。也就是说 40 秒不是"偶尔不够"，而是多数时候都不够。现在默认 90 秒，依据是两件事：一是实测耗时的最坏值，二是平台上限（Hobby 套餐的 Vercel Function 默认值与上限都是 300 秒）。

这里能学到的判断方法：**超时值要按实测最坏值定，并且要留出倍数级的余量**。按"平均耗时"定，失败率就是一半。

**与相关技术栈的关系**

这是项目里"AI 走旁路"的一贯做法，阶段 7 的发帖摘要也是同样结构：主链路（发帖）成功与否不取决于 AI。

在架构上它对应两种常见的降级策略。一种是"熔断"：连续失败后一段时间内直接不再调用。另一种是"每次尝试、失败即兜底"，本项目用的是后一种，因为每天只调用一次，熔断器需要维护的状态反而比它省下的开销更多。

**面试常见问题与解题思路**

**Q1：AI 服务挂了，你的功能会怎么样？**

怎么想 → 先分清楚"AI 是功能的前提还是增强"。怎么答 → 是增强：失败时退回模板版数据卡片，当天照常更新，并把降级这件事标注出来。追问 → 怎么知道降级发生过？（`source` 字段存进数据库，可以统计"有多少天 AI 真的可用"。）

**Q2：怎么避免 AI 输出把内容搞坏？**

怎么想 → 把模型输出当外部输入对待。怎么答 → 长度过短视为无效；正文最终按 `CONTENT_MAX_LENGTH` 截断；标签只允许白名单里的值，映射不到就落兜底标签，宁可少打一个也不能让发帖在校验层失败。追问 → 那模型的输出格式不稳怎么办？（要求固定结构，或者像项目简介那样要求 JSON 并做校验。）

---

### 4. 公开写接口的权限分级

**实现方法**

三个端点三种权限，各有各的理由：

| 端点 | 鉴权 | 为什么 |
| --- | --- | --- |
| `POST /api/internal/daily-digest` | 令牌 | 由调度器调用，令牌即身份 |
| `POST /api/internal/daily-digest/revoke` | 令牌 | 能删公开内容，权限必须比生成更严 |
| `GET /api/daily-digest/today` | 公开 | 只读状态，页面一加载就会打 |
| `POST /api/daily-digest/generate` | 公开，但受 `publishHour` 约束 | 页面按钮要能用，但不能让访客决定发布时间 |

公开的生成端点不是直通主流程的：

```ts
async runDailyDigestByVisitor(): Promise<void> {
  const settings = this.readSettings()
  if (!settings.enabled) return
  if (!this.canPublishNow(settings)) return
  await this.runDailyDigest()
}
```

**原理**

把权限按"这个操作最坏能造成什么"来分。生成最坏是多发一篇（一天只可能有一篇）；撤回最坏是删掉公开发布的内容，所以它必须带令牌，并且**不给前端做按钮**。

生成端点之所以要加时间闸门，是因为它没有鉴权。没有闸门的话，半夜第一个打开页面的人就把当天那篇发掉了，早上来的人看到的是"今天已经发过了"，等于任何一个访客都能决定发布时间。

闸门只加在访客这条路径上，不加进 `runDailyDigest()`。因为 Cron 也调那个方法，把闸门写进去，将来有人只改 Cron 时刻、没改 `publishHour`，就会得到"Cron 按时打进来却什么都不发"的哑失败。

**与相关技术栈的关系**

这套分法和 REST 里"用 HTTP 方法表达意图"是同一件事：`GET /daily-digest/today` 只读，`POST` 才产生写入，中间件按方法挂鉴权。

对比"给所有写接口都加管理后台鉴权"的做法，这里的判断依据是**权限要不要用户身份**。调度器和运维用的是令牌而不是登录会话，因为他们根本不是这个应用的用户。项目里的评论、点赞则相反，它们必须绑定登录用户，因为"是谁"本身就是业务数据。

**面试常见问题与解题思路**

**Q1：为什么有的写接口不鉴权？**

怎么想 → 先问"最坏能坏成什么样"。怎么答 → 公开的生成端点最坏是多发一篇，而唯一索引保证一天至多一篇，所以风险可控；但它仍然加了时间闸门，避免访客决定发布时间。撤回能删内容，所以必须带令牌。追问 → 那不限流行不行？（限流挡的是资源消耗，正确性不靠它，两件事要分开考虑。）

**Q2：为什么闸门不加在公共方法里？**

怎么想 → 想"这个方法的调用者有几种、时间语义是否相同"。怎么答 → 调用者有两种：Cron 和访客按钮，它们的时间语义不同。闸门写在公共方法里会让两个调用方共享一套不该共享的规则。追问 → 这样会不会有重复代码？（不会，闸门只有一个实现，只是放在只有访客经过的那条路径上。）

---

### 5. 撤回为什么用独立排除表

**实现方法**

撤回要达到两件事：当天能换一个项目补发，被撤的项目不再出现。做法是新建一个集合：

```ts
@Schema({ timestamps: true, collection: 'daily_pick_excludes' })
export class DailyPickExclude {
  /** 永不推荐的仓库 id，唯一索引是这条规则的最终权威 */
  @Prop({ required: true, unique: true, index: true })
  repoId!: number

  /** 原本发布的那天。普通索引，不唯一：同一天可能撤回多次 */
  @Prop({ required: true, index: true })
  date!: string
}
```

撤回的四步按固定顺序执行：

```ts
// 1. 先在排除表登记
await this.excludeModel.updateOne({ repoId: pick.repoId }, { $set: { /* 快照 */ } }, { upsert: true })

// 2. 删帖（权限条件内嵌在查询里，传机器人身份就只能删机器人自己的帖子）
await this.postsService.remove(pick.postId, bot)

// 3. 级联删掉那篇的评论与点赞
const removed = {
  comments: await this.commentsService.deleteByPost(pick.postId),
  likes: await this.likesService.deleteByPost(pick.postId),
}

// 4. 最后才释放当天名额
await this.pickModel.deleteOne({ date: targetDate })
```

**原理**

先说顺序。把"释放名额"放最后，是为了让中途失败停在一个安全状态：排除表已经写了，所以那个项目不会被再选中；当天记录还在，所以当天不会重复发布。反过来先删记录，一次崩溃之后就同时具备"可能重复发布"和"可能把刚撤掉的项目又选回来"两个问题。

再说为什么不用另一种实现。最直觉的做法是给 `daily_picks.date` 加一个部分唯一索引（只对未撤回的行生效），把"已撤回"标记在原来那行上。这在生产上会静默失败：`date` 上已经有一个名为 `date_1` 的唯一索引，改成部分索引后 Mongoose 会拿**同一个索引名**去建，而 MongoDB 对同名但选项不同的索引会抛 `IndexOptionsConflict`（错误码 85），新索引永远建不出来。结果是 `date` 仍是全量唯一，撤回后当天那个名额依然被占着，表现成"撤了之后今天就不再更新"，而且没有任何报错。

独立成一张表就绕开了整件事：`daily_picks` 的索引语义一个字都不用改，也不需要任何索引迁移，顺带还多了一本撤回台账。

**与相关技术栈的关系**

这属于索引迁移的常见坑：MongoDB 的索引按**名字**区分，改选项要显式 `dropIndex` 再重建，而 Mongoose 的 `autoIndex` 不会替你做这件事。同样的道理在 PostgreSQL 上对应 `CREATE INDEX CONCURRENTLY` 与索引重建的运维窗口。

对比"软删除"这种通用做法：软删除保留原行、加一个 `deletedAt`，这在查询侧要多写一个条件，在唯一索引侧就会遇到同样的问题（唯一约束不认识 `deletedAt`）。所以软删除通常要配部分索引，而部分索引一旦要改就得面对上面那个坑。

**面试常见问题与解题思路**

**Q1：为什么不用部分唯一索引做软删除？**

怎么想 → 想"索引名和选项能不能改"。怎么答 → 能改，但要手工 `dropIndex` 再重建，漏掉就会静默失效：旧索引还在，新规则不生效，而且没有任何报错。这里选独立排除表，让既有索引的语义完全不动。追问 → 那什么情况该用部分索引？（新增一张表、或者本来就要做索引迁移时，它更省一张集合。）

**Q2：撤回的四步里哪一步最关键？**

怎么想 → 问"哪一步的顺序错了会静默变坏"。怎么答 → 释放名额必须是最后一步。中间失败时要停在"排除表已写、当天名额未释放"的状态，那个状态既不会重复发布，也不会把刚撤掉的项目选回来。追问 → 如果第 2 步删帖失败了呢？（记 warn 后继续，因为帖子可能已经被人工删掉了，让撤回卡在这里会导致名额永远释放不出来。）

---

### 6. 机器人为什么建成真实用户

**实现方法**

```ts
private async ensureBotUser(username: string): Promise<AuthenticatedUser> {
  // 邮箱唯一索引是并发时的最终防线，所以这里用固定邮箱而不是随机邮箱
  const email = `${username}@studyplan.local`

  const existing = await this.usersService.findByEmail(email)
  if (existing) return { id: String(existing._id), email: existing.email, username: existing.username }

  try {
    const created = await this.usersService.create({
      email,
      username,
      password: randomBytes(32).toString('hex'),   // 随机密码 = 账号无法登录
    })
    return { id: String(created._id), email: created.email, username: created.username }
  } catch (error) {
    // 并发下另一个实例可能刚建好，再查一次而不是让今天的任务失败
    const raced = await this.usersService.findByEmail(email)
    if (raced) return { id: String(raced._id), email: raced.email, username: raced.username }
    throw error
  }
}
```

发帖时不走 HTTP，直接调服务层：

```ts
const bot = await this.ensureBotUser(settings.botUsername)
const post = await this.postsService.create({ title, content, tags }, bot)
```

**原理**

帖子文档里存的是作者快照 `{ id, username }`，其中 `id` 指向 `users` 集合里的真实文档。前端的作者信息和头像都是拿这个 id 去取的，随手编一个 id 也能存进去，但点开作者名会什么都打不开。

密码用 32 字节随机串，是为了让这个账号**没有登录能力**：没人知道明文，哈希又不可逆。

不走 HTTP 有两个具体原因。全局校验管道开了 `forbidNonWhitelisted`，请求体里多一个字段就是 400，而报道正文之外还想带来源信息；`POST /posts` 又在认证守卫之下，作者只能来自 JWT，而定时任务没有会话。直接调服务层则两个问题都不存在。

**与相关技术栈的关系**

这是"内部调用不走 HTTP"的常见做法，和单体应用里服务之间互相注入是同一件事。对应的反面是"自己给自己发 HTTP 请求"，那样会把限流、鉴权、序列化都白白跑一遍，还多一个失败点。

不过要注意这条路的边界：`PostsService.create()` 不做作者真实性校验，校验在守卫里。也就是说服务层信任调用方传进来的 `actor`。这个假设对模块内的调用成立，但如果哪天有人把它接到一个 HTTP 端点上，就等于让请求方随意指定作者。这也是撤回之所以要给 `PostsService.remove` 传机器人身份的原因：那里的权限条件是内嵌在查询里的（`'author.id': actor.id`），所以它**物理上删不掉任何真实用户的帖子**。

**面试常见问题与解题思路**

**Q1：机器人为什么建真实账号，不直接在帖子里写个虚拟作者？**

怎么想 → 想"前端拿这个 id 去干什么"。怎么答 → 作者快照的 id 会被用来查用户、渲染作者信息，指向真实文档才不会留下打不开的链接。追问 → 那怎么防止它被登录？（密码用随机串，没人知道明文，哈希不可逆。）

**Q2：内部任务为什么不走自己的 HTTP 接口？**

怎么想 → 数一数走 HTTP 会多出哪些环节。怎么答 → 会多出鉴权、限流、请求体白名单校验和一次网络往返，而这些对内部任务要么没意义、要么会挡住它想带的数据。追问 → 这样做有什么风险？（服务层信任传入的 `actor`，所以这条路只能内部用，接上 HTTP 就等于放弃作者校验。）

---

## 四、上线检查清单

```text
□ Vercel 环境变量只勾了 Production，没勾 Preview
□ DAILY_DIGEST_ENABLED=true
□ DAILY_DIGEST_CRON_TOKEN 已设置，且与 CRON_SECRET 完全一致
□ NVNIM_API_KEY 已在 Production 配好
□ 已重新部署（环境变量与 vercel.json 的 crons 都要新部署才生效）
□ curl /api/daily-digest/today 看到 enabled=true、cronConfigured=true
□ 页面「GitHub 热门项目」顶部区块能正常显示状态，不报错
□ 部署次日确认当天那篇真的发出去了（发布时间约 09:00-09:15 之间）
```

最后一条不能省。这个装置最擅长的就是"什么都不做还不报错"，所以第一次上线之后要主动确认它真的干过活，而不是等发现问题时才发现它从来没跑起来。
