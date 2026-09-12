/**
 * 云函数：api —— 饭小圈数据接口（单一入口，按 action 路由）
 *
 * 用户身份：云函数自动从微信侧拿到 OPENID（cloud.getWXContext()），
 * 无需像传统后端那样用 code 换 session —— 这是云开发最省事的地方。
 *
 * 集合（首次调用自动创建）：
 *   posts     帖子（含点赞者 openid 数组 likers，点赞互通）
 *   users     用户（_id = openid：昵称、头像、外卖平台偏好、exp 经验）
 *   favorites 收藏（按 openid）
 *   history   决定历史（按 openid）
 *   comments  评论（按 postId，评论者与帖子作者各 +1 经验）
 *
 * 部署：开发者工具 → 右键 cloudfunctions/api → 「上传并部署：云端安装依赖」
 * 之后小程序端 wx.cloud.callFunction({ name: 'api', data: { action, ... } })
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 分类目录：与小程序端 utils/mock.js 保持一致（云函数无法 require 包外文件，需同步维护）
const CATEGORIES = [
  { name: '火锅', emoji: '🍲' },
  { name: '烧烤', emoji: '🍖' },
  { name: '快餐', emoji: '🍔' },
  { name: '面食', emoji: '🍜' },
  { name: '日料', emoji: '🍣' },
  { name: '川湘菜', emoji: '🌶️' },
  { name: '甜品', emoji: '🍰' },
  { name: '轻食', emoji: '🥗' },
  { name: '麻辣烫', emoji: '🥘' },
  { name: '小吃', emoji: '🥟' }
]

const COLLECTIONS = [
  'posts', 'users', 'favorites', 'history', 'comments', 'cooks', 'cooks_comments',
  'codes', 'redeems', 'hides',
  'follows', 'messages', 'conversations',
  'feedbacks'
]

// 每日点赞 / 评论得经验的上限次数
const DAILY_EXP_LIMIT = 10

// 附近半径：50km
const NEARBY_RADIUS = 50000

/* ---------- 经纬度距离（Haversine，返回米） ---------- */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

// 距离显示文本：<1km 显示米，≥1km 显示 x.xkm，0 显示"在你附近"
function distanceStr(m) {
  if (m === null || m === undefined || isNaN(m)) return '距离未知'
  if (m === 0) return '在你附近'
  if (m < 1000) return m + 'm'
  return (m / 1000).toFixed(1) + 'km'
}

// 等级阈值：与小程序端 utils/level.js 保持一致（云函数无法 require 包外文件，需同步维护）
const LEVEL_THRESHOLDS = [0, 30, 90, 180, 300, 450, 630, 840, 1080, 1350, 1650]

function getLevel(exp) {
  const e = Math.max(0, exp || 0)
  for (let lv = LEVEL_THRESHOLDS.length - 1; lv >= 0; lv--) {
    if (e >= LEVEL_THRESHOLDS[lv]) return lv
  }
  return 0
}

// 给用户加（减）经验：确保用户文档存在后再原子自增；system 种子号/空 openid 不加
// 注意：云开发对不存在的文档执行 update 不会报错而是静默跳过，
// 必须先 ensureUser 建好文档，否则经验会悄悄丢失（这是"经验到账不准"的根因）
async function addExp(openid, delta) {
  if (!openid || openid === 'system') return
  await ensureUser(openid)
  await db.collection('users').doc(openid).update({ data: { exp: _.inc(delta) } })
}

const ok = (data) => ({ code: 0, data })
const fail = (msg) => ({ code: 1, msg })

const p = (n) => (n < 10 ? '0' + n : '' + n)
function formatTime(d) {
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
  )
}
const dateStr = (d) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())

// 云函数运行在 UTC（北京 = UTC+8），按北京时间计算"今天"，
// 否则每日点赞/评论额度会在北京时间 08:00 才重置，与用户感知的自然日不一致
function todayStr() {
  return dateStr(new Date(Date.now() + 8 * 3600 * 1000))
}

/* ---------- 集合与用户初始化 ---------- */

async function ensureCollections() {
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
    } catch (e) {
      // 已存在则忽略
    }
  }
}

// 取用户文档，不存在则创建默认文档（_id = openid）
async function ensureUser(openid) {
  try {
    const res = await db.collection('users').doc(openid).get()
    return res.data
  } catch (e) {
    const doc = {
      _id: openid,
      nickname: '',
      avatar: '',
      platform: 'meituan',
      exp: 0,
      createTime: Date.now()
    }
    try {
      await db.collection('users').add({ data: doc })
      return doc
    } catch (e2) {
      // 并发创建时 _id 冲突：文档已被别人建好，重新读取
      const res2 = await db.collection('users').doc(openid).get()
      return res2.data
    }
  }
}

/* ---------- action 实现 ---------- */

// 清理历史遗留的"附近的人"演示种子帖（openid = system），幂等。
// 在 app 启动（seed）和每次打开饭小圈（posts.list）都会执行，部署后无需重启 App 也会清掉
async function cleanSeedPosts() {
  try {
    const stale = await db.collection('posts').where({ openid: 'system' }).limit(1000).get()
    if (!stale.data.length) return 0
    const staleIds = stale.data.map((p) => p._id)
    await db.collection('posts').where({ openid: 'system' }).remove()
    await db.collection('comments').where({ postId: _.in(staleIds) }).remove()
    return staleIds.length
  } catch (e) {
    // 集合不存在等场景忽略
    return 0
  }
}

async function seed() {
  await ensureCollections()
  const cleaned = await cleanSeedPosts()
  let seededCodes = 0
  try {
    seededCodes = (await codesSeed()).data.seeded
  } catch (e) {
    // 播种失败不阻塞启动（下一次 seed 会重试）
  }
  let devCodes = []
  try {
    devCodes = await devCodesSeed() // 开发者徽章码（隐藏途径，前端不可见）
  } catch (e) {
    // 同上，不阻塞启动
  }
  return ok({ cleaned, seededCodes, devCodes })
}

// 把原始帖子文档加工成前端结构（等级徽章 / 评论数 / 是否赞过 / 距离），posts.list 与 nearby.list 共用
async function decoratePosts(rawList, openid, viewerLat, viewerLng) {
  const authorOpenids = rawList.map((p) => p.openid).filter((id) => id && id !== 'system')
  const levelMap = {}
  const badgeMap = {}
  if (authorOpenids.length) {
    const usersRes = await db
      .collection('users')
      .where({ _id: _.in([...new Set(authorOpenids)]) })
      .limit(100)
      .get()
    usersRes.data.forEach((u) => {
      levelMap[u._id] = getLevel(u.exp)
      badgeMap[u._id] = u.badges || []
    })
  }
  const commentCountMap = {}
  if (rawList.length) {
    const cRes = await db
      .collection('comments')
      .where({ postId: _.in(rawList.map((p) => p._id)) })
      .limit(1000)
      .get()
    cRes.data.forEach((c) => {
      commentCountMap[c.postId] = (commentCountMap[c.postId] || 0) + 1
    })
  }
  return rawList.map((p) => {
    const likers = p.likers || []
    let distNum = null
    if (viewerLat && viewerLng && p.lat && p.lng) {
      distNum = haversine(viewerLat, viewerLng, p.lat, p.lng)
    }
    return {
      id: p._id,
      dish: p.dish,
      category: p.category,
      categoryEmoji: p.categoryEmoji,
      emoji: p.emoji,
      imageUrl: p.imageUrl || '',
      likes: p.likes || 0,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl || '',
      avatar: p.avatar || '',
      avatarColor: p.avatarColor || '#FF6B35',
      distance: distanceStr(distNum),
      distanceNum: distNum,
      time: p.time,
      userPost: p.openid === openid, // 是否自己的帖子（删除按钮用；兼容无 userPost 字段的旧帖）
      authorOpenid: p.openid || '', // 作者 openid（点头像进主页用；system 种子帖为空哨兵）
      liked: likers.indexOf(openid) > -1,
      posterLevel: levelMap[p.openid] !== undefined ? levelMap[p.openid] : 0,
      commentCount: commentCountMap[p._id] || 0,
      authorBadges: badgeListOf(badgeMap[p.openid], 99), // 作者全部已解锁徽章（前端 5 枚展示位 + 展开面板）
      badgeCount: (badgeMap[p.openid] || []).length
    }
  })
}

async function postsList(openid) {
  await cleanSeedPosts() // 每次打开饭小圈都兜底清理遗留种子帖
  const res = await db.collection('posts').orderBy('createTime', 'desc').limit(50).get()
  const hidden = await getHiddenPostIds(openid) // 排除被"踩"（不感兴趣）的帖子
  const visible = res.data.filter((p) => !hidden.has(p._id))
  const viewer = await ensureUser(openid)
  const list = await decoratePosts(visible, openid, viewer.lat, viewer.lng)
  return ok(list)
}

