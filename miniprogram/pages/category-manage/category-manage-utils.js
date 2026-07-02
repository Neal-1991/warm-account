function filterBigCategories(bigCategories, activeTab) {
  return (bigCategories || []).filter(category => category.type === activeTab)
}

module.exports = {
  filterBigCategories
}
