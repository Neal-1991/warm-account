# Tasks

- [ ] Task 1: 统计页保存原始支出记录数据
  - [ ] SubTask 1.1: 在 `statistics.js` 的 `data` 中新增 `expenseRecords: []` 与 `categoryDisplayMap: {}` 用于缓存
  - [ ] SubTask 1.2: 在 `loadData` 的 `Promise.all` 回调中保存未聚合的原始 records（仅 expense）和 categoryDisplayMap
  - [ ] SubTask 1.3: 在 `loadData` 失败或未登录分支重置 `expenseRecords` 和 `categoryDisplayMap` 为空
  - [ ] SubTask 1.4: 切换月份或 `onShow` 重新加载时同步更新这两个字段

- [ ] Task 2: 统计页图例项支持点击打开明细抽屉
  - [ ] SubTask 2.1: 在 `statistics.js` 中新增 `activeBigName: ''`、`activeBigRecords: []`、`activeBigAmount: 0`、`showDetailDrawer: false` 数据字段
  - [ ] SubTask 2.2: 实现 `onLegendTap(e)` 方法，根据 `dataset.name` 从 `expenseRecords` + `categoryDisplayMap` 过滤出该大类的支出记录（按日期降序），组装 `activeBigRecords`，每条记录附带 `iconInfo`、`categoryName`、`amountDisplay`、`dateStr`、`createdByName`、`hasImages` 字段供 record-card 使用
  - [ ] SubTask 2.3: 在 `statistics.wxml` 的 `legend-item` 上添加 `bindtap="onLegendTap" data-name="{{item.name}}"`
  - [ ] SubTask 2.4: 在 `statistics.wxml` 末尾新增抽屉结构：遮罩 `mask`（`bindtap="closeDetailDrawer"`）、抽屉主体 `drawer`、头部（图标+大类名+笔数+金额+关闭按钮）、记录列表区（`record-card` 组件循环）、空状态文案
  - [ ] SubTask 2.5: 抽屉内每条记录外包一层 `bindtap="onRecordTap" data-record-id="{{item._id}}"`，跳转 `/pages/detail/detail?recordId=xxx&bookId=xxx`

- [ ] Task 3: 统计页抽屉样式与动画
  - [ ] SubTask 3.1: 在 `statistics.wxss` 添加 `.mask`（全屏遮罩，半透明黑色，`position: fixed`，`z-index` 高于图例）
  - [ ] SubTask 3.2: 添加 `.drawer`（底部半屏，高度 60vh，圆角顶部，背景白，`position: fixed`，`bottom: 0`，`transform: translateY(100%)` 默认隐藏，`.drawer.open` 时 `translateY(0)`）
  - [ ] SubTask 3.3: 添加 `.drawer-header`（标题、笔数、金额、关闭按钮的 flex 布局）
  - [ ] SubTask 3.4: 添加 `.drawer-body`（可滚动，`overflow-y: auto`，内部 record-card 紧凑间距）
  - [ ] SubTask 3.5: 添加 transition 动画，300ms ease-out；遮罩 fade-in 同步
  - [ ] SubTask 3.6: `closeDetailDrawer()` 方法仅切换 `showDetailDrawer: false`，记录数据保留以便下次打开不闪烁

- [ ] Task 4: 记一笔页提交按钮安全区适配
  - [ ] SubTask 4.1: 在 `add.wxss` 修改 `.submit-btn` 的 `bottom` 为 `calc(40rpx + env(safe-area-inset-bottom))`
  - [ ] SubSubtask 4.2: 修改 `.container` 的 `padding-bottom` 为 `calc(160rpx + env(safe-area-inset-bottom))`，确保 fixed 按钮不遮挡表单最后一项
  - [ ] SubTask 4.3: 修改 `.budget-notice` 的 `bottom` 为 `calc(146rpx + env(safe-area-inset-bottom))`，保持与按钮的相对间距
  - [ ] SubTask 4.4: 在微信开发者工具中切换至 iPhone X / iPhone 13 等带安全区机型验证按钮完整可见，无遮挡

# Task Dependencies

- Task 2 依赖 Task 1（需要 `expenseRecords` 数据源）
- Task 3 与 Task 2 可并行（样式与结构分离），但需联调
- Task 4 与 Task 1/2/3 完全独立，可并行