// 附近 50km：以查看者定位为中心过滤帖子（含自己发的），无定位则返回 needLocation 由前端引导
async function nearbyList(openid) {
  const viewer = await ensureUser(openid)
  if (!viewer.lat || !viewer.lng) return ok({ needLocation: true, posts: [] })
  const res = await db.collection('posts').orderBy('createTime', 'desc').limit(100).get()
  const hidden = await getHiddenPostIds(openid) // 排除被"踩"（不感兴趣）的帖子
  const near = res.data.filter(
    (p) =>
      p.openid !== 'system' &&
      !hidden.has(p._id) &&
      p.lat &&
      p.lng &&
      haversine(viewer.lat, viewer.lng, p.lat, p.lng) <= NEARBY_RADIUS
  )
  const list = await decoratePosts(near, openid, viewer.lat, viewer.lng)
  return ok({ needLocation: false, posts: list })
}

async function postsCreate(openid, event) {
  const user = await ensureUser(openid)
  // 每日发帖上限 3 条（按 openid + 当天 0 点后计数）
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayRes = await db
    .collection('posts')
    .where({ openid, createTime: _.gte(todayStart.getTime()) })
    .count()
  if (todayRes.total >= 3) return fail('今日已发满3条，明天再来分享吧~')
  const cat = CATEGORIES.find((c) => c.name === event.category)
  const doc = {
    dish: event.dish,
    category: cat ? cat.name : '未分类',
    categoryEmoji: cat ? cat.emoji : '🍽️',
    emoji: event.emoji || '🍽️',
    imageUrl: event.imageUrl || '',
    likes: 0,
    likers: [],
    nickname: user.nickname || '我',
    avatarUrl: user.avatar || '',
    avatar: user.avatar ? '' : '😋',
    avatarColor: '#FF6B35',
    distance: '在你附近',
    time: '刚刚',
    userPost: true,
    openid,
    lat: user.lat || null, // 发帖时记录位置（附近 50km 用；未授权定位则为 null）
    lng: user.lng || null,
    createTime: Date.now()
  }
  const res = await db.collection('posts').add({ data: doc })
  // 发帖 +10 经验
  await addExp(openid, 10)
  const newBadges = await checkBadgeUnlocks(openid, 'post') // 初来乍到 / 快门美食家 / 干饭达人 / 饕餮
  return ok({ id: res._id, expGained: 10, newBadges })
}

// 删除自己发布的帖子（连带评论与踩记录；他人帖子不可删）
async function postsDelete(openid, event) {
  const postId = event.postId
  if (!postId) return fail('缺少 postId')
  let postDoc
  try {
    postDoc = await db.collection('posts').doc(postId).get()
  } catch (e) {
    return fail('帖子不存在')
  }
  if (postDoc.data.openid !== openid) return fail('只能删除自己发布的帖子')
  await db.collection('posts').doc(postId).remove()
  await db.collection('comments').where({ postId }).remove()
  await db.collection('hides').where({ postId }).remove().catch(() => {}) // 集合未建时忽略
  return ok({})
}

// 今日已发帖数（前端「晒吃」按钮灰态 / 剩余次数提示用）
async function postsTodayCount(openid) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const countRes = await db
    .collection('posts')
    .where({ openid, createTime: _.gte(todayStart.getTime()) })
    .count()
  return ok({ count: countRes.total })
}

async function likesToggle(openid, event) {
  const postId = event.postId
  let postDoc
  try {
    postDoc = await db.collection('posts').doc(postId).get()
  } catch (e) {
    return fail('帖子不存在')
  }
  const p = postDoc.data
  const likers = p.likers || []
  if (likers.indexOf(openid) > -1) {
    await db.collection('posts').doc(postId).update({
      data: { likers: _.pull(openid), likes: _.inc(-1) }
    })
    // 取消点赞：帖子作者 -2 经验（无论是否自己点；与 +2 对冲，无法靠自点反复刷）
    await addExp(p.openid, -2)
    await db.collection('users').doc(openid).update({ data: { totalLikes: _.inc(-1) } }) // 暖心点赞进度回退
    return ok({ liked: false, expGained: 0 })
  }
  await db.collection('posts').doc(postId).update({
    data: { likers: _.addToSet(openid), likes: _.inc(1) }
  })
  await db.collection('users').doc(openid).update({ data: { totalLikes: _.inc(1) } }) // 暖心点赞累计计数
  // 被点赞：帖子作者 +2 经验，不限次数（含自己点自己，方便单账号测试；取消时 -2 对冲）
  await addExp(p.openid, 2)
  // 点赞行为：点赞者本人 +1 经验，每日前 10 次有效（自己点自己不给自己加，防自点刷分）
  let expGained = 0
  if (openid !== p.openid) {
    const user = await ensureUser(openid)
    const today = todayStr()
    const count = user.likeDate === today ? user.likeCount || 0 : 0
    if (count < DAILY_EXP_LIMIT) {
      await db.collection('users').doc(openid).update({
        data: { likeDate: today, likeCount: count + 1, exp: _.inc(1) }
      })
      expGained = 1
    }
  }
  const newBadges = await checkBadgeUnlocks(openid, 'like') // 暖心点赞 / 人气王
  return ok({ liked: true, expGained, newBadges })
}

async function favoritesList(openid) {
  const res = await db.collection('favorites').where({ openid }).orderBy('createTime', 'desc').limit(50).get()
  return ok(
    res.data.map((f) => ({ id: f.dish, dish: f.dish, category: f.category, emoji: f.emoji, time: f.time }))
  )
}

async function favoritesAdd(openid, event) {
  const exists = await db.collection('favorites').where({ openid, dish: event.dish }).count()
  if (exists.total > 0) return ok({ added: false })
  await db.collection('favorites').add({
    data: {
      openid,
      dish: event.dish,
      category: event.category || '',
      emoji: event.emoji || '🍽️',
      time: formatTime(new Date()),
      createTime: Date.now()
    }
  })
  const newBadges = await checkBadgeUnlocks(openid, 'favorite') // 品味收藏家
  return ok({ added: true, newBadges })
}

async function favoritesRemove(openid, event) {
  await db.collection('favorites').where({ openid, dish: event.dish }).remove()
  return ok({})
}

async function favoritesIsFavorite(openid, event) {
  const res = await db.collection('favorites').where({ openid, dish: event.dish }).count()
  return ok(res.total > 0)
}

async function historyList(openid) {
  const res = await db.collection('history').where({ openid }).orderBy('createTime', 'desc').limit(50).get()
  return ok(
    res.data.map((h) => ({ id: h._id, dish: h.dish, category: h.category, emoji: h.emoji, source: h.source, time: h.time }))
  )
}

async function historyAdd(openid, event) {
  await db.collection('history').add({
    data: {
      openid,
      dish: event.dish,
      category: event.category || '',
      emoji: event.emoji || '🍽️',
      source: event.source || '转盘',
      time: formatTime(new Date()),
      createTime: Date.now()
    }
  })
  const newBadges = await checkBadgeUnlocks(openid, 'decide') // 饭桌锦鲤 / 锦鲤附体
  return ok({ newBadges })
}

async function historyClear(openid) {
  await db.collection('history').where({ openid }).remove()
  return ok({})
}

/* ---------- 评论 ---------- */

// 一个帖子的评论，按时间升序
async function commentsList(openid, event) {
  if (!event.postId) return fail('缺少 postId')
  const res = await db
    .collection('comments')
    .where({ postId: event.postId })
    .orderBy('createTime', 'asc')
    .limit(30)
    .get()
  return ok(
    res.data.map((c) => ({
      id: c._id,
      postId: c.postId,
      nickname: c.nickname || '匿名',
      avatarUrl: c.avatarUrl || '',
      content: c.content,
      time: c.time,
      mine: c.openid === openid,
      authorOpenid: c.openid || '' // 评论作者（点头像进主页用）
    }))
  )
}

// 发表评论：帖子作者 +1 经验（不限）；评论者本人 +1 经验，每日前 10 次有效
async function commentsAdd(openid, event) {
  const content = (event.content || '').trim()
  if (!content) return fail('评论内容不能为空')
  if (content.length > 100) return fail('评论最多100字')
  let postDoc
  try {
    postDoc = await db.collection('posts').doc(event.postId).get()
  } catch (e) {
    return fail('帖子不存在')
  }
  const user = await ensureUser(openid)
  await db.collection('comments').add({
    data: {
      postId: event.postId,
      openid,
      nickname: user.nickname || '匿名',
      avatarUrl: user.avatar || '',
      content,
      time: formatTime(new Date()),
      createTime: Date.now()
    }
  })
  // 被评论：帖子作者 +1 经验，不限次数
  await addExp(postDoc.data.openid, 1)
  // 评论行为：评论者本人 +1 经验，每日前 10 次有效
  let expGained = 0
  const today = todayStr()
  const count = user.commentDate === today ? user.commentCount || 0 : 0
  if (count < DAILY_EXP_LIMIT) {
    await db.collection('users').doc(openid).update({
      data: { commentDate: today, commentCount: count + 1, exp: _.inc(1) }
    })
    expGained = 1
  }
  return ok({ expGained, newBadges }) // 金口玉言
}

