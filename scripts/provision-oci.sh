#!/usr/bin/env bash
# provision-oci.sh — 用 OCI CLI 幂等开通 StudyPlan 部署所需 Always Free 资源（runbook §2）
#
# 创建：VCN / Internet Gateway / 路由表(0.0.0.0/0→IGW) / 子网 / 安全列表(入站 22·80·443) / 预留公网 IP / Ampere A1 实例
# 不改动任何业务文件；执行后输出公网 IP，供 scripts/deploy-oci.sh（SSH + docker compose 构建）接管。
#
# 幂等：所有资源用 studyplan-* display-name，已存在则复用，便于重跑 / 换 AD 重试。
#
# 用法：
#   SSH_PUBLIC_KEY=~/.ssh/id_ed25519.pub \   # 缺省自动检测 id_ed25519.pub 或 id_rsa.pub
#   COMPARTMENT_OCID=<可选，缺省=tenancy> OCI_REGION=<可选> AD_NAME=<可选> IMAGE_OCID=<可选> \
#   bash scripts/provision-oci.sh
#
# 风险：
#   1) Always Free A1 容量按 AD 限流；若 instance launch 报 OutOfHostCapacity，换 AD_NAME 重试。
#   2) 镜像 OCID 随区域变化，默认按 region 动态查询，禁止硬编码。
#   3) 启动盘 200GB（免费额度内），因实例内 docker compose build 会下载约 ~1GB 本地模型权重，50GB 默认盘偏紧。
#   4) 预留(RESERVED)公网 IP 绑定到实例私有 IP，重启不丢 IP。
set -euo pipefail

# ---------- 前置校验：定位 oci（官方 Windows 安装器默认未加入 PATH）----------
if ! command -v oci >/dev/null 2>&1; then
  for d in "/c/Program Files (x86)/Oracle/oci_cli" "/c/Program Files/Oracle/oci_cli" "/usr/local/bin" "/opt/oci_cli"; do
    if [[ -x "$d/oci.exe" || -x "$d/oci" ]]; then
      export PATH="$PATH:$d"
      echo "  • 已将 oci 目录加入 PATH: $d"
      break
    fi
  done
fi
command -v oci >/dev/null 2>&1 || { echo "✗ 未找到 oci CLI，请先安装 OCI CLI（建议官方 Windows 安装器）并配置 ~/.oci/config"; exit 1; }

# ---------- 参数 ----------
if [[ -z "${SSH_PUBLIC_KEY:-}" ]]; then
  if [[ -f "$HOME/.ssh/id_ed25519.pub" ]]; then
    SSH_PUBLIC_KEY="$HOME/.ssh/id_ed25519.pub"
  elif [[ -f "$HOME/.ssh/id_rsa.pub" ]]; then
    SSH_PUBLIC_KEY="$HOME/.ssh/id_rsa.pub"
  else
    echo "✗ 未找到 SSH 公钥（请设置 SSH_PUBLIC_KEY，或将公钥放在 ~/.ssh/id_ed25519.pub 或 id_rsa.pub）"
    exit 1
  fi
fi
[[ -f "$SSH_PUBLIC_KEY" ]] || { echo "✗ SSH 公钥不存在: $SSH_PUBLIC_KEY（请用 SSH_PUBLIC_KEY 指定）"; exit 1; }
# 若处于 Git Bash / Cygwin，将 SSH 公钥路径转为 Windows 格式，供原生 oci.exe 读取
if command -v cygpath >/dev/null 2>&1; then
  SSH_PUBLIC_KEY="$(cygpath -w "$SSH_PUBLIC_KEY")"
fi

COMPARTMENT_OCID="${COMPARTMENT_OCID:-}"
OCI_REGION="${OCI_REGION:-}"
AD_NAME="${AD_NAME:-}"
IMAGE_OCID="${IMAGE_OCID:-}"

# region：从 ~/.oci/config [DEFAULT].region 读，env 可覆盖
if [[ -z "$OCI_REGION" ]]; then
  OCI_REGION="$(grep -A 20 '\[DEFAULT\]' ~/.oci/config 2>/dev/null | grep -i '^region' | head -1 | sed 's/^[^=]*=[[:space:]]*//' | tr -d ' ')"
fi
[[ -n "$OCI_REGION" ]] || { echo "✗ 无法从 ~/.oci/config 读取 region，请设置 OCI_REGION"; exit 1; }

