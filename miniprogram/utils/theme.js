const DEFAULT_THEME_ID = 'avocado'
const THEME_STORAGE_PREFIX = 'themeId:'
const GUEST_THEME_STORAGE_KEY = `${THEME_STORAGE_PREFIX}guest`

const SEMANTIC_COLORS = {
  expense: '#D96F3D',
  income: '#2F8F9D',
  success: '#5E9B72',
  warning: '#D9902F',
  danger: '#D94A43'
}

const CHART_COLORS = [
  '#8FAF7A',
  '#88AFC1',
  '#C8A46B',
  '#D78B75',
  '#A99AC8',
  '#7F9B9C',
  '#C2A07D',
  '#9BA982'
]

const THEMES = [
  {
    id: 'avocado',
    name: '牛油果绿',
    navBackground: '#6F8F4E',
    navTextStyle: 'white',
    accent: '#6F8F4E',
    accentSoft: '#A8B87A',
    surface: '#FFFFFF',
    background: '#F4F6F2',
    tint: '#F1F5EA',
    border: '#E3E9DF',
    text: '#263238',
    muted: '#7A8580'
  },
  {
    id: 'sage',
    name: '松青',
    navBackground: '#3F7C73',
    navTextStyle: 'white',
    accent: '#3F7C73',
    accentSoft: '#7FA89F',
    surface: '#FFFFFF',
    background: '#F3F7F6',
    tint: '#ECF5F3',
    border: '#DDE9E7',
    text: '#263238',
    muted: '#70807C'
  },
  {
    id: 'apple',
    name: '青苹果绿',
    navBackground: '#65B741',
    navTextStyle: 'white',
    accent: '#65B741',
    accentSoft: '#A6D96A',
    surface: '#FFFFFF',
    background: '#F6FAF2',
    tint: '#F0FAE9',
    border: '#E2EED8',
    text: '#263238',
    muted: '#6D7E68'
  },
  {
    id: 'pink',
    name: '淡粉色',
    navBackground: '#E78AB6',
    navTextStyle: 'white',
    accent: '#D96C9F',
    accentSoft: '#F4B6CF',
    surface: '#FFFFFF',
    background: '#FFF7FA',
    tint: '#FFF0F6',
    border: '#F1DCE7',
    text: '#352A30',
    muted: '#806E77'
  },
  {
    id: 'white',
    name: '白色',
    navBackground: '#FFFFFF',
    navTextStyle: 'black',
    accent: '#5E6A72',
    accentSoft: '#7E8A92',
    surface: '#FFFFFF',
    background: '#F5F7F8',
    tint: '#F7F9FA',
    border: '#DDE5E8',
    text: '#263238',
    muted: '#6F7A82'
  },
  {
    id: 'blue',
    name: '湖蓝',
    navBackground: '#3A8FB7',
    navTextStyle: 'white',
    accent: '#3A8FB7',
    accentSoft: '#8FC5DA',
    surface: '#FFFFFF',
    background: '#F1F7FA',
    tint: '#EAF5F9',
    border: '#D9EAF0',
    text: '#24343A',
    muted: '#6D7C82'
  },
  {
    id: 'warm',
    name: '暖橙改良',
    navBackground: '#D8893A',
    navTextStyle: 'white',
    accent: '#D8893A',
    accentSoft: '#E9B06F',
    surface: '#FFFFFF',
    background: '#FAF5EF',
    tint: '#FFF1DD',
    border: '#EEDFCC',
    text: '#332B24',
    muted: '#7F7468'
  },
  {
    id: 'berry',
    name: '莓果',
    navBackground: '#A85B7F',
    navTextStyle: 'white',
    accent: '#A85B7F',
    accentSoft: '#D19AB6',
    surface: '#FFFFFF',
    background: '#FAF3F6',
    tint: '#F8ECF2',
    border: '#EBD9E2',
    text: '#33272E',
    muted: '#7C6B74'
  },
  {
    id: 'classic',
    name: '旧橙',
    navBackground: '#FF9500',
    navTextStyle: 'white',
    accent: '#FF9500',
    accentSoft: '#FFB347',
    surface: '#FFFFFF',
    background: '#F8F5F0',
    tint: '#FFF1DD',
    border: '#F0E3D0',
    text: '#333333',
    muted: '#777777'
  }
]

