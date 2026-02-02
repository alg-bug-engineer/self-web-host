'use client'

import { useState, useEffect } from 'react';
import { allPosts } from 'contentlayer/generated';

interface FilterSidebarProps {
    onFilterChange: (filters: { topics: string[]; types: string[] }) => void;
    initialTopics?: string[];
    initialTypes?: string[];
}

export default function FilterSidebar({ onFilterChange, initialTopics = [], initialTypes = [] }: FilterSidebarProps) {
    const [selectedTopics, setSelectedTopics] = useState<string[]>(initialTopics);
    const [selectedTypes, setSelectedTypes] = useState<string[]>(initialTypes);
    const [topicOptions, setTopicOptions] = useState<{topic: string, count: number}[]>([]);
    const [typeOptions, setTypeOptions] = useState<{ type: string; label: string; icon: string; count: number }[]>([]);

    useEffect(() => {
        const publishedPosts = allPosts.filter((post) => post.published);
        const allTags = publishedPosts.flatMap(p => p.tags || []);
        const tagCounts = allTags.reduce((acc, tag) => {
            acc[tag] = (acc[tag] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const sortedTopics = Object.entries(tagCounts)
            .sort(([, countA], [, countB]) => countB - countA)
            .map(([topic, count]) => ({ topic, count }));

        setTopicOptions(sortedTopics);

        const typeCounts = publishedPosts.reduce((acc, post) => {
            const type = post.icon || 'robot';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const types = [
            { type: 'cat', label: '高冷猫', icon: '🐱' },
            { type: 'robot', label: '卖萌机器人', icon: '🤖' },
        ].map((item) => ({
            ...item,
            count: typeCounts[item.type] || 0,
        }));

        setTypeOptions(types);
    }, []);

    useEffect(() => {
        onFilterChange({ topics: selectedTopics, types: selectedTypes });
    }, [selectedTopics, selectedTypes, onFilterChange]);

    useEffect(() => {
        setSelectedTopics(initialTopics);
    }, [initialTopics]);

    useEffect(() => {
        setSelectedTypes(initialTypes);
    }, [initialTypes]);

    return (
        <aside className="space-y-4 bg-bg-secondary border border-border-default rounded-xl p-4 lg:sticky lg:top-20 h-fit">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">筛选</h2>
                <button
                    onClick={() => {
                        setSelectedTopics([]);
                        setSelectedTypes([]);
                    }}
                    className="text-xs text-text-tertiary hover:text-text-primary"
                >
                    重置
                </button>
            </div>

            <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-text-tertiary">类型</p>
                <div className="space-y-1.5">
                    {typeOptions.map(option => (
                        <label key={option.type} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    value={option.type}
                                    checked={selectedTypes.includes(option.type)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedTypes([...selectedTypes, option.type]);
                                        } else {
                                            setSelectedTypes(selectedTypes.filter((t) => t !== option.type));
                                        }
                                    }}
                                    className="h-4 w-4 rounded border-border-default bg-bg-tertiary text-accent-primary focus:ring-accent-tertiary"
                                />
                                <span>{option.icon}</span>
                                <span>{option.label}</span>
                            </span>
                            <span className="text-xs text-text-tertiary">{option.count}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-text-tertiary">话题</p>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {topicOptions.map(option => (
                         <label key={option.topic} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    value={option.topic}
                                    checked={selectedTopics.includes(option.topic)}
                                    onChange={(e) => {
                                        if(e.target.checked) {
                                            setSelectedTopics([...selectedTopics, option.topic])
                                        } else {
                                            setSelectedTopics(selectedTopics.filter(t => t !== option.topic))
                                        }
                                    }}
                                    className="h-4 w-4 rounded border-border-default bg-bg-tertiary text-accent-primary focus:ring-accent-tertiary"
                                />
                                {option.topic}
                            </span>
                            <span className="text-xs text-text-tertiary">{option.count}</span>
                        </label>
                    ))}
                </div>
            </div>
        </aside>
    )
}
