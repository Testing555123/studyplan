<script setup lang="ts">
/**
 * 登录 / 注册页。
 *
 * 用一个页签切换而不是两个路由，理由很实际：
 * 用户常常是"想登录但没账号"，或者"注册时发现已经有了"。
 * 放在同一个页面切换，比跳来跳去少一次页面加载、少一次心智切换。
 *
 * ── 关于校验的分工（本页最重要的一课）──
 *
 * 这里的前端校验**只是体验优化**，不是安全措施。
 * 任何人都能打开开发者工具删掉这些规则，或者直接用 curl 调接口。
 * 真正的校验必须由后端再做一遍 —— 本项目的 `RegisterDto` / `LoginDto`
 * 用的就是这里同一批共享常量。
 *
 * 一个很常见的误解是"前端校验过了后端就不用校验"，
 * 那等于把规则写在用户可以随意修改的地方。
 */
import { AlertCircle, AtSign, KeyRound, Loader2, LogIn, UserPlus } from 'lucide-vue-next'
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
        class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25"
      >
        <LogIn :size="22" />
      </span>
      <h1 class="mt-5 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {{ mode === 'login' ? '欢迎回来' : '创建你的账号' }}
      </h1>
      <p class="mt-1.5 text-[13.5px] text-slate-500 dark:text-slate-400">
        {{ mode === 'login' ? '继续记录你的学习与思考' : '开始分享你的学习笔记与技术心得' }}
      </p>
    </div>

    <!-- 页签 -->
    <div class="mt-8 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
      <button
        type="button"
        class="relative cursor-pointer rounded-lg py-2.5 text-[13.5px] font-medium transition-all duration-300"
        :class="
          mode === 'login'
            ? 'bg-white text-brand-600 shadow-sm dark:bg-[#16161d] dark:text-brand-400'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
        "
        @click="switchMode('login')"
      >
        登录
      </button>
      <button
        type="button"
        class="relative cursor-pointer rounded-lg py-2.5 text-[13.5px] font-medium transition-all duration-300"
        :class="
          mode === 'register'
            ? 'bg-white text-brand-600 shadow-sm dark:bg-[#16161d] dark:text-brand-400'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
        "
        @click="switchMode('register')"
      >
        注册
      </button>
    </div>

    <!-- 表单 -->
    <form class="mt-6 space-y-4" @submit.prevent="submit">
      <!-- 邮箱 -->
      <div>
        <label
          for="email"
          class="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-200"
        >
          邮箱
        </label>
        <div class="relative">
          <span
            class="pointer-events-none absolute inset-y-0 left-0 grid w-11 place-items-center text-slate-400"
          >
            <AtSign :size="15" />
          </span>
          <input
            id="email"
            v-model.trim="form.email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3 pl-11 text-[14px] text-slate-900 shadow-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#16161d] dark:text-white dark:hover:border-white/20"
          />
        </div>
      </div>

      <!-- 用户名（仅注册） -->
      <div v-if="mode === 'register'">
        <label
          for="username"
          class="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-200"
        >
          用户名
        </label>
        <input
          id="username"
          v-model.trim="form.username"
          type="text"
          autocomplete="username"
          :placeholder="`${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字，会显示在文章作者处`"
          class="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 shadow-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#16161d] dark:text-white dark:hover:border-white/20"
        />
      </div>

      <!-- 密码 -->
      <div>
        <label
          for="password"
          class="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-200"
        >
          密码
        </label>
        <div class="relative">
          <span
            class="pointer-events-none absolute inset-y-0 left-0 grid w-11 place-items-center text-slate-400"
          >
            <KeyRound :size="15" />
          </span>
          <input
            id="password"
            v-model="form.password"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            :placeholder="mode === 'register' ? `至少 ${PASSWORD_MIN_LENGTH} 位` : '输入密码'"
            class="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3 pl-11 text-[14px] text-slate-900 shadow-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#16161d] dark:text-white dark:hover:border-white/20"
          />
        </div>
      </div>

      <!-- 确认密码（仅注册） -->
      <div v-if="mode === 'register'">
        <label
          for="confirm"
          class="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-200"
        >
          确认密码
        </label>
        <input
          id="confirm"
          v-model="form.confirm"
          type="password"
          autocomplete="new-password"
          placeholder="再输入一次"
          class="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 shadow-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none dark:border-white/10 dark:bg-[#16161d] dark:text-white dark:hover:border-white/20"
        />
      </div>

      <!-- 本地校验错误 -->
      <ul v-if="visibleErrors.length" class="space-y-1.5">
        <li
          v-for="error in visibleErrors"
          :key="error"
          class="flex items-center gap-2 text-[12.5px] text-rose-600 dark:text-rose-400"
        >
          <AlertCircle :size="13" />
          {{ error }}
        </li>
      </ul>

      <!-- 服务端返回的错误 -->
      <div
        v-if="serverError"
        class="rounded-xl border border-rose-200 bg-rose-50 p-3.5 dark:border-rose-500/30 dark:bg-rose-500/5"
      >
        <p class="flex items-start gap-2 text-[12.5px] leading-6 text-rose-700 dark:text-rose-300">
          <AlertCircle :size="14" class="mt-1 shrink-0" />
          <span>{{ serverError }}</span>
        </p>
        <ul v-if="serverDetails.length" class="mt-1.5 space-y-1 pl-6">
          <li
            v-for="detail in serverDetails"
            :key="detail"
            class="text-[12px] leading-5 text-rose-600/80 dark:text-rose-400/80"
          >
            · {{ detail }}
          </li>
        </ul>
      </div>

      <!-- 主按钮 -->
      <button
        type="submit"
        class="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-500 text-[14px] font-medium text-white shadow-lg shadow-brand-500/20 transition-all duration-200 hover:bg-brand-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="submitting"
      >
        <Loader2 v-if="submitting" :size="16" class="animate-spin" />
        <UserPlus v-else-if="mode === 'register'" :size="16" />
        <LogIn v-else :size="16" />
        {{ submitting ? '处理中…' : mode === 'login' ? '登录' : '创建账号' }}
      </button>

      <!-- 辅助文案 -->
      <p class="pt-1 text-center text-[12.5px] text-slate-500 dark:text-slate-400">
        <template v-if="mode === 'login'">
          还没有账号？
          <button
            type="button"
            class="cursor-pointer font-medium text-brand-600 hover:underline dark:text-brand-400"
            @click="switchMode('register')"
          >
            立即注册
          </button>
        </template>
        <template v-else>
          已经有账号了？
          <button
            type="button"
            class="cursor-pointer font-medium text-brand-600 hover:underline dark:text-brand-400"
            @click="switchMode('login')"
          >
            去登录
          </button>
        </template>
      </p>
    </form>

    <!-- 安全说明：这里描述的都是**本阶段已经真正实现**的行为 -->
    <div
      class="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
    >
      <p class="text-[12px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
        这个登录是怎么保护你的
      </p>
      <ul class="mt-2 space-y-1.5 text-[12px] leading-6 text-slate-500 dark:text-slate-400">
        <li>· 密码用 bcrypt 哈希后入库，数据库里看不到明文</li>
        <li>· Access Token 只存在内存里，刷新页面即失效（15 分钟）</li>
        <li>· Refresh Token 放进 httpOnly Cookie，JavaScript 读不到（7 天）</li>
        <li>· 两个 Token 用不同密钥签发，Access 无法当 Refresh 用</li>
        <li>· 前端校验只为体验，真正的校验在后端再做了一遍</li>
      </ul>
    </div>
  </div>
</template>
