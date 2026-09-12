// app.js —— 饭小圈入口
// 数据已接入微信云开发：帖子/点赞/收藏/历史/登录用户存云数据库（cloudfunctions/api）
const api = require('./utils/api')

App({
  globalData: {
    loginPrompted: false // 本次启动是否已提示过登录（选「暂不登录」后本会话不再打扰）
  },
  onLaunch() {
    api.init() // 初始化云开发（失败不阻塞启动，各页面调用时会提示）
    api.ensureSeeded().catch(() => {}) // 首次启动播种"附近的人"种子帖（全局一份）
  }
})
