<script setup lang="ts">
/**
 * 首页 Dashboard（Bento Grid 版）。
 *
 * 构成：一张大卡（2×2 渐变，主推学习路线）+ 五张中卡（2×2 / 2×1）+ 若干 1×1 小卡。
 * 卡片外壳一律走 BentoCard，页面只声明"多大、什么色调、链到哪"。
 *
 * ── 与上一版的差异 ──
 * 旧版是「ProfileHero + 2×2 四等分 + 号召区」：四张卡一样大，视觉上没有主次，
 * 且四分区是静态占位。现在改成大小不一的 Bento，并接真实数据
 * （帖文数 / 收录项目 / 路线进度 / 热门仓库）。
 *
 * ── 状态完整性 ──
 * pending → 小卡显示骨架；error → 出一张错误卡带重试按钮。
 * 这两条是"完成度"最容易被忽略的部分：没有它们，接口一慢或一挂，
 * 用户看到的就是一片空白或一堆 undefined。
 */
useSeoMeta({
  title: 'studyplan · 学习社区',
  description: '一个边做边学的全栈项目：分享你的学习笔记与技术心得。',
})

const { public: { appVersion } } = useRuntimeConfig()

/** 项目仓库（沿用原 GithubCtaSection 的网址） */
const githubUrl = 'https://github.com/dongdong'
const {
  pending, error, refresh,
  postCount, repoCount, repos,
  percent, completed, nodeTotal,
} = useHomeStats()

/**
 * 搜索框不做自己的搜索，而是唤起全局命令面板（与 app.vue 共享同一个 state）。
 *
 * 为什么是 readonly + focus 唤起：本站已有 ⌘K 面板承载"搜文章 / 搜项目 / 跳转"，
 * 再实现一个第二套搜索只会让两处结果不一致。与其放一个点了没反应的输入框，
 * 不如让它直接打开真正能搜的那个。
 */
const commandOpen = useState<boolean>('command-palette-open', () => false)

