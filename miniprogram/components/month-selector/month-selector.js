Component({
  properties: {
    month: { type: String }
  },
  data: {
    currentMonth: ''
  },
  lifetimes: {
    attached() {
      this.setData({ currentMonth: this.properties.month })
    }
  },
  methods: {
    prevMonth() {
      const [year, month] = this.data.currentMonth.split('-').map(Number)
      const date = new Date(year, month - 2, 1)
      const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      this.triggerEvent('change', { month: newMonth })
      this.setData({ currentMonth: newMonth })
    },
    nextMonth() {
      const [year, month] = this.data.currentMonth.split('-').map(Number)
      const date = new Date(year, month, 1)
      const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      this.triggerEvent('change', { month: newMonth })
      this.setData({ currentMonth: newMonth })
    }
  }
})