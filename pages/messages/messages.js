/**
 * pages/messages —— 消息会话列表（UI/社交功能设计文档.md V2 F8）
 * 会话按最后消息时间倒序；未读会话红点数字；点击进入聊天页
 */
const api = require('../../utils/api')

Page({
  data: {
    conversations: [],
    loading: true
  },

  onShow() {
    this.loadConversations()
  },

  loadConversations() {
    api
      .getConversations()
      .then((list) => {
        this.setData({
          conversations: list.map((c) => ({
            ...c,
            avatarText: (c.nickname || '饭').slice(0, 1)
          })),
          loading: false
        })
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.toastError(err)
      })
  },

  // 点击会话 → 聊天页（进入后聊天页会清空我方未读）
  openChat(e) {
    const { key, to } = e.currentTarget.dataset
    if (!key || !to) return
    wx.navigateTo({ url: '/pages/chat/chat?key=' + key + '&to=' + to })
  }
})
