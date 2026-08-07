// cloudfunctions/voice-entry/hy3-parser.js
// Hy3 兜底解析：通过腾讯云 TokenHub OpenAI 兼容接口调用混元大模型
// 旧版 hunyuan.tencentcloudapi.com 接口和 hunyuan-turbo 等模型已于 2026-06-22 下线，
// 全部迁移到 TokenHub（https://tokenhub.tencentmaas.com/v1/chat/completions）
// 使用独立的 TOKENHUB_API_KEY 环境变量（与 ASR 的 SecretId/SecretKey 分离）
// 只返回固定 JSON，服务端二次校验

const https = require('https')

const TOKENHUB_HOST = 'tokenhub.tencentmaas.com'
const TOKENHUB_PATH = '/v1/chat/completions'
const TOKENHUB_MODEL = 'hy3'
const TOKENHUB_TIMEOUT_MS = 15000

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
6. 分类选择策略：优先选择与语义最匹配的小类（如"中饭/午饭"应选"午餐"小类而非"餐饮"大类）；若没有合适的小类，再选择所属大类
7. 无法确定的语义（如 AA分摊、转账等）→ 按字面理解解析为普通收支，把原话放入 remark；不要拒绝解析
8. 金额必须为正数，不能为负
9. 不要凭空生成 categoryId，只返回 categoryName

categories 列表（格式：名称(类型)[大类]或 名称(类型)[小类/所属大类]）：
{{CATEGORIES}}

当前时间：{{NOW}}`

const MAX_REPAIR_ATTEMPTS = 1

function buildPrompt(transcript, categories, now) {
  // 构建大类 ID → 名称 映射，用于标注小类所属大类
  const parentMap = {}
  for (const c of (categories || [])) {
    if (!c.parentId) {
      parentMap[c._id] = c.name
    }
  }
  const categoryNames = (categories || [])
    .map(c => {
      const parentName = c.parentId ? parentMap[c.parentId] : null
      const tag = parentName ? `[小类/属于${parentName}]` : '[大类]'
      return `${c.name}(${c.type})${tag}`
    })
    .join('、') || '无可用分类'
  return SYSTEM_PROMPT
    .replace('{{CATEGORIES}}', categoryNames)
    .replace('{{NOW}}', now.toISOString())
}

// TokenHub OpenAI 兼容接口调用
function tokenhubHttpsPost(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload)
    const req = https.request({
      hostname: TOKENHUB_HOST,
      port: 443,
      path: TOKENHUB_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: TOKENHUB_TIMEOUT_MS
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(new Error('混元响应解析失败'))
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error('混元请求超时'))
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

// 调用混元大模型，返回原始文本
async function callHy3(systemContent, userContent) {
  const apiKey = process.env.TOKENHUB_API_KEY
  if (!apiKey) {
    const err = new Error('混元服务未配置')
    err.errorCode = 'HUNYUAN_NOT_CONFIGURED'
    throw err
  }

  // OpenAI 兼容格式
  const payload = {
    model: TOKENHUB_MODEL,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ]
  }

  const res = await tokenhubHttpsPost(payload, apiKey)

  // OpenAI 兼容错误格式：{ error: { message, type, code } }
  if (res.error) {
    const err = new Error(res.error.message || '混元调用失败')
    err.errorCode = res.error.code || res.error.type || 'HUNYUAN_API_ERROR'
    throw err
  }

  const choices = res.choices
  if (!choices || !choices.length) {
    throw new Error('混元返回空内容')
  }
  return choices[0].message.content || ''
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

  // 分类匹配：优先小类精确匹配 → 大类精确匹配 → 模糊回退（先小类后大类）
  const typed = (categories || []).filter(c => c.type === type)
  const smallCategories = typed.filter(c => c.parentId)
  const bigCategories = typed.filter(c => !c.parentId)

  let matched = smallCategories.find(c => c.name === categoryName)
    || bigCategories.find(c => c.name === categoryName)

  // 模糊回退：categoryName 与分类名存在包含关系（应对 AI 返回近义词/简写）
  if (!matched && categoryName) {
    matched = smallCategories.find(c => c.name.includes(categoryName) || categoryName.includes(c.name))
      || bigCategories.find(c => c.name.includes(categoryName) || categoryName.includes(c.name))
  }

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
      errorCategory: msg.includes('timeout') ? 'timeout' : 'service',
      errorMessage: msg.slice(0, 500),
      errCode: err?.errCode || err?.code || err?.requestId || null,
      errStack: err?.stack ? String(err.stack).slice(0, 1000) : null,
      rawErr: JSON.stringify(err, Object.getOwnPropertyNames(err)).slice(0, 1000)
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
