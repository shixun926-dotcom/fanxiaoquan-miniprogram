/**
 * pages/feed —— 饭小圈：三子视图（饭小圈 / 附近 50km / 大厨TV）
 *
 * 饭小圈：晒吃流（云数据库帖子，人人互通）、点赞、评论、复制菜名（外卖联动 L1）、
 *        发帖支持上传图片到阿里云 OSS（utils/oss.js）、每日上限 3 条、发帖/点赞/评论得经验
 * 附近：以我的定位为中心，展示 50km 内大家的晒吃（无发帖入口，需位置权限）
 * 大厨TV：发表做饭教程/经历，一条最多 9 张图；点赞评论与饭小圈同一套经验规则
 */
const catalog = require('../../utils/mock')
const api = require('../../utils/api')
const oss = require('../../utils/oss')
const badges = require('../../utils/badges')
const { getDishImage } = require('../../utils/dishes-img') // 菜品图映射（UI/菜品图片回显设计方案.md）
const { ensureLocation } = require('../../utils/location') // 定位统一封装（UI/定位与地址获取设计方案.md）

// 晒吃图占位渐变（无图帖子用渐变色块 + 表情，暖色系）
const GRADIENTS = [
  'linear-gradient(135deg, #FF8A3D, #E8432E)',
  'linear-gradient(135deg, #FFB400, #F47B20)',
  'linear-gradient(135deg, #F2836B, #D64541)',
  'linear-gradient(135deg, #FFC46B, #E8A020)',
  'linear-gradient(135deg, #7BC47F, #3E9B4F)',
  'linear-gradient(135deg, #FF9A6B, #E85B3A)'
]

// 等级徽章配色（星级食神档位：陶土/铜 → 银 → 金 → 虹彩，等级越高越亮）
function lvColor(lv) {
  if (lv >= 9) return 'linear-gradient(135deg, #E8432E, #FF6B35, #FFB400)' // 虹彩
  if (lv >= 6) return 'linear-gradient(135deg, #FFC53D, #F59E0B)' // 金
  if (lv >= 3) return 'linear-gradient(135deg, #AAB6C2, #7A8A99)' // 银
  return 'linear-gradient(135deg, #C9976B, #A5714A)' // 陶土/铜
}

// 每日发帖上限
const DAILY_POST_LIMIT = 3
// 大厨TV 单条最多图片数
const COOK_MAX_IMAGES = 9

