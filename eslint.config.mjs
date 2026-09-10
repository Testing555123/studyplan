import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

/**
 * 全仓统一的 ESLint 扁平配置（Flat Config）。
 *
 * 为什么放在仓库根而不是每个子包各配一份？
 *   - 只有一份规则来源，前后端不会出现"同一个写法一边报错一边不报"；
 *   - 编辑器只要打开仓库根就能对所有文件生效。
 *
 * 数组顺序即优先级：越靠后越能覆盖前面的规则。
 * 所以 eslint-config-prettier 必须放最后，它的作用就是关掉所有和 Prettier 打架的格式规则。
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/coverage/**',
      'apps/docs/.vitepress/cache/**',
      'apps/docs/.vitepress/dist/**',
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Vue 单文件组件规则（只作用于 .vue）
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        // .vue 里的 <script lang="ts"> 需要交给 TS 解析器处理
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Nuxt 的 pages/index.vue 这类单词式组件名是官方约定
      'vue/multi-word-component-names': 'off',
      // 教学项目大量使用 console 做演示与排错
      'no-console': 'off',
    },
  },

  prettier,
)
