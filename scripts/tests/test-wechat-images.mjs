#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  downloadWechatImages,
  localizeWechatHtmlImages,
  normalizeWechatImages,
} from '../lib/wechat-images.mjs'

const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-images-test-'))
const source = 'https://mmbiz.qpic.cn/example/640?tp=webp'
const requests = []
const fakeFetch = async (url, options) => {
  requests.push({ url, options })
  return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
    headers: { 'content-type': 'image/webp', 'content-length': '4' },
  })
}

try {
  const normalized = normalizeWechatImages(`<img src="" data-src="${source}">`)
  assert.match(normalized, new RegExp(source.replace(/[?]/g, '\\?')))
  assert.doesNotMatch(normalized, /data-src/)

  const html = `<p>正文</p><img data-src="${source}"><img src="${source}"><img src="https://example.com/keep.png">`
  const localized = await localizeWechatHtmlImages(html, {
    slug: 'wechat-test-post',
    publicDir: temporaryDir,
    fetchImpl: fakeFetch,
  })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, source)
  assert.equal(requests[0].options.headers.Referer, 'https://mp.weixin.qq.com/')
  assert.equal((localized.match(/\/images\/wechat\/wechat-test-post\/image-01\.webp/g) || []).length, 2)
  assert.match(localized, /https:\/\/example\.com\/keep\.png/)
  assert.deepEqual(
    await fs.readFile(path.join(temporaryDir, 'images', 'wechat', 'wechat-test-post', 'image-01.webp')),
    Buffer.from([0x52, 0x49, 0x46, 0x46]),
  )

  await assert.rejects(
    downloadWechatImages([source], {
      slug: 'wechat-unsupported',
      publicDir: temporaryDir,
      fetchImpl: async () => new Response('not an image', { headers: { 'content-type': 'text/plain' } }),
    }),
    /图片类型不受支持/,
  )
  await assert.rejects(
    downloadWechatImages([source], { slug: '../unsafe', publicDir: temporaryDir, fetchImpl: fakeFetch }),
    /目录名不安全/,
  )

  console.log('公众号图片本地化测试通过：可信域名、去重、请求头、类型与路径边界均已覆盖。')
} finally {
  await fs.rm(temporaryDir, { recursive: true, force: true })
}
