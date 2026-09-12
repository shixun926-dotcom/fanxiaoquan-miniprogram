/**
 * components/redeem-code —— 兑换码输入组件（独立封装，可复用）
 * 职责：输入、校验、调用 api.redeemCode 兑换、成功/失败提示
 * 与页面解耦：兑换成功通过 triggerEvent('redeemed') 通知页面刷新经验等级
 */
const api = require('../../utils/api')

Component({
  data: {
    codeInput: '' // 输入框内容
  },

  methods: {
    onInput(e) {
      this.setData({ codeInput: e.detail.value })
    },

    redeem() {
      const code = this.data.codeInput.trim()
      if (!code) return
      api
        .redeemCode(code)
        .then((res) => {
          this.setData({ codeInput: '' })
          wx.showToast({
            title: res && res.expGained ? `兑换成功 +${res.expGained}经验 🎉` : '兑换成功',
            icon: 'none',
            duration: 2000
          })
          this.triggerEvent('redeemed', {
            expGained: res && res.expGained,
            newBadges: (res && res.newBadges) || []
          })
        })
        .catch((err) => api.toastError(err))
    }
  }
})
