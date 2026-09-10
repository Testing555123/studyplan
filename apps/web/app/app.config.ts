/**
 * Nuxt UI 的运行时外观配置。
 *
 * 这里只做一件事：把 Nuxt UI 组件库里所有 `primary` 色名的引用，
 * 映射到配色系统里我们想要的色板。改这一处，
 * 全站按钮、输入框、链接的强调色会一起变。
 *
 * 注意：真正的色值定义在 assets/css/main.css 的 @theme 里，
 * 此处只是"把别名指向色板名"。
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'slate',
    },
  },
})
