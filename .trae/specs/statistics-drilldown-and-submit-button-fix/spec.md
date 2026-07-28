# 统计页大类明细下钻与记一笔按钮显示修复 Spec

## Why

统计页目前只能看到各大类的金额聚合，用户想确认某笔具体支出时无法直接定位到该大类下的当月记账明细，需要返回首页再翻找，体验割裂。

记一笔页面的提交按钮在 iOS 全面屏机型上底部被 Home Indicator 安全区裁切，只能显示约 4/5，影响提交操作的可点击性和视觉完整性。

## What Changes

- 统计页图例（legend）支持点击，弹出半屏抽屉展示该大类下当月所有支出记录列表
- 抽屉内单条记录可点击跳转至 `detail` 详情页
- 抽屉顶部展示大类名、当月金额、笔数；空状态有提示文案
- 记一笔页提交按钮通过 `calc(40rpx + env(safe-area-inset-bottom))` 适配底部安全区
- 记一笔页容器底部内边距同步增加安全区高度，避免 fixed 按钮遮挡表单内容
- 预算提醒浮层 `bottom` 同步加上安全区偏移，避免与提交按钮重叠

## Impact

- 受影响代码：
  - `miniprogram/pages/statistics/statistics.js`：保存原始 records、新增点击处理、抽屉数据组装
  - `miniprogram/pages/statistics/statistics.wxml`：图例项添加点击事件、新增抽屉结构
  - `miniprogram/pages/statistics/statistics.wxss`：抽屉样式、遮罩、动画
  - `miniprogram/pages/add/add.wxss`：提交按钮与容器安全区适配
  - 不影响云函数和数据模型

## ADDED Requirements

### Requirement: 统计页大类明细下钻

统计页 SHALL 支持用户点击图例项查看该大类在当前选中月份下的所有支出记录。

#### Scenario: 点击图例项打开明细抽屉
- **WHEN** 用户点击统计页图例中任意一个有数据的大类项
- **THEN** 从底部滑出半屏抽屉，展示该大类在当前月份下的所有支出记录
- **AND** 抽屉顶部展示大类图标、大类名、当月金额合计、记录笔数

#### Scenario: 抽屉内点击单条记录跳转详情
- **WHEN** 用户在明细抽屉内点击某一条记录
- **THEN** 跳转至 `detail` 页并传入 `recordId` 和 `bookId` 参数
- **AND** 抽屉保持打开状态，返回统计页时仍可见

#### Scenario: 抽屉关闭
- **WHEN** 用户点击抽屉外的遮罩区域或抽屉顶部关闭按钮
- **THEN** 抽屉下滑收起，统计页恢复初始可见状态

#### Scenario: 大类下无记录（理论上不应发生）
- **WHEN** 因数据异常导致抽屉内无记录可展示
- **THEN** 抽屉正文展示「本月该大类暂无支出记录」空状态文案

#### Scenario: 复用已有数据
- **WHEN** 用户切换月份或重新进入统计页
- **THEN** 抽屉使用的记录列表来自 `loadData` 已加载的当月支出记录，不额外发起云函数请求

## MODIFIED Requirements

### Requirement: 记一笔提交按钮在所有机型完整可见

记一笔页面的提交按钮 SHALL 在带底部安全区的机型（如 iPhone X 系列）上完整显示，不被 Home Indicator 区域裁切。

#### Scenario: 全面屏机型按钮完整显示
- **WHEN** 在带 `safe-area-inset-bottom` 的机型上打开记一笔页
- **THEN** 提交按钮底部留出等于 `safe-area-inset-bottom` 的额外空间
- **AND** 按钮整体完整可见，可正常点击

#### Scenario: 非全面屏机型按钮位置保持
- **WHEN** 在不带底部安全区的机型上打开记一笔页
- **THEN** `safe-area-inset-bottom` 解析为 0
- **AND** 按钮位置和原有 `bottom: 40rpx` 保持一致

#### Scenario: 预算提醒浮层不与按钮重叠
- **WHEN** 记账成功后展示预算提醒浮层
- **THEN** 浮层 `bottom` 同步加安全区偏移
- **AND** 浮层与提交按钮之间保留原有相对间距，不发生遮挡

## REMOVED Requirements

无。
