// cloudfunctions/book/index.js
const cloud = require('wx-server-sdk')
const {
  createJoinMigrationService
} = require('./join-migration')
const {
  INVITE_TTL_MS,
  generateUniqueInviteCode,
  inviteErrorResult,
  isInviteExpired
} = require('./invite-utils')
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
            categorySchemaVersion: 0,
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
        const book = await assertBookOwner(bookId)
        if (book.joinMigration) {
          return { success: false, error: '当前有成员正在加入，请稍后再生成邀请码' }
        }
        const code = await generateUniqueInviteCode(async candidate => {
          const existing = await db.collection(collectionName('books'))
            .where({ inviteCode: candidate })
            .limit(1)
            .get()
          return existing.data.length > 0
        })
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
        await db.collection(collectionName('books')).doc(bookId).update({
          data: {
            inviteCode: code,
            inviteCodeExpire: expiresAt,
            inviteCodeUsedBy: null,
            updatedAt: db.serverDate()
          }
        })
        return { success: true, code, expiresAt }
      }

      case 'validateInviteCode': {
        const { code } = event
        if (!/^\d{6}$/.test(code || '')) {
          return inviteErrorResult('INVALID', 'not_found')
        }

        const books = await db.collection(collectionName('books'))
          .where({ inviteCode: code })
          .limit(1)
          .get()

        if (books.data.length === 0) {
          return inviteErrorResult('INVALID', 'not_found')
        }

        const book = books.data[0]

        if ((book.memberIds || []).includes(openId)) {
          return {
            success: false,
            error: 'already_member',
            reason: 'already_member',
            bookId: book._id,
            bookName: book.name,
            joinStatus: 'completed'
          }
        }

        if (book.joinMigration && book.joinMigration.inviteeOpenId === openId) {
          return {
            success: true,
            valid: true,
            bookId: book._id,
            bookName: book.name,
            memberCount: (book.memberIds || []).length,
            joinStatus: 'processing',
            progress: {
              phase: book.joinMigration.phase,
              current: book.joinMigration.cursor || 0,
              total: (book.joinMigration.plan || []).length,
              movedRecords: book.joinMigration.movedRecords || 0
            }
          }
        }

        if (book.inviteCodeUsedBy) {
          return inviteErrorResult('USED', 'used')
        }

        if (isInviteExpired(book.inviteCodeExpire)) {
          await db.collection(collectionName('books')).doc(book._id).update({
            data: { inviteCode: '', inviteCodeExpire: null, updatedAt: db.serverDate() }
          })
          return inviteErrorResult('EXPIRED', 'expired')
        }

        return {
          success: true,
          valid: true,
          bookId: book._id,
          bookName: book.name,
          memberCount: (book.memberIds || []).length,
          joinStatus: 'idle',
          expiresAt: book.inviteCodeExpire
        }
      }

      case 'join': {
        const { code } = event
        if (!/^\d{6}$/.test(code || '')) {
          return inviteErrorResult('INVALID', 'not_found')
        }

        const bookCol = collectionName('books')
        const targetBooks = await db.collection(bookCol)
          .where({ inviteCode: code })
          .limit(1)
          .get()

        if (targetBooks.data.length === 0) {
          return inviteErrorResult('INVALID', 'not_found')
        }

        const targetBook = targetBooks.data[0]

        if ((targetBook.memberIds || []).includes(openId)) {
          return {
            success: true,
            status: 'completed',
            bookId: targetBook._id
          }
        }

        if (targetBook.inviteCodeUsedBy && targetBook.inviteCodeUsedBy !== openId) {
          return inviteErrorResult('USED', 'used')
        }

        if (targetBook.joinMigration && targetBook.joinMigration.inviteeOpenId !== openId) {
          return inviteErrorResult('IN_USE', 'used')
        }

        if (!targetBook.joinMigration &&
            isInviteExpired(targetBook.inviteCodeExpire)) {
          await db.collection(bookCol).doc(targetBook._id).update({
            data: { inviteCode: '', inviteCodeExpire: null, updatedAt: db.serverDate() }
          })
          return inviteErrorResult('EXPIRED', 'expired')
        }

        if (targetBook.ownerId === openId) {
          return { success: false, error: '你已是该账本的管理员' }
        }

        const userBooks = await db.collection(bookCol)
          .where(_.or([{ ownerId: openId }, { memberIds: openId }]))
          .get()

        const migrationSourceId = targetBook.joinMigration?.sourceBookId
        const userBook = migrationSourceId
          ? userBooks.data.find(book => book._id === migrationSourceId)
          : userBooks.data.find(book => book._id !== targetBook._id)
        const otherBooks = userBooks.data.filter(b => b._id !== targetBook._id && (b.memberIds || []).length > 1)

        if (otherBooks.length > 0) {
          return { success: false, error: '你已有其他家庭账本，暂不支持切换' }
        }

        const joinMigration = createJoinMigrationService({
          db,
          command: _,
          collectionName
        })
        return await joinMigration.run({
          targetBook,
          sourceBookId: migrationSourceId || userBook?._id || '',
          openId,
          inviteCode: code
        })
      }

      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('book cloud function error:', err)
    return {
      success: false,
      error: err.message,
      errorCode: err.code || 'BOOK_OPERATION_FAILED'
    }
  }
}
