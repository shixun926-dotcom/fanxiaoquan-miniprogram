/**
 * pages/profile —— 我的
 * 默认外卖平台偏好、收藏、决定历史、重置演示数据、等级展示
 * 数据全部走微信云开发（utils/api.js），收藏/历史/偏好/经验按 openid 存储
 */
const catalog = require('../../utils/mock')
const api = require('../../utils/api')
const level = require('../../utils/level')
const badges = require('../../utils/badges')
const { getDishImage } = require('../../utils/dishes-img') // 菜品图映射（UI/菜品图片回显设计方案.md）

// 等级信息 + 称号装饰字段（星级食神徽章/称号/一碗饭进度条），供「我的」页渲染
// badgeRing：徽章 conic-gradient 光环；非满级用称号色画进度环（跟着一碗饭进度走），9+ 级虹彩全环
function decorateLevelInfo(info) {
  const t = level.getLevelTitle(info.level)
  const pctDeg = Math.round(info.percent * 3.6)
  const badgeRing =
    t.badge === 'rainbow'
      ? 'conic-gradient(#E8432E, #FF6B35, #FFB400, #4CAF50, #FF6B35, #E8432E)'
      : 'conic-gradient(' + t.badge + ' ' + pctDeg + 'deg, #F3E3D3 ' + pctDeg + 'deg 360deg)'
  return {
    ...info,
    title: t.title,
    tagline: t.tagline,
    emoji: t.emoji,
    badge: t.badge,
    badgeRing,
    spoonPct: Math.max(info.percent, 3), // 进度为 0 时勺子也别掉出碗外
    nextTitle: info.isMax ? '' : level.getLevelTitle(info.level + 1).title
  }
}

