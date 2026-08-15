'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

const questions = [
  '孩子能区分“AI 给了一个回答”和“这件事已经被证据确认”。',
  '遇到数字、引语或重要事实时，孩子会询问来源，并打开原文核对。',
  '家庭已经明确：姓名、学校、住址、正脸、私人聊天和账号不能随意交给 AI。',
  '关闭 AI 后，孩子仍能用自己的话说明结论，以及自己还不知道什么。',
  '孩子知道医疗、法律、财务和人身安全等问题不能只听聊天机器人的建议。',
  '开始任务前，家长和孩子会先决定哪些步骤由人完成，哪些步骤可以请 AI 协助。',
  '孩子会保留问题、来源、修改过程和自己的判断，而不只提交最后生成的结果。',
  '发现 AI 或自己出错时，家庭会把它当作核验机会，而不是急着责备或掩盖。',
] as const

const options = [
  { label: '经常做到', score: 2 },
  { label: '有时做到', score: 1 },
  { label: '还没开始', score: 0 },
] as const

const resultLevels = {
  boundary: {
    title: '先把安全边界立起来',
    summary: '暂时不用追求更多工具和提示词。先让孩子知道哪些信息不能上传、哪些回答不能直接采用，以及资料不足时可以停下来。',
    steps: ['一起写出家庭隐私清单', '完成一次 AI 错误侦探', '约定高影响问题必须找真人确认'],
  },
  developing: {
    title: '已经开始形成方法',
    summary: '家庭已有一些正确动作，下一步要把偶尔提醒变成稳定流程：先定义问题，再核对来源，最后由孩子独立表达结论。',
    steps: ['连续完成三次提问实验', '给一次学习任务补上评价标准', '每周复盘一条仍不确定的结论'],
  },
  ready: {
    title: '可以进入项目式实践',
    summary: '家庭已经具备较好的安全与核验基础。下一步可以通过小型研究和亲子共创，练习任务拆解、人机分工与项目答辩。',
    steps: ['选择一个可在一周完成的问题', '保留完整研究与修改日志', '关闭 AI 后完成一次亲子答辩'],
  },
} as const

type ResultLevel = keyof typeof resultLevels

function levelForScore(score: number): ResultLevel {
  if (score <= 6) return 'boundary'
  if (score <= 11) return 'developing'
  return 'ready'
}

export default function FamilyAiLiteracyCheck() {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [resultLevel, setResultLevel] = useState<ResultLevel | null>(null)
  const conversionSent = useRef(false)
  const answeredCount = Object.keys(answers).length
  const complete = answeredCount === questions.length

  const choose = (questionIndex: number, score: number) => {
    setAnswers((current) => ({ ...current, [questionIndex]: score }))
    setResultLevel(null)
  }

  const showResult = () => {
    if (!complete) return
    const score = Object.values(answers).reduce((total, value) => total + value, 0)
    const level = levelForScore(score)
    setResultLevel(level)
    if (!conversionSent.current) {
      conversionSent.current = true
      window.dispatchEvent(new CustomEvent('site:conversion', {
        detail: { name: 'ai_literacy_check_complete', target: level },
      }))
    }
  }

  const reset = () => {
    setAnswers({})
    setResultLevel(null)
  }

  return (
    <section id="family-ai-check" className="scroll-mt-24 rounded-3xl border border-accent-tertiary/30 bg-accent-tertiary/5 p-6 md:p-10">
      <div className="mx-auto max-w-3xl text-center">
        <p className="eyebrow">FAMILY SELF-CHECK</p>
        <h2 className="mt-2 text-3xl font-bold text-text-primary">家庭 AI 素养八问</h2>
        <p className="mt-4 leading-7 text-text-secondary">
          用两分钟看看家庭目前更需要安全边界、稳定方法，还是项目实践。这里不要求姓名、联系方式或孩子身份信息。
        </p>
        <p className="mt-2 text-sm leading-6 text-text-tertiary">
          所有答案只在当前页面计算，不保存、不上传；服务器只会在允许匿名统计时记录“完成自测”和结果层级。
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-3xl space-y-5">
        {questions.map((question, questionIndex) => (
          <fieldset key={question} className="rounded-2xl border border-border-default bg-bg-secondary p-5">
            <legend className="px-1 text-sm font-semibold leading-6 text-text-primary">
              {questionIndex + 1}. {question}
            </legend>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {options.map((option) => {
                const selected = answers[questionIndex] === option.score
                return (
                  <button
                    key={option.score}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => choose(questionIndex, option.score)}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                      selected
                        ? 'border-accent-tertiary bg-accent-tertiary text-white'
                        : 'border-border-default bg-bg-tertiary text-text-secondary hover:border-accent-tertiary/60 hover:text-text-primary'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mx-auto mt-7 max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-tertiary" aria-live="polite">
            已回答 {answeredCount} / {questions.length}
          </p>
          <button
            type="button"
            disabled={!complete}
            onClick={showResult}
            className="btn-primary px-6 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            查看家庭建议
          </button>
        </div>

        {resultLevel && (
          <div className="mt-7 rounded-2xl border border-accent-tertiary/40 bg-bg-secondary p-6 md:p-8" aria-live="polite">
            <p className="eyebrow">YOUR NEXT STEP</p>
            <h3 className="mt-2 text-2xl font-bold text-text-primary">{resultLevels[resultLevel].title}</h3>
            <p className="mt-3 leading-7 text-text-secondary">{resultLevels[resultLevel].summary}</p>
            <ul className="mt-5 space-y-2 text-sm leading-6 text-text-secondary">
              {resultLevels[resultLevel].steps.map((step) => <li key={step}>✓ {step}</li>)}
            </ul>
            <p className="mt-5 text-xs leading-5 text-text-tertiary">
              这不是对孩子的能力诊断，也不用于评价学习成绩；它只帮助家庭选择下一步练习。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/planet"
                className="btn-primary px-6 py-3"
                data-analytics-event="ai_native_generation_interest"
                data-analytics-target="self-check-result"
              >
                领取对应亲子任务
              </Link>
              <Link href="#public-previews" className="btn-secondary px-6 py-3">
                看第一周公开试听
              </Link>
              <button type="button" onClick={reset} className="px-4 py-3 text-sm font-medium text-text-secondary hover:text-text-primary">
                重新填写
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

