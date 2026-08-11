#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/daily-content-isolation-test.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT

REMOTE_DIR="$TEST_ROOT/remote.git"
SEED_DIR="$TEST_ROOT/seed"
CHECKOUT_DIR="$TEST_ROOT/checkout"
FAKE_BIN="$TEST_ROOT/bin"
MARKER_FILE="$TEST_ROOT/worker-marker"
DOCKER_MARKER_FILE="$TEST_ROOT/docker-marker"
TEST_TMP="$TEST_ROOT/tmp"
mkdir -p "$FAKE_BIN" "$TEST_TMP"

git init --bare "$REMOTE_DIR" >/dev/null
git init -b main "$SEED_DIR" >/dev/null
git -C "$SEED_DIR" config user.name test
git -C "$SEED_DIR" config user.email test@example.com
mkdir -p "$SEED_DIR/scripts" "$SEED_DIR/content/posts"
install -m 755 "$PROJECT_DIR/scripts/run-daily-content.sh" "$SEED_DIR/scripts/run-daily-content.sh"
printf '初始内容\n' > "$SEED_DIR/README.md"
cat > "$SEED_DIR/scripts/run-daily-content-worker.sh" <<'WORKER'
#!/usr/bin/env bash
set -Eeuo pipefail
cd "$PROJECT_DIR"
status="$(git status --porcelain)"
if [[ -n "$status" ]]; then
  echo "隔离 worktree 不干净：$status" >&2
  exit 1
fi
if [[ "${CONTENT_RESUME:-false}" == true ]]; then
  test -n "$(find content/posts -maxdepth 1 -name "daily-${CONTENT_DATE}-*.mdx" -print -quit)"
fi
printf '%s\n' "$PWD" > "$DAILY_TEST_MARKER"
WORKER
chmod +x "$SEED_DIR/scripts/run-daily-content-worker.sh"
git -C "$SEED_DIR" add .
git -C "$SEED_DIR" commit -m initial >/dev/null
git -C "$SEED_DIR" remote add origin "$REMOTE_DIR"
git -C "$SEED_DIR" push -u origin main >/dev/null
git --git-dir="$REMOTE_DIR" symbolic-ref HEAD refs/heads/main
git clone "$REMOTE_DIR" "$CHECKOUT_DIR" >/dev/null

cat > "$FAKE_BIN/gh" <<'SH'
#!/usr/bin/env bash
exit 0
SH
cat > "$FAKE_BIN/docker" <<'SH'
#!/usr/bin/env bash
printf 'called\n' >> "$DAILY_TEST_DOCKER_MARKER"
exit 0
SH
chmod +x "$FAKE_BIN/gh" "$FAKE_BIN/docker"

printf '用户正在编辑\n' >> "$CHECKOUT_DIR/README.md"
mkdir -p "$CHECKOUT_DIR/docs"
printf 'user-owned\n' > "$CHECKOUT_DIR/docs/著作.jpeg"

PATH="$FAKE_BIN:$PATH" \
TMPDIR="$TEST_TMP" \
PROJECT_DIR="$CHECKOUT_DIR" \
CONTENT_DATE="2026-08-12" \
CONTENT_LOCK_DIR="$TEST_ROOT/lock" \
PUBLISHER_ENV_FILE="$TEST_ROOT/missing.env" \
DAILY_TEST_MARKER="$MARKER_FILE" \
DAILY_TEST_DOCKER_MARKER="$DOCKER_MARKER_FILE" \
  bash "$CHECKOUT_DIR/scripts/run-daily-content.sh"

WORKER_DIR="$(cat "$MARKER_FILE")"
test "$WORKER_DIR" != "$CHECKOUT_DIR"
test ! -e "$WORKER_DIR"
test "$(git -C "$CHECKOUT_DIR" worktree list --porcelain | grep -c '^worktree ')" -eq 1
grep -q '用户正在编辑' "$CHECKOUT_DIR/README.md"
test -f "$CHECKOUT_DIR/docs/著作.jpeg"
test -s "$DOCKER_MARKER_FILE"

