const DEFAULT_ICON_KEY = 'icon_tag_default'
const DEFAULT_EMOJI = '\uD83D\uDCCC'

const ICON_DEFINITIONS = [
  { key: 'icon_bowl_chopsticks', name: '餐饮', group: 'expense', types: ['expense'] },
  { key: 'icon_vehicle', name: '交通', group: 'expense', types: ['expense'] },
  { key: 'icon_cart', name: '购物', group: 'expense', types: ['expense'] },
  { key: 'icon_house', name: '居住', group: 'expense', types: ['expense'] },
  { key: 'icon_phone_bill', name: '通讯缴费', group: 'expense', types: ['expense'] },
  { key: 'icon_baby_smile', name: '育儿', group: 'expense', types: ['expense'] },
  { key: 'icon_beauty', name: '护肤', group: 'expense', types: ['expense'] },
  { key: 'icon_clothes', name: '服饰', group: 'expense', types: ['expense'] },
  { key: 'icon_gamepad', name: '娱乐', group: 'expense', types: ['expense'] },
  { key: 'icon_dumbbell', name: '运动', group: 'expense', types: ['expense'] },
  { key: 'icon_plane', name: '旅行', group: 'expense', types: ['expense'] },
  { key: 'icon_pet_paw', name: '宠物', group: 'expense', types: ['expense'] },
  { key: 'icon_medical', name: '医疗', group: 'expense', types: ['expense'] },
  { key: 'icon_gift_social', name: '人情', group: 'expense', types: ['expense'] },
  { key: 'icon_book', name: '教育', group: 'expense', types: ['expense'] },
  { key: 'icon_bolt_bill', name: '生活缴费', group: 'expense', types: ['expense'] },
  { key: 'icon_grocery_bag', name: '买菜日用', group: 'expense', types: ['expense'] },
  { key: 'icon_cup', name: '饮品咖啡', group: 'expense', types: ['expense'] },
  { key: 'icon_shield_check', name: '保险', group: 'expense', types: ['expense'] },
  { key: 'icon_camera', name: '摄影', group: 'expense', types: ['expense'] },
  { key: 'icon_house_debt', name: '房贷', group: 'expense', types: ['expense'] },
  { key: 'icon_phone', name: '数码', group: 'expense', types: ['expense'] },
  { key: 'icon_wrench', name: '维修', group: 'expense', types: ['expense'] },
  { key: 'icon_subscription', name: '订阅', group: 'expense', types: ['expense'] },
  { key: 'icon_salary_card', name: '工资', group: 'income', types: ['income'] },
  { key: 'icon_award_money', name: '奖金奖励', group: 'income', types: ['income'] },
  { key: 'icon_house_savings', name: '住房资金', group: 'income', types: ['income'] },
  { key: 'icon_growth_money', name: '投资收益', group: 'income', types: ['income'] },
  { key: 'icon_briefcase_clock', name: '副业兼职', group: 'income', types: ['income'] },
  { key: 'icon_red_packet_money', name: '红包礼金', group: 'income', types: ['income'] },
  { key: 'icon_receipt_return', name: '报销返款', group: 'income', types: ['income'] },
  { key: 'icon_recycle_money', name: '回收收益', group: 'income', types: ['income'] },
  { key: 'icon_wallet_refund', name: '退款', group: 'income', types: ['income'] },
  { key: DEFAULT_ICON_KEY, name: '默认', group: 'default', types: ['expense', 'income'] }
].map(icon => ({
  ...icon,
  assetPath: `/images/category-icons/${icon.key}.png`
}))

const ICON_MAP = ICON_DEFINITIONS.reduce((acc, icon) => {
  acc[icon.key] = icon
  return acc
}, {})

