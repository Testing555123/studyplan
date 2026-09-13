<script setup lang="ts">
/**
 * 右下角浮动 AI 助手。
 *
 * 两种唤起方式，共用同一个抽屉：
 *   · 直接点悬浮按钮   —— 问本站代码或通用技术问题；
 *   · 点卡片的「问 AI」—— 自动带上那个开源项目的上下文。
 *
 * ── 为什么失败不弹 Toast 而是在面板内提示 ──
 * 因为失败有**四种**不同含义（未启用 / 额度用完 / 太快了 / 上游出错），
 * 用户看到之后该做的事完全不同。Toast 一闪而过，装不下这些区分；
 * 放在面板里，用户可以读完整句话再决定要不要重试。
 *
 * ── 视觉 ──
 * 悬浮按钮用「青蓝 → 紫罗兰」渐变：青蓝是全站主色，紫罗兰是 AI 的强调色，
 * 两者冷暖对比，既点明"这是 AI"，又不脱离全站配色。
 */
import { Sparkles } from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import type { AiStatus, AskAiResponse, RepoQuestionContext } from '@studyplan/shared'

const { open, context, presetQuestion, close } = useAiAssistant()
const api = useApi()

/**
 * markdown-it 配置。
 *
 * `html: false` 是**安全底线**：答案是模型生成的，
 * 如果允许原样渲染 HTML，模型输出（或被诱导输出）的 `<script>` 就会执行。
 * 关掉它，最坏情况只是排版不好看，而不是一个存储型 XSS。
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

const status = ref<AiStatus | null>(null)
const question = ref('')
const loading = ref(false)
const answer = ref<string | null>(null)
const reason = ref<AskAiResponse['reason']>(null)
const sources = ref<string[]>([])
const cached = ref(false)
const remaining = ref<number | null>(null)

/** 渲染后的答案 HTML（html:false 已关掉危险标签） */
const renderedAnswer = computed(() => (answer.value ? md.render(answer.value) : ''))

/** 未启用时不要显示输入框 —— 给了也问不出结果，只会让人困惑 */
const canAsk = computed(() => status.value?.enabled !== false)

/** 面板顶部的上下文提示文案 */
const contextLabel = computed(() => {
  const current: RepoQuestionContext | null = context.value
  return current ? `正在问：${current.fullName}` : '本站代码 · 技术问题'
})

/**
 * 未启用时的可操作提示。
 *
 * 关键点：NVNIM_API_KEY 是**部署平台的环境变量**，前端没有、也不该有它的副本。
 * 所以"没启用"这件事，普通用户看到能知道"功能没开"，但**部署者**需要知道下一步
 * 是"去平台配 Key + 重新部署"。这里把动作写明确，免得部署者以为改完前端就行。
 *
 * 顺带把自检字段（codeIndexLoaded / codeIndexFiles）透出来：
 * 即使 Key 没配，代码索引也可能已经随镜像进去了——这条信息能帮部署者一眼分清
 * "是 Key 没配"还是"连索引都没进运行层"，而不是两个都去瞎猜。
 */
const disabledHint = computed(() => {
  if (!status.value) return 'AI 功能未启用。'

  const parts = [
    '服务端未配置 NVNIM_API_KEY（这是部署平台的环境变量，不是前端配置）。',
    '在平台环境变量里填入你的 NVIDIA NIM Key 后，必须触发一次重新部署才会生效。',
  ]
  if (status.value.codeIndexFiles !== undefined) {
    parts.push(
      status.value.codeIndexLoaded
        ? `代码索引已就绪（${status.value.codeIndexFiles} 个文件）。`
        : '代码索引未加载：索引未随构建产物进入运行层。',
    )
  }
  return parts.join('')
})

/** 把后端给的 reason 翻译成用户能懂的一句提示 */
const noticeText = computed(() => {
  switch (reason.value) {
    case 'not-configured':
      return 'AI 功能未启用：服务端没有配置 NVNIM_API_KEY。它是部署平台的环境变量，不是前端配置——在平台环境变量里填入你的 NVIDIA NIM Key 后，必须重新部署才会生效。'
    case 'quota-exceeded':
      return '今日 AI 额度已用完，明天再来吧（已缓存的问题仍可查看）。'
    case 'rate-limited':
      return '你问得太快了，稍等一下再试。'
    case 'error':
      return 'AI 服务暂时不可用，请稍后重试。'
    default:
      return null
  }
})

onMounted(async () => {
  try {
    status.value = await api.get<AiStatus>('/ai/status')
  } catch {
    // 取不到状态就当作未启用：助手是增强功能，不该因为它让页面出问题
    status.value = null
  }
})

async function submit(): Promise<void> {
  const text = question.value.trim()
  if (!text || loading.value) return

  loading.value = true
  answer.value = null
  reason.value = null
  sources.value = []

  try {
    const res = await api.post<AskAiResponse>('/ai/ask', {
      question: text,
      context: context.value,
    })
    answer.value = res.answer
    reason.value = res.reason
    sources.value = res.sources
    cached.value = res.cached
    remaining.value = res.remainingToday
  } catch (error) {
    reason.value = 'error'
    answer.value = null
    console.error('[AiAssistant] 提问失败', error)
  } finally {
    loading.value = false
  }
}

