import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import prettierConfig from 'eslint-config-prettier'

/**
 * ESLint flat config（Next 16）。
 *
 * 注意：eslint-config-next@16 的 dist 已经是**flat 配置数组**（不再是 legacy eslintrc 格式），
 * 因此不能用 @eslint/eslintrc 的 FlatCompat.extends('next/core-web-vitals') 加载 ——
 * 那样会走 eslintrc 的 schema 校验并抛 "Converting circular structure to JSON"（真实报错被掩盖）。
 * 这里直接展开其 flat 导出，prettier 放最后以关闭格式化类规则。
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettierConfig,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      '.source/**',
      'content/**',
      'playwright-report/**',
      // Python 虚拟环境 / 离线轮子 / 旧栈与 POC 残留，不属于本项目源码。
      'venv/**',
      'wheels/**',
      'apps/**',
      'poc/**',
      '.model-cache/**',
    ],
  },
  {
    rules: {
      // 不变量 V5：禁止裸 console.* 绕过脱敏 logger。
      // 唯一例外是 logger 自身（它是对外唯一的输出口）。
      'no-console': 'error',
    },
  },
  {
    files: ['lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // 命令行脚本（Node CLI，无 logger 概念）：stdout 就是它们的输出通道，豁免 V5。
    files: ['scripts/**/*.mjs', '*.mjs'],
    rules: { 'no-console': 'off' },
  },
]

export default eslintConfig