const ICON_ALIASES = {
  category_default: DEFAULT_ICON_KEY,
  expense_food: 'icon_bowl_chopsticks',
  expense_transport: 'icon_vehicle',
  expense_shopping: 'icon_cart',
  expense_housing: 'icon_house',
  expense_communication: 'icon_phone_bill',
  expense_childcare: 'icon_baby_smile',
  expense_beauty: 'icon_beauty',
  expense_clothing: 'icon_clothes',
  expense_entertainment: 'icon_gamepad',
  expense_fitness: 'icon_dumbbell',
  expense_travel: 'icon_plane',
  expense_pet: 'icon_pet_paw',
  expense_medical: 'icon_medical',
  expense_social: 'icon_gift_social',
  expense_education: 'icon_book',
  expense_other: DEFAULT_ICON_KEY,
  income_salary: 'icon_salary_card',
  income_bonus: 'icon_award_money',
  income_housing_fund: 'icon_house_savings',
  income_investment: 'icon_growth_money',
  income_side_job: 'icon_briefcase_clock',
  income_gift: 'icon_red_packet_money',
  income_other: DEFAULT_ICON_KEY
}

const EMOJI_ICON_ALIASES = {
  '🍜': 'icon_bowl_chopsticks',
  '🍔': 'icon_bowl_chopsticks',
  '🍚': 'icon_bowl_chopsticks',
  '🍽': 'icon_bowl_chopsticks',
  '🍽️': 'icon_bowl_chopsticks',
  '☕': 'icon_cup',
  '🧋': 'icon_cup',
  '🚗': 'icon_vehicle',
  '🚌': 'icon_vehicle',
  '🚇': 'icon_vehicle',
  '🚉': 'icon_vehicle',
  '🚆': 'icon_vehicle',
  '🚄': 'icon_vehicle',
  '🚅': 'icon_vehicle',
  '🚕': 'icon_vehicle',
  '⛽': 'icon_vehicle',
  '🛒': 'icon_cart',
  '🛍': 'icon_cart',
  '🛍️': 'icon_cart',
  '🏠': 'icon_house',
  '🏡': 'icon_house',
  '📱': 'icon_phone_bill',
  '📞': 'icon_phone_bill',
  '☎': 'icon_phone_bill',
  '☎️': 'icon_phone_bill',
  '👶': 'icon_baby_smile',
  '💄': 'icon_beauty',
  '💅': 'icon_beauty',
  '👗': 'icon_clothes',
  '👕': 'icon_clothes',
  '👟': 'icon_clothes',
  '👜': 'icon_clothes',
  '🎮': 'icon_gamepad',
  '🎬': 'icon_gamepad',
  '🎤': 'icon_gamepad',
  '🏋': 'icon_dumbbell',
  '🏋️': 'icon_dumbbell',
  '🏃': 'icon_dumbbell',
  '⚽': 'icon_dumbbell',
  '🏊': 'icon_dumbbell',
  '✈': 'icon_plane',
  '✈️': 'icon_plane',
  '🏨': 'icon_plane',
  '🐱': 'icon_pet_paw',
  '🐶': 'icon_pet_paw',
  '🐾': 'icon_pet_paw',
  '💊': 'icon_medical',
  '🏥': 'icon_medical',
  '🩺': 'icon_medical',
  '🎁': 'icon_gift_social',
  '📚': 'icon_book',
  '📖': 'icon_book',
  '💡': 'icon_bolt_bill',
  '⚡': 'icon_bolt_bill',
  '🛠': 'icon_wrench',
  '🛠️': 'icon_wrench',
  '🔧': 'icon_wrench',
  '🛡': 'icon_shield_check',
  '🛡️': 'icon_shield_check',
  '📷': 'icon_camera',
  '📸': 'icon_camera',
  '💰': 'icon_salary_card',
  '💵': 'icon_salary_card',
  '💴': 'icon_salary_card',
  '💸': 'icon_salary_card',
  '🏆': 'icon_award_money',
  '🏦': 'icon_house_savings',
  '📈': 'icon_growth_money',
  '💼': 'icon_briefcase_clock',
  '🧧': 'icon_red_packet_money',
  '🧾': 'icon_receipt_return',
  '♻': 'icon_recycle_money',
  '♻️': 'icon_recycle_money',
  '↩': 'icon_wallet_refund',
  '↩️': 'icon_wallet_refund',
  '➕': DEFAULT_ICON_KEY,
  '📦': DEFAULT_ICON_KEY
}

