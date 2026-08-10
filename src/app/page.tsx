import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import Link from 'next/link'
import AppCard from '@/components/AppCard'
import { getSettings } from '@/lib/admin-storage'
import { getTopPaths } from '@/lib/analytics-storage'

export const dynamic = 'force-dynamic'

const contentTracks = [
    {
        title: '漫画学 AI',
        description: '把抽象概念变成角色、场景和对话。',
        href: 'https://manga.ai-knowledgepoints.cn',
        label: '轻松入门',
    },
    {
        title: 'RAG / Agent 实战',
        description: '从原理、代码到可上线的工程方案。',
        href: '/blog',
        label: '深度实践',
    },
    {
        title: '独立产品实验',
        description: '公开记录 AI 产品从想法到落地的过程。',
        href: '/portfolio',
        label: '边做边学',
    },
];

export default async function Home() {
    const settings = await getSettings();
    const posts = allPosts
        .filter((post) => post.published)
        .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)));

    const weeklyTopPaths = await getTopPaths({ days: 7, prefix: '/blog/', limit: 5 });
    const weeklyViews = new Map(weeklyTopPaths.map((item) => [item.pathname, item.views]));
    const rankedPosts = weeklyTopPaths
        .map((item) => posts.find((post) => post.url === item.pathname))
        .filter((post): post is (typeof posts)[number] => Boolean(post));
    const trendingPosts = [
        ...rankedPosts,
        ...posts.filter((post) => !rankedPosts.some((ranked) => ranked.url === post.url)),
    ].slice(0, 5);
    const latestPosts = posts.slice(0, 8);

    const tagCounts = posts.reduce((acc, post) => {
        (post.tags || []).forEach((tag) => {
            acc[tag] = (acc[tag] || 0) + 1;
        });
        return acc;
    }, {} as Record<string, number>);

    const hotTags = Object.entries(tagCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 6);

    return (
        <div className="space-y-10">
            <section className="hero-banner relative overflow-hidden rounded-3xl border border-border-default bg-bg-secondary">
                <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/10 via-bg-primary to-bg-secondary"></div>
                <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-10 px-8 py-10">
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center text-3xl">
                                🐱🤖
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-widest text-text-tertiary">AI Engineering · Visual Learning</p>
                                <h1 className="text-3xl font-semibold text-text-primary">
                                    把 AI 天书，讲成人话
                                </h1>
                                <p className="text-sm text-text-secondary">{settings.siteSlogan || '芝士AI吃鱼'} · 算法工程师与 AI 内容创作者</p>
                            </div>
                        </div>

                        <p className="text-lg max-w-2xl text-text-secondary">
                            用漫画降低理解门槛，用长文讲透原理，再用真实项目验证方法。这里持续分享大模型、RAG、Agent 与 AI 工程实践。
                        </p>

                        <div className="flex flex-wrap items-center gap-2">
                            {hotTags.length ? (
                                hotTags.map(([tag, count]) => (
                                    <span key={tag} className="label label-gray">
                                        {tag} · {count}
                                    </span>
                                ))
                            ) : (
                                <>
                                    <span className="label label-blue">Transformer</span>
                                    <span className="label label-purple">RAG</span>
                                    <span className="label label-green">Agent</span>
                                </>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link href="/blog" className="btn-primary px-6 py-3 text-sm">
                                阅读最新文章
                            </Link>
                            <Link
                                href="https://manga.ai-knowledgepoints.cn"
                                className="btn-secondary px-6 py-3 text-sm flex items-center gap-2"
                            >
                                🐱 漫画学 AI
                            </Link>
                            <Link href="/about" className="px-3 py-3 text-sm text-text-secondary hover:text-text-primary">
                                认识作者 →
                            </Link>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="rounded-2xl border border-border-default p-6 bg-bg-secondary/80">
                            <p className="text-xs uppercase tracking-widest text-text-tertiary">从哪里开始</p>
                            <h2 className="mt-2 text-lg font-semibold text-text-primary">
                                一条从理解到创造的学习路径
                            </h2>
                            <ul className="mt-4 space-y-3 text-sm text-text-secondary">
                                {contentTracks.map((item) => (
                                    <li key={item.title}>
                                        <Link href={item.href} className="group flex gap-3 rounded-xl p-2 -mx-2 hover:bg-bg-tertiary">
                                            <span className="mt-1 h-2 w-2 rounded-full bg-accent-primary"></span>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="font-medium text-text-primary group-hover:text-accent-primary">{item.title}</p>
                                                    <span className="label label-gray">{item.label}</span>
                                                </div>
                                                <p className="text-text-secondary">{item.description}</p>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="rounded-2xl border border-border-default p-6 bg-bg-secondary/80">
                            <p className="text-xs uppercase tracking-widest text-text-tertiary">长期关注</p>
                            <div className="mt-3 space-y-2 text-sm text-text-secondary">
                                <div className="flex items-center justify-between">
                                    <span>NLP / 大语言模型</span>
                                    <span className="label label-blue">入门</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>RAG / Agent 实践</span>
                                    <span className="label label-green">实战</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>AI 产品与自动化</span>
                                    <span className="label label-purple">应用</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-text-primary">Trending This Week</h2>
                        <p className="text-sm text-text-secondary">{weeklyTopPaths.length ? '基于最近 7 天真实阅读数据' : '统计数据积累中，暂按最近更新排序'}</p>
                    </div>
                    <Link href="/search" className="text-sm text-accent-tertiary hover:underline">
                        浏览全部
                    </Link>
                </div>

                <div className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-3">
                    {trendingPosts.map((post, index) => (
                        <Link
                            key={post._id}
                            href={post.url}
                            className="flex items-center gap-4 rounded-xl border border-border-default bg-bg-tertiary/60 px-4 py-3 transition-colors hover:border-accent-tertiary"
                        >
                            <div className="w-10 h-10 rounded-xl bg-bg-secondary border border-border-default flex items-center justify-center text-lg font-semibold text-text-primary">
                                {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-text-primary truncate">{post.title}</p>
                                <p className="text-xs text-text-secondary line-clamp-1">{post.description}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                                    <span>{new Date(post.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
                                    <span>· {post.readingTime} 分钟</span>
                                    {weeklyViews.get(post.url) ? <span>· {weeklyViews.get(post.url)} 次阅读</span> : null}
                                    {(post.tags || []).slice(0, 2).map((tag) => (
                                        <span key={tag} className="label label-gray">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <span className="text-xs text-text-tertiary">阅读 →</span>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-text-primary">最新发布</h2>
                        <p className="text-sm text-text-secondary">从最新的文章开始探索。</p>
                    </div>
                    <Link href="/blog" className="text-sm text-accent-tertiary hover:underline">
                        查看全部
                    </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {latestPosts.map((post) => (
                        <AppCard key={post._id} repository={post} />
                    ))}
                </div>
            </section>
        </div>
    )
}