/* ---------- 大厨TV（做饭教程，一条多图） ---------- */

// 把原始教程文档加工成前端结构（等级徽章 / 评论数 / 是否赞过），cooks.list 与 search 共用
async function decorateCooks(rawList, openid) {
  const authorOpenids = rawList.map((p) => p.openid).filter(Boolean)
  const levelMap = {}
  const badgeMap = {}
  if (authorOpenids.length) {
    const usersRes = await db
      .collection('users')
      .where({ _id: _.in([...new Set(authorOpenids)]) })
      .limit(100)
      .get()
    usersRes.data.forEach((u) => {
      levelMap[u._id] = getLevel(u.exp)
      badgeMap[u._id] = u.badges || []
    })
  }
  const commentCountMap = {}
  if (rawList.length) {
    const cRes = await db
      .collection('cooks_comments')
      .where({ cookId: _.in(rawList.map((p) => p._id)) })
      .limit(1000)
      .get()
    cRes.data.forEach((c) => {
      commentCountMap[c.cookId] = (commentCountMap[c.cookId] || 0) + 1
    })
  }
  return rawList.map((p) => {
    const likers = p.likers || []
    return {
      id: p._id,
      title: p.title,
      content: p.content,
      images: p.images || [],
      likes: p.likes || 0,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl || '',
      avatar: p.avatar || '',
      avatarColor: p.avatarColor || '#FF6B35',
      time: p.time,
      mine: p.openid === openid,
      authorOpenid: p.openid || '', // 作者 openid（点头像进主页用）
      liked: likers.indexOf(openid) > -1,
      posterLevel: levelMap[p.openid] !== undefined ? levelMap[p.openid] : 0,
      commentCount: commentCountMap[p._id] || 0,
      authorBadges: badgeListOf(badgeMap[p.openid], 99), // 作者全部已解锁徽章（前端 5 枚展示位 + 展开面板）
      badgeCount: (badgeMap[p.openid] || []).length
    }
  })
}

async function cooksList(openid) {
  const res = await db.collection('cooks').orderBy('createTime', 'desc').limit(50).get()
  const list = await decorateCooks(res.data, openid)
  return ok(list)
}

// 发教程：标题必填，正文/图片可选（图片最多 9 张），发布者 +10 经验
async function cooksCreate(openid, event) {
  const user = await ensureUser(openid)
  const title = (event.title || '').trim()
  if (!title) return fail('标题不能为空')
  const images = Array.isArray(event.images) ? event.images.slice(0, 9) : []
  await db.collection('cooks').add({
    data: {
      openid,
      title: title.slice(0, 30),
      content: (event.content || '').trim().slice(0, 500),
      images,
      likes: 0,
      likers: [],
      nickname: user.nickname || '匿名大厨',
      avatarUrl: user.avatar || '',
      avatar: user.avatar ? '' : '👨‍🍳',
      avatarColor: '#FF6B35',
      time: formatTime(new Date()),
      createTime: Date.now()
    }
  })
  await addExp(openid, 10)
  const newBadges = await checkBadgeUnlocks(openid, 'cook') // 大厨之星 / 美食作家
  return ok({ expGained: 10, newBadges })
}

// 教程点赞：作者 +2（含自点，取消 -2 对冲），点赞者本人 +1（每日前 10 次，自点不加）
async function cooksLikeToggle(openid, event) {
  const cookId = event.cookId
  let cookDoc
  try {
    cookDoc = await db.collection('cooks').doc(cookId).get()
  } catch (e) {
    return fail('教程不存在')
  }
  const p = cookDoc.data
  const likers = p.likers || []
  if (likers.indexOf(openid) > -1) {
    await db.collection('cooks').doc(cookId).update({
      data: { likers: _.pull(openid), likes: _.inc(-1) }
    })
    await addExp(p.openid, -2)
    await db.collection('users').doc(openid).update({ data: { totalLikes: _.inc(-1) } }) // 暖心点赞进度回退
    return ok({ liked: false, expGained: 0 })
  }
  await db.collection('cooks').doc(cookId).update({
    data: { likers: _.addToSet(openid), likes: _.inc(1) }
  })
  await db.collection('users').doc(openid).update({ data: { totalLikes: _.inc(1) } }) // 暖心点赞累计计数
  await addExp(p.openid, 2)
  let expGained = 0
  if (openid !== p.openid) {
    const user = await ensureUser(openid)
    const today = todayStr()
    const count = user.likeDate === today ? user.likeCount || 0 : 0
    if (count < DAILY_EXP_LIMIT) {
      await db.collection('users').doc(openid).update({
        data: { likeDate: today, likeCount: count + 1, exp: _.inc(1) }
      })
      expGained = 1
    }
  }
  const newBadges = await checkBadgeUnlocks(openid, 'like') // 暖心点赞 / 人气王
  return ok({ liked: true, expGained, newBadges })
}

// 教程评论：作者 +1（不限），评论者本人 +1（每日前 10 次）
async function cooksCommentsList(openid, event) {
  if (!event.cookId) return fail('缺少 cookId')
  const res = await db
    .collection('cooks_comments')
    .where({ cookId: event.cookId })
    .orderBy('createTime', 'asc')
    .limit(30)
    .get()
  return ok(
    res.data.map((c) => ({
      id: c._id,
      cookId: c.cookId,
      nickname: c.nickname || '匿名',
      avatarUrl: c.avatarUrl || '',
      content: c.content,
      time: c.time,
      mine: c.openid === openid,
      authorOpenid: c.openid || '' // 评论作者（点头像进主页用）
    }))
  )
}

async function cooksCommentsAdd(openid, event) {
  const content = (event.content || '').trim()
  if (!content) return fail('评论内容不能为空')
  if (content.length > 100) return fail('评论最多100字')
  let cookDoc
  try {
    cookDoc = await db.collection('cooks').doc(event.cookId).get()
  } catch (e) {
    return fail('教程不存在')
  }
  const user = await ensureUser(openid)
  await db.collection('cooks_comments').add({
    data: {
      cookId: event.cookId,
      openid,
      nickname: user.nickname || '匿名',
      avatarUrl: user.avatar || '',
      content,
      time: formatTime(new Date()),
      createTime: Date.now()
    }
  })
  await addExp(cookDoc.data.openid, 1)
  let expGained = 0
  const today = todayStr()
  const count = user.commentDate === today ? user.commentCount || 0 : 0
  if (count < DAILY_EXP_LIMIT) {
    await db.collection('users').doc(openid).update({
      data: { commentDate: today, commentCount: count + 1, exp: _.inc(1) }
    })
    expGained = 1
  }
  return ok({ expGained, newBadges }) // 金口玉言
}

async function userGet(openid) {
  const user = await ensureUser(openid)
  return ok({
    loggedIn: !!user.nickname,
    nickname: user.nickname || '',
    avatar: user.avatar || '',
    platform: user.platform || 'meituan',
    address: user.address || '', // 当前定位地址文案（逆地理编码，可空；UI/定位与地址获取设计方案.md）
    addressTs: user.addressTs || 0,
    exp: Math.max(0, user.exp || 0), // 经验不为负（取消点赞 -2 的下限钳制）
    badges: (user.badges || []).map((b) => ({ key: b.key, unlockTime: b.unlockTime || 0 })), // 已解锁徽章（徽章墙缓存）
    badgeTotal: BADGES.length
  })
}

async function userSet(openid, event) {
  const user = await ensureUser(openid)
  const patch = {}
  if (event.nickname !== undefined) patch.nickname = event.nickname
  if (event.avatar !== undefined) patch.avatar = event.avatar
  if (event.platform !== undefined) patch.platform = event.platform
  if (event.lat !== undefined) patch.lat = event.lat
  if (event.lng !== undefined) patch.lng = event.lng
  if (event.address !== undefined) patch.address = event.address
  if (event.addressTs !== undefined) patch.addressTs = event.addressTs
  if (event.nickname !== undefined) patch.updatedTime = Date.now()
  await db.collection('users').doc(user._id).update({ data: patch })
  return ok({})
}

// 重置演示数据：清空本人的收藏与历史，平台偏好恢复默认、经验清零，保留登录身份
async function userReset(openid) {
  await db.collection('favorites').where({ openid }).remove()
  await db.collection('history').where({ openid }).remove()
  await db.collection('users').doc(openid).update({ data: { platform: 'meituan', exp: 0 } })
  return ok({})
}

/* ---------- 踩（不感兴趣）：隐藏帖子，仅对本人生效 ---------- */

