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

    <!-- Task 10 在这里填「问全书」面板 -->
    <section v-show="mode === 'ask'" />
  </div>
</template>
