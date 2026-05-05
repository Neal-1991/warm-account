// ECharts for WeChat mini-program - simplified wrapper
// In production, use: echarts-for-weixin

let echarts = null

export function init(canvas, theme) {
  if (!echarts) {
    // This is a placeholder - in real implementation use echarts-for-weixin
    echarts = {
      init: (canvas, theme) => {
        return {
          setOption: () => {},
          setChart: (chart) => {}
        }
      }
    }
  }
  return echarts.init(canvas, theme)
}

export function getInstance(canvas) {
  return null
}

module.exports = { init, getInstance }