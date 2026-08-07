// cloudfunctions/voice-entry/local-parser.js
// 确定性规则解析：金额、收支类型、日期、分类名称匹配、多笔拆分
// 只处理高置信度表达，模糊场景返回 null 由 Hy3 兜底

const INCOME_KEYWORDS = ['收到', '工资', '奖金', '报销到账', '收入', '进账', '到账']
const EXPENSE_KEYWORDS = ['花了', '买了', '支付', '支出', '消费', '花费', '用掉']
const SPLIT_CONNECTORS = ['，', '、', '然后', '另外', '还有', '接着', '再']

// 中文数字映射
const CHINESE_DIGIT = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000, '万': 10000 }

// 解析中文数字金额，如"三十" => 30, "一百二十八" => 128, "五千" => 5000
function parseChineseNumber(text) {
  if (!/[零一二两三四五六七八九十百千万]/.test(text)) return null
  let total = 0
  let section = 0
  let current = 0
  for (const ch of text) {
    const digit = CHINESE_DIGIT[ch]
    if (digit === undefined) return null
    if (digit >= 10) {
      // 十百千万是单位
      if (digit === 10000) {
        section = (section + current) * digit
        total += section
        section = 0
        current = 0
      } else {
        if (current === 0) current = 1
        section += current * digit
        current = 0
      }
    } else {
      current = digit
    }
  }
  return total + section + current
}

// 解析金额：支持 "30" "30.5" "30元" "30块5" "1,299.90" "三十元" "一百二十八块"
function parseAmount(text) {
  // 阿拉伯数字优先
  // "30块5" / "30元5角" 这类
  const blockAndMao = text.match(/(\d+(?:\.\d+)?)\s*[块元]\s*(\d+)\s*[毛角分]?/)
  if (blockAndMao) {
    const yuan = parseFloat(blockAndMao[1])
    const fen = parseInt(blockAndMao[2], 10)
    return Math.round(yuan * 100) + fen * 10
  }
  // "30.5元" / "1299.90" / "1,299.90元"
  const decimal = text.match(/(\d[\d,]*\.\d{1,2})\s*[元块]?/)
  if (decimal) {
    const num = parseFloat(decimal[1].replace(/,/g, ''))
    return Math.round(num * 100)
  }
  // "30元" / "30块" / "30"
  const integer = text.match(/(\d[\d,]*)\s*[元块]?/)
  if (integer) {
    const num = parseInt(integer[1].replace(/,/g, ''), 10)
    return num * 100
  }
  // 中文数字 "三十元" "一百二十八块"
  const chinese = text.match(/([零一二两三四五六七八九十百千万]+)\s*[元块]/)
  if (chinese) {
    const num = parseChineseNumber(chinese[1])
    if (num !== null) return num * 100
  }
  return null
}

// 解析相对日期："今天" "昨天" "前天" "上周X" "本月X号"
function parseDate(text, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (text.includes('今天') || text.includes('今日')) {
    return formatDate(today)
  }
  if (text.includes('昨天') || text.includes('昨日')) {
    today.setDate(today.getDate() - 1)
    return formatDate(today)
  }
  if (text.includes('前天')) {
    today.setDate(today.getDate() - 2)
    return formatDate(today)
  }
  // "本月X号" / "X号"
  const dayOfMonth = text.match(/(\d{1,2})\s*[号日]/)
  if (dayOfMonth) {
    const day = parseInt(dayOfMonth[1], 10)
    const d = new Date(now.getFullYear(), now.getMonth(), day)
    return formatDate(d)
  }
  return null
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 推断收支类型
function inferType(text) {
  for (const kw of INCOME_KEYWORDS) {
    if (text.includes(kw)) return 'income'
  }
  for (const kw of EXPENSE_KEYWORDS) {
    if (text.includes(kw)) return 'expense'
  }
  return null
}

// 匹配分类名称
function matchCategory(text, categories, type) {
  // 按 type 过滤的分类
  const typed = (categories || []).filter(c => c.type === type)
  // 精确匹配优先
  for (const c of typed) {
    if (text.includes(c.name)) return { categoryId: c._id, categoryName: c.name }
  }
  // 别名匹配（如果 categories 含 aliases 字段）
  for (const c of typed) {
    const aliases = c.aliases || []
    for (const alias of aliases) {
      if (text.includes(alias)) return { categoryId: c._id, categoryName: c.name }
    }
  }
  return null
}

// 提取备注：去除金额、日期、收支词、分类名后的剩余文本（简化版）
function extractRemark(text, categoryName) {
  let remark = text
  // 去除金额表达
  remark = remark.replace(/\d+(?:\.\d+)?\s*[元块]\s*\d*\s*[毛角分]?/g, '')
  remark = remark.replace(/\d+(?:\.\d+)?\s*[元块]/g, '')
  remark = remark.replace(/\d+/g, '')
  remark = remark.replace(/[零一二两三四五六七八九十百千万]+\s*[元块]/g, '')
  // 去除日期
  remark = remark.replace(/今天|昨天|前天|今日|昨日|\d{1,2}\s*[号日]/g, '')
  // 去除收支词
  remark = remark.replace(/花了|买了|支付|支出|消费|花费|用掉|收到|工资|奖金|报销到账|收入|进账|到账/g, '')
  // 去除分类名
  if (categoryName) remark = remark.replace(new RegExp(categoryName, 'g'), '')
  // 去除分隔符和标点
  remark = remark.replace(/[，、。,.\s然后另外还有接着再]/g, '').trim()
  return remark || ''
}

// 拆分多笔
function splitSegments(text) {
  let segments = [text]
  for (const connector of SPLIT_CONNECTORS) {
    const next = []
    for (const seg of segments) {
      // 逗号顿号直接 split
      if (connector === '，' || connector === '、') {
        next.push(...seg.split(connector))
      } else {
        next.push(...seg.split(new RegExp(connector, 'g')))
      }
    }
    segments = next
  }
  return segments.map(s => s.trim()).filter(Boolean)
}

/**
 * 本地规则解析
 * @param {string} transcript 识别文本
 * @param {Array} categories 当前账本、当前 type 下的分类列表
 * @param {Object} options { now: Date }
 * @returns {Object} { items, needsAI: boolean }
 *   items: 已成功解析的草稿
 *   needsAI: true 表示有未解析的片段需要 Hy3 兜底
 */
function parseTranscript(transcript, categories = [], options = {}) {
  const now = options.now || new Date()
  const segments = splitSegments(transcript)
  const items = []
  let needsAI = false
  const unresolvedSegments = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const amount = parseAmount(seg)
    const type = inferType(seg)
    const date = parseDate(seg, now) || formatDate(now)
    const category = type ? matchCategory(seg, categories, type) : null

    // 关键字段缺失 → 需 AI 兜底
    if (amount === null || type === null || category === null) {
      needsAI = true
      unresolvedSegments.push({ segment: seg, index: i + 1, partial: { amount, type, date } })
      continue
    }

    items.push({
      itemId: `item-${i + 1}`,
      type,
      amountFen: amount,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      date,
      remark: extractRemark(seg, category.categoryName),
      confidence: 0.9,
      needsReview: false,
      source: 'rule',
      warnings: []
    })
  }

  return { items, needsAI, unresolvedSegments }
}

module.exports = {
  parseTranscript,
  parseAmount,
  parseDate,
  inferType,
  matchCategory,
  splitSegments
}
