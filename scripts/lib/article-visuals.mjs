export function renderCoverSvg({ title, kicker }) {
  const cleanTitle = cleanLine(title)
  const titleLineLength = balancedLineLength(cleanTitle, 19, 3)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="383" viewBox="0 0 900 383"><rect width="900" height="383" fill="#102A43"/><circle cx="815" cy="-5" r="210" fill="#1C4565"/><circle cx="815" cy="-5" r="145" fill="none" stroke="#5B88AB" stroke-opacity=".38" stroke-width="2"/><text x="62" y="62" font-family="Arial,sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="#78A7CC">${escapeXml(cleanLine(kicker || 'AI NATIVE GENERATION'))}</text>${svgTextLines(cleanTitle, 62, 132, 43, titleLineLength, '#FFFFFF', 55, 3, 760)}<rect x="62" y="319" width="68" height="5" rx="2.5" fill="#5EA2D4"/><text x="148" y="329" font-family="Arial,sans-serif" font-size="16" fill="#BFD1E0">芝士AI吃鱼 · 深度观察</text></svg>`
}

export const FIGURE_KINDS = Object.freeze(['flow', 'comparison', 'matrix', 'bars'])

export function validateFigureSet(figures, { headingCount = 10 } = {}) {
  if (!Array.isArray(figures) || figures.length !== 4) throw new Error('必须提供 4 张信息图。')
  const positions = new Set()
  const kinds = new Set()

  for (const figure of figures) {
    if (!FIGURE_KINDS.includes(figure?.kind)) {
      throw new Error('信息图只允许 flow、comparison、matrix、bars；严禁文字卡片或句子海报。')
    }
    kinds.add(figure.kind)
    if (!Number.isInteger(figure.afterSection) || figure.afterSection < 1 || figure.afterSection > headingCount) {
      throw new Error('信息图章节位置无效。')
    }
    if (positions.has(figure.afterSection)) throw new Error('信息图章节位置不能重复。')
    positions.add(figure.afterSection)
    if (!cleanLine(figure.title) || !cleanLine(figure.subtitle) || !cleanLine(figure.caption)) {
      throw new Error('每张信息图必须有标题、解释和分析边界。')
    }
    if (!/(来源|作者分析|分析框架|非实测|示意)/.test(cleanLine(figure.caption))) {
      throw new Error('图注必须说明来源或明确标注“作者分析/非实测/示意”，避免伪造数据。')
    }
    if (!Array.isArray(figure.items) || figure.items.length < 3 || figure.items.length > 6) {
      throw new Error('每张信息图需要 3–6 个项目。')
    }

    for (const item of figure.items) {
      if (!cleanLine(item?.label)) throw new Error('信息图项目缺少短标签。')
      if (figure.kind === 'comparison' && (!cleanLine(item.left) || !cleanLine(item.right))) {
        throw new Error('comparison 的每个项目必须同时提供 left 与 right，形成明确对照。')
      }
      if (figure.kind === 'matrix') {
        if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || item.x < 0 || item.x > 100 || item.y < 0 || item.y > 100) {
          throw new Error('matrix 的每个项目必须提供 0–100 的 x、y 坐标。')
        }
      }
      if (figure.kind === 'bars' && (!Number.isFinite(item.magnitude) || item.magnitude < 0 || item.magnitude > 100)) {
        throw new Error('bars 的每个项目必须提供 0–100 的 magnitude；数值必须在图注中说明口径。')
      }
    }

    if (figure.kind === 'comparison' && (!cleanLine(figure.leftLabel) || !cleanLine(figure.rightLabel))) {
      throw new Error('comparison 必须提供 leftLabel 与 rightLabel。')
    }
    if (figure.kind === 'matrix') {
      const axes = figure.axes || {}
      if (![axes.xLow, axes.xHigh, axes.yLow, axes.yHigh].every((label) => cleanLine(label))) {
        throw new Error('matrix 必须提供 xLow、xHigh、yLow、yHigh 四个轴标签。')
      }
    }
  }

  if (kinds.size < 3) throw new Error('4 张信息图至少使用 3 种不同图表结构，不能批量套用同一版式。')
  return figures
}

