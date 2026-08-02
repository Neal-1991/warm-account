const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')

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

test('被转让方 restoreSession 返回 transferred 时,ensureSession 缓存 transferNotice 且保持 authenticated', async () => {
  const harness = loadApp({
    initialStorage: {
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: { nickName: 'B', avatarUrl: '' }
    },
    restoreResult: {
      success: true,
      authenticated: true,
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: { nickName: 'B', avatarUrl: '' },
      transferred: true,
      fromNickName: '原管理员',
      transferredAt: '2026-07-28T00:00:00.000Z'
    }
  })
  try {
    harness.app.onLaunch()
    const session = await harness.app.sessionReady
    assert.equal(session.authenticated, true)
    assert.equal(session.bookId, 'book-family')
    const notice = harness.storage.get('transferNotice')
    assert.deepEqual(notice, {
      fromNickName: '原管理员',
      transferredAt: '2026-07-28T00:00:00.000Z'
    })
  } finally {
    harness.cleanup()
  }
})

test('正常 session 无 transferred 字段时不缓存 transferNotice', async () => {
  const harness = loadApp({
    initialStorage: {
      openId: 'openid-b',
      bookId: 'book-family'
    },
    restoreResult: {
      success: true,
      authenticated: true,
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: { nickName: 'B', avatarUrl: '' }
    }
  })
  try {
    harness.app.onLaunch()
    await harness.app.sessionReady
    assert.equal(harness.storage.has('transferNotice'), false)
  } finally {
    harness.cleanup()
  }
})

test('被转让方 session 完整保留 openId 和 userInfo', async () => {
  const harness = loadApp({
    initialStorage: {
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: { nickName: '旧昵称', avatarUrl: '' }
    },
    restoreResult: {
      success: true,
      authenticated: true,
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: { nickName: 'B', avatarUrl: 'https://example.test/b.jpg' },
      transferred: true,
      fromNickName: '原管理员',
      transferredAt: '2026-07-28T00:00:00.000Z'
    }
  })
  try {
    harness.app.onLaunch()
    const session = await harness.app.sessionReady
    assert.equal(session.authenticated, true)
    assert.equal(session.openId, 'openid-b')
    assert.equal(session.bookId, 'book-family')
    assert.equal(session.userInfo.nickName, 'B')
    assert.equal(session.userInfo.avatarUrl, 'https://example.test/b.jpg')
    assert.equal(harness.app.getOpenId(), 'openid-b')
    assert.equal(harness.app.getBookId(), 'book-family')
  } finally {
    harness.cleanup()
  }
})
