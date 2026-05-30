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
  const { action, openId, nickName, bookId } = event
  const collectionName = (name) => getCollectionName(event, name)

  try {
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
        const code = String(Math.floor(Math.random() * 900000) + 100000)
        await db.collection(collectionName('books')).doc(bookId).update({
          data: {
            inviteCode: code,
            inviteCodeExpire: new Date(Date.now() + 60 * 60 * 1000),
            inviteCodeUsedBy: null
          }
        })
        return { success: true, code }
      }

      case 'validateInviteCode': {
        const { code, openId } = event
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
          if (openId && (book.memberIds || []).includes(openId)) {
            return { success: false, error: 'already_member', reason: 'already_member', bookName: book.name }
          }
          return { success: false, error: 'code_used', reason: 'used' }
        }

        if (book.inviteCodeExpire && new Date(book.inviteCodeExpire) < new Date()) {
          await db.collection(collectionName('books')).doc(book._id).update({
            data: { inviteCode: '', inviteCodeExpire: null }
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
        if (!openId) {
          return { success: false, error: 'openId is required' }
        }
        if (!code || code.length !== 6) {
          return { success: false, error: '邀请码无效' }
        }

        const col = collectionName('books')
        const catCol = collectionName('categories')

        // 1. 查找目标账本（邀请码）
        const targetBooks = await db.collection(col)
          .where({ inviteCode: code })
          .limit(1)
          .get()

        if (targetBooks.data.length === 0) {
          return { success: false, error: '邀请码无效' }
        }

        const targetBook = targetBooks.data[0]

        // 检查是否已被使用
        if (targetBook.inviteCodeUsedBy) {
          return { success: false, error: '该邀请已被使用' }
        }

        // 检查是否过期
        if (targetBook.inviteCodeExpire && new Date(targetBook.inviteCodeExpire) < new Date()) {
          await db.collection(col).doc(targetBook._id).update({
            data: { inviteCode: '', inviteCodeExpire: null }
          })
          return { success: false, error: '邀请码已过期' }
        }

        // 不能加入自己的账本
        if (targetBook.ownerId === openId) {
          return { success: false, error: '你已是该账本的管理员' }
        }

        // 检查是否已是该账本成员
        if ((targetBook.memberIds || []).includes(openId)) {
          return { success: false, error: '你已是该账本的成员' }
        }

        // 2. 查找用户当前持有的账本
        const userBooks = await db.collection(col)
          .where(_.or([{ ownerId: openId }, { memberIds: openId }]))
          .get()

        const userBook = userBooks.data[0]
        const otherBooks = userBooks.data.filter(b => b._id !== targetBook._id && (b.memberIds || []).length > 1)

        if (otherBooks.length > 0) {
          return { success: false, error: '你已有其他家庭账本，暂不支持切换' }
        }

        // 3. 迁移分类和记录 + 删除旧账本
        const recCol = collectionName('records')

        if (userBook && userBook._id !== targetBook._id) {
          // 3a. 智能合并 B 的小类到目标账本
          const bCategories = await db.collection(catCol)
            .where({ bookId: userBook._id, parentId: _.neq(null) })
            .get()

          if (bCategories.data.length > 0) {
            const aCategories = await db.collection(catCol)
              .where({ bookId: targetBook._id, parentId: _.neq(null) })
              .get()

            // 构建 A 的小类查找表: "parentId:name" -> category doc
            const aCatMap = new Map()
            for (const cat of aCategories.data) {
              aCatMap.set(`${cat.parentId}:${cat.name}`, cat)
            }

            for (const bCat of bCategories.data) {
              const key = `${bCat.parentId}:${bCat.name}`
              const aCat = aCatMap.get(key)

              if (aCat) {
                // 同名同父 → 合并：B 的记录重映射到 A 的分类
                await db.collection(recCol)
                  .where({ categoryId: bCat._id })
                  .update({
                    data: { categoryId: aCat._id }
                  })
                await db.collection(catCol).doc(bCat._id).remove()
              } else {
                // 无冲突 → 迁移小类到目标账本
                await db.collection(catCol).doc(bCat._id).update({
                  data: { bookId: targetBook._id }
                })
              }
            }
          }

          // 3b. 迁移 B 的历史记录到目标账本
          await db.collection(recCol)
            .where({ bookId: userBook._id })
            .update({
              data: { bookId: targetBook._id, updatedAt: db.serverDate() }
            })
        }

        // 4. 先将 B 加入目标账本（在删除旧账本之前，避免中间状态数据丢失）
        const memberIds = targetBook.memberIds || []
        memberIds.push(openId)

        await db.collection(col).doc(targetBook._id).update({
          data: {
            memberIds,
            inviteCodeExpire: null,
            inviteCodeUsedBy: openId,
            updatedAt: db.serverDate()
          }
        })

        // 5. 最后删除旧账本（只有加入新账本成功后才会执行）
        if (userBook && userBook._id !== targetBook._id) {
          await db.collection(col).doc(userBook._id).remove()
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
