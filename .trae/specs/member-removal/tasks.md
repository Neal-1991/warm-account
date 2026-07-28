# Tasks

- [ ] Task 1: 后端 book 云函数新增 `removeMember` action
  - [ ] SubTask 1.1: 在 [cloudfunctions/book/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/book/index.js) switch 中新增 `case 'removeMember'`：校验 `bookId`、`targetOpenId` 参数；调用 `assertBookOwner` 校验权限；拒绝 `targetOpenId === openId`（管理员移除自己）；拒绝 `book.joinMigration` 存在；用 `db.runTransaction` 把目标 openId 从 `memberIds` 移除（`_.pull(targetOpenId)`）并加入 `formerMemberIds`（`_.addToSet(targetOpenId)`）；返回 `{ success: true }`。
  - [ ] SubTask 1.2: 错误处理：`permission denied`、`cannot remove owner`、`member not found`（targetOpenId 不在 memberIds 中）、`join_migration_in_progress` 均返回对应 errorCode，便于前端区分展示。

- [ ] Task 2: 后端 book 云函数新增 `transferOwnership` 和 `acknowledgeTransfer` action
  - [ ] SubTask 2.1: 在 [cloudfunctions/book/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/book/index.js) switch 中新增 `case 'transferOwnership'`：校验 `bookId`、`targetOpenId` 参数；调用 `assertBookOwner` 校验权限；拒绝 `targetOpenId === openId`；拒绝 `targetOpenId` 不在 `memberIds` 中；拒绝 `book.joinMigration` 存在；查询原管理员昵称（调用 login `getMembers` 或直接查 members 集合）；用 `db.runTransaction` 更新 `books.ownerId = targetOpenId`，设置 `books.transferNotice = { fromOpenId: openId, fromNickName, transferredAt: new Date() }`；返回 `{ success: true }`。
  - [ ] SubTask 2.2: 新增 `case 'acknowledgeTransfer'`：校验 `bookId`；调用 `assertBookOwner`（仅当前 ownerId 可调用）；用事务清除 `books.transferNotice` 字段（`_.remove()`）；返回 `{ success: true }`。
  - [ ] SubTask 2.3: 错误处理：`permission denied`、`cannot transfer to self`、`target not member`、`join_migration_in_progress`、`no transfer notice`（acknowledgeTransfer 时无通知）均返回对应 errorCode。

- [ ] Task 3: 后端 login 云函数扩展 `restoreSession` 和 `getMembers`
  - [ ] SubTask 3.1: [cloudfunctions/login/index.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/login/index.js) `restoreSession`：当 `books.data.length === 0` 时，额外查询 `formerMemberIds` 包含 openId 的账本（limit 1），若存在则返回 `{ success: true, authenticated: false, removed: true, removedBookName: book.name, openId }`；否则保持原 `{ authenticated: false, openId }` 返回。
  - [ ] SubTask 3.2: `restoreSession`：当用户是某账本 `ownerId` 且该账本存在 `transferNotice` 时，在原有返回基础上附加 `transferred: true, fromNickName: book.transferNotice.fromNickName, transferredAt: book.transferNotice.transferredAt`。
  - [ ] SubTask 3.3: `getMembers`：扩展查询逻辑，除了当前 `memberIds`（含 ownerId），再从调用者所在账本的 `formerMemberIds` 中收集 openId 一并查询；返回结果中给已退出成员附加 `isFormer: true` 字段；安全过滤逻辑同步更新（`allowedMemberIds` 包含 `formerMemberIds`）。

- [ ] Task 4: 前端 family 页实现移除和转让交互、已退出成员展示
  - [ ] SubTask 4.1: [family.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.js) `loadMembers`：同时处理 `formerMemberIds`，分为 `members` 和 `formerMembers` 两个数组 setData；为每个已退出成员附加 `isFormer: true`。loadData 时从 book 读取 `formerMemberIds` 字段传给 loadMembers。
  - [ ] SubTask 4.2: [family.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.js) `removeMember`：替换占位实现，调用 `wx.cloud.callFunction({ name: 'book', data: { action: 'removeMember', bookId, targetOpenId, isTest } })`；成功后 `wx.showToast({ title: '已移除', icon: 'success' })` 并 `this.loadData()`；失败时根据 errorCode（`permission_denied` / `cannot_remove_owner` / `member_not_found` / `join_migration_in_progress`）显示对应中文提示。
  - [ ] SubTask 4.3: [family.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.js) 新增 `transferOwnership`：`wx.showModal({ title: '转让所有权', content: '确定将账本所有权转给「' + nickName + '」吗？你将变为普通成员。', confirmText: '转让' })`，确认后调用 `wx.cloud.callFunction({ name: 'book', data: { action: 'transferOwnership', bookId, targetOpenId, isTest } })`；成功后 `wx.showToast({ title: '已转让', icon: 'success' })` 并 `this.loadData()`（此时 isAdmin 变为 false，按钮自动隐藏）；失败时根据 errorCode 显示对应中文提示。
  - [ ] SubTask 4.4: [family.wxml](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.wxml) 修改"移除"按钮显示条件：`wx:if="{{isAdmin && !item.isFormer && item.openId !== currentOpenId}}"`；新增"转让"按钮，显示条件相同，`bindtap="transferOwnership"`，`data-openid="{{item.openId}}"`，`data-name="{{item.nickName}}"`。
  - [ ] SubTask 4.5: [family.wxml](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.wxml) 新增"已退出成员"分组区块，wx:for 遍历 `formerMembers`，不显示移除/转让按钮，显示"已退出"标签。
  - [ ] SubTask 4.6: [family.wxss](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/pages/family/family.wxss) 新增 `.former-member-section`、`.former-member-item`、`.former-tag`、`.transfer-btn` 等样式，视觉上区分已退出成员（灰色、降低不透明度）和转让按钮（次要按钮样式）。

