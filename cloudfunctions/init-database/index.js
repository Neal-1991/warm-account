// cloudfunctions/init-database/index.js
const cloud = require('wx-server-sdk')
cloud.init()

const db = cloud.database()

const CATEGORIES = [
  { name: '餐饮', icon: '🍜', order: 1, children: ['早餐', '午餐', '晚餐', '下午茶', '零食', '宵夜'] },
  { name: '交通', icon: '🚗', order: 2, children: ['公交', '地铁', '出租车', '停车', '油费'] },
  { name: '购物', icon: '🛒', order: 3, children: ['日用品', '服装', '电子产品', '化妆品'] },
  { name: '医疗', icon: '💊', order: 4, children: ['门诊', '药品', '保健品'] },
  { name: '教育', icon: '📚', order: 5, children: ['学费', '教材', '培训'] },
  { name: '娱乐', icon: '🎮', order: 6, children: ['电影', '游戏', '旅游', '聚会'] },
  { name: '居住', icon: '🏠', order: 7, children: ['房租', '物业', '水电费'] },
  { name: '人情', icon: '🎁', order: 8, children: ['礼物', '红包', '请客'] }
]

exports.main = async (event, context) => {
  const { bookId } = event

  if (!bookId) {
    return { success: false, error: 'bookId is required for init-database' }
  }

  try {
    // 创建大类
    for (const cat of CATEGORIES) {
      const { id: parentId } = await db.collection('categories').add({
        data: {
          name: cat.name,
          icon: cat.icon,
          order: cat.order,
          isVisible: true,
          parentId: null,
          bookId: null  // 系统预置大类
        }
      })

      // 创建小类
      for (const childName of cat.children) {
        await db.collection('categories').add({
          data: {
            name: childName,
            icon: '',
            order: 0,
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