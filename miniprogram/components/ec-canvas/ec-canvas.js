const echarts = require('../../utils/echarts.min.js')

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas'
    },
    ec: {
      type: Object
    }
  },

  data: {
    isLoaded: false
  },

  lifetimes: {
    ready() {
      if (!this.data.ec) {
        console.warn('请传入 ec 数据')
        return
      }
      this.init()
    }
  },

  pageLifetimes: {
    show() {
      if (this.chart) {
        this.chart.resize()
      }
    }
  },

  methods: {
    init() {
      const canvasId = this.data.canvasId
      const ctx = wx.createCanvasContext(canvasId, this)

      const query = wx.createSelectorQuery().in(this)
      query.select(`#${canvasId}`).boundingClientRect((res) => {
        if (!res) {
          console.warn('canvas 节点获取失败')
          return
        }

        this.chart = echarts.init(ctx, null, {
          width: res.width,
          height: res.height
        })

        if (this.data.ec.onInit) {
          this.data.ec.onInit(this.chart, res.width, res.height)
        }

        this.setData({ isLoaded: true })
      }).exec()
    },

    setChart(chart) {
      this.chart = chart
    }
  }
})