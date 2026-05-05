// 环境配置
// TODO: 修改 isTest 为 false 切换到生产环境
const isTest = true  // true = 测试环境，false = 生产环境

module.exports = {
  env: 'cloud1-2gaj8t3s919e662e',  // 云开发环境ID（只有一个）

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
    members: isTest ? 'members_test' : 'members_prod'
  },

  // 当前环境标识
  isTest
}