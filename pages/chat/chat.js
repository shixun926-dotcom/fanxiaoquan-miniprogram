/**
 * pages/chat —— 聊天页（UI/社交功能设计文档.md V2 F8/F9/F10）
 * 仅互相关注可发消息；单条 ≤500 字；进入会话清空我方未读；
 * demo 级实时性：进入页面后每 5s 轮询新消息（无长连接）
 */
const api = require('../../utils/api')

Page({
  data: {
    threadKey: '',
    to: '',
    nickname: '饭小圈用户',
    avatar: '',
    avatarText: '饭',
    messages: [],
    draft: '',
    canSend: false, // 输入非空 + 互关 + 未发送中
    sending: false,
    mutual: false, // 当前是否互相关注（未互关禁止发送）
    toView: '' // scroll-view 滚动目标
  },

  onLoad(options) {
    this.setData({
      threadKey: (options && options.key) || '',
      to: (options && options.to) || ''
    })
  },

  onShow() {
    this.openConversation()
    this.pollTimer = setInterval(() => {
      if (this.data.threadKey && !this.data.sending) this.loadMessages()
    }, 5000)
  },

  onHide() {
    clearInterval(this.pollTimer)
  },

  onUnload() {
    clearInterval(this.pollTimer)
  },

  // 进入会话：确保会话存在 + 拉对方资料 + 清我方未读
  openConversation() {
    api
      .openConversation(this.data.to)
      .then((c) => {
        this.setData({
          threadKey: c.threadKey,
          mutual: c.mutual,
          nickname: c.nickname,
          avatar: c.avatar || c.avatarUrl || '',
          avatarText: (c.nickname || '饭').slice(0, 1)
        })
        wx.setNavigationBarTitle({ title: c.nickname.slice(0, 12) || '聊天' })
        api.markConversationRead(c.threadKey).catch(() => {})
        this.loadMessages()
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '无法进入会话', icon: 'none', duration: 2000 })
        setTimeout(() => wx.navigateBack(), 1200)
      })
  },

  loadMessages() {
    if (!this.data.threadKey) return
    api
      .getMessages(this.data.threadKey)
      .then((list) => {
        this.setData({ messages: list })
        this.scrollToBottom()
      })
      .catch(() => {})
  },

  onDraftInput(e) {
    const draft = e.detail.value
    this.setData({ draft, canSend: !!draft.trim() && this.data.mutual && !this.data.sending })
  },

  onSend() {
    const content = this.data.draft.trim()
    if (!content || this.data.sending) return
    if (content.length > 500) {
      wx.showToast({ title: '消息最多 500 字', icon: 'none' })
      return
    }
    if (!this.data.mutual) {
      wx.showToast({ title: '互相关注后才能发消息', icon: 'none' })
      return
    }
    this.setData({ sending: true, canSend: false })
    api
      .sendMessage(this.data.threadKey, content)
      .then(() => {
        this.setData({ draft: '', sending: false })
        this.loadMessages()
      })
      .catch((err) => {
        this.setData({ sending: false })
        api.toastError(err)
        // 若互关已解除，服务端会拒绝发送：同步界面状态
        if (err && /互相关注/.test(err.message)) this.setData({ mutual: false, canSend: false })
      })
  },

  // 滚动到最后一条消息（id 随消息数变化，保证新消息到达时重新触发）
  scrollToBottom() {
    this.setData({ toView: 'msg-bottom-' + this.data.messages.length })
  }
})
