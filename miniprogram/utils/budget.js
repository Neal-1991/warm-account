function centsToYuan(amount) {
  return ((amount || 0) / 100).toFixed(2)
}

function progressWidth(percent) {
  return Math.max(0, Math.min(Number(percent) || 0, 100))
}

function daysRemainingInMonth(month, now = new Date()) {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (month !== currentMonth) return 0
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.max(lastDay - now.getDate() + 1, 1)
}

function buildBudgetView(result, month, now = new Date()) {
  if (!result?.success || !result.budget) {
    return {
      configured: false,
      canEdit: !!result?.canEdit,
      isHistorical: !!result?.isHistorical,
      usedAmount: centsToYuan(result?.usage?.totalUsed || 0)
    }
  }

  const total = result.usage.total
  const remainingDays = daysRemainingInMonth(month, now)
  let paceText = ''
  if (remainingDays > 0) {
    paceText = total.remainingAmount > 0
      ? `本月剩余${remainingDays}天，日均可花 ¥${centsToYuan(Math.floor(total.remainingAmount / remainingDays))}`
      : '本月预算已用完，后续支出仍可正常记录'
  }
  const isOver = total.remainingAmount < 0
  const isExhausted = total.remainingAmount === 0
  const monthPrefix = result.isHistorical ? '该月' : '本月'

  return {
    configured: true,
    canEdit: !!result.canEdit,
    isHistorical: !!result.isHistorical,
    status: total.status,
    percent: total.percent,
    progressWidth: progressWidth(total.percent),
    usedAmount: centsToYuan(total.usedAmount),
    limitAmount: centsToYuan(total.limitAmount),
    remainingAmount: centsToYuan(Math.abs(total.remainingAmount)),
    isOver,
    isExhausted,
    summaryLabel: isOver
      ? `${monthPrefix}已超支`
      : (isExhausted ? `${monthPrefix}预算已用完` : `${monthPrefix}剩余预算`),
    paceText
  }
}

function attachBudgetToLegend(legend, budgetResult) {
  const usageByName = new Map(
    (budgetResult?.usage?.categoryUsage || []).map(item => [item.name, item])
  )
  return (legend || []).map(item => {
    const usage = usageByName.get(item.name)
    if (!usage) {
      return { ...item, hasBudget: false }
    }
    return {
      ...item,
      hasBudget: true,
      budgetAmount: centsToYuan(usage.limitAmount),
      budgetRemainingAmount: centsToYuan(Math.abs(usage.remainingAmount)),
      budgetIsOver: usage.remainingAmount < 0,
      budgetPercent: usage.percent,
      budgetStatus: usage.status,
      budgetProgressWidth: progressWidth(usage.percent)
    }
  })
}

function budgetMenuStatus(result) {
  if (!result?.success || !result.budget) return '本月未设置'
  const remaining = result.usage.total.remainingAmount
  return remaining < 0
    ? `本月超支 ¥${centsToYuan(Math.abs(remaining))}`
    : `本月剩余 ¥${centsToYuan(remaining)}`
}

function budgetAlertContent(alert) {
  if (!alert) return null
  const subject = alert.scope === 'category'
    ? `“${alert.categoryName}”分类预算`
    : '本月总预算'
  const isOver = alert.remainingAmount < 0
  return {
    title: alert.level === 'over'
      ? (isOver
          ? `记账成功，${alert.scope === 'category' ? alert.categoryName : '本月总'}预算已超支`
          : `记账成功，${alert.scope === 'category' ? alert.categoryName : '本月总'}预算已用完`)
      : `记账成功，${alert.scope === 'category' ? alert.categoryName : '本月总'}预算接近上限`,
    message: alert.level === 'over'
      ? (isOver
          ? `已使用 ${alert.percent}% · 超支 ¥${centsToYuan(Math.abs(alert.remainingAmount))}`
          : `已使用 ${alert.percent}% · 预算已全部用完`)
      : `已使用 ${alert.percent}% · 剩余 ¥${centsToYuan(alert.remainingAmount)}`,
    level: alert.level,
    trigger: alert.trigger || 'threshold',
    subject
  }
}

function copyBudgetErrorMessage(result) {
  if (result?.errorCode === 'PREVIOUS_BUDGET_NOT_FOUND') {
    return '上月未设置预算'
  }
  return result?.error || '复制失败'
}

module.exports = {
  centsToYuan,
  progressWidth,
  daysRemainingInMonth,
  buildBudgetView,
  attachBudgetToLegend,
  budgetMenuStatus,
  budgetAlertContent,
  copyBudgetErrorMessage
}
