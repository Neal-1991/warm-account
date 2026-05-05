// miniprogram/pages/login/login.js
const config = require('../../utils/config')

Page({
  data: {},

  onLoad() {
    // Check if already logged in
    const app = getApp()
    if (app.globalData.openId) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  onLogin(e) {
    if (e.detail.userInfo) {
      const { nickName, avatarUrl } = e.detail.userInfo

      // Get openId via cloud
      wx.cloud.init({ env: config.env })
      wx.cloud.callFunction({
        name: 'login',
        data: { nickName, avatarUrl }
      }).then(res => {
        if (res.result.success) {
          const app = getApp()
          app.globalData.bookId = res.result.bookId
          app.globalData.userInfo = { nickName, avatarUrl }
          app.globalData.openId = res.result.openId || 'demo-openid'

          // Initialize categories if new user
          if (res.result.isNew) {
            wx.cloud.callFunction({
              name: 'init-database',
              data: { bookId: res.result.bookId }
            })
          }

          wx.switchTab({ url: '/pages/index/index' })
        } else {
          wx.showToast({ title: res.result.error || '登录失败', icon: 'none' })
        }
      }).catch(err => {
        console.error('Login failed:', err)
        wx.showToast({ title: '登录失败', icon: 'none' })
      })
    }
  },

  openAgreement() {
    wx.navigateTo({
      url: '/pages/about/about?type=terms'
    })
  },

  openPrivacy() {
    wx.navigateTo({
      url: '/pages/about/about?type=privacy'
    })
  }
})