/** 小卡数据：值为 null 表示还没取到，此时显示骨架 */
const metrics = computed(() => [
  { label: '社区帖文', value: postCount.value, icon: 'i-lucide-file-text', tone: 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300 group-hover:bg-brand-500 group-hover:text-white' },
  { label: '收录项目', value: repoCount.value, icon: 'i-lucide-star', tone: 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300 group-hover:bg-brand-500 group-hover:text-white' },
  { label: '路线节点', value: completed.value != null ? `${completed.value}/${nodeTotal.value}` : null, icon: 'i-lucide-layers', tone: 'bg-ai-100 text-ai-700 dark:bg-ai-900/50 dark:text-ai-300 group-hover:bg-ai-500 group-hover:text-white' },
  { label: '学习进度', value: percent.value != null ? `${percent.value}%` : null, icon: 'i-lucide-trending-up', tone: 'bg-ai-100 text-ai-700 dark:bg-ai-900/50 dark:text-ai-300 group-hover:bg-ai-500 group-hover:text-white' },
])
</script>

<template>
  <UContainer>
    <div class="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <HomeProfileHero />

      <BentoGrid>
        <!-- 大卡 2×2：主推功能，渐变底 -->
        <BentoCard to="/roadmap" tone="gradient" :col-span="2" :row-span="2" class="justify-between">
          <div class="flex items-start justify-between gap-4">
            <span class="bento-icon size-11 bg-white/15 text-white group-hover:bg-white/25">
              <UIcon name="i-lucide-map" class="size-5" aria-hidden="true" />
            </span>
            <UIcon
              name="i-lucide-arrow-up-right"
              class="size-5 text-white/70 transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
              aria-hidden="true"
            />
          </div>

          <div class="mt-8">
            <h2 class="text-2xl font-semibold tracking-tight">全栈学习路线</h2>
            <p class="mt-2 max-w-sm text-sm leading-relaxed text-white/80">
              从前端基础到后端架构，循序渐进，每一步都有可验证的成果。
            </p>

            <div class="mt-6">
              <div class="flex items-center justify-between text-xs text-white/80">
                <span>当前进度</span>
                <span>{{ percent }}%</span>
              </div>
              <!--
                进度条维持手刻：@nuxt/ui 4.11 未提供 Progress 组件（已在套件内确认无此导出），
                且这一条要盖在渐变卡上、用纯白填充，套组件库默认配色反而不合适。
              -->
              <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  class="h-full rounded-full bg-white transition-all duration-300 ease-out group-hover:brightness-110"
                  :style="{ width: `${percent}%` }"
                />
              </div>
            </div>
          </div>
        </BentoCard>

        <!-- 中卡 2×1 -->
        <BentoCard to="/posts" tone="muted" :col-span="2">
          <div class="flex items-start justify-between gap-4">
            <span class="bento-icon size-10 bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300 group-hover:bg-brand-500 group-hover:text-white">
              <UIcon name="i-lucide-file-text" class="size-5" aria-hidden="true" />
            </span>
            <UIcon
              name="i-lucide-arrow-up-right"
              class="size-5 text-muted transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-highlighted"
              aria-hidden="true"
            />
          </div>
          <h3 class="mt-4 text-lg font-semibold text-highlighted">学习笔记社区</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-muted">
            写下你的技术心得，也能从别人的踩坑记录里抄近路。
          </p>
        </BentoCard>

        <!-- 中卡 2×1：搜索入口，聚焦即唤起 ⌘K 面板 -->
        <BentoCard :col-span="2" class="justify-center">
          <label for="home-search" class="text-xs font-medium text-muted">全站搜索</label>
          <UInput
            id="home-search"
            class="mt-2 w-full cursor-pointer"
            icon="i-lucide-search"
            :model-value="''"
            readonly
            placeholder="搜索文章、项目或跳转…"
            @focus="commandOpen = true"
          />
          <p class="mt-2.5 text-xs text-muted">按 ⌘ / Ctrl + K 随时唤起</p>
        </BentoCard>

        <!-- 中卡 2×2：热门仓库（真实数据） -->
        <BentoCard v-if="error" tone="muted" :col-span="2" :row-span="2" class="justify-center">
          <span class="bento-icon size-10 bg-error/10 text-error">
            <UIcon name="i-lucide-cloud-off" class="size-5" aria-hidden="true" />
          </span>
          <h3 class="mt-4 text-lg font-semibold text-highlighted">数据暂时取不到</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-muted">
            热门项目与统计需要后端接口，稍后重试即可，不影响浏览其他内容。
          </p>
          <UButton class="mt-4 w-fit" icon="i-lucide-refresh-cw" @click="refresh()">
            重试
          </UButton>
        </BentoCard>

        <BentoCard v-else to="/trending" :col-span="2" :row-span="2">
          <div class="flex items-start justify-between gap-4">
            <span class="bento-icon size-10 bg-muted text-toned group-hover:bg-brand-500 group-hover:text-white">
              <UIcon name="i-lucide-trending-up" class="size-5" aria-hidden="true" />
            </span>
            <UIcon
              name="i-lucide-arrow-up-right"
              class="size-5 text-muted transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-highlighted"
              aria-hidden="true"
            />
          </div>
          <h3 class="mt-4 text-lg font-semibold text-highlighted">GitHub 热门</h3>
          <p class="mt-1.5 text-sm text-muted">每天更新的高分项目，附中文导读。</p>

          <ul class="mt-4 space-y-2">
            <li
              v-for="repo in repos"
              :key="repo.id"
              class="flex items-center justify-between rounded-2xl bg-muted px-3 py-2.5 transition-colors duration-200 ease-out group-hover:bg-brand-50 dark:group-hover:bg-brand-950/30"
            >
              <span class="flex min-w-0 items-center gap-2.5">
                <UIcon name="i-lucide-star" class="size-4 shrink-0 text-amber-500" aria-hidden="true" />
                <span class="truncate text-sm font-medium text-highlighted">{{ repo.fullName }}</span>
              </span>
              <span class="shrink-0 text-xs text-muted">{{ repo.stars }}</span>
            </li>
            <li v-if="pending && !repos.length">
              <USkeleton class="h-[42px] rounded-2xl" />
            </li>
          </ul>
        </BentoCard>

        <!-- 中卡 2×1：电子书（批次 10 起是本应用 /ebook 下的路由，不再是独立文档站） -->
        <BentoCard to="/ebook" tone="brand" :col-span="2">
          <div class="flex items-start justify-between gap-4">
            <span class="bento-icon size-10 bg-brand-200 text-brand-800 dark:bg-brand-800/50 dark:text-brand-200 group-hover:bg-brand-600 group-hover:text-white">
              <UIcon name="i-lucide-book-open" class="size-5" aria-hidden="true" />
            </span>
            <!-- 站内跳转用 arrow-up-right；external-link 是"要离开本站"的信号，
                 对内链是误导（其余内链卡片同一约定） -->
            <UIcon name="i-lucide-arrow-up-right" class="size-5 text-brand-600 transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          <h3 class="mt-4 text-lg font-semibold text-highlighted">配套电子书</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-toned">
            把这一年的笔记整理成册：数据结构、系统设计到全栈实战。
          </p>
        </BentoCard>

        <!-- 中卡 2×1：AI（全站 FAB，没有独立路由，故不做链接） -->
        <BentoCard tone="ai" :col-span="2">
          <div class="flex items-start justify-between gap-4">
            <span class="bento-icon size-10 bg-ai-200 text-ai-800 dark:bg-ai-800/50 dark:text-ai-200 group-hover:bg-ai-600 group-hover:text-white">
              <UIcon name="i-lucide-sparkles" class="size-5" aria-hidden="true" />
            </span>
            <UBadge color="ai" variant="subtle" size="sm">每日 300 次</UBadge>
          </div>
          <h3 class="mt-4 text-lg font-semibold text-highlighted">AI 学习助手</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-toned">
            基于本项目代码库作答，右下角悬浮按钮随时唤起。
          </p>
        </BentoCard>

        <!-- 小卡 1×1 ×4：真实统计 -->
        <BentoCard v-for="m in metrics" :key="m.label" class="justify-between">
          <span :class="['bento-icon size-9', m.tone]">
            <UIcon :name="m.icon" class="size-4" aria-hidden="true" />
          </span>
          <div class="mt-3">
            <USkeleton v-if="pending && m.value == null" class="h-7 w-16 rounded-lg" />
            <p v-else class="text-2xl font-semibold tracking-tight text-highlighted">
              {{ m.value ?? '—' }}
            </p>
            <p class="mt-0.5 text-xs text-muted">{{ m.label }}</p>
          </div>
        </BentoCard>

        <!-- 号召区：改造成 Bento 卡，取代旧的 .gradient-frame -->
        <BentoCard :to="githubUrl" target="_blank" rel="noopener" tone="muted" :col-span="2">
          <div class="flex items-start justify-between gap-4">
            <span class="bento-icon size-10 bg-muted text-toned group-hover:bg-brand-500 group-hover:text-white">
              <UIcon name="i-lucide-github" class="size-5" aria-hidden="true" />
            </span>
            <UIcon name="i-lucide-arrow-up-right" class="size-5 text-muted transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-highlighted" aria-hidden="true" />
          </div>
          <h3 class="mt-4 text-lg font-semibold text-highlighted">觉得这个项目有帮助？</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-muted">
            在 GitHub 上点一颗 Star，支持我持续更新学习笔记。
          </p>
        </BentoCard>

        <BentoCard class="justify-between">
          <span class="bento-icon size-9 bg-muted text-toned group-hover:bg-brand-500 group-hover:text-white">
            <UIcon name="i-lucide-boxes" class="size-4" aria-hidden="true" />
          </span>
          <div class="mt-3">
            <p class="text-sm font-semibold tracking-tight text-highlighted">Nuxt 4 · NestJS 11</p>
            <p class="mt-0.5 text-xs text-muted">技术栈</p>
          </div>
        </BentoCard>

        <BentoCard class="justify-between">
          <span class="bento-icon size-9 bg-muted text-toned group-hover:bg-brand-500 group-hover:text-white">
            <UIcon name="i-lucide-tag" class="size-4" aria-hidden="true" />
          </span>
          <div class="mt-3">
            <p class="truncate text-sm font-semibold tracking-tight text-highlighted">
              {{ appVersion }}
            </p>
            <p class="mt-0.5 text-xs text-muted">构建版本</p>
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  </UContainer>
</template>
