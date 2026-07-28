# Checklist

## 统计页大类明细下钻

- [x] `statistics.js` 的 `data` 中存在 `expenseRecords`、`categoryDisplayMap`、`activeBigName`、`activeBigRecords`、`showDetailDrawer` 字段
- [x] `loadData` 成功回调中将原始支出记录（仅 expense）保存到 `expenseRecords`，categoryDisplayMap 保存到 `data.categoryDisplayMap`
- [x] `loadData` 失败、未登录或月份切换时，`expenseRecords` 和 `categoryDisplayMap` 被重置为空
- [x] `statistics.wxml` 的 `legend-item` 绑定 `bindtap="onLegendTap"` 且 `data-name` 正确传入
- [x] `onLegendTap` 根据大类名从 `expenseRecords` 过滤出该大类记录，按日期降序排列
- [x] 抽屉打开时展示大类名、笔数、当月金额合计
- [x] 抽屉内每条记录通过 `record-card` 组件渲染，包含图标、分类名、备注、金额、日期、记账人
- [x] 抽屉内单条记录可点击，跳转至 `/pages/detail/detail?recordId=xxx&bookId=xxx`
- [x] 抽屉可通过点击遮罩或关闭按钮关闭，关闭后 `showDetailDrawer` 为 false，记录数据保留
- [x] 抽屉默认隐藏（`transform: translateY(100%)`），打开时 `translateY(0)`，带 300ms 过渡动画
- [x] 抽屉无记录时展示「本月该大类暂无支出记录」空状态文案
- [x] 不额外发起云函数请求，仅复用 `loadData` 已加载的数据

## 记一笔页提交按钮安全区适配

- [x] `.submit-btn` 的 `bottom` 改为 `calc(40rpx + env(safe-area-inset-bottom))`
- [x] `.container` 的 `padding-bottom` 改为 `calc(160rpx + env(safe-area-inset-bottom))`
- [x] `.budget-notice` 的 `bottom` 改为 `calc(146rpx + env(safe-area-inset-bottom))`
- [ ] 在 iPhone X / iPhone 13 等带安全区机型预览，提交按钮完整可见，不被 Home Indicator 遮挡
- [ ] 在非全面屏机型（如 iPhone SE）预览，按钮位置与改动前一致（`safe-area-inset-bottom` 解析为 0）
- [ ] 表单最后一项（图片上传区）不被 fixed 按钮遮挡
- [ ] 预算提醒浮层与提交按钮保持原有相对间距，不重叠
