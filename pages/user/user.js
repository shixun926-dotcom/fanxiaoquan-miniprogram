/**
 * pages/user —— 用户主页（UI/社交功能设计文档.md F2/F3/F4/F5/F6/F7）
 * 任意头像点击进入（pages/user/user?userId=xxx）；userId 为空或缺省 = 查看自己的主页
 * 结构：头像昵称等级称号 / 关注·粉丝·作品三计数 / 关注按钮状态矩阵 / 作品·关注·粉丝三 tab
 * 交互零侵入：点赞复用现有 likes 动作；删除仅自己主页的帖子（沿用 posts.delete）
 */
const api = require('../../utils/api')
const level = require('../../utils/level')
const badges = require('../../utils/badges')
const { getDishImage } = require('../../utils/dishes-img') // 菜品图映射（UI/菜品图片回显设计方案.md）

// Lv 徽章分层配色（与饭小圈帖子卡片一致：9+ 虹彩 / 6-8 金 / 3-5 银 / 0-2 陶土）
function lvColor(lv) {
  if (lv >= 9) return 'linear-gradient(135deg, #E8432E, #FF6B35, #FFB400)'
  if (lv >= 6) return 'linear-gradient(135deg, #FFC53D, #F59E0B)'
  if (lv >= 3) return 'linear-gradient(135deg, #AAB6C2, #7A8A99)'
  return 'linear-gradient(135deg, #C9976B, #A5714A)'
}

