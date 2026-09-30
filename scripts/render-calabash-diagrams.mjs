import fs from 'node:fs/promises'
import path from 'node:path'

// Original explanatory vector layouts. No character stills or external assets.
const output = path.resolve('public/images/articles/calabash-agents-commentary')
const colors = {
  blue: ['#EAF7FF', '#70B8EC', '#165DA2'],
  teal: ['#E9FBF8', '#68C8C0', '#146E73'],
  red: ['#FFF2F2', '#E999A2', '#AC3345'],
}
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const text = (x, y, value, size = 26, fill = '#576574', anchor = 'start', weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(value)}</text>`
const arrow = (d, red = false) => `<path d="${d}" fill="none" stroke="${red ? '#C96A77' : '#A1ADB8'}" stroke-width="2" ${red ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#${red ? 'red-arrow' : 'arrow'})"/>`
const card = (x, y, w, h, kind) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${colors[kind][0]}" stroke="${colors[kind][1]}" stroke-width="1.5"/>`
const ribbon = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#FFFAE7" stroke="#EDDB90" stroke-width="1.3"/>`
function svg(width, height, title, description, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
<title id="title">${esc(title)}</title><desc id="description">${esc(description)}</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1 L7 4 L1 7" fill="none" stroke="#A1ADB8" stroke-width="1.5"/></marker><marker id="red-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1 L7 4 L1 7" fill="none" stroke="#C96A77" stroke-width="1.5"/></marker></defs>
<rect width="${width}" height="${height}" fill="#FFFFFF"/>
<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="18" fill="none" stroke="#B7C0C8" stroke-dasharray="6 6"/>
<g font-family="Noto Sans CJK SC, PingFang SC, Microsoft YaHei, sans-serif">${content}</g>
</svg>\n`
}
const experts = [
  ['大娃', '力大无穷'], ['二娃', '千里眼 · 顺风耳'], ['三娃', '铜头铁臂'],
  ['四娃', '喷火'], ['五娃', '控水'], ['六娃', '隐身'], ['七娃', '宝葫芦'],
]
const capabilityDescription = '七兄弟各有本领。能力清单不会自动决定任务如何分解、情报如何共享、失败如何回退和结果由谁验收。作者借角色设定说明协作问题，不是模型内部专家结构图。'
const capabilityWide = [
  text(540, 68, '七种本事，缺一张协作单', 42, '#2387DE', 'middle', 600),
  text(540, 115, '协作类比，非 MoE 模型结构', 26, '#79838D', 'middle'),
  ...experts.flatMap(([name, power], i) => {
    const x = 48 + (i % 2) * 280
    const y = 154 + Math.floor(i / 2) * 122
    return [card(x, y, 260, 104, 'blue'), text(x + 24, y + 39, name, 29, colors.blue[2], 'start', 600), text(x + 24, y + 79, power, 26)]
  }),
  text(458, 565, '单项能力齐全', 28, colors.blue[2], 'middle', 500),
  text(458, 608, '协作仍要设计', 26, '#79838D', 'middle'),
  arrow('M600 386 H661'),
  card(674, 240, 358, 334, 'teal'),
  text(704, 286, '谁来把它们接起来？', 30, colors.teal[2], 'start', 600),
  text(704, 342, '任务拆解 · 条件调度', 26),
  text(704, 396, '共享情报 · 明确交接', 26),
  text(704, 450, '失败回退 · 及时止损', 26),
  text(704, 504, '统一目标 · 最后验收', 26),
  ribbon(48, 682, 984, 70),
  text(540, 726, '能力表写得再满，也不会自己长出配合。', 29, '#986319', 'middle', 500),
].join('')
const capabilityMobile = [
  text(270, 62, '七种本事，', 36, '#2387DE', 'middle', 600),
  text(270, 108, '缺一张协作单', 36, '#2387DE', 'middle', 600),
  text(270, 153, '协作类比，非 MoE 模型结构', 25, '#79838D', 'middle'),
  ...experts.flatMap(([name, power], i) => {
    const x = 36 + (i % 2) * 240
    const y = 189 + Math.floor(i / 2) * 124
    const lines = power.includes(' · ') ? ['千里眼 · 顺风耳'] : [power]
    return [card(x, y, 228, 108, 'blue'), text(x + 20, y + 40, name, 29, colors.blue[2], 'start', 600), text(x + 20, y + 82, lines[0], 24)]
  }),
  text(390, 601, '本领齐全', 28, colors.blue[2], 'middle', 500),
  text(390, 643, '配合待补', 26, '#79838D', 'middle'),
  arrow('M270 684 V724'),
  card(36, 738, 468, 272, 'teal'),
  text(64, 786, '谁来把它们接起来？', 31, colors.teal[2], 'start', 600),
  text(64, 836, '任务拆解 · 条件调度', 28),
  text(64, 881, '共享情报 · 明确交接', 28),
  text(64, 926, '失败回退 · 及时止损', 28),
  text(64, 971, '统一目标 · 最后验收', 28),
  ribbon(36, 1044, 468, 114),
  text(270, 1087, '能力表写得再满，', 29, '#986319', 'middle', 500),
  text(270, 1132, '也不会自己长出配合。', 29, '#986319', 'middle', 500),
].join('')

const handoffDescription = '作者假想的救援协作方案：二娃发现风险，把含来源、时间和未知项的情报交给下一位。出发前确认信息，调整计划后执行，再按爷爷是否安全回来验收。路线变化或失败要反馈给交接与确认环节。不是动画剧情复述或实测结果。'
const handoffWide = [
  text(540, 68, '看见了 → 传到了 → 用上了', 40, '#2387DE', 'middle', 600),
  text(540, 114, '假想的协作方案，不是剧情复述或实测结果', 26, '#79838D', 'middle'),
  ...[['看见了', '侦察发现风险', '位置 · 时间 · 未知项'], ['传到了', '带来源交接', '目标 · 证据 · 已知的坑'], ['用上了', '出发前确认', '按新情报调整计划']].flatMap(([label, step, note], i) => {
    const x = 48 + i * 352
    return [card(x, 182, 280, 198, i === 1 ? 'teal' : 'blue'), text(x + 140, 230, label, 32, colors[i === 1 ? 'teal' : 'blue'][2], 'middle', 600), text(x + 140, 286, step, 29, '#576574', 'middle'), text(x + 140, 339, note, 24, '#79838D', 'middle')]
  }),
  arrow('M336 280 H390'), arrow('M688 280 H742'),
  arrow('M892 388 V470'),
  card(752, 484, 280, 158, 'blue'),
  text(892, 535, '执行', 32, colors.blue[2], 'middle', 600),
  text(892, 589, '按确认的方案行动', 27, '#576574', 'middle'),
  arrow('M742 563 H690'),
  card(450, 484, 230, 158, 'teal'),
  text(565, 535, '验收', 32, colors.teal[2], 'middle', 600),
  text(565, 589, '爷爷安全回来了吗？', 24, '#576574', 'middle'),
  card(48, 484, 280, 158, 'red'),
  text(188, 533, '路线变化 / 失败', 28, colors.red[2], 'middle', 600),
  text(188, 586, '把原因交回去', 27, '#576574', 'middle'),
  arrow('M440 563 H338', true),
  text(389, 542, '未达成时', 24, '#A45461', 'middle'),
  arrow('M188 476 V430 H540 V390', true),
  '<rect x="235" y="405" width="219" height="44" fill="#FFFFFF"/>',
  text(344, 435, '更新情报，再确认', 24, '#A45461', 'middle'),
  ribbon(48, 714, 984, 112),
  text(540, 758, '救援不是把任务全部打勾。', 29, '#986319', 'middle', 500),
  text(540, 802, '要让下一步用得上上一步，最后核对共同目标。', 29, '#986319', 'middle', 500),
].join('')
const handoffMobile = [
  text(270, 62, '看见了 → 传到了', 35, '#2387DE', 'middle', 600),
  text(270, 108, '→ 用上了', 35, '#2387DE', 'middle', 600),
  text(270, 154, '假想方案，非剧情或实测', 25, '#79838D', 'middle'),
  ...[['看见了：侦察发现', '位置 · 时间 · 未知项'], ['传到了：带来源交接', '目标 · 证据 · 已知的坑'], ['用上了：出发前确认', '按新情报调整计划'], ['执行', '按确认的方案行动'], ['验收', '爷爷安全回来了吗？']].flatMap(([label, note], i) => {
    const y = 200 + i * 176
    return [card(80, y, 404, 130, i % 2 ? 'teal' : 'blue'), text(104, y + 48, label, 28, colors[i % 2 ? 'teal' : 'blue'][2], 'start', 600), text(104, y + 97, note, 27), ...(i < 4 ? [arrow(`M282 ${y + 138} V${y + 166}`)] : [])]
  }),
  arrow('M282 1042 V1080', true),
  text(316, 1068, '未达成时', 24, '#A45461'),
  card(80, 1094, 404, 142, 'red'),
  text(104, 1143, '路线变化 / 失败', 29, colors.red[2], 'start', 600),
  text(104, 1194, '带着原因，更新后再确认', 27),
  arrow('M72 1165 H36 V441 H72', true),
  '<rect x="20" y="647" width="32" height="171" fill="#FFFFFF"/>',
  ...['反', '馈', '与', '更', '新'].map((word, i) => text(36, 674 + i * 34, word, 25, '#A45461', 'middle')),
  ribbon(36, 1280, 468, 156),
  text(270, 1325, '下一步用得上上一步，', 28, '#986319', 'middle', 500),
  text(270, 1370, '最后核对共同目标，', 28, '#986319', 'middle', 500),
  text(270, 1412, '而不是只把任务打勾。', 28, '#986319', 'middle', 500),
].join('')

await fs.mkdir(output, { recursive: true })
for (const [filename, width, height, title, desc, content] of [
  ['capabilities-and-coordination.svg', 1080, 782, '七种本事，缺一张协作单', capabilityDescription, capabilityWide],
  ['capabilities-and-coordination-mobile.svg', 540, 1190, '七种本事，缺一张协作单', capabilityDescription, capabilityMobile],
  ['isolated-vs-coordinated.svg', 1080, 864, '看见了 → 传到了 → 用上了', handoffDescription, handoffWide],
  ['isolated-vs-coordinated-mobile.svg', 540, 1470, '看见了 → 传到了 → 用上了', handoffDescription, handoffMobile],
]) {
  await fs.writeFile(path.join(output, filename), svg(width, height, title, desc, content))
  console.log(`Rendered ${filename}: ${width}×${height}`)
}
