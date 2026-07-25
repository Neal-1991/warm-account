const config = require('../../utils/config')
const {
  isInviteActive,
  reasonFromErrorCode
} = require('../../utils/invite')

Page({
  data: {
    bookName: '',
    inviteCode: '',
    inviteCodeExpire: null,
    members: [],
    currentOpenId: '',
    isAdmin: false,
    // dialog
    dialogType: '',
    dialogBookName: '',
    dialogTitle: '',
    dialogContent: '',
    pendingInviteCode: '',
    pendingTargetBookId: '',
    joining: false,
    joinProgressText: '',
    themeStyle: ''
  },

  async onLoad(options) {
    this._unloaded = false
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
    const session = await app.ensureSession()
    const openId = session.openId || app.getOpenId()
    this.setData({ currentOpenId: openId || '' })

    if (options && options.inviteCode) {
      if (!session.authenticated || !openId) {
        wx.setStorageSync('pendingInviteCode', options.inviteCode)
        wx.redirectTo({ url: '/pages/login/login' })
        return
      }
      this.validateAndShowDialog(options.inviteCode)
    }

    this.loadData()
  },

  async onShow() {
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
    const session = await app.ensureSession()
    const openId = session.openId || app.getOpenId()
    this.setData({ currentOpenId: openId || '' })

    const code = wx.getStorageSync('pendingInviteCode')
    if (code && openId) {
      wx.removeStorageSync('pendingInviteCode')
      this.validateAndShowDialog(code)
    }

    this.loadData()
  },

  onUnload() {
    this._unloaded = true
    if (this.joinTimer) {
      clearTimeout(this.joinTimer)
      this.joinTimer = null
    }
    if (this.data.joining) {
      wx.hideLoading()
    }
  },

  async loadData() {
    const app = getApp()
    const session = await app.ensureSession()
    if (!session.authenticated) {
      return
    }
    const openId = session.openId || app.getOpenId()

    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'get',
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result && res.result.success && res.result.book) {
        const book = res.result.book
        const isAdmin = book.ownerId === openId

        const inviteCode = isInviteActive(book.inviteCode, book.inviteCodeExpire)
          ? book.inviteCode
          : ''

        this.setData({
          bookName: book.name || '我的账本',
          inviteCode,
          inviteCodeExpire: inviteCode ? book.inviteCodeExpire : null,
          isAdmin,
          bookOwnerId: book.ownerId
        })
        this.loadMembers(book.memberIds || [])
      } else {
        this.setData({
          bookName: '',
          inviteCode: '',
          inviteCodeExpire: null,
          members: [],
          isAdmin: false
        })
      }
    }).catch(err => {
      console.error('loadData error:', err)
    })
  },

  loadMembers(memberIds) {
    const app = getApp()
    const currentOpenId = app.getOpenId()
    const bookOwnerId = this.data.bookOwnerId

    // 批量查询成员的真实昵称和头像
    wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getMembers',
        memberIds,
        isTest: config.isTest
      }
    }).then(res => {
      const membersData = (res.result && res.result.members) ? res.result.members : []
      const memberMap = {}
      membersData.forEach(m => { memberMap[m.openId] = m })

      const members = memberIds.map(openId => {
        const profile = memberMap[openId]
        const isSelf = openId === currentOpenId
        return {
          openId,
          nickName: profile?.nickName || (isSelf ? '我' : '未知'),
          avatarUrl: profile?.avatarUrl || '',
          role: openId === bookOwnerId ? 'admin' : 'member'
        }
      })

      this.setData({ members })
    }).catch(err => {
      console.error('loadMembers error:', err)
      // fallback
      const members = memberIds.map((openId, index) => ({
        openId,
        nickName: openId === currentOpenId ? '我' : `成员${index + 1}`,
        avatarUrl: '',
        role: openId === bookOwnerId ? 'admin' : 'member'
      }))
      this.setData({ members })
    })
  },

  // ==================== 分享 ====================

  async onShareAppMessage() {
    const app = getApp()
    const session = await app.ensureSession()
    const bookId = session.bookId || app.getBookId()
    if (!session.authenticated || !bookId) {
      return { title: '暖账', path: '/pages/family/family' }
    }

    const currentCode = this.data.inviteCode
    if (isInviteActive(currentCode, this.data.inviteCodeExpire)) {
      return { title: `邀请你加入「${this.data.bookName}」`, path: `/pages/family/family?inviteCode=${currentCode}` }
    }

    return wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'generateInviteCode',
        bookId,
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({
          inviteCode: res.result.code,
          inviteCodeExpire: res.result.expiresAt
        })
        return { title: `邀请你加入「${this.data.bookName}」`, path: `/pages/family/family?inviteCode=${res.result.code}` }
      }
      return { title: '暖账', path: '/pages/family/family' }
    })
  },

  // ==================== 邀请码验证 & 弹窗 ====================

  validateAndShowDialog(inviteCode) {
    if (!inviteCode) return

    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'validateInviteCode',
        code: inviteCode,
        isTest: config.isTest
      }
    }).then(res => {
      if (!res.result) return

      if (res.result.success && res.result.valid) {
        this.setData({
          pendingInviteCode: inviteCode,
          pendingTargetBookId: res.result.bookId || '',
          dialogType: 'confirm',
          dialogBookName: res.result.bookName || '家庭账本',
          joinProgressText: res.result.joinStatus === 'processing' ? '上次合并尚未完成，可继续加入' : ''
        })
      } else {
        const reason = res.result.reason ||
          reasonFromErrorCode(res.result.errorCode) ||
          'not_found'
        if (reason === 'already_member' && res.result.bookId) {
          const app = getApp()
          app.setBookId(res.result.bookId)
          this.loadData()
        }
        this.showTipDialog(reason, res.result.bookName)
      }
    }).catch(() => {
      this.showTipDialog('not_found')
    })
  },

  onConfirmJoin() {
    const inviteCode = this.data.pendingInviteCode
    if (!inviteCode || this.data.joining) return

    this.setData({ joining: true, joinProgressText: '正在准备合并...' })
    wx.showLoading({ title: '正在合并...', mask: true })
    this.runJoinStep()
  },

  runJoinStep() {
    const inviteCode = this.data.pendingInviteCode
    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'join',
        code: inviteCode,
        isTest: config.isTest
      }
    }).then(res => {
      const result = res.result
      if (!result || !result.success) {
        this.failJoin(result?.error || '加入失败', result?.errorCode)
        return
      }
      if (result.status === 'completed') {
        this.finishJoin(result.bookId)
        return
      }
      this.updateJoinProgress(result.progress)
      this.scheduleJoinStep()
    }).catch(err => {
      console.error('join error:', err)
      this.recoverJoinStatus()
    })
  },

  scheduleJoinStep() {
    if (!this.data.joining || this._unloaded) return
    if (this.joinTimer) clearTimeout(this.joinTimer)
    this.joinTimer = setTimeout(() => {
      this.joinTimer = null
      this.runJoinStep()
    }, 300)
  },

  updateJoinProgress(progress = {}) {
    const phaseNames = {
      planning: '正在分析分类...',
      remapCategories: '正在合并分类...',
      moveCategories: '正在迁移分类...',
      moveRecords: '正在迁移历史账目...',
      verify: '正在校验数据...',
      cleanup: '正在完成合并...'
    }
    this.setData({
      joinProgressText: phaseNames[progress.phase] || '正在合并家庭账本...'
    })
  },

  recoverJoinStatus() {
    const inviteCode = this.data.pendingInviteCode
    const targetBookId = this.data.pendingTargetBookId
    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'validateInviteCode',
        code: inviteCode,
        isTest: config.isTest
      }
    }).then(res => {
      const result = res.result
      if (result?.reason === 'already_member' && result.bookId === targetBookId) {
        this.finishJoin(targetBookId)
        return
      }
      if (result?.success &&
          result.valid &&
          result.bookId === targetBookId &&
          result.joinStatus === 'processing') {
        this.updateJoinProgress(result.progress)
        this.scheduleJoinStep()
        return
      }
      this.failJoin(
        result?.error || '加入未完成，请检查网络后重试',
        result?.errorCode
      )
    }).catch(() => {
      this.failJoin('加入未完成，请检查网络后重试')
    })
  },

  finishJoin(bookId) {
    if (!bookId || bookId !== this.data.pendingTargetBookId) {
      this.failJoin('目标账本校验失败，请重新打开邀请')
      return
    }
    if (this.joinTimer) {
      clearTimeout(this.joinTimer)
      this.joinTimer = null
    }
    wx.hideLoading()
    getApp().setBookId(bookId)
    this.setData({
      joining: false,
      dialogType: '',
      pendingInviteCode: '',
      pendingTargetBookId: '',
      joinProgressText: ''
    })
    wx.showToast({ title: '加入成功', icon: 'success' })
    this.loadData()
  },

  failJoin(error, errorCode) {
    if (this.joinTimer) {
      clearTimeout(this.joinTimer)
      this.joinTimer = null
    }
    wx.hideLoading()
    this.setData({ joining: false, joinProgressText: '' })
    const err = error || '加入失败'
    const reason = reasonFromErrorCode(errorCode)
    if (reason) {
      this.showTipDialog(reason, this.data.dialogBookName)
    } else if (err.includes('已是')) {
      this.showTipDialog('already_member', this.data.dialogBookName)
    } else if (err.includes('其他家庭')) {
      this.showTipDialog('in_other_family')
    } else if (err.includes('过期')) {
      this.showTipDialog('expired')
    } else if (err.includes('已被使用') || err.includes('其他用户')) {
      this.showTipDialog('used')
    } else {
      wx.showToast({ title: err, icon: 'none' })
    }
  },

  onDismissJoin() {
    if (this.data.joining) return
    this.setData({
      dialogType: '',
      pendingInviteCode: '',
      pendingTargetBookId: '',
      joinProgressText: ''
    })
  },

  showTipDialog(reason, bookName) {
    const tips = {
      already_member:   { title: '你已是「' + (bookName || '该家庭') + '」的成员', content: '' },
      already_owner:    { title: '你已是该账本的管理员', content: '' },
      expired:          { title: '邀请已失效', content: '已超过 1 小时，请联系对方重新邀请' },
      used:             { title: '该邀请已被使用', content: '请联系对方重新邀请' },
      in_other_family:  { title: '已有家庭账本', content: '你已加入其他家庭账本，暂不支持切换' },
      not_found:        { title: '邀请无效', content: '邀请码不存在或已被撤回' }
    }
    const tip = tips[reason] || tips.not_found

    this.setData({
      dialogType: 'tip',
      dialogTitle: tip.title,
      dialogContent: tip.content,
      pendingInviteCode: '',
      pendingTargetBookId: '',
      joining: false,
      joinProgressText: ''
    })
  },

  onDismissTip() {
    this.setData({ dialogType: '' })
  },

  // ==================== 成员管理 ====================

  removeMember(e) {
    const openId = e.currentTarget.dataset.openid
    wx.showModal({
      title: '确认移除',
      content: '确定要移除该成员吗？',
      success: res => {
        if (res.confirm) {
          wx.showToast({ title: '移除功能开发中', icon: 'none' })
        }
      }
    })
  }
})
