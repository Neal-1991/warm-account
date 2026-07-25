const config = require('../../utils/config')
const {
  centsToYuan,
  progressWidth,
  buildBudgetView,
  copyBudgetErrorMessage
} = require('../../utils/budget')
const { iconForCategory } = require('../../utils/category-icons')

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthDisplay(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${year}年${monthNumber}月`
}

Page({
  data: {
    currentMonth: '',
    currentMonthDisplay: '',
    loading: true,
    budget: null,
    budgetView: { configured: false },
    canEdit: false,
    isHistorical: false,
    editing: false,
    totalAmount: '',
    categoryLimits: [],
    availableCategories: [],
    showCategoryModal: false,
    saving: false,
    themeStyle: ''
  },

  onLoad(options) {
    const app = getApp()
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(options.month || '')
      ? options.month
      : currentMonth()
    this.setData({
      currentMonth: month,
      currentMonthDisplay: monthDisplay(month),
      themeStyle: app.getThemeStyle()
    })
    app.applyTheme()
    this.loadData()
  },

  onShow() {
    const app = getApp()
    this.setData({ themeStyle: app.getThemeStyle() })
    app.applyTheme()
  },

  onMonthChange(e) {
    const month = e.detail.month
    this.setData({
      currentMonth: month,
      currentMonthDisplay: monthDisplay(month),
      editing: false,
      showCategoryModal: false
    })
    this.loadData()
  },

  async loadData() {
    const app = getApp()
    const session = await app.ensureSession()
    const bookId = session.bookId || app.getBookId()
    if (!session.authenticated || !bookId) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    this.setData({ loading: true })
    try {
      const [budgetRes, categoryRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'budget',
          data: {
            action: 'getMonth',
            bookId,
            month: this.data.currentMonth,
            isTest: config.isTest
          }
        }),
        wx.cloud.callFunction({
          name: 'category',
          data: {
            action: 'list',
            bookId,
            type: 'expense',
            isTest: config.isTest
          }
        })
      ])
      const budgetResult = budgetRes.result
      if (!budgetResult?.success) {
        throw new Error(budgetResult?.error || '预算加载失败')
      }
      if (!categoryRes.result?.success) {
        throw new Error(categoryRes.result?.error || '分类加载失败')
      }
      const categories = (categoryRes.result?.categories || [])
        .filter(category => category.parentId === null)
        .map(category => ({
          ...category,
          iconInfo: iconForCategory(category)
        }))
      const budget = budgetResult.budget
      const usageByCategory = new Map(
        (budgetResult.usage?.categoryUsage || []).map(item => [item.categoryId, item])
      )
      const limits = (budget?.categoryLimits || []).map(limit => {
        const category = categories.find(item => item._id === limit.categoryId)
        const usage = usageByCategory.get(limit.categoryId)
        return {
          categoryId: limit.categoryId,
          name: category?.name || limit.name || '已删除分类',
          icon: category?.icon || limit.icon || '📝',
          iconInfo: category?.iconInfo || iconForCategory(limit, limit.icon || '📝'),
          amount: centsToYuan(limit.amount),
          categoryExists: !!category,
          usedAmount: centsToYuan(usage?.usedAmount || 0),
          percent: usage?.percent || 0,
          progressWidth: progressWidth(usage?.percent),
          status: usage?.status || 'normal'
        }
      })
      this.setData({
        loading: false,
        budget,
        budgetView: buildBudgetView(budgetResult, this.data.currentMonth),
        canEdit: budgetResult.canEdit,
        isHistorical: budgetResult.isHistorical,
        editing: !!budget,
        totalAmount: budget ? centsToYuan(budget.totalAmount) : '',
        categoryLimits: limits,
        availableCategories: categories
      })
    } catch (error) {
      console.error('load budget page error:', error)
      this.setData({
        loading: false,
        budgetView: { configured: false }
      })
      wx.showToast({ title: error.message || '预算加载失败', icon: 'none' })
    }
  },

  startEditing() {
    if (!this.data.canEdit) return
    this.setData({ editing: true })
  },

  onTotalInput(e) {
    this.setData({ totalAmount: e.detail.value })
  },

  onCategoryAmountInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const categoryLimits = this.data.categoryLimits.map((item, itemIndex) => (
      itemIndex === index ? { ...item, amount: e.detail.value } : item
    ))
    this.setData({ categoryLimits })
  },

  showAddCategory() {
    this.setData({ showCategoryModal: true })
  },

  hideAddCategory() {
    this.setData({ showCategoryModal: false })
  },

  noop() {},

  addCategory(e) {
    const categoryId = e.currentTarget.dataset.categoryId
    if (this.data.categoryLimits.some(item => item.categoryId === categoryId)) {
      wx.showToast({ title: '该分类已添加', icon: 'none' })
      return
    }
    const category = this.data.availableCategories.find(item => item._id === categoryId)
    if (!category) return
    this.setData({
      categoryLimits: [
        ...this.data.categoryLimits,
        {
          categoryId: category._id,
          name: category.name,
          icon: category.icon || '📝',
          iconInfo: category.iconInfo,
          amount: '',
          categoryExists: true
        }
      ],
      showCategoryModal: false
    })
  },

  removeCategory(e) {
    const index = Number(e.currentTarget.dataset.index)
    const category = this.data.categoryLimits[index]
    if (!category || !this.data.canEdit) return

    wx.showModal({
      title: '移除大类预算',
      content: `将从${this.data.currentMonthDisplay}预算草稿中移除「${category.name}」额度。保存预算后生效，不会删除分类和账目。`,
      confirmText: '移除',
      confirmColor: '#F45B55',
      success: modalResult => {
        if (!modalResult.confirm) return
        this.setData({
          categoryLimits: this.data.categoryLimits.filter((_, itemIndex) => itemIndex !== index)
        })
        wx.showToast({ title: '已移除，保存预算后生效', icon: 'none' })
      }
    })
  },

  async saveBudget() {
    if (this.data.saving || !this.data.canEdit) return
    const total = Number(this.data.totalAmount)
    if (!Number.isFinite(total) || total <= 0) {
      wx.showToast({ title: '请输入有效的总预算', icon: 'none' })
      return
    }
    const categoryLimits = []
    for (const item of this.data.categoryLimits) {
      const amount = Number(item.amount)
      if (!item.categoryExists || !Number.isFinite(amount) || amount <= 0) {
        wx.showToast({ title: `请完善“${item.name}”预算`, icon: 'none' })
        return
      }
      categoryLimits.push({
        categoryId: item.categoryId,
        amount: Math.round(amount * 100)
      })
    }

    const app = getApp()
    const bookId = app.getBookId()
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'budget',
        data: {
          action: 'save',
          bookId,
          month: this.data.currentMonth,
          totalAmount: Math.round(total * 100),
          categoryLimits,
          isTest: config.isTest
        }
      })
      if (!res.result?.success) {
        throw new Error(res.result?.error || '保存失败')
      }
      app.invalidateBudgetCache(bookId, this.data.currentMonth)
      wx.showToast({ title: '预算已保存', icon: 'success' })
      await this.loadData()
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  },

  async copyPrevious() {
    if (!this.data.canEdit) return
    wx.showLoading({ title: '复制中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'budget',
        data: {
          action: 'copyPrevious',
          bookId: getApp().getBookId(),
          month: this.data.currentMonth,
          isTest: config.isTest
        }
      })
      if (!res.result?.success) {
        wx.hideLoading()
        wx.showToast({
          title: copyBudgetErrorMessage(res.result),
          icon: 'none'
        })
        return
      }
      const skipped = res.result.skippedCategoryCount || 0
      getApp().invalidateBudgetCache(getApp().getBookId(), this.data.currentMonth)
      wx.hideLoading()
      wx.showToast({
        title: skipped > 0 ? `已复制，跳过${skipped}个失效分类` : '已复制上月预算',
        icon: 'none'
      })
      await this.loadData()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '复制失败', icon: 'none' })
    }
  },

  removeBudget() {
    if (!this.data.canEdit || !this.data.budget) return
    wx.showModal({
      title: '删除预算',
      content: `确定删除${this.data.currentMonthDisplay}的预算吗？账目不会受到影响。`,
      success: async modalResult => {
        if (!modalResult.confirm) return
        wx.showLoading({ title: '删除中...' })
        try {
          const res = await wx.cloud.callFunction({
            name: 'budget',
            data: {
              action: 'remove',
              bookId: getApp().getBookId(),
              month: this.data.currentMonth,
              isTest: config.isTest
            }
          })
          if (!res.result?.success) {
            throw new Error(res.result?.error || '删除失败')
          }
          getApp().invalidateBudgetCache(getApp().getBookId(), this.data.currentMonth)
          wx.showToast({ title: '预算已删除', icon: 'success' })
          await this.loadData()
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  }
})
