const dateUtil = require('../../utils/date')

Page({
  data: {
    currentMonth: '',
    currentMonthDisplay: '',
    summary: { expense: '0.00', income: '0.00', balance: '0.00' },
    records: []
  },

  onLoad() {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    this.setData({
      currentMonth: month,
      currentMonthDisplay: `${now.getFullYear()}年${now.getMonth() + 1}月`
    })
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  onMonthChange(e) {
    const month = e.detail.month
    const [year, monthNum] = month.split('-').map(Number)
    this.setData({
      currentMonth: month,
      currentMonthDisplay: `${year}年${monthNum}月`
    })
    this.loadData()
  },

  loadData() {
    const app = getApp()
    if (!app.globalData.bookId) {
      return
    }

    wx.cloud.callFunction({
      name: 'record',
      data: {
        action: 'list',
        bookId: app.globalData.bookId,
        data: { month: this.data.currentMonth }
      }
    }).then(res => {
      if (!res.result) {
        console.error('loadData: no result returned')
        wx.showToast({ title: '数据加载失败', icon: 'none' })
        return
      }

      if (res.result.success) {
        const records = res.result.records.map(r => ({
          ...r,
          amountDisplay: (r.amount / 100).toFixed(2),
          dateStr: dateUtil.formatDate(new Date(r.date)),
          icon: '📝',
          categoryName: '餐饮',
          remark: r.remark || ''
        }))

        const summary = records.reduce((acc, r) => {
          if (r.type === 'expense') {
            acc.expense += r.amount
          } else {
            acc.income += r.amount
          }
          return acc
        }, { expense: 0, income: 0 })

        summary.balance = summary.income - summary.expense

        this.setData({
          records,
          summary: {
            expense: (summary.expense / 100).toFixed(2),
            income: (summary.income / 100).toFixed(2),
            balance: (summary.balance / 100).toFixed(2)
          }
        })
      } else {
        console.error('loadData: success false', res.result.error)
        wx.showToast({ title: '数据加载失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('loadData error:', err)
      wx.showToast({ title: '数据加载失败', icon: 'none' })
    })
  },

  goToAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  }
})