#!/usr/bin/env node

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import nextEnv from '@next/env'
import { parseOperatorExperiment } from './lib/operator-experiments.mjs'

const execFileAsync = promisify(execFile)
const projectDir = process.cwd()
nextEnv.loadEnvConfig(projectDir)

const [commit, previousCommit] = process.argv.slice(2)
if (!/^[0-9a-f]{40}$/i.test(commit || '')) throw new Error('部署提交号无效。')
if (!/^[0-9a-f]{40}$/i.test(previousCommit || '')) throw new Error('上一提交号无效。')

if (commit === previousCommit) {
  console.log('提交号未变化，不新增经营行动记录。')
  process.exit(0)
}

const dataDir = process.env.ANALYTICS_DATA_DIR || path.join(projectDir, 'data')
const operatorDir = path.join(dataDir, 'operator')
const journalPath = path.join(operatorDir, 'deployments.jsonl')

const git = async (...args) => (await execFileAsync('git', args, {
  cwd: projectDir,
  maxBuffer: 1024 * 1024,
})).stdout.trim()

const existing = await fs.readFile(journalPath, 'utf8').catch(() => '')
const alreadyRecorded = existing
  .split('\n')
  .filter(Boolean)
  .some((line) => {
    try {
      return JSON.parse(line).commit === commit
    } catch {
      return false
    }
  })

if (alreadyRecorded) {
  console.log(`部署行动已存在：${commit.slice(0, 12)}`)
  process.exit(0)
}

const subject = await git('show', '-s', '--format=%s', commit)
const commitMessage = await git('show', '-s', '--format=%B', commit)
const experimentMetadata = parseOperatorExperiment(commitMessage)
const changedFiles = (await git('diff', '--name-only', previousCommit, commit))
  .split('\n')
  .filter(Boolean)
  .slice(0, 100)

const event = {
  version: 2,
  commit,
  previousCommit,
  deployedAt: new Date().toISOString(),
  subject,
  changedFiles,
  experiment: experimentMetadata.experiment,
  experimentMetadataError: experimentMetadata.error,
}

await fs.mkdir(operatorDir, { recursive: true, mode: 0o700 })
await fs.chmod(operatorDir, 0o700).catch(() => undefined)
await fs.appendFile(journalPath, `${JSON.stringify(event)}\n`, { mode: 0o600 })
await fs.chmod(journalPath, 0o600).catch(() => undefined)
console.log(`已记录经营行动：${commit.slice(0, 12)} ${subject}`)
