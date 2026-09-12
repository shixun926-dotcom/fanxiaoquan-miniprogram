/**
 * utils/level.js —— 饭小圈等级配置（本地 + 云函数共用逻辑，需同步维护）
 *
 * 等级 0~10，升级所需经验逐级增加。
 * exp 累计存在 users 文档的 exp 字段，等级由 exp 推导（等级阈值见下）。
 */
const MAX_LEVEL = 10

// 升到每一级所需的累计经验阈值
// 每升一级比上一级多 30 经验：Lv0→1 需 30，Lv1→2 再需 60，Lv2→3 再需 90 ...
const LEVEL_THRESHOLDS = [0, 30, 90, 180, 300, 450, 630, 840, 1080, 1350, 1650]

// 根据累计 exp 计算等级（0~10）
function getLevel(exp) {
  const e = Math.max(0, exp || 0)
  for (let lv = MAX_LEVEL; lv >= 0; lv--) {
    if (e >= LEVEL_THRESHOLDS[lv]) return lv
  }
  return 0
}

// 星级食神称号表（设计规范 6.1，仅小程序端展示用，云函数无需称号）
// badge: 徽章主色；'rainbow' 为虹彩渐变（9 级以上）
const LEVEL_TITLES = [
  { title: '萌新食客', tagline: '欢迎来到饭小圈', emoji: '🐣', badge: '#B08D6B' },
  { title: '觅食学徒', tagline: '开始用转盘决定人生大事', emoji: '🥢', badge: '#B08D6B' },
  { title: '小吃货', tagline: '嘴巴开始有追求了', emoji: '🍡', badge: '#C97F5A' },
  { title: '探店达人', tagline: '哪家好吃，一问便知', emoji: '🔍', badge: '#9AA6B2' },
  { title: '美食猎人', tagline: '追着香气跑', emoji: '🎯', badge: '#9AA6B2' },
  { title: '资深吃货', tagline: '干饭不积极，思想有问题', emoji: '🍖', badge: '#9AA6B2' },
  { title: '星级食评家', tagline: '吃得讲究，写得走心', emoji: '⭐', badge: '#FFB400' },
  { title: '大厨之友', tagline: '半个厨房都被你逛熟了', emoji: '👨‍🍳', badge: '#FFB400' },
  { title: '美食大师', tagline: '你的舌头会发光', emoji: '🏆', badge: '#FFB400' },
  { title: '食神候选人', tagline: '距离封神一步之遥', emoji: '🍜', badge: 'rainbow' },
  { title: '食神驾到', tagline: '饭小圈的神，就是你', emoji: '👑', badge: 'rainbow' }
]

// 取某等级的称号信息（越界时返回首/末级）
function getLevelTitle(level) {
  const i = Math.max(0, Math.min(MAX_LEVEL, level || 0))
  return LEVEL_TITLES[i]
}

// 返回当前等级信息：
// { level, exp（累计）, curExp（本级已积累）, needExp（本级升到下一级需要的总经验）,
//   nextNeed（距升级还差多少经验）, percent（本级进度）, isMax }
function getLevelInfo(exp) {
  const e = Math.max(0, exp || 0)
  const level = getLevel(e)
  const curThreshold = LEVEL_THRESHOLDS[level]
  const isMax = level >= MAX_LEVEL
  const nextThreshold = isMax ? curThreshold : LEVEL_THRESHOLDS[level + 1]
  const curExp = e - curThreshold
  const needExp = nextThreshold - curThreshold
  const nextNeed = isMax ? 0 : needExp - curExp
  const percent = needExp > 0 ? Math.min(100, Math.floor((curExp / needExp) * 100)) : 100
  return {
    level,
    exp: e,
    curExp,
    needExp,
    nextNeed,
    percent,
    isMax
  }
}

module.exports = {
  MAX_LEVEL,
  LEVEL_THRESHOLDS,
  LEVEL_TITLES,
  getLevel,
  getLevelInfo,
  getLevelTitle
}
