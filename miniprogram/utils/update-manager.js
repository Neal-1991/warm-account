function showUpdateFailure(wxApi) {
  wxApi.showModal({
    title: '更新失败',
    content: '新版本下载失败，请关闭并重新打开小程序后再继续使用。',
    showCancel: false,
    confirmText: '关闭小程序',
    success: () => {
      if (typeof wxApi.exitMiniProgram === 'function') {
        wxApi.exitMiniProgram({
          fail: () => showUpdateFailure(wxApi)
        })
        return
      }
      showUpdateFailure(wxApi)
    },
    fail: () => showUpdateFailure(wxApi)
  })
}

function setupUpdateManager(wxApi) {
  if (!wxApi || typeof wxApi.getUpdateManager !== 'function') {
    return null
  }

  const updateManager = wxApi.getUpdateManager()

  updateManager.onCheckForUpdate(result => {
    console.log('[暖账] 检查更新:', result?.hasUpdate ? '发现新版本' : '当前已是最新版本')
  })

  updateManager.onUpdateReady(() => {
    wxApi.showModal({
      title: '新版本已准备好',
      content: '需要立即重启以完成更新。',
      showCancel: false,
      confirmText: '立即更新',
      success: result => {
        if (result.confirm) {
          updateManager.applyUpdate()
        }
      }
    })
  })

  updateManager.onUpdateFailed(() => {
    showUpdateFailure(wxApi)
  })

  return updateManager
}

module.exports = {
  setupUpdateManager,
  showUpdateFailure
}
