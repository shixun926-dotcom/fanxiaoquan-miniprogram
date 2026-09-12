/**
 * components/login-panel —— 微信授权登录面板
 *
 * 流程：
 *   1. 微信一键登录：云开发环境自动提供 OPENID（cloud.getWXContext()），
 *      无需像传统后端那样用 code 换 session，点击后直接进入下一步
 *   2. 昵称头像：微信官方「头像昵称填写能力」
 *      - button open-type="chooseAvatar"：用户直接选用微信头像
 *      - input type="nickname"：用户一键填入微信昵称
 *      （注意：wx.getUserProfile 自 2022-10 起只能返回匿名数据，已不可用于真实昵称头像）
 *   3. 头像上传到阿里云 OSS avatars 目录；昵称头像存云数据库 users 集合（utils/api.js）
 */
const api = require('../../utils/api')
const oss = require('../../utils/oss')

Component({
  properties: {
    show: { type: Boolean, value: false }
  },

  data: {
    step: 1, // 1 微信登录 | 2 昵称头像
    avatar: '',
    nickname: '',
    uploading: false
  },

  observers: {
    show(v) {
      if (v) {
        this.setData({ step: 1, avatar: '', nickname: '', uploading: false })
      }
    }
  },

  methods: {
    noop() {},

    /* ---------- step1：微信一键登录（云开发自动识别 openid） ---------- */
    doLogin() {
      this.setData({ step: 2 })
    },

    skip() {
      this.triggerEvent('close')
    },

    /* ---------- step2：昵称头像（官方填写能力） ---------- */
    onChooseAvatar(e) {
      if (e.detail && e.detail.avatarUrl) {
        this.setData({ avatar: e.detail.avatarUrl })
      }
    },

    onNickInput(e) {
      this.setData({ nickname: e.detail.value })
    },

    /* ---------- 定位（附近 50km 需要，拒绝不阻塞；统一走 utils/location.js 封装） ---------- */
    tryGetLocation() {
      const { ensureLocation } = require('../../utils/location')
      ensureLocation().catch(() => {})
    },

    confirm() {
      const nickname = this.data.nickname.trim()
      if (!nickname || this.data.uploading) return
      const avatar = this.data.avatar

      const finish = (avatarUrl) => {
        api
          .setUser({ loggedIn: true, nickname, avatar: avatarUrl || '' })
          .then(() => {
            wx.showToast({ title: '登录成功 🎉', icon: 'none' })
            // 登录成功后获取定位（附近 50km 用）；用户拒绝不阻塞登录，lat/lng 留空
            this.tryGetLocation()
            this.triggerEvent('close')
          })
          .catch((err) => api.toastError(err))
      }

      if (avatar) {
        this.setData({ uploading: true })
        oss
          .uploadImage(avatar, { folder: 'fanxiaoqian/avatars/' })
          .then((url) => finish(url))
          .catch(() => {
            // 上传失败退化为临时头像（仅本次会话有效），不阻塞登录
            this.setData({ uploading: false })
            finish(avatar)
          })
      } else {
        finish('')
      }
    }
  }
})
