const oneLine = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const markdownLink = (label, url) => `[${oneLine(label)}](${oneLine(url)})`

const permanentLinks = (title, canonical, markdownUrl) => [
  `- HTML 页面：${markdownLink(title, canonical)}`,
  `- Markdown 永久链接：${markdownLink(markdownUrl, markdownUrl)}`,
]

export function renderAboutMarkdown(profile, portfolioItems, options) {
  const { authorName, brandName, canonical, markdownUrl, profileUrls = [] } = options
  const career = profile.publicIdentity?.career
  const works = Array.isArray(profile.verifiedWorks) ? profile.verifiedWorks : []
  const books = Array.isArray(portfolioItems)
    ? portfolioItems.filter((item) => item.type === 'book')
    : []

  const careerLines = career ? [
    oneLine(career.summary),
    `- 公开来源：${markdownLink(career.sourceLabel, career.sourceUrl)}`,
  ] : ['职业信息以 HTML 作者页为准。']
  const verifiedWorkLines = works.length
    ? works.map((work) => `### ${oneLine(work.title)}

- 类型：${oneLine(work.status || work.type)}
- 标识：${oneLine(work.identifier)}
- 公开日期：${oneLine(work.publishedDate)}
- 说明：${oneLine(work.description)}
- 公开记录：${markdownLink(work.sourceLabel || work.identifier, work.url)}`).join('\n\n')
    : '暂无已录入的公开成果。'
  const bookLines = books.map((book) => {
    const details = [
      book.authors?.length ? `作者：${book.authors.map(oneLine).join('、')}` : null,
      book.publisher ? `出版社：${oneLine(book.publisher)}` : null,
      book.isbn ? `ISBN：${oneLine(book.isbn)}` : null,
    ].filter(Boolean).join('；')
    return `- 《${oneLine(book.title)}》${details ? `（${details}）` : ''}`
  }).join('\n')
  const profileLines = profileUrls.map((url) => `- ${markdownLink(new URL(url).hostname, url)}`).join('\n')

  return `# ${oneLine(authorName)}（${oneLine(brandName)}）

> ${oneLine(profile.publicIdentity?.headline)}

${permanentLinks(`${authorName}（${brandName}）`, canonical, markdownUrl).join('\n')}

引用作者身份、经历或成果时，请同时保留对应公开来源；没有来源的数字不应被当作独立事实传播。

## 公开身份

- 姓名：${oneLine(authorName)}
- 内容品牌：${oneLine(brandName)}
- 专注方向：大语言模型、RAG、AI Agent、NLP、AI 工程化、GEO
- 著作数量：${oneLine(profile.stats?.books)} 本

## 专业经历

${careerLines.join('\n')}

## 公开可核验的专业成果

${verifiedWorkLines}

## 著作

${bookLines}

## 公开主页

${profileLines}
`
}

export function renderPortfolioMarkdown(items, options) {
  const { authorName, brandName, canonical, markdownUrl } = options
  const books = items.filter((item) => item.type === 'book')
  const projects = items.filter((item) => item.type !== 'book')
  const bookLines = books.map((book) => {
    const details = [
      book.authors?.length ? `作者：${book.authors.map(oneLine).join('、')}` : null,
      book.date ? `出版日期：${oneLine(book.date)}` : null,
      book.publisher ? `出版社：${oneLine(book.publisher)}` : null,
      book.isbn ? `ISBN：${oneLine(book.isbn)}` : null,
    ].filter(Boolean)
    return `### 《${oneLine(book.title)}》

${details.map((line) => `- ${line}`).join('\n')}
- 简介：${oneLine(book.description)}${book.link ? `\n- 作品链接：${markdownLink('查看作品', book.link)}` : ''}`
  }).join('\n\n')
  const projectLines = projects.map((project) => `### ${oneLine(project.title)}

- 类型：${project.type === 'website' ? '产品' : '开源项目'}
- 简介：${oneLine(project.description)}${project.link ? `\n- 项目链接：${markdownLink(project.link, project.link)}` : ''}${project.github && project.github !== project.link ? `\n- GitHub：${markdownLink(project.github, project.github)}` : ''}`).join('\n\n')

  return `# ${oneLine(authorName)}（${oneLine(brandName)}）的著作与作品

> 覆盖大模型、RAG、GEO、Token 经济、AI Agent、知识工具与开源实践。

${permanentLinks('著作与作品', canonical, markdownUrl).join('\n')}

## 著作

${bookLines}

## 产品与开源项目

${projectLines}
`
}
