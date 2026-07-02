// cloudfunctions/init-collections/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 需要创建的集合列表
const COLLECTIONS = [
  { name: 'books', description: '账本集合' },
  { name: 'records', description: '账目记录集合' },
  { name: 'categories', description: '分类集合' },
  { name: 'members', description: '成员信息集合' },
  { name: 'budgets', description: '月度预算集合' }
]

// 环境后缀
const SUFFIX_TEST = '_test'
const SUFFIX_PROD = '_prod'

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  try {
    // 由于云开发数据库需要先创建集合才能使用，
    // 这个云函数用于在云开发控制台手动触发创建集合
    // 注意：云函数本身无法创建集合，需要在控制台手动创建

    // 返回需要创建的集合列表，供用户在控制台创建
    const result = {
      success: true,
      message: '请在云开发控制台中创建以下集合',
      collections: COLLECTIONS.map(c => ({
        name: c.name,
        testName: `${c.name}${SUFFIX_TEST}`,
        prodName: `${c.name}${SUFFIX_PROD}`,
        description: c.description
      })),
      instructions: [
        '1. 打开微信开发者工具',
        '2. 点击"云开发控制台"',
        '3. 进入"数据库"',
        '4. 点击"新建集合"',
        '5. 分别创建: books_test, books_prod, records_test, records_prod, categories_test, categories_prod, members_test, members_prod, budgets_test, budgets_prod',
        '6. 为 budgets_test 和 budgets_prod 创建 bookId + month 唯一索引'
      ]
    }

    // 尝试访问集合，如果不存在会报错 - 这是预期的
    // 目的是检测哪些集合已经存在
    const existingCollections = []
    const missingCollections = []
    const actualCollections = COLLECTIONS.flatMap(col => [
      `${col.name}${SUFFIX_TEST}`,
      `${col.name}${SUFFIX_PROD}`
    ])

    for (const collection of actualCollections) {
      try {
        // 尝试查询一条记录来检测集合是否存在
        await db.collection(collection).limit(1).get()
        existingCollections.push(collection)
      } catch (err) {
        if (err.message && err.message.includes('not exist')) {
          missingCollections.push(collection)
        } else {
          // 其他错误可能是权限问题或网络问题
          console.log(`检测集合 ${collection} 时出错:`, err.message)
          missingCollections.push(collection)
        }
      }
    }

    result.existingCollections = existingCollections
    result.missingCollections = missingCollections

    if (missingCollections.length > 0) {
      result.message = `集合 ${missingCollections.join(', ')} 不存在，请先在云开发控制台创建`
    } else {
      result.message = '所有集合已存在'
    }

    return result
  } catch (err) {
    console.error('init-collections error:', err)
    return { success: false, error: err.message }
  }
}
