// cloudfunctions/book/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, openId, nickName, bookId } = event

  try {
    switch (action) {
      case 'create': {
        // 创建账本
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
        return { success: true, bookId: id }
      }
      case 'get': {
        // 获取用户账本
        const books = await db.collection('books')
          .where({ ownerId: openId })
          .limit(1)
          .get()
        return { success: true, book: books.data[0] || null }
      }
      case 'generateInviteCode': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        // 生成6位邀请码，24小时有效期
        const code = String(Math.floor(Math.random() * 900000) + 100000)
        await db.collection('books').doc(bookId).update({
          data: {
            inviteCode: code,
            inviteCodeExpire: db.serverDate(Date.now() + 24 * 60 * 60 * 1000)
          }
        })
        return { success: true, code }
      }
      case 'join': {
        // 验证邀请码并加入账本
        const { code } = event
        const books = await db.collection('books')
          .where({ inviteCode: code })
          .limit(1)
          .get()

        if (books.data.length === 0) {
          return { success: false, error: '邀请码无效' }
        }

        const book = books.data[0]

        // 检查邀请码是否过期
        if (book.inviteCodeExpire && new Date(book.inviteCodeExpire) < new Date()) {
          return { success: false, error: '邀请码已过期' }
        }

        // 将新成员加入账本
        const memberIds = book.memberIds || []
        if (!memberIds.includes(openId)) {
          memberIds.push(openId)
        }

        await db.collection('books').doc(book._id).update({
          data: {
            memberIds,
            updatedAt: db.serverDate()
          }
        })

        return { success: true, bookId: book._id }
      }
      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('book cloud function error:', err)
    return { success: false, error: err.message }
  }
}