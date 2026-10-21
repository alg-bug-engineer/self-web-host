import portfolioData from 'content/collections/portfolio.json'

export type PortfolioItem = {
  id?: string
  title: string
  type: 'book' | 'product' | 'website' | 'opensource'
  category?: string
  status?: string
  featured?: boolean
  description?: string
  image?: string
  imageFit?: 'contain'
  link?: string
  github?: string
  caseStudy?: string
  tags?: string[]
  highlights?: string[]
  note?: string
}

export const portfolioItems = portfolioData as PortfolioItem[]
export const books = portfolioItems.filter((item) => item.type === 'book')
export const products = portfolioItems.filter((item) => item.type === 'product' || item.type === 'website')
export const openSourceProjects = portfolioItems.filter((item) => item.type === 'opensource')
export const featuredProducts = products.filter((item) => item.featured)
