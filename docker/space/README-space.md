# HF Space 仓库模板（sdk: docker）

> 本文件是**部署用 Space 仓库**的 README 模板。把下面 front matter + Dockerfile 放进 Space 仓库根目录即可；
> 应用镜像由 GitHub Actions 推送到 GHCR，Space 侧**不做源码构建**（避免构建超时与源码上传）。

`README.md`：

```markdown
---
title: StudyPlan
emoji: 📚
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
short_description: 学习计划与知识库（Next.js + 本地 ONNX 嵌入/重排 + pgvector）
---

## 说明

- 镜像：`ghcr.io/<owner>/studyplan-space:latest`（GitHub Actions 构建，公开包）
- 形态：单容器内同机运行 Postgres 16 + pgvector 与 Next.js（supervisord 托管），监听 7860
- 数据：免费档无持久卷，靠定时 `pg_dump` 上传 GitHub 私有仓库 + 冷启动 `pg_restore` 恢复
- 休眠：48 小时无访问自动休眠，首次请求唤醒（冷启动含 initdb + 恢复，约数十秒）
```

`Dockerfile`：

```dockerfile
FROM ghcr.io/<owner>/studyplan-space:latest
```

## 需要配置的 Secrets（Space → Settings → Repository secrets）

| Secret | 必填 | 说明 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | ✅ | ≥32 位随机串，生产 fail-fast 要求 |
| `BETTER_AUTH_URL` | ✅ | `https://<user>-<space>.hf.space`，必须 https |
| `BACKUP_GITHUB_REPO` | ✅ | 备份用的私有仓库 `owner/repo` |
| `BACKUP_GITHUB_TOKEN` | ✅ | fine-grained PAT（目标仓库 contents: 读写） |
| `BACKUP_INTERVAL_MIN` | ➖ | 备份间隔（分钟），默认 30 |
| `BACKUP_KEEP` | ➖ | 保留历史份数，默认 24 |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | ➖ | 未配则 AI 能力降级 |
| `TAVILY_API_KEY` | ➖ | 未配则不注册搜索 tool |
