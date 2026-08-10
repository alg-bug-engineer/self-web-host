#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ANALYTICS_TEST_DIR="$(mktemp -d)"
ANALYTICS_TEST_PORT="$((33000 + RANDOM % 1000))"
ANALYTICS_TEST_PID=""
CORRUPT_TEST_PID=""

cleanup() {
  if [[ -n "$ANALYTICS_TEST_PID" ]]; then
    kill "$ANALYTICS_TEST_PID" >/dev/null 2>&1 || true
    wait "$ANALYTICS_TEST_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$CORRUPT_TEST_PID" ]]; then
    kill "$CORRUPT_TEST_PID" >/dev/null 2>&1 || true
    wait "$CORRUPT_TEST_PID" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$ANALYTICS_TEST_DIR"
}
trap cleanup EXIT

cd "$PROJECT_DIR"
# Simulate a production v4 file with historical days. The first write must
# preserve the old metrics, upgrade the schema, and exclude the mixed rollout
# day from month-level de-duplication.
node - "$ANALYTICS_TEST_DIR/analytics.json" <<'NODE'
const fs = require('node:fs')
const file = process.argv[2]
const yesterday = new Date()
yesterday.setUTCDate(yesterday.getUTCDate() - 1)
fs.writeFileSync(file, JSON.stringify({
  version: 4,
  days: {
    [yesterday.toISOString().slice(0, 10)]: {
      pageViews: 0,
      visitors: [],
      returningVisitors: [],
      visitorPageViews: {},
      paths: {},
      pathVisitors: {},
      engagement: {},
      vitals: {},
      sources: {},
      landingPaths: {},
      conversions: {},
      conversionCountsByVisitor: {},
    },
  },
}))
NODE
ANALYTICS_DATA_DIR="$ANALYTICS_TEST_DIR" APP_COMMIT_SHA="analytics-v5-test" PORT="$ANALYTICS_TEST_PORT" npm start >"$ANALYTICS_TEST_DIR/server.log" 2>&1 &
ANALYTICS_TEST_PID="$!"

for _ in {1..40}; do
  if curl --silent --fail "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/health" >/dev/null; then
    break
  fi
  sleep 0.25
done
curl --silent --fail "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/health" >/dev/null

node - "$ANALYTICS_TEST_DIR/analytics.json" <<'NODE'
const fs = require('node:fs')
const store = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const tomorrow = new Date()
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
if (store.version !== 5) throw new Error('production startup did not migrate analytics to v5')
if (store.visitorIdentity?.scope !== 'calendar-month') throw new Error('startup migration did not persist identity scope')
if (store.visitorIdentity?.reliableFromDay !== tomorrow.toISOString().slice(0, 10)) throw new Error('startup migration did not exclude the legacy rollout day')
if (Object.keys(store.days || {}).length !== 1) throw new Error('startup migration changed historical day count')
NODE

request_headers=(
  -H 'Content-Type: application/json'
  -H 'User-Agent: conversion-test-browser'
  -H 'Accept-Language: zh-CN'
  -H 'X-Forwarded-For: 203.0.113.9'
)

curl --silent --fail -X POST "${request_headers[@]}" \
  --data '{"path":"/portfolio","referrer":""}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view" >/dev/null
UNKNOWN_PATH_STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST "${request_headers[@]}" \
  --data '{"path":"/operator","referrer":""}' \
  "http://127.0.0.1:${ANALYTICS_TEST_PORT}/api/analytics/view")"
[[ "$UNKNOWN_PATH_STATUS" == "400" ]]
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
const tomorrow = new Date()
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
const daily = store.days[day]
if (store.version !== 5) throw new Error(`expected store version 5, got ${store.version}`)
if (store.visitorIdentity?.scope !== 'calendar-month') throw new Error('monthly visitor identity scope is missing')
if (store.visitorIdentity?.reliableFromDay !== tomorrow.toISOString().slice(0, 10)) throw new Error('legacy migration day was not excluded')
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
if (report.version !== 11) throw new Error(`expected report version 11, got ${report.version}`)
if (report.status.measurement.crossDayDeduplicated !== false) throw new Error('mixed migration day was treated as de-duplicated')
if (report.status.currentMonthVisitors !== null) throw new Error('mixed migration day produced a monthly visitor count')
if (report.status.currentMonthQualifiedVisitors !== null) throw new Error('mixed migration day produced a qualified monthly visitor count')
if (report.content !== null) throw new Error('missing content audit should be represented as null')
if (report.value.conversionVisitors !== 1) throw new Error('report conversion visitor count is wrong')
if (report.value.conversionRatePercent !== 100) throw new Error('report conversion rate is wrong')
if (report.value.topConversions[0]?.name !== 'view_book') throw new Error('report top conversion is missing')
NODE

CORRUPT_TEST_DIR="$ANALYTICS_TEST_DIR/corrupt"
CORRUPT_TEST_PORT="$((34000 + RANDOM % 1000))"
mkdir -p "$CORRUPT_TEST_DIR"
node - "$CORRUPT_TEST_DIR/analytics.json" <<'NODE'
require('node:fs').writeFileSync(process.argv[2], '{"version":4,"days":')
NODE

ANALYTICS_DATA_DIR="$CORRUPT_TEST_DIR" APP_COMMIT_SHA="analytics-corrupt-test" PORT="$CORRUPT_TEST_PORT" npm start >"$CORRUPT_TEST_DIR/server.log" 2>&1 &
CORRUPT_TEST_PID="$!"
for _ in {1..20}; do
  if ! kill -0 "$CORRUPT_TEST_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
if curl --silent --fail --max-time 2 "http://127.0.0.1:${CORRUPT_TEST_PORT}/api/health" >/dev/null 2>&1; then
  echo 'corrupt analytics store unexpectedly reached healthy state' >&2
  exit 1
fi
node - "$CORRUPT_TEST_DIR/analytics.json" <<'NODE'
const fs = require('node:fs')
if (fs.readFileSync(process.argv[2], 'utf8') !== '{"version":4,"days":') {
  throw new Error('corrupt analytics file was overwritten')
}
NODE

echo 'analytics conversion test passed'
