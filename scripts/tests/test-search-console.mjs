#!/usr/bin/env node

import assert from 'node:assert/strict'
import { dateInTimeZone, fetchSearchConsoleReport, finalizedDateRange, shiftDate } from '../lib/search-console.mjs'

assert.equal(dateInTimeZone(new Date('2026-08-11T01:00:00Z')), '2026-08-10')
assert.equal(shiftDate('2026-03-01', -1), '2026-02-28')
assert.deepEqual(finalizedDateRange(new Date('2026-08-11T01:00:00Z')), {
  startDate: '2026-07-11',
  endDate: '2026-08-07',
})

const requests = []
const fakeFetch = async (url, options) => {
  const body = JSON.parse(options.body)
  requests.push({ url, options, body })
  const dimension = body.dimensions[0]
  const rows = dimension === 'date'
    ? [{ keys: ['2026-08-07'], clicks: 2, impressions: 20, ctr: 0.1, position: 3.456 }]
    : dimension === 'query'
      ? [{ keys: ['AI 原生一代'], clicks: 3, impressions: 50, ctr: 0.06, position: 4.2 }]
      : dimension === 'page'
        ? [{ keys: ['https://ai-knowledgepoints.cn/blog/example'], clicks: 4, impressions: 80, ctr: 0.05, position: 5 }]
        : [{ clicks: 10, impressions: 100, ctr: 0.1, position: 3.456 }]
  return { ok: true, json: async () => ({ rows }) }
}

const report = await fetchSearchConsoleReport({
  accessToken: 'test-token',
  siteUrl: 'sc-domain:ai-knowledgepoints.cn',
  startDate: '2026-07-11',
  endDate: '2026-08-07',
  fetchImpl: fakeFetch,
  apiBaseUrl: 'https://search.example/v3',
})

assert.equal(requests.length, 4)
assert.ok(requests.every((request) => request.url.includes('sc-domain%3Aai-knowledgepoints.cn')))
assert.ok(requests.every((request) => request.body.dataState === 'final'))
assert.ok(requests.every((request) => request.options.headers.Authorization === 'Bearer test-token'))
assert.equal(report.summary.ctrPercent, 10)
assert.equal(report.summary.averagePosition, 3.46)
assert.equal(report.topQueries[0].query, 'AI 原生一代')
assert.equal(report.topPages[0].ctrPercent, 5)
assert.equal(report.daily[0].date, '2026-08-07')

const errorFetch = async () => ({
  ok: false,
  status: 403,
  json: async () => ({ error: { message: 'permission denied' } }),
})
await assert.rejects(
  fetchSearchConsoleReport({
    accessToken: 'test-token',
    siteUrl: 'sc-domain:ai-knowledgepoints.cn',
    startDate: '2026-07-11',
    endDate: '2026-08-07',
    fetchImpl: errorFetch,
  }),
  /permission denied/,
)

console.log('Search Console 数据模型与 API 请求测试通过。')
