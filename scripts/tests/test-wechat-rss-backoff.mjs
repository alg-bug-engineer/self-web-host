#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  normalizeWechatRssSyncState,
  recordWechatRssUpdate,
  shouldAttemptWechatRssUpdate,
} from '../lib/wechat-rss-backoff.mjs'

const firstEmpty = recordWechatRssUpdate({
  now: new Date('2026-08-11T04:22:34Z'),
  itemCount: 0,
})
assert.equal(firstEmpty.consecutiveEmptyUpdates, 1)
assert.equal(firstEmpty.backoffUntil, '2026-08-13T04:22:34.000Z')
assert.equal(firstEmpty.lastResult, 'empty-after-update')
assert.equal(shouldAttemptWechatRssUpdate({
  state: firstEmpty,
  now: new Date('2026-08-12T01:15:00Z'),
}).allowed, false)
assert.equal(shouldAttemptWechatRssUpdate({
  state: firstEmpty,
  now: new Date('2026-08-13T04:22:34Z'),
}).allowed, true)

const secondEmpty = recordWechatRssUpdate({
  state: firstEmpty,
  now: new Date('2026-08-13T04:22:34Z'),
  itemCount: 0,
})
assert.equal(secondEmpty.consecutiveEmptyUpdates, 2)
assert.equal(secondEmpty.backoffUntil, '2026-08-17T04:22:34.000Z')

const cappedEmpty = recordWechatRssUpdate({
  state: { ...secondEmpty, consecutiveEmptyUpdates: 9 },
  now: new Date('2026-08-17T04:22:34Z'),
  itemCount: 0,
})
assert.equal(cappedEmpty.backoffUntil, '2026-08-24T04:22:34.000Z')

const recovered = recordWechatRssUpdate({
  state: secondEmpty,
  now: new Date('2026-08-17T04:22:34Z'),
  itemCount: 6,
})
assert.equal(recovered.consecutiveEmptyUpdates, 0)
assert.equal(recovered.backoffUntil, null)
assert.equal(recovered.lastItemCount, 6)
assert.equal(recovered.lastResult, 'items-available')

assert.deepEqual(normalizeWechatRssSyncState({
  consecutiveEmptyUpdates: -9,
  backoffUntil: 'not-a-date',
  accessToken: 'must-not-survive',
}), {
  version: 1,
  consecutiveEmptyUpdates: 0,
  lastAttemptAt: null,
  lastSuccessfulAt: null,
  backoffUntil: null,
  lastItemCount: 0,
  lastResult: null,
})

console.log('公众号 RSS 保护性退避测试通过：48 小时起步、指数增长、7 天封顶并可自动恢复。')
