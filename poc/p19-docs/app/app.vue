<template>
  <div>
    <header style="padding: 12px 16px; border-bottom: 1px solid #ddd">
      <strong>P19 沙盒</strong>
      <NuxtLink to="/" style="margin-left: 12px">目录</NuxtLink>
    </header>
    <main style="padding: 16px">
      <!-- ⚠️ 必须是 NuxtPage，不是 slot —— 用 slot 时路由页面根本不会渲染，
           表现为「外壳在、内容空」，很容易误判成「内容没读到」 -->
      <NuxtPage />
    </main>
  </div>
</template>
