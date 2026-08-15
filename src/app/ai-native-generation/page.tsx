import Image from 'next/image'
import Link from 'next/link'
import CoursePreviewVideo from '@/components/CoursePreviewVideo'
import FamilyAiLiteracyCheck from '@/components/FamilyAiLiteracyCheck'
import GuardianPilotSurvey from '@/components/GuardianPilotSurvey'
import { SITE_URL } from '@/lib/site'

export const metadata = {
  title: 'AI 原生一代：儿童 AI 素养家庭实践课',
  description: '面向 8—14 岁孩子及家长的四周 AI 素养试运行：理解 AI、与 AI 协作、验证输出、保护隐私，并完成一个亲子项目。',
  alternates: { canonical: '/ai-native-generation' },
  openGraph: {
    title: 'AI 原生一代：儿童 AI 素养家庭实践课',
    description: '不把 AI 当答案机器。用四周亲子实践建立理解、判断、创造和责任。',
    url: `${SITE_URL}/ai-native-generation`,
    type: 'website',
  },
}

const weeks = [
  {
    week: '第一周',
    title: '认识 AI，也认识它为什么会犯错',
    lessons: ['AI 到底是什么', '数据、模式与生成', '发现一次 AI 的流畅错误'],
  },
  {
    week: '第二周',
    title: '学会与 AI 协作，而不是把任务交出去',
    lessons: ['把问题说清楚', '把大任务拆成小步骤', '决定人和 AI 分别做什么'],
  },
  {
    week: '第三周',
    title: '验证答案，完成一次亲子研究',
    lessons: ['来源、反例与交叉检查', '保留研究过程', '从想法做到可展示作品'],
  },
  {
    week: '第四周',
    title: '建立安全边界和家庭规则',
    lessons: ['隐私、版权与虚假内容', '识别情感依赖风险', '家庭 AI 公约与项目答辩'],
  },
]

const boundaries = [
  '不收集或公开孩子的姓名、学校、住址、正脸和私人聊天。',
  '不承诺提高成绩、智力、升学或竞赛结果。',
  '不让 AI 代替家长、老师、医生和真人关系。',
  '重要结论需要回到可靠来源，孩子要能解释自己为什么相信。',
]

