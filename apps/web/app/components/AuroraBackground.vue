<script setup lang="ts">
/**
 * 背景光晕层（纯装饰），两档强度。
 *
 *   full —— 三团（青蓝 / 紫罗兰 / 暖灰），用于落地页这类"要第一眼有记忆点"的页面
 *   soft —— 单团、低透明度、视差减半，用于列表页与详情页这类"用户在读内容"的页面
 *
 * 为什么分档而不是全局一个强度：
 *   光晕的作用是营造氛围，而氛围与阅读是此消彼长的。列表页一屏二十几张卡片，
 *   背景还在大幅漂移，眼睛会被背景牵走 —— 那里需要的是"有一点底色"就够了。
 *
 * ── 为什么分成"外层视差 + 内层漂移"两层 ──
 *
 * 视差由 motion-v 写 inline transform，漂移由 CSS animation 改 transform，
 * 两者放在同一元素上会互相覆盖（animation 优先级更高，结果是视差静默失效）。
 *
 * ── 为什么这层敢用动效库 ──
 *
 * 它 aria-hidden 且 pointer-events-none，不承载任何内容：
 * 即使 motion-v 失效，最坏结果只是背景不动。
 * 需要"必须可见"的内容一律不用动效库控制显隐（见 useReveal 的注释）。
 */
const props = withDefaults(defineProps<{ variant?: 'full' | 'soft' }>(), { variant: 'full' })

const { scrollY } = useScroll()

/** full 的三档视差速率：远景慢、近景快，位移量刻意压得很小 */
const ySlow = useTransform(scrollY, [0, 900], [0, -60])
const yMid = useTransform(scrollY, [0, 900], [0, -120])
const yFast = useTransform(scrollY, [0, 900], [0, -36])

/** soft 只有一团，位移也减半 */
const ySoft = useTransform(scrollY, [0, 900], [0, -28])

/** 光晕配色：中心色 + 边缘透明，CSS 变量取自 @theme 的品牌色与 AI 色 */
function blob(color: string): Record<string, string> {
  return {
    background: `radial-gradient(circle at 50% 50%, ${color}, transparent 68%)`,
  }
}
</script>

<template>
  <div class="aurora-root" aria-hidden="true">
    <template v-if="props.variant === 'full'">
      <!-- 青蓝主光晕：左上，最慢（最远） -->
      <Motion as="div" :style="{ y: ySlow }" class="absolute inset-0">
        <div
          class="aurora-blob drift-slow -left-32 -top-40 h-[520px] w-[520px] opacity-65 sm:h-[620px] sm:w-[620px] dark:opacity-75"
          :style="blob('var(--color-brand-400)')"
        />
      </Motion>

      <!-- 紫罗兰副光晕：右上，中速 -->
      <Motion as="div" :style="{ y: yMid }" class="absolute inset-0">
        <div
          class="aurora-blob drift-mid -top-24 right-[-10%] hidden h-[480px] w-[480px] opacity-55 sm:block lg:h-[560px] lg:w-[560px] dark:opacity-70"
          :style="blob('var(--color-ai-400)')"
        />
      </Motion>

      <!-- 中性暖光晕：中下，最快（最近）；小屏直接不渲染，省一层合成开销 -->
      <Motion as="div" :style="{ y: yFast }" class="absolute inset-0">
        <div
          class="aurora-blob drift-fast -left-20 top-[45%] hidden h-[420px] w-[420px] opacity-45 md:block dark:opacity-60"
          :style="blob('var(--color-brand-600)')"
        />
      </Motion>
    </template>

    <!-- soft：单团青蓝，透明度约为 full 的一半 -->
    <Motion v-else as="div" :style="{ y: ySoft }" class="absolute inset-0">
      <div
        class="aurora-blob drift-slow -left-24 -top-32 h-[420px] w-[420px] opacity-30 sm:h-[520px] sm:w-[520px] dark:opacity-40"
        :style="blob('var(--color-brand-400)')"
      />
    </Motion>
  </div>
</template>
