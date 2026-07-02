const config = require('../../utils/config')
const {
  COMMON_EMOJIS,
  emojiFromIndex,
  emojiFromInput
} = require('../../utils/category-emoji')

Component({
  properties: {
    visible: { type: Boolean, value: false },
    categories: { type: Array },
    type: { type: String, value: 'expense' }
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
    newBigIcon: '📌',
    commonEmojis: COMMON_EMOJIS
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
    },
    'visible': function(val) {
      // 每次打开时重新初始化（管理页返回后分类可能已变更）
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
      })
      // 默认选中第一个大类
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
        newBigIcon: '📌'
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
      // 收集同名大类的所有 _id（去重后的系统+自建合并情况）
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
      // 选择大类（记在大类下）
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
    // ===== 管理入口 =====
    onManage() {
      // 关闭选择器，跳转管理页
      this.triggerEvent('close')
      wx.navigateTo({ url: '/pages/category-manage/category-manage' })
    },
    // ===== 添加小类 =====
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
    // ===== 添加大类 =====
    onAddBigEntry() {
      this.setData({ showAddBig: true, showAddChild: false })
    },
    onAddBigNameInput(e) {
      this.setData({ newBigName: e.detail.value })
    },
    onSelectAddBigEmoji(e) {
      const newBigIcon = emojiFromIndex(this.data.commonEmojis, e)
      console.log('select quick add-big emoji:', newBigIcon)
      this.setData({ newBigIcon })
    },
    onAddBigIconInput(e) {
      this.setData({ newBigIcon: emojiFromInput(e) })
    },
    confirmAddBig() {
      const name = this.data.newBigName.trim()
      if (!name) return
      this.triggerEvent('addbig', {
        name,
        icon: this.data.newBigIcon || '📌',
        type: this.properties.type
      })
      this.setData({ newBigName: '', newBigIcon: '📌', showAddBig: false })
    },
    // ===== 确定 =====
    onConfirm() {
      const big = this.data.bigCategories.find(b => b._id === this.data.selectedBigId)
      if (!big) {
        wx.showToast({ title: '请选择分类', icon: 'none' })
        return
      }
      if (this.data.selectedIsBig) {
        // 选择的是大类
        this.triggerEvent('select', {
          categoryId: big._id,
          categoryName: big.name,
          icon: big.icon || '',
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
