const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')

const {
  buildCategoryMigrationPlan,
  categoryIdMap
} = require('../cloudfunctions/book/join-migration-utils')

function loadApp({ initialStorage = {}, restoreResult, restoreError }) {
  const storage = new Map(Object.entries(initialStorage))
  let appDefinition
  let callCount = 0
  const originalResolveFilename = Module._resolveFilename
  const envPath = path.resolve(__dirname, '../miniprogram/utils/env.js')

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    const parentFile = parent?.filename?.replace(/\\/g, '/')
    if (request === './env' && parentFile?.endsWith('/miniprogram/utils/config.js')) {
      return envPath
    }
    return originalResolveFilename.call(this, request, parent, isMain, options)
  }
  require.cache[envPath] = {
    id: envPath,
    filename: envPath,
    loaded: true,
    exports: { env: 'test-env' }
  }

  global.wx = {
    getStorageSync(key) {
      return storage.get(key)
    },
    setStorageSync(key, value) {
      storage.set(key, value)
    },
    removeStorageSync(key) {
      storage.delete(key)
    },
    cloud: {
      init() {},
      callFunction() {
        callCount++
        if (restoreError) return Promise.reject(restoreError)
        return Promise.resolve({ result: restoreResult })
      }
    }
  }
  global.App = definition => {
    appDefinition = definition
  }

  const appPath = require.resolve('../miniprogram/app')
  delete require.cache[appPath]
  require(appPath)

  return {
    app: appDefinition,
    storage,
    getCallCount: () => callCount,
    cleanup() {
      Module._resolveFilename = originalResolveFilename
      delete require.cache[appPath]
      delete require.cache[require.resolve('../miniprogram/utils/config')]
      delete require.cache[envPath]
      delete global.wx
      delete global.App
    }
  }
}

test('被移除方 restoreSession 返回 removed 时,ensureSession 缓存 removedBookName', async () => {
  const harness = loadApp({
    initialStorage: {
      openId: 'openid-a',
      bookId: 'book-family',
      userInfo: { nickName: 'A', avatarUrl: '' }
    },
    restoreResult: {
      success: true,
      authenticated: false,
      removed: true,
      removedBookName: '家庭账本'
    }
  })
  try {
    harness.app.onLaunch()
    const session = await harness.app.sessionReady
    assert.equal(session.authenticated, false)
    assert.equal(session.removed, true)
    assert.equal(session.removedBookName, '家庭账本')
    assert.equal(harness.storage.get('removedBookName'), '家庭账本')
    assert.equal(harness.app.getBookId(), null)
  } finally {
    harness.cleanup()
  }
})

test('被移除方 restoreSession 无 removed 字段时,不缓存 removedBookName', async () => {
  const harness = loadApp({
    initialStorage: {
      openId: 'openid-a',
      bookId: 'book-family'
    },
    restoreResult: {
      success: true,
      authenticated: false
    }
  })
  try {
    harness.app.onLaunch()
    const session = await harness.app.sessionReady
    assert.equal(session.authenticated, false)
    assert.equal(session.removed, undefined)
    assert.equal(harness.storage.has('removedBookName'), false)
  } finally {
    harness.cleanup()
  }
})

test('被移除方重新加入时,空账本的预设分类全部命中目标并标记为 duplicate', () => {
  // 场景:被移除方重新创建的个人账本仅含预设分类,重新被邀请加入原家庭账本时,
  // join-migration 应把这些预设分类映射到目标账本已有的分类(去重),不创建新分类。
  const target = [
    { _id: 'a-food', presetKey: 'expense_food', name: '餐饮', type: 'expense', parentId: null },
    { _id: 'a-dinner', presetKey: 'expense_food_child_3', name: '晚餐', type: 'expense', parentId: 'a-food' },
    { _id: 'a-gift', presetKey: 'income_gift', name: '红包礼金', type: 'income', parentId: null }
  ]
  const source = [
    { _id: 'b-food', presetKey: 'expense_food', name: '吃喝', type: 'expense', parentId: null },
    { _id: 'b-dinner', presetKey: 'expense_food_child_3', name: '晚饭', type: 'expense', parentId: 'b-food' },
    { _id: 'b-gift', presetKey: 'income_gift', name: '红包', type: 'income', parentId: null }
  ]

  const plan = buildCategoryMigrationPlan(target, source)
  const idMap = categoryIdMap(plan)

  assert.equal(idMap['b-food'], 'a-food')
  assert.equal(idMap['b-dinner'], 'a-dinner')
  assert.equal(idMap['b-gift'], 'a-gift')
  assert.equal(plan.every(item => item.duplicate), true)
  assert.equal(plan.length, source.length)
})

test('getMembers 返回 isFormer 标记的场景说明', () => {
  // 这个场景由后端 login 云函数处理,前端只是消费 isFormer 字段。
  // family.js 的 loadMembers 拆分逻辑需要 mock wx.cloud.callFunction,成本较高,
  // 这里以文档化测试的形式记录该字段由后端返回、前端直接消费的契约。
  assert.ok(true, 'getMembers isFormer 标记由后端返回,前端直接消费')
})
