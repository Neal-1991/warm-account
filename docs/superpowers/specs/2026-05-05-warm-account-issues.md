# 暖账小程序 V1 问题记录

**版本：** V1.0
**日期：** 2026-06-04（更新：新增审核拒绝游客模式修复）
**状态：** 进行中

---

## 问题模板

```
| # | 优先级 | 标题 | 用例ID | 描述 | 复现步骤 | 期望结果 | 实际结果 | 截图 |

```

---

## 已记录问题

| # | 优先级 | 标题 | 用例ID | 描述 | 复现步骤 | 期望结果 | 实际结果 |
|---|---|---|---|---|---|---|---|
| 1 | 高 | cloud.getUserInfo is not a function | TC-001 | 点击登录时报错 | 点击"微信一键登录" | 正常登录 | cloud.getUserInfo 不存在 |
| 2 | 高 | 查询对象参数值不能均为undefined | TC-001 | 点击登录后弹框报错 | 点击"微信一键登录" | 正常登录 | context.OPENID 为 undefined |
| 3 | 中 | 我的页面没有显示微信头像和昵称 | TC-014 | 登录成功后查看我的页面 | 查看个人信息 | 显示头像和昵称 | 显示默认值"未登录" |

---

## 已修复问题

| # | 修复日期 | 问题描述 | 修复方案 |
|---|---|---|---|
| 1 | 2026-05-05 | cloud.getUserInfo is not a function | 使用 cloud.getWXContext().OPENID 替代不存在的 cloud.getUserInfo() |
| 2 | 2026-05-05 | 查询对象参数值不能均为undefined | 使用 cloud.getWXContext().OPENID 获取 openId |
| 3 | 2026-05-05 | 我的页面没有显示微信头像和昵称 | 添加用户信息持久化（app.js 添加 getUserInfo/setUserInfo 方法）+ 添加编辑功能 |
| 4 | 2026-05-05 | init-database 云函数缺少收入分类 | 将分类数据拆分为支出/收入，添加 type 字段，收入分类包括：工资、奖金、投资、兼职、闲置转卖 |
| 5 | 2026-05-06 | 分类选择器支出/收入未关联 | category云函数添加type过滤，add.js传递type，category-picker按type过滤大类和小类 |
| 6 | 2026-05-06 | 大类和小类没有关联 | init-database和login云函数中 `add()` 返回值 `id` 改为 `_id`，category-picker.wxml的 `wx:key` 和 `item.id` 改为 `item._id` |
| 7 | 2026-05-06 | 记一笔提交缺少categoryId | add.js 使用 `selectedCategory.id` 但组件返回的是 `categoryId`，修正字段名 |
| 8 | 2026-05-06 | 云函数add()返回id而非_id | book、record、category云函数中 `add()` 返回值 `id` 改为 `_id` |
| 9 | 2026-05-06 | 统计页分类显示为MongoDB _id | statistics.js 使用硬编码categoryNames，改为调用category云函数实时获取分类名称映射 |
| 10 | 2026-05-06 | 统计页占比显示1%而非100% | 百分比计算公式缺少乘以100，修复公式 |
| 11 | 2026-05-06 | 统计页饼图不显示（初步排查） | chartData和legend数据正常但饼图空白，初步排查ec-canvas组件或echarts渲染问题，最终由 #15 修复 |
| 12 | 2026-05-07 | 登录页需要勾选协议 | 添加checkbox勾选框，登录按钮需勾选后才能点击 |
| 13 | 2026-05-07 | 微信登录无法获取昵称头像 | 微信接口更新，登录时不再自动返回昵称头像，改为在"我的"页面提供"获取微信头像"按钮 |
| 14 | 2026-05-08 | 登录页勾选框勾选后不显示勾选标记 | checkbox color="#FFFFFF" 使勾号不可见，改为 #FF6B00 |
| 15 | 2026-05-08 | 统计页饼图不显示 | echarts.min.js是浏览器版，需要Canvas 2D节点+addEventListener桩函数；canvas缺id属性；ec初始为null |
| 16 | 2026-05-08 | 我的页编辑弹窗交互优化 | 将独立操作改为统一编辑表单：弹窗内直接编辑昵称、选择头像来源、保存按钮统一提交 |
| 17 | 2026-05-08 | 昵称输入不支持微信昵称一键填入 | input type="text" 无法使用微信昵称填充，改为 type="nickname" |
| 18 | 2026-05-08 | 家庭邀请流程不可用 | 全面重构邀请流程：分享卡片替代手动复制邀请码；加入前弹窗确认；加入时迁移历史数据+删除旧账本；邀请码1h有效期+一次性使用；登录云函数支持成员查询（`_.or`）；family页处理未登录暂存/有效/过期/已使用/已是成员/已在其他家庭等全场景 |
| 19 | 2026-05-09 | 头像昵称登出后丢失 | login 云函数新增 members 集合持久化 + updateProfile action；login 页优先使用云端 userInfo；mine 页保存时同步云端 |
| 20 | 2026-05-09 | 分类重复显示且无小类 | init-database 每次调用重复创建系统大类；category-picker 大类按名称去重 + 小类跨同名 _id 匹配 |
| 21 | 2026-05-09 | clear-test-data 遗漏 members 集合 | COLLECTIONS 数组添加 members |
| 22 | 2026-05-09 | 家庭成员显示为"成员1/成员2"+默认头像 | login 云函数新增 getMembers action；family.js 改为批量查询 members 集合获取真实昵称头像 |
| 23 | 2026-05-09 | 加入家庭后 B 的小类未迁移 | book/join 新增智能合并：同名同父合并（remap categoryId），不同名迁移 bookId |
| 24 | 2026-05-09 | 统计页按小类展示碎片化 | 改为按大类（父分类）聚合，构建 categoryId→父分类名映射，按金额降序排列 |
| 25 | 2026-05-09 | 已是成员点击邀请链接提示错误 | validateInviteCode 不传 openId，无法判断"已用"是本人还是他人；返回 already_member reason |
| 26 | 2026-05-09 | 首页记录图标和分类都显示餐饮 | index.js loadData() 硬编码 icon='📝' categoryName='餐饮'；改为先查分类构建映射再渲染 |
| 27 | 2026-05-09 | 加入家庭后统计页出现未分类 | book/join 中 col=books 被误用于查询 categories，导致 B 的小类从未迁移；改为 catCol |
| 28 | 2026-05-25 | 图片存储为临时路径，家庭成员无法查看 | 新建记录详情页（pages/detail/）；add.js 上传图片到云存储，记录中存 cloud file ID；首页记录卡片显示 📷 标记并支持点击跳转详情页 |
| 29 | 2026-05-25 | clear-test-data 未清理云存储图片 | 清理 records 前先收集所有 cloud file ID 并调用 cloud.deleteFile 删除，支持分批（最多50个/次） |
| 30 | 2026-05-25 | join 响应超时导致前端加入失败、弹窗不消失、bookId 未更新 | 云函数重排序（先加入成员再删旧账本）；前端 catch 中关闭弹窗 + 重新查询确认状态 |
| 31 | 2026-05-25 | 家庭成员间图片不可见 | record 云函数新增 getFileUrl action，通过 cloud.getTempFileURL 生成临时可访问 URL |
| 32 | 2026-05-28 | 头像选择后无法持久保留 | mine.js 保存前上传临时路径到云存储；login 云函数返回头像时 cloud:// 路径转 temp URL |
| 33 | 2026-05-28 | 已是成员点击邀请链接提示邀请无效 | join 成功后不再清空 inviteCode，保留码值供 validateInviteCode 查找到账本 |
| 34 | 2026-05-28 | 昵称更新后账本名称未同步 | mine.js 传递 bookId；login 云函数 updateProfile 检测所有者后同步更新账本名 |
| 35 | 2026-06-04 | 审核拒绝：一访问小程序就要求登录 | 改为游客模式：入口改为首页，未登录可浏览 Tab 和空状态，操作时按需引导登录（app.json / index.js / statistics.js / mine.js / login.js 共 7 个文件） |
| 36 | 2026-06-04 | 退出登录后我的页仍显示头像和昵称 | logout() 清除 userInfo（globalData + Storage）；重新登录后云函数从 members 集合恢复 |

