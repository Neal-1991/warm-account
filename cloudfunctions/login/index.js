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

// init-database 负责按 categorySchemaVersion 幂等初始化或续补分类。
const ensureCategories = async (bookId, isTest) => {
  const initRes = await cloud.callFunction({
    name: 'init-database',
    data: { bookId, isTest }
  })
  if (!initRes.result || !initRes.result.success) {
    throw new Error(initRes.result?.error || 'category initialization failed')
  }
  return initRes.result
}

const normalizePreferences = (preferences = {}) => {
  const themeId = typeof preferences.themeId === 'string' ? preferences.themeId.slice(0, 32) : ''
  return themeId ? { themeId } : {}
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

    if (action === 'restoreSession') {
      if (!openId) {
        return { success: true, authenticated: false }
      }

      const books = await db.collection(collectionName('books'))
        .where(_.or([{ ownerId: openId }, { memberIds: openId }]))
        .get()
      if (books.data.length === 0) {
        // 检测是否曾属于某账本但已被移除（出现在 formerMemberIds 中）
        const formerBooks = await db.collection(collectionName('books'))
          .where({ formerMemberIds: openId })
          .limit(1)
          .get()
        if (formerBooks.data.length > 0) {
          return {
            success: true,
            authenticated: false,
            removed: true,
            removedBookName: formerBooks.data[0].name || '家庭账本',
            openId
          }
        }
        return { success: true, authenticated: false, openId }
      }

      const activeBook = books.data.find(book => !book.joinTargetBookId) || books.data[0]
      const members = await db.collection(collectionName('members'))
        .where({ openId })
        .limit(1)
        .get()
      const member = members.data[0]
      let userInfo = member
        ? {
            nickName: member.nickName || '微信用户',
            avatarUrl: member.avatarUrl || '',
            preferences: normalizePreferences(member.preferences)
          }
        : null

      if (userInfo?.avatarUrl?.startsWith('cloud://')) {
        userInfo.avatarUrl = await cloud.getTempFileURL({
          fileList: [userInfo.avatarUrl]
        }).then(result =>
          result.fileList?.[0]?.tempFileURL || userInfo.avatarUrl
        ).catch(() => userInfo.avatarUrl)
      }

      // 检测当前用户是账本 ownerId 且账本存在 transferNotice（所有权已转给该用户）
      const result = {
        success: true,
        authenticated: true,
        openId,
        bookId: activeBook._id,
        userInfo
      }
      if (activeBook.transferNotice && activeBook.ownerId === openId) {
        result.transferred = true
        result.fromNickName = activeBook.transferNotice.fromNickName
        result.transferredAt = activeBook.transferNotice.transferredAt
      }
      return result
    }

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
            preferences: {},
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

    if (action === 'updatePreferences') {
      if (!openId) {
        return { success: false, error: 'openId is required' }
      }
      const nextPreferences = normalizePreferences(event.preferences)
      if (Object.keys(nextPreferences).length === 0) {
        return { success: false, error: 'preferences are required' }
      }
      const memberCol = db.collection(collectionName('members'))
      const members = await memberCol.where({ openId }).limit(1).get()
      if (members.data.length > 0) {
        const current = members.data[0]
        await memberCol.doc(current._id).update({
          data: {
            preferences: {
              ...(current.preferences || {}),
              ...nextPreferences
            },
            updatedAt: db.serverDate()
          }
        })
      } else {
        await memberCol.add({
          data: {
            openId,
            nickName: '微信用户',
            avatarUrl: '',
            preferences: nextPreferences,
            role: 'admin',
            joinedAt: db.serverDate()
          }
        })
      }
      return { success: true, preferences: nextPreferences }
    }

    // batch query member profiles (called from family page)
    if (action === 'getMembers') {
      const { memberIds, formerMemberIds } = event
      const normalizedMemberIds = Array.isArray(memberIds) ? memberIds : []
      const normalizedFormerMemberIds = Array.isArray(formerMemberIds) ? formerMemberIds : []
      if (normalizedMemberIds.length === 0 && normalizedFormerMemberIds.length === 0) {
        return { success: true, members: [] }
      }

      const books = await db.collection(collectionName('books'))
        .where(_.or([{ ownerId: openId }, { memberIds: openId }]))
        .get()
      const allowedMemberIds = new Set()
      books.data.forEach(book => {
        ;(book.memberIds || []).forEach(id => allowedMemberIds.add(id))
        if (book.ownerId) {
          allowedMemberIds.add(book.ownerId)
        }
        ;(book.formerMemberIds || []).forEach(id => allowedMemberIds.add(id))
      })

      const safeMemberIds = normalizedMemberIds.filter(id => allowedMemberIds.has(id))
      const safeFormerMemberIds = normalizedFormerMemberIds.filter(id => allowedMemberIds.has(id))
      const allSafeIds = Array.from(new Set([...safeMemberIds, ...safeFormerMemberIds]))
      if (allSafeIds.length === 0) {
        return { success: true, members: [] }
      }

      const formerIdSet = new Set(safeFormerMemberIds)
      const members = await db.collection(collectionName('members'))
        .where({ openId: _.in(allSafeIds) })
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

      // 标记已退出成员
      results.forEach(m => {
        if (formerIdSet.has(m.openId)) {
          m.isFormer = true
        }
      })

      return { success: true, members: results }
    }

    // === main login flow ===

    // load or create member profile
    const memberCol = db.collection(collectionName('members'))
    let userInfo = { nickName: nickName || '微信用户', avatarUrl: avatarUrl || '', preferences: {} }

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
        userInfo.preferences = normalizePreferences(m.preferences)
      } else {
        await memberCol.add({
          data: {
            openId,
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            preferences: userInfo.preferences || {},
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
      const bookId = books.data[0]._id
      await ensureCategories(bookId, event.isTest)
      return { success: true, bookId, isNew: false, openId, userInfo }
    }

    const { _id } = await db.collection(collectionName('books')).add({
      data: {
        name: nickName ? `${nickName}的账本` : '默认账本',
        ownerId: openId,
        memberIds: [openId],
        inviteCode: '',
        inviteCodeExpire: null,
        categorySchemaVersion: 0,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })

    // 等待分类创建完成再返回（新用户必须有分类才能记账）
    await ensureCategories(_id, event.isTest)
    return { success: true, bookId: _id, isNew: true, openId, userInfo }
  } catch (err) {
    console.error('login cloud function error:', err)
    return { success: false, error: err.message || 'unknown error' }
  }
}
