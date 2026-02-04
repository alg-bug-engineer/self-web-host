import React from 'react';
import labData from 'content/collections/lab.json';
import Link from 'next/link';

// Import all possible lab components
import CssShadowGenerator from '@/components/lab/CssShadowGenerator';
import ParticleAnimation from '@/components/lab/ParticleAnimation';

// Map string names to actual components
const labComponentMap: { [key: string]: React.ComponentType } = {
  CssShadowGenerator,
  ParticleAnimation,
};

export default function LabPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">实验室</h1>
          <p className="mt-2 text-lg text-text-secondary">
            存放一些有趣的技术实验、代码片段和在线小工具。
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {labData.map((item, index) => {
            const ComponentToRender = item.component ? labComponentMap[item.component] : null;

            return (
              <div key={index} className="flex flex-col bg-bg-secondary border border-border-default rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300">
                {item.link ? (
                  <Link href={item.link} target="_blank" rel="noopener noreferrer" className="flex-grow p-6">
                    <h2 className="text-lg font-semibold text-text-primary mb-2">{item.title}</h2>
                    <p className="text-sm text-text-secondary mb-4 flex-grow">{item.description}</p>
                    <div className="mt-auto">
                        <span className="text-sm font-medium text-accent hover:text-accent-hover transition-colors">
                            访问链接 &rarr;
                        </span>
                         {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                            {item.tags.map(tag => (
                                <span key={tag} className="px-2 py-0.5 text-xs bg-bg-tertiary text-text-tertiary rounded-full">
                                {tag}
                                </span>
                            ))}
                            </div>
                        )}
                    </div>
                  </Link>
                ) : ComponentToRender ? (
                  <div className="flex-grow h-full">
                    <ComponentToRender />
                  </div>
                ) : (
                  <div className="p-6">
                    <h2 className="text-lg font-semibold text-text-primary">{item.title}</h2>
                    <p className="text-sm text-text-secondary">{item.description}</p>
                     <p className="mt-4 text-sm text-red-500">组件 '{item.component}' 未找到或未实现。</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
