const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const {
  CATEGORY_SCHEMA_VERSION,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  ALL_PRESETS
} = require('../cloudfunctions/init-database/presets')
const {
  findBigCategory,
  findChildCategory,
  childPresetKey,
  missingBigPresets
} = require('../cloudfunctions/init-database/preset-utils')
const {
  bigCategoryKeys,
  childCategoryKeys,
  firstMappedValue
} = require('../cloudfunctions/book/category-merge-utils')
const {
  buildCategoryMigrationPlan,
  categoryIdMap
} = require('../cloudfunctions/book/join-migration-utils')
const {
  getAll,
  createJoinMigrationService
} = require('../cloudfunctions/book/join-migration')
const {
  filterBigCategories
} = require('../miniprogram/pages/category-manage/category-manage-utils')
const {
  COMMON_EMOJIS,
  emojiFromIndex,
  emojiFromInput
} = require('../miniprogram/utils/category-emoji')
const {
  buildCategoryDisplayMap,
  resolveCategoryDisplay,
  aggregateByParent
} = require('../miniprogram/utils/category-display')
const {
  DEFAULT_ICON_KEY,
  iconForCategory,
  iconOptions,
  normalizeIconKey,
  recommendIconKey
} = require('../miniprogram/utils/category-icons')

test('current category schema contains 16 expense and 7 income presets', () => {
  assert.equal(CATEGORY_SCHEMA_VERSION, 1)
  assert.equal(EXPENSE_CATEGORIES.length, 16)
  assert.equal(INCOME_CATEGORIES.length, 7)
  assert.equal(ALL_PRESETS.length, 23)
  assert.equal(new Set(ALL_PRESETS.map(category => category.key)).size, 23)
})

test('legacy system categories are matched by type and name then receive stable keys', () => {
  const legacy = [
    {
      _id: 'food-id',
      name: '餐饮',
      type: 'expense',
      isSystem: true,
      parentId: null
    }
  ]
  assert.equal(findBigCategory(legacy, ALL_PRESETS[0])._id, 'food-id')
})

test('a partial six-category book is detected as incomplete', () => {
  const partial = ALL_PRESETS.slice(0, 6).map((preset, index) => ({
    _id: `legacy-${index}`,
    name: preset.name,
    type: preset.type,
    isSystem: true,
    parentId: null
  }))
  assert.equal(missingBigPresets(partial, ALL_PRESETS).length, 17)
})

test('renamed system categories continue matching by preset key', () => {
  const renamed = [
    {
      _id: 'food-id',
      presetKey: 'expense_food',
      name: '吃喝',
      type: 'expense',
      isSystem: true,
      parentId: null
    }
  ]
  assert.equal(findBigCategory(renamed, ALL_PRESETS[0])._id, 'food-id')
})

test('child presets are matched without confusing another parent', () => {
  const categories = [
    { _id: 'one', name: '零食', parentId: 'food', isSystem: true },
    { _id: 'two', name: '零食', parentId: 'pet', isSystem: true }
  ]
  assert.equal(
    findChildCategory(categories, 'pet', childPresetKey('expense_pet', 1), '零食')._id,
    'two'
  )
})

test('management tabs filter categories in JavaScript', () => {
  const categories = [
    { _id: 'expense', type: 'expense' },
    { _id: 'income', type: 'income' }
  ]
  assert.deepEqual(filterBigCategories(categories, 'expense'), [categories[0]])
  assert.deepEqual(filterBigCategories(categories, 'income'), [categories[1]])
})

test('add-big emoji uses separate candidate and input event paths', () => {
  assert.ok(COMMON_EMOJIS.includes('✈️'))
  const cakeIndex = COMMON_EMOJIS.indexOf('🎂')
  assert.equal(emojiFromIndex(COMMON_EMOJIS, {
    currentTarget: { dataset: { index: cakeIndex } }
  }), '🎂')
  assert.equal(emojiFromInput({
    detail: { value: '☕' }
  }), '☕')
})

