// cloudfunctions/category/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

exports.main = async (event, context) => {
  const { action, bookId, name, parentId, categoryId, type, icon } = event
  const collectionName = (name) => getCollectionName(event, name)
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID

  const getBook = async (id) => {
    if (!id) return null
    const res = await db.collection(collectionName('books')).doc(id).get()
    return res.data || null
  }

  const assertBookMember = async (id) => {
    const book = await getBook(id)
    if (!book || (book.ownerId !== openId && !(book.memberIds || []).includes(openId))) {
      throw new Error('permission denied')
    }
    return book
  }

  const getCategoryInBook = async (id, targetBookId) => {
    const res = await db.collection(collectionName('categories')).doc(id).get()
    const cat = res.data
    if (!cat || cat.bookId !== targetBookId) {
      throw new Error('permission denied')
    }
    return cat
  }

  const assertMergeTarget = async (sourceCat, mergeTargetId) => {
    const target = await getCategoryInBook(mergeTargetId, sourceCat.bookId)
    const isParent = target._id === sourceCat.parentId && target.parentId === null
    const isSibling = target.parentId === sourceCat.parentId
    if (!isParent && !isSibling) {
      throw new Error('invalid merge target')
    }
    if (target.type !== sourceCat.type) {
      throw new Error('invalid merge target')
    }
    return target
  }

  try {
    switch (action) {
      case 'list': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookMember(bookId)
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
        await assertBookMember(bookId)
        if (!type || !['expense', 'income'].includes(type)) {
          return { success: false, error: 'type must be expense or income' }
        }

        const trimmedName = name.trim()
        const existing = await db.collection(collectionName('categories'))
          .where({ bookId, parentId: null, name: trimmedName, type })
          .get()
        if (existing.data.length > 0) {
          return { success: false, error: '同名大类已存在' }
        }

        const { _id } = await db.collection(collectionName('categories')).add({
          data: {
            name: trimmedName,
            icon: icon || '📌',
            order: 0,
            type,
            isVisible: true,
            isSystem: false,
            parentId: null,
            bookId
          }
        })

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
        await assertBookMember(bookId)
        const parent = await getCategoryInBook(parentId, bookId)
        if (parent.parentId !== null) {
          return { success: false, error: 'parentId must be a big category' }
        }

        const trimmedName = name.trim()
        const existing = await db.collection(collectionName('categories'))
          .where({ bookId, parentId, name: trimmedName })
          .get()
        if (existing.data.length > 0) {
          return { success: false, error: '同名小类已存在' }
        }

        const { _id } = await db.collection(collectionName('categories')).add({
          data: {
            name: trimmedName,
            icon: '',
            order: 0,
            type: parent.type || type || 'expense',
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
        await assertBookMember(bookId)
        const cat = await getCategoryInBook(categoryId, bookId)

        const updateData = {}
        if (name !== undefined && name.trim()) updateData.name = name.trim()
        if (icon !== undefined) updateData.icon = icon
        if (Object.keys(updateData).length === 0) {
          return { success: false, error: 'name or icon is required' }
        }

        if (updateData.name) {
          const dupWhere = {
            bookId,
            parentId: cat.parentId || null,
            name: updateData.name,
            type: cat.type
          }
          const dup = await db.collection(collectionName('categories')).where(dupWhere).get()
          if (dup.data.some(item => item._id !== categoryId)) {
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
        await assertBookMember(bookId)
        const cat = await getCategoryInBook(categoryId, bookId)
        if (cat.parentId === null) {
          return { success: false, error: 'please use deleteBig for big categories' }
        }

        const { total } = await db.collection(collectionName('records'))
          .where({ bookId, categoryId })
          .count()

        if (total > 0) {
          const mergeTargetId = event.mergeTargetId
          if (!mergeTargetId) {
            return { success: false, error: 'category has records', recordCount: total }
          }
          await assertMergeTarget(cat, mergeTargetId)

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
        await assertBookMember(bookId)
        const cat = await getCategoryInBook(categoryId, bookId)
        if (cat.isSystem) {
          return { success: false, error: '系统预设大类不可删除' }
        }
        if (cat.parentId !== null) {
          return { success: false, error: 'please use deleteChild for child categories' }
        }

        const children = await db.collection(collectionName('categories'))
          .where({ bookId, parentId: categoryId })
          .get()
        const childIds = children.data.map(child => child._id)

        const directCount = await db.collection(collectionName('records'))
          .where({ bookId, categoryId })
          .count()
        let childCount = { total: 0 }
        if (childIds.length > 0) {
          childCount = await db.collection(collectionName('records'))
            .where({ bookId, categoryId: _.in(childIds) })
            .count()
        }

        const totalRecords = directCount.total + childCount.total
        if (totalRecords > 0) {
          return {
            success: false,
            error: '该大类或子类下有记录，请先迁移记录',
            recordCount: totalRecords
          }
        }

        for (const child of children.data) {
          await db.collection(collectionName('categories')).doc(child._id).remove()
        }
        await db.collection(collectionName('categories')).doc(categoryId).remove()
        return { success: true, deletedChildren: children.data.length }
      }

      case 'hide': {
        if (!categoryId || !bookId) {
          return { success: false, error: 'categoryId and bookId are required' }
        }
        await assertBookMember(bookId)
        await getCategoryInBook(categoryId, bookId)
        await db.collection(collectionName('categories')).doc(categoryId).update({
          data: { isVisible: false }
        })
        return { success: true }
      }

      case 'migrate': {
        const migrationOpenId = openId || event.openId
        if (!migrationOpenId) {
          return { success: false, error: 'openId is required for migration' }
        }
        const ownedBooks = await db.collection(collectionName('books'))
          .where({ ownerId: migrationOpenId })
          .get()
        const memberBooks = await db.collection(collectionName('books'))
          .where({ memberIds: migrationOpenId })
          .get()
        const allBooks = [...ownedBooks.data, ...memberBooks.data]
        if (allBooks.length === 0) {
          return { success: true, message: 'no book to migrate' }
        }

        const results = []
        for (const book of allBooks) {
          const existingBig = await db.collection(collectionName('categories'))
            .where({ bookId: book._id, parentId: null })
            .limit(1)
            .get()
          if (existingBig.data.length > 0) {
            results.push({ bookId: book._id, status: 'skipped', reason: 'already migrated' })
            continue
          }

          const systemBigs = await db.collection(collectionName('categories'))
            .where({ bookId: null, parentId: null })
            .get()
          const idMap = {}

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

          const children = await db.collection(collectionName('categories'))
            .where({ bookId: book._id, parentId: _.neq(null) })
            .get()
          for (const child of children.data) {
            const newParentId = idMap[child.parentId]
            if (newParentId) {
              await db.collection(collectionName('categories')).doc(child._id).update({
                data: { parentId: newParentId }
              })
            }
          }

          for (const [oldId, newId] of Object.entries(idMap)) {
            const { total } = await db.collection(collectionName('records'))
              .where({ bookId: book._id, categoryId: oldId })
              .count()
            if (total === 0) continue
            for (let i = 0; i <= total; i += 100) {
              const batch = await db.collection(collectionName('records'))
                .where({ bookId: book._id, categoryId: oldId })
                .limit(100)
                .get()
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
