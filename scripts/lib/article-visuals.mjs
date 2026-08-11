export function renderCoverSvg({ title, kicker }) {
  const cleanTitle = cleanLine(title)
  const titleLineLength = balancedLineLength(cleanTitle, 19, 3)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="383" viewBox="0 0 900 383"><rect width="900" height="383" fill="#102A43"/><circle cx="815" cy="-5" r="210" fill="#1C4565"/><circle cx="815" cy="-5" r="145" fill="none" stroke="#5B88AB" stroke-opacity=".38" stroke-width="2"/><text x="62" y="62" font-family="Arial,sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="#78A7CC">${escapeXml(cleanLine(kicker || 'AI NATIVE GENERATION'))}</text>${svgTextLines(cleanTitle, 62, 132, 43, titleLineLength, '#FFFFFF', 55, 3, 760)}<rect x="62" y="319" width="68" height="5" rx="2.5" fill="#5EA2D4"/><text x="148" y="329" font-family="Arial,sans-serif" font-size="16" fill="#BFD1E0">芝士AI吃鱼 · 深度观察</text></svg>`
}

function svgTextLines(value, x, y, fontSize, maxChars, color, lineHeight, maxLines = 2, weight = 400) {
  const wrapped = wrapText(value, maxChars)
  const lines = wrapped.slice(0, maxLines)
  return `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${color}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(index === maxLines - 1 && wrapped.length > maxLines ? `${truncate(line, Math.max(2, maxChars - 1))}…` : line)}</tspan>`).join('')}</text>`
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
