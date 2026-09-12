/**
 * utils/oss.js —— 阿里云 OSS 直传（小程序端签名，POST policy 方式）
 *
 * ┌─ 需要你填写的地方（★ 必填）────────────────────────────────────┐
 * │  在下方 OSS_CONFIG 里填两个值：                                   │
 * │    accessKeyId     ★ 阿里云 AccessKeyId                          │
 * │    accessKeySecret ★ 阿里云 AccessKeySecret                      │
 * │  获取：阿里云控制台 → 右上角头像 → AccessKey 管理                 │
 * │  建议：创建 RAM 子账号，权限只给 oss:PutObject（限 fanxiaoquan），│
 * │        别用主账号 Key                                            │
 * │  bucket / region / folder 已按你提供的地址填好，无需改动          │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ 安全提示（原型阶段）：
 *   把 AK/SK 写进小程序包会被抓包拿到，只用于本地原型演示。
 *   正式上线请改为 STS 临时凭证：配置 getStsToken() 从你自己的服务端
 *   换取临时凭证，下面 uploadImage 只改签名来源即可，流程不变。
 *
 * ⚠️ 线上环境（真机）：
 *   小程序后台 mp.weixin.qq.com → 开发管理 → 服务器域名 → uploadFile 合法域名
 *   添加：https://fanxiaoquan.oss-cn-beijing.aliyuncs.com
 *   （原型阶段 project.config.json 已设置 urlCheck:false，开发者工具不受限）
 */

const OSS_CONFIG = {
  region: 'oss-cn-beijing',
  bucket: 'fanxiaoquan',
  baseUrl: 'https://fanxiaoquan.oss-cn-beijing.aliyuncs.com',
  folder: 'fanxiaoqian/', // 上传目录前缀，可自行修改
  maxSize: 5 * 1024 * 1024, // 单张图片上限 5MB
  accessKeyId: '', // ★ 必填：你的阿里云 AccessKeyId（本仓库已脱敏，勿提交真实密钥）
  accessKeySecret: '' // ★ 必填：你的阿里云 AccessKeySecret（正式环境请改用 STS 临时凭证）
}

/* ---------- SHA-1 / HMAC-SHA1 / Base64（纯 JS 实现，供签名用） ---------- */

function asciiBytes(str) {
  const out = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff
  return out
}

function sha1(bytes) {
  const ml = bytes.length
  const withOne = ml % 64 === 63 ? [] : [0x80] // 简化：直接按标准补位
  const padded = new Uint8Array(ml + withOne.length + 8 + 63 - ((ml + withOne.length + 7) % 64))
  padded.set(bytes)
  padded[ml] = 0x80
  const dv = new DataView(padded.buffer)
  const bitLen = ml * 8
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000))
  dv.setUint32(padded.length - 4, bitLen >>> 0)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)

  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4)
    for (let t = 16; t < 80; t++) {
      const v = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]
      w[t] = (v << 1) | (v >>> 31)
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let t = 0; t < 80; t++) {
      const f =
        t < 20
          ? (b & c) | (~b & d)
          : t < 40
            ? b ^ c ^ d
            : t < 60
              ? (b & c) | (b & d) | (c & d)
              : b ^ c ^ d
      const k =
        t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const dv2 = new DataView(out.buffer)
  dv2.setUint32(0, h0)
  dv2.setUint32(4, h1)
  dv2.setUint32(8, h2)
  dv2.setUint32(12, h3)
  dv2.setUint32(16, h4)
  return out
}

function hmacSha1(keyBytes, msgBytes) {
  let k = keyBytes
  if (k.length > 64) k = sha1(k)
  const inner = new Uint8Array(64 + msgBytes.length)
  const outer = new Uint8Array(64 + 20)
  for (let i = 0; i < 64; i++) {
    const kb = k[i] || 0
    inner[i] = kb ^ 0x36
    outer[i] = kb ^ 0x5c
  }
  inner.set(msgBytes, 64)
  const innerHash = sha1(inner)
  outer.set(innerHash, 64)
  return sha1(outer)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function b64Encode(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 !== undefined ? b1 >> 4 : 0)]
    out += b1 !== undefined ? B64[((b1 & 15) << 2) | (b2 !== undefined ? b2 >> 6 : 0)] : '='
    out += b2 !== undefined ? B64[b2 & 63] : '='
  }
  return out
}

/* ---------- 上传 ---------- */

/**
 * 获取签名凭证。
 * 原型：直接读 OSS_CONFIG（需在文件顶部填写 AK/SK）。
 * 正式：改这里为 wx.request 到自己的服务端换取 STS 临时凭证并返回。
 */
