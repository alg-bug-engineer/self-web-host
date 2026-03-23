import fs from 'fs/promises'
import path from 'path'

export const collectionsDir = path.join(process.cwd(), 'content', 'collections')
export const mangaDataPath = path.join(collectionsDir, 'manga.json')
export const toolsDataPath = path.join(collectionsDir, 'tools.json')
export const settingsDataPath = path.join(collectionsDir, 'settings.json')

export type SystemSettings = {
  planetQrCode?: string
  planetUrl?: string
  siteSlogan?: string
}

export const getSettings = async (): Promise<SystemSettings> => {
  return readJsonFile<SystemSettings>(settingsDataPath, {
    siteSlogan: '芝士AI吃鱼',
    planetUrl: '/planet',
  })
}

export const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data) as T
  } catch {
    return fallback
  }
}

export const writeJsonFile = async (filePath: string, data: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}
