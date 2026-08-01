const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

// ===== local-parser 实际功能测试（可 require） =====
const { parseTranscript, parseAmount, parseDate, inferType, detectComplexSemantics, splitSegments } = require(path.join(root, 'cloudfunctions/voice-entry/local-parser.js'))

const SAMPLE_CATEGORIES = [
  { _id: 'cat-lunch', name: '午餐', type: 'expense' },
  { _id: 'cat-salary', name: '工资', type: 'income' },
  { _id: 'cat-transport', name: '交通', type: 'expense', aliases: ['地铁', '打车'] }
]

test('parseAmount 支持阿拉伯数字', () => {
  assert.equal(parseAmount('花了30元'), 3000)
  assert.equal(parseAmount('30.5元'), 3050)
  assert.equal(parseAmount('1299.90'), 129990)
  assert.equal(parseAmount('1,299.90元'), 129990)
  assert.equal(parseAmount('30'), 3000)
})

test('parseAmount 支持块毛角分表达', () => {
  assert.equal(parseAmount('30块5'), 3050)
  assert.equal(parseAmount('30元5角'), 3050)
})

test('parseAmount 支持中文数字', () => {
  assert.equal(parseAmount('三十元'), 3000)
  assert.equal(parseAmount('一百二十八块'), 12800)
  assert.equal(parseAmount('五千元'), 500000)
})

test('parseAmount 对无金额返回 null', () => {
  assert.equal(parseAmount('买了点东西'), null)
})

test('parseDate 支持相对日期', () => {
  const now = new Date(2026, 7, 1) // 2026-08-01
  assert.equal(parseDate('今天', now), '2026-08-01')
  assert.equal(parseDate('昨天', now), '2026-07-31')
  assert.equal(parseDate('前天', now), '2026-07-30')
  assert.equal(parseDate('本月5号', now), '2026-08-05')
})

test('inferType 推断收支类型', () => {
  assert.equal(inferType('花了30元'), 'expense')
  assert.equal(inferType('收到工资5000'), 'income')
  assert.equal(inferType('买了书'), 'expense')
  assert.equal(inferType('吃饭'), null)
})

test('detectComplexSemantics 检测复杂金融语义', () => {
  assert.ok(detectComplexSemantics('和朋友AA'))
  assert.ok(detectComplexSemantics('转账给微信'))
  assert.ok(detectComplexSemantics('借出100'))
  assert.equal(detectComplexSemantics('午饭30元'), null)
})

test('splitSegments 按分隔符拆分多笔', () => {
  const segs = splitSegments('今天午饭30元，晚上地铁5元')
  assert.equal(segs.length, 2)
  assert.ok(segs[0].includes('午饭'))
  assert.ok(segs[1].includes('地铁'))
})

test('parseTranscript 规则完整解析单笔', () => {
  const result = parseTranscript('今天午餐花了三十元', SAMPLE_CATEGORIES, { now: new Date(2026, 7, 1) })
  assert.equal(result.needsAI, false)
  assert.equal(result.items.length, 1)
  const item = result.items[0]
  assert.equal(item.amountFen, 3000)
  assert.equal(item.type, 'expense')
  assert.equal(item.categoryId, 'cat-lunch')
  assert.equal(item.source, 'rule')
  assert.equal(item.needsReview, false)
  assert.equal(item.date, '2026-08-01')
})

test('parseTranscript 多笔拆分', () => {
  const result = parseTranscript('今天午餐花了30元，地铁花了5元', SAMPLE_CATEGORIES, { now: new Date(2026, 7, 1) })
  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].categoryId, 'cat-lunch')
  assert.equal(result.items[1].categoryId, 'cat-transport') // 通过别名"地铁"匹配
})

test('parseTranscript 别名匹配分类', () => {
  const result = parseTranscript('地铁花了5元', SAMPLE_CATEGORIES, { now: new Date(2026, 7, 1) })
  assert.equal(result.items[0].categoryId, 'cat-transport')
  assert.equal(result.items[0].categoryName, '交通')
})

test('parseTranscript 收入场景', () => {
  const result = parseTranscript('昨天收到工资五千元', SAMPLE_CATEGORIES, { now: new Date(2026, 7, 1) })
  assert.equal(result.items[0].type, 'income')
  assert.equal(result.items[0].amountFen, 500000)
  assert.equal(result.items[0].categoryId, 'cat-salary')
})

test('parseTranscript 缺失金额触发 Hy3 兜底', () => {
  const result = parseTranscript('买了点东西', SAMPLE_CATEGORIES, { now: new Date(2026, 7, 1) })
  assert.equal(result.needsAI, true)
})

test('parseTranscript 未知分类触发 Hy3 兜底', () => {
  const result = parseTranscript('咖啡30元', SAMPLE_CATEGORIES, { now: new Date(2026, 7, 1) })
  assert.equal(result.needsAI, true)
})

