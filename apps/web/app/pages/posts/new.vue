<script setup lang="ts">
/**
 * 发帖页：Markdown 双栏编辑 + 实时预览 + 标签选择。
 *
 * 阶段 5 的变化：这里**真的会把文章写进数据库**了。
 *
 * 三件事值得注意：
 *   1. `definePageMeta({ middleware: 'auth' })` —— 未登录会被守卫拦下，
 *      并带上 `?redirect=` 以便登录后回跳；
 *   2. 请求体里**只有标题、正文、标签**。作者信息由后端从 Token 里取 ——
 *      前端连"我是谁"都不需要告诉后端（那是 Token 已经证明过的事）。
 *   3. 校验规则来自 `packages/shared`，与后端 DTO 用的是同一批常量。
 */
import {
  AlertCircle,
  Eye,
  Lightbulb,
  Loader2,
  PenLine,
  Sparkles,
  X,
} from 'lucide-vue-next'
import type { Post } from '@studyplan/shared'
import {
  CONTENT_MAX_LENGTH,
  CONTENT_MIN_LENGTH,
  MAX_TAGS_PER_POST,
  POST_TAGS,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from '@studyplan/shared'
import { ApiRequestError } from '~/composables/useApi'

/**
 * 关键的一行：本页面需要登录。
 * 它只影响**体验**（未登录时不让进这个页面）。
 * 真正的安全边界在后端的 `@UseGuards(JwtAuthGuard)` ——
 * 即使有人绕过这里直接发请求，后端照样返回 401。
 */
definePageMeta({ middleware: 'auth' })

const api = useApi()
const { render } = useMarkdown()

const form = reactive({
  title: '',
  content: '',
  tags: [] as string[],
})

/** 窄屏用：'edit' | 'preview' */
const mobilePane = ref<'edit' | 'preview'>('edit')

/** 发布结果：null 表示还没提交过 */
const result = ref<{ ok: boolean; message: string } | null>(null)
const publishing = ref(false)

const titleLength = computed(() => form.title.trim().length)
const contentLength = computed(() => form.content.trim().length)

/** 所有校验错误；提交过之后才显示，避免用户刚打开页面就一片红 */
const errors = computed(() => {
  const list: string[] = []
  if (titleLength.value > 0 && titleLength.value < TITLE_MIN_LENGTH) {
    list.push(`标题至少 ${TITLE_MIN_LENGTH} 个字`)
  }
  if (titleLength.value > TITLE_MAX_LENGTH) {
    list.push(`标题最多 ${TITLE_MAX_LENGTH} 个字`)
  }
  if (contentLength.value > 0 && contentLength.value < CONTENT_MIN_LENGTH) {
    list.push(`正文至少 ${CONTENT_MIN_LENGTH} 个字`)
  }
  if (contentLength.value > CONTENT_MAX_LENGTH) {
    list.push(`正文最多 ${CONTENT_MAX_LENGTH} 个字`)
  }
  if (form.tags.length === 0) list.push('至少选择一个标签')
  return list
})

const submitted = ref(false)
const visibleErrors = computed(() => (submitted.value ? errors.value : []))
const canPublish = computed(() => errors.value.length === 0 && !publishing.value)

const previewHtml = computed(() =>
  form.content.trim()
    ? render(form.content)
    : '<p class="text-slate-400">左侧开始写，这里会实时出现渲染结果。</p>',
)

function toggleTag(tag: string): void {
  const index = form.tags.indexOf(tag)
  if (index >= 0) {
    form.tags.splice(index, 1)
    return
  }
  if (form.tags.length >= MAX_TAGS_PER_POST) {
    result.value = { ok: false, message: `最多只能选 ${MAX_TAGS_PER_POST} 个标签` }
    return
  }
  form.tags.push(tag)
}

function resetForm(): void {
  form.title = ''
  form.content = ''
  form.tags = []
  submitted.value = false
  result.value = null
}

async function publish(): Promise<void> {
  submitted.value = true
  result.value = null

  if (errors.value.length > 0) {
    result.value = { ok: false, message: '还有几处需要修改，请看下方提示' }
    return
  }

  publishing.value = true
  try {
    /**
     * 注意请求体只有三个字段。
     * 作者信息由后端从 Access Token 里解析 ——
     * 客户端**没有能力**指定作者，这是安全设计而不是省事。
     */
    const created = await api.post<Post>('/posts', {
      title: form.title.trim(),
      content: form.content,
      tags: form.tags,
    })

    // 先清空草稿再跳转：避免用户返回后误点发布、重复创建同一篇
    resetForm()
    await navigateTo(`/posts/${created.id}`)
  } catch (caught) {
    if (caught instanceof ApiRequestError) {
      /**
       * 后端的校验错误会带 `details`（一个字符串数组）。
       * 把它拼进来，用户才知道具体是哪个字段不合规 ——
       * 只显示"参数校验未通过"等于没说。
       */
      result.value = {
        ok: false,
        message: caught.details?.length
          ? `${caught.message}：${caught.details.join('；')}`
          : caught.message,
      }
    } else {
      result.value = { ok: false, message: '发布失败，请稍后重试' }
    }
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
    <!-- 页头 -->
    <header class="pt-10 pb-6">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">写文章</h1>
      <p class="mt-1.5 text-[13.5px] text-slate-500 dark:text-slate-400">
        用 Markdown 撰写。右侧实时预览的效果，与你发布后读者看到的完全一致。
      </p>
    </header>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- 左栏：编辑 -->
      <section class="space-y-5" :class="mobilePane === 'edit' ? 'block' : 'hidden lg:block'">
        <!-- 标题 -->
        <div>
          <label for="title" class="sr-only">标题</label>
          <input
            id="title"
            v-model="form.title"
            type="text"
            :maxlength="TITLE_MAX_LENGTH + 20"
            placeholder="给文章起一个能让人想点开的标题"
            class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-[17px] font-medium text-slate-900 shadow-none transition-colors placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#16161d] dark:text-white dark:hover:border-white/20"
          />
          <div class="mt-1.5 flex justify-end">
            <span
              class="text-[12px] tabular-nums"
              :class="
                titleLength > TITLE_MAX_LENGTH
                  ? 'text-rose-500'
                  : 'text-slate-400 dark:text-slate-500'
              "
            >
              {{ titleLength }} / {{ TITLE_MAX_LENGTH }}
            </span>
          </div>
        </div>

        <!-- 正文 -->
        <div>
          <label for="content" class="sr-only">正文（Markdown）</label>
          <textarea
            id="content"
            v-model="form.content"
            rows="20"
            :maxlength="CONTENT_MAX_LENGTH + 200"
            placeholder="## 小标题&#10;&#10;正文内容…支持 `行内代码`、```ts 代码块```、> 引用、- 列表&#10;&#10;> 提示：写完记得看看右侧预览里的代码块排版"
            class="w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 font-mono text-[13.5px] leading-7 text-slate-800 shadow-none transition-colors placeholder:font-sans placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#16161d] dark:text-slate-100 dark:hover:border-white/20"
          />
          <div class="mt-1.5 flex justify-between">
            <span class="text-[12px] text-slate-400 dark:text-slate-500">
              最少 {{ CONTENT_MIN_LENGTH }} 字
            </span>
            <span
              class="text-[12px] tabular-nums"
              :class="
                contentLength > CONTENT_MAX_LENGTH
                  ? 'text-rose-500'
                  : 'text-slate-400 dark:text-slate-500'
              "
            >
              {{ contentLength }} 字
            </span>
          </div>
        </div>

        <!-- 标签 -->
        <div>
          <div class="mb-2.5 flex items-center justify-between">
            <span class="text-[13px] font-medium text-slate-700 dark:text-slate-200">标签</span>
            <span class="text-[12px] text-slate-400 dark:text-slate-500">
              已选 {{ form.tags.length }} / {{ MAX_TAGS_PER_POST }}
            </span>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="tag in POST_TAGS"
              :key="tag"
              type="button"
              class="tag-pill"
              :class="form.tags.includes(tag) ? 'tag-pill-active' : 'tag-pill-idle'"
              @click="toggleTag(tag)"
            >
              {{ tag }}
            </button>
          </div>

          <!-- 已选标签可单独移除：比"再点一次那个标签"更直观 -->
          <div v-if="form.tags.length" class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="tag in form.tags"
              :key="`selected-${tag}`"
              class="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            >
              {{ tag }}
              <button
                type="button"
                class="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-brand-200/60 dark:hover:bg-brand-500/20"
                :aria-label="`移除标签 ${tag}`"
                @click="toggleTag(tag)"
              >
                <X :size="11" />
              </button>
            </span>
          </div>
        </div>

        <!-- AI 说明面板 -->
        <div class="ai-panel">
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-ai-500/15 text-ai-700 dark:text-ai-500"
            >
              <Sparkles :size="14" />
            </span>
            <div>
              <p class="text-[12px] font-medium tracking-wide text-ai-700 dark:text-ai-500">
                发布后自动完成
              </p>
              <p class="mt-1.5 text-[13px] leading-6 text-slate-700 dark:text-slate-300">
                系统会读取标题与正文，自动生成一句话摘要和推荐标签（由 LangChain + 智谱 GLM 完成）。
              </p>
              <p class="mt-1.5 text-[12px] leading-6 text-slate-500 dark:text-slate-400">
                它走旁路：<strong class="font-medium">不会拖慢发布，也不会让发布失败</strong>。
                如果生成失败，你的文章照样发布成功，只是没有摘要。
                所以点完发布可以直接跳转，摘要会稍后出现在详情页。
              </p>
            </div>
          </div>
        </div>

        <!-- 校验错误 -->
        <ul v-if="visibleErrors.length" class="space-y-1.5">
          <li
            v-for="error in visibleErrors"
            :key="error"
            class="flex items-center gap-2 text-[13px] text-rose-600 dark:text-rose-400"
          >
            <AlertCircle :size="14" />
            {{ error }}
          </li>
        </ul>

        <!-- 发布结果（失败时展示） -->
        <div
          v-if="result && !result.ok"
          class="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/5"
        >
          <Lightbulb class="mt-0.5 shrink-0 text-amber-500" :size="17" />
          <p class="text-[13px] leading-6 text-slate-700 dark:text-slate-300">
            {{ result.message }}
          </p>
        </div>

        <!-- 操作区 -->
        <div
          class="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5 dark:border-white/5"
        >
          <button
            type="button"
            class="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand-500 px-6 text-sm font-medium text-white shadow-lg shadow-brand-500/20 transition-all duration-200 hover:bg-brand-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="publishing"
            @click="publish"
          >
            <Loader2 v-if="publishing" :size="16" class="animate-spin" />
            <PenLine v-else :size="16" />
            {{ publishing ? '发布中…' : '发布文章' }}
          </button>

          <button
            type="button"
            class="inline-flex h-11 cursor-pointer items-center rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20"
            @click="resetForm"
          >
            清空
          </button>

          <span class="text-[12px] text-slate-400 dark:text-slate-500">
            作者信息由登录凭证决定，无法手动指定
          </span>
        </div>
      </section>

      <!-- 右栏：预览 -->
      <section :class="mobilePane === 'preview' ? 'block' : 'hidden lg:block'">
        <div class="sticky top-24">
          <div class="mb-2.5 flex items-center justify-between">
            <span
              class="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-slate-200"
            >
              <Eye :size="14" />
              实时预览
            </span>
            <span class="text-[12px] text-slate-400 dark:text-slate-500">与读者看到的一致</span>
          </div>

          <div
            class="max-h-[calc(100vh-10rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#16161d]"
          >
            <h1
              v-if="form.title"
              class="text-[22px] leading-tight font-semibold tracking-tight text-slate-900 dark:text-white"
            >
              {{ form.title }}
            </h1>
            <p
              v-else
              class="text-[22px] leading-tight font-semibold text-slate-300 dark:text-slate-600"
            >
              文章标题会出现在这里
            </p>

            <div v-if="form.tags.length" class="mt-3 flex flex-wrap gap-2">
              <span v-for="tag in form.tags" :key="`preview-${tag}`" class="tag-pill tag-pill-idle">
                {{ tag }}
              </span>
            </div>

            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose-post mt-6" v-html="previewHtml" />
          </div>
        </div>
      </section>
    </div>

    <!-- 移动端切换：桌面端隐藏 -->
    <div
      class="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/90 backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-[#0d0d12]/90"
    >
      <button
        type="button"
        class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-3.5 text-[13px] font-medium transition-colors"
        :class="
          mobilePane === 'edit'
            ? 'text-brand-600 dark:text-brand-400'
            : 'text-slate-500 dark:text-slate-400'
        "
        @click="mobilePane = 'edit'"
      >
        <PenLine :size="15" />
        编辑
      </button>
      <button
        type="button"
        class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-3.5 text-[13px] font-medium transition-colors"
        :class="
          mobilePane === 'preview'
            ? 'text-brand-600 dark:text-brand-400'
            : 'text-slate-500 dark:text-slate-400'
        "
        @click="mobilePane = 'preview'"
      >
        <Eye :size="15" />
        预览
      </button>
    </div>

    <!-- 给移动端底部切换条让出空间 -->
    <div class="h-14 lg:hidden" />
  </div>
</template>
