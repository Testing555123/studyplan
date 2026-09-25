<script setup lang="ts">
/**
 * 节点详情抽屉：点课程名后从右侧滑出。
 *
 * ── 为什么是抽屉而不是独立路由页 ──
 *
 * roadmap.sh 给每个节点做独立 guide 页，是因为它有几百个节点、
 * 内容要 SEO。本项目 18 个节点、详情是"上下文增强"而非"目的地"——
 * 用户看完还要回到路线，抽屉打开/关闭不离开列表，路径最短。
 *
 * 受控方式沿用 AiAssistant 的约定：`v-if + :open="true"`，
 * 挂载与展开分离，关闭由父组件把 selected 置 null 完成。
 */
import { findCourseById } from '@studyplan/shared'
import type { Course } from '@studyplan/shared'

const props = defineProps<{ course: Course }>()

const emit = defineEmits<{ close: [] }>()

const { statusOf } = useRoadmapState()

const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: '入门',
  2: '进阶',
  3: '深入',
}

/** 前置节点：id 解析成"名称 + 我的状态"，未完成的给出提示而不是拦死 */
const prerequisites = computed(() =>
  (props.course.prerequisites ?? [])
    .map(id => findCourseById(id))
    .filter((c): c is Course => c !== null)
    .map(course => ({ course, status: statusOf(course) })),
)

const unmetPrerequisites = computed(() => prerequisites.value.filter(p => p.status !== 'completed'))

const resourceIcon: Record<string, string> = {
  doc: 'i-lucide-file-text',
  course: 'i-lucide-graduation-cap',
  book: 'i-lucide-book-open',
  video: 'i-lucide-play-square',
}
</script>

<template>
  <USlideover
    :open="true"
    side="right"
    :ui="{ content: 'w-full sm:max-w-md' }"
    @update:open="emit('close')"
  >
    <template #header>
      <div class="min-w-0">
        <p class="text-eyebrow font-semibold uppercase tracking-eyebrow text-primary">
          学习节点
        </p>
        <h3 class="mt-1 truncate text-subtitle font-semibold text-highlighted">
          {{ course.name }}
        </h3>
      </div>
    </template>

    <template #body>
      <div class="space-y-6">
        <!-- 状态 + 基本属性 -->
        <div class="flex items-center justify-between gap-3">
          <RoadmapStatusControl :course="course" />
          <div class="flex flex-wrap items-center justify-end gap-1.5 text-caption text-muted">
            <span v-if="course.difficulty">难度 · {{ DIFFICULTY_LABEL[course.difficulty] }}</span>
            <span v-if="course.difficulty && course.estHours">·</span>
            <span v-if="course.estHours">约 {{ course.estHours }} 小时</span>
            <span v-if="course.estHours && course.credits">·</span>
            <span>{{ course.credits }} 学分</span>
          </div>
        </div>

        <!-- 学什么 -->
        <section v-if="course.description">
          <h4 class="text-eyebrow font-semibold uppercase tracking-eyebrow text-muted">学什么</h4>
          <p class="mt-2 text-body-sm leading-6 text-tonal">{{ course.description }}</p>
        </section>

        <!-- 标签 -->
        <section v-if="course.tags?.length">
          <h4 class="text-eyebrow font-semibold uppercase tracking-eyebrow text-muted">标签</h4>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <UBadge
              v-for="tag in course.tags"
              :key="tag"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              {{ tag }}
            </UBadge>
          </div>
        </section>

        <!-- 前置依赖：只提示不强制 —— 学习顺序是建议不是关卡 -->
        <section v-if="prerequisites.length">
          <h4 class="text-eyebrow font-semibold uppercase tracking-eyebrow text-muted">
            建议先学
          </h4>
          <ul class="mt-2 space-y-2">
            <li
              v-for="pre in prerequisites"
              :key="pre.course.id"
              class="flex items-center justify-between gap-3 text-body-sm"
            >
              <span class="text-highlighted">{{ pre.course.name }}</span>
              <RoadmapStatusBadge :status="pre.status" />
            </li>
          </ul>
          <p v-if="unmetPrerequisites.length" class="mt-2 text-caption text-warning">
            有 {{ unmetPrerequisites.length }} 个前置节点尚未完成，直接学可以，但遇到卡点先回头检查它们。
          </p>
        </section>

        <!-- 推荐资源 -->
        <section v-if="course.resources?.length">
          <h4 class="text-eyebrow font-semibold uppercase tracking-eyebrow text-muted">
            推荐资源
          </h4>
          <ul class="mt-2 space-y-1">
            <li v-for="res in course.resources" :key="res.url">
              <UButton
                :to="res.url"
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
                variant="link"
                size="sm"
                class="px-0"
                :icon="resourceIcon[res.type] ?? 'i-lucide-link'"
                trailing-icon="i-lucide-external-link"
              >
                {{ res.title }}
              </UButton>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </USlideover>
</template>
