/**
 * 后端单元测试配置。
 *
 * 关键点：`moduleNameMapper` 把 `@studyplan/shared` 直接指向**源码**，
 * 这样跑单测时不必先执行 `pnpm build:shared`，改契约后立刻就能测。
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
  moduleNameMapper: {
    '^@studyplan/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
}
