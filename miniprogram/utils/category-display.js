const { iconForCategory } = require('./category-icons')

const FALLBACK_ICON = '📌'
const FALLBACK_NAME = '未分类'

function fallbackIconInfo() {
  return iconForCategory(null, FALLBACK_ICON)
}

function buildCategoryDisplayMap(categories) {
  const bigById = new Map()
  const displayById = {}

  for (const category of categories || []) {
    if (category.parentId === null) {
      bigById.set(category._id, category)
      displayById[category._id] = {
        name: category.name,
        icon: category.icon || FALLBACK_ICON,
        iconInfo: iconForCategory(category, FALLBACK_ICON),
        parentName: category.name,
        valid: true,
        isBigCategory: true
      }
    }
  }

  for (const category of categories || []) {
    if (category.parentId === null) continue
    const parent = bigById.get(category.parentId)
    if (!parent) {
      displayById[category._id] = {
        name: FALLBACK_NAME,
        icon: FALLBACK_ICON,
        iconInfo: fallbackIconInfo(),
        parentName: FALLBACK_NAME,
        valid: false,
        isBigCategory: false,
        reason: 'missing_parent',
        originalName: category.name
      }
      continue
    }
    displayById[category._id] = {
      name: category.name,
      icon: parent.icon || FALLBACK_ICON,
      iconInfo: iconForCategory(parent, FALLBACK_ICON),
      parentName: parent.name,
      valid: true,
      isBigCategory: false
    }
  }

  return displayById
}

function resolveCategoryDisplay(displayMap, categoryId) {
  return displayMap[categoryId] || {
    name: FALLBACK_NAME,
    icon: FALLBACK_ICON,
    iconInfo: fallbackIconInfo(),
    parentName: FALLBACK_NAME,
    valid: false,
    isBigCategory: false,
    reason: 'missing_category'
  }
}

function aggregateByParent(records, displayMap) {
  const amountMap = {}
  for (const group of aggregateByParentDetails(records, displayMap)) {
    amountMap[group.name] = group.amount
  }
  return amountMap
}

function aggregateByParentDetails(records, displayMap) {
  const groupMap = {}
  for (const record of records || []) {
    const display = resolveCategoryDisplay(displayMap, record.categoryId)
    const name = display.parentName
    if (!groupMap[name]) {
      groupMap[name] = {
        name,
        icon: display.icon,
        iconInfo: display.iconInfo,
        amount: 0
      }
    }
    groupMap[name].amount += record.amount
  }
  return Object.values(groupMap)
}

module.exports = {
  FALLBACK_ICON,
  FALLBACK_NAME,
  buildCategoryDisplayMap,
  resolveCategoryDisplay,
  aggregateByParent,
  aggregateByParentDetails
}
