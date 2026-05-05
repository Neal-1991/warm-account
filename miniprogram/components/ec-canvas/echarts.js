// ECharts for WeChat mini-program
// Uses echarts from npm package

// Import from the npm installed echarts
// In WeChat miniprogram, we use the dist/echarts.js
import * as echarts from '../../../../node_modules/echarts/dist/echarts.js'

// For webpack/bundler environment, you could also try:
// import * as echarts from 'echarts'

export default echarts
export { echarts }