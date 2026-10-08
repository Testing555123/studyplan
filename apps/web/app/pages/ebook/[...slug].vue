<script setup lang="ts">
/**
 * `/ebook/**` 下每一篇电子书正文的落地页（catch-all）。
 *
 * ── 为什么必须自己写这个文件 ──
 * `@nuxt/content` 3.16.1 **不会**为 `type: 'page'` 集合自动生成路由：
 * 模块源码里 extendPages / addPage / pages:extend 一处都没有。
 * 「装了 Content 就有 /ebook/stages/stage-1」这个直觉是错的 ——
 * 表现是页面全 404，而 Content 的索引里明明有数据。
 * 沙盒 P19 实测确认后，这里用「catch-all + queryCollection().path()」补上路由，
 * 这也正是 `批次 10 硬约束` 写死的一条。
 *
 * ── 为什么一篇 catch-all 就够，不会让 stages 与 exercises 互相吞掉 ──
 * 同名不同前缀（`stages/stage-1` 与 `exercises/stage-1`）如果各建一棵静态路由树，
 * 谁先注册谁就可能吃掉对方（不可违反项 14 / 顺序敏感项 7 担心的正是这个）。
 * 现在只有一条路由，差异全部交给**按 path 精确查库**决定：
 * `/ebook/stages/stage-1` 与 `/ebook/exercises/stage-1` 是两个不同的 key，
 * 结构上不存在互相覆盖的可能。
 */

/**
 * ⚠️ 必须有这个 key：同一棵 catch-all 树下，`/ebook/a` → `/ebook/b` 属于
 * 「同一条路由记录换参数」，Vue 默认**复用组件实例** —— setup 不再执行，
 * 于是正文停在上一篇。沙盒 P19 只用直接访问 URL 验证过，看不出这个问题；
 * 电子书里全是目录与相邻篇章的站内链接，点了不换内容就是硬伤。
 * 换 key 让实例随 path 重建，404 判定（下面那次 throw）也才会重新生效。
 */
definePageMeta({
  key: (route) => route.path,
})

const route = useRoute()

// 去掉结尾斜杠；只写 `/ebook/` 时归一成 `/ebook`，与集合里 path 的形态对齐
const path = computed(() => String(route.path).replace(/\/+$/, '') || '/ebook')

const { data: doc } = await useAsyncData(`ebook-doc-${path.value}`, () =>
  queryCollection('docs').path(path.value).first(),
)

if (!doc.value) {
  // 找不到就是真没有：出 404，而不是渲染一张空壳页面。
  // 「外壳在、内容空」在这个项目里出现过两次（app.vue 用 slot 代替 NuxtPage 一次，
  // Content 没自动路由一次），两次都让人误判成「内容没读到」，排查成本极高。
  throw createError({
    statusCode: 404,
    statusMessage: `电子书里没有这一篇：${path.value}`,
    fatal: true,
  })
}

/**
 * 标题兜底：29 篇正文没有 frontmatter，`title` 可能为空。
 * 空标题对 SEO 与分享卡片是实打实的损失，所以宁可不给 title，
 * 让 app.vue 里的站点默认值生效，也不输出 `stage-1` 这种文件名。
 */
useSeoMeta({
  title: () => doc.value?.title || '',
  description: () => doc.value?.description || '',
  ogType: 'article',
})
</script>

<template>
  <UContainer class="py-6 md:py-8">
    <!-- 返回目录：/ebook 下的每一篇都能一步回到 5 组导航 -->
    <nav class="mb-4">
      <ULink to="/ebook" class="text-sm text-muted transition-colors hover:text-primary">
        ← 电子书目录
      </ULink>
    </nav>

    <article class="prose-post max-w-none">
      <!--
        ContentRenderer 渲染解析好的 body。没有 frontmatter 的文档，
        可见标题就是正文首个 `#`，由它渲染成 <h1>，这里不再另起标题，
        否则一篇文章会出现两个 h1。

        排版复用 `.prose-post`（main.css 里唯一保留的自定义正文类）——
        它是后代选择器，对 ContentRenderer 生成的节点同样生效。
        ⚠️ 已知缺口：该类目前没有 h1 与 table 的规则，
        而电子书里表格极多，样式要在构建验证通过后的排版补齐轮子里处理。
      -->
      <ContentRenderer :value="doc">
        <template #empty>
          <p class="text-muted">这篇文档没有正文内容。</p>
        </template>
      </ContentRenderer>
    </article>
  </UContainer>
</template>
