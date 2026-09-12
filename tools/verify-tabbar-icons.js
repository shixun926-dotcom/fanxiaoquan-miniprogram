/**
 * tools/verify-tabbar-icons.js —— 解码验证生成的 TabBar 图标 PNG
 * 检查：PNG 签名 / IHDR 尺寸 / IDAT 可解压 / 像素内容分布（不透明区域包围盒、覆盖率）
 * 用法：node tools/verify-tabbar-icons.js
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', 'images', 'tabbar')
const FILES = ['feed.png', 'feed-on.png', 'decide.png', 'decide-on.png', 'profile.png', 'profile-on.png']

function decodePNG(buf) {
  // 签名
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('bad PNG signature')
  // 逐块解析
  let off = 8
  let width = 0, height = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.slice(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  if (!width || !height) throw new Error('no IHDR')
  // 解压
  const raw = zlib.inflateSync(Buffer.concat(idat))
  return { width, height, bitDepth, colorType, raw }
}

for (const f of FILES) {
  const file = path.join(DIR, f)
  const buf = fs.readFileSync(file)
  let info
  try {
    info = decodePNG(buf)
  } catch (e) {
    console.log(`${f}: FAIL (${e.message})`)
    continue
  }
  if (info.bitDepth !== 8 || info.colorType !== 6) {
    console.log(`${f}: FAIL (bitDepth=${info.bitDepth} colorType=${info.colorType}, 期望 8/RGBA)`)
    continue
  }
  const { width, height, raw } = info
  // 统计不透明像素与包围盒
  let minX = width, minY = height, maxX = -1, maxY = -1, opaque = 0
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4)
    if (raw[rowStart] !== 0) { console.log(`${f}: FAIL (filter byte ${raw[rowStart]} ≠ 0)`) }
    for (let x = 0; x < width; x++) {
      const i = rowStart + 1 + x * 4
      if (raw[i + 3] > 128) {
        opaque++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const cov = ((opaque / (width * height)) * 100).toFixed(1)
  const box = opaque ? `${minX},${minY}-${maxX},${maxY}` : 'empty'
  console.log(`${f}: OK ${width}×${height} ${buf.length}B coverage=${cov}% bbox=${box}`)
}
