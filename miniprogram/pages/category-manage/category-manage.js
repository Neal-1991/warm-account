const config = require('../../utils/config')
const { filterBigCategories } = require('./category-manage-utils')
const {
  DEFAULT_ICON_KEY,
  iconForCategory,
  iconOptions,
  recommendIconKey
} = require('../../utils/category-icons')

const BUILTIN_ICON_OPTIONS = iconOptions('expense')

function moveItem(list, id, delta) {
  const index = list.findIndex(item => item._id === id)
  const targetIndex = index + delta
  if (index < 0 || targetIndex < 0 || targetIndex >= list.length) {
    return list
  }
  const next = list.slice()
  const current = next[index]
  next[index] = next[targetIndex]
  next[targetIndex] = current
  return next.map((item, itemIndex) => ({
    ...item,
    order: itemIndex + 1
  }))
}

Page({
  data: {
    activeTab: 'expense',
    bigCategories: [],
    visibleBigCategories: [],
    childMap: {},
    iconOptions: BUILTIN_ICON_OPTIONS,
    themeStyle: '',
    showRename: false,
    renameTarget: null,
    renameName: '',
    renameIcon: '',
    renameIconKey: '',
    showDelete: false,
    deleteTarget: null,
    deleteRecordCount: 0,
    deleteMergeOptions: [],
    showAddBig: false,
    newBigName: '',
    newBigIcon: '',
    newBigIconKey: DEFAULT_ICON_KEY,
    newBigIconTouched: false,
    showAddChild: false,
    addChildParentId: '',
    addChildParentName: '',
    newChildName: ''
  },

  onLoad() {
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
    this.loadCategories()
  },

  onShow() {
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
    this.loadCategories()
  },

  async loadCategories() {
    const app = getApp()
    const session = await app.ensureSession()
    const bookId = session.bookId || app.getBookId()
    if (!session.authenticated || !bookId) return

    wx.cloud.callFunction({
      name: 'category',
      data: { action: 'list', bookId, isTest: config.isTest }
    }).then(res => {
      if (!res.result || !res.result.success) return
      const cats = res.result.categories || []
      const bigCategories = cats
        .filter(c => c.parentId === null)
        .map(category => ({
          ...category,
          iconInfo: iconForCategory(category)
        }))
      const bigById = new Map(bigCategories.map(category => [category._id, category]))
      const childMap = {}
      bigCategories.forEach(big => {
        childMap[big._id] = cats
          .filter(c => c.parentId === big._id)
          .map(category => {
            const parent = bigById.get(category.parentId)
            return {
              ...category,
              iconInfo: parent?.iconInfo || iconForCategory(parent)
            }
          })
      })
      this.setData({
        bigCategories,
        visibleBigCategories: filterBigCategories(bigCategories, this.data.activeTab),
        childMap
      })
    }).catch(err => {
      console.error('loadCategories:', err)
      wx.showToast({ title: '加载分类失败', icon: 'none' })
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      activeTab: tab,
      visibleBigCategories: filterBigCategories(this.data.bigCategories, tab),
      iconOptions: iconOptions(tab)
    })
  },

  updateBigCategoryOrder(nextVisible) {
    let cursor = 0
    return this.data.bigCategories.map(category => {
      if (category.type !== this.data.activeTab) return category
      const nextCategory = nextVisible[cursor]
      cursor += 1
      return nextCategory || category
    })
  },

  moveBig(e) {
    const categoryId = e.currentTarget.dataset.id
    const direction = Number(e.currentTarget.dataset.direction)
    const nextVisible = moveItem(this.data.visibleBigCategories, categoryId, direction)
    if (nextVisible === this.data.visibleBigCategories) return

    this.setData({
      visibleBigCategories: nextVisible,
      bigCategories: this.updateBigCategoryOrder(nextVisible)
    })

    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'reorderBig',
        bookId: getApp().getBookId(),
        type: this.data.activeTab,
        orderedIds: nextVisible.map(category => category._id),
        isTest: config.isTest
      }
    }).then(res => {
      if (!res.result?.success) {
        wx.showToast({ title: res.result?.error || '排序失败', icon: 'none' })
        this.loadCategories()
      }
    }).catch(err => {
      console.error('moveBig error:', err)
      wx.showToast({ title: '排序失败', icon: 'none' })
      this.loadCategories()
    })
  },

  moveChild(e) {
    const parentId = e.currentTarget.dataset.parentId
    const categoryId = e.currentTarget.dataset.id
    const direction = Number(e.currentTarget.dataset.direction)
    const currentChildren = this.data.childMap[parentId] || []
    const nextChildren = moveItem(currentChildren, categoryId, direction)
    if (nextChildren === currentChildren) return

    this.setData({
      childMap: {
        ...this.data.childMap,
        [parentId]: nextChildren
      }
    })

    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'reorderChildren',
        bookId: getApp().getBookId(),
        parentId,
        orderedIds: nextChildren.map(category => category._id),
        isTest: config.isTest
      }
    }).then(res => {
      if (!res.result?.success) {
        wx.showToast({ title: res.result?.error || '排序失败', icon: 'none' })
        this.loadCategories()
      }
    }).catch(err => {
      console.error('moveChild error:', err)
      wx.showToast({ title: '排序失败', icon: 'none' })
      this.loadCategories()
    })
  },

  // ===== 大类改名 =====
  onRenameBig(e) {
    const cat = e.currentTarget.dataset.cat
    this.setData({
      showRename: true,
      renameTarget: cat,
      renameName: cat.name,
      renameIcon: cat.icon || '',
      renameIconKey: cat.iconInfo?.iconKey || cat.iconKey || '',
      iconOptions: iconOptions(cat.type || this.data.activeTab)
    })
  },
  onRenameChild(e) {
    const cat = e.currentTarget.dataset.cat
    this.setData({
      showRename: true,
      renameTarget: cat,
      renameName: cat.name,
      renameIcon: '',
      renameIconKey: ''
    })
  },
  onRenameNameInput(e) {
    this.setData({ renameName: e.detail.value })
  },
  onSelectRenameIcon(e) {
    this.setData({
      renameIconKey: e.currentTarget.dataset.iconKey || DEFAULT_ICON_KEY,
      renameIcon: ''
    })
  },
  confirmRename() {
    const name = this.data.renameName.trim()
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    const app = getApp()
    const data = {
      action: 'rename',
      categoryId: this.data.renameTarget._id,
      name,
      bookId: app.getBookId(),
      isTest: config.isTest
    }
    if (this.data.renameTarget.parentId === null) {
      data.icon = this.data.renameIcon
      data.iconKey = this.data.renameIconKey || ''
    }
    wx.cloud.callFunction({
      name: 'category',
      data
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
    const bookId = app.getBookId()
    // 检查记录数
    wx.cloud.callFunction({
      name: 'record',
      data: { action: 'countByCategory', bookId, data: { categoryId: cat._id }, isTest: config.isTest }
    }).then(res => {
      const count = res.result?.count || 0
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
          { id: parentId, label: parent ? `「${parent.name}」` : '父类' }
        ].concat(siblings.map(s => ({
          id: s._id,
          label: `「${s.name}」`
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
        bookId: app.getBookId(),
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
        bookId: app.getBookId(),
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
    this.setData({
      showAddBig: true,
      newBigName: '',
      newBigIcon: '',
      newBigIconKey: DEFAULT_ICON_KEY,
      newBigIconTouched: false,
      iconOptions: iconOptions(this.data.activeTab)
    })
  },
  onAddBigNameInput(e) {
    const newBigName = e.detail.value
    const data = { newBigName }
    if (!this.data.newBigIconTouched) {
      data.newBigIconKey = recommendIconKey(newBigName, this.data.activeTab)
    }
    this.setData(data)
  },
  onSelectAddBigIcon(e) {
    this.setData({
      newBigIconKey: e.currentTarget.dataset.iconKey || DEFAULT_ICON_KEY,
      newBigIcon: '',
      newBigIconTouched: true
    })
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
        icon: '',
        iconKey: this.data.newBigIconKey || recommendIconKey(name, this.data.activeTab) || DEFAULT_ICON_KEY,
        type: this.data.activeTab,
        bookId: app.getBookId(),
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
        bookId: app.getBookId(),
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

  stopBubble() {}
})
