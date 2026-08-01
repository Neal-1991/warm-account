## ADDED Requirements

### Requirement: 语音和 AI 凭证必须只保存在服务端配置

腾讯云 ASR 凭证、CloudBase AI 配置和任何模型访问凭证 SHALL 通过云函数环境配置或受控密钥配置注入；不得写入小程序代码、提交到 Git 或返回给客户端。

#### Scenario: 发布小程序包

- **WHEN** 构建并检查小程序前端代码
- **THEN** 前端只包含云函数调用所需的非敏感配置
- **AND** 搜索包内容不得发现 SecretKey、API Key、签名或完整 AI Base URL 凭证

#### Scenario: 云函数缺少服务端凭证

- **WHEN** 云函数启动时发现 ASR 或 AI 凭证未配置
- **THEN** 云函数快速返回服务未配置错误
- **AND** 不尝试使用客户端传入的凭证补救

### Requirement: 成长计划免费额度调用必须遵守 CloudBase 通道约束

当前非资源点计费环境 SHALL 通过小程序 SDK或云开发 SDK使用受支持的 AI 调用方式；系统不得把 CloudBase API Key 直接交给小程序，也不得把成长计划免费额度用于未经允许的直接 HTTP 调用。

#### Scenario: 解析请求进入当前云函数

- **WHEN** 云函数需要调用 Hy3
- **THEN** 使用已配置的 CloudBase SDK provider 和模型
- **AND** 记录调用阶段及耗时，而不是输出完整凭证或原始 HTTP 请求

### Requirement: 语音记账必须有配额、并发和频率保护

系统 SHALL 对单用户、单账本和全局设置合理的录音时长、请求并发和单位时间调用次数限制；超过限制时应优先提示稍后重试或使用手工记账。

#### Scenario: 用户连续发起多个解析请求

- **WHEN** 同一用户存在未完成的语音请求或超过频率限制
- **THEN** 新请求被拒绝或排队规则明确返回
- **AND** 不重复消耗 ASR 和 AI 额度

#### Scenario: AI 额度不足

- **WHEN** Hy3 返回额度不足或达到套餐限制
- **THEN** 系统停止继续重试
- **AND** 用户仍可使用已经得到的文本进入手工记账

### Requirement: 日志和监控必须脱敏并可定位问题

系统 SHALL 为录音、ASR、规则解析、Hy3、校验和写入阶段生成内部 requestId，并记录阶段、耗时、错误分类和结果计数；日志不得包含完整语音、完整提示词、密钥或临时文件地址。

#### Scenario: 运维排查一次失败请求

- **WHEN** 运维人员根据 requestId 查询日志
- **THEN** 可以判断失败发生在录音上传、ASR、规则、Hy3、校验还是写入阶段
- **AND** 日志中的用户文本和凭证已按要求脱敏或不记录

### Requirement: 外部服务失败时必须有降级和熔断策略

当 ASR 或 AI 连续失败、超时或返回服务不可用时，系统 SHALL 在有限时间内停止无效重试，并提供手工记账回退；恢复后才允许新请求重新尝试。

#### Scenario: Hy3 连续不可用

- **WHEN** Hy3 在短时间内连续返回通道不可用或超时
- **THEN** 系统暂时跳过 AI 调用并提示手工记账
- **AND** 已由 ASR 得到的文本不会丢失

### Requirement: AI 云函数依赖版本必须满足模型调用要求

新增 AI 云函数 SHALL 使用满足 CloudBase AI 调用要求的 `wx-server-sdk` 版本，并与现有旧版云函数隔离升级风险；升级或部署前必须在测试环境验证登录、记录和语音流程。

#### Scenario: 部署语音解析云函数

- **WHEN** 开发者部署包含 `cloud.ai()` 调用的新云函数
- **THEN** 该函数的依赖版本满足当前 CloudBase AI SDK 要求
- **AND** 不要求一次性升级所有既有云函数

