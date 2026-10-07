import { defineNuxtConfig } from 'nuxt/config'

/**
 * P19 沙盒配置
 *
 * 验证目标（TECH-SELECTION.md §9.2 P19）：
 *   1. Nuxt 4.5.2 + @nuxt/content 3.16.1 能构建 30 篇中文 markdown
 *   2. 全部挂在 /ebook 前缀下（/docs 已被后端 Swagger 占用）
 *   3. 5 组导航（开始之前 / 阶段正文 / 经验档案 / 设计 / 规划练习）可达
 *   4. stages/stage-N 与 exercises/stage-N **同名不同前缀**，两套路由互不吞掉
 *   5. 旧路径 → 新路径的 301 重定向**不成环**（顺序敏感项 7 / 不可违反项 14）
 */
export default defineNuxtConfig({
  modules: ['@nuxt/content'],

  compatibilityVersion: 4,

  // 关掉 SSR 之外的干扰项，让构建尽量贴近容器环境
  devtools: { enabled: false },
  telemetry: false,

  nitro: {
    // 便于构建后用 node .output/server/index.mjs 起服务做 curl 验证
    preset: 'node-server',
  },

  routeRules: {
    // ⚠️ 顺序敏感：这些重定向必须在内容迁移完成后才启用。
    // 提前启用会把新路径也重定向掉，形成自环，导致全部文档 404。
    // 本沙盒同时验证「旧路径 301 到新路径」与「新路径自身不被重定向」。
    // ⚠️ 简写形式 `{ redirect: '/x' }` 默认发 307，不是 301；要显式写 statusCode
    '/guide/roadmap': { redirect: { to: '/ebook/guide/roadmap', statusCode: 301 } },
    '/stages/**': { redirect: { to: '/ebook/stages/**', statusCode: 301 } },
    '/exercises/**': { redirect: { to: '/ebook/exercises/**', statusCode: 301 } },
    '/design/**': { redirect: { to: '/ebook/design/**', statusCode: 301 } },
  },
})
