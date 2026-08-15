import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { classifyTrafficSource } from '../../src/lib/traffic-source.mjs'

const projectDir = process.cwd()
const file = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-tracking-links.json')
const config = JSON.parse(await fs.readFile(file, 'utf8'))

assert.equal(config.version, 1)
assert.equal(config.campaignId, 'ai-native-generation-30d')
assert.equal(config.status, 'hold_until_course_page_public')
assert.match(config.guardrail, /公开返回 200/)

const expected = {
  wechat: 'campaign:wechat/owned/ai-native-generation-30d',
  csdn: 'campaign:csdn/organic/ai-native-generation-30d',
  x: 'campaign:x/social/ai-native-generation-30d',
  toutiao: 'campaign:toutiao/organic/ai-native-generation-30d',
  zsxq: 'campaign:zsxq/community/ai-native-generation-30d',
  direct_qr: 'campaign:offline/qr/ai-native-generation-30d',
}
const urls = new Set()
for (const [channel, rawUrl] of Object.entries(config.links)) {
  const url = new URL(rawUrl)
  assert.equal(url.origin, 'https://ai-knowledgepoints.cn')
  assert.equal(url.pathname, '/ai-native-generation')
  assert.equal(url.searchParams.get('utm_campaign'), config.campaignId)
  assert.ok(url.searchParams.get('utm_source'))
  assert.ok(url.searchParams.get('utm_medium'))
  assert.equal(urls.has(rawUrl), false, `${channel} 链接重复`)
  urls.add(rawUrl)
  assert.equal(classifyTrafficSource({
    utmSource: url.searchParams.get('utm_source'),
    utmMedium: url.searchParams.get('utm_medium'),
    utmCampaign: url.searchParams.get('utm_campaign'),
  }), expected[channel])
}

assert.ok(config.privacy.some((item) => item.includes('不保存原始 IP')))
assert.ok(config.privacy.some((item) => item.includes('儿童自测答案')))

console.log('campaign tracking link tests passed')
