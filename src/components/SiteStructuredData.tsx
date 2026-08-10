import { AUTHOR_PROFILES, BRAND_NAME, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

export default function SiteStructuredData() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': `${SITE_URL}/#person`,
        name: BRAND_NAME,
        url: `${SITE_URL}/about`,
        sameAs: AUTHOR_PROFILES,
        jobTitle: '算法工程师与 AI 内容创作者',
        knowsAbout: ['NLP', '大语言模型', 'RAG', 'AI Agent', '机器学习', 'AI 工程化'],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: BRAND_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        inLanguage: 'zh-CN',
        publisher: { '@id': `${SITE_URL}/#person` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  )
}
