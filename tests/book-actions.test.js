const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')

// 通过 Module._resolveFilename 拦截 wx-server-sdk 的 require,
// 把它指向一个缓存里的 mock 对象,这样 book/index.js 在加载时
// 就能拿到可控的 cloud / db / _。
function loadBookFunction({ book: initialBook, members = [], openId = 'owner-id' }) {
  // 深拷贝一份,避免测试间互相污染
  let book = {
    ...initialBook,
    memberIds: [...(initialBook.memberIds || [])],
    formerMemberIds: [...(initialBook.formerMemberIds || [])]
  }

  // 处理 _.pull / _.addToSet / _.remove / 普通赋值
  function applyUpdate(target, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '__pull' in value) {
        target[key] = (target[key] || []).filter(item => item !== value.__pull)
      } else if (value && typeof value === 'object' && '__addToSet' in value) {
        if (!(target[key] || []).includes(value.__addToSet)) {
          (target[key] = target[key] || []).push(value.__addToSet)
        }
      } else if (value && typeof value === 'object' && '__remove' in value) {
        delete target[key]
      } else {
        target[key] = value
      }
    }
  }

  const db = {
    command: {
      pull: (v) => ({ __pull: v }),
      addToSet: (v) => ({ __addToSet: v }),
      remove: () => ({ __remove: true }),
      or: (conds) => ({ __or: conds }),
      in: (arr) => ({ __in: arr })
    },
    serverDate: () => ({ __serverDate: true }),
    runTransaction: async (fn) => fn({
      collection: () => ({
        doc: () => ({
          update: async ({ data }) => {
            applyUpdate(book, data)
            return { stats: { updated: 1 } }
          }
        })
      })
    }),
    collection: () => ({
      doc: () => ({
        get: async () => ({ data: book }),
        update: async ({ data }) => {
          applyUpdate(book, data)
          return { stats: { updated: 1 } }
        }
      }),
      where: () => ({
        limit: () => ({
          get: async () => ({ data: members })
        }),
        get: async () => ({ data: members })
      }),
      add: async ({ data }) => {
        const id = 'new-id'
        Object.assign(book, data, { _id: id })
        return { _id: id }
      }
    })
  }

  const cloud = {
    init: () => {},
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: () => db,
    getWXContext: () => ({ OPENID: openId })
  }

  const originalResolveFilename = Module._resolveFilename
  const fakeSdkPath = path.resolve(__dirname, '__fake-wx-server-sdk.js')

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request === 'wx-server-sdk') {
      return fakeSdkPath
    }
    return originalResolveFilename.call(this, request, parent, isMain, options)
  }

  require.cache[fakeSdkPath] = {
    id: fakeSdkPath,
    filename: fakeSdkPath,
    loaded: true,
    exports: cloud
  }

  // 重新 require book/index.js,使其用新的 mock 重新求值
  const bookPath = require.resolve('../cloudfunctions/book/index')
  delete require.cache[bookPath]
  const bookModule = require(bookPath)

  return {
    bookModule,
    getBook: () => book,
    cleanup() {
      Module._resolveFilename = originalResolveFilename
      delete require.cache[fakeSdkPath]
      delete require.cache[bookPath]
    }
  }
}

const BOOK_ID = 'book-1'
const OWNER_ID = 'owner-id'
const MEMBER_ID = 'member-id'

function makeBook(overrides = {}) {
  return {
    _id: BOOK_ID,
    name: '家庭账本',
    ownerId: OWNER_ID,
    memberIds: [OWNER_ID, MEMBER_ID],
    formerMemberIds: [],
    ...overrides
  }
}

// ============ removeMember ============

test('removeMember: 管理员成功移除普通成员', async () => {
  const harness = loadBookFunction({
    book: makeBook(),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'removeMember',
      bookId: BOOK_ID,
      targetOpenId: MEMBER_ID,
      isTest: true
    })
    assert.equal(result.success, true)
    const book = harness.getBook()
    assert.equal(book.memberIds.includes(MEMBER_ID), false)
    assert.equal(book.formerMemberIds.includes(MEMBER_ID), true)
  } finally {
    harness.cleanup()
  }
})

test('removeMember: 非管理员被拒', async () => {
  const harness = loadBookFunction({
    book: makeBook({ ownerId: 'other-owner' }),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'removeMember',
      bookId: BOOK_ID,
      targetOpenId: MEMBER_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'PERMISSION_DENIED')
  } finally {
    harness.cleanup()
  }
})

test('removeMember: 管理员移除自己被拒', async () => {
  const harness = loadBookFunction({
    book: makeBook(),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'removeMember',
      bookId: BOOK_ID,
      targetOpenId: OWNER_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'CANNOT_REMOVE_OWNER')
  } finally {
    harness.cleanup()
  }
})

