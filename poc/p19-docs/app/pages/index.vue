<script setup lang="ts">
/**
 * 沙盒首页：复刻 VitePress 的 5 组侧栏，并验证 30 篇全部可被查询到。
 * 这是 P19 验收标准「5 组导航」的机器可校验形式。
 */
const { data: docs } = await useAsyncData('p19-docs', () =>
  queryCollection('docs').order('path', 'ASC').all(),
)

const groups = [
  {
    text: '开始之前',
    match: (p: string) => p.startsWith('/ebook/guide/'),
    order: ['roadmap', 'project-structure', 'environment', 'git-workflow'],
  },
  { text: '阶段正文', match: (p: string) => p.startsWith('/ebook/stages/'), order: [] },
  {
    text: '经验档案',
    match: (p: string) =>
      [
        '/ebook/guide/deployment-lessons',
        '/ebook/guide/debugging-lessons',
        '/ebook/guide/integration-lessons',
        '/ebook/guide/daily-digest',
      ].includes(p),
    order: [],
  },
  { text: '设计', match: (p: string) => p.startsWith('/ebook/design/'), order: [] },
  { text: '规划练习', match: (p: string) => p.startsWith('/ebook/exercises/'), order: [] },
]

const grouped = computed(() =>
  groups.map((g) => ({
    text: g.text,
    items: (docs.value ?? [])
      .filter((d: any) => g.match(d.path))
      .map((d: any) => ({ path: d.path, title: d.title ?? d.path })),
  })),
)

const total = computed(() => docs.value?.length ?? 0)
</script>

<template>
  <div>
    <h1>P19 沙盒 · 文档索引</h1>
    <p>共 {{ total }} 篇（期望 30 篇）</p>

    <section v-for="g in grouped" :key="g.text">
      <h2>{{ g.text }}（{{ g.items.length }}）</h2>
      <ul>
        <li v-for="it in g.items" :key="it.path">
          <NuxtLink :to="it.path">{{ it.title }}</NuxtLink>
          <code style="margin-left: 8px; color: #888">{{ it.path }}</code>
        </li>
      </ul>
    </section>
  </div>
</template>
