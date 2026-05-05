const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  try {
    const { nickName, avatarUrl } = event

    // 通过云函数获取用户信息（服务端获取，无需前端传 openId）
    const cloudUserInfo = cloud.getUserInfo({
      appId: 'wx91ea4c0ab404f9bc',
      cloudId: 'cloud1-2gaj8t3s919e662e'
    })

    const openId = cloudUserInfo.openId

    const db = cloud.database()
    const books = await db.collection('books')
      .where({ ownerId: openId })
      .limit(1)
      .get()

    if (books.data.length > 0) {
      return { success: true, bookId: books.data[0]._id, isNew: false, openId }
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

    return { success: true, bookId: id, isNew: true, openId }
  } catch (err) {
    console.error('login cloud function error:', err)
    return { success: false, error: err.message || 'unknown error' }
  }
}