const PRESET_ICON_KEYS = {
  expense_food: 'icon_bowl_chopsticks',
  expense_transport: 'icon_vehicle',
  expense_shopping: 'icon_cart',
  expense_housing: 'icon_house',
  expense_communication: 'icon_phone_bill',
  expense_childcare: 'icon_baby_smile',
  expense_beauty: 'icon_beauty',
  expense_clothing: 'icon_clothes',
  expense_entertainment: 'icon_gamepad',
  expense_fitness: 'icon_dumbbell',
  expense_travel: 'icon_plane',
  expense_pet: 'icon_pet_paw',
  expense_medical: 'icon_medical',
  expense_social: 'icon_gift_social',
  expense_education: 'icon_book',
  expense_other: DEFAULT_ICON_KEY,
  income_salary: 'icon_salary_card',
  income_bonus: 'icon_award_money',
  income_housing_fund: 'icon_house_savings',
  income_investment: 'icon_growth_money',
  income_side_job: 'icon_briefcase_clock',
  income_gift: 'icon_red_packet_money',
  income_other: DEFAULT_ICON_KEY
}

const RECOMMEND_RULES = [
  ['icon_bowl_chopsticks', ['expense'], ['餐饮', '吃饭', '早餐', '午餐', '晚餐', '夜宵', '宵夜', '零食', '外卖']],
  ['icon_vehicle', ['expense'], ['交通', '公交', '地铁', '打车', '出租车', '停车', '油费', '高速', '汽车', '车辆', '加油']],
  ['icon_cart', ['expense'], ['购物', '网购', '淘宝', '京东', '拼多多', '买东西']],
  ['icon_house', ['expense'], ['居住', '房租', '租房', '物业', '家居']],
  ['icon_phone_bill', ['expense'], ['通讯', '话费', '流量', '宽带', '网费']],
  ['icon_baby_smile', ['expense'], ['育儿', '孩子', '宝宝', '奶粉', '尿布', '托育', '玩具']],
  ['icon_beauty', ['expense'], ['护肤', '美容', '美妆', '化妆', '理发', '美甲']],
  ['icon_clothes', ['expense'], ['服饰', '衣服', '鞋', '鞋子', '包包', '配饰']],
  ['icon_gamepad', ['expense'], ['娱乐', '游戏', '电影', '聚会', '演出', '唱歌']],
  ['icon_dumbbell', ['expense'], ['运动', '健身', '游泳', '球类', '跑步']],
  ['icon_plane', ['expense'], ['旅行', '旅游', '机票', '酒店', '景点', '出差']],
  ['icon_pet_paw', ['expense'], ['宠物', '猫', '狗', '猫粮', '狗粮', '疫苗', '驱虫']],
  ['icon_medical', ['expense'], ['医疗', '医院', '门诊', '药', '药品', '体检', '保健']],
  ['icon_gift_social', ['expense'], ['人情', '随礼', '礼物', '请客', '礼金', '红包']],
  ['icon_book', ['expense'], ['教育', '学习', '学费', '培训', '教材', '课程']],
  ['icon_bolt_bill', ['expense'], ['水电', '电费', '水费', '燃气', '煤气', '生活缴费']],
  ['icon_grocery_bag', ['expense'], ['买菜', '日用', '超市', '生鲜', '蔬菜', '水果', '菜场']],
  ['icon_cup', ['expense'], ['咖啡', '奶茶', '饮品', '茶', '下午茶']],
  ['icon_shield_check', ['expense'], ['保险', '保费']],
  ['icon_camera', ['expense'], ['摄影', '相机', '拍照', '照片', '写真']],
  ['icon_house_debt', ['expense'], ['房贷', '按揭', '贷款']],
  ['icon_phone', ['expense'], ['数码', '手机', '电脑', '耳机', '平板']],
  ['icon_wrench', ['expense'], ['维修', '修理', '保养', '换件']],
  ['icon_subscription', ['expense'], ['订阅', '会员', '软件', '年费']],
  ['icon_salary_card', ['income'], ['工资', '薪资', '薪水', '基本工资']],
  ['icon_award_money', ['income'], ['奖金', '奖励', '绩效', '年终奖', '季度奖', '项目奖']],
  ['icon_house_savings', ['income'], ['公积金', '住房公积金', '住房资金']],
  ['icon_growth_money', ['income'], ['投资', '股票', '基金', '理财', '收益', '利息']],
  ['icon_briefcase_clock', ['income'], ['副业', '兼职', '外包', '咨询']],
  ['icon_red_packet_money', ['income'], ['红包', '礼金', '红包礼金', '生日礼金', '婚礼礼金']],
  ['icon_receipt_return', ['income'], ['报销', '医保报销', '医疗报销', '返款', '垫付', ' reimburse', 'reimburse']],
  ['icon_recycle_money', ['income'], ['废品回收', '回收', '卖废品', '闲置', '二手']],
  ['icon_wallet_refund', ['income'], ['退款', '退货', '退费']]
].map(([iconKey, types, keywords]) => ({ iconKey, types, keywords }))

