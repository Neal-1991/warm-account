Page({
  data: {
    userInfo: {}
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  loadUserInfo() {
    const app = getApp()
    if (app && app.globalData) {
      this.setData({
        userInfo: app.globalData.userInfo || {}
      })
    } else {
      this.setData({ userInfo: {} })
    }
  },

  goToFamily() {
    wx.navigateTo({ url: '/pages/family/family' })
  },

  goToAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: res => {
        if (res.confirm) {
          try {
            wx.clearStorageSync()
          } catch (e) {
            console.error('clearStorageSync failed:', e)
          }

          const app = getApp()
          if (app && app.globalData) {
            app.globalData.openId = null
            app.globalData.bookId = null
            app.globalData.userInfo = null
          }

          wx.redirectTo({ url: '/pages/login/login' })
        }
      }
    })
  }
})