// miniprogram/components/record-card/record-card.js
Component({
  properties: {
    icon: { type: String },
    categoryName: { type: String },
    remark: { type: String },
    type: { type: String },
    amount: { type: String },
    dateStr: { type: String },
    createdByName: { type: String },
    hasImages: { type: Boolean, value: false },
    hideDate: { type: Boolean, value: false }
  },
  data: {},
  methods: {
    onTap() {
      this.triggerEvent('tap')
    }
  }
})
