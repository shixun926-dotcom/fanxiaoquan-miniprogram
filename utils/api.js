/**
 * utils/api.js —— 饭小圈云数据层（微信云开发）
 *
 * 全部用户数据走 cloudfunctions/api 云函数 + 云数据库，**所有人互通**：
 *   帖子（含点赞）/ 收藏 / 决定历史 / 登录用户 / 外卖平台偏好
 * 函数名与原来的本地 mock 保持一致，页面调用方式从同步改为 Promise。
 *
 * ┌─ 需要你填的地方 ─────────────────────────────────────────┐
 * │  ENV_ID：云开发环境 ID（云开发控制台 → 概览 → 环境ID）     │
 * │  留空 = 使用默认环境（只有一个环境时可直接留空）           │
 * └──────────────────────────────────────────────────────────┘
 */
const ENV_ID = '' // ★ 可填：你的云开发环境 ID，如 'fanxiaoqian-1g2h3j4k'

let ready = false

function init() {
  if (!wx.cloud) {
    console.error('[api] 当前基础库不支持云开发，请升级基础库版本')
    return
  }
  try {
    wx.cloud.init(ENV_ID ? { env: ENV_ID, traceUser: true } : { traceUser: true })
    ready = true
  } catch (e) {
    console.error('[api] 云开发初始化失败', e)
  }
}

function isReady() {
  return ready
}

// 统一调用云函数
function call(action, data) {
  if (!ready) {
    return Promise.reject(
      new Error('云开发未就绪：请在开发者工具开通云开发并部署 cloudfunctions/api')
    )
  }
  return wx.cloud
    .callFunction({ name: 'api', data: Object.assign({ action }, data || {}) })
    .then((res) => {
      const r = res && res.result
      if (!r) throw new Error('云函数无响应')
      if (r.code === 0) return r.data
      throw new Error(r.msg || '云函数返回错误')
    })
}

// 统一错误提示（页面 catch 里用）
function toastError(err) {
  const msg = (err && err.message) || '网络异常'
  wx.showToast({ title: msg.slice(0, 40), icon: 'none', duration: 2500 })
}

/* ---------- 帖子 ---------- */

function ensureSeeded() {
  return call('seed').catch(() => {}) // 播种失败不阻塞启动
}

// 返回 [{ id, dish, category, categoryEmoji, emoji, imageUrl, likes, nickname,
//        avatarUrl, avatar, avatarColor, distance, time, userPost, liked }]
function getPosts() {
  return call('posts.list')
}

function addPost(info) {
  return call('posts.create', info)
}

function toggleLike(postId) {
  return call('likes.toggle', { postId })
}

// 今日已发帖数（每日上限 3 条，前端「晒吃」灰态/剩余次数提示用）
function getTodayPostCount() {
  return call('posts.todayCount').then((d) => d.count)
}

/* ---------- 评论 ---------- */

// 返回 [{ id, nickname, avatarUrl, content, time, mine }]
function getComments(postId) {
  return call('comments.list', { postId })
}

function addComment(postId, content) {
  return call('comments.add', { postId, content })
}

/* ---------- 附近（50km） ---------- */

// 返回 { needLocation, posts }；needLocation 为 true 时需先引导用户开启定位
function getNearbyPosts() {
  return call('nearby.list')
}

/* ---------- 大厨TV（做饭教程，一条多图） ---------- */

// 返回 [{ id, title, content, images, likes, nickname, avatarUrl, time, liked, posterLevel, commentCount }]
function getCookPosts() {
  return call('cooks.list')
}

function createCook(info) {
  return call('cooks.create', info)
}

function toggleCookLike(cookId) {
  return call('cooks.toggleLike', { cookId })
}

function getCookComments(cookId) {
  return call('cooks_comments.list', { cookId })
}

function addCookComment(cookId, content) {
  return call('cooks_comments.add', { cookId, content })
}

/* ---------- 收藏 ---------- */

function getFavorites() {
  return call('favorites.list')
}

function isFavorite(dish) {
  return call('favorites.isFavorite', { dish }).then((d) => !!d)
}

function addFavorite(dish, category, emoji) {
  return call('favorites.add', { dish, category, emoji })
}

function removeFavorite(dish) {
  return call('favorites.remove', { dish })
}

/* ---------- 决定历史 ---------- */

function getHistory() {
  return call('history.list')
}

function addHistory(info) {
  return call('history.add', info)
}

function clearHistory() {
  return call('history.clear')
}

/* ---------- 用户与偏好 ---------- */

// 返回 { loggedIn, nickname, avatar, platform }
function getUser() {
  return call('user.get')
}

function setUser(info) {
  return call('user.set', info)
}

function clearUser() {
  return call('user.set', { nickname: '', avatar: '' })
}

function isLoggedIn() {
  return getUser().then((u) => !!u.loggedIn)
}

function getPlatform() {
  return getUser().then((u) => u.platform || 'meituan')
}

function setPlatform(key) {
  return call('user.set', { platform: key })
}

// 重置演示数据：清空本人的收藏/历史、平台偏好回默认，保留登录身份
function resetDemoData() {
  return call('user.reset')
}

