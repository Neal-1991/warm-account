// cloudfunctions/category/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

exports.main = async (event, context) => {
  const { action, bookId, name, parentId, categoryId, type, icon } = event
  const collectionName = (name) => getCollectionName(event, name)

  try {
    switch (action) {
      case 'list': {
        const whereCondition = { bookId }
        if (type) whereCondition.type = type
        const categories = await db.collection(collectionName('categories'))
          .where(whereCondition)
          .orderBy('order', 'asc')
          .get()
        return { success: true, categories: categories.data }
      }
      case 'addBig': {
        if (!name || !bookId) {
          return { success: false, error: 'name and bookId are required' }
        }
        if (!type || !['expense', 'income'].includes(type)) {
          return { success: false, error: 'type must be expense or income' }
        }
        // 检查同名大类
        const existing = await db.collection(collectionName('categories'))
          .where({ bookId, parentId: null, name, type })
          .get()
        if (existing.data.length > 0) {
          return { success: false, error: '同名大类已存在' }
        }
        // 创建大类
        const { _id } = await db.collection(collectionName('categories')).add({
          data: {
            name,
            icon: icon || '📌',
            order: 0,
            type,
            isVisible: true,
            isSystem: false,
            parentId: null,
            bookId
          }
        })
        // 自动创建"其他"子类
        await db.collection(collectionName('categories')).add({
          data: {
            name: '其他',
            icon: '',
            order: 0,
            type,
            isVisible: true,
            isSystem: false,
            parentId: _id,
            bookId
          }
        })
        return { success: true, categoryId: _id }
      }
      case 'addChild': {
        if (!name || !parentId || !bookId) {
          return { success: false, error: 'name, parentId and bookId are required' }
        }
        // 检查同名小类
        const existing = await db.collection(collectionName('categories'))
          .where({ bookId, parentId, name })
          .get()
        if (existing.data.length > 0) {
          return { success: false, error: '同名小类已存在' }
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
            isSystem: false,
            parentId,
            bookId
          }
        })
        return { success: true, categoryId: _id }
      }
      case 'rename': {
        if (!categoryId || !bookId) {
          return { success: false, error: 'categoryId and bookId are required' }
        }
        const updateData = {}
        if (name !== undefined && name.trim()) updateData.name = name.trim()
        if (icon !== undefined) updateData.icon = icon
        if (Object.keys(updateData).length === 0) {
          return { success: false, error: 'name or icon is required' }
        }
        // 仅允许修改自己账本的分类
        const cat = await db.collection(collectionName('categories')).doc(categoryId).get()
        if (!cat.data || cat.data.bookId !== bookId) {
          return { success: false, error: '无权修改此分类' }
        }
        // 检查是否与同类同名
        if (updateData.name) {
          const parentId = cat.data.parentId
          const dup = await db.collection(collectionName('categories'))
            .where({ bookId, parentId: parentId || null, name: updateData.name })
            .get()
          if (dup.data.length > 0 && dup.data[0]._id !== categoryId) {
            return { success: false, error: '同名分类已存在' }
          }
        }
        await db.collection(collectionName('categories')).doc(categoryId).update({
          data: updateData
        })
        return { success: true }
      }
      case 'deleteChild': {
        if (!categoryId || !bookId) {
          return { success: false, error: 'categoryId and bookId are required' }
        }
        const cat = await db.collection(collectionName('categories')).doc(categoryId).get()
        if (!cat.data || cat.data.bookId !== bookId) {
          return { success: false, error: '无权删除此分类' }
        }
        if (cat.data.parentId === null) {
          return { success: false, error: '请使用 deleteBig 删除大类' }
        }
        // 统计关联记录数
        const { total } = await db.collection(collectionName('records'))
          .where({ bookId, categoryId }).count()
        if (total > 0) {
          const mergeTargetId = event.mergeTargetId
          if (!mergeTargetId) {
            return { success: false, error: '有记录引用', recordCount: total }
          }
          // 归并：将所有记录移到目标分类
          let updated = 0
          const batchSize = 100
          for (let i = 0; i <= total; i += batchSize) {
            const batch = await db.collection(collectionName('records'))
              .where({ bookId, categoryId })
              .limit(batchSize)
              .get()
            if (batch.data.length === 0) break
            for (const rec of batch.data) {
              await db.collection(collectionName('records')).doc(rec._id).update({
                data: { categoryId: mergeTargetId, updatedAt: db.serverDate() }
              })
              updated++
            }
          }
        }
        await db.collection(collectionName('categories')).doc(categoryId).remove()
        return { success: true, mergedRecords: total }
      }
      case 'deleteBig': {
        if (!categoryId || !bookId) {
          return { success: false, error: 'categoryId and bookId are required' }
        }
        const cat = await db.collection(collectionName('categories')).doc(categoryId).get()
        if (!cat.data || cat.data.bookId !== bookId) {
          return { success: false, error: '无权删除此分类' }
        }
        if (cat.data.isSystem) {
          return { success: false, error: '系统预置大类不可删除' }
        }
        if (cat.data.parentId !== null) {
          return { success: false, error: '请使用 deleteChild 删除小类' }
        }
        // 检查子类
        const children = await db.collection(collectionName('categories'))
          .where({ bookId, parentId: categoryId }).get()
        // 检查是否有记录直接引用该大类
        const { total } = await db.collection(collectionName('records'))
          .where({ bookId, categoryId }).count()
        if (total > 0) {
          return { success: false, error: '该大类下有记录，请先将记录迁移', recordCount: total }
        }
        // 级联删除子类（先删子类再删大类）
        for (const child of children.data) {
          await db.collection(collectionName('categories')).doc(child._id).remove()
        }
        await db.collection(collectionName('categories')).doc(categoryId).remove()
        return { success: true, deletedChildren: children.data.length }
      }
      case 'hide': {
        await db.collection(collectionName('categories')).doc(categoryId).update({
          data: { isVisible: false }
        })
        return { success: true }
      }
      case 'migrate': {
        // 幂等迁移：将共享分类模式转为 per-book 独立副本
        const { openId } = event
        if (!openId) {
          return { success: false, error: 'openId is required for migration' }
        }
        // 查找用户的所有账本（owner 或 member）
        const ownedBooks = await db.collection(collectionName('books'))
          .where({ ownerId: openId }).get()
        const memberBooks = await db.collection(collectionName('books'))
          .where(db.command.where({
            memberIds: db.command.all([openId])
          })).get()
        const allBooks = [...ownedBooks.data, ...memberBooks.data]
        if (allBooks.length === 0) {
          return { success: true, message: 'no book to migrate' }
        }
        const results = []
        for (const book of allBooks) {
          // 检查是否已迁移（账本已有 bookId=该账本的大类）
          const existingBig = await db.collection(collectionName('categories'))
            .where({ bookId: book._id, parentId: null })
            .limit(1).get()
          if (existingBig.data.length > 0) {
            results.push({ bookId: book._id, status: 'skipped', reason: 'already migrated' })
            continue
          }
          // 获取所有系统大类（bookId: null）
          const systemBigs = await db.collection(collectionName('categories'))
            .where({ bookId: null, parentId: null }).get()
          const idMap = {} // oldId -> newId
          // 复制大类
          for (const big of systemBigs.data) {
            const { _id } = await db.collection(collectionName('categories')).add({
              data: {
                name: big.name,
                icon: big.icon,
                order: big.order,
                type: big.type,
                isVisible: big.isVisible !== false,
                isSystem: true,
                parentId: null,
                bookId: book._id
              }
            })
            idMap[big._id] = _id
          }
          // 更新小类的 parentId
          const children = await db.collection(collectionName('categories'))
            .where({ bookId: book._id, parentId: db.command.neq(null) }).get()
          for (const child of children.data) {
            const newParentId = idMap[child.parentId]
            if (newParentId) {
              await db.collection(collectionName('categories')).doc(child._id).update({
                data: { parentId: newParentId }
              })
            }
          }
          // 更新记录的 categoryId
          for (const [oldId, newId] of Object.entries(idMap)) {
            const { total } = await db.collection(collectionName('records'))
              .where({ bookId: book._id, categoryId: oldId }).count()
            if (total === 0) continue
            for (let i = 0; i <= total; i += 100) {
              const batch = await db.collection(collectionName('records'))
                .where({ bookId: book._id, categoryId: oldId })
                .limit(100).get()
              if (batch.data.length === 0) break
              for (const rec of batch.data) {
                await db.collection(collectionName('records')).doc(rec._id).update({
                  data: { categoryId: newId, updatedAt: db.serverDate() }
                })
              }
            }
          }
          results.push({ bookId: book._id, status: 'migrated', categoryCount: Object.keys(idMap).length })
        }
        return { success: true, results }
      }
      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('category cloud function error:', err)
    return { success: false, error: err.message }
  }
}
