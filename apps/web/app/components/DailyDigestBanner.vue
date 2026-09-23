<script setup lang="ts">
/**
 * 「每日 GitHub 项目报道」的今日推荐区块。
 *
 * ── 它的首要职责是"说清楚状态"，展示推荐倒在其次 ──
 *
 * 这个装置最糟糕的表现是**静默**：总开关没开、定时令牌没配、还没到发布时间、
 * 候选池刚好为空 —— 每一种的结果都只是"今天没有推荐"，
 * 界面一片空白，维护者根本分不清是哪一种，只能去翻环境变量猜。
 *
 * 所以后端把各项开关状态一起返回（见 `DailyDigestStatusResponse`），
 * 这个区块负责把它翻译成人话。降级可以，但必须**说得出来**。
 */


const { status, loading, generating, error, refresh, generate, ensureOnce } = useDailyDigest()

onMounted(() => {
  void ensureOnce()
})

/** 单独取出来，模板里的类型收窄更干净 */
const pick = computed(() => status.value?.pick ?? null)

/**
 * 没有推荐时，给出一句能解释原因的说明。
 * 顺序很重要：先说"没启用"，再说"不会自动发布"，最后才是"还没生成"。
 */
const notice = computed<string | null>(() => {
  const current = status.value
  if (!current || current.pick) return null

  if (!current.enabled) {
    return '装置当前是关闭的（DAILY_DIGEST_ENABLED 未开启），不会自动发布。'
  }
  if (!current.cronConfigured && !current.lazyTrigger) {
    return '已启用，但既没有配置定时令牌、也关掉了惰性触发，因此不会自动发布。'
  }
  if (!current.canPublishNow) {
    return `今天的推荐要等到 ${current.publishHour} 点之后才会生成，现在还没到时间。`
  }
  return '今天的推荐还没生成，点右侧「立即生成」可以补一篇。'
})

/**
 * 「立即生成」要不要置灰。
 *
 * 只在**没有推荐、且未到发布时间**时置灰。今天已经有推荐时按钮是「刷新」，
 * 那只是读取状态，任何时候都该能点 —— 把读取也一起禁掉就过度了。
 */
const generateBlocked = computed(
  () => Boolean(status.value?.enabled) && !pick.value && !status.value?.canPublishNow,
)

/**
 * 按钮文案跟着状态走，让"为什么点不了"直接写在按钮上。
 * 置灰却不给理由，用户只会以为界面坏了。
 */
const actionLabel = computed(() => {
  if (pick.value) return '刷新'
  if (generateBlocked.value) return `${status.value?.publishHour ?? 0} 点后可生成`
  return '立即生成'
})
</script>

<template>
  <!--
    my-4（16px）：与 BentoGrid 的 gap-4、筛选面板的 mb-4 同值，
    使「筛选面板 ↔ 本卡 ↔ 项目网格」三者的间距一致。
    相邻外距会折叠，所以上方 16px、下方 16px，不会累加成 32px。

    body 用 p-5（20px）而非 p-4 sm:p-5：与下方项目卡（BentoCard p-5）同值，
    本卡的 sparkles 图标才会和卡片内容落在同一条左边界上。

    ⚠️ 必须连 `sm:` 断点一起写：UCard 的 body 预设是 `p-4 sm:p-6`，
       只覆写 `p-*` 的话，≥640px 时 `sm:p-6` 仍会生效、内距跳回 24px，
       对齐全功尽弃（侧栏的进度卡踩过同一个坑）。
  -->
  <UCard v-if="status || error" class="my-4" :ui="{ body: 'p-5 sm:p-5' }">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-1.5">
          <UIcon name="i-lucide-sparkles" class="size-[var(--icon-sm)] text-ai-600" />
          <span class="text-body-sm font-medium text-toned">每日 GitHub 项目报道</span>
          <UBadge v-if="status" variant="subtle" color="neutral" size="xs">
            {{ status.date }}
          </UBadge>
        </div>

        <template v-if="pick">
          <p class="mt-2 truncate text-body-sm text-highlighted">
            {{ pick.fullName }}
            <span v-if="pick.language" class="text-muted"> · {{ pick.language }}</span>
            <span class="text-muted"> · ★ {{ pick.stargazersCount.toLocaleString() }}</span>
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption">
            <NuxtLink
              v-if="pick.postId"
              :to="`/posts/${pick.postId}`"
              class="text-primary hover:underline"
            >
              阅读这篇报道
            </NuxtLink>
            <ULink
              :to="pick.htmlUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 text-muted hover:text-primary"
            >
              仓库
              <UIcon name="i-lucide-external-link" class="size-[var(--icon-xs)]" />
            </ULink>
            <span v-if="pick.source === 'template'" class="text-muted">AI 不可用，这是模板版</span>
          </div>
        </template>

        <p v-else-if="notice" class="mt-2 text-body-sm text-muted">{{ notice }}</p>

        <p v-if="status && status.enabled && !status.aiEnabled" class="mt-2 text-caption text-muted">
          提示：未配置 NVNIM_API_KEY，报道会以模板兜底版发布。
        </p>
        <p v-if="error" class="mt-2 text-caption text-muted">{{ error }}</p>
      </div>

      <!-- 装置没启用时连按钮都不给：按了也不会发生任何事，不如不显示 -->
      <UButton
        v-if="status?.enabled"
        size="xs"
        variant="soft"
        color="primary"
        :loading="generating || loading"
        :disabled="generateBlocked"
        :icon="pick ? 'i-lucide-refresh-cw' : 'i-lucide-sparkles'"
        @click="pick ? refresh() : generate()"
      >
        {{ actionLabel }}
      </UButton>
    </div>
  </UCard>
</template>