Page({
  data: {
    self: false, // 是否自己的主页
    profile: null,
    levelInfo: { title: '', tagline: '', emoji: '' },
    lvBg: '',
    tab: 'works', // works | following | followers
    works: [],
    worksPage: 0,
    worksHasMore: false,
    worksLoading: false,
    following: [],
    followers: [],
    followBusy: false, // 关注按钮防抖
    showLogin: false,
    loading: true,

    // 徽章：详情弹层 / 全部徽章展开面板（成就徽章系统）
    showBadgeModal: false,
    curBadge: {},
    showAllBadges: false,
    allBadges: [],
    allUnlockedCount: 0,
    badgeTotal: badges.BADGES.length,
    avatarRing: '' // 头像框权益：'' | 'gold' | 'rainbow'
  },

  onLoad(options) {
    this.userId = (options && options.userId) || ''
    this.setData({ self: !this.userId })
  },

  onShow() {
    this.loadProfile()
    this.loadWorks(0)
  },

  // 未登录状态跟随全局：登录面板关闭后刷新（关系/作品可能变化）
  closeLogin() {
    this.setData({ showLogin: false })
    this.loadProfile()
  },

  /* ---------- 主页信息 ---------- */
  loadProfile() {
    api
      .getUserProfile(this.userId)
      .then((p) => {
        const t = level.getLevelTitle(p.level)
        const unlocked = p.authorBadges || []
        this.setData({
          profile: p,
          avatarText: (p.nickname || '饭').slice(0, 1),
          levelInfo: { title: t.title, tagline: t.tagline, emoji: t.emoji },
          lvBg: lvColor(p.level),
          // 徽章展示位：仅已拥有的（目录顺序前 5 枚）；展开面板用全量 15 枚；头像框权益
          displayBadges: badges.buildDisplayBadges(unlocked, 5),
          allBadges: badges.buildAllBadges(unlocked),
          allUnlockedCount: unlocked.length,
          avatarRing: badges.avatarRingOf(unlocked)
        })
        wx.setNavigationBarTitle({ title: p.nickname.slice(0, 12) || (this.data.self ? '我的主页' : 'TA的主页') })
      })
      .catch((err) => api.toastError(err))
      .then(() => this.setData({ loading: false }))
  },

  /* ---------- 成就徽章（展示位 5 枚：已解锁优先 + 随机补；点击展开全部徽章） ---------- */
  // 徽章行点击 → 展开全部徽章面板
  openBadgesPanel() {
    this.setData({
      showAllBadges: true,
      allBadges: this.data.allBadges,
      allUnlockedCount: this.data.allUnlockedCount
    })
  },

  // 展开面板内点单枚徽章 → 详情弹层
  onAllBadgeTap(e) {
    const b = e.detail || {}
    this.setData({
      curBadge: {
        key: b.key,
        name: b.name || '',
        rarity: b.rarity || '普通',
        unlockTime: b.unlockTime || 0,
        unlocked: !!b.unlocked
      },
      showBadgeModal: true
    })
  },

  onAllBadgesClose() {
    this.setData({ showAllBadges: false })
  },

  onBadgeModalClose() {
    this.setData({ showBadgeModal: false })
  },

  /* ---------- 三计数 → 切 tab ---------- */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab })
    if (tab === 'following' && !this.data.following.length) this.loadFollowing(0)
    if (tab === 'followers' && !this.data.followers.length) this.loadFollowers(0)
  },

  /* ---------- 关注 / 取关（幂等 + 防抖，取关二次确认） ---------- */
  toggleFollow() {
    if (this.data.followBusy || !this.data.profile || this.data.self) return
    const p = this.data.profile
    if (p.relationship === 'me') return
    // 未登录先弹登录面板
    api
      .isLoggedIn()
      .then((loggedIn) => {
        if (!loggedIn) {
          this.setData({ showLogin: true })
          return
        }
        if (p.relationship === 'following' || p.relationship === 'both') {
          wx.showModal({
            title: '取消关注',
            content: '确定不再关注' + p.nickname + '吗？',
            success: (r) => {
              if (r.confirm) this.doUnfollow(p.userId)
            }
          })
        } else {
          this.doFollow(p.userId)
        }
      })
      .catch((err) => api.toastError(err))
  },

  doFollow(target) {
    this.setData({ followBusy: true })
    api
      .follow(target)
      .then((res) => {
        this.setData({ 'profile.relationship': res.relationship, followBusy: false })
        wx.showToast({ title: '已关注 ♥', icon: 'none' })
      })
      .catch((err) => {
        this.setData({ followBusy: false })
        api.toastError(err)
      })
  },

  doUnfollow(target) {
    this.setData({ followBusy: true })
    api
      .unfollow(target)
      .then((res) => {
        this.setData({ 'profile.relationship': res.relationship, followBusy: false })
        wx.showToast({ title: '已取消关注', icon: 'none' })
      })
      .catch((err) => {
        this.setData({ followBusy: false })
        api.toastError(err)
      })
  },

  /* ---------- 发消息（仅互关） ---------- */
  goChat() {
    if (!this.data.profile || this.data.profile.relationship !== 'both') {
      wx.showToast({ title: '互相关注后可发消息', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/chat/chat?to=' + this.data.profile.userId })
  },

  /* ---------- 作品 tab（分页 10，触底加载） ---------- */
  loadWorks(page) {
    if (this.data.worksLoading) return
    this.setData({ worksLoading: true })
    api
      .getWorks(this.userId, page)
      .then((res) => {
        let list = page === 0 ? res.list : this.data.works.concat(res.list)
        list = list.map((w) => ({ ...w, img: getDishImage(w.dish) })) // 作品占位菜品图（失败 onWorkImgError 回退 emoji）
        this.setData({
          works: list,
          worksPage: page,
          worksHasMore: res.hasMore,
          worksLoading: false
        })
      })
      .catch((err) => {
        this.setData({ worksLoading: false })
        api.toastError(err)
      })
  },

  // 作品占位菜品图加载失败：清空 img 回退 emoji（UI/菜品图片回显设计方案.md §5）
  onWorkImgError(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const works = this.data.works.map((w) => (w.id === id && w.img ? { ...w, img: '' } : w))
    this.setData({ works })
  },

  loadMoreWorks() {
    if (this.data.worksHasMore && !this.data.worksLoading) {
      this.loadWorks(this.data.worksPage + 1)
    }
  },

  // 作品卡片点赞（晒吃帖 / 教程复用现有动作）
  toggleWorkLike(e) {
    const { id, type, idx } = e.currentTarget.dataset
    const op = type === 'cook' ? api.toggleCookLike(id) : api.toggleLike(id)
    op.then((res) => {
      const works = this.data.works.slice()
      const item = works[idx]
      if (!item) return
      const liked = !item.liked
      item.liked = liked
      item.likes = Math.max(0, (item.likes || 0) + (liked ? 1 : -1))
      this.setData({ works })
      if (liked && res && res.expGained) {
        wx.showToast({ title: '点赞成功 +' + res.expGained + '经验 🎉', icon: 'none' })
      }
    }).catch((err) => api.toastError(err))
  },

  // 删除自己的晒吃帖（仅我的主页；教程删除本期不做）
  deleteWork(e) {
    const { id, idx } = e.currentTarget.dataset
    wx.showModal({
      title: '删除这条晒吃',
      content: '删除后不可恢复，确定吗？',
      success: (r) => {
        if (!r.confirm) return
        api
          .deletePost(id)
          .then(() => {
            const works = this.data.works.slice()
            works.splice(idx, 1)
            this.setData({ works })
            wx.showToast({ title: '已删除', icon: 'none' })
            this.loadProfile() // 作品数刷新
          })
          .catch((err) => api.toastError(err))
      }
    })
  },

  /* ---------- 关注 / 粉丝列表（分页 20） ---------- */
  loadFollowing(page) {
    api
      .getFollowing(this.userId, page)
      .then((res) => {
        const list = (page === 0 ? res.list : this.data.following.concat(res.list)).map((it) => ({
          ...it,
          avatarText: (it.nickname || '饭').slice(0, 1)
        }))
        this.setData({ following: list })
      })
      .catch((err) => api.toastError(err))
  },

  loadFollowers(page) {
    api
      .getFollowers(this.userId, page)
      .then((res) => {
        const list = (page === 0 ? res.list : this.data.followers.concat(res.list)).map((it) => ({
          ...it,
          avatarText: (it.nickname || '饭').slice(0, 1)
        }))
        this.setData({ followers: list })
      })
      .catch((err) => api.toastError(err))
  },

  loadMoreFollowing() {
    if (this.data.following.length % 20 === 0) this.loadFollowing(this.data.following.length / 20)
  },

  loadMoreFollowers() {
    if (this.data.followers.length % 20 === 0) this.loadFollowers(this.data.followers.length / 20)
  },

  // 关注/粉丝列表项 → 对方主页（复用本页，刷新后新页面栈）
  openRelation(e) {
    const openid = e.currentTarget.dataset.openid
    if (!openid) return
    wx.navigateTo({ url: '/pages/user/user?userId=' + openid })
  },

  // 作品图片预览
  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset
    if (url) wx.previewImage({ current: url, urls: urls || [url] })
  },

  openLogin() {
    this.setData({ showLogin: true })
  }
})
