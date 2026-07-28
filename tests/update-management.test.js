const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { APP_VERSION } = require('../miniprogram/utils/version')
const {
  setupUpdateManager
} = require('../miniprogram/utils/update-manager')

test('release version has one shared source of truth', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/)

  const root = path.join(__dirname, '..')
  const aboutSource = fs.readFileSync(
    path.join(root, 'miniprogram/pages/about/about.wxml'),
    'utf8'
  )
  assert.match(aboutSource, /版本 \{\{appVersion\}\}/)
  assert.doesNotMatch(aboutSource, /版本 3\.0\.0/)
})

test('update manager applies a ready update after a non-cancelable prompt', () => {
  const callbacks = {}
  let applied = 0
  let modalOptions
  const updateManager = {
    onCheckForUpdate(callback) {
      callbacks.check = callback
    },
    onUpdateReady(callback) {
      callbacks.ready = callback
    },
    onUpdateFailed(callback) {
      callbacks.failed = callback
    },
    applyUpdate() {
      applied += 1
    }
  }
  const wxApi = {
    getUpdateManager() {
      return updateManager
    },
    showModal(options) {
      modalOptions = options
      options.success({ confirm: true })
    }
  }

  assert.equal(setupUpdateManager(wxApi), updateManager)
  callbacks.ready()

  assert.equal(modalOptions.showCancel, false)
  assert.equal(modalOptions.confirmText, '立即更新')
  assert.equal(applied, 1)
})

test('update download failure exits the current mini program instance', () => {
  const callbacks = {}
  let modalOptions
  let exited = 0
  const wxApi = {
    getUpdateManager() {
      return {
        onCheckForUpdate(callback) {
          callbacks.check = callback
        },
        onUpdateReady(callback) {
          callbacks.ready = callback
        },
        onUpdateFailed(callback) {
          callbacks.failed = callback
        },
        applyUpdate() {}
      }
    },
    showModal(options) {
      modalOptions = options
      options.success({ confirm: true })
    },
    exitMiniProgram() {
      exited += 1
    }
  }

  setupUpdateManager(wxApi)
  callbacks.failed()

  assert.equal(modalOptions.showCancel, false)
  assert.match(modalOptions.content, /关闭并重新打开/)
  assert.equal(exited, 1)
})

test('unsupported update manager leaves the application running normally', () => {
  assert.equal(setupUpdateManager({}), null)
})

test('record page uses a non-blocking notice and automatic home return', () => {
  const root = path.join(__dirname, '..')
  const addJs = fs.readFileSync(
    path.join(root, 'miniprogram/pages/add/add.js'),
    'utf8'
  )
  const addWxml = fs.readFileSync(
    path.join(root, 'miniprogram/pages/add/add.wxml'),
    'utf8'
  )

  assert.match(addJs, /scheduleHomeReturn\(2000\)/)
  assert.match(addJs, /if \(this\._returningHome\) return/)
  assert.match(addJs, /onUnload\(\)[\s\S]*clearReturnTimer/)
  assert.match(addWxml, /class="budget-notice/)
  assert.doesNotMatch(addWxml, /budget-alert-mask/)
  assert.doesNotMatch(addWxml, /知道了/)
})
