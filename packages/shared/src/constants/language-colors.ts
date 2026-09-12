/**
 * 编程语言的标识色。
 *
 * 用途：卡片与筛选器上的那颗"语言色点"。它让用户不用读文字
 * 就能扫出技术栈分布 —— 这是 GitHub、GitLab 都在用的视觉惯例。
 *
 * 色值取自 GitHub 官方的 linguist 配色，所以用户看到 TypeScript 的蓝、
 * Python 的深蓝，和他在 GitHub 上看到的是一致的，不需要重新建立认知。
 */
export const LANGUAGE_COLORS: Readonly<Record<string, string>> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Dart: '#00b4ab',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Lua: '#000080',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Zig: '#ec915c',
  Jupyter: '#da5b0b',
  JupyterNotebook: '#da5b0b',
  'Jupyter Notebook': '#da5b0b',
  MDX: '#fcb32c',
  Markdown: '#083fa1',
  Makefile: '#427819',
  Dockerfile: '#384d54',
  Nix: '#7e7eff',
}

/** 没有语言或语言不在表内时的兜底色（中性灰，不会抢视线） */
const FALLBACK_LANGUAGE_COLOR = '#8b949e'

/**
 * 取语言色。
 *
 * 为什么做成函数而不是直接 `LANGUAGE_COLORS[lang]`？
 *   因为 language 可能为 null，也可能是不在表里的新语言 ——
 *   直接下标访问会返回 undefined，样式上表现成"色点消失"，
 *   而这类"静默失效"最难排查。收敛成一个函数，兜底逻辑只有一处。
 */
export function languageColor(language: string | null | undefined): string {
  if (!language) return FALLBACK_LANGUAGE_COLOR
  return LANGUAGE_COLORS[language] ?? FALLBACK_LANGUAGE_COLOR
}
