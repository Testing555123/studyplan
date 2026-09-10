import { PartialType } from '@nestjs/swagger'
import { CreatePostDto } from './create-post.dto'

/**
 * 更新帖子的入参。
 *
 * 用 `PartialType` 推导而不是手抄一遍字段，有两个实际好处：
 *
 *   1. **不会漏**。将来给 CreatePostDto 加一个字段，
 *      更新接口会自动支持它；手抄的版本一定会忘记同步；
 *   2. **Swagger 元数据自动继承**。字段说明、示例、长度限制
 *      不需要再写第二遍。
 *
 * ────────────────────────────────────────────────────────────────
 * 阶段 5 的一次真实返工，值得记下来：
 *
 * 阶段 3 这里写的是
 *   `PartialType(OmitType(CreatePostDto, ['authorId', 'authorUsername'] as const))`
 * —— 用 OmitType 把两个临时作者字段排除掉。
 *
 * 阶段 5 把作者字段从 CreatePostDto 里删除之后，
 * 这个 OmitType 就编译不过了：
 *
 *   TS2322: Type '"authorId"' is not assignable to type 'keyof CreatePostDto'
 *
 * 这正是"删除一个字段"的真实成本：**它不只是删一行，
 * 而是所有引用它的地方都会跟着报错。**
 *
 * 好消息是：**报错是好事**。TypeScript 把"改漏了"变成一个
 * 立刻可见的编译错误，而不是等运行时才发现
 * "为什么更新接口会莫名其妙拒绝请求"。
 * 这类"改一处、编译器帮你找出所有受影响的点"的能力，
 * 是选择静态类型语言最实际的回报。
 *
 * 现在 UpdatePostDto 就是 CreatePostDto 的全可选版本，干净且语义准确：
 * 更新时能改的字段，恰好就是创建时能提供的字段。
 * ────────────────────────────────────────────────────────────────
 */
export class UpdatePostDto extends PartialType(CreatePostDto) {}
