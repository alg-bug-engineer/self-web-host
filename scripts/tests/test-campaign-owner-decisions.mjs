import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts/report-campaign-owner-decisions.mjs')
const dailyRunner = await fs.readFile(path.join(projectDir, 'scripts/run-daily-content.sh'), 'utf8')
assert.match(dailyRunner, /decision_as_of="\$\{date_key\}T\$\{run_slot\}:00:00\+08:00"/)
assert.match(dailyRunner, /report-campaign-owner-decisions\.mjs" --as-of "\$decision_as_of"/)

const early = report('2026-08-12T07:00:00+08:00')
assert.equal(early.state, 'no_owner_action_now')
assert.equal(early.counts.waiting, 4)
assert.deepEqual(early.surfaced, [])

const websiteWindow = report('2026-08-12T20:00:00+08:00')
assert.equal(websiteWindow.state, 'owner_action_needed')
assert.deepEqual(websiteWindow.surfaced.map((item) => item.id), ['website-deployment-authorization'])

const wechatWindow = report('2026-08-13T09:00:00+08:00')
assert.deepEqual(
  wechatWindow.surfaced.map((item) => item.id).sort(),
  ['wechat-author-preview-2026-08-14', 'website-deployment-authorization'].sort(),
)

const overdue = report('2026-08-14T09:00:00+08:00')
assert.equal(overdue.decisions.find((item) => item.id === 'wechat-author-preview-2026-08-14').state, 'overdue')
assert.match(overdue.decisions.find((item) => item.id === 'wechat-author-preview-2026-08-14').safeFallback, /不群发/)

const paymentWindow = report('2026-08-25T20:00:00+08:00')
assert.equal(paymentWindow.decisions.find((item) => item.id === 'paid-pilot-offer-and-compliance').state, 'action_due')
assert.match(paymentWindow.decisions.find((item) => item.id === 'paid-pilot-offer-and-compliance').safeFallback, /免费研究型试学/)
assert.equal(paymentWindow.externalWritesPerformed, false)

console.log('campaign owner decision queue tests passed')

function report(asOf) {
  return JSON.parse(execFileSync(process.execPath, [script, '--as-of', asOf, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}
