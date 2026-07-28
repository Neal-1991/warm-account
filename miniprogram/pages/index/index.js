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
    themeStyle: ''
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
    this.checkRemovedNotice()
    this.checkTransferredNotice()
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
    this.loadData()
  },

  checkRemovedNotice() {
    const removedBookName = wx.getStorageSync('removedBookName')
    if (!removedBookName) return
    wx.removeStorageSync('removedBookName')
    const app = getApp()
    wx.showModal({
      title: '你已被移出家庭账本',
      content: `你已被移出「${removedBookName}」，历史记录保留在该账本中。将为你创建新的个人账本。`,
      showCancel: false,
      confirmText: '知道了',
      success: () => {
        wx.cloud.callFunction({
          name: 'login',
          data: { isTest: config.isTest }
        }).then(res => {
          if (res.result && res.result.success && res.result.bookId) {
            app.setBookId(res.result.bookId)
            app._sessionResult = null
            this.loadData()
          }
        }).catch(err => {
          console.error('create new book after removal failed:', err)
        })
      }
    })
  },

  checkTransferredNotice() {
    const transferNotice = wx.getStorageSync('transferNotice')
    if (!transferNotice) return
    wx.removeStorageSync('transferNotice')
    const app = getApp()
    const bookId = app.getBookId()
    wx.showModal({
      title: '账本所有权已转给你',
      content: `「${transferNotice.fromNickName || '原管理员'}」已将家庭账本的所有权转给你，你现在是管理员。`,
      showCancel: false,
      confirmText: '知道了',
      success: () => {
        if (!bookId) return
        wx.cloud.callFunction({
          name: 'book',
          data: {
            action: 'acknowledgeTransfer',
            bookId,
            isTest: config.isTest
          }
        }).catch(err => {
          console.error('acknowledgeTransfer failed:', err)
        })
      }
    })
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
    wx.navigateTo({
      url: session.authenticated ? '/pages/add/add' : '/pages/login/login'
    })
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
