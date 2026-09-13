import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { compare, hash } from 'bcryptjs'
import { Model, isValidObjectId } from 'mongoose'
import { avatarGradientClass } from '@studyplan/shared'
import { isDuplicateKeyError } from '../../common/utils/mongo-errors'
import { User, UserDocument } from './schemas/user.schema'

/**
 * bcrypt 的"代价因子"（cost factor）。
 *
 * 它表示哈希要做 2^10 = 1024 轮。数值每 +1，计算耗时翻倍。
 * 10 大约是"单次几十毫秒"——对登录这种低频操作完全无感，
 * 但让暴力破解的成本高出好几个数量级。
 *
 * 为什么不设成 20？因为那样一次登录要几十秒，用户体验会崩。
 * 安全永远是"与成本平衡"的结果，不存在"越安全越好"。
 */
const BCRYPT_ROUNDS = 10

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  /**
   * 创建用户。
   *
   * 注意这里接收的是**明文密码**，但立刻把它哈希掉，
   * 之后整个系统再也见不到明文。
   * 密码哈希是**单向**的：只能验证"这个明文能不能得到这个哈希"，
   * 无法从哈希反推出密码。这正是我们想要的。
   */
  async create(input: {
    email: string
    username: string
    password: string
  }): Promise<UserDocument> {
    const passwordHash = await hash(input.password, BCRYPT_ROUNDS)

    try {
      const created = await this.userModel.create({
        email: input.email.toLowerCase(),
        username: input.username,
        passwordHash,
        // 头像颜色由用户名确定性推导，前后端用同一个共享函数
        avatarColor: avatarGradientClass(input.username),
      })

      this.logger.log(`新用户注册：${created.email}`)
      return created
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // 把数据库层的技术错误翻译成用户能懂的业务错误
        throw new ConflictException('这个邮箱已经被注册了，换一个或直接登录')
      }
      throw error
    }
  }

  /**
   * 按邮箱查用户，**并且带上密码哈希**。
   *
   * 显式 `.select('+passwordHash')` 是必须的：
   * Schema 上设了 `select: false`，不写这一句就拿不到哈希，
   * 于是登录永远失败 —— 而且报错是"密码错误"，会让人以为是密码的问题。
   *
   * 这个方法名里带 WithPassword 也是刻意的：
   * 让调用处一眼看出"我正在取一个敏感字段"。
   */
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec()
  }

  /**
   * 按邮箱查用户（不返回密码哈希）。
   *
   * 和上面的 `findByEmailWithPassword` 只差一个 `.select('+passwordHash')`，
   * 但刻意分成两个方法：登录那类场景必须拿哈希，
   * 而"查一下这个账号在不在"这类场景不该把哈希读进内存 ——
   * 方法名把意图写清楚，比让调用方记住"记得别 select 那个字段"可靠。
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec()
  }

  /** 按 id 查用户（不返回密码哈希） */
  async findById(id: string): Promise<UserDocument | null> {
    // 非法 id 直接返回 null，而不是让数据库抛 CastError
    if (!isValidObjectId(id)) return null
    return this.userModel.findById(id).exec()
  }

  /**
   * 校验密码。
   *
   * 用 bcrypt 的 `compare` 而不是"把明文再哈希一遍然后比较字符串"，
   * 因为 bcrypt 的每个哈希都带**自己独立的随机盐**，
   * 同一个密码两次哈希的结果是不同的。
   * `compare` 会从存储的哈希里解析出盐，再用同样的参数算一次来比对。
   */
  async verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash)
  }
}
