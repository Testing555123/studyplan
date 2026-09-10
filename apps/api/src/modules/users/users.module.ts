import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { User, UserSchema } from './schemas/user.schema'
import { UsersService } from './users.service'

/**
 * 用户模块。
 *
 * 它只做一件很纯粹的事：管理用户数据的读写。
 * **注册、登录、签发 Token 都不在这里** —— 那些属于 AuthModule。
 *
 * 为什么把"用户数据"和"认证流程"拆成两个模块？
 *   因为它们的变更原因不同：
 *     - 用户模块会因为"要加个昵称、加个签名"而改；
 *     - 认证模块会因为"要加短信登录、加第三方登录"而改。
 *   把它们混在一起，改认证时会不小心碰到用户数据的逻辑。
 *
 * 这是"单一职责"在模块层面的体现，也是 NestJS 模块划分最实用的判断标准：
 * **问自己"这两个东西会因为同样的原因改变吗？"**
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersService],
  // AuthModule 需要用它来查用户、校验密码，所以必须导出
  exports: [UsersService],
})
export class UsersModule {}
