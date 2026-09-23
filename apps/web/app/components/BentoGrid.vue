<script setup lang="ts">
/**
 * Bento 网格容器。
 *
 * 断点：手机 1 栏 → md 2 栏 → lg 4 栏。
 *
 * ── 为什么跨格只在 md 以上生效 ──
 * `col-span-2` / `row-span-2` 写在 BentoCard 里时一律带 `md:` 前缀，
 * 所以手机端永远是单列全宽。小屏若也跨两栏，卡片会被压成一条，
 * 内容挤在一行里 —— 正是"卡片内容拥挤"要避免的情况。
 *
 * ── 两个不那么显眼但必需的声明 ──
 * `grid-flow-row-dense`：让 auto-placement 回头填空洞。大卡（2×2）占位后
 *   后面的小卡会自动补进前面的空位，否则右下角容易出现一块空白。
 * `auto-rows`：给 row-span-2 一个可预测的行高基准。没有它，跨两行的卡片
 *   高度由内容撑开，相邻卡片会歪成不同高度，网格感就没了。
 *
 * ── 间隙为什么是唯一值 ──
 * 全站卡片网格只用 gap-4。混用 gap-4 / gap-6 会让"卡片之间的呼吸"
 * 在不同页面不一致，这是 Bento 规范里明令禁止的。
 */
</script>

<template>
  <div
    class="grid grid-cols-1 gap-4 md:grid-cols-2 md:auto-rows-[minmax(10rem,auto)] md:grid-flow-row-dense lg:grid-cols-4"
  >
    <slot />
  </div>
</template>
