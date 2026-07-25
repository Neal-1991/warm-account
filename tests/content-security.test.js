const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function sliceCase(source, startCase, endCase) {
  return source.slice(source.indexOf(startCase), source.indexOf(endCase))
}

test('record writes run content security before saving remarks and images', () => {
  const source = readSource('cloudfunctions/record/index.js')
  const addCase = sliceCase(source, "case 'add'", "case 'get'")
  const updateCase = sliceCase(source, "case 'update'", "case 'delete'")

  assert.match(source, /CONTENT_SECURITY_REJECTED/)
  assert.match(source, /内容含违规信息，请修改后再试/)
  assert.match(source, /内容安全检测暂不可用，请稍后再试/)
  assert.match(source, /cloud\.openapi\?\.security\?\.msgSecCheck/)
  assert.match(source, /cloud\.openapi\?\.security\?\.imgSecCheck/)
  assert.match(source, /cloud\.downloadFile\(\{ fileID: fileId \}\)/)
  assert.match(source, /openid: openId/)
  assert.match(source, /scene: SECURITY_SCENE/)
  assert.match(source, /version: SECURITY_VERSION/)
  assert.match(addCase, /await assertRecordContentSafe\(\{ remark: data\.remark \|\| '', images \}\)/)
  assert.match(updateCase, /const nextRemark = data\.remark !== undefined \? data\.remark : record\.remark/)
  assert.match(updateCase, /const nextImages = data\.images !== undefined \? normalizeImages\(data\.images\) : normalizeImages\(record\.images \|\| \[\]\)/)
  assert.match(updateCase, /await assertRecordContentSafe\(\{ remark: nextRemark \|\| '', images: nextImages \|\| \[\] \}\)/)
  assert.ok(
    addCase.indexOf('await assertRecordContentSafe') < addCase.indexOf("db.collection(collectionName('records')).add")
  )
  assert.ok(
    updateCase.indexOf('await assertRecordContentSafe') < updateCase.indexOf("db.collection(collectionName('records')).doc(recordId).update")
  )
})

test('category name writes run msgSecCheck before saving user category names', () => {
  const source = readSource('cloudfunctions/category/index.js')
  const addBigCase = sliceCase(source, "case 'addBig'", "case 'addChild'")
  const addChildCase = sliceCase(source, "case 'addChild'", "case 'reorderBig'")
  const renameCase = sliceCase(source, "case 'rename'", "case 'deleteChild'")

  assert.match(source, /cloud\.openapi\?\.security\?\.msgSecCheck/)
  assert.match(source, /content: text/)
  assert.match(addBigCase, /await assertTextContentSafe\(trimmedName, 'categoryName'\)/)
  assert.match(addChildCase, /await assertTextContentSafe\(trimmedName, 'categoryName'\)/)
  assert.match(renameCase, /await assertTextContentSafe\(updateData\.name, 'categoryName'\)/)
  assert.ok(
    addBigCase.indexOf('await assertTextContentSafe') < addBigCase.indexOf("db.collection(collectionName('categories')).add")
  )
  assert.ok(
    addChildCase.indexOf('await assertTextContentSafe') < addChildCase.indexOf("db.collection(collectionName('categories')).add")
  )
  assert.ok(
    renameCase.indexOf('await assertTextContentSafe') < renameCase.indexOf("db.collection(collectionName('categories')).doc(categoryId).update")
  )
})

test('frontend cleans only newly uploaded record images after blocked saves', () => {
  const source = readSource('miniprogram/pages/add/add.js')

  assert.match(source, /sizeType: \['compressed'\]/)
  assert.match(source, /newlyUploadedFileIds/)
  assert.match(source, /deleteUploadedFiles\(fileIds\)/)
  assert.match(source, /wx\.cloud\.deleteFile\(\{ fileList \}\)/)
  assert.match(source, /return \{ finalFileIds, newlyUploadedFileIds \}/)
  assert.match(source, /if \(!success\) \{\s*await this\.deleteUploadedFiles\(newlyUploadedFileIds\)/)
  assert.match(source, /catch \(err\) \{[\s\S]*await this\.deleteUploadedFiles\(newlyUploadedFileIds\)/)
})

test('content security timeout and public error shape stay review friendly', () => {
  const recordSource = readSource('cloudfunctions/record/index.js')
  const categorySource = readSource('cloudfunctions/category/index.js')
  const recordConfig = JSON.parse(readSource('cloudfunctions/record/config.json'))

  assert.equal(recordConfig.timeout, 20)
  for (const source of [recordSource, categorySource]) {
    assert.match(source, /errorCode: err\.errorCode/)
    assert.match(source, /CONTENT_SECURITY_UNAVAILABLE/)
    assert.doesNotMatch(source, /用户所发布内容/)
    assert.doesNotMatch(source, /命中规则/)
  }
})