// 取出某用户已隐藏的帖子 id 集合（posts.list / nearby.list 过滤用）
async function getHiddenPostIds(openid) {
  try {
    const res = await db.collection('hides').where({ openid }).limit(500).get()
    return new Set(res.data.map((h) => h.postId))
  } catch (e) {
    // 集合不存在等场景：没有隐藏记录
    return new Set()
  }
}

async function hidesAdd(openid, event) {
  if (!event.postId) return fail('缺少 postId')
  try {
    // _id = openid:postId 原子去重：同一帖子重复踩不会产生多条记录
    await db.collection('hides').add({
      data: { _id: openid + ':' + event.postId, openid, postId: event.postId, createTime: Date.now() }
    })
  } catch (e) {
    // 已隐藏过，幂等返回
  }
  return ok({})
}

/* ---------- 兑换码：每个码限用 100 次，每次 +30 经验 ---------- */

const CODE_MAX_USES = 100
const CODE_EXP = 30 // 单个兑换码每次兑换获得的经验

// 初始 3 个兑换码（固定值，具体数值见项目根目录 REDEEM_CODES.md）
const SEED_CODES = ['FXQ8F3K2Q', 'FXQ7J9M4X', 'FXQ2T5N8V']

// 首次部署播种 3 个兑换码（codes 集合为空时创建，幂等），在 app 启动 seed 时执行
async function codesSeed() {
  const countRes = await db.collection('codes').count()
  if (countRes.total > 0) return ok({ seeded: 0 })
  const docs = []
  for (const code of SEED_CODES) {
    docs.push({
      code,
      exp: CODE_EXP,
      usedCount: 0,
      maxUses: CODE_MAX_USES,
      createTime: Date.now()
    })
  }
  await db.collection('codes').add({ data: docs })
  return ok({ seeded: docs.length })
}

// 开发者徽章兑换码（★ 隐藏途径：码值与获取途径均不在小程序内展示，勿把码值加入 REDEEM_CODES.md 等公开文档）
const DEV_BADGE_CODES = ['FXQDEV0809']

// 按码存在性逐条播种（幂等），带 badge 标记：兑换该码时附赠对应徽章（见 codesRedeem 步骤 4）
async function devCodesSeed() {
  const seeded = []
  for (const code of DEV_BADGE_CODES) {
    const exist = await db.collection('codes').where({ code }).count()
    if (exist.total > 0) continue
    await db.collection('codes').add({
      data: { code, badge: 'developer', exp: CODE_EXP, usedCount: 0, maxUses: 1, createTime: Date.now() }
    })
    seeded.push(code)
  }
  return seeded
}

// 兑换码列表（「我的」页演示区展示剩余次数用；过滤掉带 badge 标记 / type=badge 的特殊码，避免途径外显）
async function codesList(openid) {
  try {
    const res = await db.collection('codes').orderBy('createTime', 'asc').limit(50).get()
    return ok(
      res.data
        .filter((c) => !c.badge && c.type !== 'badge')
        .map((c) => ({
          code: c.code,
          exp: c.exp || CODE_EXP,
          usedCount: c.usedCount || 0,
          maxUses: c.maxUses || CODE_MAX_USES
        }))
    )
  } catch (e) {
    return ok([])
  }
}

// 兑换：每用户每码限一次（_id 原子去重），每个码限用 maxUses 次（条件更新 + 回读兜底）
// 码的类型：普通码（exp 经验）/ 开发者徽章码（badge 字段）/ 打赏徽章码（type='badge' + badgeKey，见 rewardClaim）
async function codesRedeem(openid, event) {
  const code = String(event.code || '').trim().toUpperCase()
  if (!code) return fail('请输入兑换码')
  const docRes = await db.collection('codes').where({ code }).limit(1).get()
  if (!docRes.data.length) return fail('兑换码不存在')
  const doc = docRes.data[0]
  const exp = typeof doc.exp === 'number' ? doc.exp : CODE_EXP // 打赏码 exp=0，不发放经验
  const maxUses = doc.maxUses || CODE_MAX_USES

  // 1) 占坑：同一 openid + 码只能兑换一次（add 带 _id，重复 _id 会报错 → 原子去重）
  const rid = openid + ':' + code
  try {
    await db.collection('redeems').add({
      data: { _id: rid, openid, code, createTime: Date.now() }
    })
  } catch (e) {
    return fail('该兑换码你已经兑换过了')
  }

  // 2) 扣减使用次数：只有 usedCount < maxUses 的文档才更新成功
  const codeRes = await db
    .collection('codes')
    .where({ code, usedCount: _.lt(maxUses) })
    .update({ data: { usedCount: _.inc(1) } })
  if (!codeRes.stats || !codeRes.stats.updated) {
    await db.collection('redeems').doc(rid).remove().catch(() => {}) // 回滚占坑
    return fail('该兑换码已使用完')
  }
  // 并发兜底：回读实际次数，超过上限则回滚（条件更新的并发窗口极小）
  const afterRes = await db.collection('codes').where({ code }).limit(1).get()
  const cur = (afterRes.data[0] && afterRes.data[0].usedCount) || 0
  if (cur > maxUses) {
    await db.collection('codes').where({ code }).update({ data: { usedCount: _.inc(-1) } })
    await db.collection('redeems').doc(rid).remove().catch(() => {})
    return fail('该兑换码已使用完')
  }

  // 3) 发放经验（打赏徽章码 exp=0，纯纪念不发经验）
  if (exp > 0) await addExp(openid, exp)
  const newBadges = await checkBadgeUnlocks(openid, 'redeem') // 兑换收藏家

  // 4) 特殊兑换码附赠徽章（开发者徽章：badge 字段，隐藏途径；打赏徽章：type='badge' + badgeKey）
  const badgeKey = doc.badge || (doc.type === 'badge' ? doc.badgeKey : null)
  if (badgeKey) {
    const b = BADGE_BY_KEY[badgeKey]
    if (b) {
      const has = ((await ensureUser(openid)).badges || []).some((x) => x.key === badgeKey)
      if (!has) {
        await db
          .collection('users')
          .doc(openid)
          .update({ data: { badges: _.addToSet({ key: badgeKey, unlockTime: Date.now() }) } })
        newBadges.push({ key: b.key, name: b.name, rarity: b.rarity })
      }
    }
  }
  return ok({ expGained: exp, newBadges })
}

/* ---------- 打赏徽章领取（UI/打赏功能设计文档.md F4：信任制按钮 + 一次性兑换码） ---------- */

// 打赏码字符集（去掉易混淆的 I/O/0/1）
const REWARD_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// 生成一次性打赏兑换码（FXQR + 6 位随机），与既有 codes 撞码时重试
async function genRewardCode() {
  for (let i = 0; i < 5; i++) {
    let s = 'FXQR'
    for (let j = 0; j < 6; j++) {
      s += REWARD_CODE_CHARS[Math.floor(Math.random() * REWARD_CODE_CHARS.length)]
    }
    const exist = await db.collection('codes').where({ code: s }).count()
    if (exist.total === 0) return s
  }
  throw new Error('兑换码生成失败，请重试')
}

// 生成一次性打赏码文档（type='badge' + badgeKey='reward'，兑换时走 codesRedeem 步骤 4 解锁徽章）
async function createRewardCodeDoc() {
  const code = await genRewardCode()
  await db.collection('codes').add({
    data: {
      code,
      type: 'badge', // 徽章码：codes.list 不展示、不发放经验
      badgeKey: 'reward',
      exp: 0, // 纯纪念，不给经验
      usedCount: 0,
      maxUses: 1, // 一次性
      createTime: Date.now()
    }
  })
  return code
}

// 领取（客户要求：每次点击都显示兑换码）：
// 首击生成一次性兑换码并存入 users.rewardCode；之后每次点击返回同一码（不再拒绝）
async function rewardClaim(openid) {
  const user = await ensureUser(openid)
  if (user.rewardClaimed) {
    if (user.rewardCode) return ok({ code: user.rewardCode, badgeKey: 'reward', repeated: true })
    // 兜底：早期只有打标没有存码（理论不会出现）→ 补生成并存储
    const code = await createRewardCodeDoc()
    await db.collection('users').doc(openid).update({ data: { rewardCode: code } }).catch(() => {})
    return ok({ code, badgeKey: 'reward', repeated: true })
  }
  const code = await createRewardCodeDoc()
  try {
    await db
      .collection('users')
      .doc(openid)
      .update({ data: { rewardClaimed: true, rewardCode: code } })
  } catch (e) {
    // 打标失败则回滚已生成的码，避免"码已生成但用户不能再领"的卡死状态
    await db.collection('codes').where({ code }).remove().catch(() => {})
    throw e
  }
  return ok({ code, badgeKey: 'reward' })
}

