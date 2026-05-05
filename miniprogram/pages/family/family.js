Page({
  data: {
    bookName: '',
    inviteCode: '',
    members: [],
    currentOpenId: '',
    isAdmin: false,
    isMember: false,
    inputCode: ''
  },

  onLoad() {
    const app = getApp()
    this.setData({
      currentOpenId: app.globalData?.openId || '',
      isMember: !!app.globalData?.bookId
    })
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const app = getApp()
    if (!app.globalData?.openId) {
      return
    }

    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'get',
        openId: app.globalData.openId
      }
    }).then(res => {
      if (res.result && res.result.success && res.result.book) {
        const book = res.result.book
        this.setData({
          bookName: book.name || '我的账本',
          inviteCode: book.inviteCode || '',
          isAdmin: book.ownerId === app.globalData.openId
        })
        this.loadMembers(book.memberIds || [])
      }
    }).catch(err => {
      console.error('loadData error:', err)
      wx.showToast({ title: '数据加载失败', icon: 'none' })
    })
  },

  loadMembers(memberIds) {
    // Simplified - in production would query members collection
    // For now, create mock member data
    const app = getApp()
    const members = memberIds.map((openId, index) => ({
      openId,
      nickName: `成员${index + 1}`,
      avatarUrl: '',
      role: index === 0 ? 'admin' : 'member'
    }))

    // Mark current user
    const currentIdx = members.findIndex(m => m.openId === app.globalData?.openId)
    if (currentIdx !== -1) {
      members[currentIdx].nickName = app.globalData.userInfo?.nickName || '我'
      members[currentIdx].avatarUrl = app.globalData.userInfo?.avatarUrl || ''
    }

    this.setData({ members })
  },

  generateInviteCode() {
    const app = getApp()
    if (!app.globalData?.bookId) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'generateInviteCode',
        bookId: app.globalData.bookId
      }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({ inviteCode: res.result.code })
        wx.showToast({ title: '生成成功', icon: 'success' })
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('generateInviteCode error:', err)
      wx.showToast({ title: '生成失败', icon: 'none' })
    })
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      }
    })
  },

  onCodeInput(e) {
    this.setData({ inputCode: e.detail.value })
  },

  joinFamily() {
    const { inputCode } = this.data
    if (!inputCode || inputCode.length !== 6 || !/^\d{6}$/.test(inputCode)) {
      wx.showToast({ title: '请输入6位邀请码', icon: 'none' })
      return
    }

    const app = getApp()

    wx.cloud.callFunction({
      name: 'book',
      data: {
        action: 'join',
        openId: app.globalData?.openId,
        code: inputCode
      }
    }).then(res => {
      if (res.result && res.result.success) {
        app.globalData.bookId = res.result.bookId
        wx.showToast({ title: '加入成功', icon: 'success' })
        this.loadData()
      } else {
        wx.showToast({ title: res.result?.error || '加入失败', icon: 'none' })
      }
    }).catch(err => {
      console.error('joinFamily error:', err)
      wx.showToast({ title: '加入失败', icon: 'none' })
    })
  },

  removeMember(e) {
    const openId = e.currentTarget.dataset.openid
    wx.showModal({
      title: '确认移除',
      content: '确定要移除该成员吗？',
      success: res => {
        if (res.confirm) {
          // TODO: Implement remove member cloud function when backend adds support
        wx.showToast({ title: '移除功能开发中', icon: 'none' })
        }
      }
    })
  }
})