# compartment：缺省回退到 tenancy（root compartment）
if [[ -z "$COMPARTMENT_OCID" ]]; then
  COMPARTMENT_OCID="$(oci iam tenancy get --query 'data.id' --raw-output)"
fi

# AD：缺省取第一个
if [[ -z "$AD_NAME" ]]; then
  AD_NAME="$(oci iam availability-domain list -c "$COMPARTMENT_OCID" --query 'data[0].name' --raw-output)"
fi

echo "==> 区域: $OCI_REGION"
echo "==> Compartment: $COMPARTMENT_OCID"
echo "==> AD: $AD_NAME"
echo "==> SSH 公钥: $SSH_PUBLIC_KEY"
echo

# ---------- 幂等取值工具 ----------
# get_or_create <list_cmd> <create_cmd> <display_name>
# 通过 list 按 display-name 查已存在资源；存在则复用 data[0].id，否则执行 create 取 data.id
oc_get_id() { # oc_get_id <list_cmd...>  —— 返回 display-name 匹配的首个 id（无则空）
  local out
  out="$( "$@" --query 'data[0].id' --raw-output 2>/dev/null )" || out=""
  [[ "$out" == "null" ]] && out=""
  printf '%s' "$out"
}

# ---------- 1) VCN ----------
VCN_ID="$( oc_get_id oci network vcn list -c "$COMPARTMENT_OCID" --display-name studyplan-vcn )"
if [[ -z "$VCN_ID" ]]; then
  VCN_ID="$( oci network vcn create -c "$COMPARTMENT_OCID" --cidr-block 10.0.0.0/16 --display-name studyplan-vcn --query 'data.id' --raw-output )"
  echo "  ✓ 创建 VCN: $VCN_ID"
else
  echo "  ↺ 复用 VCN: $VCN_ID"
fi

# ---------- 2) Internet Gateway ----------
IGW_ID="$( oc_get_id oci network internet-gateway list -c "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" --display-name studyplan-igw )"
if [[ -z "$IGW_ID" ]]; then
  IGW_ID="$( oci network internet-gateway create -c "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" --is-enabled true --display-name studyplan-igw --query 'data.id' --raw-output )"
  echo "  ✓ 创建 IGW: $IGW_ID"
else
  echo "  ↺ 复用 IGW: $IGW_ID"
fi

# ---------- 3) 路由表 ----------
RT_ID="$( oc_get_id oci network route-table list -c "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" --display-name studyplan-rt )"
if [[ -z "$RT_ID" ]]; then
  ROUTE_RULES="[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$IGW_ID\"}]"
  RT_ID="$( oci network route-table create -c "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" --display-name studyplan-rt --route-rules "$ROUTE_RULES" --query 'data.id' --raw-output )"
  echo "  ✓ 创建路由表: $RT_ID"
else
  echo "  ↺ 复用路由表: $RT_ID"
fi

# ---------- 4) 安全列表（入站 22/80/443，出站全通）----------
SL_ID="$( oc_get_id oci network security-list list -c "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" --display-name studyplan-sl )"
if [[ -z "$SL_ID" ]]; then
  INGRESS='[{"source":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},{"source":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},{"source":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"min":443,"max":443}}}]'
  EGRESS='[{"destination":"0.0.0.0/0","protocol":"all"}]'
  SL_ID="$( oci network security-list create -c "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" --display-name studyplan-sl --ingress-security-rules "$INGRESS" --egress-security-rules "$EGRESS" --query 'data.id' --raw-output )"
  echo "  ✓ 创建安全列表: $SL_ID"
else
  echo "  ↺ 复用安全列表: $SL_ID"
fi

# ---------- 5) 子网（public）----------
SUBNET_ID="$( oc_get_id oci network subnet list -c "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" --display-name studyplan-subnet )"
if [[ -z "$SUBNET_ID" ]]; then
  SUBNET_ID="$( oci network subnet create -c "$COMPARTMENT_OCID" --vcn-id "$VCN_ID" --cidr-block 10.0.0.0/24 --display-name studyplan-subnet --route-table-id "$RT_ID" --security-list-ids "[\"$SL_ID\"]" --prohibit-public-ip-on-vnic false --query 'data.id' --raw-output )"
  echo "  ✓ 创建子网: $SUBNET_ID"
else
  echo "  ↺ 复用子网: $SUBNET_ID"
fi

