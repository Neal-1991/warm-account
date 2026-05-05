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
    this.setData({
      userInfo: app.globalData.userInfo || {}
    })
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
          const app = getApp()
          app.globalData.openId = null
          app.globalData.bookId = null
          app.globalData.userInfo = null
          wx.clearStorageSync()
          wx.redirectTo({ url: '/pages/login/login' })
        }
      }
    })
  }
})