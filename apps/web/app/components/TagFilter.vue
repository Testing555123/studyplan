<script setup lang="ts">
/**
 * 横向筛选条，用 `defineModel` 做双向绑定：
 *   父组件写 `<TagFilter v-model="activeTag" :tags="tags" />`，
 *   子组件直接读写 `model.value`，免去手写 props + emit 的样板。
 *
 * `tags` 由 props 传入，而不是在组件内读 store：
 *   筛选条只关心「有哪些选项」，不关心数据从哪来。
 *
 * 胶囊用 `UButton`（size="xs" + variant 切换选中态），
 * 圆角、边框、hover、焦点环都交给组件库，不必再维护 `.tag-pill-*` 这类自定义类。
 *
 * `nullable` 控制是否显示「全部」：语言筛选可不选，时间档则必须选一档，
 * 所以做成开关而不是写死，默认 true 以兼容已有用法。
 */
/**
 * 用 `withDefaults` 给 `nullable` 设默认值，避免模板里到处判空。
 * 默认 true（显示「全部」），因为现存的标签筛选都依赖它；
 * 升级组件时老页面无需改动，向后兼容优先。
 */
const props = withDefaults(
  defineProps<{
    tags: string[]
    /** 是否显示「全部」选项。时间档传 false（必选其一） */
    nullable?: boolean
  }>(),
  { nullable: true },
)

/** null 代表"全部" */
const model = defineModel<string | null>({ required: true })

const showAll = computed(() => props.nullable !== false)

/**
 * 移动端横向滚动时，被选中的项要自动滚进可视区，
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
    <UButton
      v-if="showAll"
      size="xs"
      :variant="model === null ? 'solid' : 'outline'"
      :color="model === null ? 'primary' : 'neutral'"
      class="shrink-0 rounded-full"
      :data-active="model === null"
      @click="model = null"
    >
      全部
    </UButton>

    <UButton
      v-for="tag in tags"
      :key="tag"
      size="xs"
      :variant="model === tag ? 'solid' : 'outline'"
      :color="model === tag ? 'primary' : 'neutral'"
      class="shrink-0 rounded-full"
      :data-active="model === tag"
      @click="model = model === tag ? null : tag"
    >
      {{ tag }}
    </UButton>
  </div>
</template>