function normalizeType(type) {
  return type === 'expense' || type === 'income' ? type : ''
}

function normalizeIconKey(iconKey) {
  const rawKey = typeof iconKey === 'string' ? iconKey.trim() : ''
  if (!rawKey) return ''
  if (ICON_MAP[rawKey]) return rawKey
  const aliasKey = ICON_ALIASES[rawKey]
  return ICON_MAP[aliasKey] ? aliasKey : ''
}

function toAssetInfo(iconKey) {
  const icon = ICON_MAP[iconKey] || ICON_MAP[DEFAULT_ICON_KEY]
  return {
    type: 'asset',
    iconKey: icon.key,
    name: icon.name,
    assetPath: icon.assetPath,
    emoji: ''
  }
}

function iconForCategory(category, fallbackEmoji = DEFAULT_EMOJI) {
  const explicitIconKey = normalizeIconKey(category?.iconKey)
  const presetIconKey = normalizeIconKey(PRESET_ICON_KEYS[category?.presetKey])
  const categoryType = normalizeType(category?.type)
  const recommendedIconKey = categoryType ? recommendIconKey(category?.name, categoryType) : DEFAULT_ICON_KEY
  const semanticNameIconKey = recommendedIconKey === DEFAULT_ICON_KEY ? '' : recommendedIconKey
  const emojiIconKey = normalizeIconKey(EMOJI_ICON_ALIASES[category?.icon])
  const iconKey = explicitIconKey || presetIconKey || semanticNameIconKey || emojiIconKey
  if (iconKey) return toAssetInfo(iconKey)

  const emoji = category?.icon
  if (emoji) {
    return {
      type: 'emoji',
      iconKey: '',
      name: '',
      assetPath: '',
      emoji
    }
  }

  return toAssetInfo(DEFAULT_ICON_KEY)
}

function iconForKey(iconKey) {
  return ICON_MAP[normalizeIconKey(iconKey) || DEFAULT_ICON_KEY]
}

function iconOptions(type) {
  const targetType = normalizeType(type)
  return ICON_DEFINITIONS.filter(icon => {
    if (!targetType) return true
    return icon.types.includes(targetType)
  })
}

function recommendIconKey(name, type) {
  const text = typeof name === 'string' ? name.trim().toLowerCase() : ''
  const targetType = normalizeType(type)
  if (!text) return DEFAULT_ICON_KEY

  const rules = targetType
    ? RECOMMEND_RULES.filter(rule => rule.types.includes(targetType))
    : RECOMMEND_RULES

  const matched = rules.find(rule => (
    rule.keywords.some(keyword => text.includes(keyword.toLowerCase()))
  ))
  return matched ? matched.iconKey : DEFAULT_ICON_KEY
}

module.exports = {
  DEFAULT_ICON_KEY,
  DEFAULT_EMOJI,
  PRESET_ICON_KEYS,
  ICON_ALIASES,
  EMOJI_ICON_ALIASES,
  ICON_DEFINITIONS,
  ICON_MAP,
  iconForCategory,
  iconForKey,
  iconOptions,
  normalizeIconKey,
  recommendIconKey
}
