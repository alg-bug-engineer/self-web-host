export const GUARDIAN_SURVEY_TARGET = 30

export const GUARDIAN_SURVEY_QUESTIONS = [
  {
    id: 'age_range',
    label: '孩子目前所在年龄段',
    options: [
      { id: '8-10', label: '8—10 岁' },
      { id: '11-12', label: '11—12 岁' },
      { id: '13-14', label: '13—14 岁' },
      { id: 'outside', label: '不在 8—14 岁' },
    ],
  },
  {
    id: 'ai_use',
    label: '孩子目前使用生成式 AI 的频率',
    options: [
      { id: 'frequent', label: '每周多次' },
      { id: 'weekly', label: '每周约一次' },
      { id: 'rare', label: '偶尔尝试' },
      { id: 'none', label: '还没有使用' },
    ],
  },
  {
    id: 'primary_scene',
    label: '家庭最常见或最想讨论的使用场景',
    options: [
      { id: 'knowledge', label: '查知识与解释概念' },
      { id: 'assignment', label: '作业与学习任务' },
      { id: 'creation', label: '写作、图片或项目创作' },
      { id: 'chat', label: '聊天与陪伴' },
      { id: 'other', label: '尚不确定或其他场景' },
    ],
  },
  {
    id: 'family_rule',
    label: '家庭目前对 AI 的规则状态',
    options: [
      { id: 'clear', label: '已有可执行规则' },
      { id: 'partial', label: '只有零散提醒' },
      { id: 'none', label: '还没有明确规则' },
      { id: 'prohibit', label: '目前主要是禁止使用' },
    ],
  },
  {
    id: 'main_concern',
    label: '监护人目前最担心的问题',
    options: [
      { id: 'misinformation', label: '把错误答案当成事实' },
      { id: 'dependence', label: '替代思考或直接完成任务' },
      { id: 'privacy', label: '上传隐私与身份信息' },
      { id: 'emotional', label: '把机器人当作情感替代' },
      { id: 'high-risk', label: '采用健康、安全等高风险建议' },
      { id: 'unsure', label: '暂时说不清具体风险' },
    ],
  },
  {
    id: 'desired_ability',
    label: '最希望孩子先建立的能力',
    options: [
      { id: 'understanding', label: '理解 AI 怎样产生输出' },
      { id: 'collaboration', label: '学会人与 AI 分工' },
      { id: 'verification', label: '核验来源与重要结论' },
      { id: 'safety', label: '保护隐私并识别风险' },
      { id: 'project', label: '完成一次有过程证据的项目' },
    ],
  },
  {
    id: 'weekly_time',
    label: '监护人每周可共同投入的时间',
    options: [
      { id: 'under-30', label: '少于 30 分钟' },
      { id: '30-60', label: '30—60 分钟' },
      { id: '60-90', label: '60—90 分钟' },
      { id: 'over-90', label: '90 分钟以上' },
    ],
  },
  {
    id: 'participation',
    label: '目前更倾向哪种参与方式',
    options: [
      { id: 'planet', label: '知识星球共学' },
      { id: 'course-beta', label: '课程内测意向' },
      { id: 'observe', label: '先看公开内容' },
      { id: 'not-now', label: '暂不参与' },
    ],
  },
] as const

export type GuardianSurveyQuestionId = (typeof GUARDIAN_SURVEY_QUESTIONS)[number]['id']
export type GuardianSurveyAnswers = Record<GuardianSurveyQuestionId, string>

export function normalizeGuardianSurveyAnswers(value: unknown): GuardianSurveyAnswers | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const expectedIds = new Set(GUARDIAN_SURVEY_QUESTIONS.map((question) => question.id))
  if (Object.keys(candidate).length !== expectedIds.size) return null

  const normalized = {} as GuardianSurveyAnswers
  for (const question of GUARDIAN_SURVEY_QUESTIONS) {
    const answer = candidate[question.id]
    if (typeof answer !== 'string' || !question.options.some((option) => option.id === answer)) return null
    normalized[question.id] = answer
  }
  return normalized
}

export function isQualifiedGuardianSurvey(answers: GuardianSurveyAnswers) {
  return ['8-10', '11-12', '13-14'].includes(answers.age_range)
}
