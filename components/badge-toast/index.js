/**
 * components/badge-toast —— 徽章解锁提示（恭喜弹层）
 *
 * 行为类云函数动作（发帖/点赞/评论/收藏/决定/兑换…）返回 newBadges 后调用：
 *   this.setData({ toastBadges: res.newBadges, showBadgeToast: true })
 * 支持一次解锁多枚（横向滚动展示）；点击遮罩 / 「太棒了」关闭，5s 自动关闭。
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    badges: { type: Array, value: [] }
  },

  observers: {
    visible(v) {
      if (v) {
        clearTimeout(this._closeTimer)
        this._closeTimer = setTimeout(() => this.close(), 5000)
      }
    }
  },

  lifetimes: {
    detached() {
      clearTimeout(this._closeTimer)
    }
  },

  methods: {
    noop() {},
    onMask() {
      this.close()
    },
    onOk() {
      this.close()
    },
    close() {
      clearTimeout(this._closeTimer)
      this.triggerEvent('close')
    }
  }
})
