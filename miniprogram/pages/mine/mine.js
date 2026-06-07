const config = require('../../utils/config')

Page({
  data: {
    userInfo: null,
    showEditModal: false,
    editingNickName: ''
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  loadUserInfo() {
    const app = getApp()
    const userInfo = app.getUserInfo()
    const isLoggedIn = !!app.globalData.openId
    this.setData({
      userInfo,
      isLoggedIn,
      editingNickName: userInfo?.nickName || ''
    })
  },

  // 导航到登录页
  goToLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  // 昵称输入（手动输入）
  onNicknameInput(e) {
    this.setData({ editingNickName: e.detail.value })
  },

  // 昵称失焦时获取（从键盘工具栏选择微信昵称后自动填入）
  onNicknameBlur(e) {
    if (e.detail.value) {
      this.setData({ editingNickName: e.detail.value })
    }
  },

  goToFamily() {
    if (!getApp().globalData.openId) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: '/pages/family/family' })
  },

  goToAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  // 显示编辑弹窗
  onShowEditModal() {
    if (!getApp().globalData.openId) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const userInfo = this.data.userInfo || {}
    this.setData({
      showEditModal: true,
      editingNickName: userInfo.nickName || ''
    })
  },

  // 隐藏编辑弹窗
  onHideEditModal() {
    this.setData({ showEditModal: false })
  },

  // 获取微信头像（通过 button open-type="chooseAvatar"，可拍照/相册/选微信头像）
  onChooseWechatAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    if (avatarUrl) {
      const userInfo = { ...(this.data.userInfo || {}) }
      userInfo.avatarUrl = avatarUrl
      this.setData({ userInfo })
    }
  },

  // 保存个人信息
  onSaveProfile() {
    const nickName = this.data.editingNickName.trim()
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    const userInfo = { ...(this.data.userInfo || {}) }
    const oldNickName = userInfo.nickName
    userInfo.nickName = nickName

    const completeSave = (avatarUrl) => {
      userInfo.avatarUrl = avatarUrl || ''
      this.setData({ userInfo })
      getApp().setUserInfo(userInfo)

      // 昵称有变时，同步更新历史账单中的记账人
      if (oldNickName !== nickName) {
        const app = getApp()
        const openId = app.globalData.openId
        if (openId) {
          wx.cloud.callFunction({
            name: 'record',
            data: {
              action: 'updateCreatedByName',
              data: { openId, nickName },
              isTest: config.isTest
            }
          }).catch(err => {
            console.error('同步昵称到历史记录失败:', err)
          })
        }
      }

      // 持久化到云端 members 集合
      wx.cloud.callFunction({
        name: 'login',
        data: {
          action: 'updateProfile',
          nickName,
          avatarUrl: avatarUrl || '',
          bookId: getApp().globalData.bookId || '',
          isTest: config.isTest
        }
      }).catch(err => {
        console.error('同步个人资料到云端失败:', err)
      })

      this.onHideEditModal()
      wx.showToast({ title: '个人信息已保存', icon: 'success' })
    }

    const avatarUrl = userInfo.avatarUrl || ''
    // chooseAvatar 返回的是本地临时路径，先上传到云存储持久化
    if (avatarUrl.startsWith('wxfile://') || avatarUrl.startsWith('http://tmp/')) {
      wx.showLoading({ title: '上传头像中...' })
      const cloudPath = `${config.isTest ? 'test' : 'prod'}/avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
      wx.cloud.uploadFile({ cloudPath, filePath: avatarUrl }).then(res => {
        wx.hideLoading()
        completeSave(res.fileID)
      }).catch(err => {
        wx.hideLoading()
        console.error('上传头像到云存储失败:', err)
        wx.showToast({ title: '头像上传失败', icon: 'none' })
      })
    } else {
      completeSave(avatarUrl)
    }
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: res => {
        if (res.confirm) {
          getApp().logout()

          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          })

          setTimeout(() => {
            wx.reLaunch({ url: '/pages/login/login' })
          }, 1500)
        }
      }
    })
  }
})
