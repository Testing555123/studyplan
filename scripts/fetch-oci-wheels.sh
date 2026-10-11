#!/usr/bin/env bash
# fetch-oci-wheels.sh — 绕过代理对单次下载 ~3.9MB 的截断，断点续传拉取 oci-cli 及其全部依赖 wheel 后离线安装。
#
# 用法（Git Bash）：bash scripts/fetch-oci-wheels.sh
#
# 原理：oci-cli 在 cp312 上有预编译 wheel。代理按"单连接字节数"截断，pip 每次从头拉故卡死；
#       本脚本对每个 wheel 用 HTTP Range 续传 —— 被掐断就换新连接续下一段，直至攒齐。
# 幂等：wheels/ 与 cache/ 下已存在的文件会续传，可反复运行直到全部完成。
set -euo pipefail
cd "$(dirname "$0")/.."   # 仓库根
mkdir -p wheels cache

echo "==> 解析 oci-cli 依赖闭包并断点续传下载（可能耗时数分钟，可重复运行续传）"
py -3 - <<'PYEOF'
import json, os, re, time, urllib.request

WH = os.path.join(os.getcwd(), "wheels")
CA = os.path.join(os.getcwd(), "cache")
os.makedirs(WH, exist_ok=True)
os.makedirs(CA, exist_ok=True)

def fetch(url, path, max_attempts=400):
    for _ in range(max_attempts):
        start = os.path.getsize(path) if os.path.exists(path) else 0
        req = urllib.request.Request(url, headers={"User-Agent": "oci-fetch/1.0"})
        if start > 0:
            req.add_header("Range", f"bytes={start}-")
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                status = r.status
                data = r.read()
            if status == 200 and start > 0:
                mode = "wb"          # 服务端忽略 Range，从头重写
            elif status == 206:
                mode = "ab"          # 续传追加
            else:
                mode = "wb"
            with open(path, mode) as f:
                f.write(data)
            if status == 200:
                return True
            cr = r.headers.get("Content-Range", "")
            if "/" in cr:
                total = int(cr.split("/")[1])
                if os.path.getsize(path) >= total:
                    return True
        except Exception:
            time.sleep(1.5)
            continue
    raise SystemExit(f"download failed after retries: {url}")

def get_json(name):
    path = os.path.join(CA, f"{name}.json")
    fetch(f"https://pypi.org/pypi/{name}/json", path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def latest_ver(data):
    return data["info"]["version"]

def pick_wheel(urls):
    cands = [u for u in urls if u["filename"].endswith(".whl")]
    for u in cands:                       # 优先纯 Python
        if "py3-none-any" in u["filename"]:
            return u["url"]
    for u in cands:                       # 其次 Windows amd64 轮子
        if "win_amd64" in u["filename"]:
            return u["url"]
    for u in cands:                       # 兜底任意轮子
        return u["url"]
    return None

visited, order = set(), []
def resolve(name):
    name = name.strip()
    if name in visited:
        return
    visited.add(name)
    try:
        data = get_json(name)
    except Exception as e:
        print("  WARN 跳过", name, ":", e)
        return
    ver = latest_ver(data)
    rels = data["releases"].get(ver, [])
    url = pick_wheel(rels)
    if url:
        order.append(url)
    for dep in (data["info"].get("requires_dist") or []):
        m = re.match(r"^\s*([A-Za-z0-9_.\-]+)", dep)
        if not m:
            continue
        d = m.group(1)
        if d.lower() in visited:
            continue
        resolve(d)

resolve("oci-cli")
print(f"==> 需下载 {len(order)} 个 wheel")
for i, url in enumerate(order, 1):
    fn = url.rsplit("/", 1)[-1]
    print(f"[{i}/{len(order)}] {fn}")
    fetch(url, os.path.join(WH, fn))
print("==> 全部 wheel 下载完成")
PYEOF

echo "==> 离线安装 oci-cli"
py -3 -m pip install --no-index --find-links ./wheels oci-cli
echo "==> 校验（若提示 oci 不在 PATH，请将 Python312 的 Scripts 目录加入 PATH）"
oci --version 2>/dev/null || echo "oci 未进入 PATH，请执行：export PATH=\"\$PATH:\$(py -3 -c 'import sys;print(sys.prefix)')/Scripts\""
