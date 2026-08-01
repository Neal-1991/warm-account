const dateUtil = require('../../utils/date')
const config = require('../../utils/config')
const {
  buildCategoryDisplayMap,
  resolveCategoryDisplay
} = require('../../utils/category-display')
const { buildBudgetView } = require('../../utils/budget')
const {
  buildRecordGroups,
  summarizeRecords
} = require('../../utils/homepage-records')

const EMPTY_SUMMARY = { expense: '0.00', income: '0.00', balance: '0.00' }
const EMPTY_BUDGET_VIEW = { configured: false, canEdit: false, isHistorical: false, loading: false }

function currentMonthValue(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthDisplay(month) {
  const [year, monthNum] = month.split('-').map(Number)
  return `${year}年${monthNum}月`
}

function budgetLoadingView(month) {
  return {
    configured: false,
    canEdit: false,
    isHistorical: month < currentMonthValue(),
    loading: true,
    month
  }
}

Page({
  data: {
    currentMonth: '',
    currentMonthDisplay: '',
    summary: EMPTY_SUMMARY,
    records: [],
    recordGroups: [],
    budgetView: EMPTY_BUDGET_VIEW,
    themeStyle: '',
    showAddActionSheet: false
  },

  onLoad() {
    const month = currentMonthValue()
    this._loadSeq = 0
    this._skipNextShow = true
    this.setData({
      currentMonth: month,
      currentMonthDisplay: monthDisplay(month),
      budgetView: budgetLoadingView(month),
      themeStyle: getApp().getThemeStyle()
    })
    getApp().applyTheme()
    this.loadData()
  },

  onShow() {
    this.setData({ themeStyle: getApp().getThemeStyle() })
    getApp().applyTheme()
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
    this.loadData()
  },

  onMonthChange(e) {
    const month = e.detail.month
    this.setData({
      currentMonth: month,
      currentMonthDisplay: monthDisplay(month),
      budgetView: budgetLoadingView(month)
    })
    this.loadData()
  },

  getLocalSession(app) {
    if (wx.getStorageSync('manualLogout')) return null
    const openId = app.getOpenId()
    const bookId = app.getBookId()
    if (!openId || !bookId) return null
    return {
      authenticated: true,
      openId,
      bookId,
      userInfo: app.getUserInfo(),
      source: 'local'
    }
  },

  isCurrentLoad(loadSeq, month) {
    return this._loadSeq === loadSeq && this.data.currentMonth === month
  },

  resetHomeData() {
    this.setData({
      records: [],
      recordGroups: [],
      summary: EMPTY_SUMMARY,
      budgetView: EMPTY_BUDGET_VIEW
    })
    const app = getApp()
    app.globalData._currentRecords = []
  },

  validateSessionInBackground(loadSeq, bookId) {
    const app = getApp()
    app.ensureSession().then(session => {
      if (this._loadSeq !== loadSeq) return
      if (session.restoreFailed) {
        console.warn('session restore failed, keep local data')
        return
      }
      if (!session.authenticated || !session.bookId) {
        this._loadSeq += 1
        this.resetHomeData()
        return
      }
      if (session.bookId !== bookId) {
        this.loadData()
      }
    }).catch(err => {
      console.error('home session validation error:', err)
    })
  },

  async loadData() {
    const app = getApp()
    const loadSeq = (this._loadSeq || 0) + 1
    this._loadSeq = loadSeq

    const localSession = this.getLocalSession(app)
    if (localSession) {
      this.validateSessionInBackground(loadSeq, localSession.bookId)
      return this.loadHomeData(localSession, loadSeq)
    }

    const session = await app.ensureSession()
    const month = this.data.currentMonth
    if (!this.isCurrentLoad(loadSeq, month)) return

    const bookId = session.bookId || app.getBookId()
    if (!session.authenticated || !bookId) {
      this.resetHomeData()
      return
    }

    return this.loadHomeData({ ...session, bookId }, loadSeq)
  },

  async loadHomeData(session, loadSeq) {
    const app = getApp()
    const bookId = session.bookId || app.getBookId()
    const month = this.data.currentMonth
    if (!bookId) {
      this.resetHomeData()
      return
    }

    const cachedBudgetView = app.getBudgetViewCache(bookId, month)
    if (cachedBudgetView) {
      this.setData({ budgetView: cachedBudgetView })
    } else if (this.data.budgetView.month !== month || !this.data.budgetView.configured) {
      this.setData({ budgetView: budgetLoadingView(month) })
    }

    const categoryPromise = wx.cloud.callFunction({
      name: 'category',
      data: { action: 'list', bookId, isTest: config.isTest }
    })
    const recordPromise = wx.cloud.callFunction({
      name: 'record',
      data: {
        action: 'list',
        bookId,
        data: { month },
        isTest: config.isTest
      }
    })

    wx.cloud.callFunction({
      name: 'budget',
      data: {
        action: 'getMonth',
        bookId,
        month,
        isTest: config.isTest
      }
    }).then(budgetRes => {
      if (!this.isCurrentLoad(loadSeq, month)) return
      const budgetView = {
        ...buildBudgetView(budgetRes.result, month),
        month,
        loading: false,
        error: false
      }
      app.setBudgetViewCache(bookId, month, budgetView)
      this.setData({
        budgetView
      })
    }).catch(error => {
      if (!this.isCurrentLoad(loadSeq, month)) return
      console.error('home budget load error:', error)
      const currentView = this.data.budgetView || budgetLoadingView(month)
      this.setData({
        budgetView: {
          ...currentView,
          loading: false,
          error: true,
          month
        }
      })
    })

    try {
      const [catRes, recordRes] = await Promise.all([categoryPromise, recordPromise])
      if (!this.isCurrentLoad(loadSeq, month)) return

      if (!recordRes.result) {
        console.error('loadData: no result returned')
        return
      }

      if (!recordRes.result.success) {
        console.error('loadData: success false', recordRes.result.error)
        return
      }

      const catInfoMap = buildCategoryDisplayMap(catRes.result?.categories || [])
      const records = (recordRes.result.records || []).map(record => {
        const catInfo = resolveCategoryDisplay(catInfoMap, record.categoryId)
        if (!catInfo.valid) {
          console.warn('record category reference is invalid', {
            recordId: record._id,
            categoryId: record.categoryId,
            reason: catInfo.reason
          })
        }
        return {
          ...record,
          amountDisplay: (record.amount / 100).toFixed(2),
          dateStr: dateUtil.formatDate(new Date(record.date)),
          icon: catInfo.icon,
          iconInfo: catInfo.iconInfo,
          categoryName: catInfo.name,
          remark: record.remark || '',
          hasImages: (record.images || []).length > 0
        }
      })

      this.setData({
        records,
        recordGroups: buildRecordGroups(records),
        summary: summarizeRecords(records)
      })

      app.globalData._currentRecords = records
    } catch (err) {
      if (!this.isCurrentLoad(loadSeq, month)) return
      console.error('loadData error:', err)
      if (err.errCode !== -1 && err.errCode !== undefined) {
        wx.showToast({ title: '网络异常,请稍后重试', icon: 'none' })
      }
    }
  },

  async goToAdd() {
    const session = await getApp().ensureSession()
    if (!session.authenticated) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    this.setData({ showAddActionSheet: true })
  },

  closeAddActionSheet() {
    this.setData({ showAddActionSheet: false })
  },

  goToManualAdd() {
    this.setData({ showAddActionSheet: false })
    wx.navigateTo({ url: '/pages/add/add' })
  },

  async goToVoiceAdd() {
    this.setData({ showAddActionSheet: false })
    const session = await getApp().ensureSession()
    if (!session.authenticated) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: '/pages/voice-entry/voice-entry' })
  },

  async goToBudget() {
    const session = await getApp().ensureSession()
    wx.navigateTo({
      url: session.authenticated
        ? `/pages/budget/budget?month=${this.data.currentMonth}`
        : '/pages/login/login'
    })
  },

  onRecordTap(e) {
    const recordId = e.currentTarget.dataset.recordId
    wx.navigateTo({ url: `/pages/detail/detail?recordId=${recordId}` })
  }
})
