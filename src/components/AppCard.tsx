"use client";

import Link from 'next/link';
import { getLanguageColor, formatNumber } from '@/lib/utils';
import { Post } from 'contentlayer/generated';

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
      return `Updated ${interval} ${unit.name}${interval > 1 ? 's' : ''} ago`;
    }
  }
  return 'Updated just now';
};


export default function AppCard({ repository, variant = 'grid' }: AppCardProps) {
    const isPost = '_id' in repository;

    const name = isPost ? repository.title : repository.name;
    const description = isPost ? repository.description : repository.description;
    const url = isPost ? repository.url : `/repo/${repository.owner}/${repository.name}`;
    const owner = isPost ? repository.author : repository.owner;
    const avatarUrl = isPost ? undefined : repository.avatar_url || `https://github.com/${repository.owner}.png`;
    const language = isPost ? "Markdown" : repository.language;
    const stars = isPost ? 0 : repository.stars;
    const topics = isPost ? repository.tags : repository.topics;
    const latest_version = isPost ? undefined : repository.latest_version;
    const lastUpdated = timeAgo(isPost ? repository.date : (repository.latest_release_date || repository.github_updated_at));
    const fullName = isPost ? `By ${repository.author}` : repository.full_name;

    const postIcon = isPost
        ? ((repository as Post).icon === 'cat' ? '🐱' : '🤖')
        : null;

    const handleAvatarError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        event.currentTarget.src = 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
    };

    return (
        <div
            className={`group relative rounded-2xl border border-border-default bg-bg-secondary/80 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-primary/50 hover:shadow-lg hover:shadow-black/15 cursor-pointer ${variant === 'shelf' ? 'w-64 shrink-0' : 'w-full'}`}
        >
            <Link href={url}>
                <div className="flex items-start gap-3">
                    {isPost ? (
                        <div className="w-12 h-12 rounded-xl flex-shrink-0 bg-bg-tertiary border border-border-default flex items-center justify-center text-2xl">
                            {postIcon}
                        </div>
                    ) : (
                        <img
                            src={avatarUrl}
                            alt={owner}
                            className="w-12 h-12 rounded-xl flex-shrink-0 bg-bg-tertiary object-cover"
                            onError={handleAvatarError}
                        />
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h3 className="text-base font-semibold text-text-primary truncate">
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
                        <p className="mt-2 text-sm text-text-primary/70 line-clamp-2" title={description}>
                            {description || 'No description provided.'}
                        </p>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {language && (
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-bg-tertiary px-2.5 py-1 text-xs text-text-secondary"
                        >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getLanguageColor(language) }}></span>
                            {language}
                        </span>
                    )}
                    {topics && topics.slice(0, 3).map((topic) => (
                        <span
                            key={topic}
                            className="rounded-full border border-border-default bg-bg-tertiary px-2.5 py-1 text-xs text-text-secondary"
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
                         <span className="px-2 py-1 rounded-md bg-bg-tertiary border border-border-default text-text-primary/80">{isPost ? "Blog Post" : "Open Source"}</span>
                    )}
                    {lastUpdated && <span className="capitalize">{lastUpdated}</span>}
                </div>
            </Link>
        </div>
    );
}
