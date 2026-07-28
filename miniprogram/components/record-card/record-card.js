// miniprogram/components/record-card/record-card.js
Component({
  properties: {
    icon: { type: String },
    iconInfo: { type: Object },
    categoryName: { type: String },
    remark: { type: String },
    type: { type: String },
    amount: { type: String },
    dateStr: { type: String },
    createdByName: { type: String },
    hasImages: { type: Boolean, value: false },
    hideDate: { type: Boolean, value: false },
    themeStyle: { type: String }
  },
  data: {},
  methods: {
    onTap() {
      this.triggerEvent('tap')
    }
  }
})
