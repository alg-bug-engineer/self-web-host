#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SYNC_ENV_FILE="${SEARCH_CONSOLE_SYNC_ENV_FILE:-$HOME/.config/ai-knowledgepoints/search-console-sync.env}"
NODE_BIN="${NODE_BIN:-node}"
SSH_BIN="${SSH_BIN:-ssh}"
SCP_BIN="${SCP_BIN:-scp}"
LOCK_DIR="${SEARCH_CONSOLE_SYNC_LOCK_DIR:-/tmp/ai-knowledgepoints-search-console-sync.lockdir}"

if [[ -f "$SYNC_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SYNC_ENV_FILE"
  set +a
fi

credentials_file="${SEARCH_CONSOLE_CREDENTIALS_FILE:-$HOME/.config/ai-knowledgepoints/google-search-console-service-account.json}"
remote_host="${SEARCH_CONSOLE_SYNC_REMOTE_HOST:?缺少 SEARCH_CONSOLE_SYNC_REMOTE_HOST。}"
remote_user="${SEARCH_CONSOLE_SYNC_REMOTE_USER:-root}"
ssh_key="${SEARCH_CONSOLE_SYNC_SSH_KEY:?缺少 SEARCH_CONSOLE_SYNC_SSH_KEY。}"
remote_dir="${SEARCH_CONSOLE_SYNC_REMOTE_DIR:-/root/self-web-host-data/operator}"

if [[ ! -f "$credentials_file" ]]; then
  echo "Search Console 凭据文件不存在：$credentials_file" >&2
  exit 1
fi
if [[ ! -f "$ssh_key" ]]; then
  echo "ECS SSH 私钥不存在：$ssh_key" >&2
  exit 1
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Search Console 本机同步已在运行，跳过重复触发。"
  exit 0
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ai-knowledgepoints-search-console.XXXXXX")"
remote_tmp="$remote_dir/.search-console-latest.$$.tmp"
cleanup() {
  rm -rf "$work_dir" "$LOCK_DIR"
}
trap cleanup EXIT

ANALYTICS_DATA_DIR="$work_dir" \
SEARCH_CONSOLE_CREDENTIALS_FILE="$credentials_file" \
NODE_ENV=production \
"$NODE_BIN" "$PROJECT_DIR/scripts/fetch-search-console.mjs"

report_path="$work_dir/operator/search-console-latest.json"
"$NODE_BIN" -e '
const fs = require("fs")
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
if (report.status !== "connected") throw new Error(`Search Console 未连接：${report.error || report.status || "unknown"}`)
' "$report_path"

remote_target="$remote_user@$remote_host"
"$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=20 -i "$ssh_key" "$remote_target" "install -d -m 700 '$remote_dir'"
"$SCP_BIN" -q -o BatchMode=yes -o ConnectTimeout=20 -i "$ssh_key" "$report_path" "$remote_target:$remote_tmp"
"$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=20 -i "$ssh_key" "$remote_target" "chmod 600 '$remote_tmp' && mv '$remote_tmp' '$remote_dir/search-console-latest.json'"

echo "Search Console 私有汇总已原子同步到 ECS。"