---

## 遗留问题

| # | 优先级 | 问题描述 | 原因 | 解决方案 |
|---|---|---|---|---|
| 1 | 中 | record 云函数 update/delete 无所有权验证 | 未校验当前用户是否为记录创建者或账本管理员 | 云函数中校验 createdBy === openId 或 book.ownerId === openId |
| 2 | 中 | login 云函数 getMembers 未经验证 | 任何人可传入任意 memberIds 批量查询用户信息 | 限制仅返回与调用者同账本的成员信息 |
| 3 | 低 | utils/cloud.js 封装的 callFunction 未被前端使用 | 各页面直接调用 wx.cloud.callFunction | 统一改用 cloud.callFunction 以复用错误处理 |
| 4 | 低 | isTest 硬编码于 config.js | const isTest = true，上线前需手动修改 | 改为环境感知（如读取云开发环境变量） |
| 5 | 低 | 记录列表无分页 | .limit(500) 硬限制，活跃账本可能丢失早期记录 | 添加基于游标的滚动分页 |
| 6 | 低 | 登录页使用已弃用 API | open-type="getUserInfo" 在新版微信不再弹出授权窗口 | 改用 chooseAvatar + 新版登录方式 |
| 7 | 高 | 冷启动登录态丢失 | TC-014 | 小程序被微信回收后重新打开，显示为未登录状态，但"我的"页仍显示昵称 | 静置 30 分钟后重新打开小程序 | 正常显示已登录状态 | 显示未登录，但昵称可见 |
| 8 | 中 | 同日期记录排序不稳定 | TC-035 | 同一天多条记录显示顺序与录入顺序不一致 | 同一天录入多条记录后查看首页 | 按录入时间倒序排列 | 随机排列 |
| 9 | 低 | 图片存储无环境区分 | — | 测试环境上传的图片和正式环境共用同一云存储路径 | 在测试环境上传图片 | 图片有环境标签 | 无区分 |

---

## 已修复问题

| # | 修复日期 | 问题描述 | 修复方案 |
|---|---|---|---|
| ... | ... | ...（同上）| ... |
| 30 | 2026-06-07 | 冷启动登录态丢失 | app.js onLaunch 恢复 Storage→globalData；新增 getBookId/setBookId；login.js/family.js 统一使用 setBookId |
| 31 | 2026-06-07 | 同日期记录排序不稳定 | record/list 新增 .orderBy('createdAt', 'desc') |
| 32 | 2026-06-07 | 图片存储无环境区分 | add.js/mine.js 上传路径加 test/ 或 prod/ 前缀 |
| 33 | 2026-06-07 | 分类系统重构 | 每账本独立分类副本；大类/小类可增删改；支持大类记账；预设分类调整（支出16类/收入7类）；新增分类管理页；存量迁移 |

---

*测试完成后更新本文件*