test('removeMember: joinMigration 进行中拒绝', async () => {
  const harness = loadBookFunction({
    book: makeBook({ joinMigration: { phase: 'copying', inviteeOpenId: 'someone' } }),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'removeMember',
      bookId: BOOK_ID,
      targetOpenId: MEMBER_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'JOIN_MIGRATION_IN_PROGRESS')
  } finally {
    harness.cleanup()
  }
})

test('removeMember: 目标不在 memberIds 被拒', async () => {
  const harness = loadBookFunction({
    book: makeBook({ memberIds: [OWNER_ID] }),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'removeMember',
      bookId: BOOK_ID,
      targetOpenId: MEMBER_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'MEMBER_NOT_FOUND')
  } finally {
    harness.cleanup()
  }
})

// ============ transferOwnership ============

test('transferOwnership: 管理员成功转让', async () => {
  const harness = loadBookFunction({
    book: makeBook(),
    members: [{ openId: OWNER_ID, nickName: '管理员小明' }],
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'transferOwnership',
      bookId: BOOK_ID,
      targetOpenId: MEMBER_ID,
      isTest: true
    })
    assert.equal(result.success, true)
    const book = harness.getBook()
    assert.equal(book.ownerId, MEMBER_ID)
    assert.ok(book.transferNotice, 'transferNotice should exist')
    assert.equal(book.transferNotice.fromOpenId, OWNER_ID)
    assert.equal(book.transferNotice.fromNickName, '管理员小明')
    assert.ok(book.transferNotice.transferredAt, 'transferredAt should exist')
  } finally {
    harness.cleanup()
  }
})

test('transferOwnership: 转给自己被拒', async () => {
  const harness = loadBookFunction({
    book: makeBook(),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'transferOwnership',
      bookId: BOOK_ID,
      targetOpenId: OWNER_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'CANNOT_TRANSFER_TO_SELF')
  } finally {
    harness.cleanup()
  }
})

test('transferOwnership: 转给非成员被拒', async () => {
  const harness = loadBookFunction({
    book: makeBook({ memberIds: [OWNER_ID] }),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'transferOwnership',
      bookId: BOOK_ID,
      targetOpenId: MEMBER_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'TARGET_NOT_MEMBER')
  } finally {
    harness.cleanup()
  }
})

test('transferOwnership: 非管理员转让被拒', async () => {
  const harness = loadBookFunction({
    book: makeBook({ ownerId: 'other-owner' }),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'transferOwnership',
      bookId: BOOK_ID,
      targetOpenId: MEMBER_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'PERMISSION_DENIED')
  } finally {
    harness.cleanup()
  }
})

test('transferOwnership: joinMigration 进行中拒绝', async () => {
  const harness = loadBookFunction({
    book: makeBook({ joinMigration: { phase: 'copying', inviteeOpenId: 'someone' } }),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'transferOwnership',
      bookId: BOOK_ID,
      targetOpenId: MEMBER_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'JOIN_MIGRATION_IN_PROGRESS')
  } finally {
    harness.cleanup()
  }
})

// ============ acknowledgeTransfer ============

test('acknowledgeTransfer: 新管理员确认通知', async () => {
  const notice = {
    fromOpenId: 'old-owner',
    fromNickName: '原管理员',
    transferredAt: new Date()
  }
  const harness = loadBookFunction({
    book: makeBook({ transferNotice: notice }),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'acknowledgeTransfer',
      bookId: BOOK_ID,
      isTest: true
    })
    assert.equal(result.success, true)
    const book = harness.getBook()
    assert.equal(book.transferNotice, undefined)
  } finally {
    harness.cleanup()
  }
})

test('acknowledgeTransfer: 无通知时确认被拒', async () => {
  const harness = loadBookFunction({
    book: makeBook(),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'acknowledgeTransfer',
      bookId: BOOK_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'NO_TRANSFER_NOTICE')
  } finally {
    harness.cleanup()
  }
})

test('acknowledgeTransfer: 非管理员确认被拒', async () => {
  const notice = {
    fromOpenId: 'old-owner',
    fromNickName: '原管理员',
    transferredAt: new Date()
  }
  const harness = loadBookFunction({
    book: makeBook({ ownerId: 'other-owner', transferNotice: notice }),
    openId: OWNER_ID
  })
  try {
    const result = await harness.bookModule.main({
      action: 'acknowledgeTransfer',
      bookId: BOOK_ID,
      isTest: true
    })
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'PERMISSION_DENIED')
  } finally {
    harness.cleanup()
  }
})
