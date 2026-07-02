const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

const BUDGET_ERROR_CODES = {
  PREVIOUS_BUDGET_NOT_FOUND: 'PREVIOUS_BUDGET_NOT_FOUND'
}

function isValidMonth(month) {
  return MONTH_PATTERN.test(month || '')
}

function currentBeijingMonth(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 7)
}

function previousMonth(month) {
  if (!isValidMonth(month)) return ''
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthRange(month) {
  if (!isValidMonth(month)) {
    throw new Error('invalid month')
  }
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    startDate: new Date(Date.UTC(year, monthNumber - 1, 1)),
    endDate: new Date(Date.UTC(year, monthNumber, 1))
  }
}

function categoryBigId(categoryMap, categoryId) {
  const category = categoryMap.get(categoryId)
  if (!category) return ''
  return category.parentId || category._id
}

function usageStatus(usedAmount, limitAmount) {
  if (!limitAmount) return 'normal'
  const percent = usedAmount / limitAmount * 100
  if (percent >= 100) return 'over'
  if (percent >= 80) return 'warning'
  return 'normal'
}

function usagePercent(usedAmount, limitAmount) {
  if (!limitAmount) return 0
  return Math.round(usedAmount / limitAmount * 1000) / 10
}

function aggregateBudgetUsage(records, categories, budget) {
  const categoryMap = new Map(categories.map(category => [category._id, category]))
  const categoryAmounts = {}
  let totalUsed = 0

  for (const record of records) {
    if (record.type !== 'expense') continue
    totalUsed += record.amount
    const bigId = categoryBigId(categoryMap, record.categoryId)
    if (bigId) {
      categoryAmounts[bigId] = (categoryAmounts[bigId] || 0) + record.amount
    }
  }

  const categoryUsage = (budget?.categoryLimits || []).map(limit => {
    const category = categoryMap.get(limit.categoryId)
    const usedAmount = categoryAmounts[limit.categoryId] || 0
    return {
      categoryId: limit.categoryId,
      name: category?.name || limit.name || '已删除分类',
      icon: category?.icon || limit.icon || '',
      limitAmount: limit.amount,
      usedAmount,
      remainingAmount: limit.amount - usedAmount,
      percent: usagePercent(usedAmount, limit.amount),
      status: usageStatus(usedAmount, limit.amount),
      categoryExists: !!category
    }
  })

  if (!budget) {
    return {
      totalUsed,
      total: null,
      categoryUsage: []
    }
  }

  return {
    totalUsed,
    total: {
      limitAmount: budget.totalAmount,
      usedAmount: totalUsed,
      remainingAmount: budget.totalAmount - totalUsed,
      percent: usagePercent(totalUsed, budget.totalAmount),
      status: usageStatus(totalUsed, budget.totalAmount)
    },
    categoryUsage
  }
}

module.exports = {
  BUDGET_ERROR_CODES,
  isValidMonth,
  currentBeijingMonth,
  previousMonth,
  monthRange,
  categoryBigId,
  usageStatus,
  usagePercent,
  aggregateBudgetUsage
}
