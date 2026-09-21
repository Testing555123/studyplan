<script setup lang="ts">
/**
 * 首页 Dashboard（对应 v0 的 app/(site)/page.tsx）。
 *
 * 结构：ProfileHero（个人资料 + README 盒）+ 2×2 四分区卡片（最新帖子 / 学习路线 /
 * GitHub 热门 / 关于电子书）+ GitHub Star 号召区。
 * 分区卡片用 SectionCard 统一「图标 + 标题 + 查看全部 →」三段式头部。
 * 当前四分区为静态占位；真实数据在 wire 阶段接入。
 *
 * ── 这一版新增的背景层 ──
 *
 * 光晕层绝对定位铺满整个首页容器，内容区用 relative 压在它上面。
 * 四个分区的错落序号（--i）写在网格的包裹层上，由卡片继承 ——
 * 这样"第几张卡延迟多久"这件事由页面决定，卡片组件不需要知道自己的位置。
 */
useSeoMeta({
  title: 'studyplan · 学习社区',
  description: '一个边做边学的全栈项目：分享你的学习笔记与技术心得。',
})
</script>

<template>
  <div class="relative isolate">
    <AuroraBackground />

    <UContainer class="relative">
      <div class="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
        <HomeProfileHero />

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div :style="{ '--i': 0 }">
            <HomeLatestPostsSection />
          </div>
          <div :style="{ '--i': 1 }">
            <HomeRoadmapPreviewSection />
          </div>
          <div :style="{ '--i': 2 }">
            <HomeTrendingPreviewSection />
          </div>
          <div :style="{ '--i': 3 }">
            <HomeAboutEbookSection />
          </div>
        </div>

        <HomeGithubCtaSection />
      </div>
    </UContainer>
  </div>
</template>
