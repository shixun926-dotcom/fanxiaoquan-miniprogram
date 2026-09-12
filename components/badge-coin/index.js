/**
 * components/badge-coin —— 成就徽章圆盘（复用单元）
 *
 * 严格按《成就徽章设计文档》第一、三节的「设计须知」：
 *   - 正圆双层金边（暖金 #D4AF37 主色 + 高光/阴影内圈）
 *   - 底色径向渐变（圆心亮 → 边缘暗，两色随徽章主题）
 *   - 图标与金边预留 8% 空白（图标占直径 84%）
 *   - 稀有度外环（普通/稀有/史诗/传说纯色环，特殊虹彩 conic）
 *   - 流光：白色光带绕金边内侧顺时针旋转，3s/圈 + 0.2s 停顿，
 *     常规低亮、划过图标峰值亮度（约 3.2s 周期内 opacity 脉冲近似）
 *   - 未解锁：整盘灰显 + 右下角锁标记，无流光
 *
 * 使用：<badge-coin key="rice-master" locked="{{false}}" size="88" />
 * 目录/图标在 utils/badges.js，本组件按 key 自取。
 */
const badges = require('../../utils/badges')

const RAINBOW_RING = 'conic-gradient(from 0deg, #FFD37A, #E8432E, #FF6B35, #FFB400, #FFD37A)'

Component({
  properties: {
    // 徽章 key（目录在 utils/badges.js）
    key: { type: String, value: '' },
    // 未解锁：灰显 + 锁标记 + 无流光
    locked: { type: Boolean, value: false },
    // 直径（rpx）
    size: { type: Number, value: 88 },
    // 是否播流光（解锁态才有效；迷你展示位可关掉省资源）
    shimmer: { type: Boolean, value: true }
  },

  data: {
    uri: '',
    ringCss: '#A8B4C4',
    ringInset: 7,
    c1: '#FFFFFF',
    c2: '#F3E3D3'
  },

  observers: {
    'key, size'(key, size) {
      this.refresh(key, size)
    }
  },

  lifetimes: {
    attached() {
      this.refresh(this.data.key, this.data.size)
    }
  },

  methods: {
    refresh(key, size) {
      const b = badges.getBadge(key)
      if (!b) return
      const meta = badges.getRarity(b.rarity)
      this.setData({
        uri: b.uri,
        ringCss:
          meta.color === 'rainbow'
            ? RAINBOW_RING
            : 'conic-gradient(from 0deg,' + meta.color + ',' + meta.color + ')',
        ringInset: Math.max(4, Math.round((size || 88) * 0.08)), // 稀有度外环随直径缩放
        c1: b.bg[0],
        c2: b.bg[1]
      })
    }
  }
})
