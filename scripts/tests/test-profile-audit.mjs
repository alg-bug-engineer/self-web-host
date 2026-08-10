#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')
const fixturePath = path.join(projectDir, 'scripts', 'tests', 'fixtures', 'profile-github.json')
const originalProfile = JSON.parse(await fs.readFile(path.join(projectDir, 'src', 'data', 'profile.json'), 'utf8'))
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-audit-'))
const profilePath = path.join(dataDir, 'profile.json')

try {
  await fs.writeFile(profilePath, JSON.stringify(originalProfile))
  let report = await runAudit()
  assert.equal(report.status, 'healthy')
  assert.equal(report.github.publicRepositories, 33)
  assert.equal(report.version, 2)
  assert.equal(report.publicEvidence.verifiedWorks.length, 1)
  assert.equal(report.publicEvidence.verifiedWorks[0].identifier, 'CN118861081B')
  assert.deepEqual(report.issues, [])
  assert.equal((await fs.stat(path.join(dataDir, 'operator', 'profile-latest.json'))).mode & 0o777, 0o600)
  let operatorReport = await runOperatorReport()
  assert.equal(operatorReport.version, 12)
  assert.equal(operatorReport.profile.status, 'healthy')
  assert.ok(operatorReport.observations.some((item) => item.includes('33 个公开仓库')))
  assert.ok(operatorReport.observations.some((item) => item.includes('1 项公开专业成果')))

  const staleProfile = structuredClone(originalProfile)
  staleProfile.checks.github.expectedPublicRepositories = 31
  await fs.writeFile(profilePath, JSON.stringify(staleProfile))
  report = await runAudit()
  assert.equal(report.status, 'review-needed')
  assert.ok(report.issues.some((issue) => issue.code === 'github-repository-count-drift'))
  assert.match(report.issues[0].message, /修改作者页前需要代码审查/)
  operatorReport = await runOperatorReport()
  assert.ok(operatorReport.recommendedActions.some((action) => action.type === 'profile-review'))
} finally {
  await fs.rm(dataDir, { recursive: true, force: true })
}

async function runAudit() {
  await execFileAsync(process.execPath, ['scripts/audit-profile.mjs'], {
    cwd: projectDir,
    env: {
      ...process.env,
      ANALYTICS_DATA_DIR: dataDir,
      PROFILE_DATA_FILE: profilePath,
      PROFILE_GITHUB_FIXTURE: fixturePath,
    },
  })
  return JSON.parse(await fs.readFile(path.join(dataDir, 'operator', 'profile-latest.json'), 'utf8'))
}

async function runOperatorReport() {
  await execFileAsync(process.execPath, ['scripts/generate-operator-report.mjs'], {
    cwd: projectDir,
    env: { ...process.env, ANALYTICS_DATA_DIR: dataDir },
  })
  return JSON.parse(await fs.readFile(path.join(dataDir, 'operator', 'latest.json'), 'utf8'))
}

console.log('个人公开资料巡检测试通过：准确数据健康，仓库数漂移进入人工审查。')
