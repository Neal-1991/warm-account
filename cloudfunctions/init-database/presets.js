const CATEGORY_SCHEMA_VERSION = 1

const EXPENSE_CATEGORIES = [
  { key: 'expense_food', name: '餐饮', icon: '🍜', iconKey: 'icon_bowl_chopsticks', order: 1, children: ['早餐', '午餐', '晚餐', '下午茶', '零食', '宵夜'] },
  { key: 'expense_transport', name: '交通', icon: '🚗', iconKey: 'icon_vehicle', order: 2, children: ['公交', '地铁', '出租车', '停车', '油费'] },
  { key: 'expense_shopping', name: '购物', icon: '🛒', iconKey: 'icon_cart', order: 3, children: ['日用品', '电子产品', '化妆品'] },
  { key: 'expense_housing', name: '居住', icon: '🏠', iconKey: 'icon_house', order: 4, children: ['房租', '物业', '水电费'] },
  { key: 'expense_communication', name: '通讯', icon: '📱', iconKey: 'icon_phone_bill', order: 5, children: ['话费', '宽带', '流量'] },
  { key: 'expense_childcare', name: '育儿', icon: '👶', iconKey: 'icon_baby_smile', order: 6, children: ['奶粉', '尿布', '托育', '玩具衣物'] },
  { key: 'expense_beauty', name: '美容护肤', icon: '💄', iconKey: 'icon_beauty', order: 7, children: ['护肤品', '化妆品', '理发', '美甲'] },
  { key: 'expense_clothing', name: '服饰', icon: '👗', iconKey: 'icon_clothes', order: 8, children: ['衣服', '鞋子', '包包', '配饰'] },
  { key: 'expense_entertainment', name: '娱乐', icon: '🎮', iconKey: 'icon_gamepad', order: 9, children: ['电影', '游戏', '聚会'] },
  { key: 'expense_fitness', name: '运动健身', icon: '🏋', iconKey: 'icon_dumbbell', order: 10, children: ['健身房', '器材', '游泳', '球类'] },
  { key: 'expense_travel', name: '旅行', icon: '✈️', iconKey: 'icon_plane', order: 11, children: ['机票', '酒店', '景点', '在地消费'] },
  { key: 'expense_pet', name: '宠物', icon: '🐱', iconKey: 'icon_pet_paw', order: 12, children: ['粮食', '零食', '疫苗驱虫', '用品'] },
  { key: 'expense_medical', name: '医疗', icon: '💊', iconKey: 'icon_medical', order: 13, children: ['门诊', '药品', '保健品'] },
  { key: 'expense_social', name: '人情', icon: '🎁', iconKey: 'icon_gift_social', order: 14, children: ['礼物', '红包', '请客'] },
  { key: 'expense_education', name: '教育', icon: '📚', iconKey: 'icon_book', order: 15, children: ['学费', '教材', '培训'] },
  { key: 'expense_other', name: '其他', icon: '➕', iconKey: 'icon_tag_default', order: 16, children: ['其他支出'] }
]

const INCOME_CATEGORIES = [
  { key: 'income_salary', name: '工资', icon: '💰', iconKey: 'icon_salary_card', order: 21, children: ['基本工资', '绩效', '补贴'] },
  { key: 'income_bonus', name: '奖金', icon: '🏆', iconKey: 'icon_award_money', order: 22, children: ['年终奖', '季度奖', '项目奖'] },
  { key: 'income_housing_fund', name: '公积金', icon: '🏦', iconKey: 'icon_house_savings', order: 23, children: ['公积金提取'] },
  { key: 'income_investment', name: '投资', icon: '📈', iconKey: 'icon_growth_money', order: 24, children: ['股票', '基金', '理财', '利息'] },
  { key: 'income_side_job', name: '副业兼职', icon: '💼', iconKey: 'icon_briefcase_clock', order: 25, children: ['咨询', '外包'] },
  { key: 'income_gift', name: '红包礼金', icon: '🧧', iconKey: 'icon_red_packet_money', order: 26, children: ['春节红包', '婚礼礼金', '生日礼金'] },
  { key: 'income_other', name: '其他', icon: '📦', iconKey: 'icon_tag_default', order: 27, children: ['其他收入'] }
]

const ALL_PRESETS = [
  ...EXPENSE_CATEGORIES.map(category => ({ ...category, type: 'expense' })),
  ...INCOME_CATEGORIES.map(category => ({ ...category, type: 'income' }))
]

module.exports = {
  CATEGORY_SCHEMA_VERSION,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  ALL_PRESETS
}
