## ADDED Requirements

### Requirement: 解析器必须先使用确定性规则覆盖简单表达

系统 SHALL 先用本地或云函数内的确定性规则处理高频简单表达，再决定是否调用 Hy3；规则不得依赖模型随机输出。

#### Scenario: 规则可以完整解析普通单笔支出

- **WHEN** 文本包含明确金额、收支语义和可匹配分类，例如“午饭花了三十元”
- **THEN** 系统直接生成一笔结构化草稿
- **AND** 系统不调用 Hy3
- **AND** 金额转换为 3000 分存储

#### Scenario: 规则无法确定关键字段

- **WHEN** 文本缺少金额、收支类型或无法匹配当前账本分类
- **THEN** 系统将文本交给 Hy3 解析或标记为需要用户补充
- **AND** 不得猜测缺失金额或自动创建分类

### Requirement: Hy3 只能输出受约束的记账 JSON

Hy3 调用 SHALL 使用固定的系统提示和结构化输出约束，要求只返回约定 JSON，不得让模型直接调用数据库、修改账本或返回面向用户的长篇解释。

#### Scenario: Hy3 返回合法结构

- **WHEN** Hy3 返回符合 schema 的 JSON
- **THEN** 服务端校验字段类型、金额范围、日期和项目数量
- **AND** 只有通过校验的字段才进入预览页

#### Scenario: Hy3 返回非 JSON 或夹带解释

- **WHEN** Hy3 返回 Markdown、自然语言解释、缺失字段或非法 JSON
- **THEN** 服务端尝试一次受限修复或重新请求结构化结果
- **AND** 仍失败时将流程标记为解析失败，不把模型原始输出直接展示为可写入数据

### Requirement: 当前 CloudBase 环境必须使用正确的模型接入方式

在当前 `cloud1` 非资源点计费环境中，AI 云函数 SHALL 通过支持该环境的 CloudBase SDK provider 调用 `hy3`；实现不得使用成长计划免费额度对应的直接 HTTP Base URL 方式。若环境切换为资源点计费，provider 选择必须由配置显式切换，而不是由用户输入控制。

#### Scenario: 当前非资源点环境调用解析

- **WHEN** 云函数需要使用 Hy3
- **THEN** 使用 `hunyuan-v3` provider 和 `hy3` 模型配置
- **AND** 使用满足 AI 调用要求的 `wx-server-sdk` 版本
- **AND** 不向客户端暴露 Base URL 或 API Key

#### Scenario: AI 服务通道不可用

- **WHEN** CloudBase 返回通道未授权、模型未开通或额度不可用
- **THEN** 系统返回明确的“解析服务暂不可用”状态
- **AND** 已有识别文本仍可转入手工记账

### Requirement: 解析结果必须使用稳定的临时草稿 schema

解析器 SHALL 输出以下语义字段：请求标识 `requestId`、原文 `transcript`、一个或多个 `items`；每个 item 至少包含 `itemId`、`type`、`amountFen`、`categoryId`、`categoryName`、`date`、`remark`、`confidence`、`needsReview`、`source` 和 `warnings`。金额必须是正整数分，日期必须是可序列化的明确日期。

#### Scenario: 解析一笔普通记录

- **WHEN** 输入“昨天买菜 58 元”且当前账本存在可用的餐饮或买菜分类
- **THEN** 输出一个 item
- **AND** `amountFen` 为 5800，`date` 为用户时区下的昨天
- **AND** item 绑定当前账本真实 `categoryId`，而不是模型生成的分类 ID

#### Scenario: 解析多笔明确表达

- **WHEN** 输入明确列举的多笔内容，例如“早餐 8 元，地铁 5 元”
- **THEN** 输出两个独立 item，并分别保留金额、分类和备注
- **AND** 每个 item 有唯一 `itemId`

### Requirement: 分类、收支类型和日期必须映射到当前账本上下文

服务端 SHALL 将模型返回的分类名称映射到当前账本、当前收支类型下的真实分类；收支类型只能是现有支出或收入枚举；相对日期必须按用户当前时区和请求时间解析。

#### Scenario: 模型返回不存在的分类

- **WHEN** Hy3 返回当前账本不存在的分类名
- **THEN** 系统不创建新分类
- **AND** 将该 item 标记 `needsReview=true` 并让用户从现有分类中选择

#### Scenario: 文本没有明确日期

- **WHEN** 文本没有“昨天”“下周”等日期表达
- **THEN** 系统使用当前记账日期作为默认值
- **AND** 在预览中展示该日期供用户修改

### Requirement: 复杂金融语义不得静默推断

MVP 对 AA 分摊、转账、借贷、退款冲销、复杂数学分摊和含糊的多笔金额 SHALL 阻止自动确认，不得静默改写成普通收支记录；系统必须保留原文并引导用户明确修改为普通收支、删除该 item 或转到手工记账。

#### Scenario: 用户说“和朋友 AA”

- **WHEN** 识别文本包含 AA 或分摊语义
- **THEN** 系统不自动计算个人应付金额
- **AND** 该 item 显示“检测到分摊，暂不支持自动计算”警告并禁止直接确认
- **AND** 用户只有在明确修改为个人实际承担的普通支出后，才能继续确认

#### Scenario: 用户说“从银行卡转到微信”

- **WHEN** 识别文本表示账户间转账而非收入或支出
- **THEN** 系统标记为当前 MVP 不支持
- **AND** 不创建普通收入或支出记录
- **AND** 提供返回手工记账或放弃该 item 的操作
