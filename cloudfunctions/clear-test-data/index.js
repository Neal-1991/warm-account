// cloudfunctions/clear-test-data/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTIONS = ['books', 'records', 'categories', 'members', 'budgets']
const PRODUCTION_CONFIRMATION = 'RESET_WARM_ACCOUNT_PRODUCTION'

// 获取集合全部数据（支持超过 100 条的分页）
async function getAllData(collection) {
  const MAX_LIMIT = 100
  const countResult = await collection.count()
  const total = countResult.total
  const allData = []
  for (let i = 0; i < total; i += MAX_LIMIT) {
    const batch = await collection.skip(i).limit(MAX_LIMIT).get()
    allData.push(...batch.data)
  }
  return allData
}

exports.main = async (event, context) => {
  const isProduction = event.target === 'production'
  const suffix = isProduction ? '_prod' : '_test'
  const label = isProduction ? '生产' : '测试'

  if (isProduction) {
    const openId = cloud.getWXContext().OPENID
    const allowedOpenId = process.env.PRODUCTION_RESET_OPENID
    if (!allowedOpenId) {
      return { success: false, error: 'PRODUCTION_RESET_OPENID is not configured' }
    }
    if (openId !== allowedOpenId) {
      return { success: false, error: 'permission denied' }
    }
    if (event.confirmation !== PRODUCTION_CONFIRMATION) {
      return { success: false, error: 'production reset confirmation mismatch' }
    }
  }

  const results = []

  const addCloudFileId = (fileIds, value) => {
    if (typeof value === 'string' && value.startsWith('cloud://')) {
      fileIds.add(value)
    }
  }

  // 1. 清理云存储图片
  try {
    const recordsCol = db.collection(`records${suffix}`)
    const membersCol = db.collection(`members${suffix}`)
    const countResult = await recordsCol.count()
    console.log(`[clear-test-data] ${label} records count: ${countResult.total}`)

    const allRecords = await getAllData(recordsCol)
    const allMembers = await getAllData(membersCol)
    const fileIds = new Set()
    for (const record of allRecords) {
      if (record.images && record.images.length > 0) {
        for (const img of record.images) {
          addCloudFileId(fileIds, img)
        }
      }
    }
    for (const member of allMembers) {
      addCloudFileId(fileIds, member.avatarUrl)
    }

    const fileList = Array.from(fileIds)
    console.log(`[clear-test-data] found ${fileList.length} cloud file IDs:`, fileList)

    if (fileList.length > 0) {
      const BATCH_SIZE = 50
      let totalDeleted = 0
      let totalFailed = 0
      for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
        const batch = fileList.slice(i, i + BATCH_SIZE)
        const res = await cloud.deleteFile({ fileList: batch })
        // 检查每个文件的删除状态
        if (res && res.fileList) {
          for (const f of res.fileList) {
            if (f.status === 0) {
              totalDeleted++
            } else {
              totalFailed++
              console.error(`[clear-test-data] delete file failed: ${f.fileID}, status: ${f.status}, errMsg: ${f.errMsg}`)
            }
          }
        }
      }
      results.push({
        collection: 'cloud_storage',
        success: true,
        deletedCount: totalDeleted,
        failedCount: totalFailed
      })
    } else {
      results.push({
        collection: 'cloud_storage',
        success: true,
        deletedCount: 0,
        failedCount: 0,
        note: 'no cloud file IDs found in records'
      })
    }
  } catch (err) {
    console.error('[clear-test-data] cloud_storage error:', err)
    results.push({
      collection: 'cloud_storage',
      success: false,
      error: err.message
    })
  }

  // 2. 清理数据库集合
  for (const colName of COLLECTIONS) {
    const fullName = `${colName}${suffix}`
    try {
      const col = db.collection(fullName)
      const allData = await getAllData(col)

      for (const item of allData) {
        await db.collection(fullName).doc(item._id).remove()
      }

      results.push({
        collection: fullName,
        success: true,
        deletedCount: allData.length
      })
    } catch (err) {
      console.error(`[clear-test-data] ${fullName} error:`, err)
      results.push({
        collection: fullName,
        success: false,
        error: err.message
      })
    }
  }

  console.log('[clear-test-data] results:', JSON.stringify(results))
  return {
    success: true,
    target: isProduction ? 'production' : 'test',
    message: `${label}数据清理完成`,
    results
  }
}
