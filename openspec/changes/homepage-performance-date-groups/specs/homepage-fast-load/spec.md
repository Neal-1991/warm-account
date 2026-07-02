## ADDED Requirements

### Requirement: 首页避免重复首屏加载
首页在首次进入时 SHALL 避免因 `onLoad` 和 `onShow` 连续触发而发起重复的完整数据加载。

#### Scenario: 冷启动只触发一次首屏加载
- **WHEN** 用户重新打开小程序并进入首页
- **THEN** 首页 SHALL 只保留一次有效的首屏加载结果
- **AND** 重复或过期的加载响应 MUST NOT 覆盖最新页面状态

### Requirement: 本地会话优先加载记录
当本地存在有效 `openId` 和 `bookId` 且用户未主动退出时，首页 SHALL 优先使用本地会话加载账目记录，同时保留远程会话恢复用于校正。

#### Scenario: 本地会话有效
- **WHEN** 用户重新打开小程序且本地仍保存 `openId` 和 `bookId`
- **THEN** 首页 SHALL 不等待远程 `restoreSession` 完成即可开始加载账目数据

#### Scenario: 远程校正失效
- **WHEN** 远程会话恢复确认用户未认证或账本失效
- **THEN** 首页 SHALL 清空记录、汇总和预算状态

### Requirement: 记录优先渲染
首页 SHALL 在分类和账目数据可用后优先渲染记录列表与月度收支汇总，预算卡片 SHALL 独立加载并随后更新。

#### Scenario: 预算接口较慢
- **WHEN** 账目与分类请求已返回但预算请求尚未完成
- **THEN** 首页 SHALL 显示记录列表和收支汇总
- **AND** 预算请求完成后 SHALL 单独刷新预算卡片

#### Scenario: 预算接口失败
- **WHEN** 预算请求失败
- **THEN** 首页 SHALL 保留已加载的记录列表和收支汇总
- **AND** 不应显示“数据加载失败”来阻断记录展示

### Requirement: 未设置预算快速返回
`budget.getMonth` 在目标月份没有预算时 SHALL 在权限和月份状态确认后尽早返回，不再读取分类和当月支出用于预算聚合。

#### Scenario: 当月未设置预算
- **WHEN** 首页请求未设置预算的月份
- **THEN** `budget.getMonth` SHALL 返回 `success: true` 且 `budget: null`
- **AND** 返回值 SHALL 继续包含 `canEdit` 与 `isHistorical`
