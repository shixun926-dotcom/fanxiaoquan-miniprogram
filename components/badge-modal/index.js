/**
 * components/badge-modal —— 徽章详情弹层
 *
 * 结构（UI/mockups/badges.html 同款）：徽章大图 + 名称 + 稀有度标签 + 类别
 *   + 解锁条件 + 进度条 / 解锁时间 + 「知道了」
 *
 * 用法：
 *   <badge-modal visible="{{showBadgeModal}}" badge="{{curBadge}}" bind:close="onBadgeModalClose" />
 *   badge 支持两种来源：
 *     - 我的徽章墙：badges.progress 的 list 项（含 target/current/unlocked/unlockTime，显示进度条）
 *     - 他人帖子里：authorBadges 项（{key, name, rarity, unlockTime}，无进度数据，只显示解锁条件与时间）
 */
const badges = require('../../utils/badges')

function fmtDateTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return (
    d.getFullYear() +
    '-' + p(d.getMonth() + 1) +
    '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) +
    ':' + p(d.getMinutes())
  )
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    badge: { type: Object, value: {} }
  },

  data: {
    vName: '',
    vCat: '',
    vDesc: '',
    vRarity: '普通',
    pillBg: '#EEF1F5',
    pillTx: '#5A6B7C',
    unlockText: '',
    hasProgress: false, // 有 current/target（我的徽章墙）才显示进度条
    pct: 0,
    remain: 0,
    isReward: false // 打赏徽章特判：完整奖章图
  },

  observers: {
    'badge, visible'(badge) {
      const src = badge || {}
      const b = badges.getBadge(src.key) || {}
      const rarity = src.rarity || b.rarity || '普通'
      const meta = badges.getRarity(rarity)
      const unlocked = !!src.unlocked
      const hasProgress = typeof src.current === 'number'
      const pct = hasProgress && src.target ? Math.min(100, Math.round((src.current / src.target) * 100)) : 0
      this.setData({
        vName: src.name || b.name || '',
        vCat: b.category || '',
        vDesc: b.desc || '',
        vRarity: rarity,
        pillBg: meta.pillBg,
        pillTx: meta.pillTx,
        unlockText: unlocked ? fmtDateTime(src.unlockTime) : '',
        hasProgress,
        pct,
        remain: hasProgress && src.target ? Math.max(0, src.target - src.current) : 0,
        isReward: src.key === 'reward' // 打赏徽章用完整奖章图（UI/打赏功能设计文档.md 3.2 五层结构）
      })
    }
  },

  methods: {
    noop() {},
    onMask() {
      this.close()
    },
    onClose() {
      this.close()
    },
    close() {
      this.triggerEvent('close')
    }
  }
})
