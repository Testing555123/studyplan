<script setup lang="ts">
/**
 * 点赞按钮，做成受控组件。
 *
 * 父组件通过 props 传入「是否已点赞」和「数量」，点击只向外 emit 一个 toggle 事件，
 * 真正的状态改动交给父组件或 store 处理。
 *
 * 不在这里直接改 props，原因有二：Vue 的单向数据流不允许子组件修改 props；
 * 而且同一个点赞数会被列表和详情两处共用，状态必须收拢到一处，否则两边数字会对不上。
 *
 * `popping` 在点击后只保持 500ms，用来触发一次 CSS 缩放动画；
 * 动画结束就移除 class，这样连点时能再次触发（否则第二次点击没有反馈）。
 */
const props = withDefaults(
  defineProps<{
    liked: boolean
    count: number
    /** 请求进行中时禁用，避免连点造成计数错乱 */
    pending?: boolean
    size?: 'sm' | 'md'
  }>(),
  {
    pending: false,
    size: 'md',
  },
)

const emit = defineEmits<{
  (event: 'toggle'): void
}>()

const popping = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function onClick(): void {
  if (props.pending) return

  popping.value = false
  // 先强制下一帧再开启，确保动画能重复触发
  void nextTick(() => {
    popping.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      popping.value = false
    }, 500)
  })

  emit('toggle')
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <!--
    选中态用 error 语义色、未选中用 neutral + outline，明暗主题都由组件库自动适配。
  -->
  <UButton
    :variant="liked ? 'soft' : 'outline'"
    :color="liked ? 'error' : 'neutral'"
    size="sm"
    class="rounded-pill"
    :disabled="pending"
    :aria-pressed="liked"
    @click="onClick"
  >
    <template #leading>
      <!--
        改用 UIcon：全站图标统一走 Iconify（`i-lucide-*`），不再单独 import 组件。
        「已赞」的实心效果用 `fill-current` 达成 —— lucide 是描边图标，
        靠 SVG 的 fill 填实，与原先给 <Heart> 传 fill="currentColor" 视觉一致。
      -->
      <UIcon
        name="i-lucide-heart"
        :class="[
          popping ? 'animate-pop' : '',
          liked ? 'fill-current' : '',
          size === 'sm' ? 'size-[14px]' : 'size-[17px]',
        ]"
      />
    </template>
    <span class="tabular-nums">{{ count }}</span>
    <span class="sr-only">{{ liked ? '取消点赞' : '点赞' }}</span>
  </UButton>
</template>
