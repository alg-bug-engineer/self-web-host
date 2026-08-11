import Link from 'next/link'
import WechatCard from '@/components/WechatCard'
import { AUTHOR_NAME, AUTHOR_PROFILES, BRAND_NAME, SITE_URL } from '@/lib/site'
import profileData from '@/data/profile.json'

export const metadata = {
  title: '关于我 | 芝士AI吃鱼',
  description: '张其来（芝士AI吃鱼）：天津大学计算机硕士，先后在阿里、百度、滴滴、浪潮从事算法与人工智能研发，持续创作大模型、RAG、Agent 与 GEO 内容。',
  alternates: {
    canonical: '/about',
    types: { 'text/markdown': '/about/index.html.md' },
  },
}

const stats = [
  { number: profileData.stats.books, label: '本个人著作', icon: '📚' },
  { number: profileData.stats.csdnArticles, label: '篇 CSDN 内容', icon: '📝' },
  { number: profileData.stats.githubRepositories, label: '个 GitHub 仓库', icon: '⌘' },
  { number: profileData.stats.wechatReaders, label: '公众号读者', icon: '👥' },
]

const focusTags = [
  { label: '大语言模型', tone: 'label-blue' },
  { label: 'RAG 检索增强', tone: 'label-purple' },
  { label: 'Agent 智能体', tone: 'label-green' },
]

const career = profileData.publicIdentity.career
const verifiedWorks = profileData.verifiedWorks

const expertiseAreas = [
  { name: '大语言模型与 RAG', description: '关注检索、知识库、模型微调与生成质量，把方法放回真实数据和系统约束里讨论。', evidence: '著作、知识库项目与公开文章' },
  { name: 'Agent 与自动化', description: '关注任务分解、工具调用、评测、权限和人工接管，不把一次跑通当成稳定落地。', evidence: '工程项目、专利与工具实践' },
  { name: 'NLP 与算法工程', description: '长期从事搜索、推荐、NLP 和人工智能研发，重视从实验指标走向生产系统的过程。', evidence: career.sourceLabel },
  { name: 'AI 内容与 GEO', description: '把复杂概念写成人能读、机器也能核验和引用的文章、漫画与结构化知识。', evidence: '公众号、博客、漫画与本站机器可读内容' },
]

const timeline = [
  {
    year: '求学时代',
    title: '天津大学计算机硕士',
    description: '系统学习机器学习、深度学习理论基础',
    icon: '🎓',
    tone: 'label-blue',
  },
  {
    year: '算法研发',
    title: '阿里、百度、滴滴、浪潮',
    description: '从事搜索、推荐、NLP 与人工智能研发。',
    icon: '🚀',
    tone: 'label-purple',
  },
  {
    year: '大模型实践',
    title: '知识库、RAG 与 Agent',
    description: '参与大模型知识库等工业项目，也持续整理工程方法与边界。',
    icon: '🔬',
    tone: 'label-orange',
  },
  {
    year: '现在',
    title: '著作与持续创作',
    description: '通过著作、公众号、博客、漫画和工具，继续把复杂的 AI 问题讲清楚。',
    icon: '🎨',
    tone: 'label-green',
  },
]

const socialLinks = [
  { name: 'GitHub', url: 'https://github.com/alg-bug-engineer', icon: 'github' },
  { name: 'CSDN', url: 'https://blog.csdn.net/wwlsm_zql', icon: 'csdn' },
  { name: '掘金', url: 'https://juejin.cn/user/140380880250734', icon: 'article', note: '算法工程师' },
  { name: '51CTO', url: 'https://blog.51cto.com/u_15610758', icon: 'article', note: 'NLP / 大模型' },
  { name: '公众号', url: '/about#wechat', icon: 'wechat', note: '芝士AI吃鱼' },
]

