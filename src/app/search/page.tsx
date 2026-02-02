'use client'

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { allPosts, Post } from 'contentlayer/generated';
import AppCard from '@/components/AppCard';
import FilterSidebar from '@/components/FilterSidebar';

function SearchContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [posts, setPosts] = useState<Post[]>([]);
    const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState<{ topics: string[]; types: string[] }>({ topics: [], types: [] });
    const [sortBy, setSortBy] = useState('newest');

    useEffect(() => {
        const sortedPosts = allPosts
            .filter((post) => post.published)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setPosts(sortedPosts);
    }, []);

    useEffect(() => {
        const query = searchParams.get('q') || '';
        const topics = searchParams.get('topics')?.split(',').filter(Boolean) || [];
        const types = searchParams.get('types')?.split(',').filter(Boolean) || [];
        const sort = searchParams.get('sort') || 'newest';

        setSearchQuery(query);
        setFilters({ topics, types });
        setSortBy(sort);

    }, [searchParams]);

    useEffect(() => {
        let tempPosts = posts;

        if (searchQuery) {
            tempPosts = tempPosts.filter(post =>
                post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                post.description.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        if(filters.types.length > 0) {
            tempPosts = tempPosts.filter(post => filters.types.includes(post.icon || 'robot'));
        }

        if(filters.topics.length > 0) {
            tempPosts = tempPosts.filter(post =>
                filters.topics.every(topic => post.tags?.includes(topic))
            )
        }

        tempPosts = [...tempPosts].sort((a, b) => {
            if (sortBy === 'oldest') {
                return new Date(a.date).getTime() - new Date(b.date).getTime();
            }
            if (sortBy === 'reading') {
                return (a.readingTime || 0) - (b.readingTime || 0);
            }
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        setFilteredPosts(tempPosts);
    }, [searchQuery, filters, posts, sortBy]);

    const updateURLParams = useCallback((params: { topics: string[]; types: string[]; q: string; sort: string }) => {
        const newParams = new URLSearchParams();
        if (params.q) newParams.set('q', params.q);
        if (params.topics.length > 0) newParams.set('topics', params.topics.join(','));
        if (params.types.length > 0) newParams.set('types', params.types.join(','));
        if (params.sort && params.sort !== 'newest') newParams.set('sort', params.sort);
        router.push(`/search?${newParams.toString()}`);
    }, [router]);

    const handleFilterChange = useCallback((newFilters: { topics: string[]; types: string[] }) => {
        setFilters(newFilters);
        updateURLParams({ ...newFilters, q: searchQuery, sort: sortBy });
    }, [searchQuery, sortBy, updateURLParams]);

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newQuery = e.target.value;
        setSearchQuery(newQuery);
        updateURLParams({ ...filters, q: newQuery, sort: sortBy });
    }, [filters, sortBy, updateURLParams]);

    const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSortBy(value);
        updateURLParams({ ...filters, q: searchQuery, sort: value });
    }, [filters, searchQuery, updateURLParams]);

    const typeLabels: Record<string, string> = {
        cat: '高冷猫',
        robot: '卖萌机器人',
    };

    const activeFilters = [
        ...filters.types.map((value) => ({ key: `type-${value}`, type: 'type', value, label: typeLabels[value] || value })),
        ...filters.topics.map((value) => ({ key: `topic-${value}`, type: 'topic', value, label: value })),
    ];

    const removeFilter = useCallback((filter: { type: 'type' | 'topic'; value: string }) => {
        if (filter.type === 'type') {
            const nextTypes = filters.types.filter((item) => item !== filter.value);
            const nextFilters = { ...filters, types: nextTypes };
            setFilters(nextFilters);
            updateURLParams({ ...nextFilters, q: searchQuery, sort: sortBy });
            return;
        }
        const nextTopics = filters.topics.filter((item) => item !== filter.value);
        const nextFilters = { ...filters, topics: nextTopics };
        setFilters(nextFilters);
        updateURLParams({ ...nextFilters, q: searchQuery, sort: sortBy });
    }, [filters, searchQuery, sortBy, updateURLParams]);

    const totalTopics = new Set(posts.flatMap((post) => post.tags || [])).size;
    const latestDate = posts[0]?.date;
    const latestLabel = latestDate
        ? new Date(latestDate).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : '暂无';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary">浏览文章</h1>
                <p className="text-sm text-text-secondary">按话题标签与内容类型找到你需要的 AI 知识点。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-bg-secondary border border-border-default rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-widest text-text-tertiary">文章总数</p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{posts.length}</p>
                </div>
                <div className="bg-bg-secondary border border-border-default rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-widest text-text-tertiary">话题数量</p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{totalTopics}</p>
                </div>
                <div className="bg-bg-secondary border border-border-default rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-widest text-text-tertiary">最近更新</p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{latestLabel}</p>
                </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-md">
                    <input
                        value={searchQuery}
                        onChange={handleSearchChange}
                        type="text"
                        placeholder="搜索文章标题或描述..."
                        className="w-full px-4 py-2.5 text-sm bg-bg-secondary text-text-primary placeholder-text-secondary border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-tertiary focus:border-transparent"
                    />
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <select
                    value={sortBy}
                    onChange={handleSortChange}
                    className="px-3 py-2 text-sm bg-bg-secondary text-text-primary border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-accent-tertiary focus:border-transparent"
                >
                    <option value="newest">最新发布</option>
                    <option value="oldest">最早发布</option>
                    <option value="reading">阅读时长</option>
                </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
                <FilterSidebar
                    onFilterChange={handleFilterChange}
                    initialTopics={filters.topics}
                    initialTypes={filters.types}
                />

                <section className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                        <span>{filteredPosts.length} 篇结果</span>
                        {activeFilters.length > 0 && <span className="text-text-tertiary">|</span>}
                        {activeFilters.map((filter) => (
                            <button
                                key={filter.key}
                                onClick={() => removeFilter({ type: filter.type as 'type' | 'topic', value: filter.value })}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-bg-tertiary text-text-secondary rounded-full hover:bg-bg-secondary transition-colors"
                            >
                                {filter.label}
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        ))}
                    </div>

                    {filteredPosts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredPosts.map(post => (
                                <AppCard key={post.slug} repository={post} />
                            ))}
                        </div>
                    ) : (
                        <div className="blankslate">
                            <div className="blankslate-icon">
                                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <h3 className="blankslate-heading">没有匹配内容</h3>
                            <p className="blankslate-description">试试调整关键词或筛选条件。</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function SearchLoading() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary">浏览文章</h1>
                <p className="text-sm text-text-secondary">按话题标签与内容类型找到你需要的 AI 知识点。</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-bg-secondary border border-border-default rounded-2xl p-4 animate-pulse">
                        <div className="h-3 w-16 bg-bg-tertiary rounded mb-2" />
                        <div className="h-8 w-12 bg-bg-tertiary rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={<SearchLoading />}>
            <SearchContent />
        </Suspense>
    );
}