- [ ] Task 5: 前端 app.js / 入口页处理被移除和被转让状态
  - [ ] SubTask 5.1: [app.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/app.js) `ensureSession`：当 `restoreSession` 返回 `removed: true` 时，把 `removedBookName` 写入 `wx.setStorageSync('removedBookName', ...)`，返回 `{ authenticated: false, removed: true, removedBookName }`。
  - [ ] SubTask 5.2: [app.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/miniprogram/app.js) `ensureSession`：当 `restoreSession` 返回 `transferred: true` 时，把 `transferNotice = { fromNickName, transferredAt }` 写入 `wx.setStorageSync('transferNotice', ...)`，正常返回 session（authenticated: true）。
  - [ ] SubTask 5.3: 选择入口页（family 或 index）展示被移除告知弹窗：onShow 时检查 `wx.getStorageSync('removedBookName')`，若存在则 `wx.showModal({ title: '你已被移出家庭账本', content: '你已被移出「' + name + '」，历史记录保留在该账本中。是否创建新的个人账本？', showCancel: false })`，用户确认后 `wx.removeStorageSync('removedBookName')` 并触发 login 流程创建新账本。
  - [ ] SubTask 5.4: 入口页展示被转让告知弹窗：onShow 时检查 `wx.getStorageSync('transferNotice')`，若存在则 `wx.showModal({ title: '账本所有权已转给你', content: '「' + fromNickName + '」已将家庭账本的所有权转给你，你现在是管理员。', showCancel: false })`，用户确认后 `wx.removeStorageSync('transferNotice')` 并调用 `wx.cloud.callFunction({ name: 'book', data: { action: 'acknowledgeTransfer', bookId, isTest } })` 清除后端标记。
  - [ ] SubTask 5.5: 验证被移除方重新进入后调用 login 云函数会创建新账本（仅预设分类），与正常新用户流程一致。

- [ ] Task 6: 重新加入时清理 formerMemberIds
  - [ ] SubTask 6.1: [cloudfunctions/book/join-migration.js](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/cloudfunctions/book/join-migration.js) `finalize` 函数：在把 openId 加入 `memberIds` 时，同时从 `formerMemberIds` 中移除（`_.pull(openId)`），避免重新加入后 formerMemberIds 残留。

- [ ] Task 7: 测试与验证
  - [ ] SubTask 7.1: 在 [tests/](file:///c:/Users/123/git/Ledger/.worktrees/warm-account/tests/) 下新增 `member-removal.test.js`，覆盖：管理员移除普通成员成功、非管理员被拒、移除自己被拒、joinMigration 中拒绝、被移除方 restoreSession 返回 removed、getMembers 返回 isFormer 标记、重新加入后 formerMemberIds 清理。
  - [ ] SubTask 7.2: 新增 `ownership-transfer.test.js`，覆盖：管理员转让成功、转让给非成员被拒、转让给自己被拒、非管理员转让被拒、joinMigration 中拒绝、新管理员 restoreSession 返回 transferred、acknowledgeTransfer 清除通知。
  - [ ] SubTask 7.3: 手动验证流程（测试环境）：
    1. 管理员移除一个成员 → 该成员从列表消失并出现在"已退出成员" → 被移除方重新打开小程序看到告知弹窗 → 确认后创建新账本 → 该成员重新被邀请加入原账本能看到旧记录。
    2. 管理员转让所有权给某成员 → 原管理员变为普通成员（按钮消失）→ 新管理员下次打开看到告知弹窗 → 确认后通知清除。

# Task Dependencies
- Task 3 依赖 Task 1 和 Task 2（restoreSession 检测 formerMemberIds 和 transferNotice，需要 Task 1/2 先写入这些字段）
- Task 4 依赖 Task 1、2、3（前端调用需要后端 action 和 getMembers 扩展就绪）
- Task 5 依赖 Task 3（restoreSession 返回 removed/transferred 字段）
- Task 6 依赖 Task 1（finalize 修改依赖 formerMemberIds 字段存在）
- Task 7 依赖 Task 1-6 全部完成