function getCredentials() {
  return {
    accessKeyId: OSS_CONFIG.accessKeyId,
    accessKeySecret: OSS_CONFIG.accessKeySecret
  }
}

/**
 * 上传本地图片到 OSS，返回可访问的 URL
 * @param {string} filePath wx.chooseMedia / chooseImage 得到的本地路径
 * @param {object} [options] { onProgress: (percent) => {} }
 * @returns {Promise<string>}
 */
function uploadImage(filePath, options) {
  return new Promise((resolve, reject) => {
    const { accessKeyId, accessKeySecret } = getCredentials()
    if (!accessKeyId || accessKeyId.indexOf('请填写') === 0) {
      reject(new Error('请先在 utils/oss.js 中填写 AccessKeyId / AccessKeySecret'))
      return
    }

    // 对象路径：folder/YYYYMMDD/时间戳-随机数.扩展名（folder 可传 options.folder 覆盖，如头像目录）
    const folder = (options && options.folder) || OSS_CONFIG.folder
    // 只取真正的扩展名：真机（尤其 Android）chooseMedia 压缩图路径可能不带扩展名，
    // split('.').pop() 会把整串路径当扩展名拼进 key，OSS 会拒收
    const extMatch = filePath.match(/\.([a-zA-Z0-9]+)$/)
    const ext = (extMatch ? extMatch[1] : 'jpg').toLowerCase()
    const now = new Date()
    const p = (n) => (n < 10 ? '0' + n : '' + n)
    const day = '' + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate())
    const key = folder + day + '/' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.' + ext

    // 签名 policy：有效期 30 分钟，限上传到 folder 下、最大 maxSize
    const policyJson = JSON.stringify({
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      conditions: [
        { bucket: OSS_CONFIG.bucket },
        ['starts-with', '$key', folder],
        ['content-length-range', 0, OSS_CONFIG.maxSize]
      ]
    })
    const policy = b64Encode(asciiBytes(policyJson))
    const signature = b64Encode(hmacSha1(asciiBytes(accessKeySecret), asciiBytes(policy)))

    const task = wx.uploadFile({
      url: OSS_CONFIG.baseUrl,
      filePath,
      name: 'file',
      formData: {
        key,
        policy,
        OSSAccessKeyId: accessKeyId,
        Signature: signature
      },
      success(res) {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve(OSS_CONFIG.baseUrl + '/' + key)
        } else {
          // 403 = AK/SK 无效或权限不足；404/405 等多为配置问题
          const body = String(res.data || '').slice(0, 200)
          const hint = res.statusCode === 403
            ? 'AccessKey 无效或没有 oss:PutObject 权限'
            : '请检查 OSS 配置（bucket / region / 签名）'
          reject(new Error(hint + '（HTTP ' + res.statusCode + '）'))
        }
      },
      fail(err) {
        // 真机最常见的失败：小程序后台没配 uploadFile 合法域名
        // （project.config.json 的 urlCheck:false 只对开发者工具生效）
        const m = (err && err.errMsg) || ''
        if (/domain|域名|not in/i.test(m)) {
          reject(new Error('请在小程序后台「服务器域名」添加 uploadFile 合法域名：' + OSS_CONFIG.baseUrl))
        } else {
          reject(err)
        }
      }
    })
    if (task && task.onProgressUpdate && options && options.onProgress) {
      task.onProgressUpdate((r) => options.onProgress(r.progress))
    }
  })
}

/**
 * 串行上传多张图片（大厨TV 等场景），返回 URL 数组（与入参一一对应）
 * 串行而非 Promise.all 并发：真机上最多 9 张同时打 OSS，任一张网络抖动就整批 reject，
 * 单张必传的饭小圈因此"看起来正常"，多图却整批失败；逐张上传最稳
 * @param {string[]} filePaths 本地图片路径数组
 * @param {object} [options] 同 uploadImage 的 options
 * @returns {Promise<string[]>}
 */
function uploadImages(filePaths, options) {
  const list = Array.isArray(filePaths) ? filePaths : [filePaths]
  return list.reduce(
    (chain, f) => chain.then((acc) => uploadImage(f, options).then((url) => acc.concat(url))),
    Promise.resolve([])
  )
}

module.exports = {
  OSS_CONFIG,
  uploadImage,
  uploadImages,
  getCredentials,
  // 以下导出仅供签名逻辑自测用
  sha1,
  hmacSha1,
  b64Encode
}
