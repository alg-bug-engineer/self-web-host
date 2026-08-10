#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ANALYTICS_TEST_DIR="$(mktemp -d)"
ANALYTICS_TEST_PORT="$((33000 + RANDOM % 1000))"
ANALYTICS_TEST_PID=""

cleanup() {
  if [[ -n "$ANALYTICS_TEST_PID" ]]; then
    kill "$ANALYTICS_TEST_PID" >/dev/null 2>&1 || true
    wait "$ANALYTICS_TEST_PID" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$ANALYTICS_TEST_DIR"
}
trap cleanup EXIT

cd "$PROJECT_DIR"
ANALYTICS_DATA_DIR="$ANALYTICS_TEST_DIR" PORT="$ANALYTICS_TEST_PORT" npm start >"$ANALYTICS_TEST_DIR/server.log" 2>&1 &
ANALYTICS_TEST_PID="$!"

for _ in {1..40}; do
  if curl --silent --fail "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/health" >/dev/null; then
    break
  fi
  sleep 0.25
done
curl --silent --fail "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/health" >/dev/null

request_headers=(
  -H 'Content-Type: application/json'
  -H 'User-Agent: conversion-test-browser'
  -H 'Accept-Language: zh-CN'
  -H 'X-Forwarded-For: 203.0.113.9'
)

curl --silent --fail -X POST "${request_headers[@]}" \
  --data '{"path":"/portfolio","referrer":""}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view" >/dev/null
curl --silent --fail -X POST "${request_headers[@]}" \
  --data '{"kind":"conversion","path":"/portfolio","name":"view_book","target":"book-3"}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view" >/dev/null
curl --silent --fail -X POST "${request_headers[@]}" \
  --data '{"kind":"conversion","path":"/blog","name":"explore_articles","target":"blog-path-principles"}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view" >/dev/null
curl --silent --fail -X PATCH "${request_headers[@]}" \
  --data '{"path":"/blog","seconds":30,"depth":50}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view" >/dev/null
curl --silent --fail -X PATCH "${request_headers[@]}" \
  --data '{"path":"/portfolio","seconds":12,"depth":30}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view" >/dev/null

INVALID_STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST "${request_headers[@]}" \
  --data '{"kind":"conversion","path":"/portfolio","name":"arbitrary_event","target":"https://example.com/private"}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view")"
[[ "$INVALID_STATUS" == "400" ]]

INVALID_TARGET_STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST "${request_headers[@]}" \
  --data '{"kind":"conversion","path":"/portfolio","name":"view_book","target":"attacker-controlled-key"}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view")"
[[ "$INVALID_TARGET_STATUS" == "400" ]]

curl --silent --fail -X POST "${request_headers[@]}" -H 'DNT: 1' \
  --data '{"kind":"conversion","path":"/portfolio","name":"view_book","target":"book-4"}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view" >/dev/null

node - "$ANALYTICS_TEST_DIR/analytics.json" <<'NODE'
const fs = require('node:fs')
const analyticsFile = process.argv[2]
const store = JSON.parse(fs.readFileSync(analyticsFile, 'utf8'))
const day = new Date().toISOString().slice(0, 10)
const daily = store.days[day]
if (store.version !== 4) throw new Error(`expected store version 4, got ${store.version}`)
if (daily.pageViews !== 1) throw new Error(`expected one page view, got ${daily.pageViews}`)
if (daily.conversions.view_book.count !== 1) throw new Error('DNT or invalid event was recorded')
if (daily.conversions.view_book.visitors.length !== 1) throw new Error('conversion visitor was not de-duplicated')
if (daily.conversions.view_book.targets['book-3'] !== 1) throw new Error('normalized target was not recorded')
if (daily.conversions.explore_articles.targets['blog-path-principles'] !== 1) throw new Error('blog learning path was not recorded')
if (daily.conversions.arbitrary_event) throw new Error('arbitrary event name was accepted')
if (daily.engagement['/blog']) throw new Error('engagement was accepted for a path the visitor did not view')
if (daily.engagement['/portfolio']?.[daily.visitors[0]]?.seconds !== 12) throw new Error('valid active reading was not recorded')
if ((fs.statSync(analyticsFile).mode & 0o777) !== 0o600) throw new Error('analytics file is not private')
NODE

ANALYTICS_DATA_DIR="$ANALYTICS_TEST_DIR" npm run operator:learn >/dev/null
ANALYTICS_DATA_DIR="$ANALYTICS_TEST_DIR" npm run operator:report >/dev/null

node - "$ANALYTICS_TEST_DIR/operator/latest.json" <<'NODE'
const fs = require('node:fs')
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (report.version !== 9) throw new Error(`expected report version 9, got ${report.version}`)
if (report.content !== null) throw new Error('missing content audit should be represented as null')
if (report.value.conversionVisitors !== 1) throw new Error('report conversion visitor count is wrong')
if (report.value.conversionRatePercent !== 100) throw new Error('report conversion rate is wrong')
if (report.value.topConversions[0]?.name !== 'view_book') throw new Error('report top conversion is missing')
NODE

echo 'analytics conversion test passed'
