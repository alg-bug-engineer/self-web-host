import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {XMLValidator} from 'fast-xml-parser'

const root = new URL('../../', import.meta.url)
const read = path => fs.readFile(new URL(path, root), 'utf8')
const slug = 'agent-reliability-11-ordered-outbox-inbox'
const article = await read(`content/posts/${slug}.mdx`)
for (const line of ['date: 2026-10-19', 'author: 芝士AI吃鱼', 'category: tech',
  'postType: article', 'access: public', 'topicId: agent-reliability-11',
  'topicCluster: agent-reliability']) assert.ok(article.includes(line), line)
assert.match(article, /published: (true|false)/)
assert.ok(article.length > 9500, 'Substantial technical explanation')
assert.ok((article.match(/^## /gm) || []).length >= 9)
for (const phrase of ['48 项 unittest', '22 组具名场景', 'unsupported_schema', 'id_conflict',
  'sequence_conflict', 'BEGIN IMMEDIATE', '收件', '责任转移', '永久 id_conflict',
  '不表示示例 relay 已有公平调度', 'RAG 第六篇', 'AI 辅助制作']) {
  assert.ok(article.includes(phrase), phrase)
}
assert.doesNotMatch(article, /EXPERIMENT_RESULTS|SLUG_PENDING|TODO|<!--/)
for (const url of ['https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html',
  'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html',
  'https://www.sqlite.org/lang_transaction.html', 'https://www.sqlite.org/wal.html',
  '/blog/agent-reliability-01-outbox-idempotency', '/blog/agent-reliability-10-compensation-state-machine',
  '/planet', '/about#wechat']) assert.ok(article.includes(url), url)
const example = 'public/examples/agent-reliability-11/'
for (const file of ['ordered_events.py', 'test_ordered_events.py', 'run_experiment.py', 'results.json', 'README.md']) {
  assert.ok(article.includes(`/examples/agent-reliability-11/${file}`), file+' downloadable')
  assert.ok((await read(example+file)).length > 200, file+' exists')
}
const results = JSON.parse(await read(example+'results.json'))
assert.equal(Object.keys(results).length, 22)
assert.deepEqual(results.unsafe_dual_write.snapshot.outbox, [])
assert.equal(results.unsafe_dual_write.exit, 81)
assert.deepEqual(results.unsafe_dedup_without_order.view, [2, 'confirmed', 3])
const ordered = results.ordered_process_delivery_3_1_2
assert.deepEqual(ordered.after_3, {applied: 0, stop: 'gap'})
assert.deepEqual(ordered.after_1, {applied: 1, stop: 'gap'})
assert.deepEqual(ordered.after_2, {applied: 2, stop: 'idle'})
assert.deepEqual(ordered.final.projections, [['A', 3, 'released', 3, 0]])
assert.deepEqual(ordered.final.effects.map(r=>r[2]), [1,2,3])
const receipt = results.accepted_is_not_applied
assert.ok(receipt.outbox.every(r=>r[3]===1))
assert.ok(receipt.inbox.every(r=>r[3]==='pending'))
assert.deepEqual(receipt.effects, [])
const upgrade = results.schema_upgrade_replays_original
assert.deepEqual(upgrade.old_handler, {applied:1, stop:'unsupported_schema'})
assert.equal(upgrade.blocked.inbox[1][3], 'blocked')
assert.equal(upgrade.blocked.inbox[2][3], 'pending')
assert.deepEqual(upgrade.new_handler, {applied:2, stop:'idle'})
assert.deepEqual(results.gap_isolated_by_flow.processing,
  {A:{applied:1,stop:'gap'},B:{applied:3,stop:'idle'}})
const starvation = results.default_relay_conflict_can_starve
assert.deepEqual(starvation.default_relay_results, Array(3).fill('id_conflict'))
assert.ok(starvation.before_selected_relay.outbox.every(r=>r[3]===0))
assert.equal(starvation.selected_B, 'accepted')
const crashCases = Object.entries(results).filter(([name])=>name.startsWith('crash_'))
assert.equal(crashCases.length,10)
for (const [name, result] of crashCases) {
  assert.equal(result.exit,73,name)
  assert.equal(result.after_recovery.effects.length,1,name)
  assert.deepEqual(result.after_recovery.projections,[['A',1,'reserved',3,3]],name)
}
const diagrams = [...article.matchAll(/<ArticleDiagram src="([^"]+)" mobileSrc="([^"]+)"[^>]+height=\{(\d+)\} mobileHeight=\{(\d+)\}/g)]
assert.equal(diagrams.length,2)
for (const diagram of diagrams) {
  for (let i=1;i<=2;i++) {
    const svg=await read('public'+diagram[i])
    assert.equal(XMLValidator.validate(svg),true,diagram[i])
    assert.ok(svg.includes('role="img"'))
    assert.match(svg,new RegExp(`width="${i===1?1080:540}" height="${diagram[i+2]}"`))
    assert.doesNotMatch(svg,/<script|<foreignObject|https?:\/\/(?!www.w3.org)/)
    const fonts=[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1]))
    assert.ok(fonts.length>10 && Math.min(...fonts)>=(i===1?27:30))
  }
}
console.log('Ordered outbox/inbox: metadata, evidence, semantic observations, downloads and responsive diagrams passed.')
