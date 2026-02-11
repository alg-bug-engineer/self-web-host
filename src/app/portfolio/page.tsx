import portfolioData from 'content/collections/portfolio.json';
import Link from 'next/link';

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

// A mapping from type to emoji for visual flair
const typeIconMap: { [key: string]: string } = {
  website: '🌐',
  opensource: '📦',
  book: '📖',
  award: '🏆',
  default: '📄',
};

export default function PortfolioPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">作品集</h1>
          <p className="mt-2 text-lg text-text-secondary">
            我参与和创造的一些项目、成就和思考的沉淀。
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(portfolioData as PortfolioItem[]).map((item, index) => (
            <div key={index} className="flex flex-col bg-bg-secondary border border-border-default rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
              {item.image ? (
                <div className="aspect-video bg-bg-tertiary">
                  {/* Using a simple img tag. For production, consider Next/Image */}
                  <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video bg-bg-tertiary flex items-center justify-center">
                   <span className="text-4xl">{typeIconMap[item.type] || typeIconMap.default}</span>
                </div>
              )}
              
              <div className="p-4 flex flex-col flex-grow">
                <header className="mb-3">
                  <p className="text-xs text-text-tertiary mb-1 flex items-center">
                    <span className="mr-2">{typeIconMap[item.type] || typeIconMap.default}</span>
                    <span>{new Date(item.date).toLocaleDateString()}</span>
                  </p>
                  <h2 className="text-lg font-semibold text-text-primary">{item.title}</h2>
                </header>
                
                <p className="text-sm text-text-secondary flex-grow mb-4">
                  {item.description}
                </p>
                
                <footer className="mt-auto">
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {item.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 text-xs bg-bg-tertiary text-text-tertiary rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {item.link && (
                      <Link href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover transition-colors">
                        查看详情 &rarr;
                      </Link>
                    )}
                    {item.github && (
                      <Link href={item.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-accent transition-colors" title="GitHub 仓库">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                        </svg>
                        GitHub
                      </Link>
                    )}
                  </div>
                </footer>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
