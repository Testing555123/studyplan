import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    ignores: ['.next/**', 'node_modules/**', '.source/**', 'content/**', 'playwright-report/**'],
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
]

export default eslintConfig
