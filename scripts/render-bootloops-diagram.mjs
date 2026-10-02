import fs from 'node:fs/promises'

const output = new URL('../public/images/articles/bootloops-verification-commentary/', import.meta.url)
const colors = { blue: ['#EAF7FF', '#70B8EC', '#165DA2'], teal: ['#E9FBF8', '#68C8C0', '#146E73'], red: ['#FFF2F2', '#E999A2', '#AC3345'] }
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const text = (x, y, value, size = 28, fill = '#576574', anchor = 'start', weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(value)}</text>`
const box = (x, y, w, h, kind) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${colors[kind][0]}" stroke="${colors[kind][1]}" stroke-width="1.5"/>`
const arrow = (d) => `<path d="${d}" fill="none" stroke="#A1ADB8" stroke-width="2" marker-end="url(#arrow)"/>`
const ribbon = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#FFFAE7" stroke="#EDDB90" stroke-width="1.5"/>`
const title = '让验收台有机会说不'
const description = '作者机制示意：候选结果与未参与拟合、独立路径得到的参考值进入事先确定的检查。核查精度稳定性，要求已知坏样本被拦下，并对照验证文件与参考数据的固定哈希。改动或检查失效要停止核查；通过只提供有限条件下的数值证据，不等于数学证明或同行评审。固定哈希用于发现改动，不代表完整权限控制。'
function svg(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">\n<title id="title">${title}</title><desc id="description">${description}</desc>\n<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1 L7 4 L1 7" fill="none" stroke="#A1ADB8" stroke-width="1.5"/></marker></defs>\n<rect width="${width}" height="${height}" fill="#FFFFFF"/><rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="18" fill="none" stroke="#B7C0C8" stroke-dasharray="6 6"/>\n<g font-family="Noto Sans CJK SC, PingFang SC, Microsoft YaHei, sans-serif">${content.join('')}</g>\n</svg>\n`
}
const wide = [
  text(540, 72, title, 43, '#2387DE', 'middle', 600),
  text(540, 121, '作者机制示意 · 聚焦留出数值验证', 27, '#79838D', 'middle'),
  box(56, 166, 448, 158, 'blue'),
  text(82, 216, 'Agent 交来的候选结果', 31, colors.blue[2], 'start', 600),
  text(82, 264, '待验证的公式、输出数值', 28),
  text(82, 305, '不能用拟合点代替留出验证', 27),
  box(576, 166, 448, 158, 'teal'),
  text(602, 216, '独立路径的参考值', 31, colors.teal[2], 'start', 600),
  text(602, 264, '使用未参与拟合的点', 28),
  text(602, 305, '追溯来源，排查共用错误', 27),
  arrow('M280 334 V370 H410 V402'), arrow('M800 334 V370 H670 V402'),
  box(56, 414, 968, 198, 'blue'),
  text(540, 465, '按事先确定的标准核对', 34, colors.blue[2], 'middle', 600),
  text(84, 516, '变更精度：结果是否稳定？', 28),
  text(586, 516, '已知坏样本：必须被拦下', 28),
  text(540, 571, '验证文件与参考数据做哈希对照，发现改动须停下核查', 28, colors.blue[2], 'middle'),
  arrow('M410 620 V650 H280 V678'), arrow('M670 620 V650 H800 V678'),
  box(56, 690, 448, 158, 'teal'),
  text(82, 739, '通过', 31, colors.teal[2], 'start', 600),
  text(82, 786, '得到有限条件下的数值证据', 28),
  text(82, 827, '强度仍依赖参考值的独立性', 27),
  box(576, 690, 448, 158, 'red'),
  text(602, 739, '发现改动 / 坏样本漏检', 30, colors.red[2], 'start', 600),
  text(602, 786, '停止，检查验收标准与实现', 28),
  text(602, 827, '固定哈希不等于权限控制', 27),
  ribbon(56, 888, 968, 90),
  text(540, 925, '数值证据 ≠ 数学证明 ≠ 同行评审', 29, '#986319', 'middle', 500),
  text(540, 960, '尺子固定了，刻度本身仍然需要审查', 27, '#986319', 'middle'),
]
const mobile = [
  text(270, 65, title, 37, '#2387DE', 'middle', 600),
  text(270, 110, '作者机制示意 · 留出数值验证', 27, '#79838D', 'middle'),
  text(270, 149, '不是独立复现实验', 27, '#79838D', 'middle'),
  box(40, 185, 460, 164, 'blue'),
  text(66, 235, 'Agent 交来的候选结果', 31, colors.blue[2], 'start', 600),
  text(66, 281, '待验证的公式、输出数值', 28),
  text(66, 323, '拟合点不能代替留出验证', 27),
  box(40, 389, 460, 164, 'teal'),
  text(66, 439, '独立路径的参考值', 31, colors.teal[2], 'start', 600),
  text(66, 485, '使用未参与拟合的点', 28),
  text(66, 527, '追溯来源，排查共用错误', 27),
  arrow('M40 267 H25 V595 H155 V623'),
  arrow('M270 561 V623'),
  box(40, 635, 460, 267, 'blue'),
  text(66, 687, '按事先确定的标准核对', 31, colors.blue[2], 'start', 600),
  text(66, 733, '变更精度：结果是否稳定？', 28),
  text(66, 779, '已知坏样本：必须被拦下', 28),
  text(66, 825, '验证文件与参考数据哈希对照', 27),
  text(66, 868, '发现改动须停下核查', 27, colors.blue[2]),
  arrow('M182 910 V944 H95 V975'), arrow('M357 910 V944 H515 V1210 H501'),
  box(40, 987, 460, 139, 'teal'),
  text(66, 1035, '通过：有限条件下的数值证据', 28, colors.teal[2], 'start', 600),
  text(66, 1082, '强度仍依赖参考值的独立性', 27),
  box(40, 1166, 460, 151, 'red'),
  text(66, 1213, '发现改动 / 坏样本漏检', 30, colors.red[2], 'start', 600),
  text(66, 1255, '停止，检查验收标准与实现', 27),
  text(66, 1297, '固定哈希不等于权限控制', 27),
  ribbon(40, 1351, 460, 151),
  text(270, 1394, '数值证据 ≠ 数学证明', 29, '#986319', 'middle', 500),
  text(270, 1438, '也不等于同行评审', 29, '#986319', 'middle', 500),
  text(270, 1480, '刻度本身仍然需要审查', 27, '#986319', 'middle'),
]
await fs.mkdir(output, { recursive: true })
await fs.writeFile(new URL('verification-gate.svg', output), svg(1080, 1010, wide))
await fs.writeFile(new URL('verification-gate-mobile.svg', output), svg(540, 1534, mobile))
