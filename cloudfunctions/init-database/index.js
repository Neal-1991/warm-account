const cloud = require('wx-server-sdk')
const {
  CATEGORY_SCHEMA_VERSION,
  ALL_PRESETS
} = require('./presets')
const {
  findBigCategory,
  findChildCategory,
  childPresetKey
} = require('./preset-utils')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const PAGE_SIZE = 100

const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}

async function getAll(query) {
  const result = []
  let offset = 0

  while (true) {
    const batch = await query.skip(offset).limit(PAGE_SIZE).get()
    result.push(...batch.data)
    if (batch.data.length < PAGE_SIZE) {
      return result
    }
    offset += batch.data.length
  }
}

async function ensureBookPresets(event, bookId) {
  const collectionName = name => getCollectionName(event, name)
  const books = db.collection(collectionName('books'))
  const categories = db.collection(collectionName('categories'))
  const bookResult = await books.doc(bookId).get()
  const book = bookResult.data

  if (!book) {
    return { success: false, error: 'book not found' }
  }
  if ((book.categorySchemaVersion || 0) >= CATEGORY_SCHEMA_VERSION) {
    return {
      success: true,
      categorySchemaVersion: CATEGORY_SCHEMA_VERSION,
      message: 'category schema already current'
    }
  }

  const existingCategories = await getAll(categories.where({ bookId }))
  let createdBig = 0
  let createdChild = 0
  let taggedExisting = 0

  const resolvedParents = await Promise.all(ALL_PRESETS.map(async preset => {
    const existing = findBigCategory(existingCategories, preset)
    if (existing) {
      const nextIconKey = preset.iconKey || ''
      if (existing.presetKey !== preset.key || (existing.iconKey || '') !== nextIconKey) {
        await categories.doc(existing._id).update({
          data: {
            presetKey: preset.key,
            iconKey: nextIconKey,
            type: preset.type,
            order: preset.order,
            isSystem: true
          }
        })
        existing.presetKey = preset.key
        existing.iconKey = nextIconKey
        taggedExisting++
      }
      return { preset, parentId: existing._id }
    }

    const { _id: parentId } = await categories.add({
      data: {
        presetKey: preset.key,
        name: preset.name,
        icon: preset.icon,
        iconKey: preset.iconKey || '',
        order: preset.order,
        type: preset.type,
        isVisible: true,
        isSystem: true,
        parentId: null,
        bookId
      }
    })
    existingCategories.push({
      _id: parentId,
      presetKey: preset.key,
      name: preset.name,
      icon: preset.icon,
      iconKey: preset.iconKey || '',
      order: preset.order,
      type: preset.type,
      isVisible: true,
      isSystem: true,
      parentId: null,
      bookId
    })
    createdBig++
    return { preset, parentId }
  }))

  const childWrites = []
  for (const { preset, parentId } of resolvedParents) {
    preset.children.forEach((childName, index) => {
      const presetKey = childPresetKey(preset.key, index)
      const existing = findChildCategory(existingCategories, parentId, presetKey, childName)
      if (existing) {
        if (existing.presetKey !== presetKey) {
          childWrites.push(categories.doc(existing._id).update({
            data: {
              presetKey,
              type: preset.type,
              isSystem: true
            }
          }))
          taggedExisting++
        }
        return
      }

      childWrites.push(categories.add({
        data: {
          presetKey,
          name: childName,
          icon: '',
          order: index + 1,
          type: preset.type,
          isVisible: true,
          isSystem: true,
          parentId,
          bookId
        }
      }))
      createdChild++
    })
  }
  await Promise.all(childWrites)

  // 只有全部分类写入成功后才推进版本；中断时下次登录会继续补齐。
  await books.doc(bookId).update({
    data: {
      categorySchemaVersion: CATEGORY_SCHEMA_VERSION,
      updatedAt: db.serverDate()
    }
  })

  return {
    success: true,
    categorySchemaVersion: CATEGORY_SCHEMA_VERSION,
    createdBig,
    createdChild,
    taggedExisting
  }
}

async function updateSystemPresets(event) {
  const collectionName = name => getCollectionName(event, name)
  const categories = db.collection(collectionName('categories'))
  const batchStart = Number.isInteger(event.batchStart) ? event.batchStart : 0
  const batchSize = Number.isInteger(event.batchSize) && event.batchSize > 0 ? event.batchSize : null
  const targetPresets = batchSize ? ALL_PRESETS.slice(batchStart, batchStart + batchSize) : ALL_PRESETS
  const existingCategories = await getAll(categories.where({ bookId: null }))
  let updated = 0
  let created = 0
  let childrenCreated = 0

  for (const preset of targetPresets) {
    let parent = findBigCategory(existingCategories, preset)
    if (!parent) {
      const { _id } = await categories.add({
        data: {
          presetKey: preset.key,
          name: preset.name,
          icon: preset.icon,
          iconKey: preset.iconKey || '',
          order: preset.order,
          type: preset.type,
          isVisible: true,
          isSystem: true,
          parentId: null,
          bookId: null
        }
      })
      parent = { _id, ...preset, presetKey: preset.key, parentId: null, bookId: null, isSystem: true }
      existingCategories.push(parent)
      created++
    } else {
      await categories.doc(parent._id).update({
        data: {
          presetKey: preset.key,
          icon: preset.icon,
          iconKey: preset.iconKey || '',
          order: preset.order,
          type: preset.type,
          isSystem: true
        }
      })
      updated++
    }

    for (let index = 0; index < preset.children.length; index++) {
      const childName = preset.children[index]
      const presetKey = childPresetKey(preset.key, index)
      const child = findChildCategory(existingCategories, parent._id, presetKey, childName)
      if (!child) {
        const { _id } = await categories.add({
          data: {
            presetKey,
            name: childName,
            icon: '',
            order: index + 1,
            type: preset.type,
            isVisible: true,
            isSystem: true,
            parentId: parent._id,
            bookId: null
          }
        })
        existingCategories.push({
          _id,
          presetKey,
          name: childName,
          parentId: parent._id,
          type: preset.type,
          isSystem: true,
          bookId: null
        })
        childrenCreated++
      }
    }
  }

  return {
    success: true,
    updated,
    created,
    childrenCreated,
    batchStart,
    batchSize: batchSize || ALL_PRESETS.length,
    processed: targetPresets.length,
    done: !batchSize || batchStart + batchSize >= ALL_PRESETS.length,
    total: ALL_PRESETS.length
  }
}

exports.main = async (event) => {
  const { bookId, action } = event

  try {
    if (action === 'updateSystemPresets') {
      return await updateSystemPresets(event)
    }
    if (!bookId) {
      return { success: false, error: 'bookId is required for init-database' }
    }
    return await ensureBookPresets(event, bookId)
  } catch (err) {
    console.error('init-database error:', err)
    return { success: false, error: err.message }
  }
}

exports.ensureBookPresets = ensureBookPresets
exports.updateSystemPresets = updateSystemPresets
exports.getCollectionName = getCollectionName
