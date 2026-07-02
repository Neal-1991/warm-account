function centsToYuan(amount) {
  return ((amount || 0) / 100).toFixed(2)
}

function parseDate(value) {
  if (value instanceof Date) return value
  if (value && typeof value.toDate === 'function') return value.toDate()
  if (value && value.$date) return new Date(value.$date)
  return new Date(value)
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + days)
  return next
}

function weekdayText(date) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

function formatGroupDate(date, now = new Date()) {
  const todayKey = dateKey(now)
  const yesterdayKey = dateKey(addDays(now, -1))
  const currentYear = now.getFullYear()
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`
  const weekday = weekdayText(date)

  if (dateKey(date) === todayKey) {
    return { title: '今天', subtitle: `${monthDay} ${weekday}` }
  }
  if (dateKey(date) === yesterdayKey) {
    return { title: '昨天', subtitle: `${monthDay} ${weekday}` }
  }
  if (date.getFullYear() !== currentYear) {
    return { title: `${date.getFullYear()}年${monthDay}`, subtitle: weekday }
  }
  return { title: monthDay, subtitle: weekday }
}

function summarizeRecords(records) {
  const summary = (records || []).reduce((acc, record) => {
    if (record.type === 'expense') {
      acc.expense += record.amount
    } else {
      acc.income += record.amount
    }
    return acc
  }, { expense: 0, income: 0 })
  summary.balance = summary.income - summary.expense
  return {
    expense: centsToYuan(summary.expense),
    income: centsToYuan(summary.income),
    balance: centsToYuan(summary.balance)
  }
}

function buildRecordGroups(records, now = new Date()) {
  const groups = []
  const groupMap = new Map()

  ;(records || []).forEach(record => {
    const date = parseDate(record.date)
    const key = dateKey(date)
    let group = groupMap.get(key)
    if (!group) {
      const display = formatGroupDate(date, now)
      group = {
        dateKey: key,
        title: display.title,
        subtitle: display.subtitle,
        income: 0,
        expense: 0,
        incomeAmount: '0.00',
        expenseAmount: '0.00',
        hasIncome: false,
        hasExpense: false,
        records: []
      }
      groupMap.set(key, group)
      groups.push(group)
    }

    if (record.type === 'expense') {
      group.expense += record.amount
      group.hasExpense = true
    } else {
      group.income += record.amount
      group.hasIncome = true
    }
    group.records.push(record)
  })

  return groups.map(group => ({
    ...group,
    incomeAmount: centsToYuan(group.income),
    expenseAmount: centsToYuan(group.expense)
  }))
}

module.exports = {
  buildRecordGroups,
  centsToYuan,
  formatGroupDate,
  summarizeRecords
}
