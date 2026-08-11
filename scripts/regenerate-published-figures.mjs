import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { renderFigureSvg, validateFigureSet } from './lib/article-visuals.mjs'

const projectDir = process.cwd()

const articleFigureSets = [
  {
    directory: '2026-08-10-ai-native-generation-learning-ability',
    figures: [
      {
        afterSection: 1,
        kind: 'comparison',
        title: '学习入口改变后，关键环节移到了哪里',
        subtitle: 'AI 缩短信息抵达路径，但理解与校验不能被一并跳过。',
        leftLabel: '传统学习路径',
        rightLabel: 'AI 参与的学习路径',
        items: [
          { label: '任务起点', left: '课程与教材预设', right: '从即时问题出发' },
          { label: '信息获得', left: '检索、阅读、摘录', right: '模型快速生成候选解释' },
          { label: '理解形成', left: '练习后逐步建构', right: '必须回到证据与推理' },
          { label: '错误暴露', left: '作业与反馈中发现', right: '流畅答案可能掩盖错误' },
        ],
        caption: '作者分析框架；用于比较路径结构，不代表学习效果实验结果。',
      },
      {
        afterSection: 3,
        kind: 'flow',
        title: 'AI 辅助学习的有效闭环',
        subtitle: '答案只是中间产物，学习发生在追问、核验与迁移的连续动作中。',
        items: [
          { label: '定义问题', value: '明确目标', note: '写清背景与限制' },
          { label: '获得候选', value: '让 AI 解释', note: '保留多个可能答案' },
          { label: '核验来源', value: '回到原文', note: '检查证据与适用边界' },
          { label: '自己复述', value: '重建理解', note: '不用原句讲清因果' },
          { label: '迁移应用', value: '换题验证', note: '把理解用于新情境' },
        ],
        caption: '作者分析框架；流程为学习策略示意，并非单一研究模型。',
      },
      {
        afterSection: 5,
        kind: 'matrix',
        title: 'AI 参与度与学习者判断力的风险矩阵',
        subtitle: '真正的风险不只取决于用了多少 AI，还取决于人是否持续判断。',
        axes: { xLow: 'AI 参与低', xHigh: 'AI 参与高', yLow: '主动判断低', yHigh: '主动判断高' },
        items: [
          { label: '独立探究', note: '慢但能建构基础', x: 22, y: 82 },
          { label: '工具协作', note: '效率与判断并存', x: 78, y: 84 },
          { label: '机械练习', note: '参与低、反思也低', x: 24, y: 25 },
          { label: '被动复制', note: '高依赖高风险', x: 82, y: 18 },
        ],
        caption: '作者分析矩阵；坐标为关系示意，不是对学习者的实测评分。',
      },
      {
        afterSection: 7,
        kind: 'flow',
        title: 'AI 原生学习能力如何逐层形成',
        subtitle: '能力不是一组口号，而是一条从提问到承担判断责任的递进链。',
        items: [
          { label: '问题定义', value: '知道要解决什么', note: '目标、背景、约束' },
          { label: '证据判断', value: '知道为何可信', note: '来源、样本、边界' },
          { label: '解释重建', value: '能用自己的话说', note: '形成因果结构' },
          { label: '迁移检验', value: '能处理新问题', note: '脱离原答案复用' },
          { label: '责任承担', value: '为选择负责', note: '保留人的最终判断' },
        ],
        caption: '作者分析框架；展示能力递进关系，不是标准化测评量表。',
      },
    ],
  },
  {
    directory: '2026-08-11-engineering-human-override-design',
    figures: [
      {
        afterSection: 2,
        kind: 'comparison',
        title: '形式接管与有效接管的结构差异',
        subtitle: '是否有按钮并不重要，关键是人能否理解状态、及时介入并改变结果。',
        leftLabel: '形式接管',
        rightLabel: '有效接管',
        items: [
          { label: '信息', left: '只显示异常提示', right: '展示状态、依据与影响' },
          { label: '时机', left: '结果发生后通知', right: '不可逆操作前介入' },
          { label: '权限', left: '只能查看或确认', right: '可暂停、修改与转人工' },
          { label: '恢复', left: '依赖临时处置', right: '预设回滚与责任链' },
        ],
        caption: '作者分析框架；依据系统控制链要素整理，不代表统一行业标准。',
      },
      {
        afterSection: 4,
        kind: 'flow',
        title: '人工接管应嵌入完整决策链',
        subtitle: '接管不是流程末尾的一次审批，而是从异常识别到恢复复盘的闭环。',
        items: [
          { label: '触发异常', value: '规则或人员发现', note: '识别越界与不确定性' },
          { label: '补齐上下文', value: '解释当前状态', note: '展示依据与潜在影响' },
          { label: '人工判断', value: '比较行动选项', note: '确认目标和风险' },
          { label: '执行接管', value: '暂停或改道', note: '权限匹配责任' },
          { label: '恢复复盘', value: '回滚并记录', note: '反馈进入系统改进' },
        ],
        caption: '作者分析流程；用于描述高风险自动化中的监督闭环。',
      },
      {
        afterSection: 6,
        kind: 'matrix',
        title: '后果严重度与可恢复性的接管矩阵',
        subtitle: '接管强度应由错误后果和恢复难度共同决定，而不是一刀切。',
        axes: { xLow: '后果较轻', xHigh: '后果严重', yLow: '难以恢复', yHigh: '容易恢复' },
        items: [
          { label: '自动执行', note: '保留日志即可', x: 18, y: 82 },
          { label: '抽样检查', note: '监测趋势变化', x: 45, y: 68 },
          { label: '事前确认', note: '高影响但可回退', x: 80, y: 72 },
          { label: '双人接管', note: '高影响且难恢复', x: 86, y: 18 },
          { label: '人工优先', note: '低频不可逆任务', x: 58, y: 22 },
        ],
        caption: '作者分析矩阵；坐标仅用于呈现风险关系，不是实测概率或行业阈值。',
      },
      {
        afterSection: 7,
        kind: 'flow',
        title: '接管机制设计的五个连续问题',
        subtitle: '每一环缺失都会让“人工在环”退化为没有控制力的形式安排。',
        items: [
          { label: '何时触发', value: '条件', note: '异常、置信度、影响' },
          { label: '看到什么', value: '信息', note: '状态、依据、后果' },
          { label: '能做什么', value: '权限', note: '暂停、修改、转交' },
          { label: '如何恢复', value: '回滚', note: '撤销、补偿、重试' },
          { label: '谁来负责', value: '责任', note: '记录、复盘、改进' },
        ],
        caption: '作者分析框架；综合风险治理与工程控制链思路整理。',
      },
    ],
  },
]

for (const article of articleFigureSets) {
  validateFigureSet(article.figures, { headingCount: 10 })
  const outputDir = path.join(projectDir, 'public', 'images', 'articles', article.directory)
  await fs.mkdir(outputDir, { recursive: true })
  for (const [index, figure] of article.figures.entries()) {
    const output = path.join(outputDir, `figure-${String(index + 1).padStart(2, '0')}.png`)
    await sharp(Buffer.from(renderFigureSvg(figure, index))).png({ quality: 94 }).toFile(output)
  }
  console.log(`已重绘 ${article.directory} 的 ${article.figures.length} 张关系型信息图。`)
}
