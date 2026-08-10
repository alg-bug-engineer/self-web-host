#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

FAKE_GH="$TEST_DIR/gh"
cat >"$FAKE_GH" <<'FAKE'
#!/usr/bin/env bash
set -u

case "${GH_TEST_SCENARIO:-}" in
  create_success)
    [[ "$1 $2" == "pr create" ]] && printf 'https://github.com/example/site/pull/41\n' && exit 0
    ;;
  create_timeout_recovered)
    [[ "$1 $2" == "pr create" ]] && exit 1
    [[ "$1 $2" == "pr list" ]] && printf '42\n' && exit 0
    ;;
  checks_retry)
    if [[ "$1 $2" == "pr checks" ]]; then
      count="$(cat "$GH_TEST_COUNTER" 2>/dev/null || printf '0')"
      count=$((count + 1))
      printf '%s' "$count" >"$GH_TEST_COUNTER"
      ((count >= 2)) && exit 0
      exit 1
    fi
    ;;
  merge_timeout_recovered)
    [[ "$1 $2" == "pr merge" ]] && exit 1
    [[ "$1 $2" == "pr view" ]] && printf '0123456789abcdef0123456789abcdef01234567\n' && exit 0
    ;;
  merge_success_with_progress)
    [[ "$1 $2" == "pr merge" ]] && printf 'merge progress\n' && exit 0
    [[ "$1 $2" == "pr view" ]] && printf '89abcdef0123456789abcdef0123456789abcdef\n' && exit 0
    ;;
  merge_really_failed)
    [[ "$1 $2" == "pr merge" ]] && exit 1
    [[ "$1 $2" == "pr view" ]] && exit 0
    ;;
esac

exit 2
FAKE
chmod +x "$FAKE_GH"

export GH_BIN="$FAKE_GH"
export GH_RETRY_SLEEP_SECONDS=0
export GH_STATE_RETRY_ATTEMPTS=2
export GH_CHECK_RETRY_ATTEMPTS=2
export GH_TEST_COUNTER="$TEST_DIR/check-counter"

# shellcheck source=../lib/github-pr-recovery.sh
source "$PROJECT_DIR/scripts/lib/github-pr-recovery.sh"

export GH_TEST_SCENARIO=create_success
[[ "$(github_create_or_find_pr main topic-branch title body)" == "41" ]]

export GH_TEST_SCENARIO=create_timeout_recovered
[[ "$(github_create_or_find_pr main topic-branch title body)" == "42" ]]

export GH_TEST_SCENARIO=checks_retry
github_wait_for_pr_checks 42
[[ "$(cat "$GH_TEST_COUNTER")" == "2" ]]

export GH_TEST_SCENARIO=merge_timeout_recovered
[[ "$(github_merge_and_resolve_sha 42 subject)" == "0123456789abcdef0123456789abcdef01234567" ]]

export GH_TEST_SCENARIO=merge_success_with_progress
[[ "$(github_merge_and_resolve_sha 42 subject)" == "89abcdef0123456789abcdef0123456789abcdef" ]]

export GH_TEST_SCENARIO=merge_really_failed
if github_merge_and_resolve_sha 42 subject >/dev/null; then
  printf '真实合并失败不应被当成成功。\n' >&2
  exit 1
fi

printf 'GitHub PR 恢复路径测试通过。\n'
