<script setup lang="ts">
/**
 * 发帖页：Markdown 编辑 + 实时预览 + 标签选择，这一版会把文章真正写入数据库。
 *
 * 三点：用 `definePageMeta({ middleware: 'auth' })` 在入口拦未登录用户，
 * 并带上 `?redirect=` 以便登录后回跳；
 * 请求体只有标题、正文、标签——作者信息由后端从 Token 取，前端连「我是谁」都不必传；
 * 校验规则来自 `packages/shared`，与后端 DTO 用同一批常量。
 *
 * 编辑 / 预览切换交给定 UTabs 统一接管：桌面与移动共用同一套标签，
 * 不再维护自写的底部切换条与显隐逻辑，体验完全一致。
 */
import { Eye } from 'lucide-vue-next'
import type { Post } from '@studyplan/shared'
import {
  CONTENT_MAX_LENGTH,
  CONTENT_MIN_LENGTH,
  GITHUB_SOURCE_TAG,
  MAX_TAGS_PER_POST,
  POST_TAGS,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from '@studyplan/shared'
import { ApiRequestError } from '~/composables/useApi'

/**
 * 本页面需要登录，但这一行只影响体验（未登录时拦在页面外）。
 * 真正的安全边界在后端的 `@UseGuards(JwtAuthGuard)`：即便有人绕过这里直接发请求，后端照样返回 401。
 */
definePageMeta({ middleware: 'auth' })

const api = useApi()
const { render } = useMarkdown()

const form = reactive({
  title: '',
  content: '',
  tags: [] as string[],
})

/** 发布结果：null 表示还没提交过 */
const result = ref<{ ok: boolean; message: string } | null>(null)
const publishing = ref(false)

const titleLength = computed(() => form.title.trim().length)
const contentLength = computed(() => form.content.trim().length)

/**
 * 用户可选的标签 = 白名单去掉「每日报道」的来源标签。
 *
 * 为什么要去掉：`GITHUB_SOURCE_TAG` 是"这篇从哪来"的标记，
 * 卡片靠它判断是否显示「AI 每日推荐」角标。
 * 如果用户也能选它，那么人工写的帖子也会顶着那个角标 ——
 * 一个看起来像小问题的显示错误，实际是在向读者谎报内容来源。
 * 这类"来源标识"必须是**系统独占**的，否则它就不再是标识。
 */
const selectableTags = computed(() =>
  POST_TAGS.filter((tag) => tag !== GITHUB_SOURCE_TAG),
)

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

const previewHtml = computed(() =>
  form.content.trim()
    ? render(form.content)
    : '<p class="text-dimmed">左侧开始写，这里会实时出现渲染结果。</p>',
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
     * 请求体只有三个字段：作者由后端从 Access Token 解析，
     * 客户端无法指定，这是安全设计而非图省事。
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
       * 后端校验错误带 `details`（字符串数组），拼进来用户才知道具体哪个字段不合规；
       * 只显示「参数校验未通过」等于没说。
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
  <div class="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
    <!-- 页头 -->
    <header class="pt-10 pb-6">
      <h1 class="text-display font-semibold tracking-tight text-highlighted">写文章</h1>
      <p class="mt-1.5 text-body text-muted">
        用 Markdown 撰写。切换到「预览」标签即可看到读者最终看到的样子。
      </p>
    </header>

    <!-- 编辑 / 预览：交给 UTabs 统一接管，桌面与移动共用一套标签 -->
    <UTabs
      :items="[
        { label: '编辑', icon: 'i-lucide-pen-line', slot: 'edit' },
        { label: '预览', icon: 'i-lucide-eye', slot: 'preview' },
      ]"
      class="w-full"
    >
      <!-- 编辑面板 -->
      <template #edit>
        <section class="card-surface mt-6 space-y-5">
          <!-- 标题 -->
          <div>
            <UInput
              v-model="form.title"
              :maxlength="TITLE_MAX_LENGTH + 20"
              placeholder="给文章起一个能让人想点开的标题"
              aria-label="标题"
              size="lg"
              class="w-full"
            />
            <div class="mt-1.5 flex justify-end">
              <span
                class="text-caption tabular-nums"
                :class="titleLength > TITLE_MAX_LENGTH ? 'text-error' : 'text-dimmed'"
              >
                {{ titleLength }} / {{ TITLE_MAX_LENGTH }}
              </span>
            </div>
          </div>

          <!-- 正文 -->
          <div>
            <UTextarea
              v-model="form.content"
              :rows="20"
              :maxlength="CONTENT_MAX_LENGTH + 200"
              placeholder="## 小标题&#10;&#10;正文内容…支持 `行内代码`、```ts 代码块```、> 引用、- 列表&#10;&#10;> 提示：写完切到「预览」看看代码块排版"
              aria-label="正文（Markdown）"
              class="w-full font-mono text-body leading-7"
            />
            <div class="mt-1.5 flex justify-between">
              <span class="text-caption text-dimmed">最少 {{ CONTENT_MIN_LENGTH }} 字</span>
              <span
                class="text-caption tabular-nums"
                :class="contentLength > CONTENT_MAX_LENGTH ? 'text-error' : 'text-dimmed'"
              >
                {{ contentLength }} 字
              </span>
            </div>
          </div>

          <!-- 标签 -->
          <div>
            <div class="mb-2.5 flex items-center justify-between">
              <span class="text-body-sm font-medium text-toned">标签</span>
              <span class="text-caption text-dimmed">
                已选 {{ form.tags.length }} / {{ MAX_TAGS_PER_POST }}
              </span>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="tag in selectableTags"
                :key="tag"
                size="xs"
                :variant="form.tags.includes(tag) ? 'solid' : 'outline'"
                :color="form.tags.includes(tag) ? 'primary' : 'neutral'"
                class="rounded-full"
                @click="toggleTag(tag)"
              >
                {{ tag }}
              </UButton>
            </div>

            <!-- 已选标签可单独移除：比"再点一次那个标签"更直观 -->
            <div v-if="form.tags.length" class="mt-3 flex flex-wrap gap-2">
              <UButton
                v-for="tag in form.tags"
                :key="`selected-${tag}`"
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-x"
                :aria-label="`移除标签 ${tag}`"
                @click="toggleTag(tag)"
              >
                {{ tag }}
              </UButton>
            </div>
          </div>

          <!--
            AI 说明面板。
            图标单独染成紫罗兰 —— 那是全站 AI 相关内容的强调色，
            与青蓝主色形成冷暖对比，一眼就能认出"这块跟 AI 有关"。
            其余样式交给 UAlert，不另造一套卡片。
          -->
          <UAlert
            color="info"
            variant="soft"
            icon="i-lucide-sparkles"
            title="发布后自动完成"
            :ui="{ icon: 'text-ai-500' }"
          >
            <template #description>
              <p class="text-body-sm leading-6">
                系统会读取标题与正文，自动生成一句话摘要和推荐标签。
              </p>
              <p class="mt-1.5 text-caption leading-6">
                它走旁路：<strong class="font-medium">不会拖慢发布，也不会让发布失败</strong>。
                如果生成失败，你的文章照样发布成功，只是没有摘要。
                所以点完发布可以直接跳转，摘要会稍后出现在详情页。
              </p>
            </template>
          </UAlert>

          <!-- 校验错误 -->
          <UAlert
            v-if="visibleErrors.length"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            title="还有几处需要修改"
          >
            <ul class="mt-1 space-y-1">
              <li v-for="error in visibleErrors" :key="error" class="text-body-sm">
                · {{ error }}
              </li>
            </ul>
          </UAlert>

          <!-- 发布结果（失败时展示） -->
          <UAlert
            v-if="result && !result.ok"
            color="warning"
            variant="soft"
            icon="i-lucide-lightbulb"
            :description="result.message"
          />

          <!-- 操作区 -->
          <div class="flex flex-wrap items-center gap-3 border-t border-default pt-5">
            <UButton
              size="lg"
              icon="i-lucide-pen-line"
              :loading="publishing"
              @click="publish"
            >
              {{ publishing ? '发布中…' : '发布文章' }}
            </UButton>

            <UButton size="lg" color="neutral" variant="outline" @click="resetForm">
              清空
            </UButton>

            <span class="text-caption text-dimmed">作者信息由登录凭证决定，无法手动指定</span>
          </div>
        </section>
      </template>

      <!-- 预览面板 -->
      <template #preview>
        <section class="mt-6">
          <div class="mb-2.5 flex items-center justify-between">
            <span class="inline-flex items-center gap-1.5 text-body-sm font-medium text-toned">
              <Eye :size="14" />
              实时预览
            </span>
            <span class="text-caption text-dimmed">与读者看到的一致</span>
          </div>

          <UCard :ui="{ body: 'p-6' }">
            <h1
              v-if="form.title"
              class="text-heading leading-tight font-semibold tracking-tight text-highlighted"
            >
              {{ form.title }}
            </h1>
            <p v-else class="text-heading leading-tight font-semibold text-dimmed">
              文章标题会出现在这里
            </p>

            <div v-if="form.tags.length" class="mt-3 flex flex-wrap gap-2">
              <UBadge
                v-for="tag in form.tags"
                :key="`preview-${tag}`"
                variant="subtle"
                color="neutral"
                size="xs"
              >
                {{ tag }}
              </UBadge>
            </div>

            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose-post mt-6" v-html="previewHtml" />
          </UCard>
        </section>
      </template>
    </UTabs>
  </div>
</template>
