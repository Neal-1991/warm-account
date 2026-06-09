Component({
  properties: {
    month: { type: String }
  },
  data: {
    currentMonth: ''
  },
  lifetimes: {
    attached() {
      // 初始化时从 properties 获取 month 值
      this.setData({ currentMonth: this.properties.month || '' })
    }
  },
  observers: {
    'month': function(month) {
      // 当传入的 month 属性变化时更新 currentMonth
      if (month && month !== this.data.currentMonth) {
        this.setData({ currentMonth: month })
      }
    }
  },
  methods: {
    prevMonth() {
      const current = this.data.currentMonth
      if (!current) return

      const [year, month] = current.split('-').map(Number)
      const date = new Date(year, month - 2, 1)
      const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      this.triggerEvent('change', { month: newMonth })
      this.setData({ currentMonth: newMonth })
    },
    nextMonth() {
      const current = this.data.currentMonth
      if (!current) return

      const [year, month] = current.split('-').map(Number)
      const date = new Date(year, month, 1)
      const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      this.triggerEvent('change', { month: newMonth })
      this.setData({ currentMonth: newMonth })
    }
  }
})