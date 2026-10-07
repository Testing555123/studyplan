/**
 * 迁移脚本的合成测试数据（写入独立库 studyplan_migtest，不碰 studyplan）
 *
 * ⚠️ mongosh 里 `db` 是全局内置变量，不能用 `const db = ...` 重新声明，
 *    否则整段脚本会 SyntaxError 且只报行号、不说明原因。这里用 tdb。
 *
 * 覆盖的真实难点：
 *  - 1024 维向量 → pgvector 字面量
 *  - 强引用（comments.postId / likes.userId / roadmap_progress.userId）
 *  - 弱引用 daily_picks.postId 的四种形态：可映射 / 非法值 / 孤儿 / 空（R-B）
 *  - jsonb（trending_caches.items / roadmap_progress.steps）
 *  - avatarColor 字符串 → avatar_gradient 下标（含无法识别的色值）
 *  - 重复点赞与重复题目 → 复合唯一只应保留 1 条
 */
const tdb = db.getSiblingDB('studyplan_migtest')

const collections = [
  'users', 'posts', 'comments', 'likes', 'ai_daily_usage', 'ai_answer_cache', 'postembeddings',
  'trending_caches', 'repo_snapshots', 'repo_intros', 'daily_picks', 'daily_pick_excludes',
  'roadmap_progress', 'interview_questions',
]
collections.forEach((c) => tdb[c].deleteMany({}))

// 固定 ObjectId，便于对账时断言
const uid = ObjectId('507f1f77bcf86cd799439011')
const uid2 = ObjectId('507f1f77bcf86cd799439012')
const pid = ObjectId('507f191e810c19729de860ea')
const cid = ObjectId('507f191e810c19729de860eb')
const orphanOid = ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa') // 合法 hex，但没有对应文档

const vec = (seed) => Array.from({ length: 1024 }, (_, i) => Math.sin(i + seed) * 0.5)

tdb.users.insertMany([
  { _id: uid, email: 'A@Example.com', username: 'alice', passwordHash: '$2b$10$aaa', avatarColor: 'from-rose-500 to-pink-600', bio: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') },
  { _id: uid2, email: 'bob@example.com', username: 'bob', passwordHash: '$2b$10$bbb', avatarColor: '不存在的色值', bio: 'hi', createdAt: new Date('2026-01-03'), updatedAt: new Date('2026-01-04') },
])

tdb.posts.insertMany([
  { _id: pid, title: 'TS 类型体操', content: '正文', summary: null, tags: ['ts', 'vue'],
    author: { id: '507f1f77bcf86cd799439011', username: 'alice' },
    commentCount: 2, likeCount: 1, isDailyPick: false, embeddingModel: 'bge-zh',
    createdAt: new Date('2026-02-01'), updatedAt: new Date('2026-02-02') },
])

tdb.comments.insertMany([
  { _id: cid, postId: pid, content: '好文', author: { id: '507f1f77bcf86cd799439011', username: 'alice' }, createdAt: new Date('2026-02-03') },
  // 指向不存在的帖子 → 迁移时应被跳过（不能写入 post_id 为 NULL 的行）
  { _id: ObjectId('507f191e810c19729de860ec'), postId: orphanOid, content: '孤儿评论', author: { id: 'x', username: 'ghost' }, createdAt: new Date('2026-02-04') },
])

tdb.likes.insertMany([
  { _id: ObjectId('507f191e810c19729de860ed'), postId: pid, userId: uid, createdAt: new Date('2026-02-05') },
  { _id: ObjectId('507f191e810c19729de860ee'), postId: pid, userId: uid, createdAt: new Date('2026-02-06') }, // 重复点赞
])

tdb.ai_daily_usage.insertOne({ _id: ObjectId('507f191e810c19729de860ef'), date: new Date('2026-02-05'), used: 7, updatedAt: new Date('2026-02-05') })
tdb.ai_answer_cache.insertOne({ _id: ObjectId('507f191e810c19729de860f0'), hash: 'h1', answer: 'A1', createdAt: new Date('2026-02-05') })

tdb.postembeddings.insertOne({ _id: ObjectId('507f191e810c19729de860f1'), postId: pid, model: 'bge-large-zh-v1.5', vector: vec(1), createdAt: new Date('2026-02-05') })

tdb.trending_caches.insertOne({ _id: ObjectId('507f191e810c19729de860f2'), range: 'daily', items: [{ fullName: 'a/b', stars: 1 }], fetchedAt: new Date('2026-02-05'), lastAttemptAt: new Date('2026-02-05'), createdAt: new Date('2026-02-05') })
tdb.repo_snapshots.insertOne({ _id: ObjectId('507f191e810c19729de860f3'), repoId: 123456, fullName: 'a/b', payload: { stars: 10 }, fetchedAt: new Date('2026-02-05'), createdAt: new Date('2026-02-05') })
tdb.repo_intros.insertOne({ _id: ObjectId('507f191e810c19729de860f4'), repoId: 123456, intro: '简介', model: 'zen', inputHash: 'ih', createdAt: new Date('2026-02-05'), updatedAt: new Date('2026-02-05') })

tdb.daily_picks.insertMany([
  { _id: ObjectId('507f191e810c19729de860f5'), date: new Date('2026-02-05'), repoId: 123456, postId: pid.toString(), createdAt: new Date('2026-02-05') },        // 可映射
  { _id: ObjectId('507f191e810c19729de860f6'), date: new Date('2026-02-06'), repoId: 222222, postId: 'NOT_A_VALID_OID', createdAt: new Date('2026-02-06') },   // 非法值 → NULL
  { _id: ObjectId('507f191e810c19729de860f7'), date: new Date('2026-02-07'), repoId: 333333, postId: orphanOid.toString(), createdAt: new Date('2026-02-07') }, // 孤儿 → NULL
  { _id: ObjectId('507f191e810c19729de860f8'), date: new Date('2026-02-08'), repoId: 444444, postId: null, createdAt: new Date('2026-02-08') },                 // 空 → NULL
])

tdb.daily_pick_excludes.insertMany([
  { _id: ObjectId('507f191e810c19729de860f9'), repoId: 555555, date: new Date('2026-02-05'), reason: 'dup', option: 'a', postId: pid.toString(), createdAt: new Date('2026-02-05') },
  { _id: ObjectId('507f191e810c19729de860fa'), repoId: 666666, date: new Date('2026-02-05'), reason: 'dup', option: 'b', postId: null, createdAt: new Date('2026-02-05') },
])

tdb.roadmap_progress.insertOne({ _id: ObjectId('507f191e810c19729de860fb'), userId: uid, steps: { 'stage-1': { status: 'done' } }, roadmapVersion: 2, createdAt: new Date('2026-02-05'), updatedAt: new Date('2026-02-05') })

tdb.interview_questions.insertMany([
  { _id: ObjectId('507f191e810c19729de860fc'), nodeId: 'stage-1', question: '什么是闭包？', answer: 'A', priority: 'high', frequency: '高', company: 'X', createdBy: uid, createdAt: new Date('2026-02-05') },
  { _id: ObjectId('507f191e810c19729de860fd'), nodeId: 'stage-1', question: '什么是闭包？', answer: 'A2', priority: 'low', frequency: '中', company: 'Y', createdBy: uid, createdAt: new Date('2026-02-05') }, // 重复题目
])

print('seeded studyplan_migtest: ' + collections.map((c) => c + '=' + tdb[c].countDocuments()).join(' '))
