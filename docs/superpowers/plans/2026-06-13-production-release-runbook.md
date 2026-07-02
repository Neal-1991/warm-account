# 暖账发布与腾讯审核操作手册

**更新日期：** 2026-07-02  
**项目目录：** `C:\Users\123\git\Ledger\.worktrees\warm-account`

本项目测试和生产共用一个云开发环境，通过集合后缀区分：

```text
测试：*_test
生产：*_prod
```

正常发布按下面步骤顺序执行。任何一步失败，修复后再继续。

## 1. 切换测试环境

修改 `miniprogram/utils/config.js`：

```js
const isTest = true
```

确认 `miniprogram/utils/env.js` 中的云环境 ID 正确：

```js
module.exports = {
  env: 'cloud1-2gaj8t3s919e662e',
  appId: 'wx91ea4c0ab404f9bc'
}
```

在微信开发者工具重新编译，Console 应显示：

```text
[暖账] 当前环境: 测试 (suffix: _test)
```

## 2. 执行本地测试

在 PowerShell 执行：

```powershell
Set-Location C:\Users\123\git\Ledger\.worktrees\warm-account
npm test
```

当前预期：

```text
tests 47
pass 47
fail 0
```

然后在微信开发者工具执行一次“编译”和“代码质量”检查，确认：

- 主包小于 1.5 MiB。
- 图片单文件小于 200 KiB。
- Console 没有红色错误。
- `lazyCodeLoading` 仍为 `requiredComponents`。

## 3. 创建数据库集合和索引

进入微信开发者工具“云开发 → 数据库”。

确认以下集合均存在：

```text
books_test
records_test
categories_test
members_test
budgets_test

books_prod
records_prod
categories_prod
members_prod
budgets_prod
```

缺少哪个就手工创建哪个，不要创建无后缀集合。

必须创建以下索引：

| 集合 | 索引 |
|---|---|
| `budgets_test` | `bookId ASC + month ASC`，唯一索引 |
| `budgets_prod` | `bookId ASC + month ASC`，唯一索引 |
| `records_test` | `bookId ASC + date DESC + createdAt DESC` |
| `records_prod` | `bookId ASC + date DESC + createdAt DESC` |

如果云函数运行时提示缺少其他索引，按错误信息中的字段补充即可。

## 4. 上传云函数

在开发者工具中右键云函数目录，选择：

```text
上传并部署：云端安装依赖
```

按顺序上传：

1. `init-database`
2. `login`
3. `category`
4. `budget`
5. `record`
6. `book`
7. `clear-test-data`
8. `init-collections`

上传后进入云开发控制台，确认 8 个函数更新时间均为本次时间。

同时确认云端超时：

| 云函数 | 超时 |
|---|---:|
| `login`、`book`、`category`、`budget`、`init-database` | 20 秒 |
| `record` | 10 秒 |
| `init-collections` | 3 秒 |
| `clear-test-data` | 60 秒 |

开发者工具上传不一定会同步超时，因此需要在云开发控制台手工复核。

## 5. 清空测试数据

该操作只清空 `_test` 数据。

在开发者工具 Console 执行：

```js
wx.cloud.callFunction({
  name: 'clear-test-data',
  data: { target: 'test' }
}).then(res => console.log(
  '测试清理结果:',
  JSON.stringify(res.result, null, 2)
))
```

确认以下内容清理成功：

```text
books_test
records_test
categories_test
members_test
budgets_test
测试环境账目图片和头像
```

然后清除开发者工具缓存并重新编译。

## 6. 测试环境验收

使用两个微信账号 A、B 测试。

### 基础功能

- 游客打开后不强制登录。
- 主动登录成功，自动创建账本和分类。
- 支出 16 个大类、收入 7 个大类。
- 新增支出、收入、图片记录正常。
- 首页、统计、详情正常。
- 修改昵称头像后重新打开仍能恢复。
- 主动退出后重新打开保持游客状态。

### 预算功能

