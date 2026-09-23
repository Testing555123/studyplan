<script setup lang="ts">
/**
 * 全局页脚。
 *
 * 信息层级（对应 V3 的 M3-08「四级信息层级」）：
 *   L1 品牌名 studyplan        —— 最强，带色块图标
 *   L3 分组标题 学习 / 社区 / 项目 —— eyebrow 小字 + 字距，弱但有结构
 *   L4 链接 / 版权说明        —— 正文级，最弱
 * 通过「分组 + 分级」让一屏页脚一眼可读，而不是一串平铺链接。
 *
 * 链接只用已存在的真实路由（/、/posts、/roadmap、/trending、/ebook/），
 * 不造会 404 的假链接。外壳用 `UFooter`（自带边框与内边距）。
 */
const year = new Date().getFullYear()

// 构建版本号（版本号 + UTC 构建时间戳），用于一眼判断站点是否重建更新过。
// 来自 nuxt.config.ts 的 runtimeConfig.public，为构建期常量。
const { public: { appVersion, docsUrl } } = useRuntimeConfig()
</script>

<template>
  <UFooter class="mt-[var(--space-section)]">
    <template #left>
      <div class="flex items-center gap-2">
        <span
          class="grid h-8 w-8 place-items-center rounded-card bg-primary text-[var(--color-on-primary)] [box-shadow:var(--elevation-panel)]"
        >
          <UIcon name="i-lucide-sparkles" class="size-[var(--icon-sm)]" />
        </span>
        <span class="text-body-sm font-semibold text-highlighted">studyplan</span>
      </div>
    </template>

    <template #right>
      <div class="flex flex-col items-end gap-6">
        <!-- 三组链接：按主题分组，形成信息层级 -->
        <div class="grid grid-cols-3 gap-8 text-right">
          <div>
            <p class="mb-3 text-eyebrow font-semibold uppercase tracking-eyebrow text-muted">学习</p>
            <ul class="space-y-2 text-caption">
              <li>
                <ULink to="/roadmap" class="text-muted transition-colors hover:text-primary">
                  全栈学习路线
                </ULink>
              </li>
              <li>
                <ULink to="/trending" class="text-muted transition-colors hover:text-primary">
                  GitHub 热门
                </ULink>
              </li>
            </ul>
          </div>
          <div>
            <p class="mb-3 text-eyebrow font-semibold uppercase tracking-eyebrow text-muted">社区</p>
            <ul class="space-y-2 text-caption">
              <li>
                <ULink to="/posts" class="text-muted transition-colors hover:text-primary">
                  帖子流
                </ULink>
              </li>
              <li>
                <ULink :to="docsUrl" target="_blank" class="text-muted transition-colors hover:text-primary">
                  配套电子书
                </ULink>
              </li>
            </ul>
          </div>
          <div>
            <p class="mb-3 text-eyebrow font-semibold uppercase tracking-eyebrow text-muted">项目</p>
            <ul class="space-y-2 text-caption">
              <li>
                <ULink to="/" class="text-muted transition-colors hover:text-primary">
                  首页
                </ULink>
              </li>
              <!--
                联络 / 反馈入口：项目全部公开在 GitHub，提 issue 与交流都走那里。
                此前这一组只有「首页」一个链接，用户想反馈时没有任何出口 ——
                这是"功能做了但没给入口"的典型缺口。
              -->
              <li>
                <ULink
                  to="https://github.com/dongdong"
                  target="_blank"
                  rel="noopener"
                  class="text-muted transition-colors hover:text-primary"
                >
                  GitHub · 反馈
                </ULink>
              </li>
              <li class="text-muted">Nuxt 4 · NestJS 11</li>
            </ul>
          </div>
        </div>

        <!-- 版权：最弱一级，落在最底；版本号接续其后，仍属 L4 最弱层级 -->
        <p class="text-caption text-muted">© {{ year }} studyplan · 一个边做边学的全栈教学项目 · {{ appVersion }}</p>
      </div>
    </template>
  </UFooter>
</template>
