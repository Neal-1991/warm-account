const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 获取环境后缀（云函数无法直接访问小程序 config.js，需要根据云环境判断）
// 由于多个环境可能共用同一个云环境ID，这里通过事件传递 isTest 参数
const getSuffix = (event) => {
  // 优先使用前端传递的参数
  if (event.isTest !== undefined) {
    return event.isTest ? '_test' : '_prod'
  }
  // 默认使用测试环境后缀
  return '_test'
}

exports.main = async (event, context) => {
  try {
    const { nickName, avatarUrl, action } = event

    const suffix = getSuffix(event)
    const collectionName = (name) => `${name}${suffix}`

    const wxContext = cloud.getWXContext()
    const openId = wxContext.OPENID

    const db = cloud.database()
    const _ = db.command

    // profile update (called from mine page)
    if (action === 'updateProfile') {
      if (!openId) {
        return { success: false, error: 'openId is required' }
      }
      const memberCol = db.collection(collectionName('members'))
      const members = await memberCol.where({ openId }).limit(1).get()

      const profile = {
        nickName: nickName || '微信用户',
        avatarUrl: avatarUrl || ''
      }

      if (members.data.length > 0) {
        await memberCol.doc(members.data[0]._id).update({
          data: {
            nickName: profile.nickName,
            avatarUrl: profile.avatarUrl,
            updatedAt: db.serverDate()
          }
        })
      } else {
        await memberCol.add({
          data: {
            openId,
            nickName: profile.nickName,
            avatarUrl: profile.avatarUrl,
            role: 'admin',
            joinedAt: db.serverDate()
          }
        })
      }

      // 如果昵称有变且用户是账本所有者，同步更新账本名称
      const { bookId } = event
      if (nickName && bookId) {
        try {
          const book = await db.collection(collectionName('books')).doc(bookId).get()
          if (book.data && book.data.ownerId === openId) {
            await db.collection(collectionName('books')).doc(bookId).update({
              data: { name: `${nickName}的账本`, updatedAt: db.serverDate() }
            })
          }
        } catch (bookErr) {
          console.error('update book name error:', bookErr)
        }
      }

      return { success: true }
    }

    // batch query member profiles (called from family page)
    if (action === 'getMembers') {
      const { memberIds } = event
      if (!memberIds || memberIds.length === 0) {
        return { success: true, members: [] }
      }
      const members = await db.collection(collectionName('members'))
        .where({ openId: _.in(memberIds) })
        .get()

      // 将 cloud:// 头像路径转为临时 URL（跨用户访问需要云函数管理员权限）
      const results = members.data
      const cloudFileIds = results.filter(m => m.avatarUrl && m.avatarUrl.startsWith('cloud://')).map(m => m.avatarUrl)
      if (cloudFileIds.length > 0) {
        try {
          const tempRes = await cloud.getTempFileURL({ fileList: cloudFileIds })
          const urlMap = {}
          tempRes.fileList.forEach(f => { urlMap[f.fileID] = f.tempFileURL })
          results.forEach(m => { if (urlMap[m.avatarUrl]) m.avatarUrl = urlMap[m.avatarUrl] })
        } catch (e) {
          console.error('getMembers getTempFileURL error:', e)
        }
      }

      return { success: true, members: results }
    }

    // === main login flow ===

    // load or create member profile
    const memberCol = db.collection(collectionName('members'))
    let userInfo = { nickName: nickName || '微信用户', avatarUrl: avatarUrl || '' }

    try {
      const members = await memberCol.where({ openId }).limit(1).get()
      if (members.data.length > 0) {
        const m = members.data[0]
        if (m.nickName && m.nickName !== '微信用户') {
          userInfo.nickName = m.nickName
        }
        if (m.avatarUrl) {
          userInfo.avatarUrl = m.avatarUrl.startsWith('cloud://')
            ? await cloud.getTempFileURL({ fileList: [m.avatarUrl] }).then(r => r.fileList?.[0]?.tempFileURL || m.avatarUrl).catch(() => m.avatarUrl)
            : m.avatarUrl
        }
      } else {
        await memberCol.add({
          data: {
            openId,
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            role: 'admin',
            joinedAt: db.serverDate()
          }
        })
      }
    } catch (memberErr) {
      console.error('member profile lookup failed:', memberErr)
      // non-fatal — continue login with WeChat-provided values
    }

    const books = await db.collection(collectionName('books'))
      .where(_.or([{ ownerId: openId }, { memberIds: openId }]))
      .limit(1)
      .get()

    if (books.data.length > 0) {
      return { success: true, bookId: books.data[0]._id, isNew: false, openId, userInfo }
    }

    const { _id } = await db.collection(collectionName('books')).add({
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

    return { success: true, bookId: _id, isNew: true, openId, userInfo }
  } catch (err) {
    console.error('login cloud function error:', err)
    return { success: false, error: err.message || 'unknown error' }
  }
}