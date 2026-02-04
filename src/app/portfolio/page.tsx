import portfolioData from 'content/collections/portfolio.json';
import Link from 'next/link';

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
          {portfolioData.map((item, index) => (
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

                  {item.link && (
                    <Link href={item.link} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-accent hover:text-accent-hover transition-colors">
                      查看详情 &rarr;
                    </Link>
                  )}
                </footer>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
