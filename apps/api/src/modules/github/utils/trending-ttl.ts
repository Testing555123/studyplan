import type { ConfigService } from '@nestjs/config'

/** 缓存软过期时间的默认值（分钟）。6 小时对"新建项目榜"足够新鲜 */
export const DEFAULT_TTL_MINUTES = 360

/**
 * 读出榜单缓存的软过期时长（毫秒）。
 *
 * 为什么这么一段三行的逻辑要单独放一个文件：
 *   它原本在 `GithubService` 与 `RepoDetailService` 的构造函数里各写了一份，
 *   连 `DEFAULT_TTL_MINUTES` 这个常量都各定义了一次。
 *   两份"看起来一样"的默认值，迟早会在某次修改里只改掉一处 ——
 *   届时表现为"榜单说数据还新鲜、详情页却说可能不是最新"，
 *   而且这种不一致不会报错，只会让人怀疑自己看错了。
 *
 * 这类"两个地方对同一个配置做同样解读"的逻辑，
 * 是最该被收成一处的东西：它的正确性不体现在代码里，而体现在两处是否一致。
 */
export function resolveTrendingTtlMs(config: ConfigService): number {
  const minutes = Number(config.get<string>('GITHUB_TRENDING_CACHE_TTL_MINUTES'))
  // Number('abc') 会得到 NaN，直接取默认；<=0 同样没意义
  return Number.isFinite(minutes) && minutes > 0
    ? minutes * 60 * 1000
    : DEFAULT_TTL_MINUTES * 60 * 1000
}
