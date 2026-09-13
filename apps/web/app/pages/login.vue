<script setup lang="ts">
/**
 * 登录 / 注册页，用一个页签切换而不是两个路由：用户常在「想登录但没账号」和「注册时发现已有账号」之间切换，
 * 放同一页少一次加载、也少一次心智跳转。
 *
 * 这里的前端校验只是体验优化，不是安全手段：任何人都能用开发者工具删掉规则，或拿 curl 直接调接口。
 * 真正的校验必须由后端再做一遍——本项目的 `RegisterDto` / `LoginDto` 用的就是这里同一批共享常量。
 * 以为「前端校验过了后端就不必校验」，等于把规则放在用户能随意改的地方。
 */
import { LogIn } from 'lucide-vue-next'
import { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@studyplan/shared'
import { ApiRequestError } from '~/composables/useApi'

const route = useRoute()
const auth = useAuth()

const mode = ref<'login' | 'register'>('login')

const form = reactive({
  email: '',
  username: '',
  password: '',
  confirm: '',
})

const submitting = ref(false)
/** 服务端返回的错误信息（登录失败、邮箱已注册……） */
const serverError = ref<string | null>(null)
/** 服务端返回的字段级错误 */
const serverDetails = ref<string[]>([])
const submitted = ref(false)

/** 只做"格式上明显不对"的判断，规则刻意与后端 DTO 保持一致 */
function emailLooksValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const errors = computed(() => {
  const list: string[] = []

  if (!emailLooksValid(form.email)) list.push('请输入有效的邮箱地址')

  if (!form.password) {
    list.push('请输入密码')
  } else if (mode.value === 'register' && form.password.length < PASSWORD_MIN_LENGTH) {
    list.push(`密码至少 ${PASSWORD_MIN_LENGTH} 位`)
  }

  if (mode.value === 'register') {
    const nameLength = form.username.trim().length
    if (nameLength < USERNAME_MIN_LENGTH || nameLength > USERNAME_MAX_LENGTH) {
      list.push(`用户名需要 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字`)
    }
    if (form.confirm !== form.password) list.push('两次输入的密码不一致')
  }

  return list
})

const visibleErrors = computed(() => (submitted.value ? errors.value : []))

function switchMode(next: 'login' | 'register'): void {
  mode.value = next
  serverError.value = null
  serverDetails.value = []
  submitted.value = false
  form.password = ''
  form.confirm = ''
}

async function submit(): Promise<void> {
  submitted.value = true
  serverError.value = null
  serverDetails.value = []

  // 本地校验没过就不发请求 —— 省一次网络往返，也让错误提示更即时
  if (errors.value.length > 0) return

  submitting.value = true
  try {
    if (mode.value === 'login') {
      await auth.login({ email: form.email, password: form.password })
    } else {
      // 注意这里只发三个字段：确认密码是纯前端概念，
      // 后端不需要（也不该）知道它
      await auth.register({
        email: form.email,
        username: form.username.trim(),
        password: form.password,
      })
    }

    /**
     * 登录成功后回跳。
     *
     * 路由守卫在拦截时会把原地址放进 `?redirect=`，
     * 这里读出来跳回去，用户就不用"再点一遍"。
     */
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await navigateTo(redirect)
  } catch (caught) {
    if (caught instanceof ApiRequestError) {
      serverError.value = caught.message
      serverDetails.value = caught.details ?? []
    } else {
      serverError.value = '操作失败，请稍后重试'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col px-4 pt-14 pb-16 sm:px-6">
    <!-- 品牌与标语 -->
    <div class="text-center">
      <span
        class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-500/25"
      >
        <LogIn :size="22" />
      </span>
      <h1 class="mt-5 text-heading font-semibold tracking-tight text-highlighted">
        {{ mode === 'login' ? '欢迎回来' : '创建你的账号' }}
      </h1>
      <p class="mt-1.5 text-body text-muted">
        {{ mode === 'login' ? '继续记录你的学习与思考' : '开始分享你的学习笔记与技术心得' }}
      </p>
    </div>

    <!-- 页签：用 UButton 组而不是手写按钮，圆角/内边距/hover 全由组件统一 -->
    <div class="mt-8 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      <UButton
        :variant="mode === 'login' ? 'solid' : 'ghost'"
        :color="mode === 'login' ? 'primary' : 'neutral'"
        block
        @click="switchMode('login')"
      >
        登录
      </UButton>
      <UButton
        :variant="mode === 'register' ? 'solid' : 'ghost'"
        :color="mode === 'register' ? 'primary' : 'neutral'"
        block
        @click="switchMode('register')"
      >
        注册
      </UButton>
    </div>

    <!-- 表单：UForm + UFormField + UInput，图标直接由 UInput 的 icon 属性承担 -->
    <UForm class="mt-6 space-y-4" :state="form" @submit="submit">
      <UFormField label="邮箱" name="email">
        <UInput
          v-model.trim="form.email"
          type="email"
          autocomplete="email"
          icon="i-lucide-at-sign"
          placeholder="you@example.com"
          class="w-full"
        />
      </UFormField>

      <UFormField v-if="mode === 'register'" label="用户名" name="username">
        <UInput
          v-model.trim="form.username"
          type="text"
          autocomplete="username"
          icon="i-lucide-user"
          :placeholder="`${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字，会显示在文章作者处`"
          class="w-full"
        />
      </UFormField>

      <UFormField label="密码" name="password">
        <UInput
          v-model="form.password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          icon="i-lucide-key-round"
          :placeholder="mode === 'register' ? `至少 ${PASSWORD_MIN_LENGTH} 位` : '输入密码'"
          class="w-full"
        />
      </UFormField>

      <UFormField v-if="mode === 'register'" label="确认密码" name="confirm">
        <UInput
          v-model="form.confirm"
          type="password"
          autocomplete="new-password"
          icon="i-lucide-key-round"
          placeholder="再输入一次"
          class="w-full"
        />
      </UFormField>

      <!-- 本地校验错误 -->
      <UAlert
        v-if="visibleErrors.length"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        title="请先修正以下问题"
      >
        <ul class="mt-1 space-y-1">
          <li v-for="error in visibleErrors" :key="error" class="text-meta">
            · {{ error }}
          </li>
        </ul>
      </UAlert>

      <!-- 服务端返回的错误 -->
      <UAlert
        v-if="serverError"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="serverError"
      >
        <ul v-if="serverDetails.length" class="mt-1 space-y-1">
          <li v-for="detail in serverDetails" :key="detail" class="text-caption">
            · {{ detail }}
          </li>
        </ul>
      </UAlert>

      <!-- 主按钮 -->
      <UButton
        type="submit"
        block
        size="lg"
        :loading="submitting"
        :icon="
          submitting
            ? undefined
            : mode === 'register'
              ? 'i-lucide-user-plus'
              : 'i-lucide-log-in'
        "
      >
        {{ submitting ? '处理中…' : mode === 'login' ? '登录' : '创建账号' }}
      </UButton>
    </UForm>

    <!-- 辅助文案 -->
    <p class="pt-4 text-center text-meta text-muted">
      <template v-if="mode === 'login'">
        还没有账号？
        <UButton variant="link" color="primary" size="xs" @click="switchMode('register')">
          立即注册
        </UButton>
      </template>
      <template v-else>
        已经有账号了？
        <UButton variant="link" color="primary" size="xs" @click="switchMode('login')">
          去登录
        </UButton>
      </template>
    </p>

    <!-- 安全说明：这里描述的都是**本阶段已经真正实现**的行为 -->
    <UCard class="mt-8" :ui="{ body: 'p-4' }">
      <p class="text-caption font-medium tracking-wide text-muted">这个登录是怎么保护你的</p>
      <ul class="mt-2 space-y-1.5 text-caption leading-6 text-muted">
        <li>· 密码用 bcrypt 哈希后入库，数据库里看不到明文</li>
        <li>· Access Token 只存在内存里，刷新页面即失效（15 分钟）</li>
        <li>· Refresh Token 放进 httpOnly Cookie，JavaScript 读不到（7 天）</li>
        <li>· 两个 Token 用不同密钥签发，Access 无法当 Refresh 用</li>
        <li>· 前端校验只为体验，真正的校验在后端再做了一遍</li>
      </ul>
    </UCard>
  </div>
</template>
