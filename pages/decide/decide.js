/**
 * pages/decide —— 决定：转转盘 / 开盲盒
 * - 转转盘：canvas 2d 动画，每盘 30 道菜 30 选 1，可剔除分类，每次打开自动换一批
 * - 开盲盒：震动开盒（每次点击都重放动画）
 * - 结果弹层：复制菜名 / 收藏 / 去点外卖（L1 提示层）
 * 收藏与决定历史存云数据库（utils/api.js），人人互通
 */
const catalog = require('../../utils/mock')
const api = require('../../utils/api')
const { getDishImage } = require('../../utils/dishes-img') // 菜品图映射（UI/菜品图片回显设计方案.md）

// 转盘每盘扇区数：从候选菜池里抽 30 道菜，每次转动从 30 选 1
const WHEEL_SLOTS = 30

// 扇区菜名超长时省略（30 扇区空间有限，5 字以上截断）
function fitText(t, max) {
  const s = String(t || '')
  return s.length <= max ? s : s.slice(0, max) + '…'
}

Page({
  data: {
    mode: 'wheel', // wheel | box
    chips: catalog.CATEGORIES.map((c) => ({ ...c, off: false })),
    segments: [], // 当前盘面：30 道菜 [{ dish, category, emoji }]
    spinning: false,
    refreshAnim: false, // 换一批按钮点击动画开关
    opening: false,
    shaking: false,
    lidOpen: false, // 揭盖动画类（挂 600ms-900ms，摘除后 opened 静态态接管）
    boxResult: null,
    slideAnim: false, // 换盘动画期间隐藏「开涮」（新盘落定后再显现）
    reveal: null, // 揭盖瞬间弹出的美食 emoji（600ms 时刻）
    puffs: [], // 开盒热气粒子
    sparks: [], // 开盒星点粒子
    popup: { show: false, dish: '', category: '', emoji: '', source: '', faved: false },
    hint: { show: false, dish: '' },
    platformKey: 'meituan',
    showLogin: false,

    // 成就徽章：解锁提示
    showBadgeToast: false,
    toastBadges: []
  },

  onReady() {
    this.initCanvas()
  },

  onShow() {
    this.syncTabBar()
    api
      .getPlatform()
      .then((p) => this.setData({ platformKey: p }))
      .catch((err) => api.toastError(err))
    // 每次进入本页，盘面自动换一批（剔除的分类不会出现）
    this.reshuffle()
    this.maybePromptLogin()
  },

  // 分享卡片（品牌宣传图，取自客户交付 UI/Photos 设计稿）
  onShareAppMessage() {
    return { title: '饭小圈 · 今天吃点啥？', imageUrl: '/images/brand/share.jpg' }
  },

  // 悬浮 Dock 选中态同步
  syncTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  onUnload() {
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer)
      this.autoRefreshTimer = null
    }
    if (this.raf && this.canvas) {
      this.canvas.cancelAnimationFrame(this.raf)
    }
  },

  /* ---------- 微信授权登录（未登录时本会话首次进入弹一次） ---------- */
  maybePromptLogin() {
    const app = getApp()
    api
      .isLoggedIn()
      .then((loggedIn) => {
        if (!loggedIn && !app.globalData.loginPrompted) {
          app.globalData.loginPrompted = true
          this.setData({ showLogin: true })
        }
      })
      .catch(() => {})
  },

  openLogin() {
    this.setData({ showLogin: true })
  },

  closeLogin() {
    this.setData({ showLogin: false })
  },

  /* ---------- 模式切换 ---------- */
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ mode }, () => {
      // 切回转盘：canvas 节点用 hidden 保活，这里兜底重绘（旧 wx:if 会销毁重建节点导致白盘）
      if (mode === 'wheel') {
        if (this.ctx) this.draw()
        else this.initCanvas()
      }
    })
  },

  noop() {},

  /* ---------- 剔除分类 ---------- */
  toggleChip(e) {
    const name = e.currentTarget.dataset.name
    const chips = this.data.chips.map((c) =>
      c.name === name ? { ...c, off: !c.off } : c
    )
    const excluded = chips.filter((c) => c.off).map((c) => c.name)
    // 保留当前盘面里未被剔除的菜，再从候选池补足到 30 道
    const kept = this.data.segments.filter((s) => excluded.indexOf(s.category) === -1)
    const segments = kept.slice()
    catalog.sampleWheelDishes(excluded, WHEEL_SLOTS).forEach((s) => {
      if (segments.length >= WHEEL_SLOTS) return
      if (!segments.some((x) => x.dish === s.dish)) segments.push(s)
    })
    this.setData({ chips, segments })
    if (segments.length === 0) {
      wx.showToast({ title: '至少保留一个分类', icon: 'none' })
    }
    if (this.ctx && this.data.mode === 'wheel') this.draw()
  },

  /* ---------- 换一批盘面（每次打开页面自动调用，也可手动触发） ----------
   * animated = true 时做换盘滑入滑出动画，false 直接重绘（进页面时的场景） */
  reshuffle(animated) {
    const excluded = this.data.chips.filter((c) => c.off).map((c) => c.name)
    const segments = catalog.sampleWheelDishes(excluded, WHEEL_SLOTS)
    const canAnimate = animated && this.ctx && this.data.mode === 'wheel'
    // 旧盘面快照必须在 setData 前抓（此刻主画布与 data.segments 都还是旧盘面）
    const oldSnap = canAnimate ? this.snapshotWheel() : null
    this.setData({ segments })
    if (canAnimate) this.slideWheelChange(oldSnap)
    else if (this.ctx && this.data.mode === 'wheel') this.draw()
  },

  /* ---------- 换一批（按钮）---------- */
  onReshuffleTap() {
    if (this.data.spinning || this.sliding) return
    // 手动换批优先于转完后的自动换批：取消尚未触发的自动刷新
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer)
      this.autoRefreshTimer = null
    }
    // 按钮动画重放：先摘掉 anim 类，下一渲染帧再挂上（否则连续点击动画不会重启）
    this.setData({ refreshAnim: false })
    wx.nextTick(() => this.setData({ refreshAnim: true }))
    this.reshuffle(true)
  },

  // 转完自动换一批：延迟触发；期间用户再次转动或手动换批则跳过（防与进行中的动画打架）
  scheduleAutoRefresh() {
    if (this.autoRefreshTimer) clearTimeout(this.autoRefreshTimer)
    this.autoRefreshTimer = setTimeout(() => {
      this.autoRefreshTimer = null
      if (this.data.spinning || this.sliding) return
      this.reshuffle(true)
    }, 600)
  },

  // 把当前盘面快照进离屏画布（与主画布同分辨率），用于换盘滑入滑出；旧基础库不支持时返回 null
  snapshotWheel() {
    if (!wx.createOffscreenCanvas) return null
    const off = wx.createOffscreenCanvas({
      type: '2d',
      width: this.size * this.dpr,
      height: this.size * this.dpr
    })
    const octx = off.getContext('2d')
    octx.scale(this.dpr, this.dpr)
    this.renderWheel(octx, this.data.segments, this.rot)
    return off
  },

  // 换盘动画：旧盘面向左滑出屏幕左缘，新盘面从右侧滑入居中。
  // 两盘共用同一根缓动曲线同时运动（easeInOutQuart，600ms），一个连续动作，全程连贯
  slideWheelChange(oldSnap) {
    if (!this.canvas || this.sliding || !oldSnap) return
    // 快照新盘面（data.segments 此时已是新一批）
    const newSnap = this.snapshotWheel()
    if (!newSnap) {
      this.draw() // 不支持离屏画布：退回直接重绘
      return
    }

    const ctx = this.ctx
    const size = this.size
    const t0 = Date.now()
    const dur = 600
    this.sliding = true
    // 换盘期间隐藏「开涮」：不跟随盘面（避免移速不同步），落定后再淡入
    this.setData({ slideAnim: true })
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / dur)
      const e = p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2 // easeInOutQuart
      ctx.clearRect(0, 0, size, size)
      ctx.drawImage(oldSnap, -size * e, 0, size, size) // 旧盘：0 → -size，从画布左缘滑出
      ctx.drawImage(newSnap, size * (1 - e), 0, size, size) // 新盘：size → 0，从右缘滑入居中
      if (p < 1) {
        this.raf = this.canvas.requestAnimationFrame(step)
      } else {
        this.sliding = false
        this.setData({ slideAnim: false }) // 按钮动画结束，摘掉类等待下次重放
        this.draw() // 定格新盘面
      }
    }
    this.raf = this.canvas.requestAnimationFrame(step)
  },

  /* ---------- 转盘（canvas 2d） ---------- */

  initCanvas() {
    const query = wx.createSelectorQuery().in(this)
    query
      .select('#wheel')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return
        const { node: canvas, width } = res[0]
        const dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = width * dpr
        canvas.height = width * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        this.canvas = canvas
        this.ctx = ctx
        this.size = width
        this.dpr = dpr
        this.rot = 0
        this.draw()
      })
  },

  // 盘面渲染到指定 ctx（主画布或离屏画布）：扇区起始角 = 累计旋转角 + i * 扇区角
  // hitIdx > -1 时该扇区叠加命中高亮（落定的"蒸汽浓一瞬"，转完即消失）
  renderWheel(ctx, segments, rot, hitIdx) {
    const n = segments.length
    if (!ctx || !this.size || n === 0) return
    const size = this.size
    const cx = size / 2
    const cy = size / 2
    const r = size / 2 - 6
    const arc = (2 * Math.PI) / n
    const colors = catalog.WHEEL_COLORS

    ctx.clearRect(0, 0, size, size)

    // 金属锅沿（深铁底 + 顶部高光弧，大锅转盘设计规范 4.1）
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, 2 * Math.PI)
    ctx.fillStyle = '#2A1810'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, r - 3, Math.PI * 1.15, Math.PI * 1.85)
    ctx.strokeStyle = 'rgba(255, 235, 200, 0.35)'
    ctx.lineWidth = 3
    ctx.stroke()

    // 扇区（半径内收 11px 露出锅沿）
    const sr = r - 11
    for (let i = 0; i < n; i++) {
      const start = rot + i * arc
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, sr, start, start + arc)
      ctx.closePath()
      ctx.fillStyle = colors[i % colors.length]
      ctx.fill()
      ctx.strokeStyle = '#FFF6EC'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // 命中扇区高亮
    if (hitIdx > -1) {
      const start = rot + hitIdx * arc
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, sr, start, start + arc)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.30)'
      ctx.fill()
    }

    // 扇区文字（沿半径方向；30 道菜时字号缩小、5 字以上省略）
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold ' + Math.max(8, Math.round(sr / 26)) + 'px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < n; i++) {
      const mid = rot + i * arc + arc / 2
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(mid)
      ctx.fillText(fitText(segments[i].dish, 5), sr - 16, 0)
      ctx.restore()
    }

    // 中心圆（被蘸料碟覆盖）
    ctx.beginPath()
    ctx.arc(cx, cy, sr * 0.2, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  },

  draw(hitIdx) {
    this.renderWheel(this.ctx, this.data.segments, this.rot, hitIdx)
  },

  spin() {
    if (this.data.spinning || this.sliding) return // 换盘滑行中不可转动
    const segs = this.data.segments
    if (segs.length < 2) {
      wx.showToast({ title: '候选菜太少，少剔除一些分类吧', icon: 'none' })
      return
    }
    const n = segs.length
    const arc = (2 * Math.PI) / n

    // 先随机目标扇区，再反推最终旋转角：指针在正上方（-90°），
    // 需要 (目标扇区角 θ + 累计旋转角 R) ≡ 3π/2 (mod 2π)
    const idx = Math.floor(Math.random() * n)
    const theta = idx * arc + arc / 2
    let R = (3 * Math.PI) / 2 - theta
    while (R < this.rot + 6 * Math.PI) R += 2 * Math.PI // 至少再多转 3 圈

    const start = this.rot
    const delta = R - start
    const t0 = Date.now()
    const dur = 3600
    this.setData({ spinning: true })

    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / dur)
      const e = 1 - Math.pow(1 - p, 4) // easeOutQuart
      this.rot = start + delta * e
      this.draw()
      if (p < 1) {
        this.raf = this.canvas.requestAnimationFrame(step)
      } else {
        this.setData({ spinning: false })
        const hit = segs[idx]
        this.draw(idx) // 命中扇区高亮一闪，随后被自动换批的滑入动画接走
        this.showResult(hit.dish, '转盘', hit.category, hit.emoji)
        // 每次转完自动换一批：结果弹层出现后稍等片刻，盘面滑入新一批（与手动「换一批」同款动画）
        this.scheduleAutoRefresh()
      }
    }
    this.raf = this.canvas.requestAnimationFrame(step)
  },

  /* ---------- 蒸笼盲盒 ----------
   * 节奏：0ms 摇笼(盖抖 0.6s) → 600ms 揭盖上浮旋转渐隐 + 热气喷涌 + 星点四溅 + 美食弹出
   *      → 900ms 蒸笼变"蔬菜绿"定板 + 结果弹层。
   * 二次开笼先"盖回"复位（lid 回落 / reveal 淡出 / 笼身变白，0.3s transition），
   * 再从头播放同一套动画 —— 保证每次点击节奏与首次完全一致 */
  openBox() {
    if (this.opLock) return
    // 上一笼还开着：先完整盖回复位，等回落动画结束后再开始
    if (this.data.boxResult) {
      this.opLock = true
      this.setData({
        opening: false,
        shaking: false,
        boxResult: null,
        reveal: null,
        lidOpen: false,
        puffs: [],
        sparks: []
      })
      setTimeout(() => {
        this.opLock = false
        this.startOpening()
      }, 320)
      return
    }
    this.startOpening()
  },

  startOpening() {
    if (this.opLock) return
    const pool = this.data.chips.filter((c) => !c.off).map((c) => c.name)
    if (pool.length === 0) {
      wx.showToast({ title: '至少保留一个分类', icon: 'none' })
      return
    }
    this.opLock = true
    const r = catalog.randomDish(pool)
    // 热气 4 缕（左右错开、越高越细）+ 星点 8 颗（随机飞向），每次开盒都新生成
    const puffs = []
    for (let i = 0; i < 4; i++) {
      puffs.push({
        left: 120 + i * 105,
        top: 162 - i * 15,
        width: 64 + i * 15,
        height: 64 + i * 15,
        delay: i * 60
      })
    }
    const sparkColors = ['#FFB400', '#E8432E', '#4CAF50', '#FF6B35']
    const sparks = []
    for (let i = 0; i < 8; i++) {
      sparks.push({
        left: 236 + i * 26,
        top: 281,
        color: sparkColors[i % sparkColors.length],
        dx: Math.round(Math.random() * 300 - 150),
        dy: -75 - Math.round(Math.random() * 170)
      })
    }
    this.setData({ opening: true, shaking: true, lidOpen: false, boxResult: null, reveal: null, puffs, sparks })
    // 600ms：摇笼结束，揭盖 + 热气星点 + 美食弹出（lid-open 挂上，动画从头播放）
    setTimeout(() => {
      this.setData({ shaking: false, reveal: { ...r, img: getDishImage(r.dish) }, lidOpen: true })
    }, 600)
    // 900ms：定板 + 结果弹层（lid-open 摘除，opened 静态态无缝接管）
    setTimeout(() => {
      this.setData({ boxResult: r, opening: false, lidOpen: false, puffs: [], sparks: [] })
      this.opLock = false
      this.showResult(r.dish, '盲盒', r.category, r.emoji)
    }, 900)
  },

  /* ---------- 结果弹层 ---------- */
  showResult(dish, source, category, emoji) {
    const cat =
      catalog.CATEGORIES.find((c) => c.name === category) || { name: '家常菜', emoji: '🍽️' }
    const e = emoji || cat.emoji // 优先菜品专属 emoji
    // 决定历史存云数据库（返回 newBadges → 饭桌锦鲤 / 锦鲤附体解锁提示）
    api
      .addHistory({ dish, category: cat.name, emoji: e, source })
      .then((res) => this.handleNewBadges(res))
      .catch((err) => api.toastError(err))
    api
      .isFavorite(dish)
      .then((faved) =>
        this.setData({
          popup: {
            show: true,
            dish,
            category: cat.name,
            emoji: e,
            img: getDishImage(dish), // 菜品图（加载失败 onImgError 回退 emoji）
            source,
            faved
          }
        })
      )
      .catch((err) => api.toastError(err))
  },

  closePopup() {
    this.setData({ 'popup.show': false })
  },

  // 菜品图加载失败（404 / 网络）：隐藏图片回退 emoji（UI/菜品图片回显设计方案.md §5）
  onImgError(e) {
    const field = e.currentTarget.dataset.field // 'reveal' | 'popup'
    if (field) this.setData({ [field + '.img']: '' })
  },

  /* ---------- 成就徽章（UI/成就徽章设计文档.md）：解锁提示 ---------- */
  handleNewBadges(res) {
    if (!res || !res.newBadges || !res.newBadges.length) return
    this.setData({ toastBadges: res.newBadges, showBadgeToast: true })
  },

  onBadgeToastClose() {
    this.setData({ showBadgeToast: false })
  },

  copyDish() {
    wx.setClipboardData({ data: this.data.popup.dish })
  },

  toggleFav() {
    const p = this.data.popup
    const op = p.faved
      ? api.removeFavorite(p.dish)
      : api.addFavorite(p.dish, p.category, p.emoji)
    op.then((res) => {
      this.setData({ 'popup.faved': !p.faved })
      wx.showToast({ title: p.faved ? '已取消收藏' : '已收藏 ⭐', icon: 'none' })
      this.handleNewBadges(res) // 品味收藏家（收藏行为解锁）
    }).catch((err) => api.toastError(err))
  },

  // 去点外卖：复制菜名 + L1 提示层
  goOrder() {
    wx.setClipboardData({
      data: this.data.popup.dish,
      success: () => {
        const d = this.data.popup.dish
        this.setData({ 'popup.show': false, 'hint.show': true, 'hint.dish': d })
      }
    })
  },

  closeHint() {
    this.setData({ 'hint.show': false })
  }
})
