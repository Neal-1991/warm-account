function findBigCategory(categories, preset) {
  return categories.find(category =>
    category.parentId === null && category.presetKey === preset.key
  ) || categories.find(category =>
    category.parentId === null &&
    category.isSystem !== false &&
    category.type === preset.type &&
    category.name === preset.name
  )
}

function findChildCategory(categories, parentId, presetKey, name) {
  return categories.find(category =>
    category.parentId === parentId && category.presetKey === presetKey
  ) || categories.find(category =>
    category.parentId === parentId &&
    category.isSystem !== false &&
    category.name === name
  )
}

function childPresetKey(parentKey, index) {
  return `${parentKey}_child_${index + 1}`
}

function missingBigPresets(categories, presets) {
  return presets.filter(preset => !findBigCategory(categories, preset))
}

module.exports = {
  findBigCategory,
  findChildCategory,
  childPresetKey,
  missingBigPresets
}
