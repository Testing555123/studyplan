<script setup lang="ts">
/**
 * 智能搜索页（/search）。
 *
 * 两个 Tab 写进 URL（?mode=），刷新/分享后停在原地；
 * 语义搜索的状态全在 useSemanticSearch 里，本页只做呈现。
 */
const route = useRoute()
const router = useRouter()

// useSemanticSearch 返回的是普通对象包着若干 ref；模板里访问嵌套 ref 不会自动解包，
// 用 reactive 包一层，semantic.xxx 才能像预期那样读到值、写回值。
const semantic = reactive(useSemanticSearch())

/** Tab 写进 URL（?mode=）：刷新/分享后停在原地 */
const mode = ref(route.query.mode === 'ask' ? 'ask' : 'semantic')
watch(mode, (value) => {
  void router.replace({
    query: { ...route.query, mode: value === 'ask' ? 'ask' : undefined },
  })
})

// UTabs 的 v-model 绑定到 item.value（Nuxt UI v4）：必须显式给 value，
// 否则 mode 的字符串值对不上，切页会失灵。
const tabs = [
  { label: '语义搜索', value: 'semantic' },
  { label: '问全书', value: 'ask' },
]

const exampleChips = ['如何学 NestJS？', '前端性能从哪下手？', 'MongoDB 索引怎么建？']

// askBox 与 semantic 同理：模板里无 .value 访问，用 reactive 包一层（内部自动解包）。
const askBox = reactive(useAskSearch())
const auth = useAuth()
const { render } = useMarkdown()

/**
 * 把答案里的 [n] 引用标成锚点链接，点击跳到下方来源列表对应项。
 * 在 markdown 渲染产物上做替换是安全的：[1] 不是合法 HTML 标签，
 * 只会出现于文本节点；来源列表本身是结构化数据不是 HTML。
 */
const renderedAnswer = computed(() => {
  if (!askBox.answer) return ''
  return askBox.sources.length
    ? render(askBox.answer).replace(
        /\[(\d+)\]/g,
        (_m, n) => `<a href="#ask-source-${n}" class="text-primary font-medium hover:underline">[${n}]</a>`,
      )
    : render(askBox.answer)
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6 p-6">
    <h1 class="text-heading font-semibold tracking-tight text-highlighted">智能搜索</h1>

    <UTabs v-model="mode" :items="tabs" />

    <section v-show="mode === 'semantic'" class="space-y-4">
      <UInput
        v-model="semantic.query"
        icon="i-lucide-search"
        placeholder="用一句自然语言描述你想找什么…"
        size="xl"
        class="w-full"
        :loading="semantic.pending"
      />

      <!-- 空查询时给示例 chip，而不是一个死寂的禁用界面 -->
      <div v-if="!semantic.query.trim()" class="flex flex-wrap gap-2">
        <UButton
          v-for="chip in exampleChips"
          :key="chip"
          color="neutral"
          variant="subtle"
          size="sm"
          :label="chip"
          @click="semantic.query = chip"
        />
      </div>

      <p v-if="semantic.reason === 'not-configured'" class="text-sm text-muted">
        AI 服务未启用，语义搜索暂不可用。
      </p>
      <p v-else-if="semantic.reason === 'index-empty'" class="text-sm text-muted">
        站内内容还不够，去发几篇帖子吧。
      </p>
      <p v-else-if="semantic.reason === 'error'" class="text-sm text-muted">
        搜索服务出了点问题，稍后再试。
      </p>

      <div class="space-y-4">
        <PostCard
          v-for="item in semantic.results"
          :key="item.post.id"
          :post="item.post"
          :score="item.score"
        />
      </div>
    </section>

    <!-- 问全书面板：登录门槛 + 引用脚注 -->
    <section v-show="mode === 'ask'" class="space-y-4">
      <!-- 未登录：整个回答区替换为登录引导。输完才被弹走是最差的体验 -->
      <UCard v-if="!auth.user.value">
        <p class="text-sm">「问全书」需要登录后使用，登录后即可向站内内容提问。</p>
        <UButton
          class="mt-3"
          label="去登录"
          icon="i-lucide-log-in"
          @click="navigateTo('/login?redirect=' + encodeURIComponent('/search?mode=ask'))"
        />
      </UCard>

      <template v-else>
        <div class="flex gap-2">
          <UInput
            v-model="askBox.question"
            placeholder="问一个站内帖子能回答的问题…（回车提交）"
            size="lg"
            class="flex-1"
            :loading="askBox.pending"
            @keyup.enter="askBox.ask"
          />
          <UButton label="提问" :disabled="!askBox.question.trim() || askBox.pending" @click="askBox.ask" />
        </div>

        <p v-if="askBox.remainingToday !== null" class="text-caption text-muted">
          今日还可提问 {{ askBox.remainingToday }} 次<span v-if="askBox.cached">· 本次来自缓存</span>
        </p>

        <!-- reason 的每一种人话都告诉用户下一步该做什么（与 AiUnavailableReason 同源思想） -->
        <UAlert v-if="askBox.reason === 'no-sources'" color="neutral" variant="subtle" icon="i-lucide-help-circle" title="站内的帖子还没有覆盖这个问题" />
        <UAlert v-else-if="askBox.reason === 'quota-exceeded'" color="warning" variant="subtle" title="今天的提问额度用完了，明天再来" />
        <UAlert v-else-if="askBox.reason === 'rate-limited'" color="warning" variant="subtle" title="你问得太快了，稍等一下再试" />
        <UAlert v-else-if="askBox.reason" color="error" variant="subtle" title="AI 服务出了点问题，可以稍后重试" />

        <div v-if="askBox.answer" class="space-y-4">
          <!-- 与帖子详情页同源：内容都是经 markdown 渲染器白名单过后的 HTML -->
          <div class="prose prose-sm max-w-none" v-html="renderedAnswer" />

          <UCard v-if="askBox.sources.length">
            <p class="mb-2 text-eyebrow font-semibold uppercase text-muted">参考来源</p>
            <ol class="space-y-2">
              <li v-for="(source, index) in askBox.sources" :key="source.postId">
                <NuxtLink
                  :id="`ask-source-${index + 1}`"
                  :to="`/posts/${source.postId}`"
                  class="flex items-center justify-between gap-3 text-sm no-underline hover:text-primary"
                >
                  <span>[{{ index + 1 }}] {{ source.title }}</span>
                  <UBadge color="neutral" variant="subtle" size="xs">{{ Math.round(Math.max(0, source.score) * 100) }}%</UBadge>
                </NuxtLink>
              </li>
            </ol>
          </UCard>
        </div>
      </template>
    </section>
  </div>
</template>
