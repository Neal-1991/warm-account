// cloudfunctions/record/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

exports.main = async (event, context) => {
  const { action, bookId, recordId, data = {} } = event
  const collectionName = (name) => getCollectionName(event, name)
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID

  const getBook = async (id) => {
    if (!id) return null
    const res = await db.collection(collectionName('books')).doc(id).get()
    return res.data || null
  }

  const isBookMember = (book) => {
    return !!book && (book.ownerId === openId || (book.memberIds || []).includes(openId))
  }

  const assertBookMember = async (id) => {
    const book = await getBook(id)
    if (!isBookMember(book)) {
      throw new Error('permission denied')
    }
    return book
  }

  const assertCategoryInBook = async (categoryId, targetBookId, type) => {
    const res = await db.collection(collectionName('categories')).doc(categoryId).get()
    const category = res.data
    if (!category || category.bookId !== targetBookId || (type && category.type !== type)) {
      throw new Error('invalid category')
    }
    return category
  }

  const getAuthorizedRecord = async (allowAdmin = false) => {
    if (!recordId) {
      throw new Error('recordId is required')
    }
    const recordRes = await db.collection(collectionName('records')).doc(recordId).get()
    const record = recordRes.data
    if (!record) {
      throw new Error('record not found')
    }
    const book = await assertBookMember(record.bookId)
    if (allowAdmin && book.ownerId === openId) {
      return { record, book }
    }
    if (record.createdBy !== openId) {
      throw new Error('permission denied')
    }
    return { record, book }
  }

  try {
    switch (action) {
      case 'add': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookMember(bookId)
        if (!data.type || !data.amount || !data.categoryId || !data.date) {
          return { success: false, error: 'Missing required fields: type, amount, categoryId, date' }
        }
        await assertCategoryInBook(data.categoryId, bookId, data.type)

        const { _id } = await db.collection(collectionName('records')).add({
          data: {
            bookId,
            type: data.type,
            amount: data.amount,
            categoryId: data.categoryId,
            date: new Date(data.date),
            remark: data.remark || '',
            images: data.images || [],
            createdBy: openId,
            createdByName: data.nickName || '未知',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
        return { success: true, recordId: _id }
      }

      case 'list': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookMember(bookId)

        const { month } = data
        if (!month) {
          return { success: false, error: 'month is required' }
        }
        const startDate = new Date(`${month}-01`)
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1)

        const records = await db.collection(collectionName('records'))
          .where({
            bookId,
            date: db.command.gte(startDate).and(db.command.lt(endDate))
          })
          .orderBy('date', 'desc')
          .orderBy('createdAt', 'desc')
          .limit(500)
          .get()
        return { success: true, records: records.data }
      }

      case 'countByCategory': {
        const { categoryId } = data
        if (!bookId || !categoryId) {
          return { success: false, error: 'bookId and categoryId are required' }
        }
        await assertBookMember(bookId)
        const result = await db.collection(collectionName('records'))
          .where({ bookId, categoryId })
          .count()
        return { success: true, count: result.total }
      }

      case 'update': {
        const { record } = await getAuthorizedRecord(true)
        const updateData = {}
        if (data.type !== undefined) updateData.type = data.type
        if (data.amount !== undefined) updateData.amount = data.amount
        if (data.categoryId !== undefined) updateData.categoryId = data.categoryId
        if (data.date !== undefined) updateData.date = new Date(data.date)
        if (data.remark !== undefined) updateData.remark = data.remark
        if (data.images !== undefined) updateData.images = data.images

        if (updateData.categoryId) {
          await assertCategoryInBook(updateData.categoryId, record.bookId, updateData.type || record.type)
        }

        await db.collection(collectionName('records')).doc(recordId).update({
          data: { ...updateData, updatedAt: db.serverDate() }
        })
        return { success: true }
      }

      case 'delete': {
        await getAuthorizedRecord(true)
        await db.collection(collectionName('records')).doc(recordId).remove()
        return { success: true }
      }

      case 'updateCreatedByName': {
        const { nickName } = data
        if (!openId || !nickName) {
          return { success: false, error: 'openId and nickName are required' }
        }
        const result = await db.collection(collectionName('records'))
          .where({ createdBy: openId })
          .update({ data: { createdByName: nickName, updatedAt: db.serverDate() } })
        return { success: true, updatedCount: result.stats.updated }
      }

      case 'getFileUrl': {
        const fileList = event.fileList || []
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookMember(bookId)
        if (fileList.length === 0) {
          return { success: false, error: 'fileList is required' }
        }
        const res = await cloud.getTempFileURL({ fileList })
        return { success: true, fileList: res.fileList }
      }

      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('record cloud function error:', err)
    return { success: false, error: err.message }
  }
}