export default function AboutPage() {
  const profileJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${SITE_URL}/about#profile`,
        url: `${SITE_URL}/about`,
        name: `${AUTHOR_NAME}（${BRAND_NAME}）`,
        mainEntity: { '@id': `${SITE_URL}/#person` },
      },
      {
        '@type': 'Person',
        '@id': `${SITE_URL}/#person`,
        name: AUTHOR_NAME,
        alternateName: BRAND_NAME,
        url: `${SITE_URL}/about`,
        sameAs: AUTHOR_PROFILES,
        jobTitle: '算法工程师与 AI 内容创作者',
        alumniOf: { '@type': 'CollegeOrUniversity', name: '天津大学' },
        knowsAbout: ['大语言模型', 'RAG', 'AI Agent', 'NLP', 'AI 工程化', 'GEO', 'Text-to-SQL'],
      },
      ...verifiedWorks.map((work) => ({
        '@type': 'CreativeWork',
        '@id': work.url,
        name: work.title,
        identifier: work.identifier,
        datePublished: work.publishedDate,
        description: work.description,
        url: work.url,
        creator: { '@id': `${SITE_URL}/#person` },
        about: ['大语言模型', '多智能体', 'Text-to-SQL'],
      })),
    ],
  }

  return (
    <div className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }} />
      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.6fr] gap-6">
        <div className="space-y-6">
          <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center text-3xl">
                🐱🤖
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-text-primary">芝士AI吃鱼</h1>
                  <span className="label label-green">持续创作</span>
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  天大计算机硕士 · 算法与人工智能研发 · AI 技术写作者
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {focusTags.map((tag) => (
                    <span key={tag.label} className={`label ${tag.tone}`}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-text-secondary">
              🎯 用<span className="text-text-primary">爆笑漫画</span>，把 <span className="text-text-primary">AI 天书</span>讲成人话
            </p>

            <p className="mt-3 text-sm text-text-secondary">
              公开创作足迹覆盖公众号、51CTO、掘金、CSDN 与 GitHub，长期聚焦 NLP、大语言模型、RAG、Agent 和 AI 工程实践。
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {socialLinks.map((link) => {
                const isExternal = link.url.startsWith('http');
                const linkProps = isExternal
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {};

                return (
                  <a
                    key={link.name}
                    href={link.url}
                    className="flex flex-col gap-1 rounded-md border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary hover:border-accent-tertiary"
                    title={link.note || link.name}
                    data-analytics-event={link.name === 'GitHub' ? 'visit_github' : undefined}
                    data-analytics-target={link.name === 'GitHub' ? 'about-profile' : undefined}
                    {...linkProps}
                  >
                    <span className="flex items-center gap-2 text-text-primary">
                      {link.icon === 'github' && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                      )}
                      {link.icon === 'csdn' && (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2zm5 8h-2v-4h-2v-2h4v6z" />
                        </svg>
                      )}
                      {link.icon === 'wechat' && (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z" />
                        </svg>
                      )}
                      <span>{link.name}</span>
                    </span>
                    {link.note && <span className="text-xs text-text-tertiary">{link.note}</span>}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">数据一览</h2>
            <div className="grid grid-cols-2 gap-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-tertiary px-4 py-3"
                >
                  <div className="text-2xl">{stat.icon}</div>
                  <div>
                    <div className="text-xl font-semibold text-text-primary">{stat.number}</div>
                    <div className="text-xs text-text-secondary">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-text-tertiary">
              GitHub 仓库数于 {profileData.githubVerifiedAt} 通过公开 API 核对；职业履历与专业成果于 {profileData.publicEvidenceVerifiedAt} 通过公开作者简介和专利文本交叉核验。著作、CSDN 内容数和公众号读者数来自作者资料。
            </p>
          </div>

          <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Public Evidence</p>
                <h2 className="mt-2 text-lg font-semibold text-text-primary">公开可核验的专业成果</h2>
              </div>
              <span className="label label-green">已核验</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-text-secondary">{career.summary}</p>
            <a
              href={career.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-xs text-accent-tertiary hover:underline"
            >
              来源：{career.sourceLabel} ↗
            </a>
            <div className="mt-5 space-y-3">
              {verifiedWorks.map((work) => (
                <article key={work.identifier} className="rounded-xl border border-border-default bg-bg-tertiary p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="label label-blue">{work.status}</span>
                    <span className="text-xs text-text-tertiary">{work.identifier} · {work.publishedDate}</span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold leading-6 text-text-primary">{work.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{work.description}</p>
                  <a
                    href={work.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex text-xs font-medium text-accent-tertiary hover:underline"
                  >
                    查看{work.sourceLabel} ↗
                  </a>
                </article>
              ))}
            </div>
          </div>

        </div>

        <div className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">我的故事</h2>
            <p className="mt-1 text-sm text-text-secondary">把复杂的 AI 知识讲清楚、讲有趣，是我一直在做的事。</p>
          </div>

          <p className="text-sm text-text-secondary">
            大家好，我是<span className="text-text-primary font-semibold">芝士AI吃鱼</span>。
          </p>

          <p className="text-sm text-text-secondary">
            从天津大学计算机硕士毕业后，我先后在<span className="text-text-primary font-semibold">阿里、百度、滴滴、浪潮</span>
            从事算法与人工智能研发，参与搜索、推荐、NLP 和大模型知识库等工业项目，见证了 AI 从「实验室黑科技」变成「人人可用的工具」。
          </p>

          <p className="text-sm text-text-secondary">
            大模型开始进入实际应用后，我把更多时间放在 RAG、Agent、模型微调和 AI 工程化上，也开始重新整理这些技术应该怎样讲给人听。
          </p>

          <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
            <p className="text-sm font-semibold text-text-primary">🤔 一个小问题</p>
            <p className="mt-2 text-sm text-text-secondary">
              很多人想学 AI，却被论文里的公式、代码里的术语劝退了。Transformer、Attention、RAG、Agent... 听起来就很吓人。
            </p>
          </div>

          <p className="text-sm text-text-secondary">
            于是我决定做一件事：<span className="text-text-primary font-semibold">用最通俗的语言，把 AI 天书讲成人话</span>。
          </p>

          <p className="text-sm text-text-secondary">
            我创造了两个 IP 形象——<span className="text-text-primary font-semibold">🐱 高冷猫</span>代表被技术难题困扰的学习者，
            <span className="text-text-primary font-semibold">🤖 卖萌机器人</span>代表用简单方式解答问题的 AI。他们一问一答，把复杂的概念变成有趣的对话。
          </p>

          <p className="text-sm text-text-secondary">
            现在，我通过
            <Link href="/portfolio" className="text-accent-tertiary hover:underline">
              著作
            </Link>
            、
            <a
              href="https://manga.ai-knowledgepoints.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-tertiary hover:underline"
            >
              漫画
            </a>
            、
            <Link href="/blog" className="text-accent-tertiary hover:underline">
              博客
            </Link>
            、
            <a
              href="https://ci.ai-knowledgepoints.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-tertiary hover:underline"
            >
              工具
            </a>
            多种形式，帮助更多人理解和使用 AI 技术。
          </p>

          <div id="wechat" className="pt-4 scroll-mt-20">
            <WechatCard analyticsTarget="about-card" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">长期关注的问题</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {expertiseAreas.map((area) => (
              <article key={area.name} className="rounded-xl border border-border-default bg-bg-tertiary p-4">
                <h3 className="font-medium text-text-primary">{area.name}</h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{area.description}</p>
                <p className="mt-3 text-xs text-text-tertiary">相关实践：{area.evidence}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">成长轨迹</h2>
          <div className="space-y-4">
            {timeline.map((item) => (
              <div
                key={item.title}
                className="flex gap-4 rounded-xl border border-border-default bg-bg-tertiary px-4 py-4"
              >
                <div className="w-12 h-12 rounded-xl bg-bg-secondary border border-border-default flex items-center justify-center text-xl">
                  {item.icon}
                </div>
                <div className="space-y-1">
                  <span className={`label ${item.tone}`}>{item.year}</span>
                  <h3 className="text-base font-semibold text-text-primary">{item.title}</h3>
                  <p className="text-sm text-text-secondary">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">关于这对 CP</h2>
          <p className="mt-2 text-sm text-text-secondary">一个负责提问，一个负责解答。他们的对话，就是这个网站的灵魂。</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border-default bg-bg-tertiary p-6 text-center">
            <div className="text-5xl mb-3">🐱</div>
            <h3 className="text-base font-semibold text-text-primary mb-2">高冷猫</h3>
            <p className="text-sm text-text-secondary">
              代表每一个面对技术难题时一脸懵逼的你（和曾经的我）。虽然看起来高冷，其实内心充满求知欲。
            </p>
          </div>

          <div className="rounded-xl border border-border-default bg-bg-tertiary p-6 text-center">
            <div className="text-5xl mb-3">🤖</div>
            <h3 className="text-base font-semibold text-text-primary mb-2">卖萌机器人</h3>
            <p className="text-sm text-text-secondary">
              代表 AI 助手的理想形态：不是冷冰冰的工具，而是用可爱的方式帮你解决问题的伙伴。
            </p>
          </div>
        </div>
      </section>

      <section className="bg-bg-secondary border border-border-default rounded-2xl p-6 text-center space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">一起探索 AI 的世界</h2>
        <p className="text-sm text-text-secondary max-w-xl mx-auto">
          无论你是 AI 小白还是资深开发者，这里都有适合你的内容。让我们用有趣的方式，一起学习和成长。
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="https://manga.ai-knowledgepoints.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary px-6 py-3 text-sm"
          >
            🐱 看漫画学 AI
          </a>
          <Link href="/blog" className="btn-secondary px-6 py-3 text-sm">
            🤖 阅读技术博客
          </Link>
        </div>
      </section>
    </div>
  )
}
