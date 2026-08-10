#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import nextEnv from '@next/env'
import { GoogleAuth } from 'google-auth-library'
import { fetchSearchConsoleReport, finalizedDateRange } from './lib/search-console.mjs'

const projectDir = process.cwd()
nextEnv.loadEnvConfig(projectDir)
const dataDir = process.env.ANALYTICS_DATA_DIR || path.join(projectDir, 'data')
const reportDir = path.join(dataDir, 'operator')
const outputPath = path.join(reportDir, 'search-console-latest.json')
const credentialsFile = process.env.SEARCH_CONSOLE_CREDENTIALS_FILE?.trim()
  || '/root/.config/ai-knowledgepoints/google-search-console-service-account.json'
const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL?.trim() || 'sc-domain:ai-knowledgepoints.cn'
const explicitToken = process.env.SEARCH_CONSOLE_ACCESS_TOKEN?.trim()
const required = process.env.SEARCH_CONSOLE_REQUIRED === 'true'

await fs.mkdir(reportDir, { recursive: true, mode: 0o700 })

const save = async (report) => {
  const temporary = `${outputPath}.${process.pid}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(temporary, outputPath)
  await fs.chmod(outputPath, 0o600)
}

const hasCredentials = explicitToken || await fs.access(credentialsFile).then(() => true).catch(() => false)
if (!hasCredentials) {
  await save({
    version: 1,
    status: 'unconfigured',
    generatedAt: new Date().toISOString(),
    property: siteUrl,
    requirement: '为服务账号启用 Search Console API，并给目标 property 授予读取权限。',
  })
  console.log(`Search Console 尚未配置；已记录私有状态：${outputPath}`)
  if (required) process.exitCode = 1
} else {
  try {
    let accessToken = explicitToken
    if (!accessToken) {
      const mode = (await fs.stat(credentialsFile)).mode & 0o777
      if ((mode & 0o077) !== 0) throw new Error('Search Console 凭据文件权限必须为 600。')
      const auth = new GoogleAuth({
        keyFile: credentialsFile,
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      })
      const client = await auth.getClient()
      const tokenResult = await client.getAccessToken()
      accessToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token
    }

    const range = finalizedDateRange()
    const report = await fetchSearchConsoleReport({ accessToken, siteUrl, ...range })
    await save(report)
    console.log(`Search Console 私有数据已更新：${report.summary.clicks} 点击 / ${report.summary.impressions} 曝光。`)
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
    await save({
      version: 1,
      status: 'error',
      generatedAt: new Date().toISOString(),
      property: siteUrl,
      error: message,
    })
    console.error(`Search Console 数据更新失败：${message}`)
    if (required) process.exitCode = 1
  }
}
