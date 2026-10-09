// Fumadocs MDX 是 ESM-only，官方明确要求配置文件用 .mjs 后缀。
// 同时本项目需要 output: 'standalone' 产出单容器部署的最小产物。
import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // 工作区子包 @shared 以 TS 源码形式提供，需显式转译。
  transpilePackages: ['@app/shared'],
}

export default withMDX(nextConfig)
