import fs from 'node:fs/promises'

const out = new URL('../public/images/articles/context-editing-commentary/', import.meta.url)
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const text = (x, y, value, size = 28, color = '#526477', anchor = 'start', weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${esc(value)}</text>`
const arrow = (x1, y1, x2, y2) => `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="#6593B9" stroke-width="3" marker-end="url(#arrow)"/>`
function card(x, y, w, h, title, lines, kind = 'blue') {
  const palette = { blue: ['#EAF5FF', '#91BDEA', '#206CB5'], green: ['#EAF8F4', '#8CC9B5', '#267769'], red: ['#FFF0F1', '#DCA6AB', '#A94C58'] }[kind]
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${palette[0]}" stroke="${palette[1]}"/>` + text(x + 24, y + 46, title, 30, palette[2], 'start', 600) + lines.map((line, i) => text(x + 24, y + 94 + 42 * i, line, 26)).join('')
}
export function render(mobile = false) {
  const width = mobile ? 540 : 1080, height = mobile ? 1450 : 1000
  let body = text(width / 2, 65, '剪工作稿，留得住来历', mobile ? 32 : 44, '#2387DE', 'middle', 600)
  body += text(width / 2, 114, '机制示意 · 不含性能数据', 26, '#7B8793', 'middle')
  if (mobile) {
    body += card(40, 150, 460, 180, '固定的任务边界', ['系统与初始任务受保护', '不进入模型的编辑区域'])
    body += arrow(270, 338, 270, 378)
    body += card(40, 395, 460, 245, '模型编辑工作上下文', ['删旧输出、压缩过程', '整理后用于下一轮输入', '通过解析与编辑门控'])
    body += arrow(270, 652, 270, 690)
    body += card(40, 705, 460, 220, '实现记录调用快照', ['每次调用的上下文留痕', '快照不等于完整审计', '以上为所核对实现'], 'green')
    body += card(40, 978, 460, 218, '本文建议：关键底稿可查', ['保留证据来源与修改来历', '整理稿不能替代原始授权', '按需要控制访问与留存'], 'red')
    body += `<rect x="40" y="1240" width="460" height="158" rx="16" fill="#FFF8DC" stroke="#E2CC75"/>`
    body += text(270, 1288, '工作记忆可以整理', 29, '#926724', 'middle', 600)
    body += text(270, 1334, '关键结论应当能追溯', 29, '#926724', 'middle', 600)
    body += text(270, 1374, '底稿无需全部挤进活跃上下文', 24, '#926724', 'middle')
  } else {
    body += card(40, 165, 1000, 170, '固定的任务边界', ['系统与初始任务受保护，不进入模型的编辑区域'])
    body += arrow(270, 346, 270, 390)
    body += card(40, 405, 460, 230, '模型编辑工作上下文', ['删旧输出、压缩过程', '整理后用于下一轮输入', '通过解析与编辑门控'])
    body += arrow(510, 512, 563, 512)
    body += card(580, 405, 460, 230, '实现记录调用快照', ['每次调用的上下文留痕', '快照不等于完整审计', '以上为所核对实现'], 'green')
    body += card(40, 680, 1000, 165, '本文建议：关键底稿可查', ['保留证据来源与修改来历；整理稿不能替代原始授权', '按需要控制访问与留存，无需把底稿全部塞回上下文'], 'red')
    body += `<rect x="40" y="885" width="1000" height="75" rx="16" fill="#FFF8DC" stroke="#E2CC75"/>`
    body += text(540, 934, '工作记忆可以整理，关键结论应当能追溯', 32, '#926724', 'middle', 600)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">剪工作稿，留得住来历</title><desc id="description">原创机制示意，非性能实验。蓝绿卡片为CLM所核对实现：系统与初始任务受保护，模型编辑工作上下文，实现保存每次调用快照。红色卡片为本文建议：关键证据来源与修改来历可追溯，整理稿不能替代原始授权，按需要控制访问和留存。未声称代码提供完整审计或安全保证。</desc><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="#6593B9"/></marker></defs><rect width="${width}" height="${height}" fill="#FFFFFF"/><g font-family="Noto Sans CJK SC, PingFang SC, Microsoft YaHei, sans-serif">${body}</g></svg>\n`
}
await fs.mkdir(out, { recursive: true })
for (const mobile of [false, true]) await fs.writeFile(new URL(`editable-workprint${mobile ? '-mobile' : ''}.svg`, out), render(mobile))
