const oneLine = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const markdownLink = (label, url) => `[${oneLine(label)}](${oneLine(url)})`

const permanentLinks = (title, canonical, markdownUrl) => [
  `- HTML 页面：${markdownLink(title, canonical)}`,
  `- Markdown 永久链接：${markdownLink(markdownUrl, markdownUrl)}`,
]

export function renderAboutMarkdown(profile, portfolioItems, options) {
  const { brandName, canonical, markdownUrl, profileUrls = [] } = options
  const career = profile.publicIdentity?.career
  const works = Array.isArray(profile.verifiedWorks) ? profile.verifiedWorks : []
  const books = Array.isArray(portfolioItems)
    ? portfolioItems.filter((item) => item.type === 'book')
    : []

  const careerLines = career ? [
    oneLine(career.summary),
    `- 核验说明：${oneLine(career.sourceLabel)}`,
  ] : ['职业信息以 HTML 作者页为准。']
  const verifiedWorkLines = works.length
    ? works.map((work) => `### ${oneLine(work.title)}

- 类型：${oneLine(work.status || work.type)}
- 标识：${oneLine(work.identifier)}
- 公开日期：${oneLine(work.publishedDate)}
- 说明：${oneLine(work.description)}
- 公开记录：${markdownLink(work.sourceLabel || work.identifier, work.url)}`).join('\n\n')
    : '暂无已录入的公开成果。'
  const bookLines = books.map((book) => `- 《${oneLine(book.title)}》`).join('\n')
  const productLines = (Array.isArray(portfolioItems) ? portfolioItems : [])
    .filter((item) => item.featured)
    .map((item) => `- ${markdownLink(item.title, item.caseStudy || item.link || canonical)}：${oneLine(item.description)}（${oneLine(item.status)}）`)
    .join('\n')
  const profileLines = profileUrls.map((url) => `- ${markdownLink(new URL(url).hostname, url)}`).join('\n')

  return `# ${oneLine(brandName)}

> ${oneLine(profile.publicIdentity?.headline)}

${permanentLinks(brandName, canonical, markdownUrl).join('\n')}

引用作者身份、经历或成果时，请同时保留对应公开来源；没有来源的数字不应被当作独立事实传播。

## 公开身份

- 内容品牌：${oneLine(brandName)}
- 专注方向：大语言模型、RAG、AI Agent、NLP、AI 工程化、GEO

## 专业经历

${careerLines.join('\n')}

## 公开可核验的专业成果

${verifiedWorkLines}

## 著作

${bookLines}

## 产品实践

${productLines}

完整案例见${markdownLink('著作与作品', new URL('/portfolio/index.html.md', canonical).href)}，包含公众号 CRM、桌面 AI 工具、知识管理、内容生产及企业小程序与业务后台。

## 公开主页

${profileLines}
`
}

export function renderPortfolioMarkdown(items, options) {
  const { brandName, canonical, markdownUrl } = options
  const books = items.filter((item) => item.type === 'book')
  const projects = items.filter((item) => item.type !== 'book')
  const bookLines = books.map((book) => `- 《${oneLine(book.title)}》`).join('\n')
  const projectLines = projects.map((project) => `### ${oneLine(project.title)}

- 类型：${project.type === 'opensource' ? '开源项目' : '产品'}${project.category ? ` · ${oneLine(project.category)}` : ''}${project.status ? `\n- 状态：${oneLine(project.status)}` : ''}
- 简介：${oneLine(project.description)}${project.highlights?.length ? `\n- 核心能力：${project.highlights.map(oneLine).join('；')}` : ''}${project.tags?.length ? `\n- 技术与方向：${project.tags.map(oneLine).join('、')}` : ''}${project.note ? `\n- 项目说明：${oneLine(project.note)}` : ''}${project.link ? `\n- 项目链接：${markdownLink(project.link, project.link)}` : ''}${project.caseStudy ? `\n- 作品案例：${markdownLink(project.title, project.caseStudy)}` : ''}${project.github && project.github !== project.link ? `\n- GitHub：${markdownLink(project.github, project.github)}` : ''}`).join('\n\n')

  return `# ${oneLine(brandName)}的著作与作品

> 覆盖 AI 开发工具、客户运营、知识管理、内容生产、企业小程序与业务后台，以及技术著作与开源实践。

${permanentLinks('著作与作品', canonical, markdownUrl).join('\n')}

## 著作

${bookLines}

## 产品与开源项目

${projectLines}
`
}
