const config = require('./utils/config')
const { setupUpdateManager } = require('./utils/update-manager')

App({
  globalData: {
    openId: null,
    bookId: null,
    userInfo: null
  },

  onLaunch() {
    wx.cloud.init({
      env: config.env,
      traceUser: true
    })

    setupUpdateManager(wx)
    this.restoreLocalSession()
    this.sessionReady = this.ensureSession()

    console.log(`[暖账] 当前环境: ${config.isTest ? '测试' : '生产'} (suffix: ${config.suffix})`)
  },

  restoreLocalSession() {
    if (wx.getStorageSync('manualLogout')) {
      this.clearSession()
      return
    }
    this.globalData.openId = wx.getStorageSync('openId') || null
    this.globalData.bookId = wx.getStorageSync('bookId') || null
    this.globalData.userInfo = wx.getStorageSync('userInfo') || null
  },

  ensureSession(options = {}) {
    const force = options.force === true
    if (wx.getStorageSync('manualLogout')) {
      return Promise.resolve({ authenticated: false, manualLogout: true })
    }
    if (this._sessionResult && !force) {
      return Promise.resolve(this._sessionResult)
    }
    if (this._sessionPromise && !force) {
      return this._sessionPromise
    }

    const localSession = {
      authenticated: Boolean(this.getOpenId() && this.getBookId()),
      openId: this.getOpenId(),
      bookId: this.getBookId(),
      userInfo: this.getUserInfo()
    }

    const request = wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'restoreSession',
        isTest: config.isTest
      }
    }).then(res => {
      const result = res.result
      if (!result || !result.success) {
        throw new Error(result?.error || 'session restore failed')
      }
      if (wx.getStorageSync('manualLogout')) {
        this.clearSession()
        return { authenticated: false, manualLogout: true }
      }
      if (!result.authenticated) {
        this.clearSession()
        this._sessionResult = { authenticated: false }
        return this._sessionResult
      }

      this.setSession({
        openId: result.openId,
        bookId: result.bookId,
        userInfo: result.userInfo || localSession.userInfo
      })
      this._sessionResult = {
        authenticated: true,
        openId: this.globalData.openId,
        bookId: this.globalData.bookId,
        userInfo: this.globalData.userInfo
      }
      return this._sessionResult
    }).catch(err => {
      console.error('ensureSession failed:', err)
      if (!localSession.authenticated) {
        this.clearSession()
      }
      this._sessionResult = localSession.authenticated
        ? localSession
        : { authenticated: false, restoreFailed: true }
      return this._sessionResult
    }).finally(() => {
      if (this._sessionPromise === request) {
        this._sessionPromise = null
      }
    })

    this._sessionPromise = request
    return request
  },

  setSession({ openId, bookId, userInfo }) {
    wx.removeStorageSync('manualLogout')
    this.setOpenId(openId)
    this.setBookId(bookId)
    this.setUserInfo(userInfo || null)
    this._sessionResult = {
      authenticated: Boolean(openId && bookId),
      openId: openId || null,
      bookId: bookId || null,
      userInfo: userInfo || null
    }
  },

  clearSession() {
    this.globalData.openId = null
    this.globalData.bookId = null
    this.globalData.userInfo = null
    wx.removeStorageSync('openId')
    wx.removeStorageSync('bookId')
    wx.removeStorageSync('userInfo')
    this._sessionResult = null
  },

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
    if (userInfo) {
      wx.setStorageSync('userInfo', userInfo)
    } else {
      wx.removeStorageSync('userInfo')
    }
    if (this._sessionResult) {
      this._sessionResult.userInfo = userInfo || null
    }
  },

  getOpenId() {
    if (!this.globalData.openId) {
      const openId = wx.getStorageSync('openId')
      if (openId) {
        this.globalData.openId = openId
      }
    }
    return this.globalData.openId
  },

  setOpenId(openId) {
    this.globalData.openId = openId
    if (openId) {
      wx.setStorageSync('openId', openId)
    } else {
      wx.removeStorageSync('openId')
    }
    if (this._sessionResult) {
      this._sessionResult.openId = openId || null
      this._sessionResult.authenticated = Boolean(openId && this._sessionResult.bookId)
    }
  },

  getBookId() {
    if (!this.globalData.bookId) {
      const bookId = wx.getStorageSync('bookId')
      if (bookId) {
        this.globalData.bookId = bookId
      }
    }
    return this.globalData.bookId
  },

  setBookId(bookId) {
    this.globalData.bookId = bookId
    if (bookId) {
      wx.setStorageSync('bookId', bookId)
    } else {
      wx.removeStorageSync('bookId')
    }
    if (this._sessionResult) {
      this._sessionResult.bookId = bookId || null
      this._sessionResult.authenticated = Boolean(bookId && this._sessionResult.openId)
    }
  },

  logout() {
    this.clearSession()
    wx.setStorageSync('manualLogout', true)
  }
})
