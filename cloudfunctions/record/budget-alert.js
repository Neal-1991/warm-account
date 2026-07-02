function percent(usedAmount, limitAmount) {
  if (!limitAmount) return 0
  return usedAmount / limitAmount * 100
}

function crossingLevel(previousUsed, nextUsed, limitAmount) {
  const previousPercent = percent(previousUsed, limitAmount)
  const nextPercent = percent(nextUsed, limitAmount)
  if (previousPercent < 100 && nextPercent >= 100) return 'over'
  if (previousPercent < 80 && nextPercent >= 80) return 'warning'
  return ''
}

function buildAlert(scope, previousUsed, nextUsed, limitAmount, category, options = {}) {
  const level = crossingLevel(previousUsed, nextUsed, limitAmount)
  const continuedOver = options.repeatOver === true &&
    previousUsed >= limitAmount &&
    nextUsed > previousUsed
  if (!level && !continuedOver) return null
  return {
    level: level || 'over',
    scope,
    trigger: level ? 'threshold' : 'continued-over',
    categoryId: category?.categoryId || '',
    categoryName: category?.name || '',
    usedAmount: nextUsed,
    limitAmount,
    remainingAmount: limitAmount - nextUsed,
    percent: Math.round(percent(nextUsed, limitAmount) * 10) / 10
  }
}

function selectBudgetAlert(input) {
  const alerts = []
  const totalAlert = buildAlert(
    'total',
    input.previousTotal,
    input.nextTotal,
    input.totalLimit
  )
  if (totalAlert) alerts.push(totalAlert)

  if (input.categoryLimit) {
    const categoryAlert = buildAlert(
      'category',
      input.previousCategory,
      input.nextCategory,
      input.categoryLimit.amount,
      input.categoryLimit,
      { repeatOver: true }
    )
    if (categoryAlert) alerts.push(categoryAlert)
  }

  const priority = alert => {
    if (alert.scope === 'category' && alert.level === 'over') return 4
    if (alert.scope === 'total' && alert.level === 'over') return 3
    if (alert.scope === 'category' && alert.level === 'warning') return 2
    return 1
  }

  return alerts.sort((left, right) => priority(right) - priority(left))[0] || null
}

module.exports = {
  percent,
  crossingLevel,
  selectBudgetAlert
}
