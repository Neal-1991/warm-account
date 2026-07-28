const config = require('./utils/config')
const { setupUpdateManager } = require('./utils/update-manager')
const theme = require('./utils/theme')

App({
  globalData: {
    openId: null,
    bookId: null,
    userInfo: null,
    themeId: theme.DEFAULT_THEME_ID,
    _budgetViewCache: {}
  },

  onLaunch() {
    wx.cloud.init({
      env: config.env,
      traceUser: true
    })

    setupUpdateManager(wx)
    this.restoreLocalSession()
    this.applyTheme()
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
    this.globalData.themeId = theme.getLocalThemeId(this.globalData.openId)
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
      userInfo: this.getUserInfo(),
      themeId: this.getThemeId()
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
        userInfo: result.userInfo || localSession.userInfo,
        themeId: result.userInfo?.preferences?.themeId || localSession.themeId
      })
      this._sessionResult = {
        authenticated: true,
        openId: this.globalData.openId,
        bookId: this.globalData.bookId,
        userInfo: this.globalData.userInfo,
        themeId: this.globalData.themeId
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

  setSession({ openId, bookId, userInfo, themeId }) {
    wx.removeStorageSync('manualLogout')
    this.setOpenId(openId)
    this.setBookId(bookId)
    this.setUserInfo(userInfo || null)
    this.setThemeId(themeId || userInfo?.preferences?.themeId || theme.getLocalThemeId(openId), { sync: false })
    this._sessionResult = {
      authenticated: Boolean(openId && bookId),
      openId: openId || null,
      bookId: bookId || null,
      userInfo: this.globalData.userInfo || null,
      themeId: this.globalData.themeId
    }
  },

  clearSession() {
    this.globalData.openId = null
    this.globalData.bookId = null
    this.globalData.userInfo = null
    this.globalData.themeId = theme.getLocalThemeId(null)
    this.globalData._budgetViewCache = {}
    wx.removeStorageSync('openId')
    wx.removeStorageSync('bookId')
    wx.removeStorageSync('userInfo')
    this.applyTheme()
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
    const nextUserInfo = userInfo ? { ...userInfo } : null
    if (nextUserInfo) {
      nextUserInfo.preferences = {
        ...(nextUserInfo.preferences || {}),
        themeId: this.globalData.themeId || theme.DEFAULT_THEME_ID
      }
    }
    this.globalData.userInfo = nextUserInfo
    if (nextUserInfo) {
      wx.setStorageSync('userInfo', nextUserInfo)
    } else {
      wx.removeStorageSync('userInfo')
    }
    if (this._sessionResult) {
      this._sessionResult.userInfo = nextUserInfo || null
    }
  },

  getThemeId() {
    if (!this.globalData.themeId) {
      this.globalData.themeId = theme.getLocalThemeId(this.getOpenId())
    }
    return this.globalData.themeId
  },

  getThemeStyle() {
    return theme.themeStyle(this.getThemeId())
  },

  getThemeList() {
    return theme.THEMES
  },

  applyTheme(themeId = this.getThemeId()) {
    const normalizedThemeId = theme.normalizeThemeId(themeId)
    theme.applyTheme(normalizedThemeId)
  },

  setThemeId(themeId, options = {}) {
    const normalizedThemeId = theme.setLocalThemeId(this.getOpenId(), themeId)
    this.globalData.themeId = normalizedThemeId
    if (this.globalData.userInfo) {
      this.globalData.userInfo = {
        ...this.globalData.userInfo,
        preferences: {
          ...(this.globalData.userInfo.preferences || {}),
          themeId: normalizedThemeId
        }
      }
      wx.setStorageSync('userInfo', this.globalData.userInfo)
    }
    if (this._sessionResult) {
      this._sessionResult.themeId = normalizedThemeId
      this._sessionResult.userInfo = this.globalData.userInfo
    }
    this.applyTheme(normalizedThemeId)
    if (options.sync) {
      this.syncThemePreference(normalizedThemeId)
    }
    return normalizedThemeId
  },

  syncThemePreference(themeId = this.getThemeId()) {
    if (!this.getOpenId()) return Promise.resolve()
    return wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'updatePreferences',
        preferences: { themeId },
        isTest: config.isTest
      }
    }).catch(err => {
      console.error('sync theme preference failed:', err)
    })
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

  budgetCacheKey(bookId, month) {
    return `${config.isTest ? 'test' : 'prod'}:${bookId || ''}:${month || ''}`
  },

  getBudgetViewCache(bookId, month) {
    return this.globalData._budgetViewCache?.[this.budgetCacheKey(bookId, month)] || null
  },

  setBudgetViewCache(bookId, month, view) {
    if (!bookId || !month || !view) return
    this.globalData._budgetViewCache = {
      ...(this.globalData._budgetViewCache || {}),
      [this.budgetCacheKey(bookId, month)]: view
    }
  },

  invalidateBudgetCache(bookId, month) {
    if (!this.globalData._budgetViewCache) return
    if (!bookId) {
      this.globalData._budgetViewCache = {}
      return
    }
    if (month) {
      const cache = { ...this.globalData._budgetViewCache }
      delete cache[this.budgetCacheKey(bookId, month)]
      this.globalData._budgetViewCache = cache
      return
    }
    const prefix = `${config.isTest ? 'test' : 'prod'}:${bookId}:`
    const nextCache = {}
    Object.keys(this.globalData._budgetViewCache).forEach(key => {
      if (!key.startsWith(prefix)) {
        nextCache[key] = this.globalData._budgetViewCache[key]
      }
    })
    this.globalData._budgetViewCache = nextCache
  },

  logout() {
    this.clearSession()
    wx.setStorageSync('manualLogout', true)
  }
})
