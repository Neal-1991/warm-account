# 家庭账本成员管理优化 Spec

## Why
家庭账本目前没有移除成员和转让所有权的能力：前端 [family.wxml](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.wxml) 的"移除"按钮被 `wx:if="{{false}}"` 隐藏，[family.js#L413-L424](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.js#L413-L424) 的 `removeMember` 仅返回"开发中"toast，后端 [book/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/book/index.js) 完全没有对应 action。管理员无法移除误加入或已退出的成员，也无法把账本所有权转给其他成员后退出，导致成员列表长期残留无效成员、管理员绑定后无法换人。

## What Changes
- 后端 [book/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/book/index.js) 新增 `removeMember` action：仅 `ownerId` 可调用；不能移除自己；用事务从 `memberIds` 移除目标 openId 并加入 `formerMemberIds`；若有正在进行的 `joinMigration` 则拒绝。
- 后端 [book/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/book/index.js) 新增 `transferOwnership` action：仅 `ownerId` 可调用；目标必须是当前 `memberIds` 中的成员；用事务把 `books.ownerId` 改为目标 openId，原管理员保留在 `memberIds` 中变为普通成员；同时在 books 设置 `transferNotice: { fromOpenId, fromNickName, transferredAt }` 用于通知新管理员；若有 `joinMigration` 则拒绝。
- 后端 [book/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/book/index.js) 新增 `acknowledgeTransfer` action：仅当前 `ownerId` 可调用，清除 `transferNotice` 字段。
- 后端 [login/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/login/index.js) `restoreSession` 扩展：
  - 检测到用户曾属于某账本但已被移除（出现在 `formerMemberIds` 中）时，返回 `removed: true` 和 `removedBookName`。
  - 检测到当前用户是某账本 `ownerId` 且该账本存在 `transferNotice` 时，返回 `transferred: true, fromNickName, transferredAt`。
- 后端 [login/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/login/index.js) `getMembers` 扩展：能根据 `formerMemberIds` 查询已退出成员的资料，返回结果中带 `isFormer: true` 标记。
- 前端 [family.wxml](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.wxml) / [family.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.js)：
  - 管理员视角下，对非自己、非已退出的成员显示"移除"和"转让所有权"两个按钮。
  - 点击"移除"弹确认弹窗（显示成员昵称），调用云函数后刷新列表。
  - 点击"转让所有权"弹确认弹窗（明确告知"将变为普通成员"），调用云函数后刷新列表，原管理员视角变为普通成员视角。
  - 已退出成员单独分组展示，标注"已退出"。
- 前端 [app.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/app.js) `ensureSession`：
  - 检测到 `removed: true` 时缓存 `removedBookName`，由入口页弹窗告知并创建新账本。
  - 检测到 `transferred: true` 时缓存 `transferNotice`，由入口页弹窗告知"XX 已将账本所有权转给你"，用户确认后调用 `acknowledgeTransfer` 清除后端标记。

## Impact
- Affected specs: statistics-drilldown-and-submit-button-fix（统计页可能涉及按成员筛选，本次未改统计页，仅记录潜在影响）
- Affected code:
  - [cloudfunctions/book/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/book/index.js) — 新增 `removeMember`、`transferOwnership`、`acknowledgeTransfer` 三个 case
  - [cloudfunctions/login/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/login/index.js) — 扩展 `restoreSession`（removed + transferred）、`getMembers`（formerMemberIds）
  - [miniprogram/pages/family/family.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.js) — 实现 `removeMember` 和 `transferOwnership` 调用、已退出成员分组加载
  - [miniprogram/pages/family/family.wxml](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.wxml) — 移除/转让按钮显示条件、已退出成员区块、确认弹窗
  - [miniprogram/pages/family/family.wxss](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.wxss) — 已退出成员样式、转让按钮样式
  - [miniprogram/app.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/app.js) — `ensureSession` 处理 `removed` 和 `transferred` 状态
  - 统计页 / 记录详情页：本次不改，但已退出成员的记录会按 ownerId 正常显示（依赖 `getMembers` 扩展返回真实昵称）

## ADDED Requirements

### Requirement: 移除成员（管理员操作）
系统 SHALL 允许账本管理员（`ownerId`）将非自己的成员从账本 `memberIds` 中移除，被移除成员的历史记录（账目、分类、预算）保留在家庭账本中不被修改。

#### Scenario: 管理员成功移除普通成员
- **WHEN** 管理员在 family 页点击某普通成员的"移除"按钮，并在确认弹窗中点"确认"
- **THEN** 后端从 `books.memberIds` 移除该 openId，将其加入 `books.formerMemberIds`；前端刷新成员列表，该成员出现在"已退出成员"分组

#### Scenario: 非管理员尝试移除
- **WHEN** 非管理员调用 `removeMember` action
- **THEN** 后端返回 `permission denied` 错误，`memberIds` 不变

#### Scenario: 管理员尝试移除自己
- **WHEN** 管理员尝试移除自己的 openId
- **THEN** 后端返回 `cannot remove owner` 错误；前端按钮对管理员自己不显示

#### Scenario: 移除正在进行 joinMigration 的成员
- **WHEN** 目标账本存在 `joinMigration` 状态（任何成员正在加入）
- **THEN** 后端返回 `join_migration_in_progress` 错误，拒绝移除

#### Scenario: 被移除成员的历史记录保留
- **THEN** 移除操作不修改 `records`、`categories`、`budgets` 集合中的任何文档；记录的 `ownerId` 保持不变

### Requirement: 转让所有权（管理员操作）
系统 SHALL 允许账本管理员（`ownerId`）把账本所有权转给当前 `memberIds` 中的某个普通成员，转让后原管理员变为普通成员（仍留在 `memberIds`），新管理员获得所有权。

#### Scenario: 管理员成功转让所有权
- **WHEN** 管理员在 family 页点击某普通成员的"转让所有权"按钮，并在确认弹窗中点"确认"
- **THEN** 后端用事务把 `books.ownerId` 改为目标 openId；原管理员仍在 `memberIds` 中；同时设置 `books.transferNotice = { fromOpenId, fromNickName, transferredAt }`；前端刷新列表，原管理员视角变为普通成员（不再看到"邀请成员"和成员管理按钮）

#### Scenario: 转让给非成员
- **WHEN** 调用 `transferOwnership` 时 `targetOpenId` 不在 `memberIds` 中
- **THEN** 后端返回 `target not member` 错误；前端转让按钮只对当前成员显示，不会出现此情况

#### Scenario: 转让给自己
- **WHEN** 管理员尝试把所有权转给自己的 openId
- **THEN** 后端返回 `cannot transfer to self` 错误；前端按钮对管理员自己不显示

#### Scenario: 非管理员尝试转让
- **WHEN** 非管理员调用 `transferOwnership` action
- **THEN** 后端返回 `permission denied` 错误

#### Scenario: 转让时存在 joinMigration
- **WHEN** 目标账本存在 `joinMigration` 状态
- **THEN** 后端返回 `join_migration_in_progress` 错误，拒绝转让

### Requirement: 被移除成员的再次进入引导
系统 SHALL 在被移除成员下次进入小程序时检测其已被移除，并通过弹窗告知"你已被移出 XX 家庭账本"，用户确认后为其创建新的个人账本。

#### Scenario: 被移除方下次打开应用
- **WHEN** 被移除成员启动小程序，`restoreSession` 发现其 openId 不在任何账本的 `memberIds`/`ownerId` 中，但曾在某账本的 `formerMemberIds` 中
- **THEN** 返回 `{ authenticated: false, removed: true, removedBookName: <账本名> }`；前端缓存该信息并在入口页弹窗告知；用户确认后调用 login 流程创建新个人账本（仅预设分类，不带原家庭账本的自定义分类）

#### Scenario: 被移除方重新被邀请加入原账本
- **WHEN** 被移除方拿到新的邀请码并加入原账本
- **THEN** join-migration 把其新建的空账本作为源账本合并（预设分类被去重，无数据迁移）；该 openId 重新加入 `memberIds`（并从 `formerMemberIds` 移除）；其之前在家庭账本中的历史记录（ownerId 不变）再次对其可见，可编辑

### Requirement: 新管理员的所有权转让通知
系统 SHALL 在新管理员（被转让方）下次进入小程序时检测到所有权已转给他，并通过弹窗告知"XX 已将账本所有权转给你"，用户确认后清除后端通知标记。

#### Scenario: 新管理员下次打开应用
- **WHEN** 新管理员启动小程序，`restoreSession` 发现其 openId 是某账本 `ownerId`，且该账本存在 `transferNotice`
- **THEN** 返回 `{ authenticated: true, transferred: true, fromNickName, transferredAt, bookId, openId }`；前端缓存 `transferNotice` 并在入口页弹窗告知；用户确认后调用 `acknowledgeTransfer` 清除 `books.transferNotice` 字段

#### Scenario: 新管理员确认前再次打开应用
- **WHEN** 新管理员未确认通知就关闭应用，下次再次打开
- **THEN** `restoreSession` 仍检测到 `transferNotice` 存在，再次返回 `transferred: true`，再次弹窗告知（直到用户确认）

### Requirement: 已退出成员的展示
系统 SHALL 在成员列表中保留已退出成员的展示，标注"已退出"，并能在历史记录中显示其真实昵称（而非"未知"）。

#### Scenario: family 页展示已退出成员
- **WHEN** 管理员打开 family 页，账本存在 `formerMemberIds`
- **THEN** 在"家庭成员"列表下方展示"已退出成员"分组，显示其昵称和"已退出"标签；该分组不显示"移除"和"转让"按钮

#### Scenario: 历史记录展示已退出成员昵称
- **WHEN** 任意成员查看记录列表/详情，记录的 ownerId 属于 `formerMemberIds`
- **THEN** 通过 `getMembers` 扩展（同时查 `formerMemberIds`）返回该成员资料，前端显示真实昵称

## MODIFIED Requirements

### Requirement: getMembers 云函数
原 `getMembers` 仅根据调用者所在账本的 `memberIds`（含 ownerId）查询成员资料。修改为同时返回 `formerMemberIds` 对应成员的资料，并在每个返回项中带 `isFormer: true` 标记，以便前端区分展示。

### Requirement: restoreSession 云函数
原 `restoreSession` 在找不到关联账本时返回 `{ authenticated: false, openId }`。修改为：
1. 若该 openId 出现在某账本的 `formerMemberIds` 中，返回 `{ authenticated: false, removed: true, removedBookName: <账本名> }`。
2. 若该 openId 是某账本 `ownerId` 且该账本存在 `transferNotice`，返回 `{ authenticated: true, transferred: true, fromNickName, transferredAt, bookId, openId, userInfo }`。
3. 否则保持原行为。

### Requirement: family 页成员管理
原 `removeMember` 占位函数仅返回 toast。修改为：调用 `book` 云函数 `removeMember` action，成功后刷新成员列表；失败时根据 errorCode 显示对应错误提示。同时新增 `transferOwnership` 函数调用对应 action。

## REMOVED Requirements
无（保留所有现有功能）。
