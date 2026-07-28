const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')

const {
  generateUniqueInviteCode,
  isInviteExpired
} = require('../cloudfunctions/book/invite-utils')
const {
  createJoinMigrationService
} = require('../cloudfunctions/book/join-migration')
const {
  isInviteActive,
  reasonFromErrorCode
} = require('../miniprogram/utils/invite')

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

test('cold start restores a missing identity while preserving the saved profile', async () => {
  const harness = loadApp({
    initialStorage: {
      userInfo: { nickName: 'B', avatarUrl: 'https://example.test/avatar.jpg' }
    },
    restoreResult: {
      success: true,
      authenticated: true,
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: null
    }
  })

  try {
    harness.app.onLaunch()
    const session = await harness.app.sessionReady
    assert.equal(session.authenticated, true)
    assert.equal(harness.app.getOpenId(), 'openid-b')
    assert.equal(harness.app.getBookId(), 'book-family')
    assert.equal(harness.app.getUserInfo().nickName, 'B')
    assert.equal(harness.storage.get('bookId'), 'book-family')
  } finally {
    harness.cleanup()
  }
})

test('server session correction replaces a stale local book id', async () => {
  const harness = loadApp({
    initialStorage: {
      openId: 'openid-b',
      bookId: 'deleted-personal-book',
      userInfo: { nickName: 'B', avatarUrl: '' }
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
    assert.equal(harness.app.getBookId(), 'book-family')
    assert.equal(harness.storage.get('bookId'), 'book-family')
  } finally {
    harness.cleanup()
  }
})

test('manual logout blocks silent session restoration', async () => {
  const harness = loadApp({
    initialStorage: {
      manualLogout: true,
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: { nickName: 'B', avatarUrl: '' }
    },
    restoreResult: {
      success: true,
      authenticated: true,
      openId: 'openid-b',
      bookId: 'book-family'
    }
  })

  try {
    harness.app.onLaunch()
    const session = await harness.app.sessionReady
    assert.equal(session.authenticated, false)
    assert.equal(session.manualLogout, true)
    assert.equal(harness.getCallCount(), 0)
    assert.equal(harness.app.getOpenId(), null)
    assert.equal(harness.app.getUserInfo(), null)
  } finally {
    harness.cleanup()
  }
})

test('failed remote restoration clears a partial local profile', async () => {
  const harness = loadApp({
    initialStorage: {
      userInfo: { nickName: 'B', avatarUrl: 'https://example.test/avatar.jpg' }
    },
    restoreError: new Error('network unavailable')
  })

  try {
    harness.app.onLaunch()
    const session = await harness.app.sessionReady
    assert.equal(session.authenticated, false)
    assert.equal(session.restoreFailed, true)
    assert.equal(harness.app.getUserInfo(), null)
    assert.equal(harness.storage.has('userInfo'), false)
  } finally {
    harness.cleanup()
  }
})

test('active login clears the manual logout marker', () => {
  const harness = loadApp({
    initialStorage: { manualLogout: true },
    restoreResult: { success: true, authenticated: false }
  })

  try {
    harness.app.setSession({
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: { nickName: 'B', avatarUrl: '' }
    })
    assert.equal(harness.storage.has('manualLogout'), false)
    assert.equal(harness.app.getBookId(), 'book-family')
  } finally {
    harness.cleanup()
  }
})

test('a late restore response cannot undo an explicit logout', async () => {
  let resolveRestore
  const harness = loadApp({
    initialStorage: {
      openId: 'openid-b',
      bookId: 'book-family',
      userInfo: { nickName: 'B', avatarUrl: '' }
    },
    restoreResult: null
  })
  global.wx.cloud.callFunction = () => new Promise(resolve => {
    resolveRestore = resolve
  })

  try {
    harness.app.onLaunch()
    harness.app.logout()
    resolveRestore({
      result: {
        success: true,
        authenticated: true,
        openId: 'openid-b',
        bookId: 'book-family',
        userInfo: { nickName: 'B', avatarUrl: '' }
      }
    })
    const session = await harness.app.sessionReady
    assert.equal(session.authenticated, false)
    assert.equal(session.manualLogout, true)
    assert.equal(harness.app.getBookId(), null)
  } finally {
    harness.cleanup()
  }
})

test('invite helpers enforce the one-hour server deadline', () => {
  const now = Date.parse('2026-06-12T12:00:00Z')
  assert.equal(isInviteExpired(new Date(now + 1), now), false)
  assert.equal(isInviteExpired(new Date(now), now), true)
  assert.equal(isInviteExpired(null, now), true)
  assert.equal(isInviteActive('123456', new Date(now + 1), now), true)
  assert.equal(isInviteActive('123456', new Date(now), now), false)
  assert.equal(reasonFromErrorCode('INVITE_EXPIRED'), 'expired')
})

test('invite generation retries colliding codes', async () => {
  const randomValues = [0, 0.5]
  const checked = []
  const code = await generateUniqueInviteCode(async candidate => {
    checked.push(candidate)
    return candidate === '100000'
  }, () => randomValues.shift())

  assert.equal(code, '550000')
  assert.deepEqual(checked, ['100000', '550000'])
})

function createInviteMigrationHarness(targetBook) {
  const state = {
    books_test: [{ ...targetBook }],
    categories_test: [],
    records_test: []
  }
  const matches = (item, condition) => Object.entries(condition)
    .every(([key, value]) => item[key] === value)
  const applyData = (item, data) => {
    Object.assign(item, data)
  }
  const makeQuery = (items, offset = 0, limit = 100) => ({
    skip(value) {
      return makeQuery(items, value, limit)
    },
    limit(value) {
      return makeQuery(items, offset, value)
    },
    async get() {
      return { data: items.slice(offset, offset + limit).map(item => ({ ...item })) }
    },
    async update({ data }) {
      items.forEach(item => applyData(item, data))
      return { stats: { updated: items.length } }
    }
  })
  const db = {
    collection(name) {
      const items = state[name] || (state[name] = [])
      return {
        doc(id) {
          return {
            async get() {
              const item = items.find(entry => entry._id === id)
              return { data: item ? { ...item } : null }
            },
            async update({ data }) {
              const item = items.find(entry => entry._id === id)
              if (!item) throw new Error('not found')
              applyData(item, data)
              return { stats: { updated: 1 } }
            },
            async remove() {
              const index = items.findIndex(entry => entry._id === id)
              if (index >= 0) items.splice(index, 1)
            }
          }
        },
        where(condition) {
          return makeQuery(items.filter(item => matches(item, condition)))
        }
      }
    },
    serverDate() {
      return new Date()
    }
  }
  const command = {
    addToSet(value) {
      return value
    },
    remove() {
      return undefined
    }
  }

  return {
    state,
    service: createJoinMigrationService({
      db,
      command,
      collectionName: name => `${name}_test`
    })
  }
}

test('an expired invite cannot start a new migration', async () => {
  const harness = createInviteMigrationHarness({
    _id: 'target-book',
    ownerId: 'A',
    memberIds: ['A'],
    inviteCode: '123456',
    inviteCodeExpire: new Date(Date.now() - 1000),
    inviteCodeUsedBy: null
  })

  await assert.rejects(
    harness.service.run({
      targetBook: { ...harness.state.books_test[0] },
      sourceBookId: '',
      openId: 'B',
      inviteCode: '123456'
    }),
    error => error.code === 'INVITE_EXPIRED'
  )
})

test('an invite that expires after validation is rejected when join starts', async () => {
  const harness = createInviteMigrationHarness({
    _id: 'target-book',
    ownerId: 'A',
    memberIds: ['A'],
    inviteCode: '123456',
    inviteCodeExpire: new Date(Date.now() - 1000),
    inviteCodeUsedBy: null
  })
  const validatedSnapshot = {
    ...harness.state.books_test[0],
    inviteCodeExpire: new Date(Date.now() + 60 * 1000)
  }

  await assert.rejects(
    harness.service.run({
      targetBook: validatedSnapshot,
      sourceBookId: '',
      openId: 'B',
      inviteCode: '123456'
    }),
    error => error.code === 'INVITE_EXPIRED'
  )
})

test('a migration accepted before expiry can continue after expiry', async () => {
  const harness = createInviteMigrationHarness({
    _id: 'target-book',
    ownerId: 'A',
    memberIds: ['A'],
    inviteCode: '123456',
    inviteCodeExpire: new Date(Date.now() - 1000),
    inviteCodeUsedBy: 'B',
    joinMigration: {
      version: 1,
      inviteeOpenId: 'B',
      sourceBookId: '',
      acceptedAt: new Date(Date.now() - 60 * 60 * 1000),
      phase: 'planning',
      cursor: 0,
      plan: [],
      movedRecords: 0
    }
  })

  const result = await harness.service.run({
    targetBook: { ...harness.state.books_test[0] },
    sourceBookId: '',
    openId: 'B',
    inviteCode: '123456'
  })

  assert.equal(result.status, 'processing')
  assert.equal(result.bookId, 'target-book')
})

test('first acceptance persists acceptedAt before migration work starts', async () => {
  const harness = createInviteMigrationHarness({
    _id: 'target-book',
    ownerId: 'A',
    memberIds: ['A'],
    inviteCode: '123456',
    inviteCodeExpire: new Date(Date.now() + 60 * 1000),
    inviteCodeUsedBy: null
  })

  await harness.service.run({
    targetBook: { ...harness.state.books_test[0] },
    sourceBookId: '',
    openId: 'B',
    inviteCode: '123456'
  })

  const migration = harness.state.books_test[0].joinMigration
  assert.equal(migration.inviteeOpenId, 'B')
  assert.ok(migration.acceptedAt)
})
