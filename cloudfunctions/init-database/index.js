// cloudfunctions/init-database/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 获取集合名称（根据环境后缀）
const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

const EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍜', order: 1, children: ['早餐', '午餐', '晚餐', '下午茶', '零食', '宵夜'] },
  { name: '交通', icon: '🚗', order: 2, children: ['公交', '地铁', '出租车', '停车', '油费'] },
  { name: '购物', icon: '🛒', order: 3, children: ['日用品', '服装', '电子产品', '化妆品'] },
  { name: '医疗', icon: '💊', order: 4, children: ['门诊', '药品', '保健品'] },
  { name: '教育', icon: '📚', order: 5, children: ['学费', '教材', '培训'] },
  { name: '娱乐', icon: '🎮', order: 6, children: ['电影', '游戏', '旅游', '聚会'] },
  { name: '居住', icon: '🏠', order: 7, children: ['房租', '物业', '水电费'] },
  { name: '人情', icon: '🎁', order: 8, children: ['礼物', '红包', '请客'] },
  { name: '其他', icon: '➕', order: 9, children: ['其他支出'] }
]

const INCOME_CATEGORIES = [
  { name: '工资', icon: '💰', order: 21, children: ['基本工资', '绩效', '补贴'] },
  { name: '公积金', icon: '🏦', order: 22, children: ['公积金提取'] },
  { name: '投资', icon: '📈', order: 23, children: ['股票', '基金', '理财', '利息'] },
  { name: '副业兼职', icon: '💼', order: 24, children: ['咨询', '外包'] },
  { name: '闲置转卖', icon: '🔄', order: 25, children: ['二手销售', '闲置物品'] },
  { name: '医疗报销', icon: '🏥', order: 26, children: ['医疗报销'] },
  { name: '其他', icon: '📦', order: 27, children: ['其他收入'] }
]

exports.main = async (event, context) => {
  const { bookId, isTest } = event
  const collectionName = (name) => getCollectionName(event, name)

  if (!bookId) {
    return { success: false, error: 'bookId is required for init-database' }
  }

  try {
    const col = collectionName('categories')

    // 检查该账本是否已有小类（已初始化过则跳过）
    const existingChildren = await db.collection(col)
      .where({ bookId })
      .limit(1)
      .get()
    if (existingChildren.data.length > 0) {
      return { success: true, message: 'categories already initialized for this book' }
    }

    // 加载已有的系统大类（bookId: null），避免重复创建
    const existingSystem = await db.collection(col)
      .where({ bookId: null })
      .get()
    const bigMap = new Map()
    for (const cat of existingSystem.data) {
      bigMap.set(cat.name, { _id: cat._id, type: cat.type })
    }

    // 合并支出和收入，统一处理
    const allCats = [
      ...EXPENSE_CATEGORIES.map(c => ({ ...c, type: 'expense' })),
      ...INCOME_CATEGORIES.map(c => ({ ...c, type: 'income' }))
    ]

    for (const cat of allCats) {
      let parentId, catType

      const existing = bigMap.get(cat.name)
      if (existing) {
        parentId = existing._id
        catType = existing.type
      } else {
        const { _id } = await db.collection(col).add({
          data: {
            name: cat.name,
            icon: cat.icon,
            order: cat.order,
            type: cat.type,
            isVisible: true,
            parentId: null,
            bookId: null
          }
        })
        parentId = _id
        catType = cat.type
      }

      for (const childName of cat.children) {
        await db.collection(col).add({
          data: {
            name: childName,
            icon: '',
            order: 0,
            type: catType,
            isVisible: true,
            parentId,
            bookId
          }
        })
      }
    }

    return { success: true }
  } catch (err) {
    console.error('init-database error:', err)
    return { success: false, error: err.message }
  }
}