import { defineStore } from 'pinia'
import {
  POST_PAGE_SIZE,
  POST_TAGS,
  type Comment,
  type CommentListResponse,
  type LikeResult,
  type Post,
  type PostListResponse,
} from '@studyplan/shared'
import { ApiRequestError } from '~/composables/useApi'

/**
 * 帖子数据仓库。
 *
 * 阶段 2 时这里读的是 mock 数据；阶段 4 已经把数据源换成了真实接口。
 *
 * 值得回顾的是：**这次替换只改动了这个文件**。
 * 页面、组件、store 对外暴露的状态与动作一个都没变 ——
 * 这正是阶段 2 把数据源收口在少数几个函数里的回报。
 */
export const usePostStore = defineStore('post', () => {
  /**
   * ⚠️ 必须在 store 的 setup 阶段创建 api 客户端。
   *
   * 因为它内部要用 `useRuntimeConfig()`，而这个 API 依赖 Nuxt 上下文。
   * 如果在某个异步 action 里才调用，可能已经脱离了上下文，
   * 报出 "nuxt instance unavailable" 这种很难定位的错。
   * 在这里创建一次，后面的函数通过闭包共享它。
   */
  const api = useApi()

  // ---------- 列表状态 ----------
  const items = ref<Post[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(POST_PAGE_SIZE)
  /** 当前选中的标签；null 表示"全部" */
  const activeTag = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ---------- 详情状态 ----------
  const current = ref<Post | null>(null)
  const comments = ref<Comment[]>([])
  const detailLoading = ref(false)
  const commentsLoading = ref(false)
  const commentSubmitting = ref(false)

  /** 是否还有下一页 —— 由"已加载数量 < 总数"推导，不需要单独维护一个 ref */
  const hasMore = computed(() => items.value.length < total.value)

  /**
   * 可供筛选的标签。
   *
   * 这里直接用**全站白名单**（来自 shared），而不是"当前有帖子的标签"。
   *
   * 取舍说明：用白名单会让人可能筛出空结果（某个标签还没人写过），
   * 但它的好处是**筛选条稳定**——不会因为你筛选了一下，
   * 标签条里的选项就突然少了几个。稳定比"永不出空"更重要。
   *
   * 如果将来想要"只用有帖子的标签"，正确做法是加一个
   * `GET /posts/tags` 接口去做聚合，而不是在前端拼凑。
   */
  const availableTags = computed(() => [...POST_TAGS])

  // ────────────────────────────────────────────────────────────────
  // 数据获取
  // ────────────────────────────────────────────────────────────────

  /**
   * 拉取列表。
   * @param reset 为 true 时从第一页重新拉（切换标签、刷新时用）
   */
  async function fetchList(reset = false): Promise<void> {
    if (loading.value) return

    loading.value = true
    error.value = null

    if (reset) {
      page.value = 1
      items.value = []
    }

    try {
      // 只在有标签时才带上 tag 参数。
      // 后端开了 forbidNonWhitelisted，多余或无效的查询参数会直接 400，
      // 所以这里不做"传 undefined 让它自己忽略"的赌注。
      const query: { page: number; pageSize: number; tag?: string } = {
        page: page.value,
        pageSize: pageSize.value,
      }
      if (activeTag.value) query.tag = activeTag.value

      const result = await api.get<PostListResponse>('/posts', query)

      // 追加而不是覆盖 —— 这是"加载更多"能工作的关键
      items.value = reset ? result.items : [...items.value, ...result.items]
      total.value = result.total
    } catch (caught) {
      const apiError =
        caught instanceof ApiRequestError
          ? caught
          : new ApiRequestError({ statusCode: 0, message: '加载失败，请稍后重试' })
      error.value = apiError.message
    } finally {
      loading.value = false
    }
  }

  /** 加载下一页 */
  async function loadMore(): Promise<void> {
    if (!hasMore.value || loading.value) return
    page.value += 1
    await fetchList(false)
    // 如果这一页返回空（比如刚好被删了），把页码退回去，避免死循环
    if (items.value.length < (page.value - 1) * pageSize.value) {
      page.value -= 1
    }
  }

  /**
   * 跳转到指定页（分页模式）。
   *
   * 与 loadMore 的"追加"不同，这里直接把列表重置为该页内容，
   * 配合页面的 UPagination 使用。切换标签时仍走 selectTag（内部会重置到第一页）。
   */
  async function goToPage(target: number): Promise<void> {
    if (loading.value || target === page.value) return
    page.value = target
    loading.value = true
    error.value = null
    try {
      const query: { page: number; pageSize: number; tag?: string } = {
        page: page.value,
        pageSize: pageSize.value,
      }
      if (activeTag.value) query.tag = activeTag.value
      const result = await api.get<PostListResponse>('/posts', query)
      items.value = result.items
      total.value = result.total
    } catch (caught) {
      const apiError =
        caught instanceof ApiRequestError
          ? caught
          : new ApiRequestError({ statusCode: 0, message: '加载失败，请稍后重试' })
      error.value = apiError.message
    } finally {
      loading.value = false
    }
  }

  /** 切换标签筛选 */
  async function selectTag(tag: string | null): Promise<void> {
    if (activeTag.value === tag) return
    activeTag.value = tag
    await fetchList(true)
  }

  /** 拉取单帖详情 */
  async function fetchOne(id: string): Promise<void> {
    detailLoading.value = true
    error.value = null
    try {
      current.value = await api.get<Post>(`/posts/${id}`)
    } catch (caught) {
      current.value = null

      /**
       * 这里要分清两种"拿不到帖子"，它们的用户提示完全不同：
       *
       *   404        → "这条帖子不存在"（正常业务结果，页面渲染 404 界面）
       *   其它错误   → "服务出问题了"（故障，必须提示并给出重试入口）
       *
       * 如果把网络故障也当成 404，用户会以为内容被删了，
       * 于是去别处找，而实际上只是后端没启动 —— 这是很容易犯、
       * 又很难被发现的错误（因为界面"看起来很正常"）。
       */
      if (caught instanceof ApiRequestError && caught.statusCode === 404) {
        error.value = null
      } else {
        error.value =
          caught instanceof ApiRequestError ? caught.message : '加载失败，请稍后重试'
      }
    } finally {
      detailLoading.value = false
    }
  }

  /** 发表评论失败时的错误提示（例如内容超长、网络中断） */
  const commentError = ref<string | null>(null)

  /** 拉取某帖的评论 */
  async function fetchComments(postId: string): Promise<void> {
    commentsLoading.value = true
    try {
      const result = await api.get<CommentListResponse>(`/posts/${postId}/comments`)
      comments.value = result.items
    } catch (caught) {
      /**
       * 评论加载失败**不应该让整个详情页报错**。
       *
       * 帖子正文已经拿到了，用户能读文章 —— 只是看不到评论。
       * 为了一个次要模块把整页变成错误界面，是明显的过度反应。
       *
       * 所以这里把错误吞掉（只记日志），让评论区自己显示空态。
       * 这叫"降级"：让主要功能不受次要功能故障的影响。
       */
      comments.value = []
      console.error('[postStore] 加载评论失败：', caught)
    } finally {
      commentsLoading.value = false
    }
  }

  /** 发表评论 */
  async function addComment(postId: string, content: string): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) return

    commentSubmitting.value = true
    commentError.value = null

    try {
      const created = await api.post<Comment>(`/posts/${postId}/comments`, { content: trimmed })
      // 用服务端返回的对象追加，而不是本地造一个 ——
      // 这样 id、createdAt 都是真实的，避免"刷新后 id 变了"这类怪事
      comments.value = [...comments.value, created]
      if (current.value) current.value.commentCount += 1
    } catch (caught) {
      commentError.value =
        caught instanceof ApiRequestError ? caught.message : '发表失败，请稍后重试'
      throw caught
    } finally {
      commentSubmitting.value = false
    }
  }

  /** 删除自己的评论 */
  async function removeComment(commentId: string): Promise<void> {
    await api.remove(`/comments/${commentId}`)

    comments.value = comments.value.filter((comment) => comment.id !== commentId)
    if (current.value) {
      current.value.commentCount = Math.max(0, current.value.commentCount - 1)
    }
  }

  // ---------------- 点赞 ----------------

  /** 当前用户赞过的帖子 id 集合 */
  const likedIds = ref<Set<string>>(new Set())

  function isLiked(postId: string): boolean {
    return likedIds.value.has(postId)
  }

  /** 读取某帖当前显示的点赞数（列表与详情两处都要同步） */
  function readLikeCount(postId: string): number {
    if (current.value?.id === postId) return current.value.likeCount
    return items.value.find((post) => post.id === postId)?.likeCount ?? 0
  }

  /** 把某帖的点赞数设为精确值（列表与详情两处一起改） */
  function writeLikeCount(postId: string, count: number): void {
    if (current.value?.id === postId) current.value.likeCount = count
    const inList = items.value.find((post) => post.id === postId)
    if (inList) inList.likeCount = count
  }

  function writeLiked(postId: string, liked: boolean): void {
    const next = new Set(likedIds.value)
    if (liked) next.add(postId)
    else next.delete(postId)
    likedIds.value = next
  }

  /**
   * 点赞 / 取消点赞。
   *
   * 三步骤，每一步都有明确目的：
   *
   *   ① **乐观更新**：先把界面改成目标状态。
   *      点赞是高频轻量操作，等一个网络往返才变化会让用户觉得卡。
   *
   *   ② **调用幂等接口**：根据"目标状态"选择 PUT 还是 DELETE，
   *      而不是调用一个"切换"接口。
   *      这一点很重要 —— 如果接口是 toggle 语义，
   *      任何重试（网络超时重发、我们的 401 续期重放）都会
   *      把刚点的赞又取消掉。PUT/DELETE 重复调用结果不变。
   *
   *   ③ **用服务端真值校正**：接口返回的是数据库里的真实计数。
   *      乐观更新只是"猜测"，必须被真值覆盖 ——
   *      否则用户看到的就是一个乐观的假象（比如别人同时点赞，
   *      你的界面永远比真实值少 1）。
   *
   * ④ 失败则**回滚**到请求前的状态，绝不让界面显示假数字。
   */
  async function toggleLike(postId: string): Promise<void> {
    const wasLiked = likedIds.value.has(postId)
    const targetLiked = !wasLiked
    const countBefore = readLikeCount(postId)

    writeLiked(postId, targetLiked)
    writeLikeCount(postId, Math.max(0, countBefore + (targetLiked ? 1 : -1)))

    try {
      const result = targetLiked
        ? await api.put<LikeResult>(`/posts/${postId}/like`)
        : await api.remove<LikeResult>(`/posts/${postId}/like`)

      writeLiked(postId, result.liked)
      writeLikeCount(postId, result.likeCount)
    } catch (caught) {
      writeLiked(postId, wasLiked)
      writeLikeCount(postId, countBefore)
      console.error('[postStore] 点赞失败，已回滚：', caught)
    }
  }

  return {
    // 列表
    items,
    total,
    page,
    pageSize,
    activeTag,
    loading,
    error,
    hasMore,
    availableTags,
    fetchList,
    loadMore,
    goToPage,
    selectTag,
    // 详情
    current,
    comments,
    detailLoading,
    commentsLoading,
    commentSubmitting,
    commentError,
    fetchOne,
    fetchComments,
    addComment,
    removeComment,
    // 点赞
    isLiked,
    toggleLike,
  }
})