const THEME_MAP = THEMES.reduce((acc, theme) => {
  acc[theme.id] = theme
  return acc
}, {})

function normalizeThemeId(themeId) {
  return THEME_MAP[themeId] ? themeId : DEFAULT_THEME_ID
}

function getTheme(themeId = DEFAULT_THEME_ID) {
  return THEME_MAP[normalizeThemeId(themeId)]
}

function storageKey(openId) {
  return openId ? `${THEME_STORAGE_PREFIX}${openId}` : GUEST_THEME_STORAGE_KEY
}

function getLocalThemeId(openId) {
  return normalizeThemeId(wx.getStorageSync(storageKey(openId)) || DEFAULT_THEME_ID)
}

function setLocalThemeId(openId, themeId) {
  const normalized = normalizeThemeId(themeId)
  wx.setStorageSync(storageKey(openId), normalized)
  return normalized
}

function themeStyle(themeId) {
  const theme = getTheme(themeId)
  const isWhite = theme.id === 'white'
  const summaryBackground = isWhite
    ? theme.surface
    : `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentSoft} 100%)`
  return [
    `--theme-nav:${theme.navBackground}`,
    `--theme-accent:${theme.accent}`,
    `--theme-accent-soft:${theme.accentSoft}`,
    `--theme-surface:${theme.surface}`,
    `--theme-bg:${theme.background}`,
    `--theme-tint:${theme.tint}`,
    `--theme-border:${theme.border}`,
    `--theme-text:${theme.text}`,
    `--theme-muted:${theme.muted}`,
    `--color-expense:${SEMANTIC_COLORS.expense}`,
    `--color-income:${SEMANTIC_COLORS.income}`,
    `--color-success:${SEMANTIC_COLORS.success}`,
    `--color-warning:${SEMANTIC_COLORS.warning}`,
    `--color-danger:${SEMANTIC_COLORS.danger}`,
    `--summary-bg:${summaryBackground}`,
    `--summary-text:${isWhite ? theme.text : '#FFFFFF'}`,
    `--summary-expense:${isWhite ? SEMANTIC_COLORS.expense : '#FFE8DE'}`,
    `--summary-income:${isWhite ? SEMANTIC_COLORS.income : '#DBF4F7'}`,
    `--summary-border:${isWhite ? theme.border : 'transparent'}`
  ].join(';')
}

function tabIconPath(themeId, tabName) {
  return `images/tabbar/${normalizeThemeId(themeId)}/${tabName}-active.png`
}

function inactiveTabIconPath(tabName) {
  return `images/tabbar/${tabName}.png`
}

function applyTheme(themeId) {
  const theme = getTheme(themeId)
  if (typeof wx.setNavigationBarColor === 'function') {
    wx.setNavigationBarColor({
      frontColor: theme.navTextStyle === 'black' ? '#000000' : '#ffffff',
      backgroundColor: theme.navBackground,
      fail: () => {}
    })
  }
  if (typeof wx.setTabBarStyle === 'function') {
    wx.setTabBarStyle({
      color: '#8D9691',
      selectedColor: theme.accent,
      backgroundColor: '#FFFFFF',
      borderStyle: 'black',
      fail: () => {}
    })
  }
  if (typeof wx.setTabBarItem === 'function') {
    ;['home', 'stat', 'mine'].forEach((tabName, index) => {
      wx.setTabBarItem({
        index,
        iconPath: inactiveTabIconPath(tabName),
        selectedIconPath: tabIconPath(theme.id, tabName),
        fail: () => {}
      })
    })
  }
}

module.exports = {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_MAP,
  SEMANTIC_COLORS,
  CHART_COLORS,
  normalizeThemeId,
  getTheme,
  getLocalThemeId,
  setLocalThemeId,
  themeStyle,
  applyTheme
}
