/**
 * utils/location.js —— 定位与地址获取统一封装（UI/定位与地址获取设计方案.md V0.1）
 *
 * ensureLocation({ refresh }) → Promise<{ latitude, longitude, accuracy, address, city, district, ts, from }>
 *  - 坐标系 gcj02（官方建议 + 逆编码直配）；高精度 5s 超时自动降级普通定位
 *  - 缓存 fxq_loc TTL 15 分钟；refresh:true 强制真实定位（走 60s 会话频率保护，规避 2.17.0 频率限制）
 *  - 授权：未询问走 wx.authorize；已拒绝返回 { code:'DENIED' }（由页面按钮触发 wx.openSetting）
 *  - 逆编码：腾讯位置服务 WebService（LOC_KEY 配置后生效；未配置 / 失败返回空地址 → 显示"当前位置"）
 *  - 定位成功自动上报 users.lat/lng/address（附近 50km 过滤按 users.lat/lng；上报失败不阻塞）
 */
const api = require('./api')

// 腾讯位置服务 key（WebService 逆地理编码；待客户提供后填写）
// 小程序后台 request 合法域名需加：https://apis.map.qq.com（工具 urlCheck:false 不受限）
const LOC_KEY = ''

const CACHE_KEY = 'fxq_loc'
const CACHE_TTL = 15 * 60 * 1000 // 缓存有效期 15 分钟
const MIN_INTERVAL = 60 * 1000 // 会话频率保护：两次真实定位间隔 ≥ 1 分钟
const GEO_URL = 'https://apis.map.qq.com/ws/geocoder/v1/'

let lastCallTs = 0 // 本会话最近一次真实调用时间
let lastResult = null // 本会话最近一次成功结果（频率保护窗口内复用）

// 读缓存（未过期才有效）
function readCache() {
  try {
    const c = wx.getStorageSync(CACHE_KEY)
    if (c && c.ts && Date.now() - c.ts < CACHE_TTL) return c
  } catch (e) {}
  return null
}

function writeCache(data) {
  try {
    wx.setStorageSync(CACHE_KEY, data)
  } catch (e) {}
}

// 逆地理编码（腾讯位置服务）：成功返回 { address, city, district }；未配置 / 失败返回 {}
function reverseGeocode(latitude, longitude) {
  return new Promise((resolve) => {
    if (!LOC_KEY) return resolve({}) // key 未配置：跳过逆编码（前端显示"当前位置"）
    wx.request({
      url: GEO_URL,
      data: { location: latitude + ',' + longitude, key: LOC_KEY, get_poi: 0 },
      success: (res) => {
        const d = res.data
        if (d && d.status === 0 && d.result) {
          const ad = d.result.ad_info || {}
          resolve({
            address: d.result.address || '',
            city: ad.city || '',
            district: ad.district || ''
          })
        } else {
          resolve({})
        }
      },
      fail: () => resolve({})
    })
  })
}

// 真实调用 wx.getLocation：高精度 5s 超时自动降级普通定位
function callGetLocation() {
  return new Promise((resolve, reject) => {
    const doCall = (high) => {
      wx.getLocation({
        type: 'gcj02', // 全链路统一 gcj02（与逆编码 / wx.openLocation 一致，避免 wgs84 混用偏移）
        isHighAccuracy: high,
        highAccuracyExpireTime: 5000,
        success: (loc) => resolve(loc),
        fail: () => (high ? doCall(false) : reject({ code: 'FAIL' }))
      })
    }
    doCall(true)
  })
}

// 授权检查：true 已授权 / false 已拒绝 / undefined 未询问
function checkAuth() {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => resolve(res.authSetting && res.authSetting['scope.userLocation']),
      fail: () => resolve(false)
    })
  })
}

// 请求授权（被拒时 reject）
function requestAuth() {
  return new Promise((resolve, reject) => {
    wx.authorize({
      scope: 'scope.userLocation',
      success: resolve,
      fail: reject
    })
  })
}

/**
 * 统一入口：取定位 + 逆地址解析 + 缓存 + 频率保护 + 上报
 * @param {object} [opts]
 * @param {boolean} [opts.refresh] true 强制重新定位（默认缓存未过期直接复用）
 * @returns {Promise<{latitude, longitude, accuracy, address, city, district, ts, from}>}
 *   已拒绝授权 → reject({ code: 'DENIED' })；定位失败 → reject({ code: 'FAIL' })
 */
function ensureLocation({ refresh = false } = {}) {
  // 1) 缓存优先：未过期且非强制刷新，直接复用（不触发真实调用，符合频率限制）
  if (!refresh) {
    const c = readCache()
    if (c) return Promise.resolve({ ...c, from: 'cache' })
  }
  // 2) 会话频率保护：1 分钟内重复"刷新"复用最近一次结果
  const now = Date.now()
  if (refresh && lastResult && now - lastCallTs < MIN_INTERVAL) {
    return Promise.resolve({ ...lastResult, from: 'cache' })
  }
  // 3) 授权链：已授权直接取；未询问先 authorize；已拒绝不自动弹（交给页面引导 openSetting）
  return checkAuth().then((auth) => {
    const chain = auth ? Promise.resolve() : requestAuth()
    return chain
      .then(callGetLocation)
      .then((loc) => reverseGeocode(loc.latitude, loc.longitude).then((geo) => ({ loc, geo })))
      .then(({ loc, geo }) => {
        lastCallTs = Date.now()
        const data = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy || 0,
          address: geo.address || '',
          city: geo.city || '',
          district: geo.district || '',
          ts: Date.now()
        }
        lastResult = data
        writeCache(data)
        // 上报用户文档（附近 50km 过滤按 users.lat/lng；失败不阻塞）
        api
          .setUser({ lat: data.latitude, lng: data.longitude, address: data.address, addressTs: data.ts })
          .catch(() => {})
        return { ...data, from: 'live' }
      })
      .catch((err) => {
        // 定位失败（code:'FAIL'）原样透传；authorize 被拒等无 code 错误归一为 DENIED
        throw err && err.code ? err : { code: 'DENIED' }
      })
  })
}

module.exports = { ensureLocation, readCache }