/* ========== 成就徽章（15 枚，见 UI/成就徽章设计文档.md） ==========
 * key / name / rarity / type / target 与小程序端 utils/badges.js 保持同步（云函数无法 require 包外文件）
 * users 文档新增：badges 数组 [{ key, unlockTime }]（addToSet 原子补录，重复触发不重复解锁）
 * users 文档新增：totalLikes 冗余计数（暖心点赞进度：点赞 +1 / 取消 -1；与每日经验计数 likeCount 区分）
 * 解锁检查在相关行为云函数动作末尾调用 checkBadgeUnlocks，返回 newBadges 供前端弹解锁提示 */

const BADGES = [
  { key: 'first-post', name: '初来乍到', rarity: '普通', type: 'postCount', target: 1 },
  { key: 'rice-master', name: '干饭达人', rarity: '稀有', type: 'postCount', target: 30 },
  { key: 'taotie', name: '饕餮', rarity: '传说', type: 'postCount', target: 100 },
  { key: 'chef-hat', name: '大厨之星', rarity: '普通', type: 'cookCount', target: 1 },
  { key: 'food-writer', name: '美食作家', rarity: '史诗', type: 'cookCount', target: 20 },
  { key: 'shutter', name: '快门美食家', rarity: '稀有', type: 'postWithImage', target: 1 },
  { key: 'heart-likes', name: '暖心点赞', rarity: '稀有', type: 'likeGiven', target: 100 },
  { key: 'gold-words', name: '金口玉言', rarity: '稀有', type: 'commentCount', target: 50 },
  { key: 'star-hot', name: '人气王', rarity: '传说', type: 'topPostLikes', target: 100 },
  { key: 'collector', name: '品味收藏家', rarity: '史诗', type: 'favoriteCount', target: 20 },
  { key: 'wheel-fish', name: '饭桌锦鲤', rarity: '稀有', type: 'decideCount', target: 200 },
  { key: 'fish-spirit', name: '锦鲤附体', rarity: '史诗', type: 'blindBoxCount', target: 50 },
  { key: 'ticket-king', name: '兑换收藏家', rarity: '史诗', type: 'redeemCount', target: 3 },
  { key: 'max-level', name: '满级传说', rarity: '传说', type: 'maxLevel', target: 10 },
  { key: 'developer', name: '开发者', rarity: '特殊', type: 'manual', target: 1 },
  { key: 'reward', name: '打赏开发者', rarity: '特殊', type: 'manual', target: 1 } // UI/打赏功能设计文档.md 5.1
]
const BADGE_BY_KEY = {}
BADGES.forEach((b) => { BADGE_BY_KEY[b.key] = b })

// 把 users 文档的 badges 数组转成展示列表（按解锁时间倒序，limit 截断）
// 帖子列表返回全量（limit 99）：前端负责 5 枚展示位（已解锁优先 + 随机补）与「展开看全部」面板
function badgeListOf(raw, limit) {
  return (raw || [])
    .slice()
    .sort((a, b) => (b.unlockTime || 0) - (a.unlockTime || 0))
    .map((b) => {
      const def = BADGE_BY_KEY[b.key] || {}
      return { key: b.key, name: def.name || b.key, rarity: def.rarity || '普通', unlockTime: b.unlockTime || 0 }
    })
    .slice(0, limit || 3)
}

// 各行为触发点要检查的进度类型（见设计文档 6.2；满级传说跟随任何行为顺带检查，不加查询）
const BADGE_SCENARIOS = {
  post: ['postCount', 'postWithImage'],
  cook: ['cookCount'],
  like: ['likeGiven', 'topPostLikes'],
  comment: ['commentCount'],
  favorite: ['favoriteCount'],
  decide: ['decideCount', 'blindBoxCount'],
  redeem: ['redeemCount']
}

// 计算某用户一批进度类型的当前值（并行 count；maxLevel / likeGiven 直接用用户文档）
async function computeBadgeValues(user, types) {
  const openid = user._id
  const out = {}
  const safe = (p) => p.then((r) => r.total).catch(() => 0)
  const jobs = []
  if (types.indexOf('postCount') > -1) {
    jobs.push(safe(db.collection('posts').where({ openid }).count()).then((v) => { out.postCount = v }))
  }
  if (types.indexOf('postWithImage') > -1) {
    jobs.push(
      safe(
        db
          .collection('posts')
          .where({ openid, imageUrl: _.and(_.exists(true), _.neq('')) })
          .count()
      ).then((v) => { out.postWithImage = v })
    )
  }
  if (types.indexOf('cookCount') > -1) {
    jobs.push(safe(db.collection('cooks').where({ openid }).count()).then((v) => { out.cookCount = v }))
  }
  if (types.indexOf('commentCount') > -1) {
    jobs.push(safe(db.collection('comments').where({ openid }).count()).then((v) => { out.commentCount = v }))
  }
  if (types.indexOf('favoriteCount') > -1) {
    jobs.push(safe(db.collection('favorites').where({ openid }).count()).then((v) => { out.favoriteCount = v }))
  }
  if (types.indexOf('decideCount') > -1) {
    jobs.push(safe(db.collection('history').where({ openid }).count()).then((v) => { out.decideCount = v }))
  }
  if (types.indexOf('blindBoxCount') > -1) {
    jobs.push(
      safe(db.collection('history').where({ openid, source: '盲盒' }).count()).then((v) => { out.blindBoxCount = v })
    )
  }
  if (types.indexOf('redeemCount') > -1) {
    jobs.push(safe(db.collection('redeems').where({ openid }).count()).then((v) => { out.redeemCount = v }))
  }
  if (types.indexOf('topPostLikes') > -1) {
    jobs.push(
      db
        .collection('posts')
        .where({ openid })
        .orderBy('likes', 'desc')
        .limit(1)
        .get()
        .then((r) => { out.topPostLikes = (r.data[0] && r.data[0].likes) || 0 })
        .catch(() => { out.topPostLikes = 0 })
    )
  }
  await Promise.all(jobs)
  out.likeGiven = Math.max(0, user.totalLikes || 0) // 累计点赞冗余计数，钳制不为负（取消点赞回退）
  out.maxLevel = getLevel(user.exp || 0) // 满级传说的进度 = 当前等级
  out.manual = (user.badges || []).some((b) => b.key === 'developer') ? 1 : 0
  return out
}

// 行为后检查徽章解锁：达到条件且未解锁 → addToSet 原子补录，返回新解锁列表
async function checkBadgeUnlocks(openid, scenario) {
  if (!openid || openid === 'system') return []
  const user = await ensureUser(openid)
  const unlockedMap = new Set((user.badges || []).map((b) => b.key))
  const types = (BADGE_SCENARIOS[scenario] || []).concat('maxLevel') // 满级传说永远顺带检查
  const targets = BADGES.filter((b) => types.indexOf(b.type) > -1 && !unlockedMap.has(b.key))
  if (!targets.length) return []
  const values = await computeBadgeValues(user, types)
  const newly = []
  for (const b of targets) {
    if ((values[b.type] || 0) >= b.target) {
      try {
        await db
          .collection('users')
          .doc(openid)
          .update({ data: { badges: _.addToSet({ key: b.key, unlockTime: Date.now() }) } })
        newly.push({ key: b.key, name: b.name, rarity: b.rarity })
      } catch (e) {
        // 并发补录冲突忽略（已解锁过）
      }
    }
  }
  return newly
}

// 徽章墙 / 详情弹层进度（我的页）：全量 15 枚 + 当前进度 + 解锁时间
async function badgesProgress(openid) {
  const user = await ensureUser(openid)
  const unlockedMap = new Map((user.badges || []).map((b) => [b.key, b.unlockTime]))
  const allTypes = [
    'postCount', 'postWithImage', 'cookCount', 'commentCount', 'favoriteCount',
    'decideCount', 'blindBoxCount', 'redeemCount', 'topPostLikes'
  ]
  const values = await computeBadgeValues(user, allTypes)
  const list = BADGES.map((b) => ({
    key: b.key,
    name: b.name,
    rarity: b.rarity,
    target: b.target,
    current: values[b.type] || 0,
    unlocked: unlockedMap.has(b.key),
    unlockTime: unlockedMap.get(b.key) || 0
  }))
  return ok({
    badgeTotal: BADGES.length,
    unlockedCount: list.filter((b) => b.unlocked).length,
    list
  })
}

// 开发者徽章获取途径：专用兑换码（隐藏途径，见 DEV_BADGE_CODES / codesRedeem 步骤 4），不再支持 secret 手动授予

/* ========== 社交功能（关注 / 粉丝 / 作品主页 / 互关私信，见 UI/社交功能设计文档.md） ========== */

// 关注关系判定：
//   'me'        目标是自己
//   'following' 我关注了对方（对方未回关）
//   'follower'  对方关注了我（我未回关）
//   'both'      互相关注
//   'none'      无关系
async function getRelationship(me, target) {
  if (!target || target === me) return 'me'
  const [mine, theirs] = await Promise.all([
    db.collection('follows').where({ followOpenid: me, followeeOpenid: target }).count(),
    db.collection('follows').where({ followOpenid: target, followeeOpenid: me }).count()
  ])
  const a = mine.total > 0
  const b = theirs.total > 0
  if (a && b) return 'both'
  if (a) return 'following'
  if (b) return 'follower'
  return 'none'
}