/** 打开时把预填问题带进输入框（点卡片「问 AI」时会用到） */
watch(open, (isOpen) => {
  if (isOpen && presetQuestion.value) {
    question.value = presetQuestion.value
    presetQuestion.value = ''
  }
})
</script>

<template>
  <!--
    悬浮按钮：GitHub 克制风（中性表面 + 1px 细边框 + 轻阴影 + 圆角方形）。
    只让 Sparkles 图标用单一强调色（text-primary）点出"这是 AI"，
    其余一律中性，降低视觉噪音——正是 GitHub Copilot「中性按钮 + 着色图标」的范式。
  -->
  <UButton
    variant="ghost"
    class="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-xl border border-default bg-default text-primary shadow-sm transition-transform hover:scale-105 hover:border-emphasis hover:bg-muted hover:text-default active:scale-95"
    :aria-label="open ? '关闭 AI 助手' : '打开 AI 助手'"
    @click="open ? close() : (open = true)"
  >
    <Sparkles :size="20" />
  </UButton>

  <!--
    ⚠️ 这里刻意用 `v-if` + `:open="true"`，而不是更常见的 `v-model="open"`。
    实测 `v-model` 写法在本项目里抽屉完全不渲染（`open` 状态确实变成了 true，
    但组件没有输出任何节点，控制台也不报错）。改为由 `v-if` 决定挂载时机、
    显式把 `open` 置真，组件行为立刻恢复正常。
    这是"受控浮层"更稳妥的用法：**挂载与展开分离**，不依赖组件内部
    对 `open` 的转发链路。
  -->
  <USlideover
    v-if="open"
    :open="true"
    side="right"
    :ui="{ content: 'w-full sm:max-w-md' }"
    @update:open="(value) => { if (!value) close() }"
  >
    <template #header>
      <div class="flex items-center justify-between gap-3 border-b border-default pb-3">
        <div class="min-w-0">
          <p class="flex items-center gap-1.5 text-[13px] font-semibold text-highlighted">
            <Sparkles :size="14" class="text-primary" />
            AI 学习助手
          </p>
          <p class="mt-0.5 truncate text-[11.5px] text-muted">{{ contextLabel }}</p>
        </div>
        <UBadge
          v-if="status && status.enabled && remaining !== null"
          variant="subtle"
          color="neutral"
          size="xs"
          class="rounded-full"
        >
          今日剩余 {{ remaining }}
        </UBadge>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- 未启用 -->
        <UAlert
          v-if="status && !status.enabled"
          color="warning"
          variant="soft"
          icon="i-lucide-info"
          title="AI 功能未启用"
          :description="disabledHint"
        />

        <!-- 答案区 -->
        <div v-if="answer" class="space-y-3">
          <div class="flex items-center gap-2">
            <UBadge v-if="cached" variant="soft" color="neutral" size="xs">来自缓存</UBadge>
          </div>

          <!-- 答案正文：Markdown 渲染（已禁用 HTML） -->
          <div class="prose-post text-[13.5px]" v-html="renderedAnswer" />

          <!-- 引用到的本站代码文件：让答案可核对，对一个学习项目尤其重要 -->
          <div v-if="sources.length > 0" class="rounded-lg border border-default bg-muted p-3">
            <p class="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-toned">
              <UIcon name="i-lucide-file" :size="13" class="text-muted" />
              回答参考了这些文件
            </p>
            <ul class="space-y-1">
              <li v-for="source in sources" :key="source" class="text-[11.5px] text-muted">
                <code class="font-mono">{{ source }}</code>
              </li>
            </ul>
          </div>
        </div>

        <!-- 生成中 -->
        <div v-else-if="loading" class="space-y-2">
          <p class="text-[12.5px] text-muted">AI 正在阅读…</p>
          <USkeleton class="h-3 w-full" />
          <USkeleton class="h-3 w-11/12" />
          <USkeleton class="h-3 w-4/5" />
        </div>

        <!-- 失败提示 -->
        <UAlert
          v-else-if="noticeText"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :description="noticeText"
        />

        <!-- 引导 -->
        <div v-else class="space-y-2 text-[12.5px] text-muted">
          <p>你可以这样问它：</p>
          <ul class="space-y-1">
            <li>· 这个项目是干什么的，适合我现在学吗？</li>
            <li>· app.module.ts 这个文件为什么要这样组织？</li>
            <li>· 为什么发帖时 AI 摘要要写成"旁路"？</li>
          </ul>
        </div>
      </div>
    </template>

    <template #footer>
      <div v-if="canAsk" class="flex w-full items-end gap-2">
        <UTextarea
          v-model="question"
          :rows="2"
          :maxlength="500"
          autoresize
          class="flex-1"
          placeholder="输入你的问题（最多 500 字）"
          @keydown.enter.exact.prevent="submit"
        />
        <UButton
          color="primary"
          :loading="loading"
          :disabled="!question.trim()"
          icon="i-lucide-send"
          class="self-end"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>
