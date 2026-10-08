/**
 * 后端单元测试配置。
 *
 * 关键点：`moduleNameMapper` 把 `@studyplan/shared` 直接指向**源码**，
 * 这样跑单测时不必先执行 `pnpm build:shared`，改契约后立刻就能测。
 *
 * 第二条映射是 ESM 化的代价：`packages/shared` 转 ESM 后，源码里的相对导入
 * 一律写成 `./types/user.js`（NodeNext 的要求），而 jest 跑的是 ts-jest 编译出的
 * CJS，它的解析器不会把 `.js` 退回到 `.ts`，于是整条 require 链在
 * `Cannot find module './types/user.js'` 上断掉。这里把 `.js` 后缀剥掉即可。
 */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  clearMocks: true,
  /**
   * `@octokit/rest` v22 整条依赖链（`@octokit/*`、`universal-user-agent`、
   * `bottleneck`、`before-after-hook`、`content-type`…）只有 ESM 产物，而 jest
   * 这一侧跑的是 ts-jest 编译出的 CJS，默认规则又会跳过整个 node_modules ——
   * 于是凡是间接 import 到 Octokit 的 suite 一起报 `Must use import to load ES Module`。
   *
   * 这里选择「不忽略任何依赖，全部交给 ts-jest 转译」。代价是实测全套从约 55 秒
   * 涨到约 180 秒；换来的是**不用维护例外名单**：按包名放行也能跑通（约 60 秒），
   * 但 Octokit 每升一次版就可能冒出新的 ESM-only 依赖，漏一个就是一句
   * "某个 suite 突然载不进来"，这种债不值得背。
   *
   * 运行侧本来不需要任何特殊处理：`apps/api` 就是 `"type": "module"`，
   * ESM 依赖原生可用，这一项只服务于测试。
   */
  transformIgnorePatterns: [],
  moduleNameMapper: {
    '^@studyplan/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}
