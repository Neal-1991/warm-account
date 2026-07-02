const {
  bigCategoryKeys,
  childCategoryKeys,
  firstMappedValue
} = require('./category-merge-utils')

function buildCategoryMigrationPlan(targetCategories, sourceCategories) {
  const targetBigs = targetCategories.filter(category => category.parentId === null)
  const sourceBigs = sourceCategories.filter(category => category.parentId === null)
  const targetChildren = targetCategories.filter(category => category.parentId !== null)
  const sourceChildren = sourceCategories.filter(category => category.parentId !== null)

  const targetBigLookup = new Map()
  const targetBigById = new Map()
  for (const category of targetBigs) {
    targetBigById.set(category._id, category)
    for (const key of bigCategoryKeys(category)) {
      if (!targetBigLookup.has(key)) {
        targetBigLookup.set(key, category._id)
      }
    }
  }

  const sourceBigById = new Map(sourceBigs.map(category => [category._id, category]))
  const bigTargetBySourceId = new Map()
  const plan = []

  for (const category of sourceBigs) {
    const matchedId = firstMappedValue(targetBigLookup, bigCategoryKeys(category))
    const targetId = matchedId || category._id
    bigTargetBySourceId.set(category._id, targetId)
    plan.push({
      sourceId: category._id,
      targetId,
      parentId: null,
      duplicate: Boolean(matchedId)
    })
  }

  const targetChildLookup = new Map()
  for (const category of targetChildren) {
    const parent = targetBigById.get(category.parentId)
    if (!parent) continue
    for (const key of childCategoryKeys(category, bigCategoryKeys(parent))) {
      if (!targetChildLookup.has(key)) {
        targetChildLookup.set(key, category._id)
      }
    }
  }

  for (const category of sourceChildren) {
    const sourceParent = sourceBigById.get(category.parentId)
    const targetParentId = bigTargetBySourceId.get(category.parentId)
    if (!sourceParent || !targetParentId) {
      plan.push({
        sourceId: category._id,
        targetId: category._id,
        parentId: category.parentId,
        duplicate: false,
        invalidParent: true
      })
      continue
    }

    const parentWasMerged = targetParentId !== category.parentId
    const matchedId = parentWasMerged
      ? firstMappedValue(
        targetChildLookup,
        childCategoryKeys(category, bigCategoryKeys(sourceParent))
      )
      : null

    plan.push({
      sourceId: category._id,
      targetId: matchedId || category._id,
      parentId: targetParentId,
      duplicate: Boolean(matchedId)
    })
  }

  return plan
}

function categoryIdMap(plan) {
  return plan.reduce((result, item) => {
    result[item.sourceId] = item.targetId
    return result
  }, {})
}

function migrationProgress(state) {
  const total = state.plan ? state.plan.length : 0
  const current = Math.min(state.cursor || 0, total)
  return {
    phase: state.phase,
    current,
    total,
    movedRecords: state.movedRecords || 0
  }
}

module.exports = {
  buildCategoryMigrationPlan,
  categoryIdMap,
  migrationProgress
}
