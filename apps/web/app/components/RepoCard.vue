<script setup lang="ts">
/**
 * GitHub 项目卡片，和 PostCard 一样只负责展示，交互通过 emit 交给页面：
 * 点「问 AI」时把整个 repo 抛出去，由页面决定怎么唤起助手；
 * 这样卡片将来也能用在别处（比如收藏列表），不被助手绑死。
 *
 * 两处 null 兜底是刻意的：GitHub 的 `description` 与 `language` 都可能是 null
 * （很多仓库不写简介，纯文档仓库没有语言）。不兜底会渲染出空白或 "undefined"，
 * 所以两者都要有明确的兜底文案，而不是假设它们一定有值。
 */
import { ExternalLink, GitFork, Star } from 'lucide-vue-next'
import { languageColor } from '@studyplan/shared'
import type { GithubRepo } from '@studyplan/shared'

const props = defineProps<{
  repo: GithubRepo
}>()

const emit = defineEmits<{
  (event: 'ask', repo: GithubRepo): void
}>()

/** 语言色点：没有语言时用中性灰，而不是不显示 */
const dotColor = computed(() => languageColor(props.repo.language))

const { introFor, ensure, isPending } = useRepoIntros()

const toast = useToast()

/** 手动触发生成 AI 简介；成功后轻提示，失败（无素材/已降级）保持静默，符合"增强功能不报错"策略 */
async function generateIntro(): Promise<void> {
  await ensure([props.repo])
  if (introFor(props.repo.id)) {
    toast.add({ title: '简介已生成', icon: 'i-lucide-check', color: 'success', duration: 3000 })
  }
}

/**
 * 展示用的简介：优先 AI 润色版，没有就退回 GitHub 官方 `description`。
 *
 * 拿不到润色版是**常态**（还没生成、AI 未启用、当日额度耗尽），
 * 所以这里必须是"回退"而不是"留空" ——
 * 用户始终能看到一句关于这个项目的话，区别只是中文还是英文。
 */
const displayIntro = computed(() => introFor(props.repo.id) ?? props.repo.description)

/** 话题标签最多展示 3 个，避免卡片被撑高、视觉上喧宾夺主 */
const visibleTopics = computed(() => props.repo.topics.slice(0, 3))
</script>

