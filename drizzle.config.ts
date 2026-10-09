import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    // generate 阶段不连接；migrate 阶段需要真实 DATABASE_URL。
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
})
