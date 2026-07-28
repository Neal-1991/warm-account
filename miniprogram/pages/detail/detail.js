const dateUtil = require('../../utils/date')
const config = require('../../utils/config')
const {
  buildCategoryDisplayMap,
  resolveCategoryDisplay
} = require('../../utils/category-display')

function formatRecord(record, categories = []) {
  const displayMap = buildCategoryDisplayMap(categories)
  const category = resolveCategoryDisplay(displayMap, record.categoryId)
  const date = new Date(record.date)

  return {
    ...record,
    amountDisplay: (record.amount / 100).toFixed(2),
    dateStr: Number.isNaN(date.getTime()) ? '' : dateUtil.formatDateDisplay(date),
    icon: category.icon,
    iconInfo: category.iconInfo,
    categoryName: category.name,
    remark: record.remark || '',
    hasImages: (record.images || []).length > 0
  }
}

Page({
  data: {
    recordId: '',
    record: null,
    images: [],
    imageFileIds: [],
    canEdit: false,
    canDelete: false,
    loading: false,
    themeStyle: ''
  },

  async onLoad(options) {
    const { recordId } = options
    if (!recordId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      return
    }

    const app = getApp()
    this._recordId = recordId
    this._skipNextShow = true
    this.setData({
      recordId,
      themeStyle: app.getThemeStyle()
    })
    app.applyTheme()

    const session = await app.ensureSession()
    if (!session.authenticated) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    const records = app.globalData._currentRecords || []
    const cachedRecord = records.find(record => record._id === recordId)
    if (cachedRecord) {
      const images = cachedRecord.images || []
      this.setData({
        record: cachedRecord,
        images,
        imageFileIds: images
      })
      if (images.length > 0) {
        this.loadFileUrls(images)
      }
    }

    this.loadRecord({ showLoading: !cachedRecord })
  },

  onShow() {
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
    if (this._recordId) {
      this.loadRecord({ showLoading: false })
    }
  },

  async loadRecord({ showLoading = false } = {}) {
    const app = getApp()
    const session = await app.ensureSession()
    const bookId = session.bookId || app.getBookId()
    if (!session.authenticated || !bookId || !this._recordId) {
      return
    }

    if (showLoading) {
      wx.showLoading({ title: '加载中...' })
    }
    this.setData({ loading: true })

    try {
      const [recordRes, categoryRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'record',
          data: {
            action: 'get',
            recordId: this._recordId,
            bookId,
            isTest: config.isTest
          }
        }),
        wx.cloud.callFunction({
          name: 'category',
          data: { action: 'list', bookId, isTest: config.isTest }
        })
      ])

      if (!recordRes.result?.success) {
        wx.showToast({ title: recordRes.result?.error || '记录不存在', icon: 'none' })
        this.setData({ record: null, images: [], imageFileIds: [], canEdit: false, canDelete: false })
        return
      }

      const record = formatRecord(recordRes.result.record, categoryRes.result?.categories || [])
      const imageFileIds = record.images || []
      this.setData({
        record,
        images: imageFileIds,
        imageFileIds,
        canEdit: !!recordRes.result.canModify,
        canDelete: !!recordRes.result.canModify
      })

      const records = app.globalData._currentRecords || []
      const index = records.findIndex(item => item._id === record._id)
      if (index >= 0) {
        records[index] = record
        app.globalData._currentRecords = records
      }

      if (imageFileIds.length > 0) {
        this.loadFileUrls(imageFileIds)
      }
    } catch (err) {
      console.error('load detail record error:', err)
      wx.showToast({ title: '记录加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      if (showLoading) {
        wx.hideLoading()
      }
    }
  },

  loadFileUrls(fileList) {
    if (!fileList || fileList.length === 0) {
      this.setData({ images: [] })
      return
    }

    const currentFiles = fileList.slice()
    const requestSeq = (this._fileUrlSeq || 0) + 1
    this._fileUrlSeq = requestSeq

    wx.cloud.callFunction({
      name: 'record',
      data: {
        action: 'getFileUrl',
        bookId: this.data.record?.bookId,
        fileList: currentFiles,
        isTest: config.isTest
      }
    }).then(res => {
      if (requestSeq !== this._fileUrlSeq) return
      if (res.result?.success) {
        const urls = res.result.fileList.map((file, index) => file.tempFileURL || currentFiles[index])
        this.setData({ images: urls })
      }
    }).catch(err => {
      console.error('loadFileUrls error:', err)
    })
  },

  previewImage(e) {
    const index = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.images[index],
      urls: this.data.images
    })
  },

  onEdit() {
    if (!this.data.canEdit || !this.data.record?._id) {
      return
    }
    wx.navigateTo({
      url: `/pages/add/add?mode=edit&recordId=${this.data.record._id}`
    })
  },

  onDelete() {
    if (!this.data.canDelete || !this.data.record?._id) {
      return
    }

    const app = getApp()
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '删除中...' })
        wx.cloud.callFunction({
          name: 'record',
          data: {
            action: 'delete',
            recordId: this.data.record._id,
            bookId: this.data.record.bookId,
            isTest: config.isTest
          }
        }).then(deleteRes => {
          wx.hideLoading()
          if (!deleteRes.result?.success) {
            wx.showToast({ title: deleteRes.result?.error || '删除失败', icon: 'none' })
            return
          }
          app.globalData._currentRecords = []
          app.invalidateBudgetCache(this.data.record.bookId)
          wx.showToast({ title: '已删除' })
          setTimeout(() => {
            wx.navigateBack()
          }, 1200)
        }).catch(err => {
          wx.hideLoading()
          console.error('delete error:', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  }
})
