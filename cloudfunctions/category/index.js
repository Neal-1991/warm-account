// cloudfunctions/category/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const PAGE_SIZE = 100
const SECURITY_SCENE = 2
const SECURITY_VERSION = 2
const SECURITY_TIMEOUT_MS = 8000
const CONTENT_SECURITY_REJECTED = 'CONTENT_SECURITY_REJECTED'
const CONTENT_SECURITY_UNAVAILABLE = 'CONTENT_SECURITY_UNAVAILABLE'
const CONTENT_SECURITY_REJECTED_MESSAGE = '内容含违规信息，请修改后再试'
const CONTENT_SECURITY_UNAVAILABLE_MESSAGE = '内容安全检测暂不可用，请稍后再试'

const currentBeijingMonth = (now = new Date()) => {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 7)
}

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

const DEFAULT_ICON_KEY = 'icon_tag_default'
const SEMANTIC_ICON_KEYS = new Set([
  'icon_bowl_chopsticks',
  'icon_vehicle',
  'icon_cart',
  'icon_house',
  'icon_phone_bill',
  'icon_baby_smile',
  'icon_beauty',
  'icon_clothes',
  'icon_gamepad',
  'icon_dumbbell',
  'icon_plane',
  'icon_pet_paw',
  'icon_medical',
  'icon_gift_social',
  'icon_book',
  'icon_bolt_bill',
  'icon_grocery_bag',
  'icon_cup',
  'icon_shield_check',
  'icon_camera',
  'icon_house_debt',
  'icon_phone',
  'icon_wrench',
  'icon_subscription',
  'icon_salary_card',
  'icon_award_money',
  'icon_house_savings',
  'icon_growth_money',
  'icon_briefcase_clock',
  'icon_red_packet_money',
  'icon_receipt_return',
  'icon_recycle_money',
  'icon_wallet_refund',
  DEFAULT_ICON_KEY
])
const ICON_ALIASES = {
  category_default: DEFAULT_ICON_KEY,
  expense_food: 'icon_bowl_chopsticks',
  expense_transport: 'icon_vehicle',
  expense_shopping: 'icon_cart',
  expense_housing: 'icon_house',
  expense_communication: 'icon_phone_bill',
  expense_childcare: 'icon_baby_smile',
  expense_beauty: 'icon_beauty',
  expense_clothing: 'icon_clothes',
  expense_entertainment: 'icon_gamepad',
  expense_fitness: 'icon_dumbbell',
  expense_travel: 'icon_plane',
  expense_pet: 'icon_pet_paw',
  expense_medical: 'icon_medical',
  expense_social: 'icon_gift_social',
  expense_education: 'icon_book',
  expense_other: DEFAULT_ICON_KEY,
  income_salary: 'icon_salary_card',
  income_bonus: 'icon_award_money',
  income_housing_fund: 'icon_house_savings',
  income_investment: 'icon_growth_money',
  income_side_job: 'icon_briefcase_clock',
  income_gift: 'icon_red_packet_money',
  income_other: DEFAULT_ICON_KEY
}

const normalizeCategoryIconKey = (value) => {
  const key = typeof value === 'string' ? value.trim() : ''
  if (!key) return ''
  if (SEMANTIC_ICON_KEYS.has(key)) return key
  const alias = ICON_ALIASES[key]
  return SEMANTIC_ICON_KEYS.has(alias) ? alias : ''
}

