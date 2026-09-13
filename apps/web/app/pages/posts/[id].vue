<script setup lang="ts">
/**
 * 帖子详情页。
 *
 * 路由文件名 `[id]` 里的方括号是 Nuxt 的**动态路由**语法：
 * 访问 /posts/p-1001 时，`useRoute().params.id` 就是 'p-1001'。
 *
 * 这个页面的三个要点：
 *   1. `v-html` 渲染 Markdown 结果 —— 这是 Vue 里少数几个
 *      需要你亲口解释"为什么这里安全"的地方，见下方注释；
 *   2. 404 是一等公民：帖子不存在时显示专门的界面，而不是空白或报错；
 *   3. 阅读时长由正文推导，不需要后端提供字段。
 */
// 图标全部改用 Nuxt UI 的 Iconify 名称（i-lucide-*），无需逐个 import

const route = useRoute()
const postStore = usePostStore()
const { render, readingMinutes } = useMarkdown()

const postId = computed(() => String(route.params.id))

const { data: loaded } = await useAsyncData(
  () => `post-${postId.value}`,
  async () => {
    await postStore.fetchOne(postId.value)
    return postStore.current?.id ?? null
  },
  { watch: [postId] },
)

/** 并行拉评论，不阻塞正文渲染 */
await useAsyncData(
  () => `comments-${postId.value}`,
  async () => {
    await postStore.fetchComments(postId.value)
    return postStore.comments.length
  },
  { watch: [postId] },
)

const post = computed(() => postStore.current)

/**
 * 为什么这里用 v-html 是安全的？
 *   因为 useMarkdown() 里的 markdown-it 实例把 `html` 设成了 false，
 *   正文中任何原生 HTML 标签都会被**转义成文本**再输出。
 *   如果哪天把 html 改成 true，这一行就会立刻变成 XSS 漏洞入口。
 */
const bodyHtml = computed(() => (post.value ? render(post.value.content) : ''))

const minutes = computed(() => (post.value ? readingMinutes(post.value.content) : 0))

/**
 * 拉取失败（网络不通或服务端出错）。
 * 注意它与"404 不存在"必须分开判断 —— 两者的用户提示完全不同。
 */
const failed = computed(() => Boolean(postStore.error))

/**
 * 真正的不存在：请求成功但后端返回 404。
 * 必须排除 failed 的情况，否则"后端没启动"会被误报成"文章被删了"。
 */
const notFound = computed(() => loaded.value === null && !failed.value)

/**
 * AI 摘要是否可能"还在路上"。
 *
 * ── 为什么需要这个判断？ ──
 *
 * 因为 AI 增强是**旁路**的（不阻塞发帖，见后端的 enrichWithAi）。
 * 用户点"发布"后立刻跳到详情页，此时 AI 可能还没想完 ——
 * 于是他会看到一篇"没有摘要"的文章，并以为功能坏了。
 *
 * 判断条件是"刚发布 2 分钟内且没有摘要"。超过 2 分钟还没有，
 * 那就不是"还在生成"，而是"生成失败了（或 AI 未配置）"，
 * 此时不该继续给用户虚假的期待。
 *
 * > 一个实用原则：**异步结果没到时，界面要说"正在来"，
 * > 而不是"这里什么都没有"。** 两者对用户的感受差别很大。
 */
const aiPending = computed(() => {
  const current = post.value
  if (!current || current.summary) return false
  const ageMs = Date.now() - new Date(current.createdAt).getTime()
  return ageMs < 2 * 60 * 1000
})

/**
 * 只改界面、不改 HTTP 状态码，是一个很常见的疏漏：
 * 页面明明写着"找不到这篇文章"，响应码却是 200。
 * 搜索引擎会把这种页面当成正常内容收录，于是你的站点里
 * 会慢慢长出一堆"内容是不存在"的索引页。
 *
 * `setResponseStatus` 在服务端渲染时真的设置状态码，
 * 在客户端导航时是空操作（因为此时已经拿到响应了）。
 */
if (notFound.value) {
  setResponseStatus(404)
}

/**
 * 评论权限现在由真实登录态决定。
 *
 * 未登录时 `CommentList` 会把输入框换成"登录后即可参与讨论"，
 * 而不是让用户写完一大段才发现提交失败 ——
 * 把限制**提前告知**，比事后报错友善得多。
 */
const auth = useAuth()
const canComment = computed(() => auth.isLoggedIn.value)

function onToggleLike(): void {
  if (post.value) void postStore.toggleLike(post.value.id)
}

function onSubmitComment(content: string): void {
  void postStore.addComment(postId.value, content)
}

/**
 * 删除评论。
 *
 * 这里刻意**不做二次确认**，因为它不是破坏性很强的操作：
 * 评论内容短、误删成本低，而且按钮只对自己可见。
 * 反过来，删除整篇帖子就该加确认 —— 那是不可恢复的。
 *
 * 判断"要不要加确认"的标准不是"这是删除操作"，
 * 而是**误操作的代价有多大**。
 */
