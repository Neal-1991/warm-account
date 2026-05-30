// cloudfunctions/category/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 获取集合名称（根据环境后缀）
const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

exports.main = async (event, context) => {
  const { action, bookId, name, parentId, categoryId, type } = event
  const collectionName = (name) => getCollectionName(event, name)

  try {
    switch (action) {
      case 'list': {
        // 获取分类列表（系统预置 + 当前账本的小类），按type过滤
        const whereCondition = type
          ? db.command.or(
              { bookId: null, type },  // 系统预置的指定类型
              { bookId, type }         // 当前账本的指定类型小类
            )
          : db.command.or(
              { bookId: null },  // 系统预置
              { bookId }         // 当前账本的小类
            )

        const categories = await db.collection(collectionName('categories'))
          .where(whereCondition)
          .orderBy('order', 'asc')
          .get()
        return { success: true, categories: categories.data }
      }
      case 'addChild': {
        // 新增小类
        if (!name || !parentId) {
          return { success: false, error: 'name and parentId are required' }
        }
        // 获取父分类的type
        let childType = type
        if (!childType && parentId) {
          const parent = await db.collection(collectionName('categories')).doc(parentId).get()
          if (parent.data) {
            childType = parent.data.type || 'expense'
          }
        }
        const { _id } = await db.collection(collectionName('categories')).add({
          data: {
            name,
            icon: '',
            order: 0,
            type: childType || 'expense',
            isVisible: true,
            parentId,
            bookId
          }
        })
        return { success: true, categoryId: _id }
      }
      case 'hide': {
        await db.collection(collectionName('categories')).doc(categoryId).update({
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