/**
 * components/badge-all —— 全部徽章展开面板（成就徽章系统）
 * 帖子昵称行 / 用户主页徽章位点击后展开：全量 15 枚网格（已解锁彩色、未解锁灰显带锁）
 * 点单枚徽章触发 tapBadge（{key, name, rarity, unlocked, unlockTime}），由页面弹详情
 *
 * 用法：
 *   <badge-all visible="{{showAllBadges}}" list="{{allBadges}}" unlocked-count="{{allUnlockedCount}}"
 *     total="{{badgeTotal}}" bind:tapBadge="onAllBadgeTap" bind:close="onAllBadgesClose" />
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    list: { type: Array, value: [] }, // 全量徽章（utils/badges.js buildAllBadges 输出，含 unlocked 标记）
    unlockedCount: { type: Number, value: 0 },
    total: { type: Number, value: 15 }
  },

  methods: {
    noop() {},
    onTap(e) {
      const badge = this.data.list[e.currentTarget.dataset.index]
      if (badge) this.triggerEvent('tapBadge', badge)
    },
    onMask() {
      this.triggerEvent('close')
    },
    onClose() {
      this.triggerEvent('close')
    }
  }
})
