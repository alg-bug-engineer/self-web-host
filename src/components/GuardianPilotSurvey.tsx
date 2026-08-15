'use client'

import { useState } from 'react'
import {
  GUARDIAN_SURVEY_QUESTIONS,
  GUARDIAN_SURVEY_TARGET,
  type GuardianSurveyAnswers,
} from '@/lib/guardian-survey'

type SubmissionState = 'idle' | 'submitting' | 'submitted' | 'duplicate' | 'error'

export default function GuardianPilotSurvey() {
  const [answers, setAnswers] = useState<Partial<GuardianSurveyAnswers>>({})
  const [guardianConfirmed, setGuardianConfirmed] = useState(false)
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle')
  const complete = GUARDIAN_SURVEY_QUESTIONS.every((question) => answers[question.id])

  const choose = (questionId: keyof GuardianSurveyAnswers, optionId: string) => {
    setAnswers((current) => ({ ...current, [questionId]: optionId }))
    setSubmissionState('idle')
  }

  const submit = async () => {
    if (!complete || !guardianConfirmed || submissionState === 'submitting') return
    if (navigator.doNotTrack === '1') {
      setSubmissionState('error')
      return
    }
    setSubmissionState('submitting')
    try {
      const response = await fetch('/api/analytics/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'guardian-survey',
          path: '/ai-native-generation',
          guardianConfirmed: true,
          answers,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error('submit-failed')
      setSubmissionState(result.recorded === false ? 'duplicate' : 'submitted')
    } catch {
      setSubmissionState('error')
    }
  }

  const statusText = {
    idle: '',
    submitting: '正在提交匿名汇总……',
    submitted: '已计入试运行汇总。感谢你提供一份真实家庭反馈。',
    duplicate: '本月已经收到这个浏览器的一份调研；本次没有重复计数。',
    error: '本次没有写入汇总。你仍可以继续查看公开课程，不影响其他功能。',
  }[submissionState]

  return (
    <section id="guardian-pilot-survey" className="scroll-mt-24 rounded-3xl border border-border-default bg-bg-secondary p-6 md:p-10">
      <div className="mx-auto max-w-3xl text-center">
        <p className="eyebrow">GUARDIAN PILOT SURVEY</p>
        <h2 className="mt-2 text-3xl font-bold text-text-primary">监护人匿名调研</h2>
        <p className="mt-4 leading-7 text-text-secondary">
          这 8 个选择用于决定课程先解决什么问题。目标收集 {GUARDIAN_SURVEY_TARGET} 份有效家庭反馈；没有自由文本，也不询问姓名、学校、账号、联系方式或孩子作品。
        </p>
        <p className="mt-2 text-sm leading-6 text-text-tertiary">
          提交后服务器只增加各选项的汇总计数，不保存一份可以还原到单个家庭的逐题答卷。浏览器匿名哈希按自然月变化，只用于防止同月重复计数。
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-3xl space-y-5">
        {GUARDIAN_SURVEY_QUESTIONS.map((question, questionIndex) => (
          <fieldset key={question.id} className="rounded-2xl border border-border-default bg-bg-tertiary p-5">
            <legend className="px-1 text-sm font-semibold leading-6 text-text-primary">
              {questionIndex + 1}. {question.label}
            </legend>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => {
                const selected = answers[question.id] === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => choose(question.id, option.id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      selected
                        ? 'border-accent-tertiary bg-accent-tertiary text-white'
                        : 'border-border-default bg-bg-secondary text-text-secondary hover:border-accent-tertiary/60 hover:text-text-primary'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        <label className="flex items-start gap-3 rounded-2xl border border-border-default bg-bg-tertiary p-5 text-sm leading-6 text-text-secondary">
          <input
            type="checkbox"
            checked={guardianConfirmed}
            onChange={(event) => setGuardianConfirmed(event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>我是监护人，并同意把以上固定选项匿名计入试运行汇总。我没有填写儿童姓名、学校、账号、联系方式或其他可识别信息。</span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-tertiary">
            已选择 {Object.keys(answers).length} / {GUARDIAN_SURVEY_QUESTIONS.length}
          </p>
          <button
            type="button"
            disabled={!complete || !guardianConfirmed || submissionState === 'submitting' || submissionState === 'submitted'}
            onClick={submit}
            className="btn-primary px-6 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submissionState === 'submitting' ? '正在提交' : '匿名提交调研'}
          </button>
        </div>
        {statusText && (
          <p className="rounded-xl bg-bg-tertiary px-4 py-3 text-sm leading-6 text-text-secondary" aria-live="polite">
            {statusText}
          </p>
        )}
      </div>
    </section>
  )
}
