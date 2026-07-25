const dateUtil = require('../../utils/date')
const config = require('../../utils/config')
const {
  buildCategoryDisplayMap,
  aggregateByParentDetails
} = require('../../utils/category-display')
const {
  buildBudgetView,
  attachBudgetToLegend
} = require('../../utils/budget')
const { CHART_COLORS } = require('../../utils/theme')

Page({
  data: {
    currentMonth: '',
    currentMonthDisplay: '',
    ecChart: null,
    legend: [],
    chartData: [],
    budgetView: { configured: false, canEdit: false, isHistorical: false },
    themeStyle: '',
    expenseRecords: [],
    categoryDisplayMap: {},
    currentBookId: '',
    activeBigName: '',
    activeBigRecords: [],
    activeBigAmount: '0.00',
    activeBigCount: 0,
    activeBigIconInfo: null,
    activeBigIcon: '',
    showDetailDrawer: false
  },

  onLoad() {
    const app = getApp()
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    this.setData({
      currentMonth: month,
      currentMonthDisplay: `${now.getFullYear()}年${now.getMonth() + 1}月`,
      themeStyle: app.getThemeStyle()
    })
    app.applyTheme()
    this.initChart()
    this.loadData()
  },

  onShow() {
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
    this.loadData()
  },

  onUnload() {
    if (this.chart) {
      this.chart.dispose()
      this.chart = null
    }
  },

  initChart() {
    this.setData({
      ecChart: {
        onInit: (chart, width, height) => {
          this.chart = chart
          chart.setOption({
            series: [{
              type: 'pie',
              radius: ['40%', '70%'],
              data: []
            }]
          })
        }
      }
    })
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

  async loadData() {
    const app = getApp()
    const session = await app.ensureSession()
    const bookId = session.bookId || app.getBookId()
    if (!session.authenticated || !bookId) {
      this.setData({
        legend: [],
        chartData: [],
        budgetView: { configured: false, canEdit: false, isHistorical: false },
        expenseRecords: [],
        categoryDisplayMap: {},
        currentBookId: ''
      })
      if (this.chart) this.chart.setOption({ series: [{ data: [] }] })
      return
    }

    Promise.all([
      wx.cloud.callFunction({
        name: 'category',
        data: { action: 'list', bookId, isTest: config.isTest }
      }),
      wx.cloud.callFunction({
        name: 'record',
        data: {
          action: 'list',
          bookId,
          data: { month: this.data.currentMonth },
          isTest: config.isTest
        }
      }),
      wx.cloud.callFunction({
        name: 'budget',
        data: {
          action: 'getMonth',
          bookId,
          month: this.data.currentMonth,
          isTest: config.isTest
        }
      }).catch(error => {
        console.error('statistics budget load error:', error)
        return { result: null }
      })
    ]).then(([catRes, recordRes, budgetRes]) => {
      if (!catRes.result?.success) {
        wx.showToast({ title: catRes.result?.error || '分类加载失败', icon: 'none' })
        return
      }
      if (!recordRes.result?.success) {
        wx.showToast({ title: recordRes.result?.error || '数据加载失败', icon: 'none' })
        return
      }
      const categoryDisplayMap = buildCategoryDisplayMap(catRes.result.categories || [])
      const records = (recordRes.result.records || []).filter(r => r.type === 'expense')
      this.setData({
        expenseRecords: records,
        categoryDisplayMap: categoryDisplayMap,
        currentBookId: bookId
      })
      this.renderChart(records, categoryDisplayMap, budgetRes.result)
    }).catch(err => {
      console.error('loadData error:', err)
      wx.showToast({ title: '数据加载失败', icon: 'none' })
      this.setData({ expenseRecords: [], categoryDisplayMap: {}, currentBookId: '' })
    })
  },

  renderChart(records, categoryDisplayMap, budgetResult) {
    // 按大类（父分类）聚合金额
    const categoryGroups = aggregateByParentDetails(records, categoryDisplayMap)

    const total = categoryGroups.reduce((sum, item) => sum + item.amount, 0)

    if (total === 0) {
      this.setData({
        legend: [],
        chartData: [],
        budgetView: buildBudgetView(budgetResult, this.data.currentMonth)
      })
      if (this.chart) {
        this.chart.setOption({ series: [{ data: [] }] })
      }
      return
    }

    // 按金额降序排列
    const sorted = categoryGroups.sort((a, b) => b.amount - a.amount)

    const chartData = sorted.map((item, idx) => ({
      name: item.name,
      value: (item.amount / 100).toFixed(2),
      icon: item.icon,
      iconInfo: item.iconInfo,
      itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] }
    }))

    const legendData = attachBudgetToLegend(chartData.map(d => ({
      name: d.name,
      amount: d.value,
      percent: (parseFloat(d.value) / (total / 100) * 100).toFixed(1),
      color: d.itemStyle.color,
      icon: d.icon,
      iconInfo: d.iconInfo
    })), budgetResult)

    this.setData({
      legend: legendData,
      chartData,
      budgetView: buildBudgetView(budgetResult, this.data.currentMonth)
    })

    if (this.chart) {
      this.chart.setOption({
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: chartData
        }]
      })
    }
  },

  onLegendTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const { expenseRecords, categoryDisplayMap } = this.data
    const filtered = expenseRecords.filter(record => {
      const display = categoryDisplayMap[record.categoryId]
      return display && display.parentName === name
    })
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date))
    const formatted = filtered.map(record => {
      const display = categoryDisplayMap[record.categoryId]
      const date = new Date(record.date)
      return {
        _id: record._id,
        categoryName: display ? display.name : '',
        icon: display ? display.icon : '',
        iconInfo: display ? display.iconInfo : null,
        remark: record.remark || '',
        amount: (record.amount / 100).toFixed(2),
        type: record.type,
        dateStr: Number.isNaN(date.getTime()) ? '' : dateUtil.formatDateDisplay(date),
        createdByName: record.createdByName || '',
        hasImages: (record.images || []).length > 0
      }
    })
    const totalCents = filtered.reduce((sum, r) => sum + r.amount, 0)
    const firstDisplay = filtered[0] ? categoryDisplayMap[filtered[0].categoryId] : null
    this.setData({
      activeBigName: name,
      activeBigRecords: formatted,
      activeBigAmount: (totalCents / 100).toFixed(2),
      activeBigCount: formatted.length,
      activeBigIconInfo: firstDisplay ? firstDisplay.iconInfo : null,
      activeBigIcon: firstDisplay ? firstDisplay.icon : '',
      showDetailDrawer: true
    })
  },

  closeDetailDrawer() {
    this.setData({ showDetailDrawer: false })
  },

  onRecordTap(e) {
    const recordId = e.currentTarget.dataset.recordId
    const bookId = this.data.currentBookId
    if (!recordId || !bookId) return
    wx.navigateTo({ url: `/pages/detail/detail?recordId=${recordId}&bookId=${bookId}` })
  },

  async goToBudget() {
    const session = await getApp().ensureSession()
    wx.navigateTo({
      url: session.authenticated
        ? `/pages/budget/budget?month=${this.data.currentMonth}`
        : '/pages/login/login'
    })
  }
})
