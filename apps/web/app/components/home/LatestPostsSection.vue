<script setup lang="ts">
/**
 * 最新帖子预览（对应 v0 的 LatestPostsSection）。
 * 静态占位数据；wire 阶段改为读取 usePostStore / useApi。
 */
const posts = [
  { id: '1', title: '用 Nuxt UI 搭建可折叠侧边栏', author: '李东东', excerpt: '从布局到响应式，一步步实现', tags: ['Vue', 'Nuxt'] },
  { id: '2', title: 'NestJS 守卫与角色权限实战', author: '李东东', excerpt: '基于 Decorator 的细粒度控制', tags: ['NestJS', '后端'] },
  { id: '3', title: 'MongoDB 聚合管道入门', author: '小王', excerpt: '用聚合做统计与分组', tags: ['数据库', 'MongoDB'] },
  { id: '4', title: '从 0 到 1 部署全栈应用', author: '小李', excerpt: '容器化与边缘部署踩坑记', tags: ['DevOps', '部署'] },
]
</script>

<template>
  <HomeSectionCard icon="i-lucide-message-square" title="最新帖子" href="/posts">
    <NuxtLink
      v-for="post in posts"
      :key="post.id"
      :to="`/posts/${post.id}`"
      class="group block rounded-xl border border-transparent p-2.5 -m-0.5 transition-colors duration-200 hover:border-default hover:bg-muted/60"
    >
      <h3 class="text-sm font-medium leading-snug text-highlighted group-hover:text-primary">
        {{ post.title }}
      </h3>
      <p class="mt-1 line-clamp-1 text-xs text-muted">
        {{ post.author }} · {{ post.excerpt }}
      </p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <UBadge
          v-for="tag in post.tags"
          :key="tag"
          variant="subtle"
          size="xs"
          class="text-[10px] font-medium"
        >
          {{ tag }}
        </UBadge>
      </div>
    </NuxtLink>
  </HomeSectionCard>
</template>