test('semantic category icons resolve legacy keys and preset bindings', () => {
  assert.equal(normalizeIconKey('expense_food'), 'icon_bowl_chopsticks')
  assert.equal(normalizeIconKey('income_bonus'), 'icon_award_money')
  assert.equal(normalizeIconKey('category_default'), DEFAULT_ICON_KEY)
  assert.equal(
    iconForCategory({ presetKey: 'income_bonus' }).assetPath,
    '/images/category-icons/icon_award_money.png'
  )
  assert.equal(
    iconForCategory({ iconKey: 'expense_transport' }).iconKey,
    'icon_vehicle'
  )
  assert.equal(iconForCategory({ icon: '♻️' }).iconKey, 'icon_recycle_money')
  assert.equal(iconForCategory({ icon: '🧾' }).iconKey, 'icon_receipt_return')
  assert.equal(iconForCategory({ icon: '🚉' }).iconKey, 'icon_vehicle')
  assert.equal(iconForCategory({}).iconKey, DEFAULT_ICON_KEY)
})

test('production custom categories prefer semantic name matches before emoji fallback', () => {
  assert.equal(
    iconForCategory({ name: '医保报销', type: 'income', icon: '💊' }).iconKey,
    'icon_receipt_return'
  )
  assert.equal(
    iconForCategory({ name: '汽车', type: 'expense', icon: '🚗' }).iconKey,
    'icon_vehicle'
  )
})

test('semantic icon recommendation stays within the current category type', () => {
  assert.equal(recommendIconKey('买菜', 'expense'), 'icon_grocery_bag')
  assert.equal(recommendIconKey('话费', 'expense'), 'icon_phone_bill')
  assert.equal(recommendIconKey('医疗', 'expense'), 'icon_medical')
  assert.equal(recommendIconKey('红包礼金', 'expense'), 'icon_gift_social')
  assert.equal(recommendIconKey('退款', 'income'), 'icon_wallet_refund')
  assert.equal(recommendIconKey('报销', 'income'), 'icon_receipt_return')
  assert.equal(recommendIconKey('红包礼金', 'income'), 'icon_red_packet_money')
  assert.equal(recommendIconKey('奖金', 'income'), 'icon_award_money')
  assert.equal(recommendIconKey('废品回收', 'income'), 'icon_recycle_money')
  assert.equal(recommendIconKey('报销', 'expense'), DEFAULT_ICON_KEY)
  assert.equal(recommendIconKey('完全未知分类', 'expense'), DEFAULT_ICON_KEY)
})

test('semantic icon options are scoped by income and expense type', () => {
  const expenseKeys = iconOptions('expense').map(icon => icon.key)
  const incomeKeys = iconOptions('income').map(icon => icon.key)

  assert.ok(expenseKeys.includes('icon_cup'))
  assert.ok(expenseKeys.includes(DEFAULT_ICON_KEY))
  assert.equal(expenseKeys.includes('icon_salary_card'), false)
  assert.ok(incomeKeys.includes('icon_receipt_return'))
  assert.ok(incomeKeys.includes(DEFAULT_ICON_KEY))
  assert.equal(incomeKeys.includes('icon_grocery_bag'), false)
})

test('family category merge prefers stable preset keys after a rename', () => {
  const target = {
    _id: 'target-food',
    presetKey: 'expense_food',
    name: '餐饮',
    type: 'expense'
  }
  const source = {
    _id: 'source-food',
    presetKey: 'expense_food',
    name: '吃喝',
    type: 'expense'
  }
  const map = new Map()
  bigCategoryKeys(target).forEach(key => map.set(key, target._id))
  assert.equal(firstMappedValue(map, bigCategoryKeys(source)), target._id)

  const targetChild = { presetKey: 'expense_food_child_1', name: '早餐' }
  const sourceChild = { presetKey: 'expense_food_child_1', name: '早饭' }
  const childMap = new Map()
  childCategoryKeys(targetChild, bigCategoryKeys(target)).forEach(key => childMap.set(key, 'target-child'))
  assert.equal(
    firstMappedValue(childMap, childCategoryKeys(sourceChild, bigCategoryKeys(source))),
    'target-child'
  )
})

