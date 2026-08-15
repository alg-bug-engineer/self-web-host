import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'

const projectDir = process.cwd()
const manifestFile = path.join(
  projectDir,
  'ops',
  'campaigns',
  'ai-native-generation-30d-deployment-assets.json',
)
const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))

if (manifest.version !== 1 || manifest.campaignId !== 'ai-native-generation-30d') {
  throw new Error('课程部署资产清单无效。')
}

let sourceBytes = 0
let outputBytes = 0
const assets = [
  ...manifest.posters.map((poster) => ({ ...poster, label: poster.lesson })),
  ...(manifest.sharedImages || []).map((image) => ({ ...image, label: image.name })),
]

for (const asset of assets) {
  const source = path.join(projectDir, asset.source)
  const output = path.join(projectDir, asset.output)
  const sourceStat = await fs.stat(source)
  sourceBytes += sourceStat.size
  await fs.mkdir(path.dirname(output), { recursive: true })
  await sharp(source)
    .rotate()
    .resize({
      width: manifest.posterPolicy.maximumWidth,
      height: manifest.posterPolicy.maximumWidth,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: manifest.posterPolicy.quality, effort: 6 })
    .toFile(output)
  const metadata = await sharp(output).metadata()
  if (metadata.format !== 'webp' || !metadata.width || metadata.width > manifest.posterPolicy.maximumWidth) {
    throw new Error(`${asset.label} 图片优化结果无效。`)
  }
  outputBytes += (await fs.stat(output)).size
}

const reduction = sourceBytes
  ? Math.round((1 - outputBytes / sourceBytes) * 1000) / 10
  : 0
process.stdout.write(`optimized ${assets.length} deployment images: ${formatBytes(sourceBytes)} -> ${formatBytes(outputBytes)} (${reduction}% smaller)\n`)

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}
