/**
 * pages/reward —— 打赏开发者（UI/打赏功能设计文档.md F3/F4）
 * 双二维码原封不动展示、长按识别；打赏在外部平台完成（信任制领取）
 * 领取流程：点「我已打赏」→ 未登录先弹登录面板 → 云函数发兑换码（首击生成并绑定用户，
 *          之后每次点击返回同一枚）→ 弹层展示（客户指定文案）→ 复制 → 「我的 → 兑换码」兑换解锁打赏徽章
 */
const api = require('../../utils/api')

Page({
  data: {
    showLogin: false, // 登录面板（未登录点领取时弹出）
    showCode: false, // 领取成功弹层
    claimCode: '', // 一次性兑换码
    pendingClaim: false // 登录面板关闭后是否继续领取（登录成功继续、跳过则取消）
  },

  onClaim() {
    api
      .isLoggedIn()
      .then((loggedIn) => {
        if (!loggedIn) {
          this.setData({ showLogin: true, pendingClaim: true })
          return
        }
        this.doClaim()
      })
      .catch((err) => api.toastError(err))
  },

  // 领取打赏徽章兑换码：每次点击都展示（首击云端生成并绑定用户，之后返回同一枚，不拒绝）
  doClaim() {
    api
      .claimReward()
      .then((res) => {
        this.setData({ showCode: true, claimCode: (res && res.code) || '' })
      })
      .catch((err) => api.toastError(err))
  },

  closeLogin() {
    const pending = this.data.pendingClaim
    this.setData({ showLogin: false, pendingClaim: false })
    if (!pending) return
    // login-panel 的 close 不区分「登录成功 / 暂不登录」：重新确认登录态，成功才继续领取
    api
      .isLoggedIn()
      .then((loggedIn) => {
        if (loggedIn) this.doClaim()
      })
      .catch(() => {})
  },

  noop() {},

  closeCode() {
    this.setData({ showCode: false })
  },

  copyCode() {
    wx.setClipboardData({ data: this.data.claimCode })
  },

  // 去「我的」页兑换码处兑换（redeem-code 组件在「我的」页）
  goRedeem() {
    this.setData({ showCode: false })
    wx.switchTab({ url: '/pages/profile/profile' })
  }
})
