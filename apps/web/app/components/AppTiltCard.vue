<script setup lang="ts">
/**
 * 通用卡片外壳：进入视口浮现 + 指针跟随 3D 倾斜 + 跟随高光。
 *
 * 它只负责"动效与装饰"，**不管边框、背景、内边距** —— 那些仍由内部卡片自己负责。
 * 这样同一份外壳才能同时服务三种内部结构完全不同的卡片：
 *
 *   · 首页分区卡（内部是一个自定义 div，自己带 border 与 bg-default/70）
 *   · RepoCard（内部是 UCard，自带边框与 body/footer 插槽布局）
 *   · 项目详情页大卡（内部是 UCard，p-6 sm:p-8）
 *
 * 如果外壳也画边框背景，就会出现"两层边框、两层圆角"，而内部卡片的
 * 圆角与外壳圆角稍有不齐时，边角会露出一条难看的缝。
 *
 * 使用方式：
 *   <AppTiltCard class="h-full" :index="0" :max="2">
 *     <任何卡片 />
 *   </AppTiltCard>
 *
 * class 会透传到根元素（单根组件的属性继承），所以布局类（h-full / flex）照常写。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /**
     * 错落序号，决定浮现延迟（--i × 45ms）。
     * 不传则继承父容器上的 --i —— 首页是在网格包裹层统一设的。
     */
    index?: number
    /** 最大倾斜角度（度）。列表页这类卡片密集的场景建议降到 2 */
    max?: number
    /** 关掉浮现（用于本来就常驻首屏、不该有入场动画的元素） */
    reveal?: boolean
  }>(),
  { max: 4, reveal: true },
)

const { target, state, revealClass } = useReveal()
const { tracking, style: tiltStyle } = useTilt({ target, max: props.max })

const rootStyle = computed(() => ({
  ...tiltStyle.value,
  ...(props.index === undefined ? {} : { '--i': String(props.index) }),
}))
</script>

<template>
  <div
    ref="target"
    class="tilt group relative rounded-2xl"
    :class="[...(reveal ? revealClass(state) : []), tracking ? 'tilt--tracking' : '']"
    :style="rootStyle"
  >
    <!-- 跟随指针的高光：不参与布局，也不接收事件 -->
    <span class="tilt-spot" :class="{ 'tilt-spot--on': tracking }" aria-hidden="true" />
    <slot />
  </div>
</template>