const previews = [
  {
    id: 'L01',
    title: 'AI 到底是什么：从生活里的预测开始',
    description: '从推荐列表、相册分类和输入法联想出发，帮助孩子辨认输入、输出与错误风险，最后完成家庭 AI 足迹任务。',
    duration: '4 分 20 秒',
    video: '/videos/courses/ai-native-generation/L01-ai-is-prediction-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L01-ai-is-prediction-v1.vtt',
    poster: '/images/courses/ai-native-generation/L01/poster.webp',
  },
  {
    id: 'L02',
    title: 'AI 为什么会回答问题：数据、模式与生成',
    description: '用接龙实验和“三个盒子”解释生成过程，区分听起来合理的表达与有来源支持的事实，再完成同一问题的三次回答实验。',
    duration: '4 分 25 秒',
    video: '/videos/courses/ai-native-generation/L02-how-generative-ai-answers-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L02-how-generative-ai-answers-v1.vtt',
    poster: '/images/courses/ai-native-generation/L02/poster.webp',
  },
  {
    id: 'L03',
    title: 'AI 为什么会一本正经地犯错',
    description: '识别数字、引语、人物经历和高影响建议四类风险断言，用“问来源—开原文—交叉检查”完成一次 AI 错误侦探任务。',
    duration: '4 分 01 秒',
    video: '/videos/courses/ai-native-generation/L03-why-ai-makes-things-up-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L03-why-ai-makes-things-up-v1.vtt',
    poster: '/images/courses/ai-native-generation/L03/poster.webp',
  },
  {
    id: 'L04',
    title: '把问题说清楚：背景、目标与限制',
    description: '用“背景—目标—限制—检查”四格卡修理一个模糊任务，让 AI 先提出澄清问题，再由孩子确认条件并保留最终判断。',
    duration: '4 分 53 秒',
    video: '/videos/courses/ai-native-generation/L04-define-the-problem-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L04-define-the-problem-v1.vtt',
    poster: '/images/courses/ai-native-generation/L04/poster.webp',
  },
  {
    id: 'L05',
    title: '把大任务拆成可以检查的小步骤',
    description: '把已经说清楚的任务拆成四到六步，为每一步写出动作、产物、检查方式和负责人，并在关键依赖处设置检查点。',
    duration: '4 分 34 秒',
    video: '/videos/courses/ai-native-generation/L05-break-work-into-checkable-steps-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L05-break-work-into-checkable-steps-v1.vtt',
    poster: '/images/courses/ai-native-generation/L05/poster.webp',
  },
  {
    id: 'L06',
    title: '人和 AI 分别擅长什么',
    description: '不背固定能力清单，而是按输入、产出、证据和错误后果做动态分工；AI 产生候选，人保留授权、核验与最终责任。',
    duration: '5 分 45 秒',
    video: '/videos/courses/ai-native-generation/L06-human-ai-division-of-responsibility-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L06-human-ai-division-of-responsibility-v1.vtt',
    poster: '/images/courses/ai-native-generation/L06/poster.webp',
  },
  {
    id: 'L07',
    title: '验证 AI：来源、反例与交叉检查',
    description: '把流畅回答拆成最小可核验断言，检查原文与适用条件，主动寻找反例，并确认第二条证据链是否真正独立。',
    duration: '6 分 33 秒',
    video: '/videos/courses/ai-native-generation/L07-source-counterexample-cross-check-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L07-source-counterexample-cross-check-v1.vtt',
    poster: '/images/courses/ai-native-generation/L07/poster.webp',
  },
  {
    id: 'L08',
    title: '用 AI 完成一次小型亲子研究',
    description: '从可观察问题出发，控制变量并保存逐次原始记录；AI 只协助候选与整理，人负责真实实验、异常、判断、局限和复现。',
    duration: '7 分 02 秒',
    video: '/videos/courses/ai-native-generation/L08-small-family-research-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L08-small-family-research-v1.vtt',
    poster: '/images/courses/ai-native-generation/L08/poster.webp',
  },
  {
    id: 'L09',
    title: '亲子共创：从研究日志到可展示作品',
    description: '用作品证据板保留问题、方法、证据、AI 取舍与局限；通过隐私、版权和授权门禁，再由孩子完成三分钟试讲。',
    duration: '6 分 54 秒',
    video: '/videos/courses/ai-native-generation/L09-family-co-creation-showcase-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L09-family-co-creation-showcase-v1.vtt',
    poster: '/images/courses/ai-native-generation/L09/poster.webp',
  },
  {
    id: 'L10',
    title: '隐私、版权与虚假内容：给家庭作品加两道门',
    description: '识别姓名之外的组合线索，先按必要性、授权、敏感程度和替代方案检查输入，再按事实、版权、生成标识和潜在伤害检查发布。',
    duration: '7 分 44 秒',
    video: '/videos/courses/ai-native-generation/L10-privacy-copyright-synthetic-content-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L10-privacy-copyright-synthetic-content-v1.vtt',
    poster: '/images/courses/ai-native-generation/L10/poster.webp',
  },
  {
    id: 'L11',
    title: '聊天机器人不是答案，也不是真人关系',
    description: '区分“像在共情”的生成语言与真实关系，识别保密、排他、延长控制和高风险建议，并练习停止对话、告诉真人和转向可靠帮助。',
    duration: '8 分 15 秒',
    video: '/videos/courses/ai-native-generation/L11-chatbot-is-not-a-relationship-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L11-chatbot-is-not-a-relationship-v1.vtt',
    poster: '/images/courses/ai-native-generation/L11/poster.webp',
  },
  {
    id: 'L12',
    title: '制定家庭 AI 公约并完成项目答辩',
    description: '把理解、协作、验证和责任写成八条可复查规则；让孩子用四分钟解释 AI 哪里可能错、自己完成了什么，以及为什么只相信结论到当前程度。',
    duration: '7 分 58 秒',
    video: '/videos/courses/ai-native-generation/L12-family-ai-agreement-and-defense-v1.mp4',
    captions: '/videos/courses/ai-native-generation/L12-family-ai-agreement-and-defense-v1.vtt',
    poster: '/images/courses/ai-native-generation/L12/poster.webp',
  },
]

