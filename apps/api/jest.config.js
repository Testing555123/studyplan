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
    /**
     * shared 源码用的是 NodeNext 风格的相对导入（`./types/user.js`），
     * 而源码目录里只有 `.ts` 文件 —— jest 的默认解析器不会把 `.js`
     * 映射回 `.ts`，导致凡是运行时真实加载了 shared 的套件全部爆错
     * （"Cannot find module './types/user.js'"）。这条把相对路径的
     * `.js` 后缀剥掉，交给 moduleFileExtensions 去命中 `.ts`。
     */
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}