git -C "$SEED_DIR" switch -c codex/daily-article-2026-08-12 >/dev/null
printf '%s\n' '---' 'title: test' 'date: 2026-08-12T08:30:00+08:00' '---' > "$SEED_DIR/content/posts/daily-2026-08-12-test.mdx"
git -C "$SEED_DIR" add content/posts
git -C "$SEED_DIR" commit -m draft >/dev/null
git -C "$SEED_DIR" push -u origin codex/daily-article-2026-08-12 >/dev/null
rm -f "$MARKER_FILE"
rm -f "$DOCKER_MARKER_FILE"

PATH="$FAKE_BIN:$PATH" \
TMPDIR="$TEST_TMP" \
PROJECT_DIR="$CHECKOUT_DIR" \
CONTENT_DATE="2026-08-12" \
CONTENT_LOCK_DIR="$TEST_ROOT/lock" \
PUBLISHER_ENV_FILE="$TEST_ROOT/missing.env" \
DAILY_TEST_MARKER="$MARKER_FILE" \
DAILY_TEST_DOCKER_MARKER="$DOCKER_MARKER_FILE" \
  bash "$CHECKOUT_DIR/scripts/run-daily-content.sh"

test -s "$MARKER_FILE"
test ! -e "$DOCKER_MARKER_FILE"
test "$(git -C "$CHECKOUT_DIR" worktree list --porcelain | grep -c '^worktree ')" -eq 1
rm -f "$MARKER_FILE"

git -C "$SEED_DIR" switch main >/dev/null
git -C "$SEED_DIR" cherry-pick codex/daily-article-2026-08-12 >/dev/null
git -C "$SEED_DIR" push origin main >/dev/null

PATH="$FAKE_BIN:$PATH" \
TMPDIR="$TEST_TMP" \
PROJECT_DIR="$CHECKOUT_DIR" \
CONTENT_DATE="2026-08-12" \
CONTENT_LOCK_DIR="$TEST_ROOT/lock" \
PUBLISHER_ENV_FILE="$TEST_ROOT/missing.env" \
DAILY_TEST_MARKER="$MARKER_FILE" \
DAILY_TEST_DOCKER_MARKER="$DOCKER_MARKER_FILE" \
  bash "$CHECKOUT_DIR/scripts/run-daily-content.sh"

test ! -e "$MARKER_FILE"
test ! -e "$DOCKER_MARKER_FILE"
test "$(git -C "$CHECKOUT_DIR" worktree list --porcelain | grep -c '^worktree ')" -eq 1
grep -q '用户正在编辑' "$CHECKOUT_DIR/README.md"
test -f "$CHECKOUT_DIR/docs/著作.jpeg"

git -C "$SEED_DIR" switch main >/dev/null
printf '%s\n' '---' 'title: retired draft' 'date: 2026-08-13T08:30:00+08:00' 'published: false' '---' > "$SEED_DIR/content/posts/daily-2026-08-13-retired.mdx"
git -C "$SEED_DIR" add content/posts
git -C "$SEED_DIR" commit -m 'retire duplicate draft' >/dev/null
git -C "$SEED_DIR" push origin main >/dev/null
rm -f "$MARKER_FILE" "$DOCKER_MARKER_FILE"

PATH="$FAKE_BIN:$PATH" \
TMPDIR="$TEST_TMP" \
PROJECT_DIR="$CHECKOUT_DIR" \
CONTENT_DATE="2026-08-13" \
CONTENT_LOCK_DIR="$TEST_ROOT/lock" \
PUBLISHER_ENV_FILE="$TEST_ROOT/missing.env" \
DAILY_TEST_MARKER="$MARKER_FILE" \
DAILY_TEST_DOCKER_MARKER="$DOCKER_MARKER_FILE" \
  bash "$CHECKOUT_DIR/scripts/run-daily-content.sh"

test -s "$MARKER_FILE"
test -s "$DOCKER_MARKER_FILE"
test "$(git -C "$CHECKOUT_DIR" worktree list --porcelain | grep -c '^worktree ')" -eq 1

echo "日更隔离测试通过：脏工作区不受影响，失败分支原稿可恢复，已发布文章幂等跳过，退役旧稿可自动补位。"
