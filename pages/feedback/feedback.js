/**
 * pages/feedback —— 意见反馈（UI/反馈功能设计文档.md F2）
 * 类型单选 → 内容 10-500 字 → 附图 ≤3 张（复用 OSS 直传）→ 联系方式选填（格式校验）
 * 提交后云函数强制校验（长度/枚举/图片域名/日上限/内容去重），成功跳转「我的反馈」
 */
const api = require('../../utils/api')
const oss = require('../../utils/oss')
const fb = require('../../utils/feedback')

Page({
  data: {
    types: fb.TYPES,
    type: 'bug', // 默认"问题反馈"
    content: '',
    images: [], // 本地路径，提交前直传 OSS 换 URL
    contactTypes: [
      { key: 'wechat', label: '微信号' },
      { key: 'phone', label: '手机号' },
      { key: 'email', label: '邮箱' }
    ],
    contactType: '', // '' = 不填联系方式
    contact: '',
    contactPlaceholder: '',
    submitting: false
  },

  // 类型单选，切换不保留输入（文档 4.1）
  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.key })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  /* ---------- 附图（最多 3 张，选图后缩略图预览可删除） ---------- */
  chooseImage() {
    const remain = 3 - this.data.images.length
    if (remain <= 0) return
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const files = res.tempFiles || []
        if (!files.length) return
        const images = this.data.images.concat(files.map((f) => f.tempFilePath))
        this.setData({ images: images.slice(0, 3) })
      }
    })
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.idx
    const images = this.data.images.slice()
    images.splice(idx, 1)
    this.setData({ images })
  },

  previewImage(e) {
    wx.previewImage({ current: e.currentTarget.dataset.url, urls: this.data.images })
  },

  /* ---------- 联系方式（选填，单项，前端格式校验，云函数再校验一遍） ---------- */
  selectContactType(e) {
    const key = e.currentTarget.dataset.key
    this.setData({
      contactType: key,
      contact: '',
      contactPlaceholder: (fb.CONTACT_RULES[key] || {}).placeholder || ''
    })
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value })
  },

  /* ---------- 提交 ---------- */
  canSubmit() {
    const content = this.data.content.trim()
    if (content.length < 10) {
      wx.showToast({ title: '再写详细一点，方便我们定位问题', icon: 'none' })
      return false
    }
    if (content.length > 500) {
      wx.showToast({ title: '内容最多 500 字', icon: 'none' })
      return false
    }
    if (this.data.contact) {
      const rule = fb.CONTACT_RULES[this.data.contactType]
      if (!rule || !rule.pattern.test(this.data.contact)) {
        wx.showToast({ title: (rule && rule.tip) || '联系方式格式不正确', icon: 'none' })
        return false
      }
    }
    return true
  },

  submit() {
    if (this.data.submitting || !this.canSubmit()) return
    this.setData({ submitting: true })
    const doSubmit = (images) => {
      api
        .createFeedback({
          type: this.data.type,
          content: this.data.content.trim(),
          images,
          contact: this.data.contact.trim()
        })
        .then(() => {
          wx.showToast({ title: '反馈已收到，感谢你', icon: 'success' })
          setTimeout(() => wx.redirectTo({ url: '/pages/feedback-list/feedback-list' }), 600)
        })
        .catch((err) => {
          this.setData({ submitting: false })
          api.toastError(err)
        })
    }
    if (this.data.images.length) {
      // 先直传 OSS（与晒吃同一套链路），全部成功后才提交
      wx.showLoading({ title: '上传图片中…', mask: true })
      oss
        .uploadImages(this.data.images)
        .then((urls) => {
          wx.hideLoading()
          doSubmit(urls)
        })
        .catch((err) => {
          wx.hideLoading()
          this.setData({ submitting: false })
          api.toastError(err)
        })
    } else {
      doSubmit([])
    }
  }
})
