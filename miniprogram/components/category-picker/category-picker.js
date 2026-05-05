Component({
  properties: {
    visible: { type: Boolean, value: false },
    categories: { type: Array }
  },
  data: {
    bigCategories: [],
    childCategories: [],
    selectedBigId: null,
    selectedChildId: null,
    showAddChild: false,
    newChildName: ''
  },
  lifetimes: {
    attached() {
      this.initCategories()
    }
  },
  observers: {
    'categories': function() {
      this.initCategories()
    }
  },
  methods: {
    initCategories() {
      const cats = this.properties.categories || []
      const big = cats.filter(c => c.parentId === null)
      this.setData({
        bigCategories: big,
        selectedBigId: big[0]?._id || null
      })
      if (big[0]) {
        this.updateChildren(big[0]._id)
      }
    },
    updateChildren(bigId) {
      const cats = this.properties.categories || []
      const children = cats.filter(c => c.parentId === bigId)
      this.setData({
        childCategories: children,
        selectedChildId: children[0]?._id || null
      })
    },
    selectBig(e) {
      const bigId = e.currentTarget.dataset.id
      this.setData({
        selectedBigId: bigId,
        showAddChild: false
      })
      this.updateChildren(bigId)
    },
    selectChild(e) {
      this.setData({ selectedChildId: e.currentTarget.dataset.id })
    },
    onManage() {
      this.setData({ showAddChild: true })
    },
    onAddInput(e) {
      this.setData({ newChildName: e.detail.value })
    },
    confirmAddChild() {
      if (this.data.newChildName.trim()) {
        this.triggerEvent('addchild', {
          name: this.data.newChildName.trim(),
          parentId: this.data.selectedBigId
        })
        this.setData({ newChildName: '', showAddChild: false })
      }
    },
    onConfirm() {
      const big = this.data.bigCategories.find(b => b._id === this.data.selectedBigId)
      const child = this.data.childCategories.find(c => c._id === this.data.selectedChildId)
      if (child && big) {
        this.triggerEvent('select', {
          categoryId: child._id,
          categoryName: child.name,
          icon: big.icon || ''
        })
      }
    },
    onClose() {
      this.triggerEvent('close')
    },
    stopBubble() {}
  }
})