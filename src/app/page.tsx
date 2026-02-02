import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import Link from 'next/link'
import AppCard from '@/components/AppCard'

const projectThoughts = [
    {
        title: '用漫画讲清 AI',
        description: '把复杂概念变成对话场景，让记忆更牢。',
    },
    {
        title: '让知识可以落地',
        description: '从 RAG/Agent 到工具流程，强调可操作性。',
    },
    {
        title: '稳定节奏输出',
        description: '保持持续更新，用系列化内容沉淀方法论。',
    },
];

export default function Home() {
    const posts = allPosts
        .filter((post) => post.published)
        .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)));

    const trendingPosts = posts.slice(0, 5);
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
                                <p className="text-xs uppercase tracking-widest text-text-tertiary">Discovery</p>
                                <h1 className="text-3xl font-semibold text-text-primary">
                                    芝士AI吃鱼 · 发现页
                                </h1>
                                <p className="text-sm text-text-secondary">用漫画 + 人话拆解 AI 技术</p>
                            </div>
                        </div>

                        <p className="text-lg max-w-2xl text-text-secondary">
                            这里汇总了最新文章、主题标签与内容方向，帮你快速找到值得深挖的知识点。
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
                            <a
                                href="https://manga.ai-knowledgepoints.cn"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary px-6 py-3 text-sm"
                            >
                                🐱 漫画知识点
                            </a>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="rounded-2xl border border-border-default p-6 bg-bg-secondary/80">
                            <p className="text-xs uppercase tracking-widest text-text-tertiary">项目思考</p>
                            <h2 className="mt-2 text-lg font-semibold text-text-primary">
                                让 AI 知识更好记、更可用
                            </h2>
                            <ul className="mt-4 space-y-3 text-sm text-text-secondary">
                                {projectThoughts.map((item) => (
                                    <li key={item.title} className="flex gap-3">
                                        <span className="mt-1 h-2 w-2 rounded-full bg-accent-primary"></span>
                                        <div>
                                            <p className="font-medium text-text-primary">{item.title}</p>
                                            <p className="text-text-secondary">{item.description}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="rounded-2xl border border-border-default p-6 bg-bg-secondary/80">
                            <p className="text-xs uppercase tracking-widest text-text-tertiary">内容路线</p>
                            <div className="mt-3 space-y-2 text-sm text-text-secondary">
                                <div className="flex items-center justify-between">
                                    <span>AI 基础概念</span>
                                    <span className="label label-blue">入门</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>RAG / Agent 实践</span>
                                    <span className="label label-green">实战</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>效率工具与方法论</span>
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
                        <p className="text-sm text-text-secondary">文章排行 · 最近更新与讨论度最高</p>
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