// 关注（幂等）：不能关注自己 / system 种子号
async function followsAdd(openid, event) {
  const target = event.targetOpenid
  if (!target) return fail('缺少目标用户')
  if (target === openid) return fail('不能关注自己')
  if (target === 'system') return fail('无法关注系统用户')
  await db.collection('follows').add({
    data: { followOpenid: openid, followeeOpenid: target, createTime: Date.now() }
  }).catch((e) => {
    // 重复关注（并发或重复点击）：_id 冲突即视为已关注，幂等通过
    if (!/duplicate/i.test(String(e && e.errMsg || e))) throw e
  })
  return ok({ relationship: await getRelationship(openid, target) })
}

// 取关（幂等）：删掉本人对目标的关注记录
async function followsRemove(openid, event) {
  const target = event.targetOpenid
  if (!target) return fail('缺少目标用户')
  await db.collection('follows').where({ followOpenid: openid, followeeOpenid: target }).remove()
  return ok({ relationship: await getRelationship(openid, target) })
}

// 把一批 openid 装饰成列表项（昵称 / 头像 / 等级 / 是否互关）
async function decorateRelationList(me, ids) {
  const list = []
  if (!ids.length) return list
  const usersRes = await db.collection('users').where({ _id: _.in([...new Set(ids)]) }).limit(100).get()
  const userMap = {}
  usersRes.data.forEach((u) => { userMap[u._id] = u })
  // 批量查"这些人与我是否互关"：一次 where followOpenid in ids AND followeeOpenid = me
  const mutualSet = new Set()
  if (me) {
    const mRes = await db.collection('follows').where({ followeeOpenid: me, followOpenid: _.in([...new Set(ids)]) }).limit(100).get()
    mRes.data.forEach((f) => mutualSet.add(f.followOpenid))
  }
  ids.forEach((id) => {
    const u = userMap[id]
    list.push({
      openid: id,
      nickname: (u && u.nickname) || '饭小圈用户',
      avatar: (u && u.avatar) || '',
      avatarUrl: (u && u.avatarUrl) || '',
      avatarColor: '#FF6B35',
      level: getLevel((u && u.exp) || 0),
      mutual: mutualSet.has(id)
    })
  })
  return list
}

// 我（或指定用户）的关注列表，分页 20
async function followsFollowing(openid, event) {
  const target = event.userId || openid
  const page = Math.max(0, parseInt(event.page, 10) || 0)
  const res = await db
    .collection('follows')
    .where({ followOpenid: target })
    .orderBy('createTime', 'desc')
    .skip(page * 20)
    .limit(20)
    .get()
  const items = await decorateRelationList(openid, res.data.map((f) => f.followeeOpenid))
  return ok({ list: items, hasMore: res.data.length === 20 })
}

// 粉丝列表，分页 20
async function followsFollowers(openid, event) {
  const target = event.userId || openid
  const page = Math.max(0, parseInt(event.page, 10) || 0)
  const res = await db
    .collection('follows')
    .where({ followeeOpenid: target })
    .orderBy('createTime', 'desc')
    .skip(page * 20)
    .limit(20)
    .get()
  const items = await decorateRelationList(openid, res.data.map((f) => f.followOpenid))
  return ok({ list: items, hasMore: res.data.length === 20 })
}

// 用户主页信息（他人 / 自己通用；未注册用户兜底"饭小圈用户 / Lv.0 / 空作品"）
async function userProfile(openid, event) {
  const target = event.userId || openid
  let user
  try {
    const res = await db.collection('users').doc(target).get()
    user = res.data
  } catch (e) {
    user = null // 未注册（如从未登录）：兜底资料
  }
  const [followingCount, followerCount, postCount, cookCount] = await Promise.all([
    db.collection('follows').where({ followOpenid: target }).count(),
    db.collection('follows').where({ followeeOpenid: target }).count(),
    db.collection('posts').where({ openid: target }).count(),
    db.collection('cooks').where({ openid: target }).count()
  ])
  return ok({
    userId: target,
    nickname: (user && user.nickname) || '饭小圈用户',
    avatar: (user && user.avatar) || '',
    avatarUrl: (user && user.avatarUrl) || '',
    avatarColor: '#FF6B35',
    exp: (user && Math.max(0, user.exp || 0)) || 0,
    level: getLevel((user && user.exp) || 0),
    followingCount: followingCount.total,
    followerCount: followerCount.total,
    worksCount: postCount.total + cookCount.total,
    authorBadges: badgeListOf((user && user.badges) || [], 99), // 全部已解锁徽章（用户主页徽章行展示）
    relationship: await getRelationship(openid, target)
  })
}

// 作品聚合（晒吃帖 + 教程按 createTime 倒序），每页 10；他人视角不带删除/踩所需字段
async function worksList(openid, event) {
  const target = event.userId || openid
  const page = Math.max(0, parseInt(event.page, 10) || 0)
  const PAGE_SIZE = 10
  const [postsRes, cooksRes] = await Promise.all([
    db.collection('posts').where({ openid: target }).limit(50).get(),
    db.collection('cooks').where({ openid: target }).limit(50).get()
  ])
  const mine = target === openid
  const likesQuery = (ids, isCook) => {
    const c = isCook ? db.collection('cooks_comments') : db.collection('comments')
    return c.where({ [isCook ? 'cookId' : 'postId']: _.in(ids) }).limit(1000).get()
  }
  const postIds = postsRes.data.map((p) => p._id)
  const cookIds = cooksRes.data.map((p) => p._id)
  const [postCc, cookCc] = await Promise.all([
    postIds.length ? likesQuery(postIds, false) : Promise.resolve({ data: [] }),
    cookIds.length ? likesQuery(cookIds, true) : Promise.resolve({ data: [] })
  ])
  const postCcMap = {}
  postCc.data.forEach((c) => { postCcMap[c.postId] = (postCcMap[c.postId] || 0) + 1 })
  const cookCcMap = {}
  cookCc.data.forEach((c) => { cookCcMap[c.cookId] = (cookCcMap[c.cookId] || 0) + 1 })

  const all = []
  postsRes.data.forEach((p) => {
    all.push({
      type: 'post',
      id: p._id,
      dish: p.dish,
      category: p.category,
      categoryEmoji: p.categoryEmoji,
      emoji: p.emoji,
      imageUrl: p.imageUrl || '',
      gradient: p.gradient || '',
      likes: p.likes || 0,
      liked: (p.likers || []).indexOf(openid) > -1,
      commentCount: postCcMap[p._id] || 0,
      time: p.time,
      createTime: p.createTime || 0,
      mine
    })
  })
  cooksRes.data.forEach((p) => {
    all.push({
      type: 'cook',
      id: p._id,
      title: p.title,
      content: p.content,
      images: p.images || [],
      likes: p.likes || 0,
      liked: (p.likers || []).indexOf(openid) > -1,
      commentCount: cookCcMap[p._id] || 0,
      time: p.time,
      createTime: p.createTime || 0,
      mine
    })
  })
  all.sort((a, b) => b.createTime - a.createTime)
  const pageList = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return ok({ list: pageList, hasMore: all.length > (page + 1) * PAGE_SIZE })
}

// 会话 threadKey：双方 openid 字典序拼接（谁先谁后无所谓，保证同一对用户只有一条）
function threadKeyOf(a, b) {
  return [a, b].sort().join(':')
}

// 会话列表（我的消息入口）：按最后消息时间倒序，带对方资料与未读数
async function messagesConversations(openid) {
  const res = await db
    .collection('conversations')
    .where(_.or([{ userA: openid }, { userB: openid }]))
    .orderBy('lastTime', 'desc')
    .limit(50)
    .get()
  const list = []
  for (const c of res.data) {
    const otherOpenid = c.userA === openid ? c.userB : c.userA
    let other
    try {
      other = (await db.collection('users').doc(otherOpenid).get()).data
    } catch (e) {
      other = null
    }
    const mine = c.userA === openid // 本方是谁
    const unread = mine ? c.unreadA || 0 : c.unreadB || 0
    list.push({
      threadKey: c._id,
      otherOpenid,
      nickname: (other && other.nickname) || '饭小圈用户',
      avatar: (other && other.avatar) || '',
      avatarUrl: (other && other.avatarUrl) || '',
      avatarColor: '#FF6B35',
      lastMessage: c.lastMessage || '',
      lastTime: c.lastTime || 0,
      lastTimeText: timeAgoText(c.lastTime || 0),
      unread
    })
  }
  return ok(list)
}

// 消息总未读数（我的页红点）
async function messagesUnread(openid) {
  const res = await db
    .collection('conversations')
    .where(_.or([{ userA: openid }, { userB: openid }]))
    .limit(50)
    .get()
  let total = 0
  res.data.forEach((c) => {
    total += (c.userA === openid ? c.unreadA || 0 : c.unreadB || 0)
  })
  return ok({ count: total })
}