export function renderFigureSvg(figure, index = 0) {
  if (!FIGURE_KINDS.includes(figure?.kind)) throw new Error(`不支持的信息图类型：${figure?.kind || 'unknown'}`)
  const renderers = {
    flow: renderFlow,
    comparison: renderComparison,
    matrix: renderMatrix,
    bars: renderBars,
  }
  const body = renderers[figure.kind](figure)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5364F2"/><stop offset="1" stop-color="#7B5CF0"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#19243D" flood-opacity=".08"/></filter><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#66748C"/></marker></defs><rect width="1200" height="675" fill="#F7F7F9"/><circle cx="1110" cy="-30" r="220" fill="#6D5FF1" opacity=".055"/><rect x="48" y="42" width="1104" height="591" rx="24" fill="#FFFFFF" stroke="#DEE1E8" filter="url(#shadow)"/><rect x="48" y="42" width="7" height="591" rx="3.5" fill="url(#accent)"/><text x="82" y="82" font-family="Arial,sans-serif" font-size="13" font-weight="700" letter-spacing="2" fill="#6258DE">FIGURE ${String(index + 1).padStart(2, '0')} · ${escapeXml(figure.kind.toUpperCase())}</text>${svgTextLines(cleanLine(figure.title),82,126,29,30,'#202532',36,2,760)}${svgTextLines(cleanLine(figure.subtitle),82,188,15,62,'#6B7280',21,2)}${body}<line x1="82" y1="588" x2="1118" y2="588" stroke="#E5E7EC"/><text x="82" y="613" font-family="Arial,sans-serif" font-size="12.5" fill="#7B8190">${escapeXml(truncate(cleanLine(figure.caption), 125))}</text></svg>`
}

function renderFlow(figure) {
  const items = figure.items.slice(0, 6)
  const gap = 24
  const width = (1018 - gap * (items.length - 1)) / items.length
  return items.map((item, itemIndex) => {
    const x = 82 + itemIndex * (width + gap)
    const centerY = 357
    const arrow = itemIndex < items.length - 1
      ? `<line x1="${x + width + 5}" y1="${centerY}" x2="${x + width + gap - 7}" y2="${centerY}" stroke="#66748C" stroke-width="2.5" marker-end="url(#arrow)"/>`
      : ''
    return `<g>${arrow}<circle cx="${x + width / 2}" cy="${centerY}" r="${Math.min(74, width * .42)}" fill="${itemIndex % 2 ? '#F0EEFF' : '#EEF2FF'}" stroke="${itemIndex % 2 ? '#8A74F1' : '#6575F2'}" stroke-width="2"/><text x="${x + width / 2}" y="${centerY - 54}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#6B7280">${String(itemIndex + 1).padStart(2, '0')}</text>${svgCenteredLines(cleanLine(item.label), x + width / 2, centerY - 13, 18, 8, '#202532', 23, 2, 700)}${svgCenteredLines(cleanLine(item.value), x + width / 2, centerY + 42, 13, 10, '#6258DE', 18, 2, 700)}${svgCenteredLines(cleanLine(item.note), x + width / 2, 485, 12.5, Math.max(8, Math.floor(width / 13)), '#727887', 18, 3)}</g>`
  }).join('')
}

function renderComparison(figure) {
  const items = figure.items.slice(0, 5)
  const startY = 272
  const rowHeight = Math.min(58, 270 / items.length)
  const rows = items.map((item, index) => {
    const y = startY + index * rowHeight
    const fill = index % 2 ? '#FAFAFC' : '#F5F6FA'
    return `<g><rect x="82" y="${y}" width="1018" height="${rowHeight - 4}" rx="10" fill="${fill}"/><text x="318" y="${y + rowHeight / 2 + 3}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14.5" fill="#343946">${escapeXml(truncate(cleanLine(item.left), 22))}</text><rect x="505" y="${y + 8}" width="170" height="${rowHeight - 20}" rx="${(rowHeight - 20) / 2}" fill="#FFFFFF" stroke="#D8DCE5"/><text x="590" y="${y + rowHeight / 2 + 3}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12.5" font-weight="700" fill="#6B7280">${escapeXml(truncate(cleanLine(item.label), 12))}</text><text x="862" y="${y + rowHeight / 2 + 3}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14.5" fill="#343946">${escapeXml(truncate(cleanLine(item.right), 22))}</text></g>`
  }).join('')
  return `<g><rect x="82" y="222" width="472" height="40" rx="10" fill="#EEF2FF"/><rect x="626" y="222" width="474" height="40" rx="10" fill="#F0EEFF"/><text x="318" y="248" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#4F60D8">${escapeXml(cleanLine(figure.leftLabel))}</text><text x="862" y="248" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#6E55D8">${escapeXml(cleanLine(figure.rightLabel))}</text><line x1="590" y1="222" x2="590" y2="552" stroke="#D8DCE5" stroke-dasharray="5 7"/>${rows}</g>`
}

