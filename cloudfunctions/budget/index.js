const cloud = require('wx-server-sdk')
const {
  BUDGET_ERROR_CODES,
  isValidMonth,
  currentBeijingMonth,
  previousMonth,
  monthRange,
  aggregateBudgetUsage
} = require('./budget-utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const PAGE_SIZE = 100

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

async function getAll(query) {
  const result = []
  let offset = 0
  while (true) {
    const batch = await query.skip(offset).limit(PAGE_SIZE).get()
    result.push(...batch.data)
    if (batch.data.length < PAGE_SIZE) return result
    offset += batch.data.length
  }
}

exports.main = async (event) => {
  const { action, bookId, month } = event
  const collectionName = name => getCollectionName(event, name)
  const openId = cloud.getWXContext().OPENID

  const getBook = async () => {
    if (!bookId) throw new Error('bookId is required')
    const result = await db.collection(collectionName('books')).doc(bookId).get()
    const book = result.data
    if (!book || (book.ownerId !== openId && !(book.memberIds || []).includes(openId))) {
      throw new Error('permission denied')
    }
    return book
  }

  const assertOwnerWritable = async () => {
    const book = await getBook()
    if (book.ownerId !== openId) {
      throw new Error('permission denied')
    }
    if (book.joinTargetBookId || book.joinMigration) {
      throw new Error('账本正在合并，请稍后再试')
    }
    if (!isValidMonth(month)) {
      throw new Error('invalid month')
    }
    if (month < currentBeijingMonth()) {
      throw new Error('历史月份预算不可修改')
    }
    return book
  }

  const getBudget = async targetMonth => {
    const result = await db.collection(collectionName('budgets'))
      .where({ bookId, month: targetMonth })
      .limit(1)
      .get()
    return result.data[0] || null
  }

  const getCategories = () => getAll(
    db.collection(collectionName('categories')).where({ bookId })
  )

  const normalizeCategoryLimits = async limits => {
    if (!Array.isArray(limits)) {
      throw new Error('categoryLimits must be an array')
    }
    const categories = await getCategories()
    const categoryMap = new Map(categories.map(category => [category._id, category]))
    const seen = new Set()

    return limits.map(limit => {
      const category = categoryMap.get(limit.categoryId)
      if (!category || category.type !== 'expense' || category.parentId !== null) {
        throw new Error('分类预算只能选择当前账本的支出大类')
      }
      if (seen.has(category._id)) {
        throw new Error('分类预算不可重复')
      }
      if (!Number.isInteger(limit.amount) || limit.amount <= 0) {
        throw new Error('分类预算金额必须为正整数分')
      }
      seen.add(category._id)
      return {
        categoryId: category._id,
        amount: limit.amount,
        name: category.name,
        icon: category.icon || ''
      }
    })
  }

  const saveBudget = async (totalAmount, categoryLimits, source = 'manual') => {
    if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
      throw new Error('总预算金额必须为正整数分')
    }
    const normalizedLimits = await normalizeCategoryLimits(categoryLimits)
    const existing = await getBudget(month)
    const data = {
      bookId,
      month,
      totalAmount,
      categoryLimits: normalizedLimits,
      categoryIds: normalizedLimits.map(limit => limit.categoryId),
      updatedBy: openId,
      updatedAt: db.serverDate(),
      source
    }

    if (existing) {
      await db.collection(collectionName('budgets')).doc(existing._id).update({ data })
      return existing._id
    }

    const result = await db.collection(collectionName('budgets')).add({
      data: {
        ...data,
        createdBy: openId,
        createdAt: db.serverDate()
      }
    })
    return result._id
  }

  try {
    if (!isValidMonth(month)) {
      return { success: false, error: 'invalid month' }
    }

    switch (action) {
      case 'getMonth': {
        const book = await getBook()
        const budget = await getBudget(month)
        const canEdit = book.ownerId === openId &&
          month >= currentBeijingMonth() &&
          !book.joinTargetBookId &&
          !book.joinMigration
        const isHistorical = month < currentBeijingMonth()
        if (!budget) {
          return {
            success: true,
            budget: null,
            usage: null,
            canEdit,
            isHistorical
          }
        }

        const { startDate, endDate } = monthRange(month)
        const [categories, records] = await Promise.all([
          getCategories(),
          getAll(
            db.collection(collectionName('records')).where({
              bookId,
              type: 'expense',
              date: _.gte(startDate).and(_.lt(endDate))
            })
          )
        ])
        return {
          success: true,
          budget,
          usage: aggregateBudgetUsage(records, categories, budget),
          canEdit,
          isHistorical
        }
      }

      case 'save': {
        await assertOwnerWritable()
        const budgetId = await saveBudget(event.totalAmount, event.categoryLimits || [])
        return { success: true, budgetId }
      }

      case 'copyPrevious': {
        await assertOwnerWritable()
        if (await getBudget(month)) {
          return { success: false, error: '目标月份已设置预算' }
        }
        const sourceMonth = previousMonth(month)
        const sourceBudget = await getBudget(sourceMonth)
        if (!sourceBudget) {
          return {
            success: false,
            error: '上月未设置预算',
            errorCode: BUDGET_ERROR_CODES.PREVIOUS_BUDGET_NOT_FOUND
          }
        }
        const categories = await getCategories()
        const validIds = new Set(categories
          .filter(category => category.type === 'expense' && category.parentId === null)
          .map(category => category._id))
        const validLimits = (sourceBudget.categoryLimits || [])
          .filter(limit => validIds.has(limit.categoryId))
        const budgetId = await saveBudget(
          sourceBudget.totalAmount,
          validLimits,
          'copied'
        )
        return {
          success: true,
          budgetId,
          copiedFrom: sourceMonth,
          skippedCategoryCount: (sourceBudget.categoryLimits || []).length - validLimits.length
        }
      }

      case 'remove': {
        await assertOwnerWritable()
        const budget = await getBudget(month)
        if (budget) {
          await db.collection(collectionName('budgets')).doc(budget._id).remove()
        }
        return { success: true, removed: !!budget }
      }

      default:
        return { success: false, error: 'unknown action' }
    }
  } catch (error) {
    console.error('budget cloud function error:', error)
    return { success: false, error: error.message }
  }
}

module.exports.getAll = getAll
