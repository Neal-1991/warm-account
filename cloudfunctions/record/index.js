// cloudfunctions/record/index.js
const cloud = require('wx-server-sdk')
const { selectBudgetAlert } = require('./budget-alert')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const PAGE_SIZE = 100
const VALID_RECORD_TYPES = new Set(['expense', 'income'])
const SECURITY_SCENE = 2
const SECURITY_VERSION = 2
const SECURITY_TIMEOUT_MS = 8000
const BATCH_CREATE_MAX_ITEMS = 20
const CONTENT_SECURITY_REJECTED = 'CONTENT_SECURITY_REJECTED'
const CONTENT_SECURITY_UNAVAILABLE = 'CONTENT_SECURITY_UNAVAILABLE'
const CONTENT_SECURITY_REJECTED_MESSAGE = '内容含违规信息，请修改后再试'
const CONTENT_SECURITY_UNAVAILABLE_MESSAGE = '内容安全检测暂不可用，请稍后再试'

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

exports.main = async (event, context) => {
  const { action, bookId, recordId, data = {} } = event
  const collectionName = (name) => getCollectionName(event, name)
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID

  const createContentSecurityError = (errorCode, message) => {
    const err = new Error(message)
    err.errorCode = errorCode
    return err
  }

  const contentSecurityRejected = () => (
    createContentSecurityError(CONTENT_SECURITY_REJECTED, CONTENT_SECURITY_REJECTED_MESSAGE)
  )

  const contentSecurityUnavailable = () => (
    createContentSecurityError(CONTENT_SECURITY_UNAVAILABLE, CONTENT_SECURITY_UNAVAILABLE_MESSAGE)
  )

  const isContentSecurityError = err => (
    err && (err.errorCode === CONTENT_SECURITY_REJECTED || err.errorCode === CONTENT_SECURITY_UNAVAILABLE)
  )

  const withSecurityTimeout = (promise) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(createContentSecurityError(
        CONTENT_SECURITY_UNAVAILABLE,
        CONTENT_SECURITY_UNAVAILABLE_MESSAGE
      ))
    }, SECURITY_TIMEOUT_MS)
    promise.then(res => {
      clearTimeout(timer)
      resolve(res)
    }).catch(err => {
      clearTimeout(timer)
      reject(err)
    })
  })

  const securityDetail = (res = {}) => {
    const result = res.result || {}
    return {
      errCode: res.errCode ?? res.errcode ?? result.errCode ?? result.errcode,
      suggest: result.suggest || res.suggest || '',
      traceId: result.traceId || result.trace_id || res.traceId || res.trace_id || ''
    }
  }

  const logSecurityResult = (scope, detail, errorCode) => {
    console.warn('content security check failed:', {
      action,
      scope,
      errorCode,
      errCode: detail?.errCode,
      suggest: detail?.suggest,
      traceId: detail?.traceId
    })
  }

  const isRejectedErrCode = errCode => Number(errCode) === 87014

  const assertSecurityPassed = (res, scope) => {
    const detail = securityDetail(res)
    if (detail.suggest && detail.suggest !== 'pass') {
      logSecurityResult(scope, detail, CONTENT_SECURITY_REJECTED)
      throw contentSecurityRejected()
    }
    if (detail.errCode !== undefined && Number(detail.errCode) !== 0) {
      if (isRejectedErrCode(detail.errCode)) {
        logSecurityResult(scope, detail, CONTENT_SECURITY_REJECTED)
        throw contentSecurityRejected()
      }
      logSecurityResult(scope, detail, CONTENT_SECURITY_UNAVAILABLE)
      throw contentSecurityUnavailable()
    }
  }

  const normalizeSecurityError = (err, scope) => {
    if (isContentSecurityError(err)) {
      throw err
    }
    const detail = securityDetail(err || {})
    if (isRejectedErrCode(detail.errCode || err?.errCode || err?.errcode || err?.code)) {
      logSecurityResult(scope, detail, CONTENT_SECURITY_REJECTED)
      throw contentSecurityRejected()
    }
    logSecurityResult(scope, detail, CONTENT_SECURITY_UNAVAILABLE)
    throw contentSecurityUnavailable()
  }

  const assertTextContentSafe = async (content, scope) => {
    const text = typeof content === 'string' ? content.trim() : ''
    if (!text) return
    const api = cloud.openapi?.security?.msgSecCheck
    if (typeof api !== 'function') {
      logSecurityResult(scope, {}, CONTENT_SECURITY_UNAVAILABLE)
      throw contentSecurityUnavailable()
    }
    try {
      const res = await withSecurityTimeout(api({
        openid: openId,
        scene: SECURITY_SCENE,
        version: SECURITY_VERSION,
        content: text
      }))
      assertSecurityPassed(res, scope)
    } catch (err) {
      normalizeSecurityError(err, scope)
    }
  }

  const imageContentType = fileId => {
    const lower = String(fileId || '').toLowerCase()
    if (lower.includes('.png')) return 'image/png'
    if (lower.includes('.gif')) return 'image/gif'
    if (lower.includes('.webp')) return 'image/webp'
    return 'image/jpeg'
  }

  const assertImageContentSafe = async (fileId) => {
    if (typeof fileId !== 'string' || !fileId.startsWith('cloud://')) {
      logSecurityResult('recordImage', {}, CONTENT_SECURITY_UNAVAILABLE)
      throw contentSecurityUnavailable()
    }
    const api = cloud.openapi?.security?.imgSecCheck
    if (typeof api !== 'function') {
      logSecurityResult('recordImage', {}, CONTENT_SECURITY_UNAVAILABLE)
      throw contentSecurityUnavailable()
    }
    try {
      const file = await withSecurityTimeout(cloud.downloadFile({ fileID: fileId }))
      if (!file?.fileContent) {
        logSecurityResult('recordImage', {}, CONTENT_SECURITY_UNAVAILABLE)
        throw contentSecurityUnavailable()
      }
      const res = await withSecurityTimeout(api({
        media: {
          contentType: imageContentType(fileId),
          value: file.fileContent
        }
      }))
      assertSecurityPassed(res, 'recordImage')
    } catch (err) {
      normalizeSecurityError(err, 'recordImage')
    }
  }

  const assertRecordContentSafe = async ({ remark, images }) => {
    await Promise.all([
      assertTextContentSafe(remark, 'recordRemark'),
      Promise.all((images || []).map(assertImageContentSafe))
    ])
  }

  const getBook = async (id) => {
    if (!id) return null
    const res = await db.collection(collectionName('books')).doc(id).get()
    return res.data || null
  }

  const isBookMember = (book) => {
    return !!book && (book.ownerId === openId || (book.memberIds || []).includes(openId))
  }

  const assertBookMember = async (id) => {
    const book = await getBook(id)
    if (!isBookMember(book)) {
      throw new Error('permission denied')
    }
    return book
  }

  const assertBookIsWritable = (book) => {
    if (book.joinTargetBookId || book.joinMigration) {
      throw new Error('账本正在合并，请稍后再试')
    }
    return book
  }

  const assertBookWritable = async (id) => {
    const book = await assertBookMember(id)
    return assertBookIsWritable(book)
  }

  const assertCategoryInBook = async (categoryId, targetBookId, type) => {
    if (!categoryId) {
      throw new Error('invalid category')
    }
    const res = await db.collection(collectionName('categories')).doc(categoryId).get()
    const category = res.data
    if (!category || category.bookId !== targetBookId || (type && category.type !== type)) {
      throw new Error('invalid category')
    }
    return category
  }

  const getAll = async query => {
    const result = []
    let offset = 0
    while (true) {
      const batch = await query.skip(offset).limit(PAGE_SIZE).get()
      result.push(...batch.data)
      if (batch.data.length < PAGE_SIZE) return result
      offset += batch.data.length
    }
  }

  const monthRange = month => {
    const [year, monthNumber] = month.split('-').map(Number)
    return {
      startDate: new Date(Date.UTC(year, monthNumber - 1, 1)),
      endDate: new Date(Date.UTC(year, monthNumber, 1))
    }
  }

  const prepareBudgetAlert = async (category, amount, date) => {
    const month = typeof date === 'string'
      ? date.slice(0, 7)
      : new Date(date).toISOString().slice(0, 7)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null

    const budgetResult = await db.collection(collectionName('budgets'))
      .where({ bookId, month })
      .limit(1)
      .get()
    const budget = budgetResult.data[0]
    if (!budget) return null

    const { startDate, endDate } = monthRange(month)
    const [records, categories] = await Promise.all([
      getAll(db.collection(collectionName('records')).where({
        bookId,
        type: 'expense',
        date: _.gte(startDate).and(_.lt(endDate))
      })),
      getAll(db.collection(collectionName('categories')).where({ bookId }))
    ])
    const categoryMap = new Map(categories.map(item => [item._id, item]))
    const bigCategoryId = category.parentId || category._id
    const previousTotal = records.reduce((sum, record) => sum + record.amount, 0)
    const previousCategory = records.reduce((sum, record) => {
      const recordCategory = categoryMap.get(record.categoryId)
      const recordBigId = recordCategory?.parentId || recordCategory?._id
      return recordBigId === bigCategoryId ? sum + record.amount : sum
    }, 0)
    const categoryLimit = (budget.categoryLimits || [])
      .find(limit => limit.categoryId === bigCategoryId)

    return selectBudgetAlert({
      previousTotal,
      nextTotal: previousTotal + amount,
      totalLimit: budget.totalAmount,
      previousCategory,
      nextCategory: previousCategory + amount,
      categoryLimit
    })
  }

  const assertRecordType = (type) => {
    if (!VALID_RECORD_TYPES.has(type)) {
      throw new Error('invalid type')
    }
    return type
  }

  const assertPositiveAmount = (amount) => {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('amount must be a positive integer')
    }
    return amount
  }

  const normalizeRecordDate = (value) => {
    if (!value) {
      throw new Error('date is required')
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new Error('date is invalid')
    }
    return date
  }

  const normalizeImages = (images) => {
    if (images === undefined) return undefined
    if (!Array.isArray(images)) {
      throw new Error('images must be an array')
    }
    if (images.length > 9) {
      throw new Error('images cannot exceed 9')
    }
    if (images.some(item => typeof item !== 'string')) {
      throw new Error('images must be string file IDs')
    }
    return images
  }

  const canModifyRecord = (record, book) => {
    return record.createdBy === openId || book.ownerId === openId
  }

  const getAuthorizedRecord = async ({ requireWritable = false, requireModifier = false } = {}) => {
    if (!recordId) {
      throw new Error('recordId is required')
    }
    if (!bookId) {
      throw new Error('bookId is required')
    }
    const recordRes = await db.collection(collectionName('records')).doc(recordId).get()
    const record = recordRes.data
    if (!record || record.bookId !== bookId) {
      throw new Error('record not found')
    }
    const book = await assertBookMember(record.bookId)
    if (requireWritable) {
      assertBookIsWritable(book)
    }
    const canModify = canModifyRecord(record, book)
    if (requireModifier && !canModify) {
      throw new Error('permission denied')
    }
    return { record, book, canModify }
  }

  try {
    switch (action) {
      case 'add': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookWritable(bookId)
        if (!data.type || !data.amount || !data.categoryId || !data.date) {
          return { success: false, error: 'Missing required fields: type, amount, categoryId, date' }
        }
        const type = assertRecordType(data.type)
        const amount = assertPositiveAmount(data.amount)
        const date = normalizeRecordDate(data.date)
        const images = data.images === undefined ? [] : normalizeImages(data.images)
        const category = await assertCategoryInBook(data.categoryId, bookId, type)
        await assertRecordContentSafe({ remark: data.remark || '', images })
        let budgetAlert = null
        if (type === 'expense') {
          try {
            budgetAlert = await prepareBudgetAlert(category, amount, date)
          } catch (budgetError) {
            console.error('prepare budget alert failed:', budgetError)
          }
        }

        const { _id } = await db.collection(collectionName('records')).add({
          data: {
            bookId,
            type,
            amount,
            categoryId: data.categoryId,
            date,
            remark: data.remark || '',
            images,
            createdBy: openId,
            createdByName: data.nickName || '未知',
            createdAt: db.serverDate(),
            updatedBy: openId,
            updatedByName: data.nickName || '未知',
            updatedAt: db.serverDate()
          }
        })
        return { success: true, recordId: _id, budgetAlert }
      }

      case 'batchCreate': {
        // 语音快速记账批量写入：预校验 + 幂等 + 逐条写入 + 失败补偿删除
        const { requestId, items } = data
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        if (!requestId || typeof requestId !== 'string') {
          return { success: false, error: 'requestId is required' }
        }
        if (!Array.isArray(items) || items.length === 0) {
          return { success: false, error: 'items must be a non-empty array' }
        }
        if (items.length > BATCH_CREATE_MAX_ITEMS) {
          return { success: false, error: `items cannot exceed ${BATCH_CREATE_MAX_ITEMS}` }
        }

        // 1. 幂等检查：按 voiceRequestId 查询已处理请求
        //    best-effort：集合未创建时降级为不做幂等、直接写入（与 mark processing/completed 的 non-fatal 策略保持一致）
        let existing = null
        try {
          const existingRes = await db.collection(collectionName('voiceRequests')).where({
            openId,
            requestId
          }).limit(1).get()
          existing = existingRes.data[0]
        } catch (idempotencyErr) {
          console.warn('voiceRequests idempotency query failed (non-fatal):', idempotencyErr.message)
        }
        if (existing && existing.status === 'completed') {
          return {
            success: true,
            recordIds: existing.recordIds || [],
            budgetAlerts: existing.budgetAlerts || [],
            duplicate: true
          }
        }
        if (existing && existing.status === 'processing') {
          return { success: false, error: 'request is being processed', errorCode: 'DUPLICATE_REQUEST' }
        }

        // 2. 全量预校验：账本可写、每条 item 字段/分类/内容安全
        await assertBookWritable(bookId)
        const validatedItems = []
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (!item.itemId || typeof item.itemId !== 'string') {
            return { success: false, error: `items[${i}].itemId is required` }
          }
          if (!item.type || !item.amount || !item.categoryId || !item.date) {
            return { success: false, error: `items[${i}] missing required fields`, failedItemIndex: i }
          }
          const type = assertRecordType(item.type)
          const amount = assertPositiveAmount(item.amount)
          const date = normalizeRecordDate(item.date)
          const images = item.images === undefined ? [] : normalizeImages(item.images)
          const category = await assertCategoryInBook(item.categoryId, bookId, type)
          await assertRecordContentSafe({ remark: item.remark || '', images })
          validatedItems.push({ item, type, amount, date, images, category })
        }

        // 3. 标记 processing（best-effort，集合不存在则跳过）
        try {
          await db.collection(collectionName('voiceRequests')).add({
            data: {
              openId,
              requestId,
              status: 'processing',
              createdAt: db.serverDate()
            }
          })
        } catch (markErr) {
          console.warn('mark processing failed (non-fatal):', markErr.message)
        }

        // 4. 逐条写入 + 失败补偿删除
        const recordIds = []
        const budgetAlerts = []
        const voiceRequestId = requestId
        for (const validated of validatedItems) {
          const { item, type, amount, date, images, category } = validated
          let budgetAlert = null
          if (type === 'expense') {
            try {
              budgetAlert = await prepareBudgetAlert(category, amount, date)
            } catch (budgetError) {
              console.error('prepare budget alert failed:', budgetError)
            }
          }
          let newId
          try {
            const addRes = await db.collection(collectionName('records')).add({
              data: {
                bookId,
                type,
                amount,
                categoryId: item.categoryId,
                date,
                remark: item.remark || '',
                images,
                source: 'voice',
                voiceRequestId,
                voiceItemId: item.itemId,
                createdBy: openId,
                createdByName: data.nickName || '未知',
                createdAt: db.serverDate(),
                updatedBy: openId,
                updatedByName: data.nickName || '未知',
                updatedAt: db.serverDate()
              }
            })
            newId = addRes._id
            recordIds.push(newId)
            budgetAlerts.push(budgetAlert)
          } catch (writeErr) {
            // 失败补偿删除：回滚已写入的记录
            console.error('batchCreate write failed at index', recordIds.length, writeErr)
            const orphanIds = []
            for (const rollbackId of recordIds) {
              try {
                await db.collection(collectionName('records')).doc(rollbackId).remove()
              } catch (rollbackErr) {
                orphanIds.push(rollbackId)
                console.error('compensate delete failed for', rollbackId, rollbackErr)
              }
            }
            // 更新请求状态为 failed
            try {
              await db.collection(collectionName('voiceRequests')).where({ openId, requestId }).update({
                data: { status: 'failed', failedAt: recordIds.length, orphanIds, updatedAt: db.serverDate() }
              })
            } catch (updateErr) {
              console.warn('update voiceRequests failed (non-fatal):', updateErr.message)
            }
            if (orphanIds.length > 0) {
              return {
                success: false,
                error: '批量写入失败，部分记录需要人工核对',
                errorCode: 'PARTIAL_ROLLBACK_INCOMPLETE',
                orphanIds
              }
            }
            return {
              success: false,
              error: '批量写入失败，已回滚全部记录',
              errorCode: 'BATCH_ROLLED_BACK'
            }
          }
        }

        // 5. 标记 completed
        try {
          await db.collection(collectionName('voiceRequests')).where({ openId, requestId }).update({
            data: { status: 'completed', recordIds, budgetAlerts, updatedAt: db.serverDate() }
          })
        } catch (updateErr) {
          console.warn('mark completed failed (non-fatal):', updateErr.message)
        }

        return { success: true, recordIds, budgetAlerts }
      }

      case 'get': {
        const { record, canModify } = await getAuthorizedRecord()
        return { success: true, record, canModify }
      }

      case 'list': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookMember(bookId)

        const { month } = data
        if (!month) {
          return { success: false, error: 'month is required' }
        }
        const startDate = new Date(`${month}-01`)
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1)

        const records = await db.collection(collectionName('records'))
          .where({
            bookId,
            date: _.gte(startDate).and(_.lt(endDate))
          })
          .orderBy('date', 'desc')
          .orderBy('createdAt', 'desc')
          .limit(500)
          .get()
        return { success: true, records: records.data }
      }

      case 'countByCategory': {
        const { categoryId } = data
        if (!bookId || !categoryId) {
          return { success: false, error: 'bookId and categoryId are required' }
        }
        await assertBookMember(bookId)
        const result = await db.collection(collectionName('records'))
          .where({ bookId, categoryId })
          .count()
        return { success: true, count: result.total }
      }

      case 'update': {
        const { record } = await getAuthorizedRecord({ requireWritable: true, requireModifier: true })
        const nextType = data.type !== undefined ? assertRecordType(data.type) : assertRecordType(record.type)
        const nextAmount = data.amount !== undefined ? assertPositiveAmount(data.amount) : assertPositiveAmount(record.amount)
        const nextCategoryId = data.categoryId !== undefined ? data.categoryId : record.categoryId
        await assertCategoryInBook(nextCategoryId, record.bookId, nextType)
        const nextRemark = data.remark !== undefined ? data.remark : record.remark
        const nextImages = data.images !== undefined ? normalizeImages(data.images) : normalizeImages(record.images || [])

        const updateData = {}
        if (data.type !== undefined) updateData.type = nextType
        if (data.amount !== undefined) updateData.amount = nextAmount
        if (data.categoryId !== undefined) updateData.categoryId = data.categoryId
        if (data.date !== undefined) updateData.date = normalizeRecordDate(data.date)
        if (data.remark !== undefined) updateData.remark = nextRemark
        if (data.images !== undefined) updateData.images = nextImages
        if (Object.keys(updateData).length === 0) {
          return { success: false, error: 'no fields to update' }
        }
        await assertRecordContentSafe({ remark: nextRemark || '', images: nextImages || [] })

        await db.collection(collectionName('records')).doc(recordId).update({
          data: {
            ...updateData,
            updatedBy: openId,
            updatedByName: data.nickName || '',
            updatedAt: db.serverDate()
          }
        })
        return { success: true }
      }

      case 'delete': {
        await getAuthorizedRecord({ requireWritable: true, requireModifier: true })
        await db.collection(collectionName('records')).doc(recordId).remove()
        return { success: true }
      }

      case 'updateCreatedByName': {
        const { nickName } = data
        if (!openId || !nickName) {
          return { success: false, error: 'openId and nickName are required' }
        }
        const result = await db.collection(collectionName('records'))
          .where({ createdBy: openId })
          .update({ data: { createdByName: nickName, updatedAt: db.serverDate() } })
        return { success: true, updatedCount: result.stats.updated }
      }

      case 'getFileUrl': {
        const fileList = event.fileList || []
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookMember(bookId)
        if (fileList.length === 0) {
          return { success: false, error: 'fileList is required' }
        }
        const res = await cloud.getTempFileURL({ fileList })
        return { success: true, fileList: res.fileList }
      }

      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('record cloud function error:', err)
    return { success: false, error: err.message, errorCode: err.errorCode }
  }
}
