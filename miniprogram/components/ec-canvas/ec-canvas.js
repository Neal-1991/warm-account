const echarts = require('../../utils/echarts.min.js')

// WxCanvas 包装器：让标准版 ECharts 能在微信小程序 Canvas 2D 中运行
class WxCanvas {
  constructor(ctx, canvasNode) {
    this.ctx = ctx
    this.canvasNode = canvasNode
  }

  getContext(contextType) {
    return contextType === '2d' ? this.ctx : null
  }

  attachEvent() {} // noop — 事件由微信 touch 事件驱动
  detachEvent() {} // noop

  get width() {
    return this.canvasNode ? this.canvasNode.width : 0
  }
  set width(w) {
    if (this.canvasNode) this.canvasNode.width = w
  }
  get height() {
    return this.canvasNode ? this.canvasNode.height : 0
  }
  set height(h) {
    if (this.canvasNode) this.canvasNode.height = h
  }
}

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas'
    },
    ec: {
      type: Object,
      observer: function (newVal) {
        if (newVal && newVal.onInit && !this.data.isLoaded) {
          this.init()
        }
      }
    }
  },

  data: {
    isLoaded: false
  },

  lifetimes: {
    ready() {
      if (this.data.ec && this.data.ec.onInit) {
        this.init()
      }
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
      const query = wx.createSelectorQuery().in(this)
      query.select('#ec-canvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.warn('[ec-canvas] canvas 节点获取失败')
          return
        }

        const canvasNode = res[0].node
        const ctx = canvasNode.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio
        const width = res[0].width
        const height = res[0].height

        canvasNode.width = width * dpr
        canvasNode.height = height * dpr

        // 通过 setCanvasCreator 注册 WxCanvas 包装器
        const wxCanvas = new WxCanvas(ctx, canvasNode)
        echarts.setCanvasCreator(() => wxCanvas)

        // 传入 WxCanvas 实例而非原生 canvas 节点
        this.chart = echarts.init(wxCanvas, null, { width, height })

        if (this.data.ec && this.data.ec.onInit) {
          this.data.ec.onInit(this.chart, width, height)
        }

        this.setData({ isLoaded: true })
      })
    },

    setChart(chart) {
      this.chart = chart
    },

    // 触摸事件 — 将微信触摸事件转发给 ECharts zrender
    touchStart(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0]
        const handler = this.chart.getZr().handler
        handler.dispatch('mousedown', { zrX: touch.x, zrY: touch.y })
        handler.dispatch('mousemove', { zrX: touch.x, zrY: touch.y })
        handler.processGesture(wrapTouch(e), 'start')
      }
    },

    touchMove(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0]
        const handler = this.chart.getZr().handler
        handler.dispatch('mousemove', { zrX: touch.x, zrY: touch.y })
        handler.processGesture(wrapTouch(e), 'change')
      }
    },

    touchEnd(e) {
      if (this.chart) {
        const touch = e.changedTouches ? e.changedTouches[0] : {}
        const handler = this.chart.getZr().handler
        handler.dispatch('mouseup', { zrX: touch.x, zrY: touch.y })
        handler.dispatch('click', { zrX: touch.x, zrY: touch.y })
        handler.processGesture(wrapTouch(e), 'end')
      }
    }
  }
})

function wrapTouch(event) {
  for (let i = 0; i < event.touches.length; ++i) {
    const touch = event.touches[i]
    touch.offsetX = touch.x
    touch.offsetY = touch.y
  }
  return event
}
