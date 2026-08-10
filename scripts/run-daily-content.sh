#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PUBLISHER_ENV_FILE="${PUBLISHER_ENV_FILE:-$HOME/.config/ai-knowledgepoints/publisher.env}"
LOCK_DIR="${CONTENT_LOCK_DIR:-/tmp/ai-knowledgepoints-daily-content.lockdir}"
GIT_SSH_REWRITE="url.ssh://git@ssh.github.com:443/.insteadOf=https://github.com/"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "已有日更内容任务在运行。"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

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

cd "$PROJECT_DIR"
command -v gh >/dev/null
command -v npm >/dev/null
gh auth status >/dev/null
if ! docker inspect chatgpt2api >/dev/null 2>&1; then
  open -gja Docker
  for _ in {1..30}; do
    if docker inspect chatgpt2api >/dev/null 2>&1; then break; fi
    sleep 5
  done
fi
docker inspect chatgpt2api >/dev/null

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "仓库存在未提交的已跟踪改动，停止日更，避免覆盖人工工作。"
  git status --short
  exit 1
fi

git switch main
git -c "$GIT_SSH_REWRITE" pull --ff-only origin main

date_key="$(TZ=Asia/Shanghai date +%F)"
if find content/posts -maxdepth 1 -name "daily-${date_key}-*.mdx" -print -quit | grep -q .; then
  echo "$date_key 已发布深度文章。"
  exit 0
fi

npm run article:daily
npm run build

manifest="$(find content/wechat -maxdepth 1 -name "daily-${date_key}-*.json" -print -quit)"
if [[ -z "$manifest" ]]; then
  echo "生成完成但没有找到公众号发布清单。"
  exit 1
fi

branch="codex/daily-article-${date_key}-$(date +%H%M%S)"
git switch -c "$branch"
git add "content/posts/daily-${date_key}-"*.mdx "content/wechat/daily-${date_key}-"* "public/images/articles/${date_key}-"*
git commit -m "发布 ${date_key} AI 深度文章"
git -c "$GIT_SSH_REWRITE" push -u origin "$branch"

pr_url="$(gh pr create --base main --head "$branch" --title "发布 ${date_key} AI 深度文章" --body "本机 chatgpt2api 生成的每日深度文章、统一信息图和公众号发布稿。已通过本地生产构建与结构化内容校验。")"
pr_number="${pr_url##*/}"
sleep 10
gh pr checks "$pr_number" --watch --interval 15
gh pr merge "$pr_number" --squash --delete-branch --subject "发布 ${date_key} AI 深度文章 (#${pr_number})"
merge_sha="$(gh pr view "$pr_number" --json mergeCommit --jq '.mergeCommit.oid')"

deployed=false
for _ in {1..30}; do
  health="$(curl --fail --silent --show-error --max-time 15 https://ai-knowledgepoints.cn/api/health || true)"
  if [[ "$health" == *"\"commit\":\"$merge_sha\""* ]]; then
    deployed=true
    break
  fi
  sleep 20
done
if [[ "$deployed" != true ]]; then
  echo "网站在等待时间内没有部署到 $merge_sha，公众号发布已停止。"
  exit 1
fi

if [[ -n "${WECHAT_PUBLISH_HOST:-}" ]]; then
  wechat_ssh_key="${WECHAT_PUBLISH_SSH_KEY:-$PROJECT_DIR/home.pem}"
  wechat_ssh_user="${WECHAT_PUBLISH_USER:-root}"
  wechat_project_dir="${WECHAT_PUBLISH_PROJECT_DIR:-/root/self-web-host}"
  ssh -i "$wechat_ssh_key" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$wechat_ssh_user@$WECHAT_PUBLISH_HOST" \
    "cd '$wechat_project_dir' && set -a && source /root/.config/ai-knowledgepoints/publisher.env && set +a && npm run publish:wechat -- '$manifest'"
elif [[ -n "${WECHAT_APP_ID:-}" && -n "${WECHAT_APP_SECRET:-}" ]]; then
  npm run publish:wechat -- "$manifest"
else
  echo "网站已发布；未配置 WECHAT_APP_ID/WECHAT_APP_SECRET，公众号发布稿保留在 $manifest。"
fi

echo "每日内容流水线完成：$date_key"
