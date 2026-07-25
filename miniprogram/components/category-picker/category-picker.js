const {
  DEFAULT_ICON_KEY,
  iconForCategory,
  iconOptions,
  recommendIconKey
} = require('../../utils/category-icons')

Component({
  properties: {
    visible: { type: Boolean, value: false },
    categories: { type: Array },
    type: { type: String, value: 'expense' },
    themeStyle: { type: String }
  },
  data: {
    bigCategories: [],
    childCategories: [],
    selectedBigId: null,
    selectedBigName: '',
    selectedChildId: null,
    selectedIsBig: false,
    showAddChild: false,
    showAddBig: false,
    newChildName: '',
    newBigName: '',
    newBigIcon: '',
    newBigIconKey: DEFAULT_ICON_KEY,
    newBigIconTouched: false,
    iconOptions: iconOptions('expense'),
    safeAreaBottom: 0
  },
  lifetimes: {
    attached() {
      try {
        const sys = wx.getSystemInfoSync()
        const safeAreaBottom = sys.screenHeight - sys.safeArea.bottom
        this.setData({ safeAreaBottom: safeAreaBottom > 0 ? safeAreaBottom : 0 })
      } catch (e) {
        console.error('get safeArea failed:', e)
      }
      this.initCategories()
    }
  },
  observers: {
    categories() {
      this.initCategories()
    },
    type() {
      this.initCategories()
    },
    visible(val) {
      if (val) this.initCategories()
    }
  },
  methods: {
    initCategories() {
      const cats = this.properties.categories || []
      const typeFilter = this.properties.type || 'expense'
      const seen = new Set()
      const big = cats.filter(c => {
        if (c.parentId === null && c.type === typeFilter && !seen.has(c.name)) {
          seen.add(c.name)
          return true
        }
        return false
      }).map(c => ({
        ...c,
        iconInfo: iconForCategory(c)
      }))

      const firstId = big.length > 0 ? big[0]._id : null
      const firstName = big.length > 0 ? big[0].name : ''
      this.setData({
        bigCategories: big,
        selectedBigId: firstId,
        selectedBigName: firstName,
        selectedChildId: null,
        selectedIsBig: false,
        showAddChild: false,
        showAddBig: false,
        newChildName: '',
        newBigName: '',
        newBigIcon: '',
        newBigIconKey: DEFAULT_ICON_KEY,
        newBigIconTouched: false,
        iconOptions: iconOptions(typeFilter)
      })
      if (firstId) {
        this.updateChildren(firstId)
      } else {
        this.setData({ childCategories: [], selectedChildId: null })
      }
    },
    updateChildren(bigId) {
      const cats = this.properties.categories || []
      const bigCat = cats.find(c => c._id === bigId && c.parentId === null)
      if (!bigCat) {
        this.setData({ childCategories: [], selectedChildId: null })
        return
      }
      const allBigIds = cats
        .filter(c => c.parentId === null && c.name === bigCat.name)
        .map(c => c._id)
      const children = cats.filter(c => allBigIds.includes(c.parentId))
      this.setData({ childCategories: children })
    },
    selectBig(e) {
      const bigId = e.currentTarget.dataset.id
      const big = this.data.bigCategories.find(b => b._id === bigId)
      this.setData({
        selectedBigId: bigId,
        selectedBigName: big ? big.name : '',
        selectedChildId: null,
        selectedIsBig: false,
        showAddChild: false,
        showAddBig: false
      })
      this.updateChildren(bigId)
    },
    selectBigOnly() {
      this.setData({
        selectedIsBig: true,
        selectedChildId: null
      })
    },
    selectChild(e) {
      this.setData({
        selectedChildId: e.currentTarget.dataset.id,
        selectedIsBig: false
      })
    },
    onManage() {
      this.triggerEvent('close')
      wx.navigateTo({ url: '/pages/category-manage/category-manage' })
    },
    onAddChildEntry() {
      this.setData({ showAddChild: true, showAddBig: false })
    },
    onAddChildInput(e) {
      this.setData({ newChildName: e.detail.value })
    },
    confirmAddChild() {
      const name = this.data.newChildName.trim()
      if (!name) return
      this.triggerEvent('addchild', {
        name,
        parentId: this.data.selectedBigId
      })
      this.setData({ newChildName: '', showAddChild: false })
    },
    onAddBigEntry() {
      const type = this.properties.type || 'expense'
      this.setData({
        showAddBig: true,
        showAddChild: false,
        newBigName: '',
        newBigIcon: '',
        newBigIconKey: DEFAULT_ICON_KEY,
        newBigIconTouched: false,
        iconOptions: iconOptions(type)
      })
    },
    onAddBigNameInput(e) {
      const newBigName = e.detail.value
      const data = { newBigName }
      if (!this.data.newBigIconTouched) {
        data.newBigIconKey = recommendIconKey(newBigName, this.properties.type)
      }
      this.setData(data)
    },
    onSelectAddBigIcon(e) {
      this.setData({
        newBigIconKey: e.currentTarget.dataset.key || DEFAULT_ICON_KEY,
        newBigIcon: '',
        newBigIconTouched: true
      })
    },
    confirmAddBig() {
      const name = this.data.newBigName.trim()
      if (!name) return
      this.triggerEvent('addbig', {
        name,
        icon: '',
        iconKey: this.data.newBigIconKey || recommendIconKey(name, this.properties.type) || DEFAULT_ICON_KEY,
        type: this.properties.type
      })
      this.setData({
        newBigName: '',
        newBigIcon: '',
        newBigIconKey: DEFAULT_ICON_KEY,
        newBigIconTouched: false,
        showAddBig: false
      })
    },
    onConfirm() {
      const big = this.data.bigCategories.find(b => b._id === this.data.selectedBigId)
      if (!big) {
        wx.showToast({ title: '请选择分类', icon: 'none' })
        return
      }
      if (this.data.selectedIsBig) {
        this.triggerEvent('select', {
          categoryId: big._id,
          categoryName: big.name,
          icon: big.icon || '',
          iconInfo: big.iconInfo,
          iconKey: big.iconInfo?.iconKey || big.iconKey || '',
          isBigCategory: true
        })
      } else {
        const child = this.data.childCategories.find(c => c._id === this.data.selectedChildId)
        if (!child) {
          wx.showToast({ title: '请选择分类', icon: 'none' })
          return
        }
        this.triggerEvent('select', {
          categoryId: child._id,
          categoryName: child.name,
          icon: big.icon || '',
          iconInfo: big.iconInfo,
          iconKey: big.iconInfo?.iconKey || big.iconKey || '',
          isBigCategory: false
        })
      }
    },
    onClose() {
      this.triggerEvent('close')
    },
    preventTouchMove() {},
    stopBubble() {}
  }
})
