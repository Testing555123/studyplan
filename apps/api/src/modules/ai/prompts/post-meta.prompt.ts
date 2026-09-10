import { MAX_TAGS_PER_POST, POST_TAGS } from '@studyplan/shared'

/**
 * 正文送去模型前最多保留多少字符。
 *
 * ── 为什么要截断？ ──
 * 三个实际理由：
 *   1. **成本**：token 是按量计费的，一篇万字长文全文送去会明显变贵；
 *   2. **延迟**：输入越长，模型响应越慢，而我们的超时上限是固定的；
 *   3. **收益极低**：摘要与标签的判断依据几乎全在开头部分，
 *      读完全文并不会让结果更好。
 *
 * 4000 个字符对中文大约 2000-3000 token，是个"够用且便宜"的量级。
 */
const MAX_CONTENT_CHARS = 4000

/**
 * 构造"生成摘要与标签"的 Prompt。
 *
 * ── 这个模板的每一段都在解决一个具体的失败模式 ──
 *
 * ① 角色与任务要**具体**。"你是一个助手"这种话对输出质量毫无帮助；
 *    说清"你在给技术社区的文章写摘要"才能让语气与风格对齐。
 *
 * ② 输出要求里必须写"**直接返回 JSON，不要任何解释和 Markdown 包裹**"。
 *    不写这句，你会经常收到 ```json ... ``` 或者"好的，以下是结果："。
 *
 * ③ 标签白名单要**写死在 Prompt 里**，并明确"只能从下面选"。
 *    只给 Schema 不给候选值，模型会自己造出 "Vue3"、"React Hooks" 这类
 *    不在白名单里的标签，然后全部被我们过滤掉 —— 结果是"标签生成失败"。
 *
 * ④ 摘要长度要给**具体数字**。说"简短"模型会给你 80 字，
 *    说"不超过 60 字"它才会真的控制。
 */
export function buildPostMetaPrompt(input: {
  title: string
  content: string
}): string {
  const content = input.content.slice(0, MAX_CONTENT_CHARS)
  const wasTruncated = input.content.length > MAX_CONTENT_CHARS

  return [
    '你是一个技术社区的内容助手。请阅读下面的文章，完成两件事：',
    '1. 写一句话摘要，概括这篇文章最核心的信息，不超过 60 字；',
    `2. 从给定的候选标签中选出 1-${MAX_TAGS_PER_POST} 个最贴切的标签。`,
    '',
    '## 候选标签（只能从下面选择，不要自己创造新的）',
    POST_TAGS.join('、'),
    '',
    '## 输出要求',
    '- 只返回一个 JSON 对象，不要输出任何解释、前言或 Markdown 代码块包裹。',
    '- 格式必须严格为：{"summary": "摘要文本", "tags": ["标签1", "标签2"]}',
    '- summary 不要以"本文"或"这篇文章"开头，直接说结论。',
    '',
    '## 文章标题',
    input.title,
    '',
    '## 文章正文',
    content,
    ...(wasTruncated ? ['', '（注：正文过长，以上为开头部分）'] : []),
  ].join('\n')
}
