import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'decode-zsxq-share-qr.mjs')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zsxq-share-qr-'))

try {
  const imageFile = path.join(tempDir, 'topic-share.png')
  generateQr('https://t.zsxq.com/1uK2r', imageFile)
  const result = JSON.parse(execFileSync(process.execPath, [script, '--input', imageFile, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
  assert.equal(result.destination, 'https://t.zsxq.com/1uK2r')
  assert.equal(result.destinationType, 'verified_topic_share_shortlink')
  assert.match(result.imageSha256, /^[a-f0-9]{64}$/)
  assert.equal(result.decoder, 'macos_vision_qr')
  assert.equal(result.writesPerformed, false)

  const invalidPng = path.join(tempDir, 'not-a-png.png')
  fs.writeFileSync(invalidPng, 'x'.repeat(256))
  const rejectedPng = spawnSync(process.execPath, [script, '--input', invalidPng], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.notEqual(rejectedPng.status, 0)
  assert.match(rejectedPng.stderr, /必须是 PNG/)

  const outsideTemp = spawnSync(process.execPath, [script, '--input', path.join(projectDir, 'package.json')], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.notEqual(outsideTemp.status, 0)
  assert.match(outsideTemp.stderr, /只允许系统临时目录/)

  const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
  assert.match(help, /只读/)
  assert.match(help, /不读取剪贴板/)
  assert.match(help, /t\.zsxq\.com/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('ZSXQ share QR decoder tests passed')

function generateQr(value, output) {
  const swift = `
import Foundation
import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins

guard let value = ProcessInfo.processInfo.environment["ZSXQ_TEST_QR_VALUE"],
      let output = ProcessInfo.processInfo.environment["ZSXQ_TEST_QR_OUTPUT"] else {
  fatalError("missing test input")
}
let filter = CIFilter.qrCodeGenerator()
filter.message = Data(value.utf8)
filter.correctionLevel = "M"
guard let image = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)) else {
  fatalError("qr generation failed")
}
let representation = NSCIImageRep(ciImage: image)
let nsImage = NSImage(size: representation.size)
nsImage.addRepresentation(representation)
guard let tiff = nsImage.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("png generation failed")
}
try png.write(to: URL(fileURLWithPath: output))
`
  execFileSync('/usr/bin/swift', ['-e', swift], {
    cwd: projectDir,
    env: {
      ...process.env,
      ZSXQ_TEST_QR_VALUE: value,
      ZSXQ_TEST_QR_OUTPUT: output,
    },
  })
}
