import Link from 'next/link'
import WechatCard from '@/components/WechatCard'

export const metadata = {
  title: '关于我 | 芝士AI吃鱼',
  description: '天大计算机硕士，8年互联网大厂算法经验，专注大模型、RAG、Agent 技术布道',
}

const stats = [
  { number: '8+', label: '年算法经验', icon: '💼' },
  { number: '6000+', label: '公众号粉丝', icon: '👥' },
  { number: '2000+', label: 'CSDN 粉丝', icon: '📝' },
  { number: '100+', label: '原创文章', icon: '✍️' },
]

const focusTags = [
  { label: '大语言模型', tone: 'label-blue' },
  { label: 'RAG 检索增强', tone: 'label-purple' },
  { label: 'Agent 智能体', tone: 'label-green' },
]

const techStack = [
  { name: '大语言模型', level: 95, color: 'bg-accent-primary' },
  { name: 'RAG 检索增强', level: 90, color: 'bg-accent-primary' },
  { name: 'Agent 智能体', level: 85, color: 'bg-accent-secondary' },
  { name: '模型微调', level: 85, color: 'bg-accent-secondary' },
  { name: 'Prompt Engineering', level: 90, color: 'bg-accent-primary' },
  { name: 'Python/算法', level: 95, color: 'bg-accent-primary' },
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
    year: '职业初期',
    title: '入职互联网大厂',
    description: '在百度、阿里从事算法研发，积累工业级 AI 落地经验',
    icon: '🚀',
    tone: 'label-purple',
  },
  {
    year: '深耕算法',
    title: '算法专家',
    description: '主导多个核心算法项目，深入搜索、推荐、NLP 等领域',
    icon: '🔬',
    tone: 'label-orange',
  },
  {
    year: '大模型时代',
    title: '拥抱 LLM 浪潮',
    description: '全面转向大模型技术，深入研究 RAG、Agent、微调等方向',
    icon: '🤖',
    tone: 'label-green',
  },
  {
    year: '现在',
    title: '技术布道者',
    description: '创立「芝士AI吃鱼」，用漫画和人话把 AI 知识讲给更多人听',
    icon: '🎨',
    tone: 'label-gray',
  },
]

const awards = [
  { title: '算泥社区 MVP', org: '算泥社区', icon: '🏆' },
  { title: '社区编辑', org: '51CTO', icon: '✨' },
  { title: '博客专家', org: 'CSDN', icon: '📚' },
]

const socialLinks = [
  { name: 'GitHub', url: 'https://github.com/alg-bug-engineer', icon: 'github' },
  { name: 'CSDN', url: 'https://blog.csdn.net/wwlsm_zql', icon: 'csdn' },
  { name: '公众号', url: '#', icon: 'wechat', note: '芝士AI吃鱼' },
]

export default function AboutPage() {
  return (
    <div className="space-y-10">
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
                  <span className="label label-green">在线</span>
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  天大计算机硕士 · 8年大厂算法经验 · AI 技术布道者
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

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          </div>

          <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">社区荣誉</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {awards.map((award) => (
                <div
                  key={award.title}
                  className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-tertiary px-4 py-3"
                >
                  <div className="text-xl">{award.icon}</div>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{award.title}</div>
                    <div className="text-xs text-text-secondary">{award.org}</div>
                  </div>
                </div>
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
            从天津大学计算机硕士毕业后，我在<span className="text-text-primary font-semibold">百度</span>和
            <span className="text-text-primary font-semibold">阿里</span>从事了 8 年的算法研发工作，见证了 AI 从「实验室黑科技」变成「人人可用的工具」。
          </p>

          <p className="text-sm text-text-secondary">
            2023 年，ChatGPT 横空出世，大模型时代正式到来。我敏锐地意识到：这一次，AI 真的要改变一切了。
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
            三种形式，帮助更多人理解和使用 AI 技术。
          </p>

          <div className="pt-4">
            <WechatCard />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">技术专长</h2>
          <div className="space-y-5">
            {techStack.map((tech) => (
              <div key={tech.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-text-primary">{tech.name}</span>
                  <span className="text-text-tertiary">{tech.level}%</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-bg-tertiary border border-border-default overflow-hidden">
                  <div
                    className={`h-full ${tech.color} rounded-full transition-all duration-1000`}
                    style={{ width: `${tech.level}%` }}
                  />
                </div>
              </div>
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
