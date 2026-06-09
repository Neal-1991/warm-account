// cloudfunctions/init-database/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

// 支出 16 大类，按频率排序
const EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍜', order: 1, children: ['早餐', '午餐', '晚餐', '下午茶', '零食', '宵夜'] },
  { name: '交通', icon: '🚗', order: 2, children: ['公交', '地铁', '出租车', '停车', '油费'] },
  { name: '购物', icon: '🛒', order: 3, children: ['日用品', '电子产品', '化妆品'] },
  { name: '居住', icon: '🏠', order: 4, children: ['房租', '物业', '水电费'] },
  { name: '通讯', icon: '📱', order: 5, children: ['话费', '宽带', '流量'] },
  { name: '育儿', icon: '👶', order: 6, children: ['奶粉', '尿布', '托育', '玩具衣物'] },
  { name: '美容护肤', icon: '💄', order: 7, children: ['护肤品', '化妆品', '理发', '美甲'] },
  { name: '服饰', icon: '👗', order: 8, children: ['衣服', '鞋子', '包包', '配饰'] },
  { name: '娱乐', icon: '🎮', order: 9, children: ['电影', '游戏', '聚会'] },
  { name: '运动健身', icon: '🏋', order: 10, children: ['健身房', '器材', '游泳', '球类'] },
  { name: '旅行', icon: '✈️', order: 11, children: ['机票', '酒店', '景点', '在地消费'] },
  { name: '宠物', icon: '🐱', order: 12, children: ['粮食', '零食', '疫苗驱虫', '用品'] },
  { name: '医疗', icon: '💊', order: 13, children: ['门诊', '药品', '保健品'] },
  { name: '人情', icon: '🎁', order: 14, children: ['礼物', '红包', '请客'] },
  { name: '教育', icon: '📚', order: 15, children: ['学费', '教材', '培训'] },
  { name: '其他', icon: '➕', order: 16, children: ['其他支出'] }
]

// 收入 7 大类，按频率排序
const INCOME_CATEGORIES = [
  { name: '工资', icon: '💰', order: 21, children: ['基本工资', '绩效', '补贴'] },
  { name: '奖金', icon: '🏆', order: 22, children: ['年终奖', '季度奖', '项目奖'] },
  { name: '公积金', icon: '🏦', order: 23, children: ['公积金提取'] },
  { name: '投资', icon: '📈', order: 24, children: ['股票', '基金', '理财', '利息'] },
  { name: '副业兼职', icon: '💼', order: 25, children: ['咨询', '外包'] },
  { name: '红包礼金', icon: '🧧', order: 26, children: ['春节红包', '婚礼礼金', '生日礼金'] },
  { name: '其他', icon: '📦', order: 27, children: ['其他收入'] }
]

exports.main = async (event, context) => {
  const { bookId, action } = event
  const collectionName = (name) => getCollectionName(event, name)

  // action=updateSystemPresets: 更新 bookId=null 系统预设（生产部署前执行）
  if (action === 'updateSystemPresets') {
    return exports.updateSystemPresets(event)
  }

  if (!bookId) {
    return { success: false, error: 'bookId is required for init-database' }
  }

  try {
    const col = collectionName('categories')

    // 检查该账本是否已初始化（已有 bookId=该账本的大类即为已初始化）
    const existingBig = await db.collection(col)
      .where({ bookId, parentId: null })
      .limit(1)
      .get()
    if (existingBig.data.length > 0) {
      return { success: true, message: 'categories already initialized for this book' }
    }

    // 所有分类均属于当前账本，isSystem: true
    const allCats = [
      ...EXPENSE_CATEGORIES.map(c => ({ ...c, type: 'expense' })),
      ...INCOME_CATEGORIES.map(c => ({ ...c, type: 'income' }))
    ]

    // 并行创建所有大类（互不依赖）
    const bigResults = await Promise.all(
      allCats.map(cat =>
        db.collection(col).add({
          data: {
            name: cat.name,
            icon: cat.icon,
            order: cat.order,
            type: cat.type,
            isVisible: true,
            isSystem: true,
            parentId: null,
            bookId
          }
        })
      )
    )

    // 并行创建所有子类
    let childCount = 0
    const childPromises = []
    allCats.forEach((cat, i) => {
      const parentId = bigResults[i]._id
      cat.children.forEach(childName => {
        childPromises.push(
          db.collection(col).add({
            data: {
              name: childName,
              icon: '',
              order: 0,
              type: cat.type,
              isVisible: true,
              isSystem: true,
              parentId,
              bookId
            }
          })
        )
        childCount++
      })
    })
    await Promise.all(childPromises)

    const totalCount = allCats.length + childCount
    return { success: true, categoryCount: totalCount }
  } catch (err) {
    console.error('init-database error:', err)
    return { success: false, error: err.message }
  }
}

// 导出供 login 云函数复用
exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES
exports.INCOME_CATEGORIES = INCOME_CATEGORIES
exports.getCollectionName = getCollectionName

// 可通过 action=updateSystemPresets 单独调用，用于生产部署前更新 bookId=null 预设
exports.updateSystemPresets = async (event) => {
  const collectionName = (name) => getCollectionName(event, name)
  const col = collectionName('categories')

  const allPresets = [
    ...EXPENSE_CATEGORIES.map(c => ({ ...c, type: 'expense' })),
    ...INCOME_CATEGORIES.map(c => ({ ...c, type: 'income' }))
  ]

  let updated = 0, created = 0

  for (const preset of allPresets) {
    const existing = await db.collection(col)
      .where({ bookId: null, parentId: null, name: preset.name, type: preset.type })
      .limit(1)
      .get()

    if (existing.data.length > 0) {
      await db.collection(col).doc(existing.data[0]._id).update({
        data: { icon: preset.icon, order: preset.order }
      })
      updated++

      for (const childName of preset.children) {
        const childExist = await db.collection(col)
          .where({ bookId: null, parentId: existing.data[0]._id, name: childName })
          .limit(1)
          .get()
        if (childExist.data.length === 0) {
          await db.collection(col).add({
            data: {
              name: childName, icon: '', order: 0,
              type: preset.type, isVisible: true, isSystem: true,
              parentId: existing.data[0]._id, bookId: null
            }
          })
        }
      }
    } else {
      const { _id: parentId } = await db.collection(col).add({
        data: {
          name: preset.name, icon: preset.icon, order: preset.order,
          type: preset.type, isVisible: true, isSystem: true,
          parentId: null, bookId: null
        }
      })
      created++
      for (const childName of preset.children) {
        await db.collection(col).add({
          data: {
            name: childName, icon: '', order: 0,
            type: preset.type, isVisible: true, isSystem: true,
            parentId, bookId: null
          }
        })
      }
    }
  }

  return { success: true, updated, created, total: allPresets.length }
}