Page({
  data: {
    subTab: 'feed', // 'feed' | 'nearby' | 'cooktv'

    // 饭小圈
    posts: [],
    todayPostCount: 0,

    // 附近
    nearbyPosts: [],
    nearbyLoading: false,
    nearbyNeedLocation: false,
    nearbyAddress: '', // 当前定位地址文案（"xx市 · xx区"，无逆编码结果时"当前位置"）

    // 大厨TV
    cooks: [],
    cookCommentsMap: {},

    // 帖子评论区（饭小圈/附近共用，按 postId 缓存）
    commentsMap: {},

    categories: catalog.CATEGORIES,
    postModal: false,
    form: { dish: '', category: '', imagePath: '' },
    uploading: false,
    canPublish: false,
    hint: { show: false, dish: '' },
    platformKey: 'meituan',
    showLogin: false,

    // 大厨TV 发布
    cookModal: false,
    cookForm: { title: '', content: '', imagePaths: [] },
    cookUploading: false,
    cookCanPublish: false,

    // 成就徽章：详情弹层 / 解锁提示 / 全部徽章展开面板
    showBadgeModal: false,
    curBadge: {},
    showBadgeToast: false,
    toastBadges: [],
    showAllBadges: false,
    allBadges: [],
    allUnlockedCount: 0,
    badgeTotal: badges.BADGES.length,

    // 检索（UI/检索功能设计文档.md）：三个子栏目共用搜索条
    searchActive: false, // 搜索态（列表切换为搜索结果）
    searchKeyword: '',
    searchFocus: false,
    searchResults: [],
    searchTotal: 0,
    searchPage: 0,
    searchHasMore: false,
    searchLoading: false,
    searchLoaded: false, // 首次检索完成（空态判定用）
    searchNeedLocation: false, // 附近检索无定位 → 引导开启
    searchSeq: 0 // 请求序号：竞态保护（旧响应不覆盖新结果）
  },

  onShow() {
    this.syncTabBar()
    this.setPlatform()
    this.maybePromptLogin()
    this.refreshTodayCount()
    if (this.data.subTab === 'feed') this.refresh()
    else if (this.data.subTab === 'nearby') this.refreshNearby()
    else this.refreshCooks()
  },

  // 分享卡片（品牌宣传图，取自客户交付 UI/Photos 设计稿）
  onShareAppMessage() {
    return { title: '饭小圈 · 看看大家都在吃什么', imageUrl: '/images/brand/share.jpg' }
  },

  // 悬浮 Dock 选中态同步
  syncTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  /* ---------- 子 tab 切换（切换时退出搜索态） ---------- */
  switchSubTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.subTab) return
    clearTimeout(this.searchTimer)
    this.setData({
      subTab: tab,
      searchActive: false,
      searchKeyword: '',
      searchFocus: false,
      searchResults: [],
      searchTotal: 0,
      searchLoaded: false,
      searchNeedLocation: false
    })
    if (tab === 'feed') this.refresh()
    else if (tab === 'nearby') this.refreshNearby()
    else this.refreshCooks()
  },

  /* ---------- 检索（UI/检索功能设计文档.md） ---------- */

  // 搜索条点击 → 进入搜索态并聚焦
  focusSearch() {
    this.setData({ searchActive: true, searchFocus: true })
  },

  // 输入：去空格、超 20 字截断提示，防抖 400ms 自动触发
  onSearchInput(e) {
    const kw = e.detail.value
    this.setData({ searchKeyword: kw })
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.doSearch(kw), 400)
  },

  // 键盘搜索键：立即触发（取消防抖）
  onSearchConfirm() {
    clearTimeout(this.searchTimer)
    this.doSearch(this.data.searchKeyword)
  },

  // ✕ 清空：退出搜索态回到原列表
  clearSearch() {
    clearTimeout(this.searchTimer)
    this.setData({
      searchKeyword: '',
      searchActive: false,
      searchFocus: true,
      searchResults: [],
      searchTotal: 0,
      searchLoaded: false,
      searchNeedLocation: false
    })
  },

  // 取消：退出搜索态
  cancelSearch() {
    clearTimeout(this.searchTimer)
    this.setData({
      searchKeyword: '',
      searchActive: false,
      searchFocus: false,
      searchResults: [],
      searchTotal: 0,
      searchLoaded: false,
      searchNeedLocation: false
    })
  },

  // 检索：scope 跟随当前子 tab（cooktv → cook）；序号比对丢弃旧响应
  doSearch(kw, page) {
    const keyword = String(kw || '').trim()
    if (!keyword) return
    if (keyword.length > 20) {
      wx.showToast({ title: '关键字最多 20 字', icon: 'none' })
      return
    }
    const p = page || 0
    const scope = this.data.subTab === 'cooktv' ? 'cook' : this.data.subTab
    const seq = ++this.data.searchSeq
    this.setData({ searchLoading: true })
    api
      .search(scope, keyword, p)
      .then((res) => {
        if (seq !== this.data.searchSeq) return // 竞态：已有更新的请求，丢弃
        if (res && res.needLocation) {
          this.setData({
            searchLoading: false,
            searchLoaded: true,
            searchResults: [],
            searchTotal: 0,
            searchNeedLocation: true
          })
          return
        }
        const base = (res.list || []).map((it, i) => this.mapPost(it, i))
        const list = p === 0 ? base : this.data.searchResults.concat(base)
        this.setData({
          searchResults: list,
          searchTotal: res.total || 0,
          searchPage: p,
          searchHasMore: !!res.hasMore,
          searchLoading: false,
          searchLoaded: true,
          searchNeedLocation: false
        })
        // 为搜索结果初始化评论区状态（已展开的保持原状）
        if (scope === 'cook') {
          const map = this.data.cookCommentsMap
          base.forEach((it) => {
            if (!map[it.id]) map[it.id] = { show: false, list: [], loading: false, draft: '' }
          })
          this.setData({ cookCommentsMap: map })
        } else {
          const map = this.data.commentsMap
          base.forEach((it) => {
            if (!map[it.id]) map[it.id] = { show: false, list: [], loading: false, draft: '' }
          })
          this.setData({ commentsMap: map })
        }
      })
      .catch((err) => {
        if (seq !== this.data.searchSeq) return
        this.setData({ searchLoading: false, searchLoaded: true })
        api.toastError(err)
      })
  },

  // 触底：搜索态下分页加载下一页
  onReachBottom() {
    if (
      this.data.searchActive &&
      this.data.searchHasMore &&
      !this.data.searchLoading &&
      this.data.searchKeyword.trim()
    ) {
      this.doSearch(this.data.searchKeyword, this.data.searchPage + 1)
    }
  },

  setPlatform() {
    api
      .getPlatform()
      .then((p) => this.setData({ platformKey: p }))
      .catch((err) => api.toastError(err))
  },

  // 今日已发帖数（决定「晒吃」按钮是否置灰）
  refreshTodayCount() {
    api
      .getTodayPostCount()
      .then((count) => this.setData({ todayPostCount: count }))
      .catch(() => {})
  },

  // 帖子加工（饭小圈/附近共用）：渐变占位图、点赞显示数、等级徽章色
  // 徽章展示位：仅已拥有的（目录顺序前 5 枚）；展开面板用全量 15 枚；头像框权益
  mapPost(p, i) {
    const unlocked = p.authorBadges || []
    return {
      ...p,
      img: getDishImage(p.dish), // 菜品图（无上传图时占位；加载失败 onPostImgError 回退 emoji）
      gradient: GRADIENTS[i % GRADIENTS.length],
      // 云端 likes 计数与 likers 数组始终同步，直接显示云端计数
      likeCount: p.likes,
      lvColor: lvColor(p.posterLevel),
      displayBadges: badges.buildDisplayBadges(unlocked, 5),
      allBadges: badges.buildAllBadges(unlocked),
      allUnlockedCount: (p.badgeCount || 0),
      avatarRing: badges.avatarRingOf(unlocked)
    }
  },

  // 帖子菜品图加载失败（404 / 网络）：清空 img 回退 emoji（UI/菜品图片回显设计方案.md §5）
  onPostImgError(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const patch = (arr) => arr.map((p) => (p.id === id && p.img ? { ...p, img: '' } : p))
    const data = { posts: patch(this.data.posts) }
    if (this.data.nearbyPosts) data.nearbyPosts = patch(this.data.nearbyPosts)
    this.setData(data)
  },

  /* ---------- 饭小圈 ---------- */
  refresh() {
    api
      .getPosts()
      .then((posts) => {
        const mapped = posts.map((p, i) => this.mapPost(p, i))
        // 为新帖子初始化评论区状态（已展开的保持原状）
        const commentsMap = this.data.commentsMap
        mapped.forEach((p) => {
          if (!commentsMap[p.id]) {
            commentsMap[p.id] = { show: false, list: [], loading: false, draft: '' }
          }
        })
        this.setData({ posts: mapped, commentsMap })
      })
      .catch((err) => api.toastError(err))
  },

  /* ---------- 附近（50km，以我的定位为中心） ---------- */
  refreshNearby() {
    this.setData({ nearbyLoading: true })
    // 定位统一走 utils/location.js（缓存优先：15 分钟 TTL + 60s 频率保护，不触发重复真实调用）
    ensureLocation()
      .then((loc) => {
        const addr = [loc.city, loc.district].filter(Boolean).join(' · ')
        this.setData({ nearbyAddress: addr || '当前位置', nearbyNeedLocation: false })
        return this.fetchNearbyList()
      })
      .catch((err) => {
        if (err && err.code === 'DENIED') {
          // 已拒绝授权：不重复弹授权，直接显示引导卡（"开启定位"按钮触发 openSetting）
          this.setData({ nearbyLoading: false, nearbyNeedLocation: true, nearbyPosts: [], nearbyAddress: '' })
        } else {
          // 定位失败：列表交给云函数 needLocation 兜底（无坐标 → 引导卡）
          return this.fetchNearbyList()
        }
      })
  },

  // 拉取附近列表（云函数按 users.lat/lng Haversine ≤50km 过滤）
  fetchNearbyList() {
    return api
      .getNearbyPosts()
      .then((res) => {
        if (res && res.needLocation) {
          this.setData({ nearbyLoading: false, nearbyNeedLocation: true, nearbyPosts: [] })
          return
        }
        const posts = (res && res.posts) || []
        const mapped = posts.map((p, i) => this.mapPost(p, i))
        const commentsMap = this.data.commentsMap
        mapped.forEach((p) => {
          if (!commentsMap[p.id]) {
            commentsMap[p.id] = { show: false, list: [], loading: false, draft: '' }
          }
        })
        this.setData({ nearbyPosts: mapped, commentsMap, nearbyLoading: false })
      })
      .catch((err) => {
        this.setData({ nearbyLoading: false })
        api.toastError(err)
      })
  },

  // 附近引导按钮 / 地址条"刷新"：强制重新定位（60s 频率保护内复用最近一次）；已拒绝 → 引导 openSetting
  enableLocation() {
    ensureLocation({ refresh: true })
      .then((loc) => {
        const addr = [loc.city, loc.district].filter(Boolean).join(' · ')
        this.setData({ nearbyAddress: addr || '当前位置', nearbyNeedLocation: false })
        wx.showToast({ title: '定位成功 📍', icon: 'none' })
        // 搜索态下开启定位 → 重新发起附近检索；否则刷新附近列表
        if (this.data.searchActive && this.data.searchKeyword.trim()) {
          this.doSearch(this.data.searchKeyword, 0)
        } else {
          this.fetchNearbyList()
        }
      })
      .catch((err) => {
        if (err && err.code === 'DENIED') {
          // 用户主动触发 → 引导去设置页开启（成功后自动重试）
          wx.showModal({
            title: '需要位置权限',
            content: '请在设置中开启位置信息，才能查看附近 50km 内的晒吃',
            confirmText: '去设置',
            cancelText: '取消',
            success: (r) => {
              if (r.confirm) {
                wx.openSetting({
                  success: (res) => {
                    if (res.authSetting && res.authSetting['scope.userLocation']) {
                      this.enableLocation()
                    }
                  }
                })
              }
            }
          })
        } else {
          wx.showToast({ title: '未获取到位置，请检查微信定位权限', icon: 'none', duration: 2500 })
        }
      })
  },

  // 地址条"刷新"按钮（与 enableLocation 同链路）
  refreshLoc() {
    this.enableLocation()
  },

  /* ---------- 成就徽章（UI/成就徽章设计文档.md） ---------- */

  // 行为响应里带 newBadges → 弹解锁提示
  handleNewBadges(res) {
    if (!res || !res.newBadges || !res.newBadges.length) return
    this.setData({ toastBadges: res.newBadges, showBadgeToast: true })
  },

  onBadgeModalClose() {
    this.setData({ showBadgeModal: false })
  },

  // 昵称行 5 枚徽章区点击 → 展开全部徽章面板（搜索态下数据源为 searchResults）
  openBadgesPanel(e) {
    const d = e.currentTarget.dataset
    const list = this.data.searchActive ? this.data.searchResults : this.data[d.listKey] || []
    const item = list[d.idx]
    if (!item) return
    this.setData({
      showAllBadges: true,
      allBadges: item.allBadges,
      allUnlockedCount: item.allUnlockedCount || 0
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

  onBadgeToastClose() {
    this.setData({ showBadgeToast: false })
  },

  /* ---------- F1 头像入口 → 用户主页（UI/社交功能设计文档.md） ---------- */
  openUser(e) {
    const openid = e.currentTarget.dataset.authorOpenid
    if (!openid || openid === 'system') {
      // 种子帖/系统推荐：无作者主页，轻提示避免误触无响应
      wx.showToast({ title: '系统美食推荐，暂无主页', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/user/user?userId=' + openid })
  },

  /* ---------- 微信授权登录 ---------- */
  maybePromptLogin() {
    // 未登录时，本会话首次进入任意 Tab 弹一次登录面板
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

  /* ---------- 点赞 / 评论（帖子，饭小圈 + 附近共用） ---------- */
  toggleLike(e) {
    const id = e.currentTarget.dataset.id
    api
      .toggleLike(id)
      .then((res) => {
        this.refresh()
        this.handleNewBadges(res)
        if (res && res.liked && res.expGained) {
          wx.showToast({ title: `点赞成功 +${res.expGained}经验 🎉`, icon: 'none', duration: 1500 })
        }
      })
      .catch((err) => api.toastError(err))
  },

  toggleComment(e) {
    const id = e.currentTarget.dataset.id
    const cur = this.data.commentsMap[id]
    if (cur.show) {
      this.setData({ ['commentsMap.' + id + '.show']: false })
      return
    }
    this.setData({
      ['commentsMap.' + id + '.show']: true,
      ['commentsMap.' + id + '.loading']: true
    })
    api
      .getComments(id)
      .then((list) =>
        this.setData({
          ['commentsMap.' + id + '.list']: list,
          ['commentsMap.' + id + '.loading']: false
        })
      )
      .catch((err) => {
        this.setData({ ['commentsMap.' + id + '.loading']: false })
        api.toastError(err)
      })
  },

  onCommentInput(e) {
    this.setData({
      ['commentsMap.' + e.currentTarget.dataset.id + '.draft']: e.detail.value
    })
  },

  sendComment(e) {
    const id = e.currentTarget.dataset.id
    const draft = (this.data.commentsMap[id] || {}).draft || ''
    const content = draft.trim()
    if (!content) return
    api
      .addComment(id, content)
      .then((res) =>
        api.getComments(id).then((list) => {
          this.setData({
            ['commentsMap.' + id + '.list']: list,
            ['commentsMap.' + id + '.draft']: ''
          })
          // 帖子评论数 +1（列表与搜索结果同步）
          const patch = (arr) => arr.map((p) => (p.id === id ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p))
          this.setData({
            posts: patch(this.data.posts),
            searchResults: patch(this.data.searchResults)
          })
          const title =
            res && res.expGained
              ? `评论成功 +${res.expGained}经验 🎉`
              : '评论成功（今日评论经验已达上限）'
          wx.showToast({ title, icon: 'none', duration: 1500 })
          this.handleNewBadges(res)
        })
      )
      .catch((err) => api.toastError(err))
  },

  /* ---------- 踩（不感兴趣）：隐藏该帖子，仅对本人生效 ---------- */
  setDisliked(id, val) {
    const patch = (arr) => arr.map((p) => (p.id === id ? { ...p, disliked: val } : p))
    this.setData({ posts: patch(this.data.posts), nearbyPosts: patch(this.data.nearbyPosts) })
  },

  hidePost(e) {
    const id = e.currentTarget.dataset.id
    // 先置灰（裂心变灰），请求成功后该帖子对本人生效隐藏并从列表移除
    this.setDisliked(id, true)
    api
      .hidePost(id)
      .then(() => {
        // 从饭小圈与附近列表中同时移除（云端 posts.list / nearby.list 也会过滤）；搜索态一并移除
        this.setData({
          posts: this.data.posts.filter((p) => p.id !== id),
          nearbyPosts: this.data.nearbyPosts.filter((p) => p.id !== id),
          searchResults: this.data.searchResults.filter((p) => p.id !== id)
        })
        wx.showToast({ title: '已为你隐藏该帖子 👋', icon: 'none', duration: 1500 })
      })
      .catch((err) => {
        this.setDisliked(id, false) // 失败还原为白色
        api.toastError(err)
      })
  },

  /* ---------- 删除自己发布的帖子（不可恢复） ---------- */
  deletePost(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除帖子',
      content: '删除后不可恢复，确定删除这条晒吃吗？',
      success: (r) => {
        if (!r.confirm) return
        api
          .deletePost(id)
          .then(() => {
            this.setData({
              posts: this.data.posts.filter((p) => p.id !== id),
              nearbyPosts: this.data.nearbyPosts.filter((p) => p.id !== id),
              searchResults: this.data.searchResults.filter((p) => p.id !== id)
            })
            wx.showToast({ title: '已删除', icon: 'none' })
          })
          .catch((err) => api.toastError(err))
      }
    })
  },

  /* ---------- 复制菜名 → L1 外卖联动提示层 ---------- */
  copyDish(e) {
    const dish = e.currentTarget.dataset.dish
    wx.setClipboardData({
      data: dish,
      success: () => {
        this.setData({ 'hint.show': true, 'hint.dish': dish })
      }
    })
  },

  closeHint() {
    this.setData({ 'hint.show': false })
  },

  /* ---------- 大厨TV：列表 / 点赞 / 评论 ---------- */
  refreshCooks() {
    api
      .getCookPosts()
      .then((list) => {
        const mapped = list.map((p, i) => {
          const unlocked = p.authorBadges || []
          return {
            ...p,
            likeCount: p.likes,
            lvColor: lvColor(p.posterLevel),
            displayBadges: badges.buildDisplayBadges(unlocked, 5),
            allBadges: badges.buildAllBadges(unlocked),
            allUnlockedCount: p.badgeCount || 0,
            avatarRing: badges.avatarRingOf(unlocked)
          }
        })
        const cookCommentsMap = this.data.cookCommentsMap
        mapped.forEach((p) => {
          if (!cookCommentsMap[p.id]) {
            cookCommentsMap[p.id] = { show: false, list: [], loading: false, draft: '' }
          }
        })
        this.setData({ cooks: mapped, cookCommentsMap })
      })
      .catch((err) => api.toastError(err))
  },

  toggleCookLike(e) {
    const id = e.currentTarget.dataset.id
    api
      .toggleCookLike(id)
      .then((res) => {
        this.refreshCooks()
        this.handleNewBadges(res)
        if (res && res.liked && res.expGained) {
          wx.showToast({ title: `点赞成功 +${res.expGained}经验 🎉`, icon: 'none', duration: 1500 })
        }
      })
      .catch((err) => api.toastError(err))
  },

  toggleCookComment(e) {
    const id = e.currentTarget.dataset.id
    const cur = this.data.cookCommentsMap[id]
    if (cur.show) {
      this.setData({ ['cookCommentsMap.' + id + '.show']: false })
      return
    }
    this.setData({
      ['cookCommentsMap.' + id + '.show']: true,
      ['cookCommentsMap.' + id + '.loading']: true
    })
    api
      .getCookComments(id)
      .then((list) =>
        this.setData({
          ['cookCommentsMap.' + id + '.list']: list,
          ['cookCommentsMap.' + id + '.loading']: false
        })
      )
      .catch((err) => {
        this.setData({ ['cookCommentsMap.' + id + '.loading']: false })
        api.toastError(err)
      })
  },

  onCookCommentInput(e) {
    this.setData({
      ['cookCommentsMap.' + e.currentTarget.dataset.id + '.draft']: e.detail.value
    })
  },

  sendCookComment(e) {
    const id = e.currentTarget.dataset.id
    const draft = (this.data.cookCommentsMap[id] || {}).draft || ''
    const content = draft.trim()
    if (!content) return
    api
      .addCookComment(id, content)
      .then((res) =>
        api.getCookComments(id).then((list) => {
          this.setData({
            ['cookCommentsMap.' + id + '.list']: list,
            ['cookCommentsMap.' + id + '.draft']: ''
          })
          // 教程评论数 +1（列表与搜索结果同步）
          const patch = (arr) => arr.map((c) => (c.id === id ? { ...c, commentCount: (c.commentCount || 0) + 1 } : c))
          this.setData({
            cooks: patch(this.data.cooks),
            searchResults: patch(this.data.searchResults)
          })
          const title =
            res && res.expGained
              ? `评论成功 +${res.expGained}经验 🎉`
              : '评论成功（今日评论经验已达上限）'
          wx.showToast({ title, icon: 'none', duration: 1500 })
          this.handleNewBadges(res)
        })
      )
      .catch((err) => api.toastError(err))
  },

  /* ---------- 大厨TV：发布（一条多图） ---------- */
  openCookModal() {
    this.setData({ cookModal: true })
  },

  closeCookModal() {
    this.setData({ cookModal: false })
  },

  onCookTitleInput(e) {
    this.setData({ 'cookForm.title': e.detail.value })
    this.updateCookCanPublish()
  },

  onCookContentInput(e) {
    this.setData({ 'cookForm.content': e.detail.value })
  },

  updateCookCanPublish() {
    this.setData({ cookCanPublish: !!this.data.cookForm.title.trim() })
  },

  pickCookImages() {
    if (this.data.cookUploading) return
    const remain = COOK_MAX_IMAGES - this.data.cookForm.imagePaths.length
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 9 张', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath)
        this.setData({
          'cookForm.imagePaths': this.data.cookForm.imagePaths.concat(paths)
        })
      }
    })
  },

  removeCookImage(e) {
    const idx = e.currentTarget.dataset.index
    const paths = this.data.cookForm.imagePaths.slice()
    paths.splice(idx, 1)
    this.setData({ 'cookForm.imagePaths': paths })
  },

  previewImage(e) {
    const urls = e.currentTarget.dataset.urls || []
    const current = e.currentTarget.dataset.url
    if (urls.length) wx.previewImage({ current, urls })
  },

  publishCook() {
    if (!this.data.cookCanPublish || this.data.cookUploading) return
    const title = this.data.cookForm.title.trim()
    const content = this.data.cookForm.content.trim()
    const paths = this.data.cookForm.imagePaths

    const doCreate = (images) => {
      api
        .createCook({ title, content, images })
        .then((res) => {
          this.setData({
            cookModal: false,
            cookForm: { title: '', content: '', imagePaths: [] },
            cookUploading: false,
            cookCanPublish: false
          })
          wx.showToast({ title: '教程发布成功 +10经验 🎉', icon: 'none', duration: 2500 })
          this.handleNewBadges(res)
          this.refreshCooks()
        })
        .catch((err) => {
          this.setData({ cookUploading: false })
          api.toastError(err)
        })
    }

    if (paths.length) {
      this.setData({ cookUploading: true })
      oss
        .uploadImages(paths)
        .then((images) => doCreate(images))
        .catch((err) => {
          this.setData({ cookUploading: false })
          wx.showModal({
            title: '图片上传失败',
            content: (err && err.message) || '请检查 utils/oss.js 配置后重试',
            showCancel: false
          })
        })
    } else {
      doCreate([])
    }
  },

  /* ---------- 发帖（饭小圈） ---------- */
  openPost() {
    // 每日上限 3 条，发满后「晒吃」置灰，点击仅提示
    if (this.data.todayPostCount >= DAILY_POST_LIMIT) {
      wx.showToast({ title: '今日已经分享很多啦！明天再分享吧~', icon: 'none', duration: 2500 })
      return
    }
    this.setData({ postModal: true })
  },

  closePost() {
    this.setData({ postModal: false })
  },

  noop() {},

  onDishInput(e) {
    this.setData({ 'form.dish': e.detail.value })
    this.updateCanPublish()
  },

  pickCategory(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.name })
    this.updateCanPublish()
  },

  /* ---------- 图片上传（阿里云 OSS） ---------- */
  pickImage() {
    if (this.data.uploading) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (f) this.setData({ 'form.imagePath': f.tempFilePath })
      }
    })
  },

  removeImage() {
    this.setData({ 'form.imagePath': '' })
  },

  updateCanPublish() {
    const f = this.data.form
    // 分类可选，只要求菜名
    this.setData({ canPublish: !!f.dish.trim() })
  },

  publish() {
    if (!this.data.canPublish || this.data.uploading) return
    // 客户端也挡一道每日上限（云端仍会强制校验）
    if (this.data.todayPostCount >= DAILY_POST_LIMIT) {
      wx.showToast({ title: '今日已经分享很多啦！明天再分享吧~', icon: 'none', duration: 2500 })
      return
    }
    const dish = this.data.form.dish.trim()
    const category = this.data.form.category
    const imagePath = this.data.form.imagePath

    const doAdd = (imageUrl) => {
      const emoji = catalog.POST_EMOJIS[Math.floor(Math.random() * catalog.POST_EMOJIS.length)]
      api
        .addPost({ dish, category, imageUrl, emoji })
        .then((res) => {
          const count = this.data.todayPostCount + 1
          const remaining = DAILY_POST_LIMIT - count
          this.setData({
            postModal: false,
            form: { dish: '', category: '', imagePath: '' },
            uploading: false,
            canPublish: false,
            todayPostCount: count
          })
          wx.showToast({
            title:
              remaining > 0
                ? `晒吃成功 🎉 +10经验，今日还可发 ${remaining} 条`
                : '晒吃成功 🎉 +10经验，今日已发满 3 条',
            icon: 'none',
            duration: 2500
          })
          this.handleNewBadges(res)
          this.refresh()
        })
        .catch((err) => {
          this.setData({ uploading: false })
          api.toastError(err)
        })
    }

    if (imagePath) {
      this.setData({ uploading: true })
      oss
        .uploadImage(imagePath, { onProgress: () => {} })
        .then((url) => doAdd(url))
        .catch((err) => {
          this.setData({ uploading: false })
          wx.showModal({
            title: '图片上传失败',
            content: (err && err.message) || '请检查 utils/oss.js 配置后重试',
            showCancel: false
          })
        })
    } else {
      doAdd('')
    }
  }
})
