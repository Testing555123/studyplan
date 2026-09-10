<script setup lang="ts">
/**
 * 评论区：列表 + 发表框。
 *
 * 它同时演示了四种"真实应用必须有、但 demo 里经常被省略"的状态：
 *   1. 加载中     —— 显示骨架条，而不是空白
 *   2. 空列表     —— 给出引导文案，而不是一片虚无
 *   3. 未登录     —— 把输入框换成"登录后参与讨论"，而不是让用户写完才发现提交失败
 *   4. 提交中     —— 按钮禁用 + 文案变化，防止重复提交
 *
 * 这四种状态才是"做完了"和"能用了"之间的差别。
 */
import { MessageSquare, Send, Trash2 } from 'lucide-vue-next'
import { COMMENT_MAX_LENGTH, type Comment } from '@studyplan/shared'

const props = withDefaults(
  defineProps<{
    comments: Comment[]
    loading?: boolean
    submitting?: boolean
    /** 当前用户是否已登录（由 useAuth 的真实登录态决定） */
    canComment?: boolean
    /** 当前用户 id，用来判断"这条评论是不是我发的" */
    currentUserId?: string | null
    /** 发表失败时的错误提示 */
    error?: string | null
  }>(),
  {
    loading: false,
    submitting: false,
    canComment: false,
    currentUserId: null,
    error: null,
  },
)

const emit = defineEmits<{
  (event: 'submit', content: string): void
  (event: 'delete', commentId: string): void
}>()

/**
 * 判断某条评论是不是当前用户发的。
 *
 * ⚠️ 这个判断**只用于决定要不要显示删除按钮**，它不是一个权限检查。
 *    真正的权限判断在后端的 `findOneAndDelete({ _id, 'author.id': actor.id })` ——
 *    即使有人伪造请求删别人的评论，后端也会返回 403。
 */
function isMine(comment: Comment): boolean {
  return Boolean(props.currentUserId) && comment.author.id === props.currentUserId
}

const draft = ref('')

/** 用 computed 而不是 watch：剩余字数永远是 draft 的派生值，不该有中间态 */
const remaining = computed(() => COMMENT_MAX_LENGTH - draft.value.length)
const tooLong = computed(() => remaining.value < 0)
const canSubmit = computed(
  () => draft.value.trim().length > 0 && !tooLong.value && !props.submitting,
)

function submit(): void {
  if (!canSubmit.value) return
  emit('submit', draft.value.trim())
  draft.value = ''
}
</script>

<template>
  <section class="mt-10">
    <header class="mb-5 flex items-center gap-2">
      <MessageSquare :size="18" class="text-slate-400" />
      <h2 class="text-[15px] font-semibold text-slate-900 dark:text-white">
        评论
        <span class="ml-1 text-slate-400 dark:text-slate-500">{{ comments.length }}</span>
      </h2>
    </header>

    <!-- 发表框 -->
    <div v-if="canComment" class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#16161d]">
      <textarea
        v-model="draft"
        rows="3"
        :maxlength="COMMENT_MAX_LENGTH + 50"
        placeholder="说说你的看法，或者补充一个你踩过的坑…"
        class="w-full resize-none border-0 bg-transparent text-[14px] leading-6 text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
      />
      <!-- 发表失败提示 -->
      <p v-if="error" class="mt-2 text-[12.5px] text-rose-600 dark:text-rose-400">
        {{ error }}
      </p>

      <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
        <span
          class="text-[12px] tabular-nums"
          :class="
            tooLong
              ? 'text-rose-500'
              : remaining < 50
                ? 'text-amber-500'
                : 'text-slate-400 dark:text-slate-500'
          "
        >
          还可以写 {{ remaining }} 字
        </span>

        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-[13px] font-medium text-white transition-all duration-200 hover:bg-brand-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSubmit"
          @click="submit"
        >
          <Send :size="14" />
          {{ submitting ? '发表中…' : '发表评论' }}
        </button>
      </div>
    </div>

    <!-- 未登录时把输入框替换为引导，避免用户白写一段再被拒 -->
    <div
      v-else
      class="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 dark:border-white/15 dark:bg-white/5"
    >
      <p class="text-[13.5px] text-slate-500 dark:text-slate-400">
        登录后即可参与讨论
      </p>
      <NuxtLink
        to="/login"
        class="inline-flex h-9 shrink-0 items-center rounded-xl border border-brand-300 px-4 text-[13px] font-medium text-brand-600 transition-colors hover:bg-brand-50 dark:border-brand-700 dark:text-brand-400 dark:hover:bg-brand-500/10"
      >
        去登录
      </NuxtLink>
    </div>

    <!-- 列表 -->
    <div class="mt-6 space-y-4">
      <!-- 加载骨架 -->
      <template v-if="loading">
        <div
          v-for="index in 2"
          :key="`skeleton-${index}`"
          class="animate-pulse rounded-2xl border border-slate-100 p-4 dark:border-white/5"
        >
          <div class="flex items-center gap-2.5">
            <div class="h-7 w-7 rounded-full bg-slate-200 dark:bg-white/10" />
            <div class="h-3 w-24 rounded bg-slate-200 dark:bg-white/10" />
          </div>
          <div class="mt-3 h-3 w-3/4 rounded bg-slate-100 dark:bg-white/5" />
          <div class="mt-2 h-3 w-1/2 rounded bg-slate-100 dark:bg-white/5" />
        </div>
      </template>

      <!-- 空态 -->
      <p
        v-else-if="comments.length === 0"
        class="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-[13.5px] text-slate-400 dark:border-white/10 dark:text-slate-500"
      >
        还没有人评论，来说第一句吧
      </p>

      <!-- 正常列表 -->
      <template v-else>
        <article
          v-for="comment in comments"
          :key="comment.id"
          class="rounded-2xl border border-slate-100 bg-white p-4 transition-colors hover:border-slate-200 dark:border-white/5 dark:bg-[#16161d] dark:hover:border-white/10"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br text-[12px] font-semibold text-white"
              :class="avatarGradient(comment.author.username)"
            >
              {{ avatarInitial(comment.author.username) }}
            </span>
            <span class="text-[13px] font-medium text-slate-700 dark:text-slate-200">
              {{ comment.author.username }}
            </span>
            <span class="text-slate-300 dark:text-slate-600">·</span>
            <time class="text-[12px] text-slate-400 dark:text-slate-500" :datetime="comment.createdAt">
              {{ formatRelativeTime(comment.createdAt) }}
            </time>

            <!-- 只有自己的评论才显示删除。用户界面上少一个"你点了会失败"的按钮 -->
            <button
              v-if="isMine(comment)"
              type="button"
              class="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              :aria-label="`删除这条评论`"
              @click="emit('delete', comment.id)"
            >
              <Trash2 :size="12" />
              删除
            </button>
          </div>

          <p class="mt-2.5 text-[14px] leading-7 text-slate-700 dark:text-slate-300">
            {{ comment.content }}
          </p>
        </article>
      </template>
    </div>
  </section>
</template>
