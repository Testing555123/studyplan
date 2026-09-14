/**
 * Nuxt UI 的运行时外观配置。
 *
 * 这里只做一件事：把 Nuxt UI 组件库里所有 `primary` / `neutral` 的引用，
 * 映射到本项目 `@theme` 里定义的色板名。改这一处，
 * 全站按钮、输入框、链接、选中态的强调色会一起变。
 *
 * ⚠️ 真正的色值**不在这里**，而在 `assets/css/main.css` 的 `@theme` 里
 *    （`--color-brand-*` 青蓝色阶）。此处只是"把别名指向色板名"。
 *    这个分工是有意的：**色值只有一处定义**，
 *    将来再换配色仍然只改 main.css，不会出现"改了 A 处 B 处没跟上"。
 */
export default defineAppConfig({
  ui: {
    colors: {
      /**
       * 主色 → `brand` 色板（科技青蓝 #06b6d4）。
       *
       * 这里**曾经是 `indigo`**（Tailwind 内置色），那是个 bug：
       * 它让 Nuxt UI 组件用 Tailwind 的靛蓝，而手写样式用 @theme 的 brand 色，
       * 全站出现两套"品牌色"。指向 `brand` 之后二者才真正统一。
       */
      primary: 'brand',

      /**
       * 中性色 → stone（暖灰）。
       *
       * 原先用 slate（冷灰）；改为 stone 后页面背景、边框、次要文字
       * 都带上一点暖调，更接近"护眼舒适"的暖灰中性，也和 indigo 主色更搭。
       */
      neutral: 'stone',
    },
  },
})
