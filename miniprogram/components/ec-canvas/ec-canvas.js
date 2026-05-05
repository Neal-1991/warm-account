// 从 ec-canvas 目录导入 echarts
import * as echarts from './echarts/echarts.min.js'

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
      // 页面显示时如果 chart 存在则 resize
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

        // 初始化 echarts
        this.chart = echarts.init(ctx, null, {
          width: res.width,
          height: res.height
        })

        // 触发 init 事件，传递 chart 实例
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