test('home uses parent icon with child name while statistics aggregate by parent', () => {
  const categories = [
    { _id: 'food', parentId: null, name: '餐饮', icon: '🍜' },
    { _id: 'dinner', parentId: 'food', name: '晚餐', icon: '' },
    { _id: 'gift', parentId: null, name: '红包礼金', icon: '🧧' },
    { _id: 'spring-gift', parentId: 'gift', name: '春节红包', icon: '' }
  ]
  const displayMap = buildCategoryDisplayMap(categories)

  const dinnerDisplay = resolveCategoryDisplay(displayMap, 'dinner')
  const springGiftDisplay = resolveCategoryDisplay(displayMap, 'spring-gift')

  assert.deepEqual({
    name: dinnerDisplay.name,
    icon: dinnerDisplay.icon,
    parentName: dinnerDisplay.parentName,
    valid: dinnerDisplay.valid,
    isBigCategory: dinnerDisplay.isBigCategory
  }, {
    name: '晚餐',
    icon: '🍜',
    parentName: '餐饮',
    valid: true,
    isBigCategory: false
  })
  assert.equal(dinnerDisplay.iconInfo.iconKey, 'icon_bowl_chopsticks')
  assert.equal(dinnerDisplay.iconInfo.emoji, '')
  assert.deepEqual({
    name: springGiftDisplay.name,
    icon: springGiftDisplay.icon,
    parentName: springGiftDisplay.parentName,
    valid: springGiftDisplay.valid,
    isBigCategory: springGiftDisplay.isBigCategory
  }, {
    name: '春节红包',
    icon: '🧧',
    parentName: '红包礼金',
    valid: true,
    isBigCategory: false
  })
  assert.equal(springGiftDisplay.iconInfo.iconKey, 'icon_red_packet_money')
  assert.equal(springGiftDisplay.iconInfo.emoji, '')
  assert.deepEqual(
    aggregateByParent([
      { categoryId: 'dinner', amount: 3800 },
      { categoryId: 'food', amount: 1200 },
      { categoryId: 'spring-gift', amount: 50000 }
    ], displayMap),
    { 餐饮: 5000, 红包礼金: 50000 }
  )
})

test('orphan or missing category is reported as uncategorized', () => {
  const displayMap = buildCategoryDisplayMap([
    { _id: 'orphan', parentId: 'missing-parent', name: '晚餐', icon: '' }
  ])
  assert.equal(resolveCategoryDisplay(displayMap, 'orphan').name, '未分类')
  assert.equal(resolveCategoryDisplay(displayMap, 'orphan').reason, 'missing_parent')
  assert.equal(resolveCategoryDisplay(displayMap, 'missing').reason, 'missing_category')
})

test('category migration plan covers late income categories and custom categories', () => {
  const target = [
    { _id: 'a-food', presetKey: 'expense_food', name: '餐饮', type: 'expense', parentId: null },
    { _id: 'a-dinner', presetKey: 'expense_food_child_3', name: '晚餐', type: 'expense', parentId: 'a-food' },
    { _id: 'a-gift', presetKey: 'income_gift', name: '红包礼金', type: 'income', parentId: null },
    { _id: 'a-spring', presetKey: 'income_gift_child_1', name: '春节红包', type: 'income', parentId: 'a-gift' }
  ]
  const source = [
    { _id: 'b-food', presetKey: 'expense_food', name: '吃喝', type: 'expense', parentId: null },
    { _id: 'b-dinner', presetKey: 'expense_food_child_3', name: '晚饭', type: 'expense', parentId: 'b-food' },
    { _id: 'b-gift', presetKey: 'income_gift', name: '红包', type: 'income', parentId: null },
    { _id: 'b-spring', presetKey: 'income_gift_child_1', name: '过年红包', type: 'income', parentId: 'b-gift' },
    { _id: 'b-custom', name: '纪念日', type: 'expense', parentId: null },
    { _id: 'b-custom-child', name: '蛋糕', type: 'expense', parentId: 'b-custom' }
  ]

  const plan = buildCategoryMigrationPlan(target, source)
  const idMap = categoryIdMap(plan)
  assert.equal(idMap['b-food'], 'a-food')
  assert.equal(idMap['b-dinner'], 'a-dinner')
  assert.equal(idMap['b-gift'], 'a-gift')
  assert.equal(idMap['b-spring'], 'a-spring')
  assert.equal(idMap['b-custom'], 'b-custom')
  assert.equal(idMap['b-custom-child'], 'b-custom-child')
  assert.equal(
    plan.find(item => item.sourceId === 'b-custom-child').parentId,
    'b-custom'
  )
})

test('paginated helper reads more than one cloud database page', async () => {
  const items = Array.from({ length: 205 }, (_, index) => ({ _id: `item-${index}` }))
  const makeQuery = (offset = 0, limit = 100) => ({
    skip(value) {
      return makeQuery(value, limit)
    },
    limit(value) {
      return makeQuery(offset, value)
    },
    async get() {
      return { data: items.slice(offset, offset + limit) }
    }
  })
  assert.equal((await getAll(makeQuery())).length, 205)
})

