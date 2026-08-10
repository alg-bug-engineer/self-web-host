#!/usr/bin/env bash

# GitHub CLI calls can time out after GitHub has already accepted a mutation.
# These helpers reconcile the authoritative PR state before deciding whether the
# daily publishing pipeline should stop or continue.

github_cli() {
  "${GH_BIN:-gh}" "$@"
}

github_retry_sleep() {
  local seconds="${GH_RETRY_SLEEP_SECONDS:-10}"
  if [[ "$seconds" != "0" ]]; then
    sleep "$seconds"
  fi
}

github_create_or_find_pr() {
  local base="$1"
  local head="$2"
  local title="$3"
  local body="$4"
  local pr_url=""
  local pr_number=""
  local attempts="${GH_STATE_RETRY_ATTEMPTS:-6}"
  local attempt

  if pr_url="$(github_cli pr create --base "$base" --head "$head" --title "$title" --body "$body")"; then
    pr_number="${pr_url##*/}"
  fi

  if [[ ! "$pr_number" =~ ^[0-9]+$ ]]; then
    printf 'GitHub 创建 PR 的响应失败，正在按 head/base 对账远端状态。\n' >&2
    for ((attempt = 1; attempt <= attempts; attempt += 1)); do
      pr_number="$(github_cli pr list --base "$base" --head "$head" --state all --limit 10 --json number,state --jq 'map(select(.state == "OPEN" or .state == "MERGED")) | first | .number // empty' 2>/dev/null || true)"
      if [[ "$pr_number" =~ ^[0-9]+$ ]]; then
        break
      fi
      if ((attempt < attempts)); then
        github_retry_sleep
      fi
    done
  fi

  if [[ ! "$pr_number" =~ ^[0-9]+$ ]]; then
    printf '无法确认 GitHub PR 已创建，停止流水线。\n' >&2
    return 1
  fi
  printf '%s\n' "$pr_number"
}

github_wait_for_pr_checks() {
  local pr_number="$1"
  local attempts="${GH_CHECK_RETRY_ATTEMPTS:-3}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if github_cli pr checks "$pr_number" --watch --interval 15; then
      return 0
    fi
    if ((attempt < attempts)); then
      printf 'GitHub 检查状态读取失败（%s/%s），正在重试。\n' "$attempt" "$attempts" >&2
      github_retry_sleep
    fi
  done

  printf 'GitHub CI 未确认通过，停止合并。\n' >&2
  return 1
}

github_merge_and_resolve_sha() {
  local pr_number="$1"
  local subject="$2"
  local attempts="${GH_STATE_RETRY_ATTEMPTS:-6}"
  local attempt
  local merge_sha=""

  # Keep gh's progress output visible without contaminating the SHA returned on stdout.
  if ! github_cli pr merge "$pr_number" --squash --delete-branch --subject "$subject" >&2; then
    printf 'GitHub 合并响应失败，正在对账 PR 是否已实际合并。\n' >&2
  fi

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    merge_sha="$(github_cli pr view "$pr_number" --json state,mergeCommit --jq 'select(.state == "MERGED") | .mergeCommit.oid // empty' 2>/dev/null || true)"
    if [[ "$merge_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
      printf '%s\n' "$merge_sha"
      return 0
    fi
    if ((attempt < attempts)); then
      github_retry_sleep
    fi
  done

  printf '无法确认 PR #%s 已合并，停止部署等待与公众号发布。\n' "$pr_number" >&2
  return 1
}
