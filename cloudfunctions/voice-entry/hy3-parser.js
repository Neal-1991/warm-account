// cloudfunctions/voice-entry/hy3-parser.js
// Hy3 兜底解析：通过 CloudBase SDK 调用 hunyuan-v3 provider
// 只返回固定 JSON，服务端二次校验
// cloud.init 由 voice-entry/index.js 统一完成，此处不重复

const cloud = require('wx-server-sdk')

const SYSTEM_PROMPT = `你是一个家庭记账解析助手。用户会说一句或多句关于收支的话，你需要把它解析成结构化记账草稿。

严格规则：
1. 只返回 JSON 数组，不要返回 Markdown、不要解释、不要自然语言
2. JSON 格式：
[
  {
    "type": "expense" 或 "income",
    "amountYuan": 数字（单位元，如 30.5），
    "categoryName": 分类名称（必须是 categories 列表中的一个，找不到则为空字符串），
    "date": "YYYY-MM-DD" 格式，
    "remark": 简短备注
  }
]
3. 收支类型词：花了/买了/支付/支出/消费 → expense；收到/工资/奖金/报销到账/收入 → income
4. 日期：今天/昨天/前天/本月X号 等相对日期必须转换为 YYYY-MM-DD；没有明确日期用今天
5. 多笔记录按"，""、""然后""另外""还有"等分隔
6. 不支持的复杂语义：AA分摊、转账、借贷、还款、退款冲销 → 不要猜测，把该片段原样放入 remark，type 设为 "expense"，amountYuan 设为 0
7. 金额必须为正数，不能为负
8. 不要凭空生成 categoryId，只返回 categoryName

categories 列表（按 type 过滤后的分类名称）：
{{CATEGORIES}}

当前时间：{{NOW}}`

const PARSE_TIMEOUT_MS = 15000
const MAX_REPAIR_ATTEMPTS = 1

function buildPrompt(transcript, categories, now) {
  const categoryNames = (categories || [])
    .map(c => `${c.name}(${c.type})`)
    .join('、') || '无可用分类'
  return SYSTEM_PROMPT
    .replace('{{CATEGORIES}}', categoryNames)
    .replace('{{NOW}}', now.toISOString())
}

// 调用 Hy3，返回原始文本
async function callHy3(systemContent, userContent) {
  const ai = cloud.ai
  if (typeof ai !== 'function') {
    throw new Error('cloud.ai 不可用，请确认 wx-server-sdk 版本 >= 3.0.5-beta.1')
  }
  const model = ai.createModel('hunyuan-v3')
  const res = await model.text({
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ],
    timeout: PARSE_TIMEOUT_MS
  })
  return res?.text || res?.choices?.[0]?.message?.content || ''
}

// 提取 JSON 数组（容错：去除 Markdown 围栏、前后自然语言）
function extractJsonArray(text) {
  if (!text) return null
  // 去除 ```json ... ``` 围栏
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) text = fenced[1]
  // 找第一个 [ 到最后一个 ]
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch (err) {
    return null
  }
}

// 校验单条 Hy3 返回字段
function normalizeItem(raw, index, categories) {
  if (!raw || typeof raw !== 'object') return null
  const type = raw.type === 'income' ? 'income' : 'expense'
  const amountYuan = parseFloat(raw.amountYuan)
  if (!Number.isFinite(amountYuan) || amountYuan <= 0) return null
  const amountFen = Math.round(amountYuan * 100)
  const categoryName = typeof raw.categoryName === 'string' ? raw.categoryName.trim() : ''
  // 映射到真实分类 ID
  const matched = (categories || []).find(c => c.name === categoryName && c.type === type)
  const categoryId = matched ? matched._id : null
  // 校验日期
  const dateStr = typeof raw.date === 'string' ? raw.date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const remark = typeof raw.remark === 'string' ? raw.remark.slice(0, 100) : ''
  return {
    itemId: `item-ai-${index + 1}`,
    type,
    amountFen,
    categoryId,
    categoryName: matched ? matched.name : categoryName,
    date: dateStr,
    remark,
    confidence: 0.7,
    needsReview: !matched,
    source: 'hy3',
    warnings: matched ? [] : ['分类未匹配，需用户选择']
  }
}

/**
 * Hy3 兜底解析
 * @param {string} transcript 识别文本
 * @param {Array} categories 当前账本所有分类
 * @param {Object} options { now: Date }
 * @returns {Promise<Array>} items 列表
 */
async function parseWithHy3(transcript, categories = [], options = {}) {
  const now = options.now || new Date()
  const systemContent = buildPrompt(transcript, categories, now)
  const userContent = `请解析以下记账内容：\n${transcript}`

  let rawText = ''
  try {
    rawText = await callHy3(systemContent, userContent)
  } catch (err) {
    const msg = String(err?.message || err)
    console.error('Hy3 call failed:', {
      stage: 'hy3-call',
      errorCategory: msg.includes('timeout') ? 'timeout' : 'service'
    })
    throw new Error('解析服务暂不可用，请稍后重试或转手工记账')
  }

  let parsed = extractJsonArray(rawText)

  // 一次受限修复：如果第一次返回非 JSON，再请求一次明确要求纯 JSON
  if (!parsed && MAX_REPAIR_ATTEMPTS > 0) {
    try {
      const repairRes = await callHy3(systemContent, userContent + '\n\n重要：只返回 JSON 数组，不要任何解释或 Markdown')
      parsed = extractJsonArray(repairRes)
    } catch (repairErr) {
      console.error('Hy3 repair attempt failed:', repairErr.message)
    }
  }

  if (!parsed || !Array.isArray(parsed)) {
    throw new Error('解析结果格式不正确，请转手工记账')
  }

  const items = []
  for (let i = 0; i < parsed.length; i++) {
    const item = normalizeItem(parsed[i], i, categories)
    if (item) items.push(item)
  }

  if (items.length === 0) {
    throw new Error('未能解析出有效记录，请转手工记账')
  }

  return items
}

module.exports = {
  parseWithHy3,
  normalizeItem,
  extractJsonArray
}
