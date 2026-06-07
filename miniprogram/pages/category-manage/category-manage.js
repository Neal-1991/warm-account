const config = require('../../utils/config')

const COMMON_EMOJIS = ['🍜','🚗','🛒','🏠','📱','👶','💄','👗','🎮','🏋','✈️','🐱','💊','🎁','📚','➕','💰','🏆','🏦','📈','💼','🧧','📦','📌','🎵','☕','🎂','🏥','📝','💻']

Page({
  data: {
    activeTab: 'expense',
    bigCategories: [],
    childMap: {},
    showRename: false,
    renameTarget: null,
    renameName: '',
    renameIcon: '',
    showDelete: false,
    deleteTarget: null,
    deleteRecordCount: 0,
    deleteMergeOptions: [],
    showAddBig: false,
    newBigName: '',
    newBigIcon: '📌',
    showAddChild: false,
    addChildParentId: '',
    addChildParentName: '',
    newChildName: ''
  },

  onLoad() {
    this.loadCategories()
  },

  onShow() {
    this.loadCategories()
  },

  loadCategories() {
    const app = getApp()
    const bookId = app.globalData?.bookId || app.getBookId()
    if (!bookId) return

    wx.cloud.callFunction({
      name: 'category',
      data: { action: 'list', bookId, isTest: config.isTest }
    }).then(res => {
      if (!res.result || !res.result.success) return
      const cats = res.result.categories || []
      const bigCategories = cats.filter(c => c.parentId === null)
      const childMap = {}
      bigCategories.forEach(big => {
        childMap[big._id] = cats.filter(c => c.parentId === big._id)
      })
      this.setData({ bigCategories, childMap })
    }).catch(err => {
      console.error('loadCategories:', err)
      wx.showToast({ title: '加载分类失败', icon: 'none' })
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  // ===== 大类改名 =====
  onRenameBig(e) {
    const cat = e.currentTarget.dataset.cat
    this.setData({
      showRename: true,
      renameTarget: cat,
      renameName: cat.name,
      renameIcon: cat.icon || ''
    })
  },
  onRenameChild(e) {
    const cat = e.currentTarget.dataset.cat
    this.setData({
      showRename: true,
      renameTarget: cat,
      renameName: cat.name,
      renameIcon: ''
    })
  },
  onRenameNameInput(e) {
    this.setData({ renameName: e.detail.value })
  },
  onRenameIconInput(e) {
    this.setData({ renameIcon: e.detail.value || '' })
  },
  onSelectEmoji(e) {
    this.setData({ renameIcon: e.currentTarget.dataset.emoji })
  },
  confirmRename() {
    const name = this.data.renameName.trim()
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    const app = getApp()
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'rename',
        categoryId: this.data.renameTarget._id,
        name,
        icon: this.data.renameIcon,
        bookId: app.globalData?.bookId || app.getBookId(),
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        wx.showToast({ title: '改名成功', icon: 'success' })
        this.setData({ showRename: false })
        this.loadCategories()
      } else {
        wx.showToast({ title: res.result?.error || '改名失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '改名失败', icon: 'none' })
    })
  },

  // ===== 小类改名 =====
  // (复用 onRenameChild, confirmRename)

  // ===== 删除小类 =====
  onDeleteChild(e) {
    const cat = e.currentTarget.dataset.cat
    const app = getApp()
    const bookId = app.globalData?.bookId || app.getBookId()
    // 检查记录数
    wx.cloud.callFunction({
      name: 'record',
      data: { action: 'list', bookId, data: { categoryId: cat._id }, isTest: config.isTest }
    }).then(res => {
      const records = res.result?.records || []
      const count = records.length
      if (count === 0) {
        // 无记录，直接确认
        this.setData({
          showDelete: true,
          deleteTarget: cat,
          deleteRecordCount: 0,
          deleteMergeOptions: []
        })
      } else {
        // 有记录，提供归并选项
        const parentId = cat.parentId
        const parent = this.data.bigCategories.find(b => b._id === parentId)
        const siblings = (this.data.childMap[parentId] || []).filter(c => c._id !== cat._id)
        const options = [
          { id: parentId, label: parent ? `归并到「${parent.name}」` : '归并到父类' }
        ].concat(siblings.map(s => ({
          id: s._id,
          label: `归并到「${s.name}」`
        })))
        this.setData({
          showDelete: true,
          deleteTarget: cat,
          deleteRecordCount: count,
          deleteMergeOptions: options
        })
      }
    }).catch(() => {
      wx.showToast({ title: '检查记录失败', icon: 'none' })
    })
  },

  // ===== 删除大类 =====
  onDeleteBig(e) {
    const cat = e.currentTarget.dataset.cat
    const children = this.data.childMap[cat._id] || []
    if (children.length > 0) {
      wx.showModal({
        title: '确认删除',
        content: `将同时删除「${cat.name}」下的 ${children.length} 个子类，确定继续？`,
        success: res => {
          if (res.confirm) this.execDeleteBig(cat)
        }
      })
    } else {
      wx.showModal({
        title: '确认删除',
        content: `确定删除大类「${cat.name}」？`,
        success: res => {
          if (res.confirm) this.execDeleteBig(cat)
        }
      })
    }
  },

  execDeleteBig(cat) {
    const app = getApp()
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'deleteBig',
        categoryId: cat._id,
        bookId: app.globalData?.bookId || app.getBookId(),
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        wx.showToast({ title: '删除成功', icon: 'success' })
        this.setData({ showDelete: false })
        this.loadCategories()
      } else {
        wx.showToast({ title: res.result?.error || '删除失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '删除失败', icon: 'none' })
    })
  },

  execDeleteChild(mergeTargetId) {
    const app = getApp()
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'deleteChild',
        categoryId: this.data.deleteTarget._id,
        mergeTargetId: mergeTargetId || undefined,
        bookId: app.globalData?.bookId || app.getBookId(),
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        wx.showToast({ title: '删除成功', icon: 'success' })
        this.setData({ showDelete: false })
        this.loadCategories()
      } else {
        wx.showToast({ title: res.result?.error || '删除失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '删除失败', icon: 'none' })
    })
  },

  confirmDeleteWithMerge(e) {
    const mergeId = e.currentTarget.dataset.mergeId
    this.execDeleteChild(mergeId)
  },

  confirmDeleteDirect() {
    this.execDeleteChild()
  },

  // ===== 添加大类 =====
  onAddBig() {
    this.setData({ showAddBig: true, newBigName: '', newBigIcon: '📌' })
  },
  onAddBigNameInput(e) {
    this.setData({ newBigName: e.detail.value })
  },
  onAddBigIconInput(e) {
    this.setData({ newBigIcon: e.detail.value || '📌' })
  },
  confirmAddBig() {
    const name = this.data.newBigName.trim()
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    const app = getApp()
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'addBig',
        name,
        icon: this.data.newBigIcon,
        type: this.data.activeTab,
        bookId: app.globalData?.bookId || app.getBookId(),
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        wx.showToast({ title: '添加成功', icon: 'success' })
        this.setData({ showAddBig: false })
        this.loadCategories()
      } else {
        wx.showToast({ title: res.result?.error || '添加失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '添加失败', icon: 'none' })
    })
  },

  // ===== 添加小类 =====
  onAddChild(e) {
    const bigId = e.currentTarget.dataset.bigId
    const big = this.data.bigCategories.find(b => b._id === bigId)
    this.setData({
      showAddChild: true,
      addChildParentId: bigId,
      addChildParentName: big ? big.name : '',
      newChildName: ''
    })
  },
  onAddChildNameInput(e) {
    this.setData({ newChildName: e.detail.value })
  },
  confirmAddChild() {
    const name = this.data.newChildName.trim()
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    const app = getApp()
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'addChild',
        name,
        parentId: this.data.addChildParentId,
        bookId: app.globalData?.bookId || app.getBookId(),
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        wx.showToast({ title: '添加成功', icon: 'success' })
        this.setData({ showAddChild: false })
        this.loadCategories()
      } else {
        wx.showToast({ title: res.result?.error || '添加失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '添加失败', icon: 'none' })
    })
  },

  // ===== 通用 =====
  hideModals() {
    this.setData({
      showRename: false,
      showDelete: false,
      showAddBig: false,
      showAddChild: false
    })
  },

  filteredBigCategories() {
    return this.data.bigCategories.filter(c => c.type === this.data.activeTab)
  }
})
