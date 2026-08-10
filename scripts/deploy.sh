#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_NAME="${APP_NAME:-ai-knowledgepoints}"
HEALTH_URL="${HEALTH_URL:-https://ai-knowledgepoints.cn/api/health}"
TARGET_REF="${1:-origin/main}"
CANDIDATE_DIR="$PROJECT_DIR/.next-candidate"
CURRENT_DIR="$PROJECT_DIR/.next"
PREVIOUS_DIR="$PROJECT_DIR/.next-previous"
FAILED_DIR="$PROJECT_DIR/.next-failed"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/ai-knowledgepoints-deploy.lock}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "已有部署任务正在运行。"
  exit 1
fi

cd "$PROJECT_DIR"
git fetch --prune origin

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "工作区存在未提交改动，已停止部署以避免覆盖内容。"
  git status --short
  exit 1
fi

git cat-file -e "${TARGET_REF}^{commit}"
TARGET_SHA="$(git rev-parse "${TARGET_REF}^{commit}")"
CURRENT_SHA="$(git rev-parse HEAD)"

if [[ "$CURRENT_SHA" != "$TARGET_SHA" ]]; then
  git merge --ff-only "$TARGET_SHA"
fi

if [[ -d "$CANDIDATE_DIR" ]]; then
  mv "$CANDIDATE_DIR" "${FAILED_DIR}-stale-$(date +%s)"
fi

# The live build can contain generated route declarations for pages that were
# removed in the target commit. They are not needed at runtime, but TypeScript
# would otherwise read them alongside the candidate build and reject the deploy.
if [[ -d "$CURRENT_DIR/types" ]]; then
  mv "$CURRENT_DIR/types" "${FAILED_DIR}-types-stale-$(date +%s)"
fi

npm ci
NEXT_DIST_DIR=.next-candidate npm run build

if [[ -d "$PREVIOUS_DIR" ]]; then
  mv "$PREVIOUS_DIR" "${FAILED_DIR}-previous-$(date +%s)"
fi
if [[ -d "$CURRENT_DIR" ]]; then
  mv "$CURRENT_DIR" "$PREVIOUS_DIR"
fi
mv "$CANDIDATE_DIR" "$CURRENT_DIR"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  APP_COMMIT_SHA="$TARGET_SHA" pm2 reload "$APP_NAME" --update-env
else
  APP_COMMIT_SHA="$TARGET_SHA" pm2 start ecosystem.config.js --only "$APP_NAME"
fi

healthy=false
for attempt in {1..10}; do
  if response="$(curl --fail --silent --show-error --max-time 10 "$HEALTH_URL")" &&
    [[ "$response" == *'"ok":true'* ]]; then
    healthy=true
    break
  fi
  sleep 3
done

if [[ "$healthy" != true ]]; then
  echo "新版本健康检查失败，开始回滚。"
  if [[ -d "$PREVIOUS_DIR" ]]; then
    mv "$CURRENT_DIR" "${FAILED_DIR}-${TARGET_SHA:0:12}-$(date +%s)"
    mv "$PREVIOUS_DIR" "$CURRENT_DIR"
    APP_COMMIT_SHA="$CURRENT_SHA" pm2 reload "$APP_NAME" --update-env
  fi
  exit 1
fi

pm2 save
echo "部署成功：$TARGET_SHA"
echo "$response"
