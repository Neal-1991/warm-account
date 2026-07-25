const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('add page hides the category icon until a category is selected', () => {
  const wxml = readSource('miniprogram/pages/add/add.wxml')

  assert.match(wxml, /<category-icon[\s\S]*wx:if="\{\{selectedCategory\.categoryId\}\}"/)
  assert.match(wxml, /selectedCategory\.name \|\| '请选择'/)
})

test('budget category limits are removed from the draft only after confirmation', () => {
  const source = readSource('miniprogram/pages/budget/budget.js')
  const wxml = readSource('miniprogram/pages/budget/budget.wxml')

  assert.match(wxml, /bindtap="removeCategory">移除<\/text>/)
  assert.match(source, /title: '移除大类预算'/)
  assert.match(source, /保存预算后生效，不会删除分类和账目/)
  assert.match(source, /已移除，保存预算后生效/)
  assert.match(source, /invalidateBudgetCache\(bookId, this\.data\.currentMonth\)/)
})

test('home budget card keeps cached values while refreshing in the background', () => {
  const appSource = readSource('miniprogram/app.js')
  const indexSource = readSource('miniprogram/pages/index/index.js')
  const indexWxml = readSource('miniprogram/pages/index/index.wxml')
  const loadHomeData = indexSource.slice(
    indexSource.indexOf('async loadHomeData'),
    indexSource.indexOf('async goToAdd')
  )

  assert.match(appSource, /_budgetViewCache/)
  assert.match(appSource, /getBudgetViewCache/)
  assert.match(appSource, /setBudgetViewCache/)
  assert.match(appSource, /invalidateBudgetCache/)
  assert.match(indexSource, /budgetLoadingView/)
  assert.match(loadHomeData, /getBudgetViewCache\(bookId, month\)/)
  assert.match(loadHomeData, /setBudgetViewCache\(bookId, month, budgetView\)/)
  assert.doesNotMatch(loadHomeData, /budgetView: EMPTY_BUDGET_VIEW/)
  assert.match(indexWxml, /预算加载中/)
  assert.match(indexWxml, /预算刷新失败/)
})

test('category cloud function supports strict big and child ordering', () => {
  const source = readSource('cloudfunctions/category/index.js')

  assert.match(source, /case 'reorderBig':/)
  assert.match(source, /case 'reorderChildren':/)
  assert.match(source, /assertExactOrderedIds\(categories, event\.orderedIds\)/)
  assert.match(source, /parent\.parentId !== null/)
  assert.match(source, /order: bigOrder/)
  assert.match(source, /order: childOrder/)
  assert.match(source, /nextCategoryOrder\(\{ bookId, parentId: null, type \}\)/)
  assert.match(source, /nextCategoryOrder\(\{ bookId, parentId \}\)/)
})

test('category management page exposes account-level big and child sort controls', () => {
  const source = readSource('miniprogram/pages/category-manage/category-manage.js')
  const wxml = readSource('miniprogram/pages/category-manage/category-manage.wxml')

  assert.match(source, /moveBig\(e\)/)
  assert.match(source, /moveChild\(e\)/)
  assert.match(source, /let cursor = 0/)
  assert.match(source, /category\.type !== this\.data\.activeTab/)
  assert.match(source, /nextVisible\[cursor\]/)
  assert.match(source, /action: 'reorderBig'/)
  assert.match(source, /action: 'reorderChildren'/)
  assert.match(source, /orderedIds: nextVisible\.map\(category => category\._id\)/)
  assert.match(source, /orderedIds: nextChildren\.map\(category => category\._id\)/)
  assert.match(wxml, /bindtap="moveBig"/)
  assert.match(wxml, /bindtap="moveChild"/)
  assert.match(wxml, /上移/)
  assert.match(wxml, /下移/)
})