/* ---------- 成就徽章（UI/成就徽章设计文档.md） ---------- */

// 徽章墙 / 详情弹层进度：返回 { badgeTotal, unlockedCount, list }
// list 项 { key, name, rarity, target, current, unlocked, unlockTime }
function getBadgeProgress() {
  return call('badges.progress')
}

/* ---------- 兑换码 ---------- */

// 兑换：成功返回 { expGained }
function redeemCode(code) {
  return call('codes.redeem', { code })
}

/* ---------- 踩（不感兴趣，隐藏帖子） ---------- */

function hidePost(postId) {
  return call('hides.add', { postId })
}

/* ---------- 删除自己发布的帖子 ---------- */

function deletePost(postId) {
  return call('posts.delete', { postId })
}

/* ---------- 社交：关注 / 粉丝 / 作品主页（UI/社交功能设计文档.md） ---------- */

// 关注 / 取关，返回 { relationship }（me/following/follower/both/none）
function follow(targetOpenid) {
  return call('follows.add', { targetOpenid })
}

function unfollow(targetOpenid) {
  return call('follows.remove', { targetOpenid })
}

// 关注 / 粉丝列表（分页 20），返回 { list, hasMore }；列表项 { openid, nickname, avatar, level, mutual }
function getFollowing(userId, page) {
  return call('follows.following', { userId, page })
}

function getFollowers(userId, page) {
  return call('follows.followers', { userId, page })
}

// 用户主页信息：{ userId, nickname, avatar, exp, level, followingCount, followerCount, worksCount, relationship }
// userId 为空 = 自己的主页
function getUserProfile(userId) {
  return call('user.profile', { userId })
}

// 作品聚合（晒吃帖 + 教程按时间倒序），每页 10，返回 { list, hasMore }
function getWorks(userId, page) {
  return call('works.list', { userId, page })
}

/* ---------- 社交：互关私信 ---------- */

// 会话列表：{ threadKey, otherOpenid, nickname, avatar, lastMessage, lastTimeText, unread }
function getConversations() {
  return call('messages.conversations')
}

// 消息总未读数（我的页红点）
function getUnreadCount() {
  return call('messages.unread').then((d) => d.count)
}

// 进入会话（无会话且互关时创建），返回 { threadKey, mutual, nickname, avatar, ... }
function openConversation(targetOpenid) {
  return call('messages.open', { targetOpenid })
}

// 消息历史（正序数组，每项 { from, mine, content, timeText }）
function getMessages(threadKey) {
  return call('messages.list', { threadKey })
}

function sendMessage(threadKey, content) {
  return call('messages.send', { threadKey, content })
}

function markConversationRead(threadKey) {
  return call('messages.read', { threadKey })
}

/* ---------- 检索（UI/检索功能设计文档.md） ---------- */

// 搜索：scope = feed | nearby | cook → { list, total, hasMore, needLocation }
// feed 检索菜名/分类/昵称；nearby 同 feed + 50km；cook 检索标题/正文/昵称
function search(scope, keyword, page) {
  return call('search', { scope, keyword, page })
}

/* ---------- 打赏徽章领取（UI/打赏功能设计文档.md F4） ---------- */

// 领取打赏徽章兑换码（信任制）：成功返回 { code, badgeKey }；重复领取云函数拒绝
function claimReward() {
  return call('reward.claim')
}

/* ---------- 意见反馈（UI/反馈功能设计文档.md） ---------- */

// 提交反馈：{ type, content, images, contact } → { id }
// type: suggestion 功能建议 / bug 问题反馈 / report 内容举报 / other 其他
function createFeedback(info) {
  return call('feedbacks.create', info)
}

// 我的反馈列表（分页 10，时间倒序）→ { list, hasMore }
// 列表项 { id, type, typeLabel, status, statusLabel, content, imageCount, timeText }
function getFeedbacks(page) {
  return call('feedbacks.list', { page })
}

// 反馈详情：{ id, typeLabel, content, images, statusLabel, reply, statusHistory, timeText }
function getFeedbackDetail(id) {
  return call('feedbacks.detail', { id })
}

module.exports = {
  ENV_ID,
  init,
  isReady,
  call,
  toastError,
  ensureSeeded,
  getPosts,
  addPost,
  toggleLike,
  getTodayPostCount,
  getComments,
  addComment,
  getNearbyPosts,
  getCookPosts,
  createCook,
  toggleCookLike,
  getCookComments,
  addCookComment,
  getFavorites,
  isFavorite,
  addFavorite,
  removeFavorite,
  getHistory,
  addHistory,
  clearHistory,
  getUser,
  setUser,
  clearUser,
  isLoggedIn,
  getPlatform,
  setPlatform,
  resetDemoData,
  getBadgeProgress,
  redeemCode,
  hidePost,
  deletePost,
  follow,
  unfollow,
  getFollowing,
  getFollowers,
  getUserProfile,
  getWorks,
  getConversations,
  getUnreadCount,
  openConversation,
  getMessages,
  sendMessage,
  markConversationRead,
  createFeedback,
  getFeedbacks,
  getFeedbackDetail,
  search,
  claimReward
}
