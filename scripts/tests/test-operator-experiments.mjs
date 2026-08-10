#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { parseOperatorExperiment, primaryMetricSignal } from '../lib/operator-experiments.mjs'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')

const declared = parseOperatorExperiment(`优化文章首屏

Operator-Experiment: article-reading-promise
Operator-Hypothesis: 更清楚的首屏承诺会提高目标文章的有效阅读率。
Operator-Primary-Metric: engagementRatePoints
Operator-Target-Path: /blog/evidence`)
assert.equal(declared.error, null)
assert.deepEqual(declared.experiment, {
  id: 'article-reading-promise',
  hypothesis: '更清楚的首屏承诺会提高目标文章的有效阅读率。',
  primaryMetric: 'engagementRatePoints',
  targetPath: '/blog/evidence',
})
assert.deepEqual(parseOperatorExperiment('普通维护提交'), { experiment: null, error: null })
assert.match(parseOperatorExperiment('Operator-Experiment: Bad ID').error, /小写短横线/)
assert.match(parseOperatorExperiment(`Operator-Experiment: private-route
Operator-Hypothesis: 这是一项长度足够但目标错误的测试假设。
Operator-Primary-Metric: engagementRatePoints
Operator-Target-Path: /operator`).error, /公开站内路径/)
assert.match(parseOperatorExperiment(`Operator-Experiment: encoded-private-route
Operator-Hypothesis: 这是一项长度足够但目标编码错误的测试假设。
Operator-Primary-Metric: engagementRatePoints
Operator-Target-Path: /blog/../operator`).error, /公开站内路径/)
assert.equal(primaryMetricSignal('engagementRatePoints', 3), 'positive-signal')
assert.equal(primaryMetricSignal('lcpP75Percent', -8), 'positive-signal')
assert.equal(primaryMetricSignal('conversionRatePoints', -2), 'negative-signal')

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'operator-experiment-'))
const operatorDir = path.join(dataDir, 'operator')
await fs.mkdir(operatorDir, { recursive: true })

try {
  await fs.writeFile(path.join(dataDir, 'analytics.json'), JSON.stringify({ version: 5, days: analyticsDays() }))
  await writeDeployments([
    deployment('a', '2026-07-01T08:00:00.000Z'),
    deployment('b', '2026-07-15T08:00:00.000Z', declared.experiment),
    { ...deployment('c', '2026-07-02T08:00:00.000Z'), experimentMetadataError: '字段缺失' },
  ])

  let state = await evaluate('2026-07-18T12:00:00.000Z')
  assert.equal(state.version, 2)
  assert.equal(actionFor(state, 'a').status, 'recorded')
  assert.equal(actionFor(state, 'a').confidence, 'not-applicable')
  assert.equal(actionFor(state, 'c').status, 'invalid-experiment-metadata')
  assert.equal(actionFor(state, 'b').status, 'observing')
  assert.equal(actionFor(state, 'b').experiment.targetPath, '/blog/evidence')

  state = await evaluate('2026-08-11T12:00:00.000Z')
  assert.equal(actionFor(state, 'b').status, 'evaluated')
  assert.equal(actionFor(state, 'b').outcome, 'positive-signal')
  assert.equal(actionFor(state, 'b').primaryMetric.name, 'engagementRatePoints')
  assert.equal(actionFor(state, 'b').primaryMetric.value, 40)

  await writeDeployments([
    deployment('a', '2026-07-01T08:00:00.000Z'),
    deployment('b', '2026-07-15T08:00:00.000Z', declared.experiment),
    deployment('d', '2026-07-18T08:00:00.000Z', {
      ...declared.experiment,
      id: 'overlapping-reading-experiment',
    }),
  ])
  state = await evaluate('2026-08-11T12:00:00.000Z')
  assert.equal(actionFor(state, 'b').status, 'confounded')
  assert.deepEqual(actionFor(state, 'b').confoundedByExperimentIds, ['overlapping-reading-experiment'])
} finally {
  await fs.rm(dataDir, { recursive: true, force: true })
}

console.log('经营实验完整性测试通过：普通部署不冒充实验，显式实验按目标页评估，重叠窗口拒绝归因。')

async function evaluate(now) {
  await execFileAsync(process.execPath, ['scripts/evaluate-operator-actions.mjs'], {
    cwd: projectDir,
    env: { ...process.env, ANALYTICS_DATA_DIR: dataDir, OPERATOR_NOW: now },
  })
  return JSON.parse(await fs.readFile(path.join(operatorDir, 'actions.json'), 'utf8'))
}

async function writeDeployments(events) {
  await fs.writeFile(
    path.join(operatorDir, 'deployments.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  )
}

function actionFor(state, letter) {
  return state.actions.find((action) => action.commit === letter.repeat(40))
}

function deployment(letter, deployedAt, experiment = null) {
  return {
    version: 2,
    commit: letter.repeat(40),
    previousCommit: '0'.repeat(40),
    deployedAt,
    subject: `提交 ${letter}`,
    changedFiles: ['src/app/blog/page.tsx'],
    experiment,
    experimentMetadataError: null,
  }
}

function analyticsDays() {
  const days = {}
  for (let offset = -7; offset <= 7; offset += 1) {
    const date = new Date('2026-07-15T00:00:00.000Z')
    date.setUTCDate(date.getUTCDate() + offset)
    const day = date.toISOString().slice(0, 10)
    if (offset === 0) continue
    const visitors = Array.from({ length: 10 }, (_, index) => `${day}-visitor-${index}`)
    const engagedCount = offset < 0 ? 2 : 6
    days[day] = {
      pageViews: 10,
      visitors,
      returningVisitors: [],
      paths: { '/blog/evidence': 10 },
      pathVisitors: { '/blog/evidence': visitors },
      engagement: {
        '/blog/evidence': Object.fromEntries(visitors.slice(0, engagedCount).map((visitor) => [
          visitor,
          { seconds: 20, depth: 50 },
        ])),
      },
      conversions: {},
      vitals: {},
    }
  }
  return days
}
