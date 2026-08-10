"use client";

import Image from 'next/image';
import Link from 'next/link';
import { getLanguageColor, formatNumber } from '@/lib/utils';
import { Post } from 'contentlayer/generated';
import { useState } from 'react';

type Repository = {
    id: string;
    name: string;
    full_name: string;
    owner: string;
    avatar_url: string;
    description: string;
    language: string;
    stars: number;
    topics: string[];
    latest_version?: string;
    latest_release_date?: string;
    github_updated_at?: string;
};

interface AppCardProps {
  repository: Repository | Post;
  variant?: 'grid' | 'shelf';
}

const timeAgo = (date: string | undefined) => {
  if (!date) return null;
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  const units = [
    { name: 'year', seconds: 31536000 },
    { name: 'month', seconds: 2592000 },
    { name: 'week', seconds: 604800 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
  ];

  for (const unit of units) {
    const interval = Math.floor(diffInSeconds / unit.seconds);
    if (interval >= 1) {
      const labels: Record<string, string> = { year: '年', month: '个月', week: '周', day: '天', hour: '小时', minute: '分钟' };
      return `${interval} ${labels[unit.name]}前更新`;
    }
  }
  return '刚刚更新';
};


export default function AppCard({ repository, variant = 'grid' }: AppCardProps) {
    const isPost = '_id' in repository;
    const [imgSrc, setImgSrc] = useState(isPost ? '' : (repository as any).avatar_url || `https://github.com/${(repository as any).owner}.png`);

    const name = isPost ? repository.title : repository.name;
    const description = isPost ? repository.description : repository.description;
    const url = isPost ? repository.url : `/repo/${(repository as any).owner}/${(repository as any).name}`;
    const owner = isPost ? repository.author : (repository as any).owner;
    const language = isPost ? "Markdown" : (repository as any).language;
    const stars = isPost ? 0 : (repository as any).stars;
    const topics: string[] = (isPost ? repository.tags : (repository as any).topics) || [];
    const latest_version = isPost ? undefined : (repository as any).latest_version;
    const lastUpdated = timeAgo(isPost ? repository.date : ((repository as any).latest_release_date || (repository as any).github_updated_at));
    const fullName = isPost ? `By ${repository.author}` : (repository as any).full_name;

    const postIcon = isPost
        ? ((repository as Post).icon === 'cat' ? '🐱' : '🤖')
        : null;

    const handleAvatarError = () => {
        setImgSrc('https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png');
    };

    return (
        <div
            className={`group relative overflow-hidden rounded-[1.15rem] border border-border-default bg-bg-secondary p-5 transition-all duration-300 hover:-translate-y-1 hover:border-accent-primary/50 hover:shadow-xl cursor-pointer before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent-primary/35 before:to-transparent before:opacity-0 before:transition-opacity hover:before:opacity-100 ${variant === 'shelf' ? 'w-64 shrink-0' : 'w-full'}`}
        >
            <Link href={url}>
                <div className="flex items-start gap-3">
                    {isPost ? (
                        <div className="w-12 h-12 rounded-[.85rem] flex-shrink-0 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/10 border border-accent-primary/20 flex items-center justify-center text-xl">
                            {postIcon}
                        </div>
                    ) : (
                        <div className="relative w-12 h-12 flex-shrink-0 overflow-hidden rounded-xl">
                            <Image
                                src={imgSrc}
                                alt={owner}
                                fill
                                className="object-cover"
                                onError={handleAvatarError}
                            />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h3 className="text-base font-semibold tracking-[-0.015em] text-text-primary truncate">
                                    {name}
                                </h3>
                                <p className="text-xs text-text-secondary truncate">
                                    {fullName}
                                </p>
                            </div>
                            {!isPost && (
                                <div className="flex items-center gap-1 text-xs text-text-secondary">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"></path>
                                    </svg>
                                    <span className="font-medium text-text-primary">{formatNumber(stars)}</span>
                                </div>
                            )}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-text-secondary line-clamp-2" title={description}>
                            {description || 'No description provided.'}
                        </p>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {language && (
                        <span
                            className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-tertiary px-2.5 py-1 text-[11px] text-text-secondary"
                        >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getLanguageColor(language) }}></span>
                            {language}
                        </span>
                    )}
                    {topics && topics.slice(0, 3).map((topic: string) => (
                        <span
                            key={topic}
                            className="rounded-md border border-border-default bg-bg-tertiary px-2.5 py-1 text-[11px] text-text-secondary"
                        >
                            {topic}
                        </span>
                    ))}
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-text-secondary">
                    {latest_version ? (
                        <span className="px-2 py-1 rounded-md bg-bg-tertiary border border-border-default text-text-primary/80">
                            {latest_version}
                        </span>
                    ) : (
                         <span className="px-2 py-1 rounded-md bg-accent-primary/10 border border-accent-primary/15 text-accent-tertiary">{isPost ? "深度文章" : "开源项目"}</span>
                    )}
                    {lastUpdated && <span className="capitalize">{lastUpdated}</span>}
                </div>
            </Link>
        </div>
    );
}
