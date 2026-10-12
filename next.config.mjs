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
  // 第三方站点 iframe 嵌入（roadmap.sh 等）：服务只听容器内回环地址，
  // 由 rewrites 把「与上游同构的路径」转发到嵌入代理服务（services/embed-proxy）。
  // 路径必须与上游同构——roadmap.sh 的客户端 Router 按 location.pathname 匹配路由。
  // 详见 docs/embed-proxy.md。
  async rewrites() {
    const base = process.env['EMBED_PROXY_ORIGIN'] ?? 'http://127.0.0.1:3100'
    const paths = [
      '/full-stack',
      '/full-stack.data',
      '/full-stack.json',
      '/full-stack/:path*',
      '/assets/:path*',
      '/fonts/:path*',
      '/manifest/:path*',
      // 官方运行时 API 的专用命名空间（客户端脚本把 /api/* 改写为 /embed-proxy/api/*，
      // 避免 /api/v1-:path* 这类「段内前缀 + 通配」非法模式，也避免与本站 /api/* 冲突）。
      '/embed-proxy/:path*',
    ]
    return paths.map((source) => ({ source, destination: `${base}${source.replace('/embed-proxy', '')}` }))
  },
}

export default withMDX(nextConfig)