test('family migration resumes after interruption without duplicate data', async () => {
  const state = {
    books_test: [
      {
        _id: 'target-book',
        ownerId: 'A',
        memberIds: ['A'],
        inviteCode: '123456',
        inviteCodeExpire: new Date('2099-01-01T00:00:00Z'),
        inviteCodeUsedBy: null
      },
      {
        _id: 'source-book',
        ownerId: 'B',
        memberIds: ['B']
      }
    ],
    categories_test: [
      {
        _id: 'a-food',
        bookId: 'target-book',
        presetKey: 'expense_food',
        name: '餐饮',
        icon: '🍜',
        type: 'expense',
        parentId: null
      },
      {
        _id: 'a-dinner',
        bookId: 'target-book',
        presetKey: 'expense_food_child_3',
        name: '晚餐',
        type: 'expense',
        parentId: 'a-food'
      },
      {
        _id: 'b-food',
        bookId: 'source-book',
        presetKey: 'expense_food',
        name: '吃喝',
        icon: '🍜',
        type: 'expense',
        parentId: null
      },
      {
        _id: 'b-dinner',
        bookId: 'source-book',
        presetKey: 'expense_food_child_3',
        name: '晚饭',
        type: 'expense',
        parentId: 'b-food'
      },
      {
        _id: 'b-custom',
        bookId: 'source-book',
        name: '纪念日',
        icon: '🎂',
        type: 'expense',
        parentId: null
      }
    ],
    records_test: [
      { _id: 'record-1', bookId: 'source-book', categoryId: 'b-dinner', amount: 3800 },
      { _id: 'record-2', bookId: 'source-book', categoryId: 'b-custom', amount: 12000 }
    ],
    budgets_test: [
      { _id: 'target-budget', bookId: 'target-book', month: '2026-06', totalAmount: 800000 },
      { _id: 'source-budget', bookId: 'source-book', month: '2026-06', totalAmount: 300000 }
    ]
  }

  const matches = (item, condition) => Object.entries(condition)
    .every(([key, value]) => item[key] === value)
  const applyData = (item, data) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && value.__op === 'remove') {
        delete item[key]
      } else if (value && value.__op === 'addToSet') {
        item[key] = Array.from(new Set([...(item[key] || []), value.value]))
      } else {
        item[key] = value
      }
    }
  }
  const makeQuery = (name, items, offset = 0, limit = 100) => ({
    skip(value) {
      return makeQuery(name, items, value, limit)
    },
    limit(value) {
      return makeQuery(name, items, offset, value)
    },
    async get() {
      return { data: items.slice(offset, offset + limit).map(item => ({ ...item })) }
    },
    async update({ data }) {
      for (const item of items) applyData(item, data)
      return { stats: { updated: items.length } }
    }
  })
  const fakeDb = {
    collection(name) {
      state[name] = state[name] || []
      return {
        doc(id) {
          return {
            async get() {
              const item = state[name].find(entry => entry._id === id)
              return { data: item ? { ...item } : null }
            },
            async update({ data }) {
              const item = state[name].find(entry => entry._id === id)
              if (!item) throw new Error('not found')
              applyData(item, data)
              return { stats: { updated: 1 } }
            },
            async remove() {
              const index = state[name].findIndex(entry => entry._id === id)
              if (index < 0) throw new Error('not found')
              state[name].splice(index, 1)
              return { stats: { removed: 1 } }
            }
          }
        },
        where(condition) {
          return makeQuery(name, state[name].filter(item => matches(item, condition)))
        }
      }
    },
    serverDate() {
      return new Date('2026-06-11T00:00:00Z')
    }
  }
  const command = {
    addToSet(value) {
      return { __op: 'addToSet', value }
    },
    remove() {
      return { __op: 'remove' }
    }
  }
  const serviceOptions = {
    db: fakeDb,
    command,
    collectionName: name => `${name}_test`
  }

  let service = createJoinMigrationService(serviceOptions)
  let result
  for (let attempt = 0; attempt < 20; attempt++) {
    const targetBook = state.books_test.find(book => book._id === 'target-book')
    result = await service.run({
      targetBook: { ...targetBook },
      sourceBookId: 'source-book',
      openId: 'B',
      inviteCode: '123456'
    })
    if (attempt === 0) {
      assert.equal(
        state.books_test.find(book => book._id === 'source-book').joinTargetBookId,
        'target-book'
      )
    }
    if (attempt === 1) {
      service = createJoinMigrationService(serviceOptions)
    }
    if (result.status === 'completed') break
  }

  assert.equal(result.status, 'completed')
  assert.equal(state.books_test.some(book => book._id === 'source-book'), false)
  assert.deepEqual(
    state.books_test.find(book => book._id === 'target-book').memberIds,
    ['A', 'B']
  )
  assert.equal(state.categories_test.some(category => category._id === 'b-food'), false)
  assert.equal(state.categories_test.some(category => category._id === 'b-dinner'), false)
  assert.equal(
    state.categories_test.find(category => category._id === 'b-custom').bookId,
    'target-book'
  )
  assert.deepEqual(
    state.records_test.map(record => ({
      id: record._id,
      bookId: record.bookId,
      categoryId: record.categoryId
    })),
    [
      { id: 'record-1', bookId: 'target-book', categoryId: 'a-dinner' },
      { id: 'record-2', bookId: 'target-book', categoryId: 'b-custom' }
    ]
  )
  assert.deepEqual(
    state.budgets_test.map(budget => ({
      id: budget._id,
      bookId: budget.bookId,
      totalAmount: budget.totalAmount
    })),
    [
      { id: 'target-budget', bookId: 'target-book', totalAmount: 800000 }
    ]
  )
})

