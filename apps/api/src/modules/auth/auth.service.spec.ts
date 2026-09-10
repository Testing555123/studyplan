import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AuthService } from './auth.service'
import { UsersService } from '../users/users.service'
import type { UserDocument } from '../users/schemas/user.schema'

/**
 * 认证服务的单元测试。
 *
 * 为什么这个文件特别重要？
 *   因为认证是**全项目安全性的地基**。别的模块出错是"功能不对"，
 *   认证出错是"所有人都能冒充任何人"。
 *
 * 这里有一个关键的设计优势在起作用：
 *   **AuthService 不知道 HTTP，也不知道数据库。**
 *   它只依赖 UsersService（可替身）和 JwtService（真实的，不需要网络）。
 *   所以这些测试跑得飞快，却验证了真实的签名与验签逻辑 ——
 *   不是 mock 掉一半然后自我安慰。
 */

const ACCESS_SECRET = 'a'.repeat(48)
const REFRESH_SECRET = 'b'.repeat(48)

const userId = '507f1f77bcf86cd799439011'

/** 一个假的 UserDocument：只需要 toObject()，因为 mapper 只读纯对象 */
const userDoc = {
  toObject: () => ({
    _id: userId,
    email: 'a@example.com',
    username: '沈亦舟',
    avatarColor: 'from-indigo-500 to-blue-600',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  }),
} as unknown as UserDocument

/** 用固定值伪造 ConfigService，避免每个用例都去读真实环境变量 */
function createConfigStub(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: ACCESS_SECRET,
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    ...overrides,
  }

  return {
    getOrThrow: (key: string) => {
      const value = values[key]
      if (!value) throw new Error(`缺少环境变量 ${key}`)
      return value
    },
    get: (key: string) => values[key],
  } as unknown as ConfigService
}

