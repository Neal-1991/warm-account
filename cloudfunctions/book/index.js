// cloudfunctions/book/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

exports.main = async (event, context) => {
  const { action, nickName, bookId } = event
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

  const assertBookOwner = async (id) => {
    const book = await getBook(id)
    if (!book || book.ownerId !== openId) {
      throw new Error('permission denied')
    }
    return book
  }

  try {
    if (!openId) {
      return { success: false, error: 'openId is required' }
    }

    switch (action) {
      case 'create': {
        const { _id } = await db.collection(collectionName('books')).add({
          data: {
            name: nickName ? `${nickName}的账本` : '默认账本',
            ownerId: openId,
            memberIds: [openId],
            inviteCode: '',
            inviteCodeExpire: null,
            inviteCodeUsedBy: null,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
        return { success: true, bookId: _id }
      }

      case 'get': {
        const books = await db.collection(collectionName('books'))
          .where(_.or([{ ownerId: openId }, { memberIds: openId }]))
          .limit(1)
          .get()
        return { success: true, book: books.data[0] || null }
      }

      case 'generateInviteCode': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookOwner(bookId)
        const code = String(Math.floor(Math.random() * 900000) + 100000)
        await db.collection(collectionName('books')).doc(bookId).update({
          data: {
            inviteCode: code,
            inviteCodeExpire: new Date(Date.now() + 60 * 60 * 1000),
            inviteCodeUsedBy: null,
            updatedAt: db.serverDate()
          }
        })
        return { success: true, code }
      }

      case 'validateInviteCode': {
        const { code } = event
        if (!code || code.length !== 6) {
          return { success: false, error: 'invalid_code', reason: 'not_found' }
        }

        const books = await db.collection(collectionName('books'))
          .where({ inviteCode: code })
          .limit(1)
          .get()

        if (books.data.length === 0) {
          return { success: false, error: 'invalid_code', reason: 'not_found' }
        }

        const book = books.data[0]

        if (book.inviteCodeUsedBy) {
          if ((book.memberIds || []).includes(openId)) {
            return { success: false, error: 'already_member', reason: 'already_member', bookName: book.name }
          }
          return { success: false, error: 'code_used', reason: 'used' }
        }

        if (book.inviteCodeExpire && new Date(book.inviteCodeExpire) < new Date()) {
          await db.collection(collectionName('books')).doc(book._id).update({
            data: { inviteCode: '', inviteCodeExpire: null, updatedAt: db.serverDate() }
          })
          return { success: false, error: 'code_expired', reason: 'expired' }
        }

        return {
          success: true,
          valid: true,
          bookName: book.name,
          memberCount: (book.memberIds || []).length
        }
      }

      case 'join': {
        const { code } = event
        if (!code || code.length !== 6) {
          return { success: false, error: '邀请码无效' }
        }

        const bookCol = collectionName('books')
        const catCol = collectionName('categories')
        const recCol = collectionName('records')

        const targetBooks = await db.collection(bookCol)
          .where({ inviteCode: code })
          .limit(1)
          .get()

        if (targetBooks.data.length === 0) {
          return { success: false, error: '邀请码无效' }
        }

        const targetBook = targetBooks.data[0]

        if (targetBook.inviteCodeUsedBy) {
          return { success: false, error: '该邀请已被使用' }
        }

        if (targetBook.inviteCodeExpire && new Date(targetBook.inviteCodeExpire) < new Date()) {
          await db.collection(bookCol).doc(targetBook._id).update({
            data: { inviteCode: '', inviteCodeExpire: null, updatedAt: db.serverDate() }
          })
          return { success: false, error: '邀请码已过期' }
        }

        if (targetBook.ownerId === openId) {
          return { success: false, error: '你已是该账本的管理员' }
        }

        if ((targetBook.memberIds || []).includes(openId)) {
          return { success: false, error: '你已是该账本的成员' }
        }

        const userBooks = await db.collection(bookCol)
          .where(_.or([{ ownerId: openId }, { memberIds: openId }]))
          .get()

        const userBook = userBooks.data[0]
        const otherBooks = userBooks.data.filter(b => b._id !== targetBook._id && (b.memberIds || []).length > 1)

        if (otherBooks.length > 0) {
          return { success: false, error: '你已有其他家庭账本，暂不支持切换' }
        }

        if (userBook && userBook._id !== targetBook._id) {
          const aBigs = await db.collection(catCol)
            .where({ bookId: targetBook._id, parentId: null })
            .get()
          const bBigs = await db.collection(catCol)
            .where({ bookId: userBook._id, parentId: null })
            .get()

          const bBigIdToName = new Map()
          for (const big of bBigs.data) {
            bBigIdToName.set(big._id, big.name)
          }

          const aBigNameToId = new Map()
          const aBigIdToName = new Map()
          for (const big of aBigs.data) {
            aBigNameToId.set(`${big.name}:${big.type}`, big._id)
            aBigIdToName.set(big._id, big.name)
          }

          for (const bBig of bBigs.data) {
            const aBigId = aBigNameToId.get(`${bBig.name}:${bBig.type}`)
            if (aBigId) {
              await db.collection(recCol)
                .where({ bookId: userBook._id, categoryId: bBig._id })
                .update({ data: { categoryId: aBigId, updatedAt: db.serverDate() } })
              await db.collection(catCol).doc(bBig._id).remove()
            }
          }

          const bChildren = await db.collection(catCol)
            .where({ bookId: userBook._id, parentId: _.neq(null) })
            .get()

          if (bChildren.data.length > 0) {
            const aChildren = await db.collection(catCol)
              .where({ bookId: targetBook._id, parentId: _.neq(null) })
              .get()

            const aCatMap = new Map()
            for (const cat of aChildren.data) {
              const bigName = aBigIdToName.get(cat.parentId) || ''
              aCatMap.set(`${bigName}:${cat.name}`, cat)
            }

            for (const bCat of bChildren.data) {
              const bBigName = bBigIdToName.get(bCat.parentId) || ''
              const key = `${bBigName}:${bCat.name}`
              const aCat = aCatMap.get(key)

              if (aCat) {
                await db.collection(recCol)
                  .where({ bookId: userBook._id, categoryId: bCat._id })
                  .update({ data: { categoryId: aCat._id, updatedAt: db.serverDate() } })
                await db.collection(catCol).doc(bCat._id).remove()
              } else {
                const aBigId = aBigNameToId.get(`${bBigName}:${bCat.type}`)
                const updateData = { bookId: targetBook._id }
                if (aBigId) {
                  updateData.parentId = aBigId
                }
                await db.collection(catCol).doc(bCat._id).update({ data: updateData })
              }
            }
          }

          const remainingBigs = await db.collection(catCol)
            .where({ bookId: userBook._id, parentId: null })
            .get()
          for (const big of remainingBigs.data) {
            await db.collection(catCol).doc(big._id).update({
              data: { bookId: targetBook._id }
            })
          }

          await db.collection(recCol)
            .where({ bookId: userBook._id })
            .update({
              data: { bookId: targetBook._id, updatedAt: db.serverDate() }
            })
        }

        await db.collection(bookCol).doc(targetBook._id).update({
          data: {
            memberIds: _.addToSet(openId),
            inviteCodeExpire: null,
            inviteCodeUsedBy: openId,
            updatedAt: db.serverDate()
          }
        })

        if (userBook && userBook._id !== targetBook._id) {
          await db.collection(bookCol).doc(userBook._id).remove()
        }

        return { success: true, bookId: targetBook._id }
      }

      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('book cloud function error:', err)
    return { success: false, error: err.message }
  }
}
