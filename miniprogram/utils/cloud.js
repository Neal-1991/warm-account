// miniprogram/utils/cloud.js
const config = require('./config')

let initialized = false
let db = null

/**
 * Initialize cloud database
 * @returns {Object} database instance
 */
export function initCloud() {
  if (!initialized) {
    wx.cloud.init({ env: config.env })
    initialized = true
  }
  return getDb()
}

/**
 * Get database instance (lazy initialization)
 * @returns {Object} database instance
 */
export function getDb() {
  if (!db) {
    initCloud()
    db = wx.cloud.database()
  }
  return db
}

/**
 * Call cloud function with error handling
 * @param {string} name - cloud function name
 * @param {Object} data - parameters to pass
 * @returns {Promise}
 */
export function callFunction(name, data) {
  return wx.cloud.callFunction({
    name,
    data
  }).then(res => {
    if (!res.result) {
      throw new Error('No result returned from cloud function')
    }
    return res.result
  }).catch(err => {
    console.error(`callFunction ${name} error:`, err)
    throw err
  })
}

export default { initCloud, getDb, callFunction }