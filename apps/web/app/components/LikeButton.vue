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
  <button
    type="button"
    class="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60"
    :class="
      liked
        ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400'
        : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
    "
    :disabled="pending"
    :aria-pressed="liked"
    @click="onClick"
  >
    <Heart
      :size="iconSize"
      :fill="liked ? 'currentColor' : 'none'"
      :class="popping ? 'animate-pop' : ''"
      class="transition-transform duration-200 group-hover:scale-110"
    />
    <span class="tabular-nums">{{ count }}</span>
    <span class="sr-only">{{ liked ? '取消点赞' : '点赞' }}</span>
  </button>
</template>
