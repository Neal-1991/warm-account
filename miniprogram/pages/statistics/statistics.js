const dateUtil = require('../../utils/date')
const config = require('../../utils/config')

Page({
  data: {
    currentMonth: '',
    currentMonthDisplay: '',
    ecChart: null,
    legend: [],
    chartData: []
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

  loadData() {
    const app = getApp()
    if (!app.globalData.bookId) {
      // 未登录时展示空状态，不请求数据
      this.setData({ legend: [], chartData: [] })
      if (this.chart) this.chart.setOption({ series: [{ data: [] }] })
      return
    }

    // 先获取分类列表，构建 id -> 父分类名（大类）映射
    wx.cloud.callFunction({
      name: 'category',
      data: { action: 'list', bookId: app.globalData.bookId, isTest: config.isTest }
    }).then(catRes => {
      const categoryParentMap = {}
      if (catRes.result && catRes.result.categories) {
        const cats = catRes.result.categories
        // 先建大类自己的映射
        const bigNames = {}
        cats.forEach(c => {
          if (c.parentId === null) {
            bigNames[c._id] = c.name
          }
        })
        // 所有分类映射到父分类名
        cats.forEach(c => {
          if (c.parentId === null) {
            categoryParentMap[c._id] = c.name
          } else {
            categoryParentMap[c._id] = bigNames[c.parentId] || c.name
          }
        })
      }

      // 再获取记录列表
      return wx.cloud.callFunction({
        name: 'record',
        data: {
          action: 'list',
          bookId: app.globalData.bookId,
          data: { month: this.data.currentMonth },
          isTest: config.isTest
        }
      }).then(res => [categoryParentMap, res])
    }).then(([categoryParentMap, res]) => {
      if (!res.result) {
        wx.showToast({ title: '数据加载失败', icon: 'none' })
        return
      }

      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '数据加载失败', icon: 'none' })
        return
      }

      const records = (res.result.records || []).filter(r => r.type === 'expense')
      this.renderChart(records, categoryParentMap)
    }).catch(err => {
      console.error('loadData error:', err)
      wx.showToast({ title: '数据加载失败', icon: 'none' })
    })
  },

  renderChart(records, categoryParentMap) {
    // 按大类（父分类）聚合金额
    const amountMap = {}
    records.forEach(r => {
      const parentName = categoryParentMap[r.categoryId] || '未分类'
      if (!amountMap[parentName]) {
        amountMap[parentName] = 0
      }
      amountMap[parentName] += r.amount
    })

    const total = Object.values(amountMap).reduce((a, b) => a + b, 0)

    if (total === 0) {
      this.setData({ legend: [], chartData: [] })
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

    const legendData = chartData.map(d => ({
      name: d.name,
      amount: d.value,
      percent: (parseFloat(d.value) / (total / 100) * 100).toFixed(1),
      color: d.itemStyle.color
    }))

    this.setData({
      legend: legendData,
      chartData
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
  }
})
