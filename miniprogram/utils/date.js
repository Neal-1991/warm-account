// miniprogram/utils/date.js

/**
 * Format date as "M/D" (e.g., "5/5")
 * @param {Date|string} date - date to format
 * @returns {string} formatted date
 */
export function formatDate(date) {
  const d = new Date(date)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * Format date as "YYYY年M月D日" (e.g., "2026年5月5日")
 * @param {Date|string} date - date to format
 * @returns {string} formatted date
 */
export function formatDateDisplay(date) {
  const d = new Date(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/**
 * Get current month in "YYYY-MM" format
 * @returns {string} current month
 */
export function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Parse month string to year and month
 * @param {string} month - month in "YYYY-MM" format
 * @returns {Object} { year, month }
 */
export function parseMonth(month) {
  const [year, monthNum] = month.split('-').map(Number)
  return { year, month: monthNum }
}

/**
 * Format month for display "YYYY年M月"
 * @param {string} month - month in "YYYY-MM" format
 * @returns {string} formatted month
 */
export function formatMonthDisplay(month) {
  const { year, month: monthNum } = parseMonth(month)
  return `${year}年${monthNum}月`
}

/**
 * Get previous month
 * @param {string} month - month in "YYYY-MM" format
 * @returns {string} previous month
 */
export function getPrevMonth(month) {
  const { year, month: monthNum } = parseMonth(month)
  const date = new Date(year, monthNum - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Get next month
 * @param {string} month - month in "YYYY-MM" format
 * @returns {string} next month
 */
export function getNextMonth(month) {
  const { year, month: monthNum } = parseMonth(month)
  const date = new Date(year, monthNum, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export default {
  formatDate,
  formatDateDisplay,
  getCurrentMonth,
  parseMonth,
  formatMonthDisplay,
  getPrevMonth,
  getNextMonth
}