test('init-database completes a partial book and is idempotent', async () => {
  const bookId = 'book-1'
  const state = {
    books_test: [{ _id: bookId, categorySchemaVersion: 0 }],
    categories_test: ALL_PRESETS.slice(0, 6).map((preset, index) => ({
      _id: `legacy-${index}`,
      name: preset.name,
      icon: preset.icon,
      order: preset.order,
      type: preset.type,
      isVisible: true,
      isSystem: true,
      parentId: null,
      bookId
    }))
  }
  let nextId = 1

  const matches = (item, condition) => Object.entries(condition)
    .every(([key, value]) => item[key] === value)
  const makeQuery = (items, offset = 0, limit = 100) => ({
    skip(value) {
      return makeQuery(items, value, limit)
    },
    limit(value) {
      return makeQuery(items, offset, value)
    },
    async get() {
      return { data: items.slice(offset, offset + limit).map(item => ({ ...item })) }
    }
  })
  const fakeDb = {
    collection(name) {
      state[name] = state[name] || []
      return {
        doc(id) {
          return {
            async get() {
              return { data: state[name].find(item => item._id === id) || null }
            },
            async update({ data }) {
              const item = state[name].find(entry => entry._id === id)
              Object.assign(item, data)
              return { stats: { updated: 1 } }
            }
          }
        },
        where(condition) {
          return makeQuery(state[name].filter(item => matches(item, condition)))
        },
        async add({ data }) {
          const _id = `new-${nextId++}`
          state[name].push({ _id, ...data })
          return { _id }
        }
      }
    },
    serverDate() {
      return new Date('2026-06-10T00:00:00Z')
    }
  }
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'dynamic',
    init() {},
    database() {
      return fakeDb
    }
  }

  const originalLoad = Module._load
  const initPath = require.resolve('../cloudfunctions/init-database/index')
  delete require.cache[initPath]
  Module._load = function(request, parent, isMain) {
    if (request === 'wx-server-sdk') {
      return fakeCloud
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const initDatabase = require(initPath)
    const first = await initDatabase.ensureBookPresets({ isTest: true }, bookId)
    const expectedChildren = ALL_PRESETS.reduce((sum, preset) => sum + preset.children.length, 0)
    assert.equal(first.success, true)
    assert.equal(first.createdBig, 17)
    assert.equal(state.books_test[0].categorySchemaVersion, CATEGORY_SCHEMA_VERSION)
    assert.equal(state.categories_test.filter(category => category.parentId === null).length, 23)
    assert.equal(state.categories_test.filter(category => category.parentId !== null).length, expectedChildren)

    const countAfterFirstRun = state.categories_test.length
    const second = await initDatabase.ensureBookPresets({ isTest: true }, bookId)
    assert.equal(second.message, 'category schema already current')
    assert.equal(state.categories_test.length, countAfterFirstRun)
  } finally {
    Module._load = originalLoad
    delete require.cache[initPath]
  }
})
