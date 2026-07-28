const config = require('../../utils/config')

Page({
  data: {
    loading: false,
    agreed: false,
    themeStyle: '',
    themeAccent: '#6F8F4E'
  },

  onLoad() {
    const app = getApp()
    const currentTheme = app.getThemeList().find(item => item.id === app.getThemeId())
    this.setData({
      themeStyle: app.getThemeStyle(),
      themeAccent: currentTheme?.accent || '#6F8F4E'
    })
    app.applyTheme()
    app.ensureSession().then(session => {
      if (!session.authenticated) return
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/index/index' })
      }
    })
  },

  onAgreementChange(e) {
    this.setData({ agreed: e.detail.value.includes('agreed') })
  },

  onLogin() {
    // 安全检查：确保用户已勾选协议
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '登录中...' })

    wx.cloud.init({ env: config.env })

    // openId 由云函数服务端获取；昵称头像在“我的”页编辑后持久化。
    wx.cloud.callFunction({
      name: 'login',
      data: { isTest: config.isTest }
    }).then(res => {
      wx.hideLoading()
      this.setData({ loading: false })

      if (res.result.success) {
        const app = getApp()
        const userInfo = res.result.userInfo || { nickName: '微信用户', avatarUrl: '' }
        app.setSession({
          bookId: res.result.bookId,
          openId: res.result.openId,
          userInfo
        })

        // 分类初始化已由 login 云函数内部处理（新账本自动创建，已有账本自动迁移）

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
