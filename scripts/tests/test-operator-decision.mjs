#!/usr/bin/env node

import assert from 'node:assert/strict'
import { buildOperatorDecision } from '../lib/operator-decision.mjs'

const noisyStart = buildOperatorDecision({
  activeDays: 1,
  visitorDays: 9,
  qualifiedVisitorDays: 1,
  recommendedActions: [
    { priority: 2, type: 'seo', action: '修改标题', reviewRequired: true },
    { priority: 2, type: 'search-instrumentation', action: '配置搜索数据', reviewRequired: true },
  ],
})
assert.equal(noisyStart.mode, 'observe')
assert.equal(noisyStart.growthReady, false)
assert.equal(noisyStart.primaryAction, null)
assert.equal(noisyStart.externalBlockers[0].type, 'search-instrumentation')
assert.equal(noisyStart.evidence.remainingActiveDays, 6)

const maintenance = buildOperatorDecision({
  activeDays: 1,
  visitorDays: 9,
  recommendedActions: [
    { priority: 1, type: 'technical-audit', action: '恢复技术巡检', reviewRequired: false },
    { priority: 2, type: 'seo', action: '修改标题', reviewRequired: true },
  ],
})
assert.equal(maintenance.mode, 'maintenance-required')
assert.equal(maintenance.primaryAction.type, 'technical-audit')

const experiment = buildOperatorDecision({
  activeDays: 8,
  visitorDays: 40,
  qualifiedVisitorDays: 12,
  recommendedActions: [
    { priority: 2, type: 'reading-experience', action: '优化一个页面', reviewRequired: true },
  ],
})
assert.equal(experiment.mode, 'experiment-review')
assert.equal(experiment.growthReady, true)
assert.equal(experiment.primaryAction.type, 'reading-experience')

const searchExperiment = buildOperatorDecision({
  activeDays: 2,
  visitorDays: 5,
  searchEvidenceReady: true,
  recommendedActions: [
    { priority: 2, type: 'search-ctr', action: '优化一个高曝光页面', reviewRequired: true },
  ],
})
assert.equal(searchExperiment.mode, 'experiment-review')
assert.equal(searchExperiment.evidence.searchEvidenceReady, true)

const experimentAtCapacity = buildOperatorDecision({
  activeDays: 8,
  visitorDays: 40,
  activeExperimentCount: 1,
  maximumConcurrentExperiments: 1,
  recommendedActions: [
    { priority: 2, type: 'seo', action: '再启动一个实验', reviewRequired: true },
  ],
})
assert.equal(experimentAtCapacity.mode, 'experiment-observing')
assert.equal(experimentAtCapacity.primaryAction, null)
assert.equal(experimentAtCapacity.evidence.experimentCapacityAvailable, false)
assert.equal(experimentAtCapacity.evidence.maximumConcurrentExperiments, 1)

console.log('经营决策门槛测试通过：维护优先、样本不足观察、显式实验并发上限真实生效。')
