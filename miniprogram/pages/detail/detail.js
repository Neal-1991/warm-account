const config = require('../../utils/config')

Page({
  data: {
    record: null,
    images: [],
    canDelete: false
  },

  async onLoad(options) {
    const { recordId } = options
    if (!recordId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      return
    }

    const app = getApp()
    const session = await app.ensureSession()
    if (!session.authenticated) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const records = app.globalData._currentRecords || []
    const record = records.find(r => r._id === recordId)

    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      return
    }

    const canDelete = record.createdBy === app.getOpenId()
    const images = record.images || []

    this.setData({ record, images, canDelete })

    // 将 cloud:// 文件 ID 转为临时可访问的 HTTP URL
    if (images.length > 0) {
      this.loadFileUrls(images)
    }
  },

  loadFileUrls(fileList) {
    wx.cloud.callFunction({
      name: 'record',
      data: {
        action: 'getFileUrl',
        bookId: this.data.record.bookId,
        fileList,
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result?.success) {
        const urls = res.result.fileList.map(f => f.tempFileURL)
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

  onDelete() {
    const app = getApp()
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          wx.cloud.callFunction({
            name: 'record',
            data: {
              action: 'delete',
              recordId: this.data.record._id,
              bookId: this.data.record.bookId,
              isTest: config.isTest
            }
          }).then(() => {
            wx.hideLoading()
            wx.showToast({ title: '已删除' })
            setTimeout(() => {
              wx.navigateBack()
            }, 1500)
          }).catch(err => {
            wx.hideLoading()
            console.error('delete error:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  }
})
