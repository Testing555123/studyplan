<#
  rebuild-api.ps1 —— 带退避重试的 api 镜像重建脚本
  ------------------------------------------------------------
  用途：本机到 Docker Hub 网络不稳（TLS 超时 / 拉取失败）时，
        反复手动重试很折磨。此脚本循环执行
            docker compose up --build -d api
        直到成功或达到最大尝试次数。

  为什么只重建 api：
        被网络挡住的那次修复（空 NVNIM_API_KEY 误报为已启用）
        改的是 apps/api 的源码，需要重建 api 镜像才能生效。
        前端 web 无需动。

  用法：
        pwsh scripts/rebuild-api.ps1            # 默认 60 次，指数退避
        pwsh scripts/rebuild-api.ps1 -MaxAttempts 120
#>

[CmdletBinding()]
param(
    [int]$MaxAttempts = 60
)

# 切到仓库根（scripts 的父目录），保证 docker-compose.yml 上下文正确
$repoRoot = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $repoRoot
Write-Host "仓库根目录：$repoRoot"

$attempt = 0
$backoff = 15   # 首次失败后等待秒数，之后指数增长，封顶 60s

do {
    $attempt++
    Write-Host "[$attempt/$MaxAttempts] $(Get-Date -Format 'HH:mm:ss')  docker compose up --build -d api ..."
    docker compose up --build -d api
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ api 镜像重建并启动成功。" -ForegroundColor Green
        Write-Host "   验证：curl http://localhost:3000/api/health"
        exit 0
    }

    if ($attempt -ge $MaxAttempts) {
        Write-Error "❌ 已超过最大重试次数（$MaxAttempts）。请检查本机到 Docker Hub 的网络，或在 Docker Desktop 配置 registry mirror 后手动运行：docker compose up --build -d api"
        exit 1
    }

    Write-Warning "第 $attempt 次失败（多为 Docker Hub 拉取超时），${backoff}s 后重试..."
    Start-Sleep -Seconds $backoff
    $backoff = [math]::Min($backoff * 2, 60)   # 指数退避，封顶 60s
} while ($true)

