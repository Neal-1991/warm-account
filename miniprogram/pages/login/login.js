const config = require('../../utils/config')

Page({
  data: {
    loading: false
  },

  onLoad() {
    const app = getApp()
    if (app.globalData.openId) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  onLogin(e) {
    if (!e.detail.userInfo) {
      wx.showToast({ title: '需要授权才能登录', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '登录中...' })

    const { nickName, avatarUrl } = e.detail.userInfo

    wx.cloud.init({ env: config.env })

    // 前端只需传递 nickName 和 avatarUrl，openId 由云函数服务端获取
    wx.cloud.callFunction({
      name: 'login',
      data: { nickName, avatarUrl }
    }).then(res => {
      wx.hideLoading()
      this.setData({ loading: false })

      if (res.result.success) {
        const app = getApp()
        app.globalData.bookId = res.result.bookId
        app.globalData.userInfo = { nickName, avatarUrl }
        app.globalData.openId = res.result.openId

        if (res.result.isNew) {
          wx.cloud.callFunction({
            name: 'init-database',
            data: { bookId: res.result.bookId }
          }).catch(err => {
            console.error('init-database error:', err)
          })
        }

        wx.switchTab({ url: '/pages/index/index' })
      } else {
        wx.showToast({ title: res.result.error || '登录失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      this.setData({ loading: false })
      console.error('Login failed:', err)
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    })
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