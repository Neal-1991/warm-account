## Context

当前分类系统：大类 `bookId: null`（所有账本共享），小类 `bookId` 有值（per-book）。系统预置 9 支出 + 7 收入大类，用户仅可新增小类。改名和删除均不支持。

本次改造的核心是**将每个账本的分类数据完全独立化**——初始化时将预设分类复制到账本（`bookId` 有值），后续所有修改只影响自己账本。

## Goals / Non-Goals

**Goals:**
- 每个账本拥有独立的分类副本，修改不影响其他账本
- 大类支持增、改名（含 emoji）、删（初始预置不可删，自建可删）
- 小类支持改名（含 emoji）、删（有记录时归并）
- 记账支持直接选大类
- 新增分类管理页，集中管理
- 调整预设分类（支出 16 大类，收入 7 大类）
- 存量数据平滑迁移

**Non-Goals:**
- 不在本变更中做分类拖拽排序
- 不改变统计页饼图逻辑（大类聚合不变）
- 不提供软删除（`isVisible: false`）——删除即硬删除或归并

## Decisions

### 1. 数据架构：Copy-on-Init（每账本独立副本）

**选择**：初始化时将预设分类完整复制到账本，`bookId` 设为当前账本 ID。新增 `isSystem` 字段标记来源。

**替代方案**：
- Copy-on-Write（修改时才复制）：复杂，需处理子类归属迁移、去重、新旧 _id 映射。放弃。
- 继续共享 + 改名覆盖：改名时生成 book-specific 覆盖记录，查询需合并。复杂且易出错。放弃。

### 2. 删除时的记录归并策略

**大类删除**：仅自建可删。有子类时提示确认。有记录时拦截，要求用户先将记录归入其他大类。

**小类删除**：无记录直接删。有记录时弹窗选归并目标——父类或同父类的其他子类。不提供软删除。

### 3. 分类管理页面

**选择**：新增独立页面 `pages/category-manage/`，从 `category-picker` 的"管理"按钮跳转。按 type（支出/收入）分 tab，大类和小类分组展示。

**替代方案**：在 picker 内展开管理模式。太拥挤，交互体验差。放弃。

### 4. 大类记账

**选择**：`category-picker` 右侧小类列表顶部新增"记在「XXX」下"选项。选中后记录 `categoryId` 指向大类，统计页按大类聚合逻辑不变。

### 5. 存量迁移

**选择**：`category` 云函数新增 `migrate` action。遍历已有账本，复制大类（建立旧 _id → 新 _id 映射），更新子类 `parentId`。幂等——检查账本是否已有 `bookId` 非 null 的大类，有则跳过。

## Risks / Trade-offs

- **迁移失败** → 云函数返回详细错误信息。迁移前不修改任何数据，全部操作完成后才算成功。中断时已复制的数据可通过重复执行清理（幂等）。
- **旧 fileID 引用** → 分类的 _id 变更后，记录中的 `categoryId` 指向旧 _id。迁移必须更新所有记录的 `categoryId`，否则首页展示异常。已在 migration plan 中覆盖。
- **复合索引失效** → 新增 `orderBy('createdAt', 'desc')` 需要新索引，已在 record-sort-order 变更中处理，不重复。

## Migration Plan

1. 部署新云函数代码（`category` 含 `migrate` action）
2. 调用 `migrate` — 对每个账本：
   a. 检查是否已有 `bookId` 非 null 的大类（已迁移则跳过）
   b. 复制 16+7 个系统大类，记录 `oldBigId → newBigId` 映射
   c. 更新小类 `parentId`：`oldBigId → newBigId`
   d. 更新记录 `categoryId`：所有引用旧大类/小类 _id 的记录更新为对应新 _id
3. 验证：抽查几个账本的数据完整性
4. 无回滚需求——迁移是幂等的，失败可重试

## Open Questions

<!-- 均已确认，无待解决问题 -->

## Release Hardening（2026-06-10）

- 当前生产环境仅有两名可恢复数据的用户，本次发布允许一次性清空 `_prod` 数据后重新初始化。
- 账本新增 `categorySchemaVersion`；系统分类新增稳定 `presetKey`。
- 登录不再以“存在任意大类”判断初始化完成，而是调用幂等初始化；只有全部写入成功后才推进版本。
- 后续分类调整必须提升 schema version 并按 `presetKey` 迁移，不再要求清空生产数据。
- 家庭合并优先按 `presetKey` 匹配系统分类，旧数据回退到名称+类型匹配。

## Session and Invite Hardening（2026-06-12）

- `app.ensureSession()` 在冷启动时先恢复 Storage，再调用 `login.restoreSession` 校正 `openId/bookId/userInfo`；该 action 不创建账本、不初始化分类。
- 用户主动退出时写入 `manualLogout`，阻止下一次启动静默恢复；再次主动登录后清除标记。
- 邀请码以服务端 `inviteCodeExpire` 为准。仅服务端事务写入 `joinMigration.acceptedAt` 后，任务才获得跨过期时间续跑资格。
- 邀请验证只负责展示目标账本；若用户在确认前超过一小时，首次 `join` 仍返回 `INVITE_EXPIRED`。
- 加入成功必须满足 `status=completed` 且返回 `bookId` 等于验证阶段目标账本，禁止使用任意当前用户账本推测成功。

## Release Closure（2026-07-02）

- 分类系统重构已随当前生产版本上线，分类管理、大类记账、存量迁移、首页排序、统计聚合和 A/B 家庭加入均已完成手工验收。
- 受保护生产重置能力仅作为明确需要时的兜底工具保留，不再作为常规发布或回归步骤。
- 后续优化不在本变更继续扩展，应另开变更处理，例如记录分页、环境切换自动化、统一云函数调用封装和分类归并体验优化。
