<script setup lang="ts">
/**
 * 标签筛选条，基于 USelectMenu（可搜索）。
 *
 * 用 `defineModel` 做双向绑定：父组件写 `<TagFilter v-model="..." :tags="可选标签" />`，
 * 子组件直接读写 `model.value`，免去手写 props + emit 的样板。
 *
 * 双向兼容两种用法：
 *   · 单选（`multiple` 缺省 false）：模型为 `string | null`，null = 全部。
 *     趋势页的语言筛选就是这种，显示文本与值一致，正合适。
 *   · 多选（`multiple` 传 true）：模型为 `string[]`，空数组 = 全部。
 *     文章列表的多标签筛选是这种。
 *
 * `tags`（可选标签）由 props 传入，而不是在组件内读 store：
 *   筛选条只关心「有哪些选项」，不关心数据从哪来。
 *
 * 选中态、键盘可达、搜索框、清除按钮、下拉面板全部交给 USelectMenu，
 * 不必再维护胶囊按钮组与「选中项滚进可视区」这类逻辑。
 *
 * 触发器外层由页面用 `.card-surface` 包住（posts/index 已包），
 * 这里只产出组件本身，保持筛选条在两类页面里同位置同语义。
 *
 * ⚠️ USelectMenu 的 `multiple` 是编译期决定 v-model 类型的开关：
 *   传给它一个动态布尔（如 `:multiple="props.multiple"`）会让 vue-tsc 无法收窄模型类型。
 *   所以这里用 `v-if / v-else` 拆成两个字面量分支，各自的 v-model 类型与 `multiple` 字面量严格对应。
 */
const props = withDefaults(
  defineProps<{
    /** 可选标签（白名单） */
    tags: string[]
    /** 是否多选；缺省为单选，保持老调用方契约不变 */
    multiple?: boolean
    /** 未选时的占位文案 */
    placeholder?: string
  }>(),
  { multiple: false, placeholder: '按标签筛选' },
)

/** 选中的标签；单选时为 `string | null`（null = 全部），多选时为 `string[]`（空 = 全部） */
const model = defineModel<string[] | string | null>({ required: true })

/** 多选分支的数组视图 */
const multiValue = computed<string[]>({
  get: () => (props.multiple && Array.isArray(model.value) ? model.value : []),
  set: (value) => {
    model.value = value
  },
})

/** 单选分支的单值视图；空串统一映射回 null（= 全部） */
const singleValue = computed<string>({
  get: () => (typeof model.value === 'string' ? model.value : ''),
  set: (value) => {
    model.value = value || null
  },
})
</script>

<template>
  <USelectMenu
    v-if="props.multiple"
    v-model="multiValue"
    :items="props.tags"
    multiple
    :placeholder="props.placeholder"
    :search-input="{ placeholder: '搜索标签…' }"
    selected-icon="i-lucide-check"
    clear
    size="sm"
    class="w-full sm:w-72"
  >
    <template #leading>
      <UIcon name="i-lucide-tag" />
    </template>
  </USelectMenu>

  <USelectMenu
    v-else
    v-model="singleValue"
    :items="props.tags"
    :placeholder="props.placeholder"
    :search-input="{ placeholder: '搜索标签…' }"
    clear
    size="sm"
    class="w-full sm:w-72"
  >
    <template #leading>
      <UIcon name="i-lucide-tag" />
    </template>
  </USelectMenu>
</template>
