#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PUBLISHER_ENV_FILE="${PUBLISHER_ENV_FILE:-$HOME/.config/ai-knowledgepoints/publisher.env}"
LOCK_DIR="${CONTENT_LOCK_DIR:-/tmp/ai-knowledgepoints-daily-content.lockdir}"
GIT_SSH_REWRITE="url.ssh://git@ssh.github.com:443/.insteadOf=https://github.com/"
WORKTREE_ROOT=""
WORKTREE_DIR=""

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "已有日更内容任务在运行。"
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

if [[ -f "$PUBLISHER_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$PUBLISHER_ENV_FILE"
  set +a
fi

if [[ -z "${WECHAT_APP_ID:-}" ]] && command -v security >/dev/null; then
  WECHAT_APP_ID="$(security find-generic-password -a app-id -s ai-knowledgepoints-wechat -w 2>/dev/null || true)"
  export WECHAT_APP_ID
fi
if [[ -z "${WECHAT_APP_SECRET:-}" ]] && command -v security >/dev/null; then
  WECHAT_APP_SECRET="$(security find-generic-password -a app-secret -s ai-knowledgepoints-wechat -w 2>/dev/null || true)"
  export WECHAT_APP_SECRET
fi

export CONTENT_AI_BASE_URL="${CONTENT_AI_BASE_URL:-http://127.0.0.1:3000/v1}"
export CONTENT_AI_CONFIG_FILE="${CONTENT_AI_CONFIG_FILE:-$(cd "$PROJECT_DIR/.." && pwd)/chatgpt2api/config.json}"
export CONTENT_AI_MODEL="${CONTENT_AI_MODEL:-gpt-5-6}"
export CONTENT_AI_REVIEW="${CONTENT_AI_REVIEW:-true}"
export CONTENT_AUTO_PUBLISH="${CONTENT_AUTO_PUBLISH:-true}"
export WECHAT_PUBLISH_HOST="${WECHAT_PUBLISH_HOST:-8.149.232.39}"
export WECHAT_PUBLISH_SSH_KEY="${WECHAT_PUBLISH_SSH_KEY:-$PROJECT_DIR/home.pem}"

cd "$PROJECT_DIR"
command -v git >/dev/null

date_key="${CONTENT_DATE:-$(TZ=Asia/Shanghai date +%F)}"
if [[ ! "$date_key" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "CONTENT_DATE 必须是 YYYY-MM-DD。" >&2
  exit 1
fi
export CONTENT_DATE="$date_key"

git -c "$GIT_SSH_REWRITE" fetch origin main
published_path="$(git ls-tree -r --name-only origin/main -- content/posts | grep -E "^content/posts/daily-${date_key}-.*\.mdx$" | head -1 || true)"
if [[ -n "$published_path" ]]; then
  echo "$date_key 已在 origin/main 发布深度文章：$published_path"
  exit 0
fi

branch="codex/daily-article-$date_key"
worktree_ref="origin/main"
export CONTENT_RESUME=false
if git -c "$GIT_SSH_REWRITE" ls-remote --exit-code --heads origin "refs/heads/$branch" >/dev/null 2>&1; then
  git -c "$GIT_SSH_REWRITE" fetch origin "$branch:refs/remotes/origin/$branch"
  worktree_ref="origin/$branch"
  export CONTENT_RESUME=true
  echo "检测到未完成的日更分支 ${branch}，将从原稿继续。"
fi
export DAILY_CONTENT_BRANCH="$branch"

command -v gh >/dev/null
command -v npm >/dev/null
gh auth status >/dev/null
if [[ "$CONTENT_RESUME" != true ]]; then
  command -v docker >/dev/null
  if ! docker inspect chatgpt2api >/dev/null 2>&1; then
    command -v open >/dev/null
    open -gja Docker
    for _ in {1..30}; do
      if docker inspect chatgpt2api >/dev/null 2>&1; then break; fi
      sleep 5
    done
  fi
  docker inspect chatgpt2api >/dev/null
fi

WORKTREE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ai-knowledgepoints-daily.XXXXXX")"
WORKTREE_DIR="$WORKTREE_ROOT/repo"
git worktree add --detach "$WORKTREE_DIR" "$worktree_ref"

PROJECT_DIR="$WORKTREE_DIR" bash "$WORKTREE_DIR/scripts/run-daily-content-worker.sh"
