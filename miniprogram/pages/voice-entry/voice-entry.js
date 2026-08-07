// miniprogram/pages/voice-entry/voice-entry.js
const config = require('../../utils/config')
const { budgetAlertContent } = require('../../utils/budget')

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
    successCount: 0,
    wantCancel: false,
    holdBtnText: '按住说话',
    showCategoryPicker: false,
    pickerType: 'expense',
    pickerTargetItemId: null
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
    this.prepareForRecording()
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
          // 30 秒自动停止：清定时器 + 调 recorderManager.stop，走 onStop 回调
          this.clearTimers()
          this.recorderManager.stop()
        }
      }, 1000)
    })

    this.recorderManager.onStop((res) => {
      this.clearTimers()
      // 防重入：onStop 可能被多次回调（30秒自动停止 + 手动停止重叠时）
      if (this._processingStop) return
      this._processingStop = true
      if (this._cancelled) {
        this._cancelled = false
        this._processingStop = false
        this.setData({
          stage: 'idle',
          wantCancel: false,
          holdBtnText: '按住说话',
          transcript: '',
          items: []
        })
        return
      }
      if (!res || !res.duration || res.duration < 300) {
        this._processingStop = false
        this.setData({
          stage: 'error',
          errorMessage: '录音过短，请重新录音',
          holdBtnText: '按住说话'
        })
        return
      }
      this.uploadAndRecognize(res.tempFilePath).finally(() => {
        this._processingStop = false
      })
    })

    this.recorderManager.onError((err) => {
      this.clearTimers()
      console.error('[voice-entry] recorder onError:', JSON.stringify(err), err)
      const errMsg = String(err?.errMsg || err?.message || err || '')
      // 权限拒绝通常包含 "auth" 或 "permission" 或 "deny"
      if (/auth|permission|deny|拒绝/i.test(errMsg)) {
        this.setData({
          stage: 'error',
          errorMessage: '麦克风权限被拒绝，请在微信设置中开启后重试',
          holdBtnText: '按住说话'
        })
      } else {
        this.setData({
          stage: 'error',
          errorMessage: '录音失败：' + errMsg.slice(0, 50),
          holdBtnText: '按住说话'
        })
      }
    })
  },

  // 隐私协议授权（微信新隐私协议要求，基础库 2.32.3+ 必须先同意才能用敏感 API）
  requirePrivacyAuthorize() {
    return new Promise(resolve => {
      if (typeof wx.requirePrivacyAuthorize !== 'function') {
        // 旧基础库没有此 API，直接放行
        console.log('[voice-entry] wx.requirePrivacyAuthorize not available, skip')
        resolve(true)
        return
      }
      wx.requirePrivacyAuthorize({
        success: () => {
          console.log('[voice-entry] privacy authorize success')
          resolve(true)
        },
        fail: (err) => {
          console.log('[voice-entry] privacy authorize fail:', err)
          resolve(false)
        }
      })
    })
  },

  // 进入页面时预准备：session + 隐私协议 + 麦克风权限
  // 目的：让用户按住按钮时权限已就绪，避免 touchstart 期间异步弹窗的时序问题
  async prepareForRecording() {
    const app = getApp()
    const session = await app.ensureSession()
    if (!session.authenticated) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    // 隐私协议（微信新规：scope.record 必须先同意隐私协议）
    const privacyOk = await this.requirePrivacyAuthorize()
    if (!privacyOk) {
      console.log('[voice-entry] privacy not authorized')
      this.setData({ stage: 'error', errorMessage: '需要同意隐私协议才能使用语音记账' })
      return
    }
    await this.prepareMicPermission()
  },

  // 静默预检查麦克风权限：已授权则标记就绪；拒绝过则标记需引导；从未问过则主动请求
  async prepareMicPermission() {
    try {
      const setting = await wx.getSetting()
      const recordAuth = setting.authSetting['scope.record']
      console.log('[voice-entry] prepareMicPermission recordAuth:', recordAuth)
      if (recordAuth === true) {
        this._permReady = true
        this._permDenied = false
        return
      }
      if (recordAuth === false) {
        this._permReady = false
        this._permDenied = true
        return
      }
      // 从未问过 → 主动请求授权（避免按住时弹窗的时序问题）
      const authorized = await new Promise(resolve => {
        wx.authorize({
          scope: 'scope.record',
          success: () => resolve(true),
          fail: () => resolve(false)
        })
      })
      this._permReady = authorized
      this._permDenied = !authorized
      console.log('[voice-entry] authorize result:', authorized)
    } catch (err) {
      console.error('[voice-entry] prepareMicPermission failed:', err)
      // 出错时不阻塞，让 onHoldStart 再尝试
    }
  },

  // 权限被拒绝时引导用户去设置
  async guideToSetting() {
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '需要麦克风权限',
        content: '语音记账需要使用麦克风，请在设置中开启',
        confirmText: '去设置',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false)
      })
    })
    if (confirmed) {
      const settingRes = await wx.openSetting()
      const granted = settingRes.authSetting['scope.record'] === true
      this._permReady = granted
      this._permDenied = !granted
      console.log('[voice-entry] openSetting result:', granted)
    }
  },

  // ===== 按住说话交互 =====

  onHoldStart(e) {
    if (this.data.stage === 'recording') return
    if (this._permDenied) {
      this.guideToSetting()
      return
    }
    if (!this._permReady) {
      // 权限准备中（prepareForRecording 还在执行或失败）
      this.setData({ stage: 'error', errorMessage: '权限准备中，请稍后再试' })
      return
    }
    this._cancelled = false
    this._startY = e.touches[0].clientY
    this.setData({
      stage: 'recording',
      recordingSeconds: 0,
      wantCancel: false,
      holdBtnText: '松开结束',
      transcript: '',
      items: [],
      errorMessage: ''
    })
    this.recorderManager.start({
      duration: MAX_RECORD_MS,
      sampleRate: SAMPLE_RATE,
      numberOfChannels: NUMBER_OF_CHANNELS,
      encodeBitRate: 64000,
      format: RECORD_FORMAT
    })
  },

  onHoldMove(e) {
    if (this.data.stage !== 'recording') return
    const y = e.touches[0].clientY
    const deltaY = this._startY - y
    // 上滑超过 60px 触发取消
    if (deltaY > 60 && !this.data.wantCancel) {
      this.setData({ wantCancel: true, holdBtnText: '松开取消' })
    } else if (deltaY <= 60 && this.data.wantCancel) {
      this.setData({ wantCancel: false, holdBtnText: '松开结束' })
    }
  },

  onHoldEnd() {
    if (this.data.stage !== 'recording') return
    if (this.data.wantCancel) {
      this._cancelled = true
    }
    this.clearTimers()
    this.recorderManager.stop()
  },

  onHoldCancel() {
    // touchcancel（手指滑出按钮区域、系统打断等）视为取消
    if (this.data.stage !== 'recording') return
    this._cancelled = true
    this.clearTimers()
    this.recorderManager.stop()
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
        console.error('voice-entry recognize failed:', {
          errorCode: result?.errorCode,
          error: result?.error,
          raw: result
        })
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
      requestId: generateId(),
      wantCancel: false,
      holdBtnText: '按住说话'
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
        console.error('voice-entry parse failed:', {
          errorCode: result?.errorCode,
          error: result?.error,
          usedAI: result?.usedAI,
          raw: result
        })
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
    const { itemId } = e.currentTarget.dataset
    const target = this.data.items.find(i => i.itemId === itemId)
    if (!target) return
    this.setData({
      showCategoryPicker: true,
      pickerType: target.type,
      pickerTargetItemId: itemId
    })
  },

  closeCategoryPicker() {
    this.setData({ showCategoryPicker: false, pickerTargetItemId: null })
  },

  onCategorySelect(e) {
    const selected = e.detail || {}
    const itemId = this.data.pickerTargetItemId
    if (!itemId) return
    const items = this.data.items.map(item =>
      item.itemId === itemId
        ? {
            ...item,
            categoryId: selected.categoryId,
            categoryName: selected.categoryName || selected.name || '',
            needsReview: false,
            warnings: []
          }
        : item
    )
    this.setData({ items, showCategoryPicker: false, pickerTargetItemId: null })
    this.updateCanConfirm()
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
            items,
            nickName: userInfo.nickName
          },
          isTest: config.isTest
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
        budgetAlertView: alert ? budgetAlertContent(alert) : null
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
      budgetAlertView: null,
      wantCancel: false,
      holdBtnText: '按住说话'
    })
  }
})
