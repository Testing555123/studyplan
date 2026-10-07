<script setup lang="ts">
/**
 * /ebook 前缀下的文档页。
 *
 * ⚠️ 实测结论（P19）：@nuxt/content 3.16.1 **不会**自动为 `type: 'page'` 集合生成路由
 *    —— 模块源码里没有 extendPages / addPage / pages:extend 任何一处。
 *    必须自己建 catch-all 页面，再用 queryCollection().path() 取内容。
 *    这一点与「Nuxt Content 会自动接管路由」的直觉相反，是本 PoC 的关键发现之一。
 */
const route = useRoute()
const path = route.path.replace(/\/+$/, '') || '/ebook'

const { data: doc } = await useAsyncData(`p19-doc-${path}`, () =>
  queryCollection('docs').path(path).first(),
)

if (!doc.value) {
  throw createError({ statusCode: 404, statusMessage: `文档不存在：${path}` })
}
</script>

<template>
  <article>
    <!-- 30 篇正文都没有 frontmatter，标题来自正文首个 h1，由 ContentRenderer 渲染 -->
    <p style="color: #888"><code>{{ doc.path }}</code></p>
    <ContentRenderer :value="doc" />
  </article>
</template>
