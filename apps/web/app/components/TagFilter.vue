<script setup lang="ts">
/**
 * 横向筛选条。
 *
 * 用 `defineModel` 实现双向绑定：
 *   父组件写 `<TagFilter v-model="activeTag" :tags="tags" />`
 *   子组件内部直接读写 `model.value`，不需要手写 props + emit。
 * 这是 Vue 3.4+ 的推荐写法，能把"受控组件"的样板代码减掉一半。
 *
 * `tags` 用 props 传进来而不是在这里读 store：
 * 筛选条只关心"有哪些选项可选"，不关心数据从哪来。
 *
 * ── Nuxt UI 化之后 ──
 * 胶囊改用 `UButton`（size="xs" + variant 切换选中态），
 * 于是圆角、边框、hover、焦点环全部由组件库统一提供，
 * 这里不用再维护 `.tag-pill-*` 那几个自定义类。
 *
 * 新增的 `nullable` prop：控制要不要显示"全部"这一项。
 * 语言筛选需要它（可以不筛），而**时间档不需要**（必须选一个档位），
 * 所以做成一个开关而不是硬编码，默认 true 以兼容既有用法。
 */
/**
 * 用 `withDefaults` 给出默认值，而不是在模板里到处判空。
 *
 * 默认值取 **true**（显示「全部」）：因为既有的标签筛选都依赖它，
 * 这样升级组件时老页面一行都不用改 ——
 * 新增能力时保持向后兼容，是改造既有组件的第一原则。
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
