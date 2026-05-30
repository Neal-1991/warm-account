Component({
  properties: {
    visible: { type: Boolean, value: false },
    categories: { type: Array },
    type: { type: String, value: 'expense' }  // expense 或 income
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
    },
    'type': function() {
      this.initCategories()
    }
  },
  methods: {
    initCategories() {
      const cats = this.properties.categories || []
      const typeFilter = this.properties.type || 'expense'
      // 过滤指定type的大类，按名称去重（防止 init-database 多次调用导致重复）
      const seen = new Set()
      const big = cats.filter(c => {
        if (c.parentId === null && c.type === typeFilter && !seen.has(c.name)) {
          seen.add(c.name)
          return true
        }
        return false
      })
      this.setData({
        bigCategories: big,
        selectedBigId: big[0]?._id || null
      })
      if (big[0]) {
        this.updateChildren(big[0]._id)
      } else {
        this.setData({ childCategories: [], selectedChildId: null })
      }
    },
    updateChildren(bigId) {
      const cats = this.properties.categories || []
      // 找到该大类名称，收集所有同名大类的 _id（处理重复系统分类）
      const bigCat = cats.find(c => c._id === bigId && c.parentId === null)
      if (!bigCat) {
        this.setData({ childCategories: [], selectedChildId: null })
        return
      }
      const allBigIds = cats
        .filter(c => c.parentId === null && c.name === bigCat.name)
        .map(c => c._id)
      const children = cats.filter(c => allBigIds.includes(c.parentId))
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
      if (!child || !big) {
        wx.showToast({ title: '请选择分类', icon: 'none' })
        return
      }
      this.triggerEvent('select', {
        categoryId: child._id,
        categoryName: child.name,
        icon: big.icon || ''
      })
    },
    onClose() {
      this.triggerEvent('close')
    },
    stopBubble() {}
  }
})