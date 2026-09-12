/**
 * pages/feedback-list —— 我的反馈列表（UI/反馈功能设计文档.md F3）
 * 仅本人反馈（云函数强制 openid 过滤），时间倒序，分页 10，触底加载
 * 类型标签 + 状态徽章 + 内容摘要（两行截断）+ 时间；点击进入详情
 */
const api = require('../../utils/api')
const fb = require('../../utils/feedback')

Page({
  data: {
    list: [],
    page: 0,
    hasMore: true,
    loading: false,
    loaded: false, // 首次加载完成（空态判定用）
    STATUS: fb.STATUS
  },

  onShow() {
    this.load(0)
  },

  load(page) {
    if (this.data.loading) return
    this.setData({ loading: true })
    api
      .getFeedbacks(page)
      .then((res) => {
        this.setData({
          list: page === 0 ? res.list : this.data.list.concat(res.list),
          page,
          hasMore: res.hasMore,
          loading: false,
          loaded: true
        })
      })
      .catch((err) => {
        this.setData({ loading: false, loaded: true })
        api.toastError(err)
      })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(this.data.page + 1)
  },

  openDetail(e) {
    wx.navigateTo({ url: '/pages/feedback-detail/feedback-detail?id=' + e.currentTarget.dataset.id })
  }
})
