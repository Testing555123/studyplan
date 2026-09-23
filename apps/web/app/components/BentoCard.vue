<script setup lang="ts">
/**
 * Bento 卡片外壳原语。
 *
 * 页面只声明「这张卡多大、什么色调、链到哪」，外壳（圆角 / 边框 / 内距 /
 * hover 上浮 / 按压回弹 / group 上下文）一律由这里提供。
 *
 * 为什么必须有这一层：全站改版最容易出现的失败模式是「每个页面各写一遍
 * 卡片外壳」，改完当时一致，三个月后四五个页面各自发散。集中在一处，
 * 微调只改这里。
 *
 * ── 微交互参数（iOS 小组件感）──
 * hover 上浮 4px（-translate-y-1）+ 微放大到 1.01：位移负责"抬起来"，
 *   微放大负责"被选中"。只做其中一个都会觉得缺了点什么。
 * 阴影走 --elevation-card-hover（= --shadow-bento，柔和宽阴影，非硬边）。
 * active 缩到 0.98 模拟物理按压，只在**可点击**（传了 to）时才有 ——
 *   不可点的卡片给按压反馈是在骗用户。
 */
type BentoTone = 'default' | 'muted' | 'brand' | 'ai' | 'gradient'

const props = withDefaults(
  defineProps<{
    /** 列跨格，仅 md 以上生效 */
    colSpan?: 1 | 2
    /** 行跨格，仅 md 以上生效 */
    rowSpan?: 1 | 2
    /** 色调：中性 / 浅面 / 品牌 50 档 / AI 50 档 / 渐变大卡 */
    tone?: BentoTone
    /** 传了就渲染成链接（ULink），否则是普通容器 */
    to?: string
    target?: string
    /**
     * 非链接时渲染成哪个标签，默认 div。
     * 正文区传 article、表单区传 section —— 保留语义标签，
     * 否则为了统一外观就得把 <article> 降级成 <div>，得不偿失。
     */
    as?: string
  }>(),
  { colSpan: 1, rowSpan: 1, tone: 'default', as: 'div' },
)

/** 色调 → 表面样式。渐变卡用 brand→ai（青蓝→紫罗兰），与 Bento 范例的蓝→紫同语义 */
const TONES: Record<BentoTone, string> = {
  default: 'bg-default border-default',
  muted: 'bg-muted border-default',
  brand: 'border-brand-100 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/40',
  ai: 'border-ai-100 bg-ai-50 dark:border-ai-900 dark:bg-ai-950/40',
  gradient: 'border-transparent bg-gradient-to-br from-brand-500 to-ai-500 text-white',
}

/** 外壳：圆角统一 rounded-3xl，卡内元素才往下用 rounded-2xl */
const shell = [
  'group relative flex flex-col overflow-hidden rounded-3xl border p-5',
  'transition-all duration-300 ease-out',
  'hover:-translate-y-1 hover:scale-[1.01] hover:[box-shadow:var(--elevation-card-hover)]',
  props.to ? 'cursor-pointer active:scale-[0.98]' : '',
]
</script>

<template>
  <ULink
    v-if="to"
    :to="to"
    :target="target"
    :class="[shell, TONES[tone], colSpan === 2 && 'md:col-span-2', rowSpan === 2 && 'md:row-span-2']"
  >
    <slot />
  </ULink>
  <component
    :is="as"
    v-else
    :class="[shell, TONES[tone], colSpan === 2 && 'md:col-span-2', rowSpan === 2 && 'md:row-span-2']"
  >
    <slot />
  </component>
</template>
