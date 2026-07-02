function bigCategoryKeys(category) {
  const keys = []
  if (category.presetKey) {
    keys.push(`preset:${category.presetKey}`)
  }
  keys.push(`name:${category.name}:${category.type}`)
  return keys
}

function childCategoryKeys(category, parentKeys) {
  const keys = []
  if (category.presetKey) {
    keys.push(`preset:${category.presetKey}`)
  }
  for (const parentKey of parentKeys) {
    keys.push(`${parentKey}:child:${category.name}`)
  }
  return keys
}

function firstMappedValue(map, keys) {
  for (const key of keys) {
    if (map.has(key)) {
      return map.get(key)
    }
  }
  return null
}

module.exports = {
  bigCategoryKeys,
  childCategoryKeys,
  firstMappedValue
}