// 进入聊天页：无会话则创建一个（互关才放行），返回 threadKey / 对方资料 / 当前是否互关
async function messagesOpen(openid, event) {
  const target = event.targetOpenid
  if (!target) return fail('缺少目标用户')
  const rel = await getRelationship(openid, target)
  const key = threadKeyOf(openid, target)
  let conv
  try {
    conv = (await db.collection('conversations').doc(key).get()).data
  } catch (e) {
    conv = null
  }
  if (!conv) {
    if (rel !== 'both') return fail('互相关注后才能发消息')
    await db.collection('conversations').add({
      data: {
        _id: key,
        userA: key.split(':')[0],
        userB: key.split(':')[1],
        lastMessage: '',
        lastTime: 0,
        unreadA: 0,
        unreadB: 0,
        updateTime: Date.now()
      }
    }).catch(() => {}) // 并发创建冲突忽略（已有会话）
  }
  let other
  try {
    other = (await db.collection('users').doc(target).get()).data
  } catch (e) {
    other = null
  }
  return ok({
    threadKey: key,
    mutual: rel === 'both',
    otherOpenid: target,
    nickname: (other && other.nickname) || '饭小圈用户',
    avatar: (other && other.avatar) || '',
    avatarUrl: (other && other.avatarUrl) || '',
    avatarColor: '#FF6B35'
  })
}

// 消息历史：按时间倒序取最近 50 条，前端倒序展示
async function messagesList(openid, event) {
  const key = event.threadKey
  if (!key) return fail('缺少会话')
  const res = await db
    .collection('messages')
    .where({ threadKey: key })
    .orderBy('createTime', 'desc')
    .limit(50)
    .get()
  const list = res.data
    .map((m) => ({
      id: m._id,
      from: m.fromOpenid,
      mine: m.fromOpenid === openid,
      content: m.content,
      time: m.time,
      timeText: formatTime(new Date(m.createTime)),
      createTime: m.createTime
    }))
    .reverse() // 倒序取、正序展示
  return ok(list)
}

// 发送消息：服务端校验双方仍互关（防客户端绕过）、长度 ≤500、身份属于该会话
async function messagesSend(openid, event) {
  const key = event.threadKey
  const content = (event.content || '').trim()
  if (!key) return fail('缺少会话')
  if (!content) return fail('消息不能为空')
  if (content.length > 500) return fail('消息最多500字')
  let conv
  try {
    conv = (await db.collection('conversations').doc(key).get()).data
  } catch (e) {
    return fail('会话不存在')
  }
  if (conv.userA !== openid && conv.userB !== openid) return fail('会话身份不匹配')
  const target = conv.userA === openid ? conv.userB : conv.userA
  const rel = await getRelationship(openid, target)
  if (rel !== 'both') return fail('你们已不是互相关注，无法发送新消息')
  await db.collection('messages').add({
    data: {
      threadKey: key,
      fromOpenid: openid,
      content,
      time: formatTime(new Date()),
      createTime: Date.now()
    }
  })
  // 更新会话摘要 + 对方未读数（收消息方 +1）
  const update = { lastMessage: content, lastTime: Date.now() }
  if (conv.userA === openid) update.unreadB = _.inc(1)
  else update.unreadA = _.inc(1)
  await db.collection('conversations').doc(key).update({ data: update })
  return ok({})
}

// 进入会话：清空我方未读
async function messagesRead(openid, event) {
  const key = event.threadKey
  if (!key) return fail('缺少会话')
  let conv
  try {
    conv = (await db.collection('conversations').doc(key).get()).data
  } catch (e) {
    return fail('会话不存在')
  }
  const mine = conv.userA === openid
  const update = mine ? { unreadA: 0 } : { unreadB: 0 }
  await db.collection('conversations').doc(key).update({ data: update })
  return ok({})
}

// 相对时间（会话列表用）：刚刚 / n 分钟前 / n 小时前 / 昨天 / 日期
function timeAgoText(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 24 * 3600 * 1000) return Math.floor(diff / 3600000) + ' 小时前'
  const d = new Date(ts)
  const now = new Date()
  if (dateStr(d) === dateStr(now)) return '刚刚'
  if (d.getDate() === now.getDate() - 1) return '昨天'
  return dateStr(d).slice(5)
}

/* ---------- 意见反馈（UI/反馈功能设计文档.md） ---------- */

// 类型 / 状态枚举：与小程序端 utils/feedback.js 保持一致（云函数无法 require 包外文件，需同步维护）
const FEEDBACK_TYPES = {
  suggestion: '功能建议',
  bug: '问题反馈',
  report: '内容举报',
  other: '其他'
}
const FEEDBACK_STATUS = {
  pending: '已收到',
  processing: '处理中',
  resolved: '已解决'
}
// 每用户每日最多提交 5 条（北京时间自然日，与发帖上限同一套口径）
const FEEDBACK_DAILY_LIMIT = 5
// 相同内容（contentHash）10 分钟内重复提交判定为重复工单
const FEEDBACK_REPEAT_WINDOW = 10 * 60 * 1000
// 附图 URL 域名白名单：与 utils/oss.js 的 OSS_CONFIG.baseUrl 保持一致（仅校验前缀，不重新下载）
const FEEDBACK_IMG_PREFIX = 'https://fanxiaoquan.oss-cn-beijing.aliyuncs.com/'

// 反馈通知邮件：把新反馈发到指定邮箱（EMail 环境变量未配置时自动跳过，不影响反馈落库）
// 配置：云开发控制台 → 云函数 → api → 配置 → 环境变量
//   EMAIL_HOST smtp 服务器（如 smtp.qq.com）/ EMAIL_PORT（默认 465）/ EMAIL_USER 发件邮箱
//   EMAIL_PASS 授权码（不是登录密码）/ EMAIL_TO 收件邮箱（客户指定的反馈接收邮箱）
let nodemailer = null
try { nodemailer = require('nodemailer') } catch (e) { /* 云端未安装依赖时自动降级为"只落库不发邮件" */ }

async function sendFeedbackEmail(fb, user) {
  const host = process.env.EMAIL_HOST
  const from = process.env.EMAIL_USER
  const pass = process.env.EMAIL_PASS
  const to = process.env.EMAIL_TO
  if (!nodemailer || !host || !from || !pass || !to) {
    console.log('[feedback] 未配置 EMAIL_* 环境变量，跳过邮件通知（反馈已落库，后台仍可查看）')
    return
  }
  const images = (fb.images || []).map((u, i) => '\n  ' + (i + 1) + '. ' + u).join('') || '（无附图）'
  const text =
    '【饭小圈】收到一条新反馈\n\n' +
    '类型：' + (FEEDBACK_TYPES[fb.type] || fb.type) + '\n' +
    '内容：\n' + fb.content + '\n\n' +
    '附图：' + images + '\n' +
    '联系方式：' + (fb.contact || '（未填写）') + '\n' +
    '提交时间：' + formatTime(new Date(fb.createTime)) + '\n' +
    '反馈编号：' + fb.id + '\n\n' +
    '处理：登录云开发控制台 → 数据库 → feedbacks 集合，将 status 改为 processing / resolved 并写入 reply，用户在小程序「我的反馈」中即可看到进度与回复。'
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.EMAIL_PORT || 465),
    secure: String(process.env.EMAIL_PORT || '465') === '465',
    auth: { user: from, pass }
  })
  await transporter.sendMail({
    from: '饭小圈反馈 <' + from + '>',
    to,
    subject: '【饭小圈】新' + (FEEDBACK_TYPES[fb.type] || '反馈') + '：' + fb.content.slice(0, 20),
    text
  })
  console.log('[feedback] 通知邮件已发送 →', to)
}

// 北京时间今天 0 点的时间戳（防刷计数用，与发帖上限同一套口径）
function todayStart() {
  return dateStr(new Date(Date.now() + 8 * 3600 * 1000)) + 'T00:00:00Z'
}

