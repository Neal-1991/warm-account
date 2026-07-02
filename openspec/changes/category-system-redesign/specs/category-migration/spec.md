## ADDED Requirements

### Requirement: 存量账本分类迁移
系统 SHALL 提供 `migrate` action 将存量账本从共享分类模式迁移为独立副本模式。迁移操作 SHALL 是幂等的。

#### Scenario: 迁移尚未迁移的账本
- **WHEN** 对未迁移的账本调用 `migrate`
- **THEN** 系统复制所有 `bookId: null` 的大类为该账本的独立副本（`bookId` 设为账本 ID，`isSystem: true`）
- **AND** 更新所有小类的 `parentId` 从旧大类 _id 映射到新大类 _id
- **AND** 更新所有记录的 `categoryId` 从旧分类 _id 映射到新分类 _id
- **AND** 返回 `{ success: true, migratedCount: 分类数 }`

#### Scenario: 重复迁移已迁移账本（幂等）
- **WHEN** 对已迁移的账本再次调用 `migrate`
- **THEN** 系统检测到该账本已有 `bookId` 非 null 的大类，跳过迁移
- **AND** 返回 `{ success: true, message: "already migrated" }`

#### Scenario: 迁移无账本用户
- **WHEN** 对没有账本的用户调用 `migrate`
- **THEN** 返回 `{ success: true, message: "no book to migrate" }`

### Requirement: 新账本初始化
新账本创建时 SHALL 使用新的独立副本模式，不再依赖 `bookId: null` 的共享分类。

#### Scenario: 新账本初始化分类
- **WHEN** 新用户登录创建账本后调用 `init-database`
- **THEN** 系统为支出创建 16 个大类（餐饮→其他）及各子类
- **AND** 系统为收入创建 7 个大类（工资→其他）及各子类
- **AND** 所有分类 `bookId` 均设为当前账本 ID，`isSystem` 为 `true`
- **AND** 不再创建 `bookId: null` 的分类（共享分类已废弃）

#### Scenario: 已存在部分旧版分类时自动补齐
- **WHEN** 账本已经存在部分 per-book 系统大类，但数量或版本落后于当前预设
- **THEN** 登录初始化 SHALL 保留已有分类及其 `_id`
- **AND** 系统 SHALL 幂等补齐缺失的支出 16 大类和收入 7 大类
- **AND** 重复登录 SHALL NOT 创建重复大类
- **AND** 用户自建分类 SHALL 保持不变

### Requirement: 分类结构版本
系统 SHALL 使用账本字段 `categorySchemaVersion` 标记分类结构版本，并使用分类字段 `presetKey` 稳定识别系统预设。

#### Scenario: 初始化成功后推进版本
- **WHEN** 当前版本的全部系统大类和默认子类写入成功
- **THEN** 系统将账本 `categorySchemaVersion` 更新为当前版本

#### Scenario: 初始化中断后自动重试
- **WHEN** 分类初始化超时或仅完成部分写入
- **THEN** 系统 SHALL NOT 推进 `categorySchemaVersion`
- **AND** 下次登录 SHALL 幂等续补缺失分类

#### Scenario: 用户改名后升级分类结构
- **WHEN** 用户修改系统分类名称或 emoji 后发生后续分类版本升级
- **THEN** 系统通过 `presetKey` 识别原分类
- **AND** 保留分类 `_id`、用户名称和用户 emoji

## ADDED Requirements

### Requirement: 新预设分类体系
系统 SHALL 按照新的分类体系初始化账本，支出 16 大类按使用频率排序，收入 7 大类。

#### Scenario: 支出大类顺序与子类
- **WHEN** 新账本初始化支出分类
- **THEN** 顺序为：餐饮、交通、购物、居住、通讯、育儿、美容护肤、服饰、娱乐、运动健身、旅行、宠物、医疗、人情、教育、其他
- **AND** 每个大类包含对应的默认子类

#### Scenario: 收入大类顺序与子类
- **WHEN** 新账本初始化收入分类
- **THEN** 顺序为：工资、奖金、公积金、投资、副业兼职、红包礼金、其他
- **AND** 闲置转卖和医疗报销的子类不再出现（合并入其他）
