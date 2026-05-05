const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { openId, nickName, avatarUrl } = event
  const db = cloud.database()

  // 查询是否已有账本
  const books = await db.collection('books')
    .where({ ownerId: openId })
    .limit(1)
    .get()

  if (books.data.length > 0) {
    // 已有账本，返回账本ID
    return { success: true, bookId: books.data[0]._id, isNew: false }
  }

  // 创建新账本
  const { id } = await db.collection('books').add({
    data: {
      name: `${nickName}的账本`,
      ownerId: openId,
      memberIds: [openId],
      inviteCode: '',
      inviteCodeExpire: null,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })

  return { success: true, bookId: id, isNew: true }
}