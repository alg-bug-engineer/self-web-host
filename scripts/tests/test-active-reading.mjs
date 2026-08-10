#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  activeReadingSeconds,
  createActiveReadingState,
  transitionActiveReading,
} from '../../src/lib/active-reading.mjs'

let state = createActiveReadingState(true, 1_000)
assert.equal(activeReadingSeconds(state, 9_000), 8)

state = transitionActiveReading(state, false, 9_000)
assert.equal(activeReadingSeconds(state, 20_000), 8, '后台标签页不得累计阅读时间')

state = transitionActiveReading(state, true, 20_000)
assert.equal(activeReadingSeconds(state, 23_500), 11)

state = transitionActiveReading(state, true, 24_000)
assert.equal(activeReadingSeconds(state, 25_000), 13, '重复激活不得丢失已累计时间')

state = transitionActiveReading(state, false, 24_000)
assert.equal(activeReadingSeconds(state, 24_000), 12, '时钟回退不得产生负时长')

console.log('真实阅读时间测试通过：仅页面可见且窗口聚焦时累计。')
