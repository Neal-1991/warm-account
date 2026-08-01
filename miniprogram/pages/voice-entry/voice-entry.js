// miniprogram/pages/voice-entry/voice-entry.js
const config = require('../../utils/config')

const MAX_RECORD_MS = 30000
const SAMPLE_RATE = 16000
const RECORD_FORMAT = 'wav'
const NUMBER_OF_CHANNELS = 1

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function amountFenToInput(fen) {
  const cents = Number(fen)
  if (!Number.isFinite(cents)) return ''
  return (cents / 100).toFixed(2)
}

function amountInputToFen(input) {
  const num = parseFloat(input)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.round(num * 100)
}

Page({
  data: {
    stage: 'idle', // idle | recording | recognizing | editing-text | parsing | preview | submitting | success | error
    errorMessage: '',
    transcript: '',
    items: [],
    requestId: '',
    recordingSeconds: 0,
    submitting: false,
    themeStyle: '',
    showBudgetAlert: false,
    budgetAlertView: null,
    categories: [],
    expandedItemId: null,
    canConfirm: false,
    successCount: 0
  },

  onLoad() {
    const app = getApp()
    this._skipNextShow = true
    this.setData({
      themeStyle: app.getThemeStyle(),
      requestId: generateId()
    })
    wx.setNavigationBarTitle({ title: '语音记账' })
    app.applyTheme()
    this.recorderManager = wx.getRecorderManager()
    this.bindRecorderEvents()
  },

  onShow() {
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
  },

  onUnload() {
    this.clearTimers()
  },

  clearTimers() {
    if (this._recordTimer) {
      clearInterval(this._recordTimer)
      this._recordTimer = null
    }
  },

  bindRecorderEvents() {
    this.recorderManager.onStart(() => {
      this.setData({ stage: 'recording', recordingSeconds: 0 })
      this._recordTimer = setInterval(() => {
        const next = this.data.recordingSeconds + 1
        this.setData({ recordingSeconds: next })
        if (next * 1000 >= MAX_RECORD_MS) {
          this.stopRecording()
        }
      }, 1000)
    })

    this.recorderManager.onStop((res) => {
      this.clearTimers()
      if (!res || !res.duration || res.duration < 300) {
        this.setData({ stage: 'error', errorMessage: '录音过短，请重新录音' })
        return
      }
      this.uploadAndRecognize(res.tempFilePath)
    })

    this.recorderManager.onError((err) => {
      this.clearTimers()
      console.error('recorder error:', err)
      this.setData({ stage: 'error', errorMessage: '录音失败，请检查麦克风权限' })
    })
  },

  async checkMicPermission() {
    try {
      const setting = await wx.getSetting()
      if (setting.authSetting['scope.record'] === false) {
        wx.showModal({
          title: '需要麦克风权限',
          content: '语音记账需要使用麦克风，请在设置中开启',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting()
          }
        })
        return false
      }
      // 未授权过会走 undefined，授权过 true 直接放行
      return true
    } catch (err) {
      console.error('getSetting failed:', err)
      return true // 不阻塞，让 recorder 自己触发授权
    }
  },

  async startRecording() {
    const app = getApp()
    const session = await app.ensureSession()
    if (!session.authenticated) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const ok = await this.checkMicPermission()
    if (!ok) return
    this.setData({ stage: 'recording', recordingSeconds: 0, transcript: '', items: [], errorMessage: '' })
    this.recorderManager.start({
      duration: MAX_RECORD_MS,
      sampleRate: SAMPLE_RATE,
      numberOfChannels: NUMBER_OF_CHANNELS,
      encodeBitRate: 64000,
      format: RECORD_FORMAT
    })
  },

  stopRecording() {
    this.clearTimers()
    this.recorderManager.stop()
  },

  cancelRecording() {
    this.clearTimers()
    this.recorderManager.stop()
    this.setData({ stage: 'idle', transcript: '', items: [], errorMessage: '' })
  },

  // 上传音频到云存储 → 调用 voice-entry recognize action
  async uploadAndRecognize(filePath) {
    this.setData({ stage: 'recognizing', errorMessage: '' })
    try {
      const app = getApp()
      const bookId = app.getBookId()
      if (!bookId) {
        this.setData({ stage: 'error', errorMessage: '请先选择账本' })
        return
      }
      const cloudPath = `voice-entry/${bookId}/${this.data.requestId}.${RECORD_FORMAT}`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
      const fileID = uploadRes.fileID
      const recognizeRes = await wx.cloud.callFunction({
        name: 'voice-entry',
        data: {
          action: 'recognize',
          bookId,
          data: { fileID },
          isTest: config.isTest
        }
      })
      const result = recognizeRes.result
      if (!result || !result.success) {
        this.setData({
          stage: 'error',
          errorMessage: result?.error || '识别失败，请重试'
        })
        return
      }
      this.setData({
        stage: 'editing-text',
        transcript: result.transcript
      })
    } catch (err) {
      console.error('uploadAndRecognize failed:', err)
      this.setData({
        stage: 'error',
        errorMessage: '识别失败，请重试或转手工记账'
      })
    }
  },

  onTranscriptInput(e) {
    this.setData({ transcript: e.detail.value })
  },

  // 重新录音
  retryRecording() {
    this.setData({
      stage: 'idle',
      transcript: '',
      items: [],
      errorMessage: '',
      requestId: generateId()
    })
  },

  // 转手工记账
  goToManualAdd() {
    wx.redirectTo({ url: '/pages/add/add' })
  },

  // 继续解析：调用 voice-entry parse action
  async startParse() {
    const transcript = (this.data.transcript || '').trim()
    if (!transcript) {
      wx.showToast({ title: '请先输入或录音', icon: 'none' })
      return
    }
    this.setData({ stage: 'parsing', errorMessage: '' })
    try {
      const app = getApp()
      const bookId = app.getBookId()
      const res = await wx.cloud.callFunction({
        name: 'voice-entry',
        data: {
          action: 'parse',
          bookId,
          data: { transcript, requestId: this.data.requestId },
          isTest: config.isTest
        }
      })
      const result = res.result
      if (!result || !result.success) {
        this.setData({
          stage: 'error',
          errorMessage: result?.error || '解析失败，请重试或转手工记账'
        })
        return
      }
      const items = (result.items || []).map(item => ({
        ...item,
        amountYuan: amountFenToInput(item.amountFen),
        expanded: false
      }))
      this.setData({
        stage: 'preview',
        items,
        requestId: result.requestId || this.data.requestId
      })
      // 加载分类列表供选择
      await this.loadAllCategories()
      this.updateCanConfirm()
    } catch (err) {
      console.error('parse failed:', err)
      this.setData({
        stage: 'error',
        errorMessage: '解析失败，请重试或转手工记账'
      })
    }
  },

  async loadAllCategories() {
    const app = getApp()
    const bookId = app.getBookId()
    if (!bookId) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'category',
        data: { action: 'list', bookId, isTest: config.isTest }
      })
      if (res.result && res.result.success) {
        this.setData({ categories: res.result.categories || [] })
      }
    } catch (err) {
      console.error('load categories failed:', err)
    }
  },

  // ===== 预览编辑 =====

  expandItem(e) {
    const itemId = e.currentTarget.dataset.itemId
    const items = this.data.items.map(item =>
      item.itemId === itemId ? { ...item, expanded: !item.expanded } : item
    )
    this.setData({ items })
  },

  onItemTypeChange(e) {
    const { itemId } = e.currentTarget.dataset
    const items = this.data.items.map(item =>
      item.itemId === itemId
        ? { ...item, type: e.detail.value, categoryId: null, categoryName: '' }
        : item
    )
    this.setData({ items })
    this.updateCanConfirm()
  },

  onItemAmountInput(e) {
    const { itemId } = e.currentTarget.dataset
    const items = this.data.items.map(item =>
      item.itemId === itemId
        ? { ...item, amountYuan: e.detail.value, amountFen: amountInputToFen(e.detail.value) }
        : item
    )
    this.setData({ items })
    this.updateCanConfirm()
  },

  onItemDateChange(e) {
    const { itemId } = e.currentTarget.dataset
    const items = this.data.items.map(item =>
      item.itemId === itemId ? { ...item, date: e.detail.value } : item
    )
    this.setData({ items })
    this.updateCanConfirm()
  },

  onItemRemarkInput(e) {
    const { itemId } = e.currentTarget.dataset
    const items = this.data.items.map(item =>
      item.itemId === itemId ? { ...item, remark: e.detail.value } : item
    )
    this.setData({ items })
  },

  onItemCategoryTap(e) {
    const { itemId, type } = e.currentTarget.dataset
    const categories = (this.data.categories || []).filter(c => c.type === type)
    if (categories.length === 0) {
      wx.showToast({ title: '暂无可用分类', icon: 'none' })
      return
    }
    const itemList = categories.map(c => c.name)
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const selected = categories[res.tapIndex]
        const items = this.data.items.map(item =>
          item.itemId === itemId
            ? {
                ...item,
                categoryId: selected._id,
                categoryName: selected.name,
                needsReview: false,
                warnings: []
              }
            : item
        )
        this.setData({ items })
        this.updateCanConfirm()
      }
    })
  },

  deleteItem(e) {
    const { itemId } = e.currentTarget.dataset
    const items = this.data.items.filter(item => item.itemId !== itemId)
    this.setData({ items })
    this.updateCanConfirm()
    if (items.length === 0) {
      this.setData({ stage: 'editing-text', errorMessage: '' })
    }
  },

  updateCanConfirm() {
    const items = this.data.items
    if (items.length === 0) {
      this.setData({ canConfirm: false })
      return
    }
    const allValid = items.every(item =>
      item.amountFen > 0 &&
      item.categoryId &&
      item.date &&
      !item.warnings.some(w => w.includes('不支持'))
    )
    this.setData({ canConfirm: allValid })
  },

  // ===== 批量确认 =====

  async confirmBatch() {
    if (!this.data.canConfirm || this.data.submitting) return
    this.setData({ stage: 'submitting', submitting: true, errorMessage: '' })

    try {
      const app = getApp()
      const bookId = app.getBookId()
      const userInfo = app.getUserInfo() || {}
      const items = this.data.items.map(item => ({
        itemId: item.itemId,
        type: item.type,
        amount: item.amountFen,
        categoryId: item.categoryId,
        date: item.date,
        remark: item.remark || '',
        images: []
      }))
      const res = await wx.cloud.callFunction({
        name: 'record',
        data: {
          action: 'batchCreate',
          bookId,
          data: {
            requestId: this.data.requestId,
            items
          },
          isTest: config.isTest,
          nickName: userInfo.nickName
        }
      })
      const result = res.result
      if (!result || !result.success) {
        this.setData({
          stage: 'error',
          submitting: false,
          errorMessage: result?.error || '写入失败，请重试'
        })
        return
      }
      const budgetAlerts = result.budgetAlerts || []
      const alert = budgetAlerts.find(a => a) || null
      this.setData({
        stage: 'success',
        submitting: false,
        successCount: (result.recordIds || []).length,
        showBudgetAlert: !!alert,
        budgetAlertView: alert
      })
    } catch (err) {
      console.error('batchCreate failed:', err)
      this.setData({
        stage: 'error',
        submitting: false,
        errorMessage: '写入失败，请重试或转手工记账'
      })
    }
  },

  // 返回首页
  goToHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  // 再记一笔
  recordAgain() {
    this.setData({
      stage: 'idle',
      transcript: '',
      items: [],
      errorMessage: '',
      requestId: generateId(),
      successCount: 0,
      showBudgetAlert: false,
      budgetAlertView: null
    })
  }
})
