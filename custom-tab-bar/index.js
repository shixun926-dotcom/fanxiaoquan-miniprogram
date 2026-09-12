/**
 * custom-tab-bar —— 悬浮胶囊 Dock（设计规范 3.5 方案 B）
 * 白底圆角胶囊悬浮页面底部，选中项为橙红渐变胶囊
 * 页面在 onShow 里通过 this.getTabBar().setData({ selected: n }) 同步选中态
 */
Component({
  data: {
    selected: 0,
    list: [
      // 三个 tab 均用图片图标（UI/图标更换设计规格.md V0.3 定稿）：饭小圈=品牌 logo，决定/我的=新图标
      { pagePath: '/pages/feed/feed', text: '饭小圈', iconType: 'img', iconSrc: '/images/brand/logo-128.png' },
      { pagePath: '/pages/decide/decide', text: '决定', iconType: 'img', iconSrc: '/images/brand/decide-128.png' },
      { pagePath: '/pages/profile/profile', text: '我的', iconType: 'img', iconSrc: '/images/brand/my-home-128.png' }
    ]
  },
  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
    }
  }
})
