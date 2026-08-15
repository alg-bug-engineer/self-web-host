import { execFileSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const page = path.join(root, 'src/app/ai-native-generation/page.tsx')
const pageSource = await readFile(page, 'utf8')
if (!pageSource.includes('参与偏好：异步任务 / 集中答疑 / 两者都可')) {
  throw new Error('课程落地页的监护人意向模板与聚合台账不一致')
}
if (!pageSource.includes('每周：少于 30 / 30—60 / 60—90 分钟')) {
  throw new Error('课程落地页未覆盖完整的每周投入选项')
}
if (pageSource.includes('偏好：课程内测 / 知识星球共学 / 先观察')) {
  throw new Error('课程落地页仍包含旧版参与偏好')
}
const lessons = [
  {
    id: 'L01',
    filename: 'L01-ai-is-prediction-v1.mp4',
    minDuration: 250,
    maxDuration: 280,
    taskMarker: '下一节，我们会继续研究',
    srtTaskMarker: '今天请和家长一起',
  },
  {
    id: 'L02',
    filename: 'L02-how-generative-ai-answers-v1.mp4',
    minDuration: 260,
    maxDuration: 275,
    taskMarker: '下一节，我们会专门研究',
    srtTaskMarker: '选择一个不涉及个人隐私',
  },
  {
    id: 'L03',
    filename: 'L03-why-ai-makes-things-up-v1.mp4',
    minDuration: 235,
    maxDuration: 250,
    taskMarker: '这不是失败',
    srtTaskMarker: '请家长准备一个不会涉及隐私',
  },
  {
    id: 'L04',
    filename: 'L04-define-the-problem-v1.mp4',
    minDuration: 285,
    maxDuration: 300,
    taskMarker: '下一节，我们会把这个已经说清楚的问题',
    srtTaskMarker: '今天请选择一个不涉及隐私',
  },
  {
    id: 'L05',
    filename: 'L05-break-work-into-checkable-steps-v1.mp4',
    minDuration: 265,
    maxDuration: 280,
    taskMarker: '下一节，我们会继续判断',
    srtTaskMarker: '今天请选择一个已经用 L04 四格卡说清楚',
  },
  {
    id: 'L06',
    filename: 'L06-human-ai-division-of-responsibility-v1.mp4',
    minDuration: 340,
    maxDuration: 350,
    taskMarker: '下一节，我们会把',
    srtTaskMarker: '请拿出 L05 的任务阶梯',
  },
  {
    id: 'L07',
    filename: 'L07-source-counterexample-cross-check-v1.mp4',
    minDuration: 390,
    maxDuration: 400,
    taskMarker: '下一节，我们会把',
    srtTaskMarker: '从 L06 的前两步里',
  },
  {
    id: 'L08',
    filename: 'L08-small-family-research-v1.mp4',
    minDuration: 418,
    maxDuration: 426,
    taskMarker: '下一节，我们会把',
    srtTaskMarker: '可以使用纸桥案例',
  },
  {
    id: 'L09',
    filename: 'L09-family-co-creation-showcase-v1.mp4',
    minDuration: 410,
    maxDuration: 418,
    taskMarker: '下一节，我们进入第四周',
    srtTaskMarker: '把 L08 研究日志压缩成',
  },
  {
    id: 'L10',
    filename: 'L10-privacy-copyright-synthetic-content-v1.mp4',
    minDuration: 460,
    maxDuration: 468,
    taskMarker: '下一节，我们会处理另一种更隐蔽的风险',
    srtTaskMarker: '不要上传真实作品',
  },
  {
    id: 'L11',
    filename: 'L11-chatbot-is-not-a-relationship-v1.mp4',
    minDuration: 492,
    maxDuration: 500,
    taskMarker: '下一节，我们会把前十一节的判断动作',
    srtTaskMarker: '只使用虚构句子完成三色情境卡',
  },
  {
    id: 'L12',
    filename: 'L12-family-ai-agreement-and-defense-v1.mp4',
    minDuration: 474,
    maxDuration: 481,
    taskMarker: '孩子的答辩分数不与付费资格绑定',
    srtTaskMarker: '不上传正脸、声音、学校、聊天、原始作品或联系人',
  },
]

let totalPosterBytes = 0

for (const lesson of lessons) {
  const video = path.join(root, 'public/videos/courses/ai-native-generation', lesson.filename)
  const captions = video.replace(/\.mp4$/, '.vtt')
  const subtitles = video.replace(/\.mp4$/, '.srt')
  const metadata = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_name,codec_type:stream_tags=language',
    '-of', 'json',
    video,
  ], { encoding: 'utf8' }))

  const duration = Number(metadata.format?.duration)
  if (!(duration >= lesson.minDuration && duration <= lesson.maxDuration)) {
    throw new Error(`${lesson.id} 视频时长异常：${duration}`)
  }
  const roundedDuration = Math.round(duration)
  const durationLabel = `${Math.floor(roundedDuration / 60)} 分 ${String(roundedDuration % 60).padStart(2, '0')} 秒`
  const timelineEnd = `${String(Math.floor(roundedDuration / 60)).padStart(2, '0')}:${String(roundedDuration % 60).padStart(2, '0')}`
  const scriptName = lesson.filename.replace(/-v1\.mp4$/, '.md')
  const scriptSource = await readFile(path.join(root, 'content/courses/ai-native-generation', scriptName), 'utf8')
  if (!scriptSource.includes(`- 成片时长：${durationLabel}`)) {
    throw new Error(`${lesson.id} 脚本成片时长与实际视频不一致：${durationLabel}`)
  }
  if (/^- 视频长度：/m.test(scriptSource)) {
    throw new Error(`${lesson.id} 脚本仍保留计划视频长度`)
  }
  const sectionTimelines = [...scriptSource.matchAll(/^### (\d{2}:\d{2})—(\d{2}:\d{2})｜/gm)]
  if (!sectionTimelines.length || sectionTimelines.at(-1)[2] !== timelineEnd) {
    throw new Error(`${lesson.id} 脚本时间轴结尾未对齐实际成片：${timelineEnd}`)
  }
  for (let index = 1; index < sectionTimelines.length; index += 1) {
    if (sectionTimelines[index - 1][2] !== sectionTimelines[index][1]) {
      throw new Error(`${lesson.id} 脚本时间轴在第 ${index + 1} 段前不连续`)
    }
  }
  if (!pageSource.includes(`duration: '${durationLabel}'`)) {
    throw new Error(`课程落地页 ${lesson.id} 时长与实际视频不一致：${durationLabel}`)
  }

  const streamTypes = new Map(metadata.streams.map((stream) => [stream.codec_type, stream]))
  if (streamTypes.get('video')?.codec_name !== 'h264') throw new Error(`${lesson.id} 缺少 H.264 视频流`)
  if (streamTypes.get('audio')?.codec_name !== 'aac') throw new Error(`${lesson.id} 缺少 AAC 音频流`)
  if (streamTypes.get('subtitle')?.codec_name !== 'mov_text') throw new Error(`${lesson.id} 缺少内嵌字幕流`)
  if (streamTypes.get('subtitle')?.tags?.language !== 'zho') throw new Error(`${lesson.id} 字幕语言未标记为中文`)

  const [vtt, srt] = await Promise.all([
    readFile(captions, 'utf8'),
    readFile(subtitles, 'utf8'),
  ])
  if (!vtt.startsWith('WEBVTT\n')) throw new Error(`${lesson.id} WebVTT 文件头缺失`)
  if (!vtt.includes(lesson.taskMarker)) throw new Error(`${lesson.id} WebVTT 未包含亲子任务结尾`)
  if (!srt.includes(lesson.srtTaskMarker)) {
    throw new Error(`${lesson.id} SRT 未覆盖亲子任务`)
  }
  const scriptSections = [...scriptSource.matchAll(
    /^### (\d{2}:\d{2})—(\d{2}:\d{2})｜(.+)\n([\s\S]*?)(?=^### |^## )/gm,
  )]
  const cuePattern = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> [^\n]+\n([\s\S]*?)(?=\n\n|$)/g
  const cues = [...vtt.matchAll(cuePattern)].map((match) => ({
    start: parseTimestamp(match[1]),
    text: normalizeTranscriptText(match[2]),
  }))
  let normalizedTranscript = ''
  const transcriptTimes = []
  for (const cue of cues) {
    for (const character of cue.text) {
      normalizedTranscript += character
      transcriptTimes.push(cue.start)
    }
  }
  let searchFrom = 0
  for (const [index, section] of scriptSections.entries()) {
    const token = normalizeTranscriptText(section[4]).slice(0, 14)
    const transcriptIndex = normalizedTranscript.indexOf(token, searchFrom)
    if (transcriptIndex < 0) throw new Error(`${lesson.id} 第 ${index + 1} 段无法在 WebVTT 中定位`)
    const actualStart = transcriptTimes[transcriptIndex]
    const declaredStart = parseMmSs(section[1])
    if (index === 0) {
      if (declaredStart !== 0 || actualStart > 6) throw new Error(`${lesson.id} 开场时间轴未覆盖片头`)
    } else if (Math.abs(Math.round(actualStart) - declaredStart) > 1) {
      throw new Error(`${lesson.id} 第 ${index + 1} 段时间轴与 WebVTT 不一致`)
    }
    searchFrom = transcriptIndex + token.length
  }

  const publicVideo = `/videos/courses/ai-native-generation/${lesson.filename}`
  const publicCaptions = publicVideo.replace(/\.mp4$/, '.vtt')
  if (!pageSource.includes(publicVideo)) throw new Error(`课程落地页未引用 ${lesson.id} 视频`)
  if (!pageSource.includes(publicCaptions)) throw new Error(`课程落地页未引用 ${lesson.id} WebVTT 字幕`)

  const publicPoster = `/images/courses/ai-native-generation/${lesson.id}/poster.webp`
  const poster = path.join(root, 'public', publicPoster)
  const [posterStat, posterMetadata] = await Promise.all([
    stat(poster),
    sharp(poster).metadata(),
  ])
  if (!posterStat.isFile() || posterStat.size === 0) throw new Error(`${lesson.id} WebP 海报为空`)
  if (posterMetadata.format !== 'webp') throw new Error(`${lesson.id} 海报不是 WebP 格式`)
  if (!posterMetadata.width || !posterMetadata.height) throw new Error(`${lesson.id} 海报尺寸不可读`)
  if (posterMetadata.width > 1280 || posterMetadata.height > 1280) {
    throw new Error(`${lesson.id} 海报尺寸超过 1280px：${posterMetadata.width}x${posterMetadata.height}`)
  }
  if (!pageSource.includes(publicPoster)) throw new Error(`课程落地页未引用 ${lesson.id} WebP 海报`)
  totalPosterBytes += posterStat.size
}

if (totalPosterBytes > 2 * 1024 * 1024) {
  throw new Error(`课程海报总大小超过 2 MiB：${(totalPosterBytes / 1024 / 1024).toFixed(2)} MiB`)
}

const xTeaser = path.join(root, 'public/videos/campaigns/ai-native-generation-30d/2026-08-12-l01-x-teaser.mp4')
const xTeaserMetadata = JSON.parse(execFileSync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height:stream_tags=language',
  '-of', 'json',
  xTeaser,
], { encoding: 'utf8' }))
const xTeaserStreams = new Map(xTeaserMetadata.streams.map((stream) => [stream.codec_type, stream]))
const xTeaserDuration = Number(xTeaserMetadata.format?.duration)
const xTeaserBytes = Number(xTeaserMetadata.format?.size)
if (!(xTeaserDuration >= 57 && xTeaserDuration <= 59)) throw new Error(`X L01 短片时长异常：${xTeaserDuration}`)
if (xTeaserBytes <= 0 || xTeaserBytes > 5 * 1024 * 1024) throw new Error(`X L01 短片大小异常：${xTeaserBytes}`)
if (xTeaserStreams.get('video')?.codec_name !== 'h264') throw new Error('X L01 短片缺少 H.264 视频流')
if (xTeaserStreams.get('video')?.width !== 1920 || xTeaserStreams.get('video')?.height !== 1080) {
  throw new Error('X L01 短片分辨率不是 1920x1080')
}
if (xTeaserStreams.get('audio')?.codec_name !== 'aac') throw new Error('X L01 短片缺少 AAC 音频流')
if (xTeaserStreams.get('subtitle')?.codec_name !== 'mov_text') throw new Error('X L01 短片缺少字幕轨')
if (xTeaserStreams.get('subtitle')?.tags?.language !== 'zho') throw new Error('X L01 短片字幕轨未标记为中文')

process.stdout.write(
  `course video tests passed (${lessons.map((lesson) => lesson.id).join(', ')}; X teaser ${xTeaserDuration}s/${(xTeaserBytes / 1024 / 1024).toFixed(2)} MiB; posters ${(totalPosterBytes / 1024 / 1024).toFixed(2)} MiB)\n`,
)

function normalizeTranscriptText(value) {
  return value.replace(/[`*_#>\[\]（）()“”‘’：:，,。！？!?、\-—\s\d]/g, '')
}

function parseTimestamp(value) {
  const [hours, minutes, seconds] = value.split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

function parseMmSs(value) {
  const [minutes, seconds] = value.split(':').map(Number)
  return minutes * 60 + seconds
}