Page({
  data: {
    user: { loggedIn: false, nickname: '', avatar: '', exp: 0 },
    levelInfo: decorateLevelInfo(level.getLevelInfo(0)),
    platforms: catalog.PLATFORMS,
    platformKey: 'meituan',
    favorites: [],
    history: [],
    postsCount: 0,
    stats: { favorites: 0, history: 0, posts: 0 },
    unreadCount: 0, // 消息未读总数（红点，V2 F9）
    showAllHistory: false, // 最近决定展开/折叠（默认仅显示近 10 条）
    displayHistory: [], // 实际渲染的决定列表（折叠时截取前 10）
    showLogin: false,

    // 成就徽章（UI/成就徽章设计文档.md）
    badges: { list: [], badgeTotal: 15, unlockedCount: 0 },
    avatarRing: '', // 头像框权益：'' | 'gold' | 'rainbow'
    showAllWall: false, // 徽章墙展开/折叠（默认仅显示前 5 枚，仿「最近决定」）
    displayWall: [], // 实际渲染的墙（折叠时截取前 5）
    showBadgeModal: false,
    curBadge: {},
    showBadgeToast: false,
    toastBadges: []
  },

  onShow() {
    this.syncTabBar()
    this.refresh()
    this.refreshUnread()
    this.maybePromptLogin()
  },

  // 消息未读红点（V2 F9：未读会话在「我的」页消息入口显示红点数）
  refreshUnread() {
    api
      .getUnreadCount()
      .then((count) => this.setData({ unreadCount: count || 0 }))
      .catch(() => {})
  },

  /* ---------- 社交入口（V1 F2 / V2 F8） ---------- */

  // 我的主页：无 userId 参数 = 查看自己的主页
  openMyHome() {
    wx.navigateTo({ url: '/pages/user/user' })
  },

  openMessages() {
    wx.navigateTo({ url: '/pages/messages/messages' })
  },

  // 「更多」页（打赏功能设计文档 F1：意见反馈/我的反馈/打赏开发者已迁入 pages/more）
  openMore() {
    wx.navigateTo({ url: '/pages/more/more' })
  },

  // 分享卡片（品牌宣传图，取自客户交付 UI/Photos 设计稿）
  onShareAppMessage() {
    return { title: '饭小圈 · 看看大家都在吃什么', imageUrl: '/images/brand/share.jpg' }
  },

  // 悬浮 Dock 选中态同步
  syncTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  refresh() {
    // 经验/等级/平台偏好单独拉取并立即渲染：任一列表接口失败不再导致整页卡在旧数据
    // （之前 Promise.all 一锅端，getPosts 等列表偶发失败时经验"看着不到账"）
    api
      .getUser()
      .then((user) =>
        this.setData({
          user,
          levelInfo: decorateLevelInfo(level.getLevelInfo(user.exp)),
          platformKey: user.platform || 'meituan'
        })
      )
      .catch(() => {})
    // 列表数据各自独立更新，失败不影响其它区块
    api
      .getFavorites()
      .then((favorites) => {
        // 行图标菜品图（加载失败 onRowImgError 回退 emoji）
        favorites = favorites.map((f) => ({ ...f, img: getDishImage(f.dish) }))
        this.setData({ favorites })
        this.applyStats()
      })
      .catch(() => {})
    api
      .getHistory()
      .then((history) => {
        history = history.map((h) => ({ ...h, img: getDishImage(h.dish) }))
        // 折叠态只渲染最近 10 条（云端已按时间倒序）
        this.setData({
          history,
          displayHistory: this.data.showAllHistory ? history : history.slice(0, 10)
        })
        this.applyStats()
      })
      .catch(() => {})
    api
      .getPosts()
      .then((posts) => {
        this.setData({ postsCount: posts.length })
        this.applyStats()
      })
      .catch(() => {})
    // 徽章墙：进度查询独立拉取，失败不影响其它区块
    this.refreshBadges()
  },

  /* ---------- 成就徽章（UI/成就徽章设计文档.md） ---------- */

  // 徽章墙：云端返回 15 枚全量进度，已解锁在前、组内按目录顺序
  refreshBadges() {
    api
      .getBadgeProgress()
      .then((res) => {
        const list = badges.sortForWall(res.list || [])
        const unlocked = (res.list || []).filter((b) => b.unlocked)
        this.setData({
          badges: {
            list,
            badgeTotal: res.badgeTotal || 0,
            unlockedCount: res.unlockedCount || 0
          },
          displayWall: this.data.showAllWall ? list : list.slice(0, 5), // 默认折叠一行
          avatarRing: badges.avatarRingOf(unlocked) // 头像框权益（金框/虹彩框）
        })
      })
      .catch(() => {})
  },

  // 徽章墙展开/折叠（仿「最近决定」交互：展开全部 ▾ / 收起 ▴）
  toggleWall() {
    const showAll = !this.data.showAllWall
    this.setData({
      showAllWall: showAll,
      displayWall: showAll ? this.data.badges.list : this.data.badges.list.slice(0, 5)
    })
  },

  // 墙内点击 → 详情弹层（含进度条 / 解锁时间）
  onBadgeTap(e) {
    const key = e.currentTarget.dataset.key
    const item = (this.data.badges.list || []).find((b) => b.key === key)
    if (!item) return
    this.setData({ curBadge: item, showBadgeModal: true })
  },

  onBadgeModalClose() {
    this.setData({ showBadgeModal: false })
  },

  // 行为响应（如兑换码）解锁新徽章 → 弹解锁提示
  handleNewBadges(newBadges) {
    if (!newBadges || !newBadges.length) return
    this.setData({ toastBadges: newBadges, showBadgeToast: true })
  },

  onBadgeToastClose() {
    this.setData({ showBadgeToast: false })
  },

  // 数据概览计数（收藏/决定记录/晒吃帖），从当前已加载的数据汇总
  applyStats() {
    this.setData({
      stats: {
        favorites: this.data.favorites.length,
        history: this.data.history.length,
        posts: this.data.postsCount
      }
    })
  },

  /* ---------- 兑换码（输入逻辑独立在 components/redeem-code 组件内） ---------- */

  // 组件兑换成功：刷新等级经验 + 徽章解锁提示（兑换收藏家）
  onRedeemed(e) {
    this.refresh()
    this.handleNewBadges(e && e.detail && e.detail.newBadges)
  },

  /* ---------- 最近决定展开/折叠（默认仅显示近 10 条） ---------- */
  toggleHistory() {
    const showAll = !this.data.showAllHistory
    this.setData({
      showAllHistory: showAll,
      displayHistory: showAll ? this.data.history : this.data.history.slice(0, 10)
    })
  },

  /* ---------- 微信授权登录 ---------- */
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
    this.refresh() // 登录成功后刷新头部昵称头像
  },

  onHeadAction() {
    if (this.data.user.loggedIn) {
      wx.showModal({
        title: '退出登录',
        content: '退出后昵称头像将不再展示，确定吗？',
        success: (r) => {
          if (r.confirm) {
            api
              .clearUser()
              .then(() => this.refresh())
              .catch((err) => api.toastError(err))
          }
        }
      })
    } else {
      this.openLogin()
    }
  },

  /* ---------- 默认外卖平台偏好 ---------- */
  selectPlatform(e) {
    const key = e.currentTarget.dataset.key
    api
      .setPlatform(key)
      .then(() => {
        this.setData({ platformKey: key })
        wx.showToast({ title: '已设为默认偏好', icon: 'none' })
      })
      .catch((err) => api.toastError(err))
  },

  /* ---------- 收藏 ---------- */
  copyDish(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.dish })
  },

  removeFav(e) {
    api
      .removeFavorite(e.currentTarget.dataset.dish)
      .then(() => this.refresh())
      .catch((err) => api.toastError(err))
  },

  // 收藏 / 历史行菜品图加载失败：清空 img 回退 emoji（UI/菜品图片回显设计方案.md §5）
  onRowImgError(e) {
    const { list, id } = e.currentTarget.dataset // 'favorites' | 'history'
    if (!list || !id) return
    const arr = (this.data[list] || []).map((it) => (it.id === id && it.img ? { ...it, img: '' } : it))
    if (list === 'history') {
      this.setData({ history: arr, displayHistory: this.data.showAllHistory ? arr : arr.slice(0, 10) })
    } else {
      this.setData({ favorites: arr })
    }
  },

  /* ---------- 历史 ---------- */
  clearHistory() {
    wx.showModal({
      title: '清空决定历史',
      content: '历史记录清空后不可恢复，确定吗？',
      success: (r) => {
        if (r.confirm) {
          api
            .clearHistory()
            .then(() => this.refresh())
            .catch((err) => api.toastError(err))
        }
      }
    })
  },

})
