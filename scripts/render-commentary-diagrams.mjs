import fs from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('public/images/articles/sonnet-cto-commentary')
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

const scopeDescription = '工单先解决按钮故障，再补充必要的证据与测试。未经确认的额外重构扩大了评审范围。必要的跨文件修改可以保留，增加协作也需要守住工单边界。'
const scopeWide = [
  text(540, 68, '工单怎么越做越大', 42, '#2387DE', 'middle', 600),
  text(540, 113, '必要的深入 ≠ 无关的扩张', 26, '#79838D', 'middle'),
  card(52, 154, 520, 120, 'blue'),
  text(82, 200, '修好按钮', 31, colors.blue[2], 'start', 600),
  text(82, 242, '复现故障 · 找到原因', 26),
  text(539, 198, '工单起点', 24, colors.blue[2], 'end'),
  arrow('M292 278 V290 H308 V301'),
  card(278, 308, 576, 120, 'teal'),
  text(308, 354, '补上必要的证据与测试', 30, colors.teal[2], 'start', 600),
  text(308, 396, '确需跨文件，说明理由再修改', 26),
  arrow('M536 432 V444 H554 V456', true),
  text(586, 457, '若未经确认继续加码', 24, '#A45461'),
  card(500, 466, 528, 120, 'red'),
  text(530, 512, '未经确认的额外扩张', 30, colors.red[2], 'start', 600),
  text(530, 554, '改得越多，待评审的也越多', 26),
  ribbon(52, 620, 976, 62),
  text(540, 659, '多叫几个帮手，也得守住这张工单的边界。', 27, '#986319', 'middle', 500),
].join('')
const scopeMobile = [
  text(270, 64, '工单怎么越做越大', 34, '#2387DE', 'middle', 600),
  text(270, 108, '必要的深入 ≠ 无关的扩张', 25, '#79838D', 'middle'),
  card(36, 160, 424, 178, 'blue'),
  text(64, 210, '修好按钮', 31, colors.blue[2], 'start', 600),
  text(64, 256, '复现故障 · 找到原因', 27),
  text(64, 302, '先交好这张工单', 25, colors.blue[2]),
  arrow('M246 342 V366 H270 V388'),
  card(58, 398, 424, 178, 'teal'),
  text(86, 447, '补上必要的证据与测试', 28, colors.teal[2], 'start', 600),
  text(86, 494, '确需跨文件', 27),
  text(86, 538, '说明理由再修改', 27),
  arrow('M270 580 V606 H294 V630', true),
  text(322, 609, '若继续加码', 24, '#A45461'),
  card(80, 640, 424, 178, 'red'),
  text(108, 689, '未经确认的额外扩张', 28, colors.red[2], 'start', 600),
  text(108, 736, '改得越多', 27),
  text(108, 779, '待评审的也越多', 27),
  ribbon(36, 866, 468, 110),
  text(270, 907, '多叫几个帮手，', 27, '#986319', 'middle', 500),
  text(270, 948, '也得守住这张工单的边界。', 27, '#986319', 'middle', 500),
].join('')

const costDescription = 'AI生成改动后，需要人工核对范围与风险，符合要求才能验收。需要修改时进入返工并重新评审。这是责任与流程示意，不代表各环节耗时比例。'
const costWide = [
  text(540, 68, 'AI省下的时间，去了谁身上？', 40, '#2387DE', 'middle', 600),
  text(540, 114, '生成代码之后，还有评审、返工与验收', 26, '#79838D', 'middle'),
  card(52, 185, 260, 158, 'blue'),
  text(182, 240, 'AI 生成', 32, colors.blue[2], 'middle', 600),
  text(182, 289, '写出改动', 27, '#576574', 'middle'),
  arrow('M320 265 H400'),
  card(410, 185, 260, 158, 'teal'),
  text(540, 240, '人工评审', 32, colors.teal[2], 'middle', 600),
  text(540, 289, '核对范围与风险', 26, '#576574', 'middle'),
  arrow('M678 265 H758'),
  text(719, 228, '通过', 25, '#79838D', 'middle'),
  card(768, 185, 260, 158, 'blue'),
  text(898, 240, '验收通过', 32, colors.blue[2], 'middle', 600),
  text(898, 289, '交回可接受的结果', 26, '#576574', 'middle'),
  arrow('M540 350 V402', true),
  text(568, 387, '需要修改时', 25, '#A45461'),
  card(410, 414, 400, 132, 'red'),
  text(440, 464, '必要时返工', 30, colors.red[2], 'start', 600),
  text(440, 512, '拆改动、补测试、重新检查', 26),
  arrow('M402 480 H352 V315 H400'),
  text(323, 398, '再评审', 25, '#79838D', 'end'),
  ribbon(52, 594, 976, 64),
  text(540, 635, '提效，要算到有人敢接下这份改动。', 28, '#986319', 'middle', 500),
].join('')
const costMobile = [
  text(270, 62, 'AI省下的时间，', 34, '#2387DE', 'middle', 600),
  text(270, 106, '去了谁身上？', 34, '#2387DE', 'middle', 600),
  text(270, 154, '流程示意，不代表耗时比例', 25, '#79838D', 'middle'),
  card(80, 190, 380, 134, 'blue'),
  text(108, 240, 'AI 生成', 31, colors.blue[2], 'start', 600),
  text(108, 286, '写出改动', 27),
  arrow('M270 332 V362'),
  card(80, 372, 380, 134, 'teal'),
  text(108, 422, '人工评审', 31, colors.teal[2], 'start', 600),
  text(108, 468, '核对范围与风险', 27),
  arrow('M270 514 V558', true),
  text(302, 548, '需要修改', 24, '#A45461'),
  card(80, 568, 380, 164, 'red'),
  text(108, 618, '必要时返工', 31, colors.red[2], 'start', 600),
  text(108, 663, '拆改动 · 补测试', 27),
  text(108, 704, '改完，再回到评审', 26, '#A45461'),
  arrow('M72 650 H36 V439 H72', true),
  card(80, 800, 380, 134, 'blue'),
  text(108, 850, '验收通过', 31, colors.blue[2], 'start', 600),
  text(108, 896, '交回可接受的结果', 27),
  arrow('M468 439 H504 V867 H468'),
  '<rect x="484" y="571" width="40" height="144" fill="#FFFFFF"/>',
  text(504, 602, '无', 26, '#79838D', 'middle'),
  text(504, 636, '需', 26, '#79838D', 'middle'),
  text(504, 670, '修', 26, '#79838D', 'middle'),
  text(504, 704, '改', 26, '#79838D', 'middle'),
  ribbon(36, 972, 468, 104),
  text(270, 1014, '提效，要算到有人', 27, '#986319', 'middle', 500),
  text(270, 1052, '敢接下这份改动。', 27, '#986319', 'middle', 500),
].join('')

await fs.mkdir(output, { recursive: true })
for (const [filename, width, height, title, desc, content] of [
  ['scope-staircase.svg', 1080, 712, '工单怎么越做越大', scopeDescription, scopeWide],
  ['scope-staircase-mobile.svg', 540, 1010, '工单怎么越做越大', scopeDescription, scopeMobile],
  ['handoff-cost-flow.svg', 1080, 690, 'AI省下的时间，去了谁身上？', costDescription, costWide],
  ['handoff-cost-flow-mobile.svg', 540, 1108, 'AI省下的时间，去了谁身上？', costDescription, costMobile],
]) {
  await fs.writeFile(path.join(output, filename), svg(width, height, title, desc, content))
  console.log(`Rendered ${filename}: ${width}×${height}`)
}