describe('AuthService', () => {
  let service: AuthService
  let usersService: {
    create: jest.Mock
    findByEmailWithPassword: jest.Mock
    findById: jest.Mock
    verifyPassword: jest.Mock
  }
  let jwtService: JwtService

  beforeEach(async () => {
    usersService = {
      create: jest.fn().mockResolvedValue(userDoc),
      findByEmailWithPassword: jest.fn(),
      findById: jest.fn().mockResolvedValue(userDoc),
      verifyPassword: jest.fn(),
    }

    // 用真实的 JwtService：本项目按调用显式传密钥，
    // 所以这里给的默认密钥完全不参与，随便填一个即可。
    // 好处是 —— 签名与验签是**真的在跑**，而不是被 mock 掉。
    jwtService = new JwtService({ secret: 'unused-default' })

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: createConfigStub() },
      ],
    }).compile()

    service = moduleRef.get(AuthService)
  })

  describe('register', () => {
    it('注册成功后签发一套 Token，并把 Access 有效期作为秒数返回', async () => {
      const session = await service.register({
        email: 'a@example.com',
        username: '沈亦舟',
        password: 'a-strong-password',
      })

      expect(session.result.tokens.accessToken).toBeTruthy()
      expect(session.result.tokens.expiresIn).toBe(15 * 60)
      expect(session.result.user.email).toBe('a@example.com')
    })

    it('返回给浏览器的部分**不含** Refresh Token（它只能进 httpOnly Cookie）', async () => {
      const session = await service.register({
        email: 'a@example.com',
        username: '沈亦舟',
        password: 'a-strong-password',
      })

      // Refresh Token 只应该存在于 session 上，供控制器写 Cookie
      expect(session.refreshToken).toBeTruthy()
      // 而绝不能出现在 result（= 响应体）里
      expect(JSON.stringify(session.result)).not.toContain(session.refreshToken)
      expect(session.result.tokens).not.toHaveProperty('refreshToken')
    })

    it('两个 Token 用不同密钥签发：拿 Access 密钥验 Refresh Token 必须失败', async () => {
      const session = await service.register({
        email: 'a@example.com',
        username: '沈亦舟',
        password: 'a-strong-password',
      })

      // 这是双 Token 方案的核心保证：一个泄漏的 Access Token
      // 不能被当作 Refresh Token 使用。
      await expect(
        jwtService.verifyAsync(session.refreshToken, { secret: ACCESS_SECRET }),
      ).rejects.toBeTruthy()

      // 用正确的密钥则能验通
      await expect(
        jwtService.verifyAsync(session.refreshToken, { secret: REFRESH_SECRET }),
      ).resolves.toMatchObject({ type: 'refresh' })
    })
  })

  describe('login', () => {
    it('用户不存在与密码错误返回**完全相同**的错误信息（防账号枚举）', async () => {
      usersService.findByEmailWithPassword.mockResolvedValueOnce(null)
      const notFoundMessage = await service
        .login({ email: 'nobody@example.com', password: 'whatever123' })
        .catch((error: Error) => error.message)

      usersService.findByEmailWithPassword.mockResolvedValueOnce(userDoc)
      usersService.verifyPassword.mockResolvedValueOnce(false)
      const wrongPasswordMessage = await service
        .login({ email: 'a@example.com', password: 'wrong-password' })
        .catch((error: Error) => error.message)

      expect(notFoundMessage).toBe('邮箱或密码不正确')
      // 两条信息必须一字不差 —— 一旦能区分，攻击者就能拿邮箱列表
      // 筛出哪些账号真实存在
      expect(wrongPasswordMessage).toBe(notFoundMessage)
    })

    it('密码正确时正常签发', async () => {
      usersService.findByEmailWithPassword.mockResolvedValueOnce(userDoc)
      usersService.verifyPassword.mockResolvedValueOnce(true)

      const session = await service.login({ email: 'a@example.com', password: 'a-strong-password' })

      expect(session.result.tokens.accessToken).toBeTruthy()
    })
  })

  describe('refresh', () => {
    it('没有 Refresh Token 时抛 401', async () => {
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('用 Access Token 冒充 Refresh Token 时抛 401', async () => {
      // 先拿到一个合法的 Access Token
      const accessToken = await jwtService.signAsync(
        { sub: userId, email: 'a@example.com', username: '沈亦舟' },
        { secret: ACCESS_SECRET, expiresIn: '15m' },
      )

      // 用它去刷新 —— 因为密钥不同，验签必然失败
      await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('载荷里 type 不是 refresh 时抛 401（纵深防御）', async () => {
      const forged = await jwtService.signAsync(
        { sub: userId, type: 'access' },
        { secret: REFRESH_SECRET, expiresIn: '7d' },
      )

      await expect(service.refresh(forged)).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('合法 Refresh Token 能换到一套全新的 Token，且新旧 Refresh Token 必然不同', async () => {
      const first = await service.register({
        email: 'a@example.com',
        username: '沈亦舟',
        password: 'a-strong-password',
      })

      const second = await service.refresh(first.refreshToken)

      expect(second.result.tokens.accessToken).toBeTruthy()

      /**
       * 这条断言曾经**失败过**，而且暴露了一个真实缺陷。
       *
       * 原因：JWT 的 `iat` 只有秒级精度。两个 Token 在同一个测试里
       * 同一秒内签发，载荷相同、密钥相同，签出来就是**同一个字符串**。
       * 也就是说 Refresh Token 轮换在同一秒内完全无效。
       *
       * 修复方式是给 Refresh Token 加一个随机的 `jti` 声明。
       * 保留这条断言，是为了守住"轮换必须真的发生"这个性质 ——
       * 谁哪天把 jti 去掉，测试会立刻报警。
       */
      expect(second.refreshToken).not.toBe(first.refreshToken)
    })

    it('用户已被删除时抛 401，而不是签发一个指向空用户的 Token', async () => {
      const session = await service.register({
        email: 'a@example.com',
        username: '沈亦舟',
        password: 'a-strong-password',
      })

      usersService.findById.mockResolvedValueOnce(null)

      await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      )
    })
  })

  describe('启动自检', () => {
    it('两个密钥相同时，构造函数直接抛错（而不是带着隐患运行）', () => {
      expect(
        () =>
          new AuthService(
            usersService as unknown as UsersService,
            jwtService,
            createConfigStub({ JWT_REFRESH_SECRET: ACCESS_SECRET }),
          ),
      ).toThrow(/不能相同/)
    })
  })
})
