const config = require('../../utils/config')

Page({
  data: {
    loading: false,
    agreed: false
  },

  onLoad() {
    const app = getApp()
    if (app.globalData.openId) {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/index/index' })
      }
    }
  },

  onAgreementChange(e) {
    this.setData({ agreed: e.detail.value.includes('agreed') })
  },

  onLogin(e) {
    // 安全检查：确保用户已勾选协议
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
      return
    }

    if (!e.detail.userInfo) {
      wx.showToast({ title: '需要授权才能登录', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '登录中...' })

    const { nickName, avatarUrl } = e.detail.userInfo

    wx.cloud.init({ env: config.env })

    // 前端只需传递 nickName 和 avatarUrl，openId 由云函数服务端获取
    // 同时传递 isTest 参数以便云函数选择正确的集合后缀
    wx.cloud.callFunction({
      name: 'login',
      data: { nickName, avatarUrl, isTest: config.isTest }
    }).then(res => {
      wx.hideLoading()
      this.setData({ loading: false })

      if (res.result.success) {
        const app = getApp()
        app.setBookId(res.result.bookId)
        app.setOpenId(res.result.openId)

        // 保存用户信息（优先使用云函数返回的持久化资料）
        const userInfo = res.result.userInfo || { nickName, avatarUrl }
        app.setUserInfo(userInfo)

        if (res.result.isNew) {
          wx.cloud.callFunction({
            name: 'init-database',
            data: { bookId: res.result.bookId, isTest: config.isTest }
          }).catch(err => {
            console.error('init-database error:', err)
          })
        }

        // 检查是否有待处理的邀请码（从分享卡片进入）
        const pendingCode = wx.getStorageSync('pendingInviteCode')
        if (pendingCode) {
          wx.removeStorageSync('pendingInviteCode')
          wx.redirectTo({ url: `/pages/family/family?inviteCode=${pendingCode}` })
        } else {
          const pages = getCurrentPages()
          if (pages.length > 1) {
            wx.navigateBack()
          } else {
            wx.switchTab({ url: '/pages/index/index' })
          }
        }
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