<template>
  <!--
    这里**不要**写 `h-full`。
    踩过的坑：加上它之后，卡片高度被强行绑定到网格行高，
    而 flex 子项（UCard 的 body）的 `min-height` 默认是 `auto`——
    它宁可溢出也不收缩，于是"话题标签"会压到 footer 的「问 AI」按钮上。
    去掉 `h-full` 即可：网格项本来就是 `align-items: stretch`，
    同一行里的卡片照样等高，但内容多的那张会把行高撑开而不是溢出。
  -->
  <!--
    半透明底（root: 'bg-default/80'），与首页卡片同一套视觉语言 —— 让背景光晕透上来。
    UCard 的 ui.root 会与主题里的 root 类做去重合并（tailwind-variants 内置 twMerge），
    所以只写要改的那一项即可，不必把圆角、边框、分隔线全部重抄一遍。

    ⚠️ 但**刻意不加 backdrop-blur**：这一页一屏二十几张卡，每张都做背景模糊的话，
       滚动时每帧都要重新采样背景，代价成倍放大。
       半透明而不模糊的观感已经足够"透气"，成本却接近于零。

    ⚠️ 注释只能写在标签外。Vue 模板的属性表达式不支持块注释，
       写进去会得到 "Error parsing JavaScript expression: Unterminated comment"。
  -->
  <UCard
    class="group relative flex flex-col transition-all duration-300 hover:border-primary hover:shadow-sm"
    :ui="{ root: 'bg-default/80', body: 'flex-1 p-5', footer: 'pt-0 pb-4 px-5' }"
  >
    <!-- 拥有者 -->
    <div class="flex items-center gap-2">
      <UAvatar :src="repo.ownerAvatarUrl" :alt="repo.ownerLogin" size="2xs" loading="lazy" />
      <span class="truncate text-caption text-muted">{{ repo.ownerLogin }}</span>
    </div>

    <!--
      项目名：点进去看**站内详情**。

      整张卡片可点，靠的是标题链接上的 `after:inset-0` ——
      它在卡片内拉伸出一层透明的点击区，覆盖整张卡片。
      这样用户点哪里都能进详情，而不是只有这十来个字符是热区
      （只有标题可点时，用户点标签、点简介都没反应，会以为功能没做）。

      两个链接必须**并列**：`<a>` 里再套 `<a>` 是非法结构，
      浏览器会把外层那个悄悄拆掉，表现为"点了没反应"且很难排查。

      外链图标则用 `relative z-10` 抬到那层覆盖区**之上**，
      否则它会被覆盖区盖住 —— 看得见却点不到，同样很难排查。
    -->
    <h3 class="mt-2 flex items-center gap-1.5">
      <NuxtLink
        :to="`/trending/${repo.ownerLogin}/${repo.name}`"
        class="truncate text-subtitle font-semibold tracking-tight text-highlighted transition-colors after:absolute after:inset-0 after:rounded-2xl hover:text-primary group-hover:text-primary"
        :aria-label="`查看 ${repo.fullName} 的项目详情`"
      >
        {{ repo.name }}
      </NuxtLink>
      <ULink
        :to="repo.htmlUrl"
        target="_blank"
        rel="noopener"
        class="relative z-10 shrink-0 text-dimmed transition-colors hover:text-primary group-hover:text-primary"
        :aria-label="`在 GitHub 打开 ${repo.fullName}`"
        @click.stop
      >
        <ExternalLink :size="13" />
      </ULink>
    </h3>

    <!-- 简介：有 AI 润色版就显示它，否则仍是 GitHub 官方 description -->
    <p v-if="displayIntro" class="mt-2 line-clamp-2 text-body-sm leading-6 text-muted">
      {{ displayIntro }}
    </p>
    <p v-else class="mt-2 text-body-sm leading-6 italic text-muted">
      这个项目还没有填写简介
    </p>

    <!--
      话题标签。
     这里**不能**给 UBadge 加 `truncate`：它内部是 inline-flex + nowrap，
      加了 ellipsis 之后徽章既不收缩也不换行，长 topic 会直接冲出卡片边界
      （实测截图里就看到"ai-video"跑到了卡片外面）。
      正确做法是给徽章限宽、把截断交给内部的 span。
    -->
    <div v-if="visibleTopics.length > 0" class="mt-3 flex flex-wrap gap-1.5">
      <UBadge
        v-for="topic in visibleTopics"
        :key="topic"
        variant="soft"
        color="neutral"
        size="xs"
        class="max-w-full"
      >
        <span class="truncate">{{ topic }}</span>
      </UBadge>
    </div>

    <!-- 元信息行 -->
    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-muted">
      <span class="inline-flex items-center gap-1.5">
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: dotColor }" />
        <span>{{ repo.language ?? '未标注语言' }}</span>
      </span>

      <span class="inline-flex items-center gap-1 tabular-nums">
        <Star :size="13" />
        {{ repo.stargazersCount.toLocaleString() }}
      </span>

      <span class="inline-flex items-center gap-1 tabular-nums">
        <GitFork :size="13" />
        {{ repo.forksCount.toLocaleString() }}
      </span>

      <span class="text-dimmed">创建于 {{ formatRelativeTime(repo.createdAt) }}</span>
    </div>

    <template #footer>
      <!--
        footer 用 UFieldGroup 把两个按钮并排咬合：`问 AI` 走 primary 强调色，
        `自动编写简介` 走 neutral 次级色，视觉权重一主一次、对齐统一。
        `relative z-10` 同样是必须的：footer 在标题那层覆盖区之下，
        不抬起来的话按钮会被整卡点击区吞掉（看起来"点了没反应"）。
      -->
      <UFieldGroup class="relative z-10">
        <UButton
          class="relative z-10"
          size="xs"
          variant="soft"
          color="primary"
          icon="i-lucide-sparkles"
          @click.stop="emit('ask', repo)"
        >
          问 AI
        </UButton>

        <UButton
          class="relative z-10"
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-wand-2"
          :loading="isPending(repo.id)"
          @click.stop="generateIntro"
        >
          自动编写简介
        </UButton>
      </UFieldGroup>
    </template>
  </UCard>
</template>
