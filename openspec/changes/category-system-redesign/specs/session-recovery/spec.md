## ADDED Requirements

### Requirement: 冷启动会话恢复
系统 SHALL 在小程序冷启动时从本地 Storage 恢复缓存，并通过只读云函数校正当前用户的身份、账本和资料。

#### Scenario: 本地身份字段缺失
- **WHEN** Storage 仍有用户资料，但 `openId` 或 `bookId` 缺失
- **THEN** `login.restoreSession` 根据服务端 OpenID 返回现有账本
- **AND** 前端补齐 Storage 和全局状态，不创建新账本

#### Scenario: 本地账本已失效
- **WHEN** Storage 中的 `bookId` 指向已删除的个人账本
- **THEN** 服务端返回用户当前所属家庭账本
- **AND** 首页、统计和家庭页使用校正后的账本加载

#### Scenario: 用户主动退出
- **WHEN** 用户点击退出登录
- **THEN** 系统清空会话并保存 `manualLogout`
- **AND** 后续冷启动不执行静默恢复，直到用户再次主动登录
