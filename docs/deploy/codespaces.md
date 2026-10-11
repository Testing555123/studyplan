# 用 GitHub Codespaces 部署（space 形态单容器）

在 Codespaces 里把 StudyPlan 以 `RUNTIME_FLAVOR=space` 单容器（内置 PostgreSQL 16 + pgvector + Next.js，supervisord 托管，与 HF Spaces 部署方式一致）构建并运行起来，通过端口转发在线访问。适合演示与预览，**不是生产托管**：Codespace 停止/休眠后服务暂停，重建后容器与转发地址都会更新（命名卷中的数据库与模型缓存会保留，除非删除 Codespace）。

## 快速开始

1. 仓库页面 → **Code → Codespaces → Create codespace on main**（建议选 4-core 机器，构建更快）。
2. 等待 devcontainer 创建完成。`postCreateCommand` 会自动：
   - `pnpm install --frozen-lockfile`（本地开发用）；
   - 执行 `scripts/codespaces-space-run.sh`：按需构建 space 镜像 → 拉起容器 → 轮询 `/api/health`。
3. 首次构建约 5–10 分钟（Docker 层缓存后重建很快）。完成后浏览器自动打开 `https://<codespace名>-7860.app.github.dev`，也可在 **Ports** 面板访问 7860 端口（已设为 public）。

## 环境变量（可选，在 Codespaces Secrets 中配置）

| 变量 | 说明 | 默认行为 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | better-auth 签名密钥（≥32 字符） | 缺省自动生成并持久化到 `.codespaces-secret`（已 gitignore），重启不失效 |
| `MODELS_PRELOAD` | `1` 时把本地模型权重（约 1.2GB）烘焙进镜像 | `0`：快速构建，运行期联网拉权重（首次用问答/嵌入功能较慢） |
| `HF_ENDPOINT` | 权重下载镜像源（`MODELS_PRELOAD=1` 时） | `https://hf-mirror.com`；Codespaces 在境外，可设 `https://huggingface.co` 直连 |
| `CODESPACE_DOMAIN` | 转发域名后缀 | `app.github.dev`（GitHub 默认） |

配置 Secret 后需**重建 Codespace**（Command Palette → `Codespaces: Rebuild Container`）才会生效到构建期参数（如 `NEXT_PUBLIC_SITE_URL`）；`BETTER_AUTH_SECRET` 这类纯运行期变量重启容器即可生效。

## 日常操作

```bash
# 查看容器日志（postgres / next / backup 三进程由 supervisord 托管）
docker logs -f studyplan-space

# 代码更新后重建镜像并重启容器（脚本幂等，会复用已有镜像时提示跳过）
docker rm -f studyplan-space
docker rmi studyplan:space
sh scripts/codespaces-space-run.sh

# 停止 / 启动（Codespace 休眠恢复后 postStartCommand 会自动拉起）
docker stop studyplan-space
sh scripts/codespaces-space-run.sh
```

## 数据持久化

- `studyplan-cs-pgdata`：PostgreSQL 数据（挂载到容器 `/app/data/pg`）。
- `studyplan-cs-models`：模型权重缓存（挂载到 `/app/.model-cache`）。

两个命名卷在容器删除/重建后保留；**删除 Codespace 才会一并删除**。演示场景已用超大 `BACKUP_INTERVAL_MIN=525600` 禁用 HF 备份循环；如需定期备份，参考 `docs/deploy/huggingface-spaces.md` 的备份闭环配置。

## 与 HF Spaces 部署的关系

复用同一份 `Dockerfile`（`RUNTIME_FLAVOR=space`）与 `docker/space/` 编排脚本，仅入口不同：

- HF Spaces：平台构建并托管镜像，固定探测 7860 端口；
- Codespaces：devcontainer 内 `docker build` + `docker run`，经端口转发访问，`NEXT_PUBLIC_SITE_URL` / `BETTER_AUTH_URL` 由 `$CODESPACE_NAME` 动态推导（见 `scripts/codespaces-space-run.sh`）。
