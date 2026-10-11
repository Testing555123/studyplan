/**
 * 备份存储后端：GitHub 私有仓库 Contents API（免费、无需银行卡）。
 *
 * 为什么选 GitHub 而非 HF Dataset：Space 免费档没有持久卷，必须把 pg_dump 落到外部；
 * GitHub Contents API 语义稳定（PUT 需 sha、GET 可用 raw media type），且 fine-grained PAT
 * 只需 contents:write 一个权限，不引入任何付费依赖。
 *
 * 环境变量：
 *   BACKUP_GITHUB_REPO   = owner/repo（私有仓库，建议专用 backup 仓库）
 *   BACKUP_GITHUB_TOKEN  = fine-grained PAT（contents:read+write）
 *   BACKUP_GITHUB_BRANCH = 分支，默认 main
 *   BACKUP_DIR           = 仓库内目录，默认 backups
 *   BACKUP_STRICT        = 1 时备份/恢复失败即抛错（默认降级不阻断启动）
 */
const API = 'https://api.github.com'

function readConfig() {
  const repo = process.env.BACKUP_GITHUB_REPO ?? ''
  const token = process.env.BACKUP_GITHUB_TOKEN ?? ''
  const branch = process.env.BACKUP_GITHUB_BRANCH ?? 'main'
  const dir = (process.env.BACKUP_DIR ?? 'backups').replace(/^\/+|\/+$/g, '')
  if (!repo || !repo.includes('/')) {
    throw new Error('BACKUP_GITHUB_REPO 未配置或格式错误（应为 owner/repo）')
  }
  if (!token) {
    throw new Error('BACKUP_GITHUB_TOKEN 未配置')
  }
  return { repo, token, branch, dir, strict: process.env.BACKUP_STRICT === '1' }
}

function joinPath(dir, name) {
  return dir ? `${dir}/${name}` : name
}

async function ghFetch(url, { token, method = 'GET', body, accept } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'studyplan-backup',
  }
  if (accept) headers.Accept = accept
  if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, { method, headers, body })
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => '')
    throw new Error(`GitHub API ${method} ${url} 失败：${res.status} ${detail.slice(0, 300)}`)
  }
  return res
}

/** 列出备份目录下的文件（返回 [{name, path, sha}]，目录不存在时返回 []）。 */
export async function listBackups(cfg) {
  const url = `${API}/repos/${cfg.repo}/contents/${encodeURI(cfg.dir)}?ref=${encodeURIComponent(cfg.branch)}`
  const res = await ghFetch(url, { token: cfg.token })
  if (res.status === 404) return []
  const payload = await res.json()
  if (!Array.isArray(payload)) return []
  return payload
    .filter((item) => item.type === 'file')
    .map((item) => ({ name: item.name, path: item.path, sha: item.sha }))
}

/** 读取文件原始内容（>1MB 也安全：使用 raw media type，绕过 JSON base64 的 1MB 限制）。 */
export async function downloadBackup(cfg, name) {
  const url = `${API}/repos/${cfg.repo}/contents/${encodeURI(joinPath(cfg.dir, name))}?ref=${encodeURIComponent(cfg.branch)}`
  const res = await ghFetch(url, { token: cfg.token, accept: 'application/vnd.github.raw' })
  if (res.status === 404) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return buf
}

/** 写入/覆盖文件：文件已存在时必须带上 sha，否则 GitHub 返回 422。 */
export async function uploadBackup(cfg, name, buffer) {
  const path = joinPath(cfg.dir, name)
  const url = `${API}/repos/${cfg.repo}/contents/${encodeURI(path)}`
  const existing = await listBackups(cfg)
  const current = existing.find((f) => f.name === name)

  const body = {
    message: `chore(backup): ${name}`,
    content: buffer.toString('base64'),
    branch: cfg.branch,
  }
  if (current) body.sha = current.sha

  const res = await ghFetch(url, {
    token: cfg.token,
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`上传 ${name} 失败：${res.status} ${detail.slice(0, 300)}`)
  }
  return { path, bytes: buffer.length }
}

/** 批量删除历史备份（尽力而为，单个失败不影响其余）。 */
export async function deleteBackups(cfg, names) {
  const results = []
  for (const name of names) {
    const target = (await listBackups(cfg)).find((f) => f.name === name)
    if (!target) continue
    const url = `${API}/repos/${cfg.repo}/contents/${encodeURI(target.path)}`
    const res = await ghFetch(url, {
      token: cfg.token,
      method: 'DELETE',
      body: JSON.stringify({ message: `chore(backup): prune ${name}`, sha: target.sha, branch: cfg.branch }),
    })
    results.push({ name, ok: res.ok })
  }
  return results
}

export { readConfig }
