const dateUtil = require('../../utils/date')
const config = require('../../utils/config')
const {
  buildCategoryDisplayMap,
  aggregateByParent
} = require('../../utils/category-display')
const {
  buildBudgetView,
  attachBudgetToLegend
} = require('../../utils/budget')

Page({
  data: {
    currentMonth: '',
    currentMonthDisplay: '',
    ecChart: null,
    legend: [],
    chartData: [],
    budgetView: { configured: false, canEdit: false, isHistorical: false }
  },

  onLoad() {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    this.setData({
      currentMonth: month,
      currentMonthDisplay: `${now.getFullYear()}年${now.getMonth() + 1}月`
    })
    this.initChart()
    this.loadData()
  },

  onShow() {
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
        budgetView: { configured: false, canEdit: false, isHistorical: false }
      })
      if (this.chart) this.chart.setOption({ series: [{ data: [] }] })
      return
    }

    // 先获取分类列表，构建 id -> 父分类名（大类）映射
    wx.cloud.callFunction({
      name: 'category',
      data: { action: 'list', bookId, isTest: config.isTest }
    }).then(catRes => {
      const categoryDisplayMap = buildCategoryDisplayMap(
        catRes.result?.categories || []
      )

      // 再获取记录列表
      return Promise.all([
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
      ]).then(([recordRes, budgetRes]) => [categoryDisplayMap, recordRes, budgetRes])
    }).then(([categoryDisplayMap, res, budgetRes]) => {
      if (!res.result) {
        wx.showToast({ title: '数据加载失败', icon: 'none' })
        return
      }

      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '数据加载失败', icon: 'none' })
        return
      }

      const records = (res.result.records || []).filter(r => r.type === 'expense')
      this.renderChart(records, categoryDisplayMap, budgetRes.result)
    }).catch(err => {
      console.error('loadData error:', err)
      wx.showToast({ title: '数据加载失败', icon: 'none' })
    })
  },

  renderChart(records, categoryDisplayMap, budgetResult) {
    // 按大类（父分类）聚合金额
    const amountMap = aggregateByParent(records, categoryDisplayMap)

    const total = Object.values(amountMap).reduce((a, b) => a + b, 0)

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

    const colors = ['#FF9500', '#FF6B00', '#FFD700', '#90EE90', '#87CEEB', '#DDA0DD', '#F0E68C', '#E6E6FA']

    // 按金额降序排列
    const sorted = Object.entries(amountMap).sort((a, b) => b[1] - a[1])

    const chartData = sorted.map(([name, amount], idx) => ({
      name,
      value: (amount / 100).toFixed(2),
      itemStyle: { color: colors[idx % colors.length] }
    }))

    const legendData = attachBudgetToLegend(chartData.map(d => ({
      name: d.name,
      amount: d.value,
      percent: (parseFloat(d.value) / (total / 100) * 100).toFixed(1),
      color: d.itemStyle.color
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

  async goToBudget() {
    const session = await getApp().ensureSession()
    wx.navigateTo({
      url: session.authenticated
        ? `/pages/budget/budget?month=${this.data.currentMonth}`
        : '/pages/login/login'
    })
  }
})
