const echarts = require('../../utils/echarts')
const dateUtil = require('../../utils/date')

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
        onInit: (canvas, width, height) => {
          const chart = echarts.init(canvas, 'light')
          canvas.setChart(chart)
          this.chart = chart

          chart.setOption({
            series: [{
              type: 'pie',
              radius: ['40%', '70%'],
              data: []
            }]
          })

          return chart
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
        wx.showToast({ title: '数据加载失败', icon: 'none' })
        return
      }

      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '数据加载失败', icon: 'none' })
        return
      }

      const records = (res.result.records || []).filter(r => r.type === 'expense')
      this.renderChart(records)
    }).catch(err => {
      console.error('loadData error:', err)
      wx.showToast({ title: '数据加载失败', icon: 'none' })
    })
  },

  renderChart(records) {
    const categoryMap = {}
    records.forEach(r => {
      if (!categoryMap[r.categoryId]) {
        categoryMap[r.categoryId] = 0
      }
      categoryMap[r.categoryId] += r.amount
    })

    const total = Object.values(categoryMap).reduce((a, b) => a + b, 0)

    if (total === 0) {
      this.setData({ legend: [], chartData: [] })
      if (this.chart) {
        this.chart.setOption({ series: [{ data: [] }] })
      }
      return
    }

    const colors = ['#FF9500', '#FF6B00', '#FFD700', '#90EE90', '#87CEEB', '#DDA0DD', '#F0E68C', '#E6E6FA']

    const categoryNames = {
      'cat-food': '餐饮',
      'cat-transport': '交通',
      'cat-shopping': '购物',
      'cat-medical': '医疗',
      'cat-education': '教育',
      'cat-entertainment': '娱乐',
      'cat-housing': '居住',
      'cat-gift': '人情'
    }

    let idx = 0
    const chartData = Object.entries(categoryMap).map(([catId, amount]) => {
      const name = categoryNames[catId] || catId
      return {
        name,
        value: (amount / 100).toFixed(2),
        itemStyle: { color: colors[idx++ % colors.length] }
      }
    })

    const legendData = chartData.map(d => ({
      name: d.name,
      amount: d.value,
      percent: (parseFloat(d.value) / (total / 100)).toFixed(1),
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