function renderMatrix(figure) {
  const axes = figure.axes
  const left = 190
  const top = 230
  const width = 820
  const height = 310
  const points = figure.items.slice(0, 6).map((item, index) => {
    const x = left + (Number(item.x) / 100) * width
    const y = top + height - (Number(item.y) / 100) * height
    const alignRight = x > left + width * .67
    const labelX = alignRight ? x - 14 : x + 14
    const anchor = alignRight ? 'end' : 'start'
    return `<g><circle cx="${x}" cy="${y}" r="10" fill="${index % 2 ? '#7B5CF0' : '#5364F2'}" stroke="#FFFFFF" stroke-width="4"/><text x="${labelX}" y="${y - 10}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="13.5" font-weight="700" fill="#303543">${escapeXml(truncate(cleanLine(item.label), 12))}</text><text x="${labelX}" y="${y + 10}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="11.5" fill="#747B8B">${escapeXml(truncate(cleanLine(item.note || item.value), 18))}</text></g>`
  }).join('')
  return `<g><rect x="${left}" y="${top}" width="${width / 2}" height="${height / 2}" fill="#F6F7FB"/><rect x="${left + width / 2}" y="${top}" width="${width / 2}" height="${height / 2}" fill="#F0EEFF"/><rect x="${left}" y="${top + height / 2}" width="${width / 2}" height="${height / 2}" fill="#FAFAFC"/><rect x="${left + width / 2}" y="${top + height / 2}" width="${width / 2}" height="${height / 2}" fill="#EEF2FF"/><line x1="${left}" y1="${top + height / 2}" x2="${left + width}" y2="${top + height / 2}" stroke="#C8CDD8"/><line x1="${left + width / 2}" y1="${top}" x2="${left + width / 2}" y2="${top + height}" stroke="#C8CDD8"/><line x1="${left}" y1="${top + height}" x2="${left + width}" y2="${top + height}" stroke="#66748C" stroke-width="2" marker-end="url(#arrow)"/><line x1="${left}" y1="${top + height}" x2="${left}" y2="${top}" stroke="#66748C" stroke-width="2" marker-end="url(#arrow)"/><text x="${left}" y="568" font-family="Arial,sans-serif" font-size="12" fill="#6B7280">${escapeXml(cleanLine(axes.xLow))}</text><text x="${left + width}" y="568" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#6B7280">${escapeXml(cleanLine(axes.xHigh))}</text><text x="${left - 16}" y="${top + height}" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#6B7280">${escapeXml(cleanLine(axes.yLow))}</text><text x="${left - 16}" y="${top + 9}" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#6B7280">${escapeXml(cleanLine(axes.yHigh))}</text>${points}</g>`
}

function renderBars(figure) {
  const items = figure.items.slice(0, 6)
  const maxWidth = 680
  const startY = 242
  const rowHeight = Math.min(55, 286 / items.length)
  const bars = items.map((item, index) => {
    const y = startY + index * rowHeight
    const width = Math.max(8, (Number(item.magnitude) / 100) * maxWidth)
    return `<g><text x="82" y="${y + 18}" font-family="Arial,sans-serif" font-size="13.5" font-weight="700" fill="#343946">${escapeXml(truncate(cleanLine(item.label), 14))}</text><rect x="282" y="${y}" width="${maxWidth}" height="25" rx="12.5" fill="#ECEEF3"/><rect x="282" y="${y}" width="${width}" height="25" rx="12.5" fill="${index % 2 ? '#7B5CF0' : '#5364F2'}"/><text x="${Math.min(1048, 296 + width)}" y="${y + 18}" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#505767">${escapeXml(cleanLine(item.value || `${item.magnitude}`))}</text></g>`
  }).join('')
  return `<g>${bars}<line x1="282" y1="${startY + items.length * rowHeight + 2}" x2="962" y2="${startY + items.length * rowHeight + 2}" stroke="#C8CDD8"/><text x="282" y="${startY + items.length * rowHeight + 22}" font-family="Arial,sans-serif" font-size="11.5" fill="#7B8190">低</text><text x="962" y="${startY + items.length * rowHeight + 22}" text-anchor="end" font-family="Arial,sans-serif" font-size="11.5" fill="#7B8190">高</text></g>`
}

function svgTextLines(value, x, y, fontSize, maxChars, color, lineHeight, maxLines = 2, weight = 400) {
  const wrapped = wrapText(value, maxChars)
  const lines = wrapped.slice(0, maxLines)
  return `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${color}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(index === maxLines - 1 && wrapped.length > maxLines ? `${truncate(line, Math.max(2, maxChars - 1))}…` : line)}</tspan>`).join('')}</text>`
}

function svgCenteredLines(value, x, y, fontSize, maxChars, color, lineHeight, maxLines = 2, weight = 400) {
  const wrapped = wrapText(value, maxChars)
  const lines = wrapped.slice(0, maxLines)
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${color}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(index === maxLines - 1 && wrapped.length > maxLines ? `${truncate(line, Math.max(2, maxChars - 1))}…` : line)}</tspan>`).join('')}</text>`
}

function balancedLineLength(value, maxChars, maxLines) {
  const length = [...String(value || '')].length
  const lineCount = Math.max(1, Math.min(maxLines, Math.ceil(length / maxChars)))
  return Math.max(1, Math.ceil(length / lineCount))
}

function wrapText(value, size) {
  const chars = [...String(value || '')]
  const lines = []
  while (chars.length) lines.push(chars.splice(0, size).join(''))
  return lines.length ? lines : ['']
}

function cleanLine(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim()
}

function truncate(value, maxLength) {
  const chars = [...String(value || '')]
  return chars.length > maxLength ? `${chars.slice(0, Math.max(1, maxLength - 1)).join('')}…` : chars.join('')
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  }[character]))
}
