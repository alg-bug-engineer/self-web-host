#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:?缺少隔离日更工作区}"
GIT_SSH_REWRITE="url.ssh://git@ssh.github.com:443/.insteadOf=https://github.com/"

# shellcheck source=lib/github-pr-recovery.sh
source "$PROJECT_DIR/scripts/lib/github-pr-recovery.sh"

cd "$PROJECT_DIR"
npm ci

date_key="${CONTENT_DATE:?缺少日更日期}"
daily_post="$(find content/posts -maxdepth 1 -name "daily-${date_key}-*.mdx" -print -quit)"
if [[ "${CONTENT_RESUME:-false}" == true ]]; then
  if [[ -z "$daily_post" ]]; then
    echo "未完成分支缺少 $date_key 的文章，停止恢复。" >&2
    exit 1
  fi
  echo "复用未完成分支中的原稿：$daily_post"
else
  npm run article:daily
fi
npm run build

manifest="$(find content/wechat -maxdepth 1 -name "daily-${date_key}-*.json" -print -quit)"
if [[ -z "$manifest" ]]; then
  echo "生成完成但没有找到公众号发布清单。" >&2
  exit 1
fi

branch="${DAILY_CONTENT_BRANCH:-codex/daily-article-$date_key}"
if [[ "${CONTENT_RESUME:-false}" != true ]]; then
  git add "content/posts/daily-${date_key}-"*.mdx "content/wechat/daily-${date_key}-"* "public/images/articles/${date_key}-"*
  git commit -m "发布 ${date_key} AI 深度文章"
  git -c "$GIT_SSH_REWRITE" push origin "HEAD:refs/heads/$branch"
fi

pr_number="$(github_create_or_find_pr main "$branch" "发布 ${date_key} AI 深度文章" "本机 chatgpt2api 在隔离 worktree 中生成的每日深度文章、统一信息图和公众号发布稿。已通过本地生产构建与结构化内容校验。")"
sleep 10
github_wait_for_pr_checks "$pr_number"
merge_sha="$(github_merge_and_resolve_sha "$pr_number" "发布 ${date_key} AI 深度文章 (#${pr_number})")"

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
  echo "网站在等待时间内没有部署到 $merge_sha，公众号发布已停止。" >&2
  exit 1
fi

if [[ -n "${WECHAT_PUBLISH_HOST:-}" ]]; then
  wechat_ssh_key="${WECHAT_PUBLISH_SSH_KEY:?缺少公众号发布 SSH 密钥路径}"
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
