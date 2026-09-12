import type { GithubRepo, RepoQuestionContext } from '@studyplan/shared'

/**
 * AI 助手的全局状态。
 *
 * 为什么需要一个"全局状态"，而不是让页面自己管一个 ref？
 *   因为助手挂在 `app.vue` 上（全站唯一），而唤起它的按钮散落在各处：
 *   /trending 的每张卡片都能点「问 AI」，将来别的地方也可能加。
 *   两条链路隔着一个路由层级，靠 props / emit 是传不过去的。
 *
 * 用 `useState` 而不是普通模块级变量：
 *   `useState` 是 Nuxt 提供的**SSR 安全**的跨组件状态，
 *   服务端每个请求拿到独立副本，不会串号；
 *   而模块级变量在服务端是**所有请求共享**的，会变成事故。
 */
export function useAiAssistant() {
  /** 抽屉是否展开 */
  const open = useState<boolean>('ai-assistant-open', () => false)

  /** 当前提问的上下文：有值表示"正在问某个开源项目"，null 表示问本站代码 */
  const context = useState<RepoQuestionContext | null>('ai-assistant-context', () => null)

  /** 预填的问题（点卡片时给个引导，省得用户面对空白输入框） */
  const presetQuestion = useState<string>('ai-assistant-preset', () => '')

  function openPanel(): void {
    context.value = null
    presetQuestion.value = ''
    open.value = true
  }

  /** 针对某个开源项目提问 */
  function askAboutRepo(repo: GithubRepo): void {
    context.value = {
      type: 'repo',
      fullName: repo.fullName,
      description: repo.description,
      language: repo.language,
      htmlUrl: repo.htmlUrl,
    }
    presetQuestion.value = ''
    open.value = true
  }

  function close(): void {
    open.value = false
  }

  return { open, context, presetQuestion, openPanel, askAboutRepo, close }
}
