const config = require('./utils/config')

App({
  globalData: {
    openId: null,
    bookId: null,
    userInfo: null
  },

  onLaunch() {
    // 初始化云开发
    wx.cloud.init({
      env: config.env,
      traceUser: true
    })

    // 冷启动时从 Storage 恢复登录状态到 globalData
    // 小程序被微信回收后重新打开时 globalData 会清空，但 Storage 仍保留
    this.globalData.openId = wx.getStorageSync('openId') || null
    this.globalData.bookId = wx.getStorageSync('bookId') || null
    this.globalData.userInfo = wx.getStorageSync('userInfo') || null

    console.log(`[暖账] 当前环境: ${config.isTest ? '测试' : '生产'} (suffix: ${config.suffix})`)
  },

  // 获取用户信息（优先从全局数据获取，若无则从 Storage 读取）
  getUserInfo() {
    if (!this.globalData.userInfo) {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        this.globalData.userInfo = userInfo
      }
    }
    return this.globalData.userInfo
  },

  // 保存用户信息（同时保存到全局数据和 Storage）
  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
  },

  // 获取 openId
  getOpenId() {
    if (!this.globalData.openId) {
      const openId = wx.getStorageSync('openId')
      if (openId) {
        this.globalData.openId = openId
      }
    }
    return this.globalData.openId
  },

  // 设置 openId
  setOpenId(openId) {
    this.globalData.openId = openId
    wx.setStorageSync('openId', openId)
  },

  // 获取 bookId
  getBookId() {
    if (!this.globalData.bookId) {
      const bookId = wx.getStorageSync('bookId')
      if (bookId) {
        this.globalData.bookId = bookId
      }
    }
    return this.globalData.bookId
  },

  // 设置 bookId
  setBookId(bookId) {
    this.globalData.bookId = bookId
    wx.setStorageSync('bookId', bookId)
  },

  // 退出登录（不清除 userInfo，保留用户的昵称和头像）
  logout() {
    this.globalData.openId = null
    this.globalData.bookId = null
    this.globalData.userInfo = null
    wx.removeStorageSync('openId')
    wx.removeStorageSync('bookId')
    wx.removeStorageSync('userInfo')
  }
})