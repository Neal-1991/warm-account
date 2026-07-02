const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  buildRecordGroups,
  formatGroupDate,
  summarizeRecords
} = require('../miniprogram/utils/homepage-records')

test('homepage record groups use relative labels only for today and yesterday', () => {
  const now = new Date(2026, 5, 25, 12)
  const groups = buildRecordGroups([
    { _id: 'today-food', date: new Date(2026, 5, 25, 8), type: 'expense', amount: 2800 },
    { _id: 'today-traffic', date: new Date(2026, 5, 25, 9), type: 'expense', amount: 800 },
    { _id: 'yesterday-shopping', date: new Date(2026, 5, 24, 20), type: 'expense', amount: 12000 },
    { _id: 'four-days-food', date: new Date(2026, 5, 21, 18), type: 'expense', amount: 5650 },
    { _id: 'five-days-income', date: new Date(2026, 5, 20, 10), type: 'income', amount: 30000 },
    { _id: 'five-days-movie', date: new Date(2026, 5, 20, 21), type: 'expense', amount: 4200 },
    { _id: 'last-year-gift', date: new Date(2025, 11, 31, 19), type: 'expense', amount: 18800 }
  ], now)

  assert.equal(groups[0].title, '今天')
  assert.equal(groups[0].subtitle, '6月25日 周四')
  assert.equal(groups[0].expenseAmount, '36.00')
  assert.equal(groups[0].records[0]._id, 'today-food')

  assert.equal(groups[1].title, '昨天')
  assert.equal(groups[1].subtitle, '6月24日 周三')

  assert.equal(groups[2].title, '6月21日')
  assert.equal(groups[2].subtitle, '周日')
  assert.doesNotMatch(`${groups[2].title} ${groups[2].subtitle}`, /4天前/)

  assert.equal(groups[3].title, '6月20日')
  assert.equal(groups[3].subtitle, '周六')
  assert.equal(groups[3].incomeAmount, '300.00')
  assert.equal(groups[3].expenseAmount, '42.00')
  assert.equal(groups[3].hasIncome, true)
  assert.equal(groups[3].hasExpense, true)

  assert.equal(groups[4].title, '2025年12月31日')
  assert.equal(groups[4].subtitle, '周三')
})

test('homepage record summary still aggregates the whole selected month', () => {
  assert.deepEqual(summarizeRecords([
    { type: 'expense', amount: 6800 },
    { type: 'income', amount: 30000 },
    { type: 'expense', amount: 4200 }
  ]), {
    expense: '110.00',
    income: '300.00',
    balance: '190.00'
  })
})

test('homepage date formatter handles today yesterday normal dates and cross-year dates', () => {
  const now = new Date(2026, 5, 25, 12)
  assert.deepEqual(formatGroupDate(new Date(2026, 5, 25), now), {
    title: '今天',
    subtitle: '6月25日 周四'
  })
  assert.deepEqual(formatGroupDate(new Date(2026, 5, 24), now), {
    title: '昨天',
    subtitle: '6月24日 周三'
  })
  assert.deepEqual(formatGroupDate(new Date(2026, 5, 20), now), {
    title: '6月20日',
    subtitle: '周六'
  })
  assert.deepEqual(formatGroupDate(new Date(2025, 11, 31), now), {
    title: '2025年12月31日',
    subtitle: '周三'
  })
})

test('homepage source keeps records-first loading and grouped rendering contracts', () => {
  const root = path.join(__dirname, '..')
  const indexJs = fs.readFileSync(
    path.join(root, 'miniprogram/pages/index/index.js'),
    'utf8'
  )
  const indexWxml = fs.readFileSync(
    path.join(root, 'miniprogram/pages/index/index.wxml'),
    'utf8'
  )
  const recordCardWxml = fs.readFileSync(
    path.join(root, 'miniprogram/components/record-card/record-card.wxml'),
    'utf8'
  )

  assert.match(indexJs, /_skipNextShow/)
  assert.match(indexJs, /getLocalSession/)
  assert.match(indexJs, /validateSessionInBackground/)
  assert.match(indexJs, /buildRecordGroups\(records\)/)
  assert.match(indexJs, /wx\.cloud\.callFunction\(\{[\s\S]*name: 'budget'[\s\S]*\}\)\.then/)
  assert.match(indexWxml, /wx:for="\{\{recordGroups\}\}"/)
  assert.match(indexWxml, /wx:for-item="group"/)
  assert.match(indexWxml, /hideDate="\{\{true\}\}"/)
  assert.match(recordCardWxml, /wx:if="\{\{!hideDate\}\}"/)
})

test('budget getMonth returns before category and record aggregation when budget is unset', () => {
  const root = path.join(__dirname, '..')
  const budgetSource = fs.readFileSync(
    path.join(root, 'cloudfunctions/budget/index.js'),
    'utf8'
  )
  const noBudgetIndex = budgetSource.indexOf('if (!budget)')
  const aggregateIndex = budgetSource.indexOf('const [categories, records]')

  assert.ok(noBudgetIndex > -1)
  assert.ok(aggregateIndex > -1)
  assert.ok(noBudgetIndex < aggregateIndex)
  assert.match(
    budgetSource.slice(noBudgetIndex, aggregateIndex),
    /budget:\s*null[\s\S]*canEdit[\s\S]*isHistorical/
  )
})
