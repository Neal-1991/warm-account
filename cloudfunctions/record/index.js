// cloudfunctions/record/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, bookId, recordId, data } = event

  try {
    switch (action) {
      case 'add': {
        // Validate required fields
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        if (!data.type || !data.amount || !data.categoryId || !data.date) {
          return { success: false, error: 'Missing required fields: type, amount, categoryId, date' }
        }

        const { id } = await db.collection('records').add({
          data: {
            bookId,
            type: data.type,         // 'expense' | 'income'
            amount: data.amount,     // 金额（分）
            categoryId: data.categoryId,
            date: new Date(data.date),
            remark: data.remark || '',
            images: data.images || [],
            createdBy: data.openId,
            createdByName: data.nickName || '未知',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
        return { success: true, recordId: id }
      }
      case 'list': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        const { month } = data  // 'YYYY-MM'
        const startDate = new Date(month + '-01')
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1)

        const records = await db.collection('records')
          .where({
            bookId,
            date: db.command.gte(startDate).and(db.command.lt(endDate))
          })
          .orderBy('date', 'desc')
          .limit(500)  // Add reasonable cap
          .get()
        return { success: true, records: records.data }
      }
      case 'update': {
        if (!recordId) {
          return { success: false, error: 'recordId is required' }
        }
        await db.collection('records').doc(recordId).update({
          data: { ...data, updatedAt: db.serverDate() }
        })
        return { success: true }
      }
      case 'delete': {
        if (!recordId) {
          return { success: false, error: 'recordId is required' }
        }
        await db.collection('records').doc(recordId).remove()
        return { success: true }
      }
      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('record cloud function error:', err)
    return { success: false, error: err.message }
  }
}
