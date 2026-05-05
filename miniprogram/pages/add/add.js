const dateUtil = require('../../utils/date')

Page({
  data: {
    type: 'expense',
    amount: '',
    selectedCategory: { id: null, name: '', icon: '' },
    date: '',
    dateDisplay: '',
    remark: '',
    images: [],
    showCategoryPicker: false,
    categories: [],
    canSubmit: false,
    submitting: false
  },

  onLoad() {
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]
    this.setData({
      date: dateStr,
      dateDisplay: dateUtil.formatDateDisplay(today)
    })
    this.loadCategories()
  },

  loadCategories() {
    const app = getApp()
    wx.cloud.callFunction({
      name: 'category',
      data: { action: 'list', bookId: app.globalData.bookId }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({ categories: res.result.categories })
      } else {
        wx.showToast({ title: '分类加载失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('loadCategories error:', err)
      wx.showToast({ title: '分类加载失败', icon: 'none' })
    })
  },

  switchType(e) {
    this.setData({ type: e.currentTarget.dataset.type })
    this.checkCanSubmit()
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value })
    this.checkCanSubmit()
  },

  openCategoryPicker() {
    this.setData({ showCategoryPicker: true })
  },

  closeCategoryPicker() {
    this.setData({ showCategoryPicker: false })
  },

  onCategorySelect(e) {
    this.setData({
      selectedCategory: e.detail,
      showCategoryPicker: false
    })
    this.checkCanSubmit()
  },

  onAddChild(e) {
    const app = getApp()
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'addChild',
        bookId: app.globalData.bookId,
        name: e.detail.name,
        parentId: e.detail.parentId
      }
    }).then(() => {
      this.loadCategories()
    }).catch(err => {
      console.error('onAddChild error:', err)
      wx.showToast({ title: '添加分类失败', icon: 'none' })
    })
  },

  onDateChange(e) {
    const date = e.detail.value
    const d = new Date(date)
    this.setData({
      date,
      dateDisplay: dateUtil.formatDateDisplay(d)
    })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  addImage() {
    wx.chooseImage({
      count: 9 - this.data.images.length,
      success: res => {
        this.setData({ images: [...this.data.images, ...res.tempFilePaths] })
      }
    })
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = this.data.images.filter((_, i) => i !== idx)
    this.setData({ images })
  },

  checkCanSubmit() {
    const { amount, selectedCategory } = this.data
    const amountNum = parseFloat(amount)
    this.setData({
      canSubmit: !isNaN(amountNum) && amountNum > 0 && selectedCategory.id !== null
    })
  },

  onSubmit() {
    if (this.data.submitting) {
      return
    }

    const app = getApp()
    if (!app.globalData.bookId) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    const { type, amount, selectedCategory, date, remark, images } = this.data

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })

    wx.cloud.callFunction({
      name: 'record',
      data: {
        action: 'add',
        bookId: app.globalData.bookId,
        data: {
          type,
          amount: Math.round(amountNum * 100),
          categoryId: selectedCategory.id,
          date,
          remark,
          images,
          openId: app.globalData.openId,
          nickName: app.globalData.userInfo?.nickName || '未知'
        }
      }
    }).then(res => {
      wx.hideLoading()
      this.setData({ submitting: false })
      if (res.result && res.result.success) {
        wx.showToast({ title: '提交成功' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1500)
      } else {
        wx.showToast({ title: res.result?.error || '提交失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      this.setData({ submitting: false })
      console.error('onSubmit error:', err)
      wx.showToast({ title: '提交失败', icon: 'none' })
    })
  }
})