const dateUtil = require('../../utils/date')
const config = require('../../utils/config')
const { budgetAlertContent } = require('../../utils/budget')
const {
  buildCategoryDisplayMap,
  resolveCategoryDisplay
} = require('../../utils/category-display')

function emptyCategory() {
  return { categoryId: null, name: '', categoryName: '', icon: '', iconInfo: null }
}

function formatInputDate(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) {
    return formatInputDate(new Date())
  }
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function amountToInput(amount) {
  const cents = Number(amount)
  if (!Number.isFinite(cents)) return ''
  return (cents / 100).toFixed(2)
}

function sameArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

Page({
  data: {
    mode: 'add',
    isEdit: false,
    recordId: '',
    type: 'expense',
    amount: '',
    selectedCategory: emptyCategory(),
    date: '',
    dateDisplay: '',
    remark: '',
    images: [],
    imageFileIds: [],
    showCategoryPicker: false,
    categories: [],
    canSubmit: false,
    submitting: false,
    showBudgetAlert: false,
    budgetAlertView: null,
    submitText: '提交',
    themeStyle: ''
  },

  onLoad(options = {}) {
    const app = getApp()
    const isEdit = options.mode === 'edit' && !!options.recordId
    const dateStr = formatInputDate(new Date())
    this._skipNextShow = true
    this.setData({
      mode: isEdit ? 'edit' : 'add',
      isEdit,
      recordId: isEdit ? options.recordId : '',
      date: dateStr,
      dateDisplay: dateUtil.formatDateDisplay(new Date(dateStr)),
      selectedCategory: emptyCategory(),
      submitText: isEdit ? '保存修改' : '提交',
      themeStyle: app.getThemeStyle()
    })
    wx.setNavigationBarTitle({ title: isEdit ? '编辑记录' : '记一笔' })
    app.applyTheme()

    if (isEdit) {
      this.loadEditRecord(options.recordId)
    } else {
      this.loadCategories()
    }
  },

  onShow() {
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
    this.loadCategories({ syncSelected: true })
  },

  onUnload() {
    this.clearReturnTimer()
  },

  clearReturnTimer() {
    if (this._returnTimer) {
      clearTimeout(this._returnTimer)
      this._returnTimer = null
    }
  },

  scheduleHomeReturn(delay = 2000) {
    this.clearReturnTimer()
    this._returnTimer = setTimeout(() => {
      this.returnToHome()
    }, delay)
  },

  returnToHome() {
    if (this._returningHome) return
    this._returningHome = true
    this.clearReturnTimer()
    this.setData({ showBudgetAlert: false })
    wx.switchTab({
      url: '/pages/index/index',
      fail: () => {
        this._returningHome = false
        this.setData({ submitting: false })
        wx.showToast({ title: '返回首页失败，请稍后重试', icon: 'none' })
      }
    })
  },

  async getSessionBookId() {
    const app = getApp()
    const session = await app.ensureSession()
    return {
      app,
      session,
      bookId: session.bookId || app.getBookId()
    }
  },

  categorySelection(categoryId, categories = []) {
    const displayMap = buildCategoryDisplayMap(categories)
    const display = resolveCategoryDisplay(displayMap, categoryId)
    if (!display.valid) {
      return emptyCategory()
    }
    return {
      categoryId,
      name: display.name,
      categoryName: display.name,
      icon: display.icon,
      iconInfo: display.iconInfo,
      isBigCategory: display.isBigCategory
    }
  },

  async loadCategories(options = {}) {
    const { session, bookId } = await this.getSessionBookId()
    if (!session.authenticated || !bookId) {
      this.setData({ categories: [] })
      return []
    }

    const type = options.type || this.data.type
    try {
      const res = await wx.cloud.callFunction({
        name: 'category',
        data: { action: 'list', bookId, isTest: config.isTest, type }
      })
      if (res.result && res.result.success) {
        const categories = res.result.categories || []
        const nextData = { categories }
        if (options.syncSelected && this.data.selectedCategory.categoryId) {
          nextData.selectedCategory = this.categorySelection(this.data.selectedCategory.categoryId, categories)
        }
        this.setData(nextData)
        if (options.syncSelected) {
          this.checkCanSubmit()
        }
        return categories
      }
      wx.showToast({ title: res.result?.error || '分类加载失败', icon: 'none' })
    } catch (err) {
      console.error('loadCategories error:', err)
      wx.showToast({ title: '分类加载失败', icon: 'none' })
    }
    return []
  },

  async loadEditRecord(recordId) {
    const { session, bookId } = await this.getSessionBookId()
    if (!session.authenticated || !bookId) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    wx.showLoading({ title: '加载中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'record',
        data: {
          action: 'get',
          recordId,
          bookId,
          isTest: config.isTest
        }
      })
      if (!res.result?.success) {
        wx.showToast({ title: res.result?.error || '记录加载失败', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }
      if (!res.result.canModify) {
        wx.showToast({ title: '无权编辑该记录', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }

      const record = res.result.record
      const dateStr = formatInputDate(record.date)
      const imageFileIds = record.images || []
      this.setData({
        type: record.type,
        amount: amountToInput(record.amount),
        date: dateStr,
        dateDisplay: dateUtil.formatDateDisplay(new Date(dateStr)),
        remark: record.remark || '',
        images: imageFileIds,
        imageFileIds,
        selectedCategory: emptyCategory(),
        showBudgetAlert: false,
        budgetAlertView: null
      })

      const categories = await this.loadCategories({ type: record.type })
      this.setData({
        selectedCategory: this.categorySelection(record.categoryId, categories)
      })
      this.checkCanSubmit()

      if (imageFileIds.length > 0) {
        this.loadImagePreviews(imageFileIds, bookId)
      }
    } catch (err) {
      console.error('loadEditRecord error:', err)
      wx.showToast({ title: '记录加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
    } finally {
      wx.hideLoading()
    }
  },

  loadImagePreviews(fileIds, bookId) {
    if (!fileIds || fileIds.length === 0) return

    wx.cloud.callFunction({
      name: 'record',
      data: {
        action: 'getFileUrl',
        bookId,
        fileList: fileIds,
        isTest: config.isTest
      }
    }).then(res => {
      if (!sameArray(this.data.imageFileIds, fileIds)) return
      if (res.result?.success) {
        const urls = res.result.fileList.map((file, index) => file.tempFileURL || fileIds[index])
        this.setData({ images: urls })
      }
    }).catch(err => {
      console.error('loadImagePreviews error:', err)
    })
  },

  switchType(e) {
    const nextType = e.currentTarget.dataset.type
    if (nextType === this.data.type) {
      return
    }
    this.setData({
      type: nextType,
      selectedCategory: emptyCategory(),
      showCategoryPicker: false,
      canSubmit: false
    })
    this.loadCategories({ type: nextType })
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
    const category = e.detail || {}
    this.setData({
      selectedCategory: {
        ...category,
        name: category.categoryName || category.name || '',
        categoryName: category.categoryName || category.name || ''
      },
      showCategoryPicker: false
    })
    this.checkCanSubmit()
  },

  onAddChild(e) {
    const app = getApp()
    const bookId = app.getBookId()
    if (!bookId) return
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'addChild',
        bookId,
        name: e.detail.name,
        parentId: e.detail.parentId,
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        this.loadCategories({ syncSelected: true })
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
    const bookId = app.getBookId()
    if (!bookId) return
    wx.cloud.callFunction({
      name: 'category',
      data: {
        action: 'addBig',
        bookId,
        name: e.detail.name,
        icon: e.detail.icon,
        iconKey: e.detail.iconKey || '',
        type: e.detail.type,
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        this.loadCategories({ syncSelected: true })
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
    const remainCount = 9 - this.data.images.length
    if (remainCount <= 0) return

    wx.chooseImage({
      count: remainCount,
      sizeType: ['compressed'],
      success: res => {
        this.setData({
          images: [...this.data.images, ...res.tempFilePaths],
          imageFileIds: [
            ...this.data.imageFileIds,
            ...res.tempFilePaths.map(() => '')
          ]
        })
      }
    })
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({
      images: this.data.images.filter((_, index) => index !== idx),
      imageFileIds: this.data.imageFileIds.filter((_, index) => index !== idx)
    })
  },

  checkCanSubmit() {
    const { amount, selectedCategory } = this.data
    const amountNum = parseFloat(amount)
    this.setData({
      canSubmit: !isNaN(amountNum) && amountNum > 0 && selectedCategory.categoryId != null
    })
  },

  uploadImages(tempPaths) {
    if (!tempPaths || tempPaths.length === 0) {
      return Promise.resolve([])
    }
    return Promise.all(tempPaths.map(path =>
      wx.cloud.uploadFile({
        cloudPath: `${config.isTest ? 'test' : 'prod'}/record_images/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
        filePath: path
      })
    )).then(results => results.map(result => result.fileID))
  },

  deleteUploadedFiles(fileIds) {
    const fileList = (fileIds || []).filter(Boolean)
    if (fileList.length === 0) return Promise.resolve()
    return wx.cloud.deleteFile({ fileList }).catch(err => {
      console.error('delete uploaded record images failed:', err)
    })
  },

  async prepareImageFileIds() {
    const finalFileIds = []
    const tempPaths = []
    const tempIndexes = []
    const newlyUploadedFileIds = []

    this.data.images.forEach((image, index) => {
      const existingFileId = this.data.imageFileIds[index]
      if (existingFileId) {
        finalFileIds[index] = existingFileId
      } else {
        tempIndexes.push(index)
        tempPaths.push(image)
      }
    })

    if (tempPaths.length > 0) {
      wx.showLoading({ title: '上传图片中...' })
      const uploadedFileIds = await this.uploadImages(tempPaths)
      uploadedFileIds.forEach((fileId, index) => {
        finalFileIds[tempIndexes[index]] = fileId
        newlyUploadedFileIds.push(fileId)
      })
    }

    return { finalFileIds, newlyUploadedFileIds }
  },

  buildSubmitData(amountNum, imageFileIds) {
    const { type, selectedCategory, date, remark } = this.data
    return {
      type,
      amount: Math.round(amountNum * 100),
      categoryId: selectedCategory.categoryId,
      date,
      remark,
      images: imageFileIds,
      nickName: getApp().getUserInfo()?.nickName || '未知'
    }
  },

  async submitAdd(bookId, data) {
    wx.showLoading({ title: '提交中...' })
    const res = await wx.cloud.callFunction({
      name: 'record',
      data: {
        action: 'add',
        bookId,
        data,
        isTest: config.isTest
      }
    })
    wx.hideLoading()

    if (res.result && res.result.success) {
      const app = getApp()
      app.globalData._currentRecords = []
      app.invalidateBudgetCache(bookId)
      const alertView = budgetAlertContent(res.result.budgetAlert)
      if (alertView) {
        this.setData({
          showBudgetAlert: true,
          budgetAlertView: alertView
        })
        this.scheduleHomeReturn(2000)
        return true
      }
      wx.showToast({ title: '提交成功' })
      this.scheduleHomeReturn(1500)
      return true
    }

    this.setData({ submitting: false })
    wx.showToast({ title: res.result?.error || '提交失败', icon: 'none' })
    return false
  },

  async submitUpdate(bookId, data) {
    wx.showLoading({ title: '保存中...' })
    const res = await wx.cloud.callFunction({
      name: 'record',
      data: {
        action: 'update',
        recordId: this.data.recordId,
        bookId,
        data,
        isTest: config.isTest
      }
    })
    wx.hideLoading()

    if (res.result && res.result.success) {
      const app = getApp()
      app.globalData._currentRecords = []
      app.invalidateBudgetCache(bookId)
      wx.showToast({ title: '修改成功' })
      setTimeout(() => {
        wx.navigateBack()
      }, 800)
      return true
    }

    this.setData({ submitting: false })
    wx.showToast({ title: res.result?.error || '保存失败', icon: 'none' })
    return false
  },

  async onSubmit() {
    if (this.data.submitting) {
      return
    }

    const { session, bookId } = await this.getSessionBookId()
    if (!session.authenticated || !bookId) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    const { amount, selectedCategory } = this.data
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }
    if (!selectedCategory.categoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    let newlyUploadedFileIds = []
    try {
      const preparedImages = await this.prepareImageFileIds()
      const imageFileIds = preparedImages.finalFileIds
      newlyUploadedFileIds = preparedImages.newlyUploadedFileIds
      const submitData = this.buildSubmitData(amountNum, imageFileIds)
      let success = false
      if (this.data.isEdit) {
        success = await this.submitUpdate(bookId, submitData)
      } else {
        success = await this.submitAdd(bookId, submitData)
      }
      if (!success) {
        await this.deleteUploadedFiles(newlyUploadedFileIds)
      }
    } catch (err) {
      wx.hideLoading()
      this.setData({ submitting: false })
      console.error('onSubmit error:', err)
      await this.deleteUploadedFiles(newlyUploadedFileIds)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})
