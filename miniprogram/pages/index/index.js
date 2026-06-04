const dateUtil = require('../../utils/date')
const config = require('../../utils/config')

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
      // 未登录时展示空状态，不请求数据
      this.setData({ records: [], summary: { expense: '0.00', income: '0.00', balance: '0.00' } })
      return
    }

    // 先获取分类，构建 categoryId -> {parentName, icon} 映射
    wx.cloud.callFunction({
      name: 'category',
      data: { action: 'list', bookId: app.globalData.bookId, isTest: config.isTest }
    }).then(catRes => {
      const catInfoMap = {}
      if (catRes.result && catRes.result.categories) {
        const cats = catRes.result.categories
        const bigNames = {}
        cats.forEach(c => {
          if (c.parentId === null) {
            bigNames[c._id] = { name: c.name, icon: c.icon }
          }
        })
        cats.forEach(c => {
          if (c.parentId === null) {
            catInfoMap[c._id] = { name: c.name, icon: c.icon }
          } else {
            const parent = bigNames[c.parentId]
            catInfoMap[c._id] = parent ? { name: parent.name, icon: parent.icon } : { name: c.name, icon: c.icon }
          }
        })
      }

      return wx.cloud.callFunction({
        name: 'record',
        data: {
          action: 'list',
          bookId: app.globalData.bookId,
          data: { month: this.data.currentMonth },
          isTest: config.isTest
        }
      }).then(res => [catInfoMap, res])
    }).then(([catInfoMap, res]) => {
      if (!res.result) {
        console.error('loadData: no result returned')
        wx.showToast({ title: '数据加载失败', icon: 'none' })
        return
      }

      if (res.result.success) {
        const defaultIcon = '📝'
        const records = res.result.records.map(r => {
          const catInfo = catInfoMap[r.categoryId]
          return {
            ...r,
            amountDisplay: (r.amount / 100).toFixed(2),
            dateStr: dateUtil.formatDate(new Date(r.date)),
            icon: catInfo ? catInfo.icon : defaultIcon,
            categoryName: catInfo ? catInfo.name : '未分类',
            remark: r.remark || '',
            hasImages: (r.images || []).length > 0
          }
        })

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

        // 存储到 globalData，供详情页使用
        const app = getApp()
        app.globalData._currentRecords = records
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
    if (!getApp().globalData.bookId) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: '/pages/add/add' })
  },

  onRecordTap(e) {
    const recordId = e.currentTarget.dataset.recordId
    wx.navigateTo({ url: `/pages/detail/detail?recordId=${recordId}` })
  }
})