// 提交反馈：服务端强制校验（长度/枚举/图片域名/联系方式/日上限/内容去重），成功后发通知邮件
async function feedbacksCreate(openid, event) {
  const type = event.type
  const content = String(event.content || '').trim()
  const imagesRaw = Array.isArray(event.images) ? event.images : []
  const contact = String(event.contact || '').trim()

  if (imagesRaw.length > 3) return fail('附图最多3张')
  const images = imagesRaw.slice(0, 3)

  if (!FEEDBACK_TYPES[type]) return fail('反馈类型不正确')
  if (content.length < 10) return fail('再写详细一点（至少10个字），方便我们定位问题')
  if (content.length > 500) return fail('反馈最多500字')
  if (images.length > 3) return fail('附图最多3张')
  for (const url of images) {
    if (typeof url !== 'string' || url.indexOf(FEEDBACK_IMG_PREFIX) !== 0) return fail('附图域名不合法')
  }
  if (contact) {
    const validContact =
      /^[a-zA-Z0-9_]{6,20}$/.test(contact) || // 微信号
      /^1\d{10}$/.test(contact) || // 手机号
      /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(contact) // 邮箱
    if (!validContact) return fail('联系方式格式不正确（微信号 / 手机号 / 邮箱）')
  }

  // 防刷：每用户每日最多 5 条（按北京时间自然日）
  const todayCount = await db
    .collection('feedbacks')
    .where({ openid, createTime: _.gte(new Date(todayStart()).getTime()) })
    .count()
  if (todayCount.total >= FEEDBACK_DAILY_LIMIT) return fail('今日反馈已达上限，明天再来吧')

  // 去重：相同内容 10 分钟窗口内拒绝重复工单
  const hash = require('crypto').createHash('md5').update(content).digest('hex')
  const dup = await db
    .collection('feedbacks')
    .where({ openid, contentHash: hash })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get()
  if (dup.data[0] && dup.data[0].createTime > Date.now() - FEEDBACK_REPEAT_WINDOW) {
    return fail('这条反馈你已经提交过了，我们会尽快处理')
  }

  const now = Date.now()
  const doc = await db.collection('feedbacks').add({
    data: {
      openid,
      type,
      content,
      images,
      contact, // 仅后台可见：列表/详情接口不回传
      contentHash: hash,
      status: 'pending',
      reply: '',
      statusHistory: [{ status: 'pending', time: now }],
      createTime: now,
      updatedTime: now
    }
  })

  // 邮件是通知手段不是依赖：失败只记日志，不影响提交结果
  try {
    const u = await ensureUser(openid)
    await sendFeedbackEmail({ id: doc._id, type, content, images, contact, createTime: now }, u)
  } catch (e) {
    console.error('[feedback] 邮件发送失败（不影响反馈落库）', e)
  }

  return ok({ id: doc._id })
}

// 我的反馈列表：仅本人可见，时间倒序，分页 10；不回显联系方式
async function feedbacksList(openid, event) {
  const page = Math.max(0, parseInt(event.page, 10) || 0)
  const PAGE_SIZE = 10
  const res = await db
    .collection('feedbacks')
    .where({ openid })
    .orderBy('createTime', 'desc')
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .get()
  const list = res.data.map((f) => ({
    id: f._id,
    type: f.type,
    typeLabel: FEEDBACK_TYPES[f.type] || f.type,
    status: f.status,
    statusLabel: FEEDBACK_STATUS[f.status] || f.status,
    content: f.content,
    imageCount: (f.images || []).length,
    createTime: f.createTime,
    timeText: formatTime(new Date(f.createTime))
  }))
  return ok({ list, hasMore: list.length === PAGE_SIZE })
}

// 反馈详情：仅本人可见，含状态时间线与客服回复；不回显联系方式
async function feedbacksDetail(openid, event) {
  const id = event.id
  if (!id) return fail('缺少反馈编号')
  let doc
  try {
    doc = (await db.collection('feedbacks').doc(id).get()).data
  } catch (e) {
    return fail('反馈不存在')
  }
  if (doc.openid !== openid) return fail('无权查看该反馈')
  return ok({
    id: doc._id,
    type: doc.type,
    typeLabel: FEEDBACK_TYPES[doc.type] || doc.type,
    content: doc.content,
    images: doc.images || [],
    status: doc.status,
    statusLabel: FEEDBACK_STATUS[doc.status] || doc.status,
    reply: doc.reply || '',
    statusHistory: (doc.statusHistory || []).map((s) => ({
      status: s.status,
      statusLabel: FEEDBACK_STATUS[s.status] || s.status,
      timeText: formatTime(new Date(s.time))
    })),
    createTime: doc.createTime,
    timeText: formatTime(new Date(doc.createTime))
  })
}

/* ---------- 检索（UI/检索功能设计文档.md） ---------- */

// 正则特殊字符转义：用户输入含 [ ] ( ) * + ? . \ ^ $ | 等元字符时不报错、按字面匹配
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 搜索：scope = feed | nearby | cook
//   feed：菜名 / 分类 / 昵称 包含关键字（不区分大小写），排除已踩
//   nearby：同 feed + 50km Haversine 过滤（沿用 nearby.list 逻辑），无定位引导开启
//   cook：标题 / 正文 / 昵称 包含关键字
// 全表扫描（RegExp 不走索引）对当前数据量可接受，以 limit 上限保护；
// 数据量增长后迁移 searchText 冗余字段 + 索引方案（见设计文档 5.4）
async function search(openid, event) {
  const scope = event.scope
  const keyword = String(event.keyword || '').trim().slice(0, 20)
  const page = Math.max(0, parseInt(event.page, 10) || 0)
  const PAGE_SIZE = 10
  const SEARCH_LIMIT = 100 // 匹配总数上限（文档：结果计数截断为 100）

  if (['feed', 'nearby', 'cook'].indexOf(scope) === -1) return fail('检索范围不正确')
  if (!keyword) return ok({ list: [], total: 0, hasMore: false, needLocation: false })

  const regex = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
  const viewer = await ensureUser(openid)

  if (scope === 'cook') {
    const res = await db
      .collection('cooks')
      .where(_.or([{ title: regex }, { content: regex }, { nickname: regex }]))
      .orderBy('createTime', 'desc')
      .limit(SEARCH_LIMIT)
      .get()
    const list = await decorateCooks(res.data, openid)
    const total = Math.min(list.length, SEARCH_LIMIT)
    return ok({
      list: list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
      total,
      hasMore: page * PAGE_SIZE + PAGE_SIZE < total,
      needLocation: false
    })
  }

  // feed / nearby：posts 集合按关键字匹配
  const res = await db
    .collection('posts')
    .where(_.or([{ dish: regex }, { category: regex }, { nickname: regex }]))
    .orderBy('createTime', 'desc')
    .limit(SEARCH_LIMIT)
    .get()
  const hidden = await getHiddenPostIds(openid) // 已踩帖子不出现在搜索结果
  let visible = res.data.filter((p) => !hidden.has(p._id))

  if (scope === 'nearby') {
    if (!viewer.lat || !viewer.lng) return ok({ list: [], total: 0, hasMore: false, needLocation: true })
    visible = visible.filter(
      (p) =>
        p.openid !== 'system' &&
        p.lat &&
        p.lng &&
        haversine(viewer.lat, viewer.lng, p.lat, p.lng) <= NEARBY_RADIUS
    )
  }

  const total = Math.min(visible.length, SEARCH_LIMIT)
  const pageItems = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const list = await decoratePosts(pageItems, openid, viewer.lat, viewer.lng)
  return ok({ list, total, hasMore: page * PAGE_SIZE + pageItems.length < total, needLocation: false })
}

/* ---------- 路由 ---------- */

const ROUTES = {
  seed: seed,
  'posts.list': postsList,
  'posts.create': postsCreate,
  'posts.todayCount': postsTodayCount,
  'posts.delete': postsDelete,
  'nearby.list': nearbyList,
  'likes.toggle': likesToggle,
  'favorites.list': favoritesList,
  'favorites.add': favoritesAdd,
  'favorites.remove': favoritesRemove,
  'favorites.isFavorite': favoritesIsFavorite,
  'history.list': historyList,
  'history.add': historyAdd,
  'history.clear': historyClear,
  'comments.list': commentsList,
  'comments.add': commentsAdd,
  'cooks.list': cooksList,
  'cooks.create': cooksCreate,
  'cooks.toggleLike': cooksLikeToggle,
  'cooks_comments.list': cooksCommentsList,
  'cooks_comments.add': cooksCommentsAdd,
  'user.get': userGet,
  'user.set': userSet,
  'user.reset': userReset,
  'badges.progress': badgesProgress,
  'codes.list': codesList,
  'codes.redeem': codesRedeem,
  'reward.claim': rewardClaim,
  'hides.add': hidesAdd,
  'follows.add': followsAdd,
  'follows.remove': followsRemove,
  'follows.following': followsFollowing,
  'follows.followers': followsFollowers,
  'user.profile': userProfile,
  'works.list': worksList,
  'messages.conversations': messagesConversations,
  'messages.unread': messagesUnread,
  'messages.open': messagesOpen,
  'messages.list': messagesList,
  'messages.send': messagesSend,
  'messages.read': messagesRead,
  'feedbacks.create': feedbacksCreate,
  'feedbacks.list': feedbacksList,
  'feedbacks.detail': feedbacksDetail,
  'search': search
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = event && event.action
  const handler = ROUTES[action]
  if (!handler) return fail('未知 action: ' + action)
  try {
    return await handler(OPENID, event)
  } catch (e) {
    console.error('api error:', action, e)
    return fail('服务异常：' + (e && e.message ? e.message : 'unknown'))
  }
}