export default function AiNativeGenerationPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'AI 原生一代：儿童 AI 素养家庭实践课',
    description: '面向 8—14 岁孩子及家长的四周 AI 素养试运行。',
    url: `${SITE_URL}/ai-native-generation`,
    provider: { '@id': `${SITE_URL}/#person` },
    educationalLevel: '8—14 岁亲子共同学习',
    teaches: ['理解人工智能', '人机协作', '事实核验', '隐私保护', '负责任使用人工智能'],
    isAccessibleForFree: true,
  }

  return (
    <div className="max-w-5xl mx-auto space-y-16 py-12 px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent-tertiary/10 px-3 py-1 text-sm font-medium text-accent-tertiary">
          <span className="h-2 w-2 rounded-full bg-accent-tertiary" />
          30 天试运行 · 8—14 岁亲子共同学习
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-text-primary">
          AI 原生一代
        </h1>
        <p className="text-xl md:text-2xl font-medium text-text-primary">
          孩子需要的不是更多答案，而是和 AI 一起思考的能力
        </p>
        <p className="mx-auto max-w-3xl text-base md:text-lg leading-8 text-text-secondary">
          四周里，家长和孩子一起理解 AI、拆解问题、检查答案、完成一个小项目，并制定自己的家庭 AI 使用规则。课程仍在试运行，我们会根据真实作业和反馈继续删改。
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="#family-ai-check" className="btn-primary px-8 py-3 text-lg">
            先做两分钟家庭自测
          </Link>
          <Link
            href="/planet"
            className="btn-secondary px-8 py-3 text-lg"
            data-analytics-event="ai_native_generation_interest"
            data-analytics-target="course-hero"
          >
            查看知识星球学习安排
          </Link>
          <Link href="/blog/daily-2026-08-10-ai-native-generation-learning-ability" className="btn-secondary px-8 py-3 text-lg">
            先读公开文章
          </Link>
        </div>
        <figure className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-3xl border border-border-default bg-bg-secondary shadow-xl">
          <Image
            src="/images/campaigns/ai-native-generation-30d/ai-native-generation-family-ai-hero.webp"
            alt="家长与孩子共同观察问题、核验、安全和创意图标的课程插画"
            width={1536}
            height={2048}
            priority
            className="aspect-[16/9] w-full object-cover object-center"
          />
          <figcaption className="px-5 py-3 text-left text-xs leading-5 text-text-tertiary">
            课程主视觉为生成式插画，不代表真实学员或课程效果。
          </figcaption>
        </figure>
      </section>

      <FamilyAiLiteracyCheck />

      <GuardianPilotSurvey />

      <section className="grid gap-5 md:grid-cols-2">
        {weeks.map((item) => (
          <article key={item.week} className="rounded-2xl border border-border-default bg-bg-secondary p-6">
            <p className="eyebrow">{item.week}</p>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">{item.title}</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-text-secondary">
              {item.lessons.map((lesson) => <li key={lesson}>• {lesson}</li>)}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-border-default bg-bg-secondary p-8 md:p-12">
        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow">HOW IT WORKS</p>
            <h2 className="mt-2 text-3xl font-bold text-text-primary">课程怎样发生</h2>
            <p className="mt-4 leading-7 text-text-secondary">
              每周三节短视频、一个亲子任务和一次集中答疑。作业不比谁生成得更漂亮，而是看孩子能否说明问题、证据、修改过程和最终判断。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['12 节', '4—9 分钟核心微课'],
              ['4 个', '可以在家完成的亲子项目'],
              ['4 次', '集中答疑与作品点评'],
              ['1 份', '共同协商的家庭 AI 公约'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-border-default bg-bg-tertiary p-5">
                <div className="text-2xl font-semibold text-text-primary">{value}</div>
                <div className="mt-1 text-sm text-text-secondary">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="public-previews" className="scroll-mt-24 space-y-8">
        <div className="text-center">
          <p className="eyebrow">PUBLIC PREVIEWS</p>
          <h2 className="mt-2 text-3xl font-bold text-text-primary">当前公开试听</h2>
          <p className="mx-auto mt-3 max-w-2xl leading-7 text-text-secondary">
            每节保留一个核心判断动作和一个可在家完成的亲子任务。视频配有中文字幕。
          </p>
        </div>
        <div className="grid gap-7 md:grid-cols-2">
          {previews.map((preview) => (
            <article key={preview.id} className="overflow-hidden rounded-3xl border border-border-default bg-bg-secondary shadow-xl">
              <CoursePreviewVideo
                lessonId={preview.id}
                src={preview.video}
                captions={preview.captions}
                poster={preview.poster}
                title={preview.title}
              />
              <div className="p-6">
                <p className="eyebrow">{preview.id} · {preview.duration}</p>
                <h3 className="mt-2 text-2xl font-bold text-text-primary">{preview.title}</h3>
                <p className="mt-3 leading-7 text-text-secondary">{preview.description}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="text-center">
          <p className="text-sm leading-6 text-text-tertiary">
            片头和人物场景为即梦生成式插画，不是真实学员，也不用于证明课程效果。
          </p>
          <Link
            href="/planet"
            className="btn-primary mt-5 inline-flex px-6 py-3"
            data-analytics-event="ai_native_generation_interest"
            data-analytics-target="course-preview"
          >
            领取亲子任务与参与答疑
          </Link>
        </div>
      </section>

      <section className="space-y-6">
        <div className="text-center">
          <p className="eyebrow">SAFETY FIRST</p>
          <h2 className="mt-2 text-3xl font-bold text-text-primary">先把边界说清楚</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {boundaries.map((boundary) => (
            <div key={boundary} className="flex gap-3 rounded-xl border border-border-default bg-bg-secondary p-5">
              <span aria-hidden="true" className="text-accent-tertiary">✓</span>
              <p className="text-sm leading-6 text-text-secondary">{boundary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-border-default bg-bg-secondary p-8 text-center md:p-12">
        <h2 className="text-3xl font-bold text-text-primary">十二节试听完成以后，由监护人选择下一步</h2>
        <p className="mx-auto mt-4 max-w-2xl leading-7 text-text-secondary">
          可以进入知识星球完成任务、答疑和去标识化作品反馈；也可以由监护人单独表达课程内测意向，或者继续观察。孩子的自测和答辩结果不用于决定付费资格。
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-4">
          <Link
            href="/planet"
            className="btn-primary px-7 py-3"
            data-analytics-event="ai_native_generation_interest"
            data-analytics-target="course-bottom"
          >
            参加知识星球共学
          </Link>
          <Link
            href="#guardian-beta-intake"
            className="btn-secondary px-7 py-3"
            data-analytics-event="course_beta_guardian_interest"
            data-analytics-target="course-bottom"
          >
            监护人登记课程内测意向
          </Link>
          <Link href="/blog" className="px-7 py-3 text-sm font-medium text-text-secondary hover:text-text-primary">
            先继续观察
          </Link>
        </div>
        <p className="mx-auto mt-5 max-w-2xl text-xs leading-5 text-text-tertiary">
          意向入口只面向监护人；本站只记录匿名点击事件，不接收联系方式，也不收集儿童作业、答辩评分或声音。
        </p>
      </section>

      <section id="guardian-beta-intake" className="scroll-mt-24 rounded-3xl border border-accent-tertiary/30 bg-accent-tertiary/5 p-8 md:p-12">
        <p className="eyebrow">GUARDIAN-ONLY INTAKE</p>
        <h2 className="mt-2 text-3xl font-bold text-text-primary">课程内测意向，由监护人完成三步</h2>
        <p className="mt-4 max-w-3xl leading-7 text-text-secondary">
          当前只登记意向，不收取课程内测费用。加入知识星球不等于报名课程内测；登记意向也不代表已经获得名额或需要付款。价格、开始时间、服务周期和退款规则确定后，会在任何付款发生前单独向监护人说明并确认。
        </p>
        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {[
            ['01', '确认边界', '家中有 8—14 岁孩子，监护人愿意共同参与，并接受课程不承诺成绩、竞赛、升学或智力提升。'],
            ['02', '选择参与形式', '只选择异步任务、集中答疑或两者都可；每周少于 30 分钟也可以如实登记，不据此评价孩子能力。'],
            ['03', '由监护人私信', '通过公众号“芝士AI吃鱼”私信关键词“儿童AI内测”，再发送年龄段、每周可共同投入时间和参与偏好，不发送孩子身份与作业。'],
          ].map(([step, title, detail]) => (
            <div key={step} className="rounded-2xl border border-border-default bg-bg-secondary p-6">
              <span className="text-xs font-semibold text-accent-tertiary">STEP {step}</span>
              <h3 className="mt-2 text-lg font-semibold text-text-primary">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-text-secondary">{detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-7 rounded-2xl border border-border-default bg-bg-secondary p-6">
          <p className="text-sm font-semibold text-text-primary">建议由监护人发送这三项</p>
          <p className="mt-3 rounded-xl bg-bg-tertiary px-4 py-3 text-sm leading-6 text-text-secondary">
            儿童AI内测｜年龄段：8—10 / 11—12 / 13—14｜每周：少于 30 / 30—60 / 60—90 分钟｜参与偏好：异步任务 / 集中答疑 / 两者都可
          </p>
          <p className="mt-3 text-xs leading-5 text-text-tertiary">
            不要发送孩子姓名、学校、账号、正脸、声音、聊天、健康情况或原始作品。监护人联系账号与后续去标识化作业记录分开处理，默认不授权公开引用。
          </p>
          <Link
            href="/about#wechat"
            className="btn-primary mt-5 inline-flex px-6 py-3"
            data-analytics-event="course_beta_guardian_interest"
            data-analytics-target="guardian-intake-wechat"
          >
            查看公众号联系方式
          </Link>
        </div>
      </section>
    </div>
  )
}
