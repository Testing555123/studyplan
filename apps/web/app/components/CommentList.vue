<script setup lang="ts">
/**
 * 评论区：列表 + 发表框，集中演示四种真实应用必须有、而 demo 常省略的状态：
 *   1. 加载中     —— 显示骨架条，而不是空白
 *   2. 空列表     —— 给出引导文案，而不是一片虚无
 *   3. 未登录     —— 把输入框换成「登录后参与讨论」，而不是让用户写完才发现提交失败
 *   4. 提交中     —— 按钮禁用 + 文案变化，防止重复提交
 *
 * 把这些都覆盖到，「能跑」和「能用」之间才真正补齐。
 */

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
 * 这个判断**只用于决定要不要显示删除按钮**，它不是一个权限检查。
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

/** 评论撰写弹窗：受控挂载，避免 v-model 不渲染的坑（见 AiAssistant.vue） */
const composing = ref(false)

function submit(): void {
  if (!canSubmit.value) return
  emit('submit', draft.value.trim())
  draft.value = ''
  composing.value = false
}
</script>

<template>
  <section class="mt-10">
    <header class="mb-5 flex items-center gap-2">
      <UIcon name="i-lucide-message-square" class="size-[var(--icon-md)] text-muted" />
      <h2 class="text-subtitle font-semibold text-highlighted">
        评论
        <span class="ml-1 text-muted">{{ comments.length }}</span>
      </h2>
    </header>

    <!-- 发表入口：已登录时点击弹出 UModal 撰写 -->
    <UButton
      v-if="canComment"
      block
      color="neutral"
      variant="outline"
      icon="i-lucide-pen-line"
      class="rounded-card"
      @click="composing = true"
    >
      写评论
    </UButton>

    <!-- 未登录时把输入框替换为引导，避免用户白写一段再被拒 -->
    <UAlert
      v-else
      color="neutral"
      variant="soft"
      icon="i-lucide-log-in"
      title="登录后即可参与讨论"
    >
      <template #actions>
        <UButton to="/login" size="xs" variant="outline" color="primary">去登录</UButton>
      </template>
    </UAlert>

    <!-- 撰写弹窗 -->
    <UModal
      v-if="composing"
      :open="true"
      :ui="{ content: 'sm:max-w-lg' }"
      @update:open="(value: boolean) => { if (!value) composing = false }"
    >
      <template #header>
        <p class="text-body-sm font-semibold text-highlighted">写评论</p>
      </template>

      <template #body>
        <UTextarea
          v-model="draft"
          :rows="4"
          :maxlength="COMMENT_MAX_LENGTH + 50"
          placeholder="说说你的看法，或者补充一个你踩过的坑…"
          class="w-full"
          autofocus
        />

        <UAlert
          v-if="error"
          class="mt-2"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :description="error"
        />

        <p
          class="mt-2 text-caption tabular-nums"
          :class="tooLong ? 'text-error' : remaining < 50 ? 'text-warning' : 'text-muted'"
        >
          还可以写 {{ remaining }} 字
        </p>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="composing = false">取消</UButton>
          <UButton
            icon="i-lucide-send"
            :disabled="!canSubmit"
            :loading="submitting"
            @click="submit"
          >
            {{ submitting ? '发表中…' : '发表评论' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- 列表 -->
    <div class="mt-6 space-y-4">
      <!-- 加载骨架 -->
      <template v-if="loading">
        <UCard v-for="index in 2" :key="`skeleton-${index}`">
          <div class="flex items-center gap-2.5">
            <USkeleton class="h-7 w-7 rounded-pill" />
            <USkeleton class="h-3 w-24" />
          </div>
          <USkeleton class="mt-3 h-3 w-3/4" />
          <USkeleton class="mt-2 h-3 w-1/2" />
        </UCard>
      </template>

      <!-- 空态 -->
      <UEmpty
        v-else-if="comments.length === 0"
        icon="i-lucide-message-square"
        title="还没有人评论"
        description="来说第一句吧"
      />

      <!-- 正常列表：错落淡入，与首页/榜单一致；reduced-motion 下由全局媒体查询降级 -->
      <TransitionGroup
        v-else
        name="fade-up"
        tag="div"
        class="stagger space-y-4"
      >
        <UCard
          v-for="(comment, index) in comments"
          :key="comment.id"
          :style="{ '--i': index }"
          :ui="{ body: 'p-4' }"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="grid h-7 w-7 place-items-center rounded-pill bg-primary/10 text-caption font-semibold text-primary"
            >
              {{ avatarInitial(comment.author.username) }}
            </span>
            <span class="text-body-sm font-medium text-toned">
              {{ comment.author.username }}
            </span>
            <span class="text-muted">·</span>
            <time class="text-caption text-muted" :datetime="comment.createdAt">
              {{ formatRelativeTime(comment.createdAt) }}
            </time>

            <!-- 只有自己的评论才显示删除。用户界面上少一个"你点了会失败"的按钮 -->
            <UButton
              v-if="isMine(comment)"
              class="ml-auto"
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              :aria-label="`删除这条评论`"
              @click="emit('delete', comment.id)"
            >
              删除
            </UButton>
          </div>

          <p class="mt-2.5 text-body leading-7 text-toned">
            {{ comment.content }}
          </p>
        </UCard>
      </TransitionGroup>
    </div>
  </section>
</template>