# ---------- 6) 预留公网 IP ----------
PIP_ID="$( oci network public-ip list -c "$COMPARTMENT_OCID" --scope REGION --query "data[?\"display-name\" == 'studyplan-pip'].id | [0]" --raw-output 2>/dev/null )"
[[ "$PIP_ID" == "null" ]] && PIP_ID=""
if [[ -z "$PIP_ID" ]]; then
  PIP_ID="$( oci network public-ip create -c "$COMPARTMENT_OCID" --lifetime RESERVED --display-name studyplan-pip --query 'data.id' --raw-output )"
  echo "  ✓ 创建预留公网 IP: $PIP_ID"
else
  echo "  ↺ 复用预留公网 IP: $PIP_ID"
fi

# ---------- 7) 实例（Ampere A1 4OCPU/24GB, Ubuntu 24.04 aarch64）----------
INST_ID="$( oc_get_id oci compute instance list -c "$COMPARTMENT_OCID" --availability-domain "$AD_NAME" --display-name studyplan-app )"
if [[ -z "$INST_ID" ]]; then
  if [[ -z "$IMAGE_OCID" ]]; then
    IMAGE_OCID="$( oci compute image list -c "$COMPARTMENT_OCID" --operating-system Ubuntu --operating-system-version 24.04 --shape VM.Standard.A1.Flex --all \
      --query "data[?contains(\"display-name\",'aarch64') || contains(\"display-name\",'ARM')].{ts:\"time-created\",id:id} | sort_by(@,&ts)[-1].id" --raw-output 2>/dev/null )"
  fi
  [[ "$IMAGE_OCID" == "null" ]] && IMAGE_OCID=""
  if [[ -z "$IMAGE_OCID" ]]; then
    echo "✗ 无法自动发现 Ubuntu 24.04 aarch64 镜像 OCID，请手动设置 IMAGE_OCID 后重试"
    exit 1
  fi
  echo "  • 使用镜像 OCID: $IMAGE_OCID"
  INST_ID="$( oci compute instance launch \
      -c "$COMPARTMENT_OCID" --availability-domain "$AD_NAME" \
      --shape VM.Standard.A1.Flex --shape-config '{"ocpus":4,"memoryInGBs":24}' \
      --image-id "$IMAGE_OCID" --subnet-id "$SUBNET_ID" \
      --display-name studyplan-app --ssh-authorized-keys-file "$SSH_PUBLIC_KEY" \
      --assign-public-ip false --boot-volume-size-in-gbs 200 \
      --wait-for-state RUNNING --query 'data.id' --raw-output )"
  echo "  ✓ 创建并启动实例: $INST_ID"
else
  echo "  ↺ 复用实例: $INST_ID"
fi

# ---------- 8) 取私有 IP OCID 并绑定预留公网 IP ----------
VNIC_ID="$( oci compute instance list-vnics -c "$COMPARTMENT_OCID" --instance-id "$INST_ID" --query 'data[0]."vnic-id"' --raw-output )"
PRIV_IP_ID="$( oci network private-ip list -c "$COMPARTMENT_OCID" --vnic-id "$VNIC_ID" --query 'data[0].id' --raw-output )"
# 若尚未绑定则绑定（get 当前 private-ip-id 判断）
CUR_BOUND="$( oci network public-ip get --public-ip-id "$PIP_ID" --query 'data."private-ip-id"' --raw-output 2>/dev/null )"
if [[ "$CUR_BOUND" != "$PRIV_IP_ID" ]]; then
  oci network public-ip update --public-ip-id "$PIP_ID" --private-ip-id "$PRIV_IP_ID" >/dev/null
  echo "  ✓ 绑定预留公网 IP 到私有 IP: $PRIV_IP_ID"
else
  echo "  ↺ 公网 IP 已绑定私有 IP"
fi

# ---------- 9) 输出 ----------
PUBLIC_IP="$( oci network public-ip get --public-ip-id "$PIP_ID" --query 'data.ip' --raw-output )"
echo
echo "============================================================"
echo "✓ 实例已启动: $INST_ID"
echo "✓ 公网 IP   : $PUBLIC_IP"
echo
echo "下一步（SSH 初始化 + 构建，由你手动执行，不在本脚本范围内）："
echo "  ssh ubuntu@$PUBLIC_IP"
echo "  DEPLOY_REMOTE=ubuntu@$PUBLIC_IP bash scripts/deploy-oci.sh"
echo "============================================================"
