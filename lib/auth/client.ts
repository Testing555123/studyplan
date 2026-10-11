'use client'

import { createAuthClient } from 'better-auth/react'

/**
 * 客户端 auth 实例（T9）。用于站点导航的登录弹窗与登出。
 * 不指定 baseURL 时，better-auth/react 使用同源（window.location.origin）。
 */
export const authClient = createAuthClient()
