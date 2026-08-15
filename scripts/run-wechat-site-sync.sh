#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FEED_URL="${WECHAT_RSS_URL:-http://127.0.0.1:8001/feed/MP_WXS_3212677307.rss?limit=50}"
FEED_ID="${WECHAT_EXPECTED_FEED_ID:-MP_WXS_3212677307}"
LOCK_DIR="${WECHAT_SITE_SYNC_LOCK_DIR:-/tmp/ai-knowledgepoints-wechat-site-sync.lockdir}"
HEALTH_URL="${WECHAT_SITE_HEALTH_URL:-https://ai-knowledgepoints.cn/api/health}"
GIT_SSH_REWRITE="url.ssh://git@ssh.github.com:443/.insteadOf=https://github.com/"
WORKTREE_ROOT=""
WORKTREE_DIR=""

run_with_retries() {
  local attempts="${WECHAT_SITE_SYNC_NETWORK_ATTEMPTS:-4}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if "$@"; then
      return 0
    fi
    if ((attempt < attempts)); then
      echo "网络操作失败（$attempt/$attempts），5 秒后重试。" >&2
      sleep 5
    fi
  done
  return 1
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "已有公众号网站同步任务在运行。"
  exit 0
fi

cleanup() {
  if [[ -n "$WORKTREE_ROOT" && -n "$WORKTREE_DIR" && "$WORKTREE_DIR" == "$WORKTREE_ROOT/repo" ]]; then
    git -C "$PROJECT_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
    rmdir "$WORKTREE_ROOT" 2>/dev/null || true
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

cd "$PROJECT_DIR"
command -v git >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
command -v gh >/dev/null
gh auth status >/dev/null
if [[ ! -d node_modules ]]; then
  echo "缺少 node_modules，请先在 $PROJECT_DIR 运行 npm ci。" >&2
  exit 1
fi

run_with_retries git -c "$GIT_SSH_REWRITE" fetch origin main
WORKTREE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ai-knowledgepoints-wechat-sync.XXXXXX")"
WORKTREE_DIR="$WORKTREE_ROOT/repo"
git worktree add --detach "$WORKTREE_DIR" origin/main

(
  cd "$WORKTREE_DIR"
  WECHAT_RSS_URL="$FEED_URL" \
    WECHAT_EXPECTED_FEED_ID="$FEED_ID" \
    WECHAT_AUTO_PUBLISH=true \
    WECHAT_IMPORT_DAYS="${WECHAT_IMPORT_DAYS:-31}" \
    WECHAT_MAX_IMPORTS="${WECHAT_MAX_IMPORTS:-12}" \
    node "$PROJECT_DIR/scripts/import-wechat.mjs"
)

if [[ -z "$(git -C "$WORKTREE_DIR" status --porcelain -- content/posts public/images/wechat)" ]]; then
  echo "公众号 RSS 没有尚未进入网站的新文章。"
  exit 0
fi

(
  cd "$WORKTREE_DIR"
  npm ci --prefer-offline --no-audit --no-fund
  npm run build
)

if [[ "${WECHAT_SITE_SYNC_DRY_RUN:-false}" == true ]]; then
  echo "公众号文章导入与生产构建通过；dry-run 未创建 PR。"
  exit 0
fi

# shellcheck source=lib/github-pr-recovery.sh
source "$PROJECT_DIR/scripts/lib/github-pr-recovery.sh"
timestamp="$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)"
branch="codex/wechat-sync-local-$timestamp"
git -C "$WORKTREE_DIR" switch -c "$branch"
git -C "$WORKTREE_DIR" add content/posts public/images/wechat
git -C "$WORKTREE_DIR" -c user.name="ai-knowledgepoints-bot" \
  -c user.email="actions@users.noreply.github.com" \
  commit -m "同步公众号最新文章"
run_with_retries git -C "$WORKTREE_DIR" -c "$GIT_SSH_REWRITE" push origin "$branch"

pr_number="$(github_create_or_find_pr main "$branch" "同步公众号最新文章" "从本机私有 We-MP-RSS 自动同步本人公众号最近 31 天已公开文章；已校验 Feed 身份、正文长度并通过生产构建。")"
github_wait_for_pr_checks "$pr_number"
merge_sha="$(github_merge_and_resolve_sha "$pr_number" "同步公众号最新文章 (#${pr_number})")"

for _ in {1..30}; do
  health="$(curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" || true)"
  if [[ "$health" == *"\"commit\":\"$merge_sha\""* ]]; then
    echo "公众号文章已自动更新到网站：$merge_sha"
    exit 0
  fi
  sleep 20
done

echo "公众号文章已合并，但网站在等待时间内没有部署到 $merge_sha。" >&2
exit 1
