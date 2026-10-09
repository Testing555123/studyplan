// Fumadocs 16 的 .source 产物入口是 server / browser / dynamic，不再是 index。
import { docs } from '@/.source/server'
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server'
import { loader } from 'fumadocs-core/source'

// Fumadocs 的 source loader：目录树、上一篇/下一篇都从这里派生。
//
// ⚠️ .source/server.ts 用的是单数的 create.doc()，导出的是 DocCollectionEntry[]，
// 没有 toFumadocsSource 方法；必须用 fumadocs-mdx/runtime/server 顶层导出的
// toFumadocsSource(pages, metas) 转换后才能交给 loader。
// 第二个参数是 meta 集合，本项目没有 meta.json，传空数组。
export const source = loader({
  baseUrl: '/ebook',
  source: toFumadocsSource(docs, []),
})