test('parseTranscript 复杂金融语义标记 needsReview', () => {
  const result = parseTranscript('和朋友AA吃饭100元', SAMPLE_CATEGORIES, { now: new Date(2026, 7, 1) })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].needsReview, true)
  assert.ok(result.items[0].warnings.length > 0)
  assert.match(result.items[0].warnings[0], /AA/)
})

// ===== hy3-parser 静态校验测试（不 require 模块，避免依赖 wx-server-sdk） =====
test('hy3-parser extractJsonArray 通过源码校验', () => {
  const source = readSource('cloudfunctions/voice-entry/hy3-parser.js')
  assert.match(source, /function extractJsonArray/)
  assert.match(source, /```(?:json)?/)
  assert.match(source, /JSON\.parse/)
  assert.match(source, /return null/)
})

test('hy3-parser normalizeItem 校验逻辑通过源码校验', () => {
  const source = readSource('cloudfunctions/voice-entry/hy3-parser.js')
  assert.match(source, /function normalizeItem/)
  assert.match(source, /amountYuan = parseFloat/)
  assert.match(source, /amountFen = Math\.round/)
  assert.match(source, /needsReview: !matched/)
  assert.match(source, /categoryName: matched \? matched\.name : categoryName/)
})

// ===== record batchCreate 源码静态校验 =====
test('record 云函数新增 batchCreate action', () => {
  const source = readSource('cloudfunctions/record/index.js')
  assert.match(source, /case 'batchCreate':/)
  assert.match(source, /BATCH_CREATE_MAX_ITEMS/)
})

test('batchCreate 实现幂等检查', () => {
  const source = readSource('cloudfunctions/record/index.js')
  const batchCase = source.slice(source.indexOf("case 'batchCreate'"), source.indexOf("case 'get'"))
  assert.match(batchCase, /voiceRequests/)
  assert.match(batchCase, /status === 'completed'/)
  assert.match(batchCase, /status === 'processing'/)
  assert.match(batchCase, /duplicate: true/)
})

test('batchCreate 实现全量预校验', () => {
  const source = readSource('cloudfunctions/record/index.js')
  const batchCase = source.slice(source.indexOf("case 'batchCreate'"), source.indexOf("case 'get'"))
  assert.match(batchCase, /assertBookWritable\(bookId\)/)
  assert.match(batchCase, /assertCategoryInBook/)
  assert.match(batchCase, /assertRecordContentSafe/)
})

test('batchCreate 实现逐条写入和失败补偿删除', () => {
  const source = readSource('cloudfunctions/record/index.js')
  const batchCase = source.slice(source.indexOf("case 'batchCreate'"), source.indexOf("case 'get'"))
  assert.match(batchCase, /for \(const validated of validatedItems\)/)
  assert.match(batchCase, /source: 'voice'/)
  assert.match(batchCase, /voiceRequestId/)
  assert.match(batchCase, /voiceItemId/)
  // 失败补偿删除
  assert.match(batchCase, /compensate delete failed/)
  assert.match(batchCase, /orphanIds/)
  assert.match(batchCase, /PARTIAL_ROLLBACK_INCOMPLETE/)
  assert.match(batchCase, /BATCH_ROLLED_BACK/)
})

test('batchCreate 写入预算提醒复用现有逻辑', () => {
  const source = readSource('cloudfunctions/record/index.js')
  const batchCase = source.slice(source.indexOf("case 'batchCreate'"), source.indexOf("case 'get'"))
  assert.match(batchCase, /prepareBudgetAlert/)
  assert.match(batchCase, /budgetAlerts/)
})

// ===== voice-entry 云函数源码静态校验 =====
test('voice-entry 提供 recognize 和 parse action', () => {
  const source = readSource('cloudfunctions/voice-entry/index.js')
  assert.match(source, /case 'recognize':/)
  assert.match(source, /case 'parse':/)
})

test('voice-entry recognize 在 finally 清理临时音频', () => {
  const source = readSource('cloudfunctions/voice-entry/index.js')
  assert.match(source, /cloud\.deleteFile\(\{ fileList: \[downloadedFileID\] \}\)/)
  assert.match(source, /finally/)
})

test('voice-entry parse 实现规则优先 Hy3 兜底', () => {
  const source = readSource('cloudfunctions/voice-entry/index.js')
  assert.match(source, /parseTranscript/)
  assert.match(source, /needsAI/)
  assert.match(source, /parseWithHy3/)
  assert.match(source, /usedAI: true/)
  assert.match(source, /usedAI: false/)
})

test('voice-entry ASR 服务端调用密钥不进入客户端', () => {
  const source = readSource('cloudfunctions/voice-entry/asr.js')
  assert.match(source, /process\.env\.TENCENT_SECRET_ID/)
  assert.match(source, /process\.env\.TENCENT_SECRET_KEY/)
  assert.match(source, /SentenceRecognition/)
})

test('voice-entry ASR 限制音频时长和频率', () => {
  const asrSource = readSource('cloudfunctions/voice-entry/asr.js')
  const indexSource = readSource('cloudfunctions/voice-entry/index.js')
  // asr.js 实现频率限制
  assert.match(asrSource, /MIN_INTERVAL_MS/)
  assert.match(asrSource, /checkRateLimit/)
  // index.js 限制音频大小
  assert.match(indexSource, /MAX_AUDIO_BYTES/)
})

test('voice-entry Hy3 使用 hunyuan-v3 provider', () => {
  const source = readSource('cloudfunctions/voice-entry/hy3-parser.js')
  assert.match(source, /hunyuan-v3/)
  assert.match(source, /cloud\.ai/)
  assert.match(source, /wx-server-sdk 版本/)
})

test('voice-entry Hy3 返回 JSON schema 校验', () => {
  const source = readSource('cloudfunctions/voice-entry/hy3-parser.js')
  assert.match(source, /extractJsonArray/)
  assert.match(source, /normalizeItem/)
  assert.match(source, /needsReview/)
  assert.match(source, /MAX_REPAIR_ATTEMPTS/)
})

// ===== 前端入口和页面静态校验 =====
test('首页 goToAdd 改为动作面板而非直接跳转', () => {
  const source = readSource('miniprogram/pages/index/index.js')
  assert.match(source, /showAddActionSheet: true/)
  assert.match(source, /closeAddActionSheet/)
  assert.match(source, /goToManualAdd/)
  assert.match(source, /goToVoiceAdd/)
  assert.match(source, /\/pages\/voice-entry\/voice-entry/)
})

test('首页 wxml 包含动作面板 UI', () => {
  const wxml = readSource('miniprogram/pages/index/index.wxml')
  assert.match(wxml, /showAddActionSheet/)
  assert.match(wxml, /action-sheet-mask/)
  assert.match(wxml, /goToManualAdd/)
  assert.match(wxml, /goToVoiceAdd/)
})

test('首页 wxss 包含动作面板样式', () => {
  const wxss = readSource('miniprogram/pages/index/index.wxss')
  assert.match(wxss, /\.action-sheet-mask/)
  assert.match(wxss, /\.action-sheet/)
})

test('voice-entry 页面注册到 app.json', () => {
  const appJson = readSource('miniprogram/app.json')
  assert.match(appJson, /pages\/voice-entry\/voice-entry/)
})

test('voice-entry 页面包含全部流程阶段', () => {
  const wxml = readSource('miniprogram/pages/voice-entry/voice-entry.wxml')
  assert.match(wxml, /stage === 'recording'/)
  assert.match(wxml, /stage === 'recognizing'/)
  assert.match(wxml, /stage === 'editing-text'/)
  assert.match(wxml, /stage === 'parsing'/)
  assert.match(wxml, /stage === 'preview'/)
  assert.match(wxml, /stage === 'submitting'/)
  assert.match(wxml, /stage === 'success'/)
  assert.match(wxml, /stage === 'error'/)
})

test('voice-entry 页面录音最长 30 秒', () => {
  const source = readSource('miniprogram/pages/voice-entry/voice-entry.js')
  assert.match(source, /MAX_RECORD_MS = 30000/)
  assert.match(source, /next \* 1000 >= MAX_RECORD_MS/)
})

test('voice-entry 页面失败时保留识别文本并提供三个去向', () => {
  const wxml = readSource('miniprogram/pages/voice-entry/voice-entry.wxml')
  const js = readSource('miniprogram/pages/voice-entry/voice-entry.js')
  // 失败时保留 transcript
  assert.match(js, /transcript:/)
  assert.match(wxml, /wx:if="\{\{transcript\}\}"/)
  // 三个去向：重试解析、重新录音、手工记账
  assert.match(wxml, /重试解析/)
  assert.match(wxml, /重新录音/)
  assert.match(wxml, /手工记账/)
})

test('voice-entry 页面预览逐项编辑功能', () => {
  const js = readSource('miniprogram/pages/voice-entry/voice-entry.js')
  assert.match(js, /onItemTypeChange/)
  assert.match(js, /onItemAmountInput/)
  assert.match(js, /onItemDateChange/)
  assert.match(js, /onItemRemarkInput/)
  assert.match(js, /onItemCategoryTap/)
  assert.match(js, /deleteItem/)
})

test('voice-entry 页面调用 record batchCreate 确认', () => {
  const js = readSource('miniprogram/pages/voice-entry/voice-entry.js')
  assert.match(js, /action: 'batchCreate'/)
  assert.match(js, /requestId: this\.data\.requestId/)
  assert.match(js, /items/)
})
