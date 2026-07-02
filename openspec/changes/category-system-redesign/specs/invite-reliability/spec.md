## ADDED Requirements

### Requirement: 邀请码服务端过期控制
邀请码 SHALL 在生成后一小时过期，首次接受必须由服务端在事务内重新校验。

#### Scenario: 过期后首次加入
- **WHEN** 用户在邀请码过期后首次点击“加入”
- **THEN** 服务端返回 `INVITE_EXPIRED`
- **AND** 不创建迁移任务、不增加成员

#### Scenario: 验证后才过期
- **WHEN** 用户在有效期内打开确认框，但在过期后才点击“加入”
- **THEN** 服务端仍拒绝首次接受

#### Scenario: 有效期内已建立任务
- **WHEN** 服务端在有效期内写入 `joinMigration.acceptedAt`
- **AND** 迁移因超时或网络中断跨过截止时间
- **THEN** 同一用户可以继续原任务直至完成

### Requirement: 加入成功精确判定
前端 SHALL 只在加入接口返回完成状态且目标账本一致时提示成功。

#### Scenario: B 的个人账本仍可查询
- **WHEN** 加入请求超时且 `book.get` 仍可返回 B 的个人账本
- **THEN** 前端不得将其判定为加入成功
- **AND** 仅通过邀请码状态恢复并核对目标 `bookId`
