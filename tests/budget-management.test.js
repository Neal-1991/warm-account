const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  BUDGET_ERROR_CODES,
  isValidMonth,
  currentBeijingMonth,
  previousMonth,
  monthRange,
  aggregateBudgetUsage
} = require('../cloudfunctions/budget/budget-utils')
const {
  crossingLevel,
  selectBudgetAlert
} = require('../cloudfunctions/record/budget-alert')
const {
  buildBudgetView,
  attachBudgetToLegend,
  budgetMenuStatus,
  budgetAlertContent,
  copyBudgetErrorMessage
} = require('../miniprogram/utils/budget')

test('budget month helpers validate, compare and cross year boundaries', () => {
  assert.equal(isValidMonth('2026-06'), true)
  assert.equal(isValidMonth('2026-13'), false)
  assert.equal(previousMonth('2026-01'), '2025-12')
  assert.equal(
    currentBeijingMonth(new Date('2026-05-31T16:30:00Z')),
    '2026-06'
  )
  const range = monthRange('2026-06')
  assert.equal(range.startDate.toISOString(), '2026-06-01T00:00:00.000Z')
  assert.equal(range.endDate.toISOString(), '2026-07-01T00:00:00.000Z')
})

test('budget usage aggregates child expenses into the parent big category', () => {
  const categories = [
    { _id: 'food', parentId: null, name: '餐饮', icon: '🍜' },
    { _id: 'dinner', parentId: 'food', name: '晚餐', icon: '' },
    { _id: 'salary', parentId: null, name: '工资', type: 'income' }
  ]
  const budget = {
    totalAmount: 10000,
    categoryLimits: [
      { categoryId: 'food', amount: 5000, name: '餐饮', icon: '🍜' }
    ]
  }
  const usage = aggregateBudgetUsage([
    { type: 'expense', categoryId: 'dinner', amount: 3200 },
    { type: 'expense', categoryId: 'food', amount: 800 },
    { type: 'income', categoryId: 'salary', amount: 20000 }
  ], categories, budget)

  assert.equal(usage.totalUsed, 4000)
  assert.equal(usage.total.percent, 40)
  assert.deepEqual(usage.categoryUsage[0], {
    categoryId: 'food',
    name: '餐饮',
    icon: '🍜',
    limitAmount: 5000,
    usedAmount: 4000,
    remainingAmount: 1000,
    percent: 80,
    status: 'warning',
    categoryExists: true
  })
})

test('deleted categories use the saved budget snapshot', () => {
  const usage = aggregateBudgetUsage([], [], {
    totalAmount: 10000,
    categoryLimits: [
      { categoryId: 'deleted', amount: 3000, name: '纪念日', icon: '🎂' }
    ]
  })
  assert.equal(usage.categoryUsage[0].name, '纪念日')
  assert.equal(usage.categoryUsage[0].categoryExists, false)
})

test('threshold helper alerts only when crossing 80 or 100 percent', () => {
  assert.equal(crossingLevel(7900, 8000, 10000), 'warning')
  assert.equal(crossingLevel(8000, 8500, 10000), '')
  assert.equal(crossingLevel(9900, 10000, 10000), 'over')
  assert.equal(crossingLevel(10100, 11000, 10000), '')
})

test('category over-budget alerts outrank total alerts and warnings', () => {
  const overCategory = selectBudgetAlert({
    previousTotal: 7900,
    nextTotal: 8100,
    totalLimit: 10000,
    previousCategory: 4900,
    nextCategory: 5100,
    categoryLimit: { categoryId: 'food', name: '餐饮', amount: 5000 }
  })
  assert.equal(overCategory.level, 'over')
  assert.equal(overCategory.scope, 'category')

  const totalTie = selectBudgetAlert({
    previousTotal: 9900,
    nextTotal: 10100,
    totalLimit: 10000,
    previousCategory: 4900,
    nextCategory: 5100,
    categoryLimit: { categoryId: 'food', name: '餐饮', amount: 5000 }
  })
  assert.equal(totalTie.level, 'over')
  assert.equal(totalTie.scope, 'category')
})

test('category over-budget alerts repeat while total over-budget alerts do not', () => {
  const continuedCategory = selectBudgetAlert({
    previousTotal: 6000,
    nextTotal: 6200,
    totalLimit: 10000,
    previousCategory: 5100,
    nextCategory: 5300,
    categoryLimit: { categoryId: 'food', name: '餐饮', amount: 5000 }
  })
  assert.equal(continuedCategory.level, 'over')
  assert.equal(continuedCategory.scope, 'category')
  assert.equal(continuedCategory.trigger, 'continued-over')

  const continuedTotalOnly = selectBudgetAlert({
    previousTotal: 10100,
    nextTotal: 10300,
    totalLimit: 10000,
    previousCategory: 1000,
    nextCategory: 1200,
    categoryLimit: null
  })
  assert.equal(continuedTotalOnly, null)

  const thresholdCategory = selectBudgetAlert({
    previousTotal: 6000,
    nextTotal: 6200,
    totalLimit: 10000,
    previousCategory: 4900,
    nextCategory: 5100,
    categoryLimit: { categoryId: 'food', name: '餐饮', amount: 5000 }
  })
  assert.equal(thresholdCategory.trigger, 'threshold')
})

