// 生产环境变量 fail-fast 校验（容器运行时执行，不影响 next build）。
// 仅当 NODE_ENV==='production' 时强制 BETTER_AUTH_SECRET(≥32) 与 BETTER_AUTH_URL(https)。
const secret = process.env.BETTER_AUTH_SECRET ?? ''
const url = process.env.BETTER_AUTH_URL ?? ''

if (process.env.NODE_ENV === 'production') {
  if (!secret || secret.length < 32) {
    console.error(
      '[check-env] 生产环境 BETTER_AUTH_SECRET 必须注入且长度 ≥ 32 字符；当前缺失或过短。',
    )
    process.exit(1)
  }
  if (!/^https:\/\//.test(url)) {
    console.error(
      '[check-env] 生产环境 BETTER_AUTH_URL 必须为 https:// 开头的域名，当前：',
      url || '(空)',
    )
    process.exit(1)
  }
}

console.log('[check-env] 环境变量校验通过')
