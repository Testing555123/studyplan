<script setup lang="ts">
/**
 * 点赞按钮。
 *
 * 设计上刻意做成**受控组件**：
 *   props 传进来"当前是否已点赞、数量是多少"，
 *   点击只 emit 一个事件，由父组件（或 store）决定怎么改状态。
 *
 * 为什么不在这里自己改 props？
 *   因为 Vue 的单向数据流不允许子组件改 props。
 *   而且一旦数据要被多个地方共享（列表 + 详情），
 *   状态就必须收敛到一个地方，否则两处显示的数字会不一致。
 *
 * 动画说明：`popping` 只在 500ms 内为 true，
 * 用来触发一次 CSS 缩放动画。动画结束后移除 class，
 * 这样连续点击时动画能重新触发（不然第二次点不会有反应）。
 */
import { Heart } from 'lucide-vue-next'

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

const iconSize = computed(() => (props.size === 'sm' ? 14 : 17))
</script>

<template>
  <!--
    过去这里手写了一整串边框/背景/文字颜色，还要各配一套 dark: 变体。
    改成 UButton 之后，选中态用 color="error"（语义色，自动适配明暗），
    未选中用 color="neutral" + variant="outline"，一套就够。
  -->
  <UButton
    :variant="liked ? 'soft' : 'outline'"
    :color="liked ? 'error' : 'neutral'"
    size="sm"
    class="rounded-full"
    :disabled="pending"
    :aria-pressed="liked"
    @click="onClick"
  >
    <template #leading>
      <Heart
        :size="iconSize"
        :fill="liked ? 'currentColor' : 'none'"
        :class="popping ? 'animate-pop' : ''"
      />
    </template>
    <span class="tabular-nums">{{ count }}</span>
    <span class="sr-only">{{ liked ? '取消点赞' : '点赞' }}</span>
  </UButton>
</template>