test('home budget view distinguishes unset, warning and over-budget states', () => {
  assert.deepEqual(
    buildBudgetView({
      success: true,
      budget: null,
      usage: { totalUsed: 428000 },
      canEdit: true,
      isHistorical: false
    }, '2026-06', new Date('2026-06-15T00:00:00Z')),
    {
      configured: false,
      canEdit: true,
      isHistorical: false,
      usedAmount: '4280.00'
    }
  )

  const warning = buildBudgetView({
    success: true,
    budget: { totalAmount: 510000 },
    usage: {
      total: {
        limitAmount: 510000,
        usedAmount: 428000,
        remainingAmount: 82000,
        percent: 83.9,
        status: 'warning'
      }
    },
    canEdit: true,
    isHistorical: false
  }, '2026-06', new Date('2026-06-15T00:00:00Z'))
  assert.equal(warning.status, 'warning')
  assert.equal(warning.remainingAmount, '820.00')
  assert.match(warning.paceText, /日均可花/)

  const over = buildBudgetView({
    success: true,
    budget: { totalAmount: 380000 },
    usage: {
      total: {
        limitAmount: 380000,
        usedAmount: 428000,
        remainingAmount: -48000,
        percent: 112.6,
        status: 'over'
      }
    }
  }, '2026-05')
  assert.equal(over.isOver, true)
  assert.equal(over.remainingAmount, '480.00')
})

test('statistics and mine helpers attach category budget details', () => {
  const result = {
    success: true,
    budget: { totalAmount: 500000 },
    usage: {
      total: { remainingAmount: 72000 },
      categoryUsage: [{
        name: '餐饮',
        limitAmount: 220000,
        remainingAmount: 42000,
        percent: 80.9,
        status: 'warning'
      }]
    }
  }
  const legend = attachBudgetToLegend([
    { name: '餐饮', amount: '1780.00' },
    { name: '居住', amount: '580.00' }
  ], result)
  assert.equal(legend[0].hasBudget, true)
  assert.equal(legend[0].budgetStatus, 'warning')
  assert.equal(legend[1].hasBudget, false)
  assert.equal(budgetMenuStatus(result), '本月剩余 ¥720.00')
})

test('record alert copy is compact for the non-blocking saved notice', () => {
  const content = budgetAlertContent({
    level: 'over',
    scope: 'category',
    categoryName: '餐饮',
    percent: 104,
    remainingAmount: -2000
  })
  assert.equal(content.title, '记账成功，餐饮预算已超支')
  assert.equal(content.message, '已使用 104% · 超支 ¥20.00')

  const exhausted = budgetAlertContent({
    level: 'over',
    scope: 'total',
    percent: 100,
    remainingAmount: 0
  })
  assert.equal(exhausted.title, '记账成功，本月总预算已用完')
  assert.doesNotMatch(exhausted.message, /超支 ¥0/)
})

test('copy previous budget uses a stable missing-source error message', () => {
  assert.equal(
    BUDGET_ERROR_CODES.PREVIOUS_BUDGET_NOT_FOUND,
    'PREVIOUS_BUDGET_NOT_FOUND'
  )
  assert.equal(copyBudgetErrorMessage({
    success: false,
    errorCode: BUDGET_ERROR_CODES.PREVIOUS_BUDGET_NOT_FOUND,
    error: 'different server copy'
  }), '上月未设置预算')
  assert.equal(copyBudgetErrorMessage({
    success: false,
    error: '目标月份已设置预算'
  }), '目标月份已设置预算')
})

test('release configuration includes budget collections in both environments', () => {
  const root = path.join(__dirname, '..')
  const configSource = fs.readFileSync(
    path.join(root, 'miniprogram/utils/config.js'),
    'utf8'
  )
  const collectionSource = fs.readFileSync(
    path.join(root, 'cloudfunctions/init-collections/index.js'),
    'utf8'
  )

  assert.match(configSource, /budgets_test/)
  assert.match(configSource, /budgets_prod/)
  assert.match(collectionSource, /actualCollections/)
  assert.match(collectionSource, /budgets_test, budgets_prod/)

  const budgetFunctionSource = fs.readFileSync(
    path.join(root, 'cloudfunctions/budget/index.js'),
    'utf8'
  )
  assert.match(budgetFunctionSource, /PREVIOUS_BUDGET_NOT_FOUND/)
})
