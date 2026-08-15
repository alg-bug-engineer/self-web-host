import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'bootstrap-notebooklm-campaign.mjs')
const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'notebooklm-bootstrap-'))

try {
  const binDir = path.join(fixtureDir, 'bin')
  const stateDir = path.join(fixtureDir, 'state')
  const campaignFile = path.join(fixtureDir, 'campaign.json')
  const campaignLogFile = path.join(fixtureDir, 'campaign-log.json')
  const invocationLog = path.join(fixtureDir, 'invocations.jsonl')
  const fakeCli = path.join(binDir, 'notebooklm')
  await fs.mkdir(binDir, { recursive: true })
  await Promise.all([
    fs.writeFile(campaignFile, JSON.stringify({
      id: 'test-campaign',
      name: '测试活动',
      sourceSeeds: ['https://example.com/existing', 'https://example.com/new'],
    })),
    fs.writeFile(campaignLogFile, JSON.stringify({
      notebooklm: { notebookId: 'existing-notebook-id', profile: 'test-campaign-profile' },
    })),
    fs.writeFile(fakeCli, `#!/usr/bin/env node
const fs = require('node:fs')
const rawArgs = process.argv.slice(2)
fs.appendFileSync(process.env.FAKE_NOTEBOOKLM_LOG, JSON.stringify(rawArgs) + '\\n')
const args = rawArgs[0] === '--profile' ? rawArgs.slice(2) : rawArgs
if (args[0] === '--version') process.stdout.write('NotebookLM CLI, version test\\n')
else if (args[0] === 'auth' && args[1] === 'check') process.stdout.write(JSON.stringify({ status: process.env.FAKE_NOTEBOOKLM_AUTH || 'ok' }))
else if (args[0] === 'metadata') process.stdout.write(JSON.stringify({
  id: 'existing-notebook-id',
  title: '已有资料库',
  sources: [{ url: 'https://example.com/existing' }],
}))
else if (args[0] === 'source' && args[1] === 'add') process.stdout.write(JSON.stringify({ source_id: 'new-source-id' }))
else if (args[0] === 'source' && args[1] === 'wait') process.stdout.write(JSON.stringify({ status: 'ready' }))
else {
  process.stderr.write('unexpected command: ' + args.join(' '))
  process.exitCode = 2
}
`),
  ])
  await fs.chmod(fakeCli, 0o755)

  const output = execFileSync(process.execPath, [script], {
    cwd: projectDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      CONTENT_CAMPAIGN_FILE: campaignFile,
      CONTENT_CAMPAIGN_LOG_FILE: campaignLogFile,
      CONTENT_NOTEBOOKLM_STATE_DIR: stateDir,
      FAKE_NOTEBOOKLM_LOG: invocationLog,
    },
  })

  assert.match(output, /本次新增来源：1/)
  assert.match(output, /本次失败来源：0/)
  const state = JSON.parse(await fs.readFile(path.join(stateDir, 'test-campaign-notebooklm.json'), 'utf8'))
  assert.equal(state.status, 'ready')
  assert.equal(state.profile, 'test-campaign-profile')
  assert.equal(state.notebookId, 'existing-notebook-id')
  assert.equal(state.notebookTitle, '已有资料库')
  assert.equal(state.sourceCount, 2)
  assert.equal(state.added[0].url, 'https://example.com/new')

  const invocations = (await fs.readFile(invocationLog, 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse)
  const authCheck = invocations.find((args) => stripProfile(args)[0] === 'auth' && stripProfile(args)[1] === 'check')
  assert.equal(authCheck[0], '--profile')
  assert.equal(authCheck[1], 'test-campaign-profile')
  assert.ok(authCheck.includes('--passive'))
  assert.ok(invocations.some((args) => stripProfile(args)[0] === 'metadata' && args.includes('existing-notebook-id')))
  assert.ok(!invocations.some((args) => stripProfile(args)[0] === 'create'))
  assert.ok(!invocations.some((args) => stripProfile(args)[0] === 'list'))

  const failedInvocationLog = path.join(fixtureDir, 'failed-invocations.jsonl')
  const failedStateDir = path.join(fixtureDir, 'failed-state')
  const unauthenticated = spawnSync(process.execPath, [script], {
    cwd: projectDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      CONTENT_CAMPAIGN_FILE: campaignFile,
      CONTENT_CAMPAIGN_LOG_FILE: campaignLogFile,
      CONTENT_NOTEBOOKLM_STATE_DIR: failedStateDir,
      FAKE_NOTEBOOKLM_LOG: failedInvocationLog,
      FAKE_NOTEBOOKLM_AUTH: 'error',
    },
  })
  assert.equal(unauthenticated.status, 1)
  assert.match(unauthenticated.stderr, /NotebookLM profile test-campaign-profile 尚未完成独立登录/)
  assert.match(unauthenticated.stderr, /不要使用 --browser-cookies/)
  const failedInvocations = (await fs.readFile(failedInvocationLog, 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse)
  assert.ok(failedInvocations.some((args) => stripProfile(args)[0] === 'auth' && stripProfile(args)[1] === 'check'))
  assert.ok(!failedInvocations.some((args) => ['metadata', 'list', 'create', 'source'].includes(stripProfile(args)[0])))
  await assert.rejects(fs.stat(failedStateDir), /ENOENT/)

  console.log('NotebookLM bootstrap tests passed')
} finally {
  await fs.rm(fixtureDir, { recursive: true, force: true })
}

function stripProfile(args) {
  return args[0] === '--profile' ? args.slice(2) : args
}
