const config = require('../../utils/config')

Page({
  data: {
    bookName: '',
    inviteCode: '',
    members: [],
    currentOpenId: '',
    isAdmin: false,
    // dialog
    dialogType: '',
    dialogBookName: '',
    dialogTitle: '',
    dialogContent: '',
    pendingInviteCode: ''
  },

  onLoad(options) {
    const app = getApp()
    const openId = app.globalData?.openId || app.getOpenId()
    this.setData({ currentOpenId: openId || '' })

    // 分享卡片带 inviteCode 进入
    if (options && options.inviteCode) {
      if (!openId) {
        wx.setStorageSync('pendingInviteCode', options.inviteCode)
        wx.redirectTo({ url: '/pages/login/login' })
        return
      }
      this.validateAndShowDialog(options.inviteCode)
    }

    this.loadData()
  },

  onShow() {
    // 登录后回跳，检查 pendingInviteCode
    const app = getApp()
    const openId = app.globalData?.openId || app.getOpenId()
    this.setData({ currentOpenId: openId || '' })

    const code = wx.getStorageSync('pendingInviteCode')
    if (code && openId) {
      wx.removeStorageSync('pendingInviteCode')
      this.validateAndShowDialog(code)
    }

    this.loadData()
  },

  loadData() {
    const app = getApp()
    if (!app.globalData?.openId && !app.getOpenId()) {
      return
    }

    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'get',
        openId: app.globalData?.openId || app.getOpenId(),
        bookId: app.globalData?.bookId,
        isTest: config.isTest
      }
    }).then(res => {
      if (res.result && res.result.success && res.result.book) {
        const book = res.result.book
        const openId = app.globalData?.openId || app.getOpenId()
        const isAdmin = book.ownerId === openId

        let inviteCode = book.inviteCode || ''
        // 自动清除过期邀请码
        if (inviteCode && book.inviteCodeExpire && new Date(book.inviteCodeExpire) < new Date()) {
          inviteCode = ''
        }

        this.setData({
          bookName: book.name || '我的账本',
          inviteCode,
          isAdmin,
          bookOwnerId: book.ownerId
        })
        this.loadMembers(book.memberIds || [])
      } else {
        this.setData({ bookName: '', inviteCode: '', members: [], isAdmin: false })
      }
    }).catch(err => {
      console.error('loadData error:', err)
    })
  },

  loadMembers(memberIds) {
    const app = getApp()
    const currentOpenId = app.globalData?.openId || app.getOpenId()
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

  onShareAppMessage() {
    const app = getApp()
    const bookId = app.globalData?.bookId
    if (!bookId) {
      return { title: '暖账', path: '/pages/family/family' }
    }

    // 返回 Promise，异步生成邀请码后分享
    const currentCode = this.data.inviteCode
    if (currentCode) {
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
        this.setData({ inviteCode: res.result.code })
        return { title: `邀请你加入「${this.data.bookName}」`, path: `/pages/family/family?inviteCode=${res.result.code}` }
      }
      return { title: '暖账', path: '/pages/family/family' }
    })
  },

  // ==================== 邀请码验证 & 弹窗 ====================

  validateAndShowDialog(inviteCode) {
    if (!inviteCode) return

    const app = getApp()

    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'validateInviteCode',
        code: inviteCode,
        openId: app.globalData?.openId || app.getOpenId(),
        isTest: config.isTest
      }
    }).then(res => {
      if (!res.result) return

      if (res.result.success && res.result.valid) {
        this.setData({
          pendingInviteCode: inviteCode,
          dialogType: 'confirm',
          dialogBookName: res.result.bookName || '家庭账本'
        })
      } else {
        const reason = res.result.reason || 'not_found'
        this.showTipDialog(reason, res.result.bookName)
      }
    }).catch(() => {
      this.showTipDialog('not_found')
    })
  },

  onConfirmJoin() {
    const app = getApp()
    const inviteCode = this.data.pendingInviteCode
    if (!inviteCode) return

    wx.showLoading({ title: '加入中...' })

    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'join',
        openId: app.globalData?.openId || app.getOpenId(),
        code: inviteCode,
        isTest: config.isTest
      }
    }).then(res => {
      wx.hideLoading()

      if (res.result && res.result.success) {
        app.setBookId(res.result.bookId)
        this.setData({ dialogType: '', pendingInviteCode: '' })
        wx.showToast({ title: '加入成功', icon: 'success' })
        this.loadData()
      } else {
        const err = res.result?.error || '加入失败'
        this.setData({ dialogType: '' })
        if (err.includes('已是')) {
          this.showTipDialog('already_member', this.data.dialogBookName)
        } else if (err.includes('其他家庭')) {
          this.showTipDialog('in_other_family')
        } else if (err.includes('过期')) {
          this.showTipDialog('expired')
        } else if (err.includes('已被使用')) {
          this.showTipDialog('used')
        } else {
          wx.showToast({ title: err, icon: 'none' })
        }
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('join error:', err)
      this.setData({ dialogType: '', pendingInviteCode: '' })

      // 可能服务端已执行成功但响应超时，重新查询确认
      wx.cloud.callFunction({
        name: 'book',
        data: {
          action: 'get',
          openId: app.globalData?.openId || app.getOpenId(),
          isTest: config.isTest
        }
      }).then(res => {
        if (res.result?.success && res.result?.book) {
          const book = res.result.book
          const openId = app.globalData?.openId || app.getOpenId()
          if (book.ownerId === openId || (book.memberIds || []).includes(openId)) {
            // 加入成功，更新 bookId
            app.setBookId(book._id)
            wx.showToast({ title: '加入成功', icon: 'success' })
            this.loadData()
            return
          }
        }
        wx.showToast({ title: '加入失败，请检查网络后重试', icon: 'none' })
      }).catch(() => {
        wx.showToast({ title: '加入失败，请检查网络后重试', icon: 'none' })
      })
    })
  },

  onDismissJoin() {
    this.setData({ dialogType: '', pendingInviteCode: '' })
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
      pendingInviteCode: ''
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
