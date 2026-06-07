const dateUtil = require('../../utils/date')
const config = require('../../utils/config')

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
    const { type } = this.data
    wx.cloud.callFunction({
      name: 'category',
      data: { action: 'list', bookId: app.globalData.bookId, isTest: config.isTest, type }
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
    this.loadCategories()  // 切换类型时重新加载对应分类
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
        parentId: e.detail.parentId,
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        this.loadCategories()
      } else {
        wx.showToast({ title: res.result?.error || '添加失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('onAddChild error:', err)
      wx.showToast({ title: '添加分类失败', icon: 'none' })
    })
  },

  onAddBig(e) {
    const app = getApp()
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'addBig',
        bookId: app.globalData.bookId,
        name: e.detail.name,
        icon: e.detail.icon,
        type: e.detail.type,
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        this.loadCategories()
      } else {
        wx.showToast({ title: res.result?.error || '添加失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('onAddBig error:', err)
      wx.showToast({ title: '添加大类失败', icon: 'none' })
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
      canSubmit: !isNaN(amountNum) && amountNum > 0 && selectedCategory.categoryId != null
    })
  },

  // 上传图片到云存储，返回 cloud file ID 列表
  uploadImages(tempPaths) {
    if (!tempPaths || tempPaths.length === 0) {
      return Promise.resolve([])
    }
    return Promise.all(tempPaths.map(path =>
      wx.cloud.uploadFile({
        cloudPath: `record_images/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
        filePath: path
      })
    )).then(results => results.map(r => r.fileID))
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

    const doSubmit = (cloudFileIds) => {
      wx.showLoading({ title: '提交中...' })
      wx.cloud.callFunction({
        name: 'record',
        data: {
          action: 'add',
          bookId: app.globalData.bookId,
          data: {
            type,
            amount: Math.round(amountNum * 100),
            categoryId: selectedCategory.categoryId,
            date,
            remark,
            images: cloudFileIds,
            openId: app.globalData.openId,
            nickName: app.globalData.userInfo?.nickName || '未知'
          },
          isTest: config.isTest
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

    if (images.length > 0) {
      wx.showLoading({ title: '上传图片中...' })
      this.uploadImages(images).then(cloudFileIds => {
        doSubmit(cloudFileIds)
      }).catch(err => {
        wx.hideLoading()
        this.setData({ submitting: false })
        console.error('uploadImages error:', err)
        wx.showToast({ title: '图片上传失败', icon: 'none' })
      })
    } else {
      doSubmit([])
    }
  }
})