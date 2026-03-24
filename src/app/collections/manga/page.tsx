import fs from 'fs/promises'
import { mangaDataPath } from '@/lib/admin-storage'
import Image from 'next/image'

export const metadata = {
  title: '漫画合集 | 芝士AI吃鱼',
  description: '用漫画和心情记录 AI 学习日常。',
}

export const dynamic = 'force-dynamic'

type MangaItem = {
  id: string
  title: string
  description: string
  image: string
  date: string
  mood: string
}

const loadManga = async (): Promise<MangaItem[]> => {
  try {
    const data = await fs.readFile(mangaDataPath, 'utf8')
    return JSON.parse(data) as MangaItem[]
  } catch {
    return []
  }
}

export default async function MangaCollectionPage() {
  const mangaGallery = await loadManga()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">漫画合集</h1>
        <p className="text-sm text-text-secondary">日常心情动态与漫画灵感墙。</p>
      </div>

      {mangaGallery.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mangaGallery.map((item) => (
            <div key={item.id} className="bg-bg-secondary border border-border-default rounded-2xl overflow-hidden">
              <div className="aspect-[4/3] bg-bg-tertiary relative">
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-text-tertiary">
                  <span>{item.date}</span>
                  <span className="label label-gray">{item.mood}</span>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-text-primary">{item.title}</h2>
                  <p className="text-sm text-text-secondary mt-1">{item.description}</p>
                </div>
                <a
                  href={item.image}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent-tertiary hover:underline"
                >
                  查看原图 →
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="blankslate">
          <div className="blankslate-icon">🎨</div>
          <h3 className="blankslate-heading">暂无漫画</h3>
          <p className="blankslate-description">去后台上传第一张漫画吧。</p>
        </div>
      )}
    </div>
  )
}
