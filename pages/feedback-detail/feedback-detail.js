/**
 * pages/feedback-detail —— 反馈详情（UI/反馈功能设计文档.md F4）
 * 完整内容 + 附图预览 + 状态时间线 + 客服回复气泡
 * 状态只读（后台在云开发控制台改 status / reply，用户侧无修改入口）
 */
const api = require('../../utils/api')
const fb = require('../../utils/feedback')

Page({
  data: {
    f: null,
    STATUS: fb.STATUS
  },

  onLoad(options) {
    this.id = options.id
    this.load()
  },

  load() {
    api
      .getFeedbackDetail(this.id)
      .then((f) => this.setData({ f }))
      .catch((err) => api.toastError(err))
  },

  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset
    wx.previewImage({ current: url, urls: urls || [url] })
  }
})
