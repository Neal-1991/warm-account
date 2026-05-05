const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  try {
    const { openId, nickName, avatarUrl } = event

    // Validate required fields
    if (!openId) {
      return { success: false, error: 'openId is required' }
    }

    const db = cloud.database()
    const books = await db.collection('books')
      .where({ ownerId: openId })
      .limit(1)
      .get()

    if (books.data.length > 0) {
      return { success: true, bookId: books.data[0]._id, isNew: false }
    }

    const { id } = await db.collection('books').add({
      data: {
        name: nickName ? `${nickName}的账本` : '默认账本',
        ownerId: openId,
        memberIds: [openId],
        inviteCode: '',
        inviteCodeExpire: null,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })

    return { success: true, bookId: id, isNew: true }
  } catch (err) {
    console.error('login cloud function error:', err)
    return { success: false, error: err.message || 'unknown error' }
  }
}
