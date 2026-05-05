// ECharts for WeChat mini-program
//
// IMPORTANT: This is a stub implementation. For production use,
// please download the full echarts-for-weixin package from:
// https://github.com/ecomfe/echarts-for-weixin
//
// Copy the 'ec-canvas' folder and 'echarts' folder from the downloaded package
// to your miniprogram/components/ directory

const echarts = {
  init(canvas, theme, options) {
    console.warn('[暖账] ECharts 暂时无法使用。请下载 echarts-for-weixin:')
    console.warn('https://github.com/ecomfe/echarts-for-weixin')
    return {
      setOption: () => {},
      resize: () => {},
      dispose: () => {}
    }
  }
}

module.exports = echarts