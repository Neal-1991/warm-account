const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('record cloud function exposes get and hardens edit permissions', () => {
  const source = readSource('cloudfunctions/record/index.js')
  const updateCase = source.slice(source.indexOf("case 'update'"), source.indexOf("case 'delete'"))

  assert.match(source, /case 'get':/)
  assert.match(source, /return \{ success: true, record, canModify \}/)
  assert.match(source, /record\.bookId !== bookId/)
  assert.match(source, /book\.joinTargetBookId \|\| book\.joinMigration/)
  assert.match(updateCase, /getAuthorizedRecord\(\{ requireWritable: true, requireModifier: true \}\)/)
  assert.match(updateCase, /assertCategoryInBook\(nextCategoryId, record\.bookId, nextType\)/)
  assert.match(updateCase, /updatedBy: openId/)
  assert.match(updateCase, /updatedByName: data\.nickName \|\| ''/)
})

test('record update validates amount type date category and image fields', () => {
  const source = readSource('cloudfunctions/record/index.js')
  const updateCase = source.slice(source.indexOf("case 'update'"), source.indexOf("case 'delete'"))

  assert.match(source, /const VALID_RECORD_TYPES = new Set\(\['expense', 'income'\]\)/)
  assert.match(source, /Number\.isInteger\(amount\) \|\| amount <= 0/)
  assert.match(source, /Number\.isNaN\(date\.getTime\(\)\)/)
  assert.match(source, /Array\.isArray\(images\)/)
  assert.match(source, /images\.some\(item => typeof item !== 'string'\)/)
  assert.doesNotMatch(updateCase, /prepareBudgetAlert|budgetAlert/)
})

test('add page supports edit mode without changing the add budget alert flow', () => {
  const source = readSource('miniprogram/pages/add/add.js')
  const wxml = readSource('miniprogram/pages/add/add.wxml')

  assert.match(source, /options\.mode === 'edit' && !!options\.recordId/)
  assert.match(source, /wx\.setNavigationBarTitle\(\{ title: isEdit \? '编辑记录' : '记一笔' \}\)/)
  assert.match(source, /action: 'get'/)
  assert.match(source, /action: 'update'/)
  assert.match(source, /submitUpdate\(bookId, submitData\)/)
  assert.match(source, /submitAdd\(bookId, submitData\)/)
  assert.match(source, /selectedCategory: emptyCategory\(\)/)
  assert.match(source, /imageFileIds/)
  assert.match(source, /prepareImageFileIds/)
  assert.match(source, /budgetAlertContent\(res\.result\.budgetAlert\)/)
  assert.match(wxml, /submitText/)
})

test('detail page refreshes a single record remotely and exposes edit entry', () => {
  const source = readSource('miniprogram/pages/detail/detail.js')
  const wxml = readSource('miniprogram/pages/detail/detail.wxml')

  assert.match(source, /loadRecord/)
  assert.match(source, /action: 'get'/)
  assert.match(source, /canEdit: !!recordRes\.result\.canModify/)
  assert.match(source, /app\.globalData\._currentRecords = \[\]/)
  assert.match(source, /\/pages\/add\/add\?mode=edit&recordId=/)
  assert.match(wxml, /编辑记录/)
  assert.match(wxml, /wx:if="\{\{canEdit \|\| canDelete\}\}"/)
})
