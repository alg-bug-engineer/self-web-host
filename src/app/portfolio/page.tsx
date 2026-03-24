import portfolioData from 'content/collections/portfolio.json';
import Link from 'next/link';
import Image from 'next/image';

type PortfolioItem = {
  title: string;
  type: string;
  date: string;
  description: string;
  image?: string;
  link?: string;
  github?: string;
  tags?: string[];
};

const typeIconMap: { [key: string]: string } = {
  website: '🌐',
  opensource: '📦',
  book: '📖',
  article: '📄',
  default: '🛠️',
};

export default function PortfolioPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-12 space-y-4">
        <div className="inline-block px-3 py-1 rounded-full bg-accent-tertiary/10 text-accent-tertiary text-xs font-bold uppercase tracking-wider">
          Portfolio & Case Studies
        </div>
        <h1 className="text-4xl font-extrabold text-text-primary tracking-tight">
          我的产品与技术背书
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl leading-relaxed">
          致力于将前沿 AI 技术转化为可落地的商业价值。以下是我在 AI Agent、RAG 架构及自动化运维领域的深度实践。
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {(portfolioData as PortfolioItem[]).map((item, index) => (
          <div
            key={index}
            className="group flex flex-col bg-bg-secondary border border-border-default rounded-3xl overflow-hidden hover:border-accent-tertiary/50 hover:shadow-2xl hover:shadow-accent-tertiary/5 transition-all duration-500"
          >
            {/* Image Section */}
            <div className="relative h-64 w-full overflow-hidden bg-bg-tertiary">
              {item.image ? (
                <Image 
                  src={item.image} 
                  alt={item.title} 
                  fill
                  className="object-cover object-center group-hover:scale-105 transition-transform duration-700" 
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl">
                   {typeIconMap[item.type] || typeIconMap.default}
                </div>
              )}
              <div className="absolute top-4 left-4">
                <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-medium border border-white/10">
                  {item.type.toUpperCase()}
                </span>
              </div>
            </div>
            
            {/* Content Section */}
            <div className="p-8 flex flex-col flex-grow space-y-4">
              <div className="flex justify-between items-start">
                <h2 className="text-2xl font-bold text-text-primary group-hover:text-accent-tertiary transition-colors leading-tight">
                  {item.title}
                </h2>
                <span className="text-sm text-text-tertiary font-mono">{new Date(item.date).getFullYear()}</span>
              </div>
              
              <p className="text-text-secondary leading-relaxed">
                {item.description}
              </p>
              
              <div className="flex flex-wrap gap-2 py-2">
                {item.tags?.map(tag => (
                  <span key={tag} className="px-3 py-1 text-xs font-medium bg-bg-tertiary text-text-secondary rounded-lg border border-border-default">
                    {tag}
                  </span>
                ))}
              </div>
              
              <div className="pt-4 mt-auto flex items-center gap-6">
                {item.link && (
                  <Link 
                    href={item.link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-2 text-sm font-bold text-accent-tertiary hover:opacity-80 transition-opacity"
                  >
                    🚀 落地演示
                  </Link>
                )}
                {item.github && (
                  <Link 
                    href={item.github} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    源码
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
