#!/usr/bin/env node

import process from 'node:process'
import { checkProductionHealth } from './lib/production-health.mjs'

const report = await checkProductionHealth({
  baseUrl: process.env.PRODUCTION_BASE_URL || 'https://ai-knowledgepoints.cn',
  expectedCommit: process.env.EXPECTED_COMMIT || '',
  timeoutMs: Number(process.env.PRODUCTION_HEALTH_TIMEOUT_MS || 20_000),
})

console.log(JSON.stringify(report))
if (report.status !== 'healthy') process.exitCode = 1
