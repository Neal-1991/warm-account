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

    console.log(`[暖账] 当前环境: ${config.isTest ? '测试' : '生产'} (suffix: ${config.suffix})`)
  }
})