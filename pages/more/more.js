/**
 * pages/more —— 更多（UI/打赏功能设计文档.md F2）
 * 收纳：意见反馈 / 我的反馈（从「我的」页迁入，跳转逻辑与页面文件不变）+ 打赏开发者
 * 未登录也可进入本页；点反馈入口 / 打赏领取时按需引导登录
 */
const api = require('../../utils/api')

Page({
  data: {
    showLogin: false // 登录面板（点反馈入口未登录时弹出）
  },

  openFeedback() {
    this.requireLoginThen(() => wx.navigateTo({ url: '/pages/feedback/feedback' }))
  },

  openFeedbackList() {
    this.requireLoginThen(() => wx.navigateTo({ url: '/pages/feedback-list/feedback-list' }))
  },

  openReward() {
    wx.navigateTo({ url: '/pages/reward/reward' })
  },

  // 未登录点击反馈入口 → 弹登录面板，不跳页
  requireLoginThen(action) {
    api
      .isLoggedIn()
      .then((loggedIn) => {
        if (!loggedIn) {
          this.setData({ showLogin: true })
          return
        }
        action()
      })
      .catch((err) => api.toastError(err))
  },

  closeLogin() {
    this.setData({ showLogin: false })
  }
})
