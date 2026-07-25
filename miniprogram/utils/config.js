// 环境配置
// TODO: 修改 isTest 为 false 切换到生产环境
const isTest = true  // true = 测试环境，false = 生产环境

const envConfig = require('./env')

module.exports = {
  env: envConfig.env,  // 从 env.js 读取（不纳入版本控制）

  // 集合后缀：测试环境加 _test，生产环境加 _prod
  suffix: isTest ? '_test' : '_prod',

  // 集合名称映射（实际集合名 = 名称 + 后缀）
  getCollection(name) {
    return name + this.suffix
  },

  // 便捷方法获取所有集合
  collections: {
    books: isTest ? 'books_test' : 'books_prod',
    records: isTest ? 'records_test' : 'records_prod',
    categories: isTest ? 'categories_test' : 'categories_prod',
    members: isTest ? 'members_test' : 'members_prod',
    budgets: isTest ? 'budgets_test' : 'budgets_prod'
  },

  // 当前环境标识
  isTest
}
