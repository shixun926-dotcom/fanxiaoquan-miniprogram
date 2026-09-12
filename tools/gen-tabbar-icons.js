/**
 * tools/gen-tabbar-icons.js —— 生成 TabBar 图标（纯 Node，无第三方依赖）
 *
 * 输出 81×81 PNG 到 images/tabbar/：
 *   feed.png / feed-on.png      饭小圈（饭碗 + 热气）
 *   decide.png / decide-on.png  决定（飞镖靶盘）
 *   profile.png / profile-on.png 我的（人形剪影）
 * -on 为选中态（主色 #FF6B35），非选中为灰 #8A94A6
 *
 * 用法：node tools/gen-tabbar-icons.js
 * 重新生成或改颜色后运行一次即可。
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 81          // 输出尺寸（微信 TabBar 推荐 81×81）
const SS = 4             // 超采样倍数（抗锯齿）
const GRAY = [138, 148, 166]
const ORANGE = [255, 107, 53]

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter: none
    pixels.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- 形状测试（81 坐标系） ---------- */

const sq = (v) => v * v

function inCircle(x, y, cx, cy, r) {
  return sq(x - cx) + sq(y - cy) <= sq(r)
}

function inEllipse(x, y, cx, cy, rx, ry) {
  return sq((x - cx) / rx) + sq((y - cy) / ry) <= 1
}

// 环：外圆内且不在内圆内
function inRing(x, y, cx, cy, rOuter, rInner) {
  return inCircle(x, y, cx, cy, rOuter) && !inCircle(x, y, cx, cy, rInner)
}

// 线段胶囊：点到线段的距离 <= w
function inSegment(x, y, x0, y0, x1, y1, w) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((x - x0) * dx + (y - y0) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return sq(x - (x0 + t * dx)) + sq(y - (y0 + t * dy)) <= sq(w)
}

// 层：{ test, clip } —— test 命中且 clip 矩形内则着色
function layer(test, clip) {
  return { test, clip }
}

function renderIcon(layers, color) {
  const px = Buffer.alloc(SIZE * SIZE * 4)
  const ss = SIZE * SS
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let hits = 0
      // 超采样：每个输出像素取 SS×SS 个子点，按命中比例决定透明度
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px_ = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          for (const L of layers) {
            if (L.clip && (px_ < L.clip[0] || py < L.clip[1] || px_ > L.clip[2] || py > L.clip[3])) continue
            if (L.test(px_, py)) {
              hits++
              break
            }
          }
        }
      }
      const a = Math.round((hits / (SS * SS)) * 255)
      const i = (y * SIZE + x) * 4
      px[i] = color[0]
      px[i + 1] = color[1]
      px[i + 2] = color[2]
      px[i + 3] = a
    }
  }
  return px
}

/* ---------- 图标定义 ---------- */

// 饭小圈：热气 + 饭碗（米堆 / 碗身 / 碗沿）
function feedLayers() {
  return [
    layer((x, y) => inEllipse(x, y, 40, 41, 17, 6.5)),                       // 米堆
    layer((x, y) => inCircle(x, y, 40, 52, 19), [0, 51, 81, 81]),            // 碗身（下半圆）
    layer((x, y) => inEllipse(x, y, 40, 50, 20, 6)),                         // 碗沿
    // 两缕热气（三段短横线模拟波浪）
    layer((x, y) => inSegment(x, y, 32, 19, 37, 19, 1.2)),
    layer((x, y) => inSegment(x, y, 31, 23.5, 36, 23.5, 1.2)),
    layer((x, y) => inSegment(x, y, 32, 28, 37, 28, 1.2)),
    layer((x, y) => inSegment(x, y, 44, 19, 49, 19, 1.2)),
    layer((x, y) => inSegment(x, y, 43, 23.5, 48, 23.5, 1.2)),
    layer((x, y) => inSegment(x, y, 44, 28, 49, 28, 1.2))
  ]
}

// 决定：飞镖靶盘（三环 + 中心点）
function decideLayers() {
  return [
    layer((x, y) => inRing(x, y, 40.5, 40.5, 20, 15.5)),
    layer((x, y) => inRing(x, y, 40.5, 40.5, 13.5, 9.5)),
    layer((x, y) => inRing(x, y, 40.5, 40.5, 7.5, 4.5)),
    layer((x, y) => inCircle(x, y, 40.5, 40.5, 2.8))
  ]
}

// 我的：人形剪影（头 + 肩部圆弧）
function profileLayers() {
  return [
    layer((x, y) => inCircle(x, y, 40.5, 28.5, 10)),                          // 头
    layer((x, y) => inEllipse(x, y, 40.5, 62, 19, 18), [0, 46, 81, 81])       // 肩部（下半椭圆）
  ]
}

/* ---------- 输出 ---------- */

const OUT = path.join(__dirname, '..', 'images', 'tabbar')
fs.mkdirSync(OUT, { recursive: true })

const ICONS = [
  { name: 'feed', layers: feedLayers },
  { name: 'decide', layers: decideLayers },
  { name: 'profile', layers: profileLayers }
]

for (const icon of ICONS) {
  const layers = icon.layers()
  for (const [suffix, color] of [
    ['', GRAY],
    ['-on', ORANGE]
  ]) {
    const file = path.join(OUT, icon.name + suffix + '.png')
    fs.writeFileSync(file, encodePNG(SIZE, SIZE, renderIcon(layers, color)))
    console.log('generated:', path.relative(process.cwd(), file))
  }
}