exports.main = async (event, context) => {
  const { action, bookId, name, parentId, categoryId, type, icon, iconKey } = event
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

  const getBook = async (id) => {
    if (!id) return null
    const res = await db.collection(collectionName('books')).doc(id).get()
    return res.data || null
  }

  const assertBookMember = async (id) => {
    const book = await getBook(id)
    if (!book || (book.ownerId !== openId && !(book.memberIds || []).includes(openId))) {
      throw new Error('permission denied')
    }
    return book
  }

  const assertBookWritable = async (id) => {
    const book = await assertBookMember(id)
    if (book.joinTargetBookId || book.joinMigration) {
      throw new Error('账本正在合并，请稍后再试')
    }
    return book
  }

  const getCategoryInBook = async (id, targetBookId) => {
    const res = await db.collection(collectionName('categories')).doc(id).get()
    const cat = res.data
    if (!cat || cat.bookId !== targetBookId) {
      throw new Error('permission denied')
    }
    return cat
  }

  const assertMergeTarget = async (sourceCat, mergeTargetId) => {
    const target = await getCategoryInBook(mergeTargetId, sourceCat.bookId)
    const isParent = target._id === sourceCat.parentId && target.parentId === null
    const isSibling = target.parentId === sourceCat.parentId
    if (!isParent && !isSibling) {
      throw new Error('invalid merge target')
    }
    if (target.type !== sourceCat.type) {
      throw new Error('invalid merge target')
    }
    return target
  }

  const getAllCategories = async whereCondition => {
    const result = []
    let offset = 0
    while (true) {
      const batch = await db.collection(collectionName('categories'))
        .where(whereCondition)
        .orderBy('order', 'asc')
        .skip(offset)
        .limit(PAGE_SIZE)
        .get()
      result.push(...batch.data)
      if (batch.data.length < PAGE_SIZE) return result
      offset += batch.data.length
    }
  }

  const nextCategoryOrder = async whereCondition => {
    const result = await db.collection(collectionName('categories'))
      .where(whereCondition)
      .orderBy('order', 'desc')
      .limit(1)
      .get()
    const currentMax = Number(result.data[0]?.order)
    return Number.isFinite(currentMax) ? currentMax + 1 : 1
  }

  const assertExactOrderedIds = (categories, orderedIds) => {
    if (!Array.isArray(orderedIds) || orderedIds.length !== categories.length) {
      throw new Error('orderedIds must cover all categories')
    }
    const expectedIds = new Set(categories.map(category => category._id))
    const seenIds = new Set()
    for (const id of orderedIds) {
      if (!expectedIds.has(id) || seenIds.has(id)) {
        throw new Error('orderedIds must cover all categories')
      }
      seenIds.add(id)
    }
  }

  try {
    switch (action) {
      case 'list': {
        if (!bookId) {
          return { success: false, error: 'bookId is required' }
        }
        await assertBookMember(bookId)
        const whereCondition = { bookId }
        if (type) whereCondition.type = type
        const categories = []
        let offset = 0
        while (true) {
          const batch = await db.collection(collectionName('categories'))
            .where(whereCondition)
            .orderBy('order', 'asc')
            .skip(offset)
            .limit(PAGE_SIZE)
            .get()
          categories.push(...batch.data)
          if (batch.data.length < PAGE_SIZE) {
            break
          }
          offset += batch.data.length
        }
        return { success: true, categories }
      }

      case 'addBig': {
        if (!name || !bookId) {
          return { success: false, error: 'name and bookId are required' }
        }
        await assertBookWritable(bookId)
        if (!type || !['expense', 'income'].includes(type)) {
          return { success: false, error: 'type must be expense or income' }
        }

        const trimmedName = name.trim()
        await assertTextContentSafe(trimmedName, 'categoryName')
        const existing = await db.collection(collectionName('categories'))
          .where({ bookId, parentId: null, name: trimmedName, type })
          .get()
        if (existing.data.length > 0) {
          return { success: false, error: '同名大类已存在' }
        }

        const bigOrder = await nextCategoryOrder({ bookId, parentId: null, type })
        const { _id } = await db.collection(collectionName('categories')).add({
          data: {
            name: trimmedName,
            icon: icon || '',
            iconKey: normalizeCategoryIconKey(iconKey) || DEFAULT_ICON_KEY,
            order: bigOrder,
            type,
            isVisible: true,
            isSystem: false,
            parentId: null,
            bookId
          }
        })

        await db.collection(collectionName('categories')).add({
          data: {
            name: '其他',
            icon: '',
            order: 1,
            type,
            isVisible: true,
            isSystem: false,
            parentId: _id,
            bookId
          }
        })
        return { success: true, categoryId: _id }
      }

      case 'addChild': {
        if (!name || !parentId || !bookId) {
          return { success: false, error: 'name, parentId and bookId are required' }
        }
        await assertBookWritable(bookId)
        const parent = await getCategoryInBook(parentId, bookId)
        if (parent.parentId !== null) {
          return { success: false, error: 'parentId must be a big category' }
        }

        const trimmedName = name.trim()
        await assertTextContentSafe(trimmedName, 'categoryName')
        const existing = await db.collection(collectionName('categories'))
          .where({ bookId, parentId, name: trimmedName })
          .get()
        if (existing.data.length > 0) {
          return { success: false, error: '同名小类已存在' }
        }

        const childOrder = await nextCategoryOrder({ bookId, parentId })
        const { _id } = await db.collection(collectionName('categories')).add({
          data: {
            name: trimmedName,
            icon: '',
            order: childOrder,
            type: parent.type || type || 'expense',
            isVisible: true,
            isSystem: false,
            parentId,
            bookId
          }
        })
        return { success: true, categoryId: _id }
      }

      case 'reorderBig': {
        if (!bookId || !type || !['expense', 'income'].includes(type)) {
          return { success: false, error: 'bookId and valid type are required' }
        }
        await assertBookWritable(bookId)
        const categories = await getAllCategories({ bookId, parentId: null, type })
        assertExactOrderedIds(categories, event.orderedIds)

        for (let index = 0; index < event.orderedIds.length; index += 1) {
          await db.collection(collectionName('categories')).doc(event.orderedIds[index]).update({
            data: { order: index + 1 }
          })
        }
        return { success: true }
      }

      case 'reorderChildren': {
        if (!bookId || !parentId) {
          return { success: false, error: 'bookId and parentId are required' }
        }
        await assertBookWritable(bookId)
        const parent = await getCategoryInBook(parentId, bookId)
        if (parent.parentId !== null) {
          return { success: false, error: 'parentId must be a big category' }
        }
        const categories = await getAllCategories({ bookId, parentId })
        assertExactOrderedIds(categories, event.orderedIds)

        for (let index = 0; index < event.orderedIds.length; index += 1) {
          await db.collection(collectionName('categories')).doc(event.orderedIds[index]).update({
            data: { order: index + 1 }
          })
        }
        return { success: true }
      }

      case 'rename': {
        if (!categoryId || !bookId) {
          return { success: false, error: 'categoryId and bookId are required' }
        }
        await assertBookWritable(bookId)
        const cat = await getCategoryInBook(categoryId, bookId)

        const updateData = {}
        if (name !== undefined && name.trim()) updateData.name = name.trim()
        if (icon !== undefined) updateData.icon = icon
        if (iconKey !== undefined) updateData.iconKey = normalizeCategoryIconKey(iconKey) || DEFAULT_ICON_KEY
        if (Object.keys(updateData).length === 0) {
          return { success: false, error: 'name, icon or iconKey is required' }
        }

        if (updateData.name) {
          await assertTextContentSafe(updateData.name, 'categoryName')
          const dupWhere = {
            bookId,
            parentId: cat.parentId || null,
            name: updateData.name,
            type: cat.type
          }
          const dup = await db.collection(collectionName('categories')).where(dupWhere).get()
          if (dup.data.some(item => item._id !== categoryId)) {
            return { success: false, error: '同名分类已存在' }
          }
        }

        await db.collection(collectionName('categories')).doc(categoryId).update({
          data: updateData
        })
        return { success: true }
      }

      case 'deleteChild': {
        if (!categoryId || !bookId) {
          return { success: false, error: 'categoryId and bookId are required' }
        }
        await assertBookWritable(bookId)
        const cat = await getCategoryInBook(categoryId, bookId)
        if (cat.parentId === null) {
          return { success: false, error: 'please use deleteBig for big categories' }
        }

        const { total } = await db.collection(collectionName('records'))
          .where({ bookId, categoryId })
          .count()

        if (total > 0) {
          const mergeTargetId = event.mergeTargetId
          if (!mergeTargetId) {
            return { success: false, error: 'category has records', recordCount: total }
          }
          await assertMergeTarget(cat, mergeTargetId)

          const batchSize = 100
          for (let i = 0; i <= total; i += batchSize) {
            const batch = await db.collection(collectionName('records'))
              .where({ bookId, categoryId })
              .limit(batchSize)
              .get()
            if (batch.data.length === 0) break
            for (const rec of batch.data) {
              await db.collection(collectionName('records')).doc(rec._id).update({
                data: { categoryId: mergeTargetId, updatedAt: db.serverDate() }
              })
            }
          }
        }

        await db.collection(collectionName('categories')).doc(categoryId).remove()
        return { success: true, mergedRecords: total }
      }

      case 'deleteBig': {
        if (!categoryId || !bookId) {
          return { success: false, error: 'categoryId and bookId are required' }
        }
        await assertBookWritable(bookId)
        const cat = await getCategoryInBook(categoryId, bookId)
        if (cat.isSystem) {
          return { success: false, error: '系统预设大类不可删除' }
        }
        if (cat.parentId !== null) {
          return { success: false, error: 'please use deleteChild for child categories' }
        }

        const activeBudgetCount = await db.collection(collectionName('budgets'))
          .where({
            bookId,
            categoryIds: categoryId,
            month: _.gte(currentBeijingMonth())
          })
          .count()
        if (activeBudgetCount.total > 0) {
          return {
            success: false,
            error: '该大类已被当前或未来预算使用，请先调整预算',
            budgetCount: activeBudgetCount.total
          }
        }

        const children = await db.collection(collectionName('categories'))
          .where({ bookId, parentId: categoryId })
          .get()
        const childIds = children.data.map(child => child._id)

        const directCount = await db.collection(collectionName('records'))
          .where({ bookId, categoryId })
          .count()
        let childCount = { total: 0 }
        if (childIds.length > 0) {
          childCount = await db.collection(collectionName('records'))
            .where({ bookId, categoryId: _.in(childIds) })
            .count()
        }

        const totalRecords = directCount.total + childCount.total
        if (totalRecords > 0) {
          return {
            success: false,
            error: '该大类或子类下有记录，请先迁移记录',
            recordCount: totalRecords
          }
        }

        for (const child of children.data) {
          await db.collection(collectionName('categories')).doc(child._id).remove()
        }
        await db.collection(collectionName('categories')).doc(categoryId).remove()
        return { success: true, deletedChildren: children.data.length }
      }

      case 'hide': {
        if (!categoryId || !bookId) {
          return { success: false, error: 'categoryId and bookId are required' }
        }
        await assertBookWritable(bookId)
        await getCategoryInBook(categoryId, bookId)
        await db.collection(collectionName('categories')).doc(categoryId).update({
          data: { isVisible: false }
        })
        return { success: true }
      }

      case 'migrate': {
        const migrationOpenId = openId || event.openId
        if (!migrationOpenId) {
          return { success: false, error: 'openId is required for migration' }
        }
        const ownedBooks = await db.collection(collectionName('books'))
          .where({ ownerId: migrationOpenId })
          .get()
        const memberBooks = await db.collection(collectionName('books'))
          .where({ memberIds: migrationOpenId })
          .get()
        const allBooks = [...ownedBooks.data, ...memberBooks.data]
        if (allBooks.length === 0) {
          return { success: true, message: 'no book to migrate' }
        }

        const results = []
        for (const book of allBooks) {
          const existingBig = await db.collection(collectionName('categories'))
            .where({ bookId: book._id, parentId: null })
            .limit(1)
            .get()
          if (existingBig.data.length > 0) {
            results.push({ bookId: book._id, status: 'skipped', reason: 'already migrated' })
            continue
          }

          const systemBigs = await db.collection(collectionName('categories'))
            .where({ bookId: null, parentId: null })
            .get()
          const idMap = {}

          for (const big of systemBigs.data) {
            const { _id } = await db.collection(collectionName('categories')).add({
              data: {
                name: big.name,
                icon: big.icon,
                iconKey: normalizeCategoryIconKey(big.iconKey) || normalizeCategoryIconKey(big.presetKey) || DEFAULT_ICON_KEY,
                order: big.order,
                type: big.type,
                presetKey: big.presetKey || '',
                isVisible: big.isVisible !== false,
                isSystem: true,
                parentId: null,
                bookId: book._id
              }
            })
            idMap[big._id] = _id
          }

          const children = await db.collection(collectionName('categories'))
            .where({ bookId: book._id, parentId: _.neq(null) })
            .get()
          for (const child of children.data) {
            const newParentId = idMap[child.parentId]
            if (newParentId) {
              await db.collection(collectionName('categories')).doc(child._id).update({
                data: { parentId: newParentId }
              })
            }
          }

          for (const [oldId, newId] of Object.entries(idMap)) {
            const { total } = await db.collection(collectionName('records'))
              .where({ bookId: book._id, categoryId: oldId })
              .count()
            if (total === 0) continue
            for (let i = 0; i <= total; i += 100) {
              const batch = await db.collection(collectionName('records'))
                .where({ bookId: book._id, categoryId: oldId })
                .limit(100)
                .get()
              if (batch.data.length === 0) break
              for (const rec of batch.data) {
                await db.collection(collectionName('records')).doc(rec._id).update({
                  data: { categoryId: newId, updatedAt: db.serverDate() }
                })
              }
            }
          }
          results.push({ bookId: book._id, status: 'migrated', categoryCount: Object.keys(idMap).length })
        }
        return { success: true, results }
      }

      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (err) {
    console.error('category cloud function error:', err)
    return { success: false, error: err.message, errorCode: err.errorCode }
  }
}
