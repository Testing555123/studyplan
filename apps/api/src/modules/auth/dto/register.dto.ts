import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, Length, MaxLength } from 'class-validator'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@studyplan/shared'

/**
 * 注册入参。
 *
 * 密码长度上限（72）的理由见 `packages/shared/src/constants/tags.ts` 里的注释 ——
 * 它是 bcrypt 的截断长度，不是随手定的数字。
 */
export class RegisterDto {
  @ApiProperty({ description: '邮箱，用于登录，全局唯一', example: 'you@example.com' })
  @IsEmail({}, { message: 'email 必须是合法的邮箱地址' })
  @MaxLength(120, { message: 'email 太长了' })
  email!: string

  @ApiProperty({
    description: '用户名，会显示在文章作者处',
    minLength: USERNAME_MIN_LENGTH,
    maxLength: USERNAME_MAX_LENGTH,
    example: '沈亦舟',
  })
  @IsString({ message: 'username 必须是字符串' })
  @Length(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH, {
    message: `username 长度必须在 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 之间`,
  })
  username!: string

  @ApiProperty({
    description: '密码（明文传输，由后端哈希后入库）',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    example: 'a-strong-password',
  })
  @IsString({ message: 'password 必须是字符串' })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `password 长度必须在 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 之间`,
  })
  password!: string
}
