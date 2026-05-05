// cloudfunctions/category/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, bookId, name, parentId, categoryId } = event

  try {
    switch (action) {
      case 'list': {
        // 获取分类列表（系统预置 + 当前账本的小类）
        const categories = await db.collection('categories')
          .where(db.command.or(
            { bookId: null },  // 系统预置
            { bookId }         // 当前账本的小类
          ))
          .orderBy('order', 'asc')
          .get()
        return { success: true, categories: categories.data }
      }
      case 'addChild': {
        // 新增小类
        if (!name || !parentId) {
          return { success: false, error: 'name and parentId are required' }
        }
        const { id } = await db.collection('categories').add({
          data: {
            name,
            icon: '',
            order: 0,
            isVisible: true,
            parentId,
            bookId
          }
        })
        return { success: true, categoryId: id }
      }
      case 'hide': {
        await db.collection('categories').doc(categoryId).update({
          data: { isVisible: false }
        })
        return { success: true }
      }
      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('category cloud function error:', err)
    return { success: false, error: err.message }
  }
}