- 未设置预算时，首页和统计页显示正确。
- 管理员可设置总预算和分类预算。
- 小类支出正确归入父级大类预算。
- 首次跨过 80% 显示预警。
- 达到 100% 显示“预算已用完”。
- 超过 100% 显示超支金额。
- 收入不占用预算。
- 可复制上月预算。
- 历史月份只读。
- 删除预算不影响账目。
- 被当前或未来预算引用的大类不能删除。

### 家庭功能

- A 邀请 B 加入家庭成功。
- A、B 的记录和分类正确合并。
- A 的家庭预算保留，B 原个人账本预算被清理。
- B 可以查看预算，但不能修改。
- 加入过程没有重复成员、记录或分类。

### 首页与版本更新

- 有本地登录态时，首页记录优先显示，不再出现 10 秒级等待。
- 首页记录按日期分组，今天/昨天使用相对文案，其余记录显示具体日期。
- 日期分组右侧显示当天收入和支出小计。
- 关于页版本号来自 `miniprogram/utils/version.js`。
- 新版本准备完成时显示不可取消的更新提示；下载失败时提示关闭并重新打开。

测试完成后查看云函数日志，确认没有超时、缺索引或未捕获异常。

## 7. 切换生产并上传体验版

修改 `miniprogram/utils/config.js`：

```js
const isTest = false
```

重新编译，Console 必须显示：

```text
[暖账] 当前环境: 生产 (suffix: _prod)
```

确认 `miniprogram/utils/version.js` 中的版本号与本次上传版本一致。关于页会从该共享配置读取版本号，不再手动修改 `about.wxml`。

然后：

1. 在开发者工具点击右上角“上传”。
2. 填写相同的版本号。
3. 填写版本说明。
4. 在微信公众平台“版本管理”中将该版本设为体验版。

版本说明示例：

```text
修复预算复制和分类超支提醒问题，优化记账成功后的预算提示、首页加载速度和账目日期分组，并增加版本更新机制。
```

## 8. 生产体验版简单验证

使用刚上传的体验版，只做以下检查：

1. 游客可以直接进入首页。
2. 主动登录成功。
3. 分类初始化正常。
4. 设置一个临时预算。
5. 新增一条小额支出。
6. 检查首页、预算页和统计页。
7. 删除测试记录和临时预算。
8. 关闭后重新打开，确认登录态恢复。
9. 在数据库确认数据写入的是 `_prod` 集合。
10. 查看云函数日志，确认没有错误。

生产环境不要重复执行完整 A/B 家庭合并、邀请过期或中断测试。

## 9. 提交腾讯审核

登录[微信公众平台](https://mp.weixin.qq.com/)：

1. 进入“版本管理”。
2. 找到刚完成生产验证的体验版本。
3. 点击“提交审核”。
4. 核对服务类目和用户隐私保护指引。
5. 确认隐私指引包含昵称、头像、账目图片、账目、预算和家庭协作数据。
6. 提交审核。

审核操作说明可填写：

```text
小程序打开后可直接以游客状态浏览首页、统计和“我的”页面，不强制登录。

体验记账和预算功能时，请点击首页“记一笔”、预算卡片或“我的-预算管理”，再主动登录并勾选用户协议与隐私政策。

登录后会自动创建个人账本。管理员可以设置月度总预算和分类预算，首页和统计页会展示预算进度。
```

## 10. 审核通过后发布

1. 在微信公众平台找到审核通过的版本。
2. 点击“发布”。
3. 正式版发布后重新检查游客首页、登录、记账、预算和统计。
4. 新增并删除一条小额测试记录。
5. 确认写入 `_prod`，然后清理测试数据。

## 最终检查清单

- [ ] `npm test` 全部通过。
- [ ] 10 个数据库集合存在。
- [ ] 预算唯一索引和记录排序索引存在。
- [ ] 8 个云函数已上传。
- [ ] 云函数超时正确。
- [ ] `_test` 功能测试通过。
- [ ] 体验版为 `isTest=false`。
- [ ] 生产简单验证通过。
- [ ] 用户协议和隐私保护指引与实际功能一致。
- [ ] 提交的是已经验证过的同一个体验版本。
