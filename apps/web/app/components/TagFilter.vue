<script setup lang="ts">
/**
 * 横向标签筛选条。
 *
 * 用 `defineModel` 实现双向绑定：
 *   父组件写 `<TagFilter v-model="activeTag" :tags="tags" />`
 *   子组件内部直接读写 `model.value`，不需要手写 props + emit。
 * 这是 Vue 3.4+ 的推荐写法，能把"受控组件"的样板代码减掉一半。
 *
 * `tags` 用 props 传进来而不是在这里读 store：
 * 筛选条只关心"有哪些标签可选"，不关心数据从哪来。
 */
defineProps<{
  tags: string[]
}>()

/** null 代表"全部" */
const model = defineModel<string | null>({ required: true })

/**
 * 移动端横向滚动时，被选中的标签要自动滚进可视区，
 * 否则用户点了第 8 个标签，界面看起来毫无反应（其实只是滚出屏幕了）。
 */
const scroller = ref<HTMLElement | null>(null)

watch(model, async () => {
  await nextTick()
  const active = scroller.value?.querySelector<HTMLElement>('[data-active="true"]')
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
})
</script>

<template>
  <div
    ref="scroller"
    class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    <button
      type="button"
      class="tag-pill shrink-0"
      :class="model === null ? 'tag-pill-active' : 'tag-pill-idle'"
      :data-active="model === null"
      @click="model = null"
    >
      全部
    </button>

    <button
      v-for="tag in tags"
      :key="tag"
      type="button"
      class="tag-pill shrink-0"
      :class="model === tag ? 'tag-pill-active' : 'tag-pill-idle'"
      :data-active="model === tag"
      @click="model = model === tag ? null : tag"
    >
      {{ tag }}
    </button>
  </div>
</template>
