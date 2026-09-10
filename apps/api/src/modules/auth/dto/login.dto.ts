import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, Length } from 'class-validator'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@studyplan/shared'

/**
 * 登录入参。
 *
 * 一个刻意的取舍：**登录时不校验密码的复杂度，只校验长度范围**。
 *
 * 为什么不复用注册时那套规则（至少 8 位、必须含大小写…）？
 * 因为登录的职责是"验证"，不是"规训"。如果有一天规则收紧了
 * （比如从"至少 8 位"改成"至少 10 位"），老用户的旧密码本来是合法的，
 * 却会因为登录页的校验而**连登录都做不到** —— 用户被彻底锁在门外。
 *
 * 所以规则是：
 *   - 注册：严格校验，把不合规的密码挡在门外；
 *   - 登录：只做最基本的形状检查（是不是字符串、长度是否离谱），
 *           真正的判断交给"哈希比对"。
 *
 * 这是一个很典型的"边界条件会改变设计"的例子。
 */
export class LoginDto {
  @ApiProperty({ description: '注册时使用的邮箱', example: 'you@example.com' })
  @IsEmail({}, { message: 'email 必须是合法的邮箱地址' })
  email!: string

  @ApiProperty({ description: '密码', minLength: PASSWORD_MIN_LENGTH })
  @IsString({ message: 'password 必须是字符串' })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `password 长度必须在 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 之间`,
  })
  password!: string
}
