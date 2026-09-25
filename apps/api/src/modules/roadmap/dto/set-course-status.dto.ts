import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'
import { COURSE_STATUSES } from '@studyplan/shared'
import type { CourseStatus } from '@studyplan/shared'

/**
 * 设置节点状态的请求体。
 *
 * 只有 status 一个字段是刻意的：这个接口表达的是"我要让这条线变成
 * 什么状态"（幂等的目标状态），而不是"翻转一下"（非幂等的动作）。
 * 重复提交同一个状态，结果不变 —— 网络重试因此是安全的。
 *
 * 枚举白名单直接引用 shared 的 `COURSE_STATUSES`：
 * 前后端校验同一份枚举，不存在"前端允许 skipped、后端还不认识它"的窗口期。
 */
export class SetCourseStatusDto {
  @ApiProperty({
    description: '目标学习状态',
    enum: COURSE_STATUSES,
    example: 'completed',
  })
  @IsIn(COURSE_STATUSES as readonly string[], { message: 'status 必须是合法的学习状态' })
  status!: CourseStatus
}