function onDeleteComment(commentId: string): void {
  void postStore.removeComment(commentId)
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 sm:px-6">
    <!-- 返回 -->
    <div class="pt-8">
      <UButton
        to="/"
        variant="link"
        color="neutral"
        size="sm"
        icon="i-lucide-arrow-left"
        class="px-0"
      >
        返回帖子流
      </UButton>
    </div>

    <!-- 帖子不存在 -->
    <UEmpty
      v-if="notFound"
      class="mt-10"
      icon="i-lucide-triangle-alert"
      title="找不到这篇文章"
      :description="`它可能已被作者删除，或者链接里的编号有误（id = ${postId}）`"
    >
      <template #actions>
        <UButton to="/" icon="i-lucide-home">回到帖子流</UButton>
      </template>
    </UEmpty>

    <!-- 服务故障：必须与"帖子不存在"区分开，并给出重试入口 -->
    <UAlert
      v-else-if="failed"
      class="mt-10"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      title="暂时打不开这篇文章"
      :description="postStore.error ?? ''"
    >
      <template #actions>
        <div class="mt-3 flex gap-3">
          <UButton
            size="sm"
            color="error"
            icon="i-lucide-refresh-cw"
            @click="postStore.fetchOne(postId)"
          >
            重试
          </UButton>
          <UButton size="sm" color="neutral" variant="outline" to="/">回到帖子流</UButton>
        </div>
      </template>
    </UAlert>

    <!-- 加载骨架 -->
    <div v-else-if="!post" class="mt-8 space-y-4">
      <USkeleton class="h-7 w-3/4" />
      <USkeleton class="h-3 w-40" />
      <USkeleton class="h-24 rounded-2xl" />
      <div class="space-y-2">
        <USkeleton class="h-3 w-full" />
        <USkeleton class="h-3 w-11/12" />
        <USkeleton class="h-3 w-4/5" />
      </div>
    </div>

    <!-- 正文 -->
    <article v-else class="pt-6 pb-4">
      <header>
        <h1
          class="text-display leading-tight font-semibold tracking-tight text-highlighted"
        >
          {{ post.title }}
        </h1>

        <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div class="flex items-center gap-2.5">
            <span
              class="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-body-sm font-semibold text-primary"
            >
              {{ avatarInitial(post.author.username) }}
            </span>
            <span class="text-body font-medium text-toned">
              {{ post.author.username }}
            </span>
          </div>

          <span class="text-dimmed">·</span>
          <time class="text-meta text-muted" :datetime="post.createdAt">
            {{ formatDate(post.createdAt) }}
          </time>
          <span class="text-dimmed">·</span>
          <span class="text-meta text-muted">约 {{ minutes }} 分钟读完</span>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <NuxtLink
            v-for="tag in post.tags"
            :key="tag"
            :to="`/?tag=${encodeURIComponent(tag)}`"
          >
            <UBadge variant="subtle" color="neutral" size="xs">{{ tag }}</UBadge>
          </NuxtLink>
        </div>
      </header>

      <!--
        AI 摘要 + 推荐标签。
        图标单独染成紫罗兰（全站 AI 强调色），其余样式交给 UAlert。
      -->
      <UAlert
        v-if="post.summary"
        class="animate-fade-up mt-7"
        color="info"
        variant="soft"
        icon="i-lucide-sparkles"
        title="AI 摘要"
        :ui="{ icon: 'text-violet-500' }"
      >
        <template #description>
          <p class="text-body leading-7">{{ post.summary }}</p>

          <!--
            AI 推荐标签与作者自己选的标签**分开显示**，样式也不同。
            这样读者一眼能分清"这是作者给的分类"还是"这是机器猜的"，
            作者也能清楚看到 AI 补充了什么。
          -->
          <div v-if="post.aiTags?.length" class="mt-3 flex flex-wrap items-center gap-1.5">
            <span class="text-eyebrow text-violet-600 dark:text-violet-400">推荐标签</span>
            <UBadge
              v-for="tag in post.aiTags"
              :key="tag"
              variant="outline"
              color="neutral"
              size="xs"
            >
              {{ tag }}
            </UBadge>
          </div>
        </template>
      </UAlert>

      <!--
        还没有摘要、但帖子很新 —— 说明 AI 正在生成中。
        这里给出"正在来"的预期，而不是留一片空白让用户以为坏了。
      -->
      <p v-else-if="aiPending" class="mt-7 flex items-center gap-2 text-meta text-muted">
        <UIcon name="i-lucide-sparkles" class="animate-pulse text-violet-500" />
        AI 正在为这篇文章生成摘要与推荐标签，稍后刷新即可看到
      </p>

      <!-- Markdown 正文 -->
      <div class="prose-post mt-8" v-html="bodyHtml" />

      <!-- 互动 -->
      <div class="mt-10 flex items-center gap-3 border-t border-default pt-6">
        <LikeButton
          :liked="postStore.isLiked(post.id)"
          :count="post.likeCount"
          @toggle="onToggleLike"
        />
        <span class="text-meta text-dimmed">觉得有用就点个赞，作者会看到</span>
      </div>

      <CommentList
        :comments="postStore.comments"
        :loading="postStore.commentsLoading"
        :submitting="postStore.commentSubmitting"
        :can-comment="canComment"
        :current-user-id="auth.user.value?.id ?? null"
        :error="postStore.commentError"
        @submit="onSubmitComment"
        @delete="onDeleteComment"
      />
    </article>
  </div>
</template>
