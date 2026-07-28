const {
  buildCategoryMigrationPlan,
  categoryIdMap,
  migrationProgress
} = require('./join-migration-utils')
const {
  inviteError,
  isInviteExpired
} = require('./invite-utils')

const PAGE_SIZE = 100
const CATEGORY_BATCH_SIZE = 16
const RECORD_BATCH_SIZE = 40

async function getAll(query) {
  const result = []
  let offset = 0

  while (true) {
    const batch = await query.skip(offset).limit(PAGE_SIZE).get()
    result.push(...batch.data)
    if (batch.data.length < PAGE_SIZE) {
      return result
    }
    offset += batch.data.length
  }
}

function processingResult(targetBookId, state) {
  return {
    success: true,
    status: 'processing',
    bookId: targetBookId,
    progress: migrationProgress(state)
  }
}

function createJoinMigrationService({ db, command, collectionName }) {
  const bookCol = collectionName('books')
  const categoryCol = collectionName('categories')
  const recordCol = collectionName('records')
  const budgetCol = collectionName('budgets')

  async function getBook(bookId) {
    if (!bookId) return null
    const result = await db.collection(bookCol).doc(bookId).get()
    return result.data || null
  }

  async function saveState(targetBookId, state, patch) {
    const nextState = {
      ...state,
      ...patch,
      updatedAt: new Date()
    }
    await db.collection(bookCol).doc(targetBookId).update({
      data: {
        joinMigration: nextState,
        updatedAt: db.serverDate()
      }
    })
    return nextState
  }

  async function reserve(targetBook, sourceBookId, openId, inviteCode) {
    const failureState = error => ({
      error: {
        code: error.code,
        message: error.message
      }
    })
    const initialState = {
      version: 1,
      inviteeOpenId: openId,
      sourceBookId: sourceBookId || '',
      acceptedAt: new Date(),
      phase: 'planning',
      cursor: 0,
      plan: [],
      movedRecords: 0,
      startedAt: new Date(),
      updatedAt: new Date()
    }

    const reserveInCollection = async collection => {
      const freshResult = await collection.doc(targetBook._id).get()
      const fresh = freshResult.data
      if (!fresh || fresh.inviteCode !== inviteCode) {
        return failureState(inviteError('INVALID'))
      }
      if ((fresh.memberIds || []).includes(openId)) {
        return { ...initialState, phase: 'completed' }
      }
      if (fresh.joinMigration && fresh.joinMigration.inviteeOpenId === openId) {
        return fresh.joinMigration
      }
      if (fresh.inviteCodeUsedBy && fresh.inviteCodeUsedBy !== openId) {
        return failureState(inviteError('USED'))
      }
      if (fresh.joinMigration && fresh.joinMigration.inviteeOpenId !== openId) {
        return failureState(inviteError('IN_USE'))
      }
      if (isInviteExpired(fresh.inviteCodeExpire)) {
        await collection.doc(targetBook._id).update({
          data: {
            inviteCode: '',
            inviteCodeExpire: null,
            updatedAt: db.serverDate()
          }
        })
        return failureState(inviteError('EXPIRED'))
      }

      await collection.doc(targetBook._id).update({
        data: {
          inviteCodeUsedBy: openId,
          joinMigration: initialState,
          updatedAt: db.serverDate()
        }
      })
      return initialState
    }

    const lockSourceInCollection = async (collection, state) => {
      if (state.error || state.phase === 'completed') return
      const lockedSourceBookId = state.sourceBookId
      if (!lockedSourceBookId) return

      const sourceResult = await collection.doc(lockedSourceBookId).get()
      const source = sourceResult.data
      if (!source) throw new Error('源账本不存在')
      if (source._id === targetBook._id) throw new Error('源账本不能与目标账本相同')
      if (source.ownerId !== openId && !(source.memberIds || []).includes(openId)) {
        throw new Error('无权迁移源账本')
      }
      if (source.joinTargetBookId && source.joinTargetBookId !== targetBook._id) {
        throw new Error('源账本正在加入其他家庭')
      }

      await collection.doc(lockedSourceBookId).update({
        data: {
          joinTargetBookId: targetBook._id,
          updatedAt: db.serverDate()
        }
      })
    }

    let state
    if (typeof db.runTransaction === 'function') {
      await db.runTransaction(async transaction => {
        const books = transaction.collection(bookCol)
        state = await reserveInCollection(books)
        await lockSourceInCollection(books, state)
      })
    } else {
      const books = db.collection(bookCol)
      state = await reserveInCollection(books)
      await lockSourceInCollection(books, state)
    }
    if (state.error) {
      const error = new Error(state.error.message)
      error.code = state.error.code
      throw error
    }
    return state
  }

  async function finalize(targetBookId, sourceBookId, openId) {
    const finalizeCollections = async getCollection => {
      const targetCollection = getCollection(bookCol)
      const targetResult = await targetCollection.doc(targetBookId).get()
      const target = targetResult.data
      if (!target) throw new Error('目标账本不存在')
      if ((target.memberIds || []).includes(openId)) return
      if (!target.joinMigration || target.joinMigration.inviteeOpenId !== openId) {
        throw new Error('加入任务状态已失效')
      }

      await targetCollection.doc(targetBookId).update({
        data: {
          memberIds: command.addToSet(openId),
          formerMemberIds: command.pull(openId),
          inviteCodeExpire: null,
          inviteCodeUsedBy: openId,
          joinMigration: command.remove(),
          updatedAt: db.serverDate()
        }
      })
      if (sourceBookId) {
        await getCollection(bookCol).doc(sourceBookId).remove()
      }
    }

    if (typeof db.runTransaction === 'function') {
      await db.runTransaction(transaction =>
        finalizeCollections(name => transaction.collection(name))
      )
    } else {
      await finalizeCollections(name => db.collection(name))
    }
  }

  async function removeSourceBudgets(sourceBookId) {
    if (!sourceBookId) return
    const budgets = await getAll(
      db.collection(budgetCol).where({ bookId: sourceBookId })
    )
    await Promise.all(budgets.map(budget =>
      db.collection(budgetCol).doc(budget._id).remove().catch(error => {
        if (!/not exist|not found/i.test(error.message || '')) throw error
      })
    ))
  }

  async function run({ targetBook, sourceBookId, openId, inviteCode }) {
    let state = targetBook.joinMigration
    if (!state) {
      state = await reserve(targetBook, sourceBookId, openId, inviteCode)
    }

    if (state.inviteeOpenId !== openId) {
      throw inviteError('USED')
    }
    sourceBookId = state.sourceBookId || sourceBookId || ''

    if (state.phase === 'completed') {
      return {
        success: true,
        status: 'completed',
        bookId: targetBook._id,
        progress: {
          phase: 'completed',
          current: 0,
          total: 0,
          movedRecords: 0
        }
      }
    }

    if (state.phase === 'planning') {
      const targetCategories = await getAll(
        db.collection(categoryCol).where({ bookId: targetBook._id })
      )
      const sourceCategories = sourceBookId
        ? await getAll(db.collection(categoryCol).where({ bookId: sourceBookId }))
        : []
      const plan = buildCategoryMigrationPlan(targetCategories, sourceCategories)
      const invalid = plan.find(item => item.invalidParent)
      if (invalid) {
        throw new Error(`分类 ${invalid.sourceId} 的父分类不存在`)
      }
      state = await saveState(targetBook._id, state, {
        phase: 'remapCategories',
        cursor: 0,
        plan
      })
      return processingResult(targetBook._id, state)
    }

    if (state.phase === 'remapCategories') {
      const remaps = state.plan.filter(item => item.sourceId !== item.targetId)
      const batch = remaps.slice(state.cursor, state.cursor + CATEGORY_BATCH_SIZE)
      await Promise.all(batch.map(item =>
        db.collection(recordCol)
          .where({ bookId: sourceBookId, categoryId: item.sourceId })
          .update({
            data: {
              categoryId: item.targetId,
              updatedAt: db.serverDate()
            }
          })
      ))
      const cursor = state.cursor + batch.length
      state = await saveState(targetBook._id, state, cursor >= remaps.length
        ? { phase: 'moveCategories', cursor: 0 }
        : { cursor })
      return processingResult(targetBook._id, state)
    }

    if (state.phase === 'moveCategories') {
      const moves = state.plan.filter(item => item.sourceId === item.targetId)
      const batch = moves.slice(state.cursor, state.cursor + CATEGORY_BATCH_SIZE)
      await Promise.all(batch.map(item =>
        db.collection(categoryCol).doc(item.sourceId).update({
          data: {
            bookId: targetBook._id,
            parentId: item.parentId
          }
        })
      ))
      const cursor = state.cursor + batch.length
      state = await saveState(targetBook._id, state, cursor >= moves.length
        ? { phase: 'moveRecords', cursor: 0 }
        : { cursor })
      return processingResult(targetBook._id, state)
    }

    if (state.phase === 'moveRecords') {
      const records = sourceBookId
        ? await db.collection(recordCol)
          .where({ bookId: sourceBookId })
          .limit(RECORD_BATCH_SIZE)
          .get()
        : { data: [] }
      const idMap = categoryIdMap(state.plan)
      await Promise.all(records.data.map(record => {
        const targetCategoryId = idMap[record.categoryId] || record.categoryId
        return db.collection(recordCol).doc(record._id).update({
          data: {
            bookId: targetBook._id,
            categoryId: targetCategoryId,
            updatedAt: db.serverDate()
          }
        })
      }))

      if (records.data.length > 0) {
        state = await saveState(targetBook._id, state, {
          movedRecords: (state.movedRecords || 0) + records.data.length
        })
      } else {
        state = await saveState(targetBook._id, state, {
          phase: 'verify',
          cursor: 0
        })
      }
      return processingResult(targetBook._id, state)
    }

    if (state.phase === 'verify') {
      if (sourceBookId) {
        const remaining = await db.collection(recordCol)
          .where({ bookId: sourceBookId })
          .limit(1)
          .get()
        if (remaining.data.length > 0) {
          state = await saveState(targetBook._id, state, {
            phase: 'moveRecords',
            cursor: 0
          })
          return processingResult(targetBook._id, state)
        }
      }

      const targetCategories = await getAll(
        db.collection(categoryCol).where({ bookId: targetBook._id })
      )
      const validCategoryIds = new Set(targetCategories.map(category => category._id))
      const records = await getAll(
        db.collection(recordCol).where({ bookId: targetBook._id })
      )
      const invalidRecord = records.find(record => !validCategoryIds.has(record.categoryId))
      if (invalidRecord) {
        throw new Error(`记录 ${invalidRecord._id} 的分类未正确迁移`)
      }

      state = await saveState(targetBook._id, state, {
        phase: 'cleanup',
        cursor: 0
      })
      return processingResult(targetBook._id, state)
    }

    if (state.phase === 'cleanup') {
      const duplicates = state.plan.filter(item => item.sourceId !== item.targetId)
      const batch = duplicates.slice(state.cursor, state.cursor + CATEGORY_BATCH_SIZE)
      await Promise.all(batch.map(item =>
        db.collection(categoryCol).doc(item.sourceId).remove().catch(error => {
          if (!/not exist|not found/i.test(error.message || '')) throw error
        })
      ))
      const cursor = state.cursor + batch.length
      if (cursor < duplicates.length) {
        state = await saveState(targetBook._id, state, { cursor })
        return processingResult(targetBook._id, state)
      }

      await removeSourceBudgets(sourceBookId)
      await finalize(targetBook._id, sourceBookId, openId)
      return {
        success: true,
        status: 'completed',
        bookId: targetBook._id,
        progress: {
          phase: 'completed',
          current: state.plan.length,
          total: state.plan.length,
          movedRecords: state.movedRecords || 0
        }
      }
    }

    throw new Error(`未知的加入任务阶段: ${state.phase}`)
  }

  return {
    getBook,
    run
  }
}

module.exports = {
  PAGE_SIZE,
  getAll,
  createJoinMigrationService
}
