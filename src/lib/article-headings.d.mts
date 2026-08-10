export type ArticleHeading = {
  id: string
  text: string
  level: 2
}

export function extractArticleHeadings(source: string): ArticleHeading[]
