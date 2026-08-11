import assert from 'node:assert/strict'
import { renderFigureSvg, validateFigureSet } from '../lib/article-visuals.mjs'

const figures = [
  { afterSection: 1, kind: 'flow', title: '流程', subtitle: '方向', caption: '作者分析示意。', items: [{ label: 'A', value: 'a', note: 'a' }, { label: 'B', value: 'b', note: 'b' }, { label: 'C', value: 'c', note: 'c' }] },
  { afterSection: 2, kind: 'comparison', title: '对照', subtitle: '左右', leftLabel: '之前', rightLabel: '之后', caption: '作者分析框架。', items: [{ label: '速度', left: '慢', right: '快' }, { label: '判断', left: '人', right: '人机' }, { label: '反馈', left: '迟', right: '快' }] },
  { afterSection: 3, kind: 'matrix', title: '矩阵', subtitle: '双轴', axes: { xLow: '低参与', xHigh: '高参与', yLow: '低判断', yHigh: '高判断' }, caption: '作者分析矩阵，非实测数据。', items: [{ label: '一', x: 20, y: 20 }, { label: '二', x: 80, y: 80 }, { label: '三', x: 20, y: 80 }] },
  { afterSection: 4, kind: 'bars', title: '量级', subtitle: '有口径', caption: '作者分析指数，非实测数据。', items: [{ label: '一', value: '20', magnitude: 20 }, { label: '二', value: '60', magnitude: 60 }, { label: '三', value: '90', magnitude: 90 }] },
]

assert.equal(validateFigureSet(figures, { headingCount: 8 }), figures)
assert.match(renderFigureSvg(figures[0], 0), /marker-end="url\(#arrow\)"/)
assert.match(renderFigureSvg(figures[1], 1), /之前/)
assert.match(renderFigureSvg(figures[2], 2), /高参与/)
assert.match(renderFigureSvg(figures[3], 3), /width="612"/)

assert.throws(() => validateFigureSet(figures.map((figure) => ({ ...figure, kind: 'cards' })), { headingCount: 8 }), /严禁文字卡片/)
assert.throws(() => validateFigureSet(figures.map((figure) => ({ ...figure, kind: 'flow' })), { headingCount: 8 }), /至少使用 3 种/)

console.log('article visuals tests passed')
