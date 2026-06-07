# 暖账小程序开发沟通记录

**日期：** 2026-06-04（更新：审核拒绝强制登录，改为游客模式）
**状态：** 审核被拒 — 修复游客模式后重新提审
**下次继续：** 读取本文件获取上下文

---

## 一、项目背景

暖账小程序是一个微信云开发账本应用，采用小程序端 + 云函数架构。

**工作目录：** `C:\Users\123\git\Ledger\.worktrees\warm-account\`

**相关项目参考：** `C:\Users\123\git\BloomBook\`（功能参考）

**云开发环境ID：** `cloud1-2gaj8t3s919e662e`

---

## 二、问题处理原则（五步走）

1. **排查问题** - 定位问题原因和位置
2. **解释原因** - 说明为什么会出现这个问题
3. **提出方案** - 建议修复方案（可选多个）
4. **等待确认** - 等用户确认修复方案后再进行修复
5. **更新文档** - 修复完成后更新测试案例、问题记录、设计文档

---

## 三、已解决问题

### 1. 登录模块问题

| # | 问题 | 原因 | 修复方案 |
|---|---|---|---|
| 1 | cloud.getUserInfo is not a function | wx-server-sdk 没有 getUserInfo() 方法 | 使用 `cloud.getWXContext().OPENID` 获取 openId |
| 2 | 查询对象参数值不能均为undefined | `context.OPENID` 为 undefined | 同上，使用 `wxContext.OPENID` |
| 3 | collection not exists (books) | 云函数使用集合名没有加后缀 | 前端传递 `isTest` 参数，云函数根据后缀拼接集合名 |

### 2. 集合环境后缀问题

**问题：** 云函数直接使用 `books`、`records`、`categories` 集合名，没有区分测试/生产环境

**修复：** 所有云函数和前端页面添加 `isTest` 参数支持

**已修改文件：**
- 云函数：`login`、`book`、`record`、`category`、`init-database`
- 前端页面：`login`、`index`、`add`、`family`、`statistics`

**集合命名规则：**
- 测试环境：`_test` 后缀（如 `books_test`）
- 生产环境：`_prod` 后缀（如 `books_prod`）

### 3. 我的页面用户信息显示问题

**问题：** 登录成功后，我的页面没有显示微信头像和昵称

**原因：** 缺少用户信息持久化机制

**修复：**
- `app.js` 添加 `getUserInfo()`、`setUserInfo()`、`getOpenId()`、`setOpenId()` 方法
- `login.js` 登录成功后调用 `setUserInfo()` 持久化保存
- `mine.js` 添加编辑弹窗支持修改头像和昵称
- `mine.wxml` / `mine.wxss` 添加编辑弹窗 UI 和样式

### 4. 箭头图标乱码问题

**问题：** WXML 文件中的 `&gt;` 和 `&lt;` HTML 实体编码显示乱码

**修复：** 替换为直接的超几何符号 `›` 和 `‹`

**已修改文件：**
- `components/month-selector/month-selector.wxml`
- `pages/mine/mine.wxml`
- `pages/about/about.wxml`
- `pages/add/add.wxml`

### 5. 月份选择器 NaN 问题

**问题：** 点击向左箭头显示 `NaN-Nan`

**原因：** 组件初始化时 `currentMonth` 可能为空

**修复：** 添加 `observers` 监听属性变化，添加空值检查

**已修改文件：** `components/month-selector/month-selector.js`

---

## 四、待解决问题

### 1. init-database 云函数问题

**状态：** ✅ 已修复

**问题：**
- `categories` 集合没有任何数据
- 只有支出分类，缺少收入分类
- 大类和小类没有关联（`parentId` 均为 `undefined`）

**修复内容：**
- 将分类数据拆分为 `EXPENSE_CATEGORIES`（8个）和 `INCOME_CATEGORIES`（5个）
- 每个分类添加 `type` 字段：`expense`（支出）或 `income`（收入）
- 收入分类：工资、奖金、投资、兼职、闲置转卖
- 修复 `add()` 返回值 `id` → `_id`，确保 `parentId` 正确关联

**已修改文件：**
- `cloudfunctions/init-database/index.js` - 添加收入分类和type字段，修复 `id` → `_id`
- `cloudfunctions/category/index.js` - list接口添加type过滤，addChild继承父分类type，修复 `id` → `_id`
- `cloudfunctions/login/index.js` - 修复 `add()` 返回值 `id` → `_id`
- `cloudfunctions/book/index.js` - 修复 `add()` 返回值 `id` → `_id`
- `cloudfunctions/record/index.js` - 修复 `add()` 返回值 `id` → `_id`
- `cloudfunctions/clear-test-data/` - 新建云函数用于清空测试数据
- `miniprogram/pages/add/add.js` - 切换类型时重新加载对应分类，传type参数
- `miniprogram/components/category-picker/category-picker.js` - 添加type属性过滤
- `miniprogram/components/category-picker/category-picker.wxml` - 传入type属性，修复 `id` → `_id`

**待操作：**
1. 在微信开发者工具中重新上传云函数：`init-database`、`login`、`category`
2. 调用 `clear-test-data` 清空云端旧数据
3. 退出登录后重新登录，触发 `init-database` 创建分类
4. 测试验证大类和小类关联是否正确

### 2. 记一笔提交失败

**状态：** ✅ 已修复

**问题：** 上传图片后点击提交，提示 `missing required fields: type, amount, categoryId`

**原因：** `add.js` 中使用 `selectedCategory.id`，但 `category-picker` 组件返回的字段名是 `categoryId`

**修复内容：**
- `miniprogram/pages/add/add.js` 第125行和第159行：`.id` → `.categoryId`

### 3. 统计页分类名称显示问题

**状态：** ✅ 已修复

**问题：** 统计页面图表下方显示分类名称的位置显示的是一串 MongoDB `_id` 字符（如 `65f1a2b3c4d5e6f7a8b9c0d1`），不是中文分类名

**原因：** 硬编码的 `categoryNames` 对象使用 `'cat-food'` 这类 key，但数据库返回的是 MongoDB `_id`，无法匹配

**修复内容：**
- `miniprogram/pages/statistics/statistics.js` 的 `loadData()` 方法
  - 先调用 `category` 云函数获取分类列表，构建 `{_id: name}` 映射
  - 再调用 `record` 云函数获取记录，按分类聚合后用映射替换硬编码名称

**已修改文件：**
- `miniprogram/pages/statistics/statistics.js`

**待测试：**
1. 刷新统计页，验证分类名称是否正确显示（如"餐饮"、"交通"等）
2. 验证图表和图例中的分类名称都是中文而非 ID

### 4. 统计页占比显示错误

**状态：** ✅ 已修复

**问题：** 单项分类占比应显示100%却显示1%

**原因：** 百分比计算公式缺少乘以100
- 错误公式：`(parseFloat(d.value) / (total / 100)).toFixed(1)`
- 正确公式：`(parseFloat(d.value) / (total / 100) * 100).toFixed(1)`

**修复内容：**
- `miniprogram/pages/statistics/statistics.js` 第143行

### 5. 统计页图表不显示

**状态：** 🔍 排查中

**现象：**
- `chartData` 和 `legend` 数据已正确加载（如 `{name: "话费", value: "170.00"}`）
- 图例区域显示正常（如 "话费 100.0%"）
- 但饼图区域一片空白，无图表渲染

**已确认：**
- `bookId` 和 `openId` 正常
- 云函数 `category` 和 `record` 返回数据正常
- 数据结构正确

**待排查：**
- `ec-canvas` 组件初始化问题
- `echarts` 渲染逻辑问题

**下一步：**
1. 检查 `ec-canvas` 组件的 `init()` 方法是否被正确调用
2. 检查 `chart.setOption()` 是否生效
3. 检查 `chart-container` 的 CSS 样式是否有问题

---

## 七、问题10：家庭邀请流程重构（2026-05-08）

**状态：** ⚠️ 待部署（云函数需重新上传）

**背景：** 原有邀请码流程存在根本性缺陷：
- 每个用户登录后自动创建账本，`isMember` 永远为 true，"加入家庭"区域永远隐藏
- 邀请码 24 小时有效可被多人使用（设计文档要求一次性）
- 加入后无数据迁移（设计文档要求"婚后合并"）
- `book/get` 只查 ownerId，成员查不到共享账本

**新方案：分享卡片 + 弹窗确认**

流程：
1. 管理员在家庭页点击"邀请成员"按钮（`open-type="share"`）
2. 生成 6 位邀请码（1 小时有效），嵌入分享卡片 `path`
3. 管理员通过微信分享卡片给好友
4. B 点击卡片 → family 页 `onLoad` 获取 `inviteCode` 参数
5. 判断登录状态：未登录则暂存 pendingCode → 跳登录 → 登录后回跳
6. 验证邀请码 → 弹确认窗 → 加入/暂不加入
7. 加入后迁移 B 的历史记录 → 删除旧账本 → 更新 bookId

**全场景处理：**

| B 状态 | 码状态 | 处理 |
|--------|--------|------|
| 未登录 | 有效 | 暂存 → 登录 → 回跳 → 弹确认窗 |
| 未登录 | 过期/已用/无效 | 暂存 → 登录 → 回跳 → 提示对应错误 |
| 已登录独有账本 | 有效 | 弹确认窗 |
| 已登录独有账本 | 过期/已用/无效 | 提示对应错误 |
| 已是该家庭成员 | 已被使用 | 提示"你已是该家庭账本的成员" |
| 已是其他家庭成员 | 有效 | 提示"已有其他家庭，暂不支持切换" |
| 已是管理员 | 有效 | 提示"你已是该账本管理员" |

暂不加入：弹窗关闭，邀请码仍有效（1 小时内），B 需重新点击卡片加入。

**修改文件：**
- `cloudfunctions/book/index.js` — 全面重构
  - `get`：查询条件改为 `_.or([{ownerId}, {memberIds}])` 支持成员查找
  - `generateInviteCode`：有效期从 24h 改为 1h；新增 `inviteCodeUsedBy: null`
  - 新增 `validateInviteCode`：验证码有效性，返回账本名
  - `join`：增加数据迁移（records.bookId 批量更新）+ 旧账本删除 + 一次性失效（`inviteCodeUsedBy`）
- `cloudfunctions/login/index.js` — 查询条件改为 `_.or`，B 登录不再误创建新账本
- `miniprogram/pages/family/family.js` — 全面重写
  - `onLoad` 处理 `inviteCode` 参数；`onShow` 处理 `pendingInviteCode`
  - `onShareAppMessage` 生成邀请码并嵌入分享路径（Promise 支持异步生成）
  - `validateAndShowDialog` / `onConfirmJoin` / `onDismissJoin` / `showTipDialog` / `onDismissTip`
  - 移除旧方法：`generateInviteCode`、`copyInviteCode`、`onCodeInput`、`joinFamily`
- `miniprogram/pages/family/family.wxml` — "邀请成员"分享按钮 + 确认弹窗 + 提示弹窗，移除手动输入区域
- `miniprogram/pages/family/family.wxss` — 弹窗遮罩/卡片/按钮组样式
- `miniprogram/pages/login/login.js` — 登录成功后检查 `pendingInviteCode`，存在则回跳 family 页

**待操作：**
1. 重新上传云函数：`book`、`login`
2. 测试完整流程（见 TC-017 ~ TC-022）

---

## 八、用户反馈问题（2026-05-07）

### 问题1：登录页需要勾选协议

**状态：** ✅ 已修复

**修改内容：**
- `login.wxml` - 添加 checkbox 勾选框，"我已阅读并同意以上协议"
- `login.wxss` - 添加 checkbox 样式，登录按钮禁用状态样式
- `login.js` - 添加 `agreed` 状态和 `onAgreementChange` 方法，登录按钮需勾选后才能点击

---

### 问题2：微信登录无法获取昵称头像

**状态：** ✅ 已修复

**背景：** 微信接口更新，不再允许登录时自动获取昵称头像

**修改内容：**
- `mine.wxml` - 添加"获取微信头像"按钮，使用 `open-type="chooseAvatar"`
- `mine.js` - 添加 `onChooseWechatAvatar` 方法处理微信头像选择
- `mine.wxss` - 添加 `.wechat-option` 样式

---

### 问题3：首页记录卡片显示

**状态：** ✅ 部分修复（2026-05-09）

**反馈：** 记账后在首页显示的记录只显示大类和备注，没有显示小类

**已修复：** 图标和分类名称硬编码为 📝/餐饮 → 改为从数据库实时查询分类映射，正确显示对应大类的图标和名称

**未修复：** 显示小类名称（优先级低，用户暂不要求）

---

### 问题4：统计页图表问题

**状态：** 部分修复

| 子问题 | 状态 |
|--------|------|
| 分类显示为 MongoDB _id | ✅ 已修复 |
| 占比显示 1% 而非 100% | ✅ 已修复 |
| 饼图不显示 | ✅ 已修复（WxCanvas + setCanvasCreator） |

---

### 问题5：昵称更新后历史账单记账人同步

**状态：** ✅ 已修复（见下文问题9）

---

### 问题6：登录页勾选框勾选标记不可见（2026-05-08）

**状态：** ✅ 已修复

**原因：** `<checkbox color="#FFFFFF">` 勾选后填充色和勾号均为白色

**修复：** 改为 `color="#FF6B00"`，勾选后显示橙色背景 + 白色勾号

**修改文件：** `miniprogram/pages/login/login.wxml`

---

### 问题7：统计页饼图不显示（2026-05-08）

**状态：** ✅ 已修复

**根因：** `echarts.min.js` 是标准浏览器版，内部依赖 DOM API（`document.createElement`、`getContext`、`attachEvent` 等），微信 Canvas 1.0 的 `wx.createCanvasContext` 返回的 CanvasContext 对象没有这些方法，直接导致初始化失败。
- 此外 canvas 缺少 `id` 属性导致选择器查不到元素
- `ecChart` 初始为 `null`，`ready()` 只触发一次错过初始化

**修复过程（三次迭代）：**
1. 第一次：改用 Canvas 2D + 补 `addEventListener` 桩函数 → `attachEvent` 报错
2. 第二次：再补 `attachEvent`/`detachEvent` → `document.createElement` 报错
3. 第三次（最终方案）：使用 `echarts-for-weixin` 的 `WxCanvas` 包装器 + `echarts.setCanvasCreator()` 注册，让 ECharts 通过包装器与微信 Canvas 通信

**最终方案：**
- `ec-canvas.wxml` — 添加 `type="2d"` 和 `id="ec-canvas"`
- `ec-canvas.js` — 新增 `WxCanvas` 类（包装 canvas 节点，提供 `getContext`、`attachEvent`/`detachEvent` 空实现）；改用 Canvas 2D API 获取节点；通过 `echarts.setCanvasCreator()` 注册；添加 `ec` 的 `observer` 支持延迟初始化；添加 touch 事件转发（饼图可点击交互）

**修改文件：**
- `miniprogram/components/ec-canvas/ec-canvas.wxml`
- `miniprogram/components/ec-canvas/ec-canvas.js`

---

### 问题8：我的页编辑弹窗重新设计（2026-05-08）

**状态：** ✅ 已修复

**改动内容：**
| 原来 | 现在 |
|------|------|
| 3个操作选项（同步微信头像/从相册选择/修改昵称）+ 额外标签 | 仅头像（点击 `chooseAvatar` 选来源）+ 昵称输入框 |
| "头像来源"区域显示两个选择按钮 | 头像底部加半透明遮罩"📷 更换头像"提示可点击 |
| 无保存按钮（点完直接生效） | "取消"+"保存"按钮统一提交 |

**设计思路：** 点击头像本身触发 `open-type="chooseAvatar"`（自带微信头像/拍照/从相册选择），因此无需额外按钮。头像右下角遮罩提示让用户知道可点击。

**修改文件：**
- `miniprogram/pages/mine/mine.wxml`
- `miniprogram/pages/mine/mine.wxss`
- `miniprogram/pages/mine/mine.js`

---

### 问题9：昵称更新后同步历史账单记账人（2026-05-08）

**状态：** ✅ 已修复

**背景：** 用户在"我的"页修改昵称后，历史账单中的 `createdByName` 仍显示旧昵称

**修复：**
- `cloudfunctions/record/index.js` — 新增 `updateCreatedByName` action，根据 `openId` 批量更新该用户所有历史记录的 `createdByName`
- `miniprogram/pages/mine/mine.js` — 保存昵称时，昵称有变则调用云函数同步

**注意：** 云函数 `record` 需要重新上传并部署

---

### 问题10：头像昵称登出后丢失（2026-05-09）

**状态：** ✅ 已修复

**背景：** 用户在"我的"页编辑头像和昵称后，退出登录再重新登录，头像和昵称变回微信默认值

**根因：**
- 头像和昵称仅存储在客户端 Storage，没有服务端持久化
- `login.js` 登录成功时，无条件用微信 `getUserInfo` 返回值（已是默认值"微信用户"+灰色头像）覆盖 Storage 中用户编辑过的数据

**修复：**
- `cloudfunctions/login/index.js` — 主流程中查询/创建 `members` 集合记录，返回持久化的 `userInfo`；新增 `updateProfile` action 供 mine 页调用
- `miniprogram/pages/login/login.js` — 优先使用云函数返回的 `userInfo`（`res.result.userInfo`），微信返回值为 fallback
- `miniprogram/pages/mine/mine.js` — `onSaveProfile()` 中同步调用 `login` 云函数 `updateProfile` 持久化到 `members` 集合
- `cloudfunctions/init-collections/index.js` — 集合列表添加 `members`

---

### 问题11：分类重复显示且无小类（2026-05-09）

**状态：** ✅ 已修复

**背景：** A 用户邀请 B 加入家庭（B 未登录），B 登录后点"暂不加入"，然后去"记一笔"选择分类，每个大类重复显示两遍，且不显示任何小类

**根因：**
- `init-database` 每次被调用都创建 `bookId: null` 的系统大类，不管是否已存在。A 登录时创建了一份，B 登录时又创建了一份，导致每个大类有两个副本
- `category-picker` 的 `updateChildren` 只用点击的大类 `_id` 去匹配小类 `parentId`，如果点到 A 组大类的副本，B 组小类的 `parentId` 不匹配，就显示为空

**修复：**
- `cloudfunctions/init-database/index.js` — 创建前检查系统大类（`bookId: null`）是否已存在，已存在则复用 `_id` 不再重复创建；检查该账本是否已有小类，有则跳过
- `miniprogram/components/category-picker/category-picker.js` — `initCategories` 按 `name` 去重显示大类；`updateChildren` 收集同名大类的所有 `_id`，用它们去匹配小类的 `parentId`

**待操作：**
- 重新上传云函数 `init-database`
- 清理旧数据：运行 `clear-test-data` + 微信开发者工具清除数据缓存 + 重新登录

---

### 问题12：clear-test-data 遗漏 members 集合（2026-05-09）

**状态：** ✅ 已修复

**背景：** 新增 `members` 集合用于持久化用户头像昵称，但 `clear-test-data` 云函数的清理列表没有更新

**修复：** `cloudfunctions/clear-test-data/index.js` — COLLECTIONS 数组添加 `'members'`

**注意：** `clear-test-data` 只清云端数据，清完后需在微信开发者工具"清除数据缓存"同步清除客户端 Storage

---

## 五、数据库集合

**已创建集合：**
- `books_test`、`books_prod`
- `records_test`、`records_prod`
- `categories_test`、`categories_prod`

**集合后缀规则：**
- 测试环境：`isTest=true` → `_test`
- 生产环境：`isTest=false` → `_prod`

---

## 六、测试案例

测试文档：`docs/superpowers/specs/2026-05-05-warm-account-testcases.md`

**TC-001 登录模块测试：**
- [x] 登录页正确显示
- [ ] 点击登录后显示微信授权 ← 待测试
- [ ] 授权成功后自动创建账本 ← 待测试
- [ ] 跳转到首页 ← 待测试
- [ ] 控制台输出环境信息 ← 待验证

**TC-014 我的页面：**
- [ ] 显示头像（微信头像或默认） ← 待测试
- [ ] 显示昵称 ← 待测试
- [ ] 背景为橙色渐变 ← 待测试

---

## 七、重要技术点

### openId 获取方式
```javascript
// 微信云开发云函数中获取 openId 正确方式
const wxContext = cloud.getWXContext()
const openId = wxContext.OPENID
```

### 集合名后缀处理
```javascript
// 云函数中根据 isTest 参数拼接集合名
const getCollectionName = (event, name) => {
  const suffix = event.isTest !== undefined ? (event.isTest ? '_test' : '_prod') : '_test'
  return `${name}${suffix}`
}
```

### 前端传递 isTest 参数
```javascript
// 前端调用云函数时传递 isTest
wx.cloud.callFunction({
  name: 'login',
  data: { nickName, avatarUrl, isTest: config.isTest }
})
```

### 用户信息持久化
```javascript
// app.js
getUserInfo() {
  if (!this.globalData.userInfo) {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) this.globalData.userInfo = userInfo
  }
  return this.globalData.userInfo
},
setUserInfo(userInfo) {
  this.globalData.userInfo = userInfo
  wx.setStorageSync('userInfo', userInfo)
}
```

---

## 九、下次继续时操作

1. **读取本文件** 了解上下文
2. **读取问题处理原则** 确认流程
3. 重新上传所有已修改云函数：`book`、`login`、`init-database`、`clear-test-data`
4. 云开发控制台创建 `members_test`、`members_prod` 集合
5. 清理旧测试数据：运行 `clear-test-data` → 微信开发者工具清除数据缓存 → 重新登录
6. 测试完整邀请流程：A 分享卡片 → B 点击 → B 登录 → 弹确认窗 → 加入 → 验证分类/记录/成员显示
7. 测试分类合并：A 和 B 各自在同一大类下添加不同小类 → B 加入 → 验证记一笔中两个用户的小类都可见
8. 测试统计页：按大类显示饼图、金额和占比正确
9. 测试头像昵称持久化：编辑资料 → 退出登录 → 重新登录 → 验证保留

---


---

## 修复完成记录

**2026-05-05 问题1修复：init-database 云函数添加收入分类**

| 项目 | 内容 |
|------|------|
| 修改文件 | `cloudfunctions/init-database/index.js` |
| 修改内容 | 将 `CATEGORIES` 拆分为 `EXPENSE_CATEGORIES` 和 `INCOME_CATEGORIES`，添加 `type` 字段 |
| 支出分类 | 餐饮、交通、购物、医疗、教育、娱乐、居住、人情（共8大类） |
| 收入分类 | 工资、奖金、投资、兼职、闲置转卖（共5大类） |
| 待操作 | 重新上传云函数 + 删除云端旧数据 + 重新登录测试 |

**2026-05-09 问题10修复：头像昵称服务端持久化**

| 项目 | 内容 |
|------|------|
| 修改文件 | `cloudfunctions/login/index.js`, `miniprogram/pages/login/login.js`, `miniprogram/pages/mine/mine.js`, `cloudfunctions/init-collections/index.js` |
| 修改内容 | login 云函数新增 `updateProfile` action + 主流程 upsert members 集合并返回 userInfo；login 页优先使用云端 userInfo；mine 页保存时同步云端 |
| 待操作 | 重新上传云函数 `login` + 云开发控制台创建 `members_test`、`members_prod` 集合 |

**2026-05-09 问题11修复：分类重复显示且无小类**

| 项目 | 内容 |
|------|------|
| 修改文件 | `cloudfunctions/init-database/index.js`, `miniprogram/components/category-picker/category-picker.js` |
| 修改内容 | init-database 创建前检查已有系统大类并复用，防止重复；category-picker 大类按名称去重 + 小类跨同名 _id 匹配 |
| 待操作 | 重新上传云函数 `init-database` + 清空测试数据重新初始化 |

**2026-05-09 问题12修复：clear-test-data 遗漏 members 集合**

| 项目 | 内容 |
|------|------|
| 修改文件 | `cloudfunctions/clear-test-data/index.js` |
| 修改内容 | COLLECTIONS 数组添加 `'members'` |
| 待操作 | 重新上传云函数 `clear-test-data`

**2026-05-09 问题15修复：已是成员点击邀请链接提示错误**

| 项目 | 内容 |
|------|------|
| 修改文件 | `miniprogram/pages/family/family.js`, `cloudfunctions/book/index.js` |
| 修改内容 | validateInviteCode 新增 openId 参数；inviteCodeUsedBy 存在时先检查 openId 是否已是 memberIds 成员，是则返回 already_member；family.js 传递 openId |
| 待操作 | 重新上传云函数 `book` |

**2026-05-09 问题16修复：首页记录图标和分类都显示餐饮**

| 项目 | 内容 |
|------|------|
| 修改文件 | `miniprogram/pages/index/index.js` |
| 修改内容 | loadData() 改为先查 category 云函数构建 categoryId→{parentName, icon} 映射，再查 record 云函数，用映射填充每条记录的 icon 和 categoryName（而非硬编码 📝/餐饮） |
| 待操作 | 无（前端代码，编译即生效） |

**2026-05-09 问题17修复：加入家庭后统计页出现未分类**

| 项目 | 内容 |
|------|------|
| 修改文件 | `cloudfunctions/book/index.js` |
| 修改内容 | join action 中新增 catCol=collectionName('categories')，将 4 处误用 col(books) 的 categories 查询/更新/删除改为 catCol，确保 B 的小类正确迁移/合并到目标账本 |
| 待操作 | 重新上传云函数 `book` + 清空测试数据重新测试完整邀请流程 |

---

### 问题13：家庭成员显示为"成员1/成员2"+默认头像（2026-05-09）

**状态：** ✅ 已修复

**背景：** B 加入家庭后，B 看 A 显示"成员1"+默认头像，A 看 B 显示"成员2"+默认头像

**根因：** `family.js` 的 `loadMembers()` 对非当前用户的成员硬编码昵称为 `成员${index + 1}`，头像为空字符串

**修复：**
- `cloudfunctions/login/index.js` — 新增 `getMembers` action，批量查询 members 集合获取真实资料
- `miniprogram/pages/family/family.js` — `loadMembers()` 调用云函数批量查询；角色通过 `book.ownerId` 判断而非数组位置；云函数返回空时有 fallback

---

### 问题14：加入家庭后 B 的小类未迁移（2026-05-09）

**状态：** ✅ 已修复

**背景：** B 加入 A 的家庭账本后，B 自己添加的小类没有被迁移到目标账本，导致 B 的旧记录 categoryId 指向孤立数据

**修复（方案 B 智能合并）：**
- `cloudfunctions/book/index.js` `join` action — 在迁移记录之前：
  1. 查询 B 的小类（`bookId: userBook._id, parentId != null`）
  2. 查询 A 的小类，构建 `"parentId:name"` 查找表
  3. 同名同父 → 合并：B 的记录 `categoryId` remap 到 A 的分类，删除 B 的重复分类
  4. 不同 → 迁移：`bookId` 改为目标账本

---

### 设计变更：统计页改为按大类聚合（2026-05-09）

**状态：** ✅ 已实现

**背景：** 按小类统计在合并场景下碎片化严重，按大类统计更清晰，且自动解决 A/B 小类汇总问题

**修改：**
- `miniprogram/pages/statistics/statistics.js` — 构建 `categoryId → 父分类名` 映射，`renderChart` 按父分类名聚合金额，按金额降序排列

---

## 十一、图片云存储 + 记录详情页（2026-05-25）

**状态：** ✅ 已实现

**背景：** 记录图片存储为临时文件路径，仅当前设备可见，家庭成员无法查看。且记录保存后没有查看图片的入口。

**改动内容：**

### 1. 图片上传到云存储
- `miniprogram/pages/add/add.js` — `onSubmit` 新增 `uploadImages` 方法，先并行上传图片到微信云存储，获取 cloud file ID 后再提交记录
- 上传路径格式：`record_images/{timestamp}_{random}.jpg`

### 2. 新建记录详情页
- 新建 `miniprogram/pages/detail/` 页面（wxml/wxss/js/json）
- 展示完整记录信息：分类图标+名称、金额、日期、备注、图片网格
- 图片点击调用 `wx.previewImage` 全屏浏览（支持多张滑动）
- 删除按钮：仅记录的创建者可见，确认后删除并返回首页
- `app.json` — 注册 detail 页面路由

### 3. 首页记录卡片增加图片标记
- `components/record-card/record-card.js` — 新增 `hasImages` 属性
- `components/record-card/record-card.wxml` — 有图片时在分类名旁显示 📷 标记
- `pages/index/index.wxml` — 包裹 `view` 监听记录点击跳转详情页
- `pages/index/index.js` — 新增 `onRecordTap` 方法，记录存入 `globalData._currentRecords`

### 设计文档更新
- `docs/superpowers/specs/2026-05-05-warm-account-design.md`
  - 新增"记录详情页"到页面列表和 UI 设计
  - 图片改为"上传至微信云存储后存入 cloud file ID"
  - 技术方案新增云存储说明
  - 关键决策新增图片存储和记录详情页

### 4. clear-test-data 同步清理云存储图片
- `cloudfunctions/clear-test-data/index.js` — 删除 records 前，先收集所有记录的 `images` 字段中的 cloud file ID，调用 `cloud.deleteFile()` 批量删除
- 支持分批删除（云存储 API 每次最多 50 个文件）
- 只删除以 `cloud://` 开头的有效 cloud file ID

### 5. 主包代码质量修复（2026-05-25）
**状态：** ✅ 已修复

**问题：** 微信开发者工具预览时代码质量报三项警告：
1. 主包大小超过 1.5M
2. 未启用组件按需注入
3. logo.png 超过 200K

**处理过程：**

**第一步（分包方案 — 已回退）：** 将统计页 + ECharts (965K) 移到 `subpkg/` 分包以减小主包体积。
- 结果：tabBar 的 pagePath 不能指向分包页面，预览报错 `need in ["pages"]`

**第二步（最终方案）：** 
- 统计页 + ec-canvas + echarts.min.js 移回主包（tabBar 要求）
- logo.png 从 914K 压缩到 38K（2048×2048 → 200×200，节省 ~876K）
- 启用 `lazyCodeLoading: "requiredComponents"`（组件按需注入）
- 主包估算大小：~1.32M（低于 1.5M 限制）

### 6. Join 超时导致前端显示加入失败（2026-05-25）

**状态：** ✅ 已修复

**问题：** A 邀请 B 加入账本，B 点击加入后提示"网络连接失败"，弹窗不消失，B 回到首页显示记录为空，重新进入家庭页后才显示加入成功。

**根因：**
- `join` 云函数执行操作较多（查询账本、迁移分类、迁移记录、删除旧账本、更新新账本），客户端容易响应超时
- 前端 `.catch()` 未关闭弹窗（`dialogType` 没置空）→ 弹窗一直显示
- `.catch()` 未更新 `bookId` → 首页仍用 B 旧账本 ID（已被删除）→ 记录显示为空
- 原云函数操作顺序：先删除旧账本再加入成员 → 中间状态数据丢失风险

**修复：**
- `cloudfunctions/book/index.js` — `join` 操作顺序改为：先加入成员（第4步），确认成功后删除旧账本（第5步）
- `miniprogram/pages/family/family.js` — `.catch()` 关闭弹窗 + 重新查询账本确认状态，成功则更新 `bookId`

### 7. 家庭成员间图片不可见（2026-05-25）

**状态：** ✅ 已修复

**问题：** A 和 B 各自记账时添加的图片，对方在详情页中看不到（图片一直转圈加载）。

**根因：** 微信云存储默认安全规则为仅上传者本人可读（`auth.uid == doc.uid`），直接在前端用 `cloud://` 文件 ID 展示时，其他用户无读取权限。

**修复：**
- `cloudfunctions/record/index.js` — 新增 `getFileUrl` action，通过云函数（管理员权限）调用 `cloud.getTempFileURL()` 生成临时可访问的 HTTP URL
- `miniprogram/pages/detail/detail.js` — 加载记录后自动将 `cloud://` 文件 ID 转为临时 HTTP URL 再展示

### 8. 头像选择后无法持久保留（2026-05-28）

**状态：** ✅ 已修复

**问题：** 在"我的"页点击头像使用 `chooseAvatar` 选择微信头像后，退出重新登录头像消失。

**根因：** `chooseAvatar` 返回的是本地临时路径（`wxfile://tmp_xxx`），前端直接存到 `members` 集合。下次登录云函数返回已过期的临时路径，头像无法显示。

**修复：**
- `miniprogram/pages/mine/mine.js` — `onSaveProfile` 检测如果是本地临时路径（`wxfile://` 或 `http://tmp/`），先上传到云存储 `avatars/` 目录，将 cloud file ID 存入 `members` 集合
- `cloudfunctions/login/index.js` — 登录主流程和 `getMembers` action 在返回头像 URL 时，检测 `cloud://` 路径并调用 `cloud.getTempFileURL()` 转为临时 HTTP  URL
- 云函数 `login` 需重新上传

### 9. 已是成员点击邀请链接提示邀请无效（2026-05-28）

**状态：** ✅ 已修复

**问题：** B 加入家庭账本后，再次点击分享链接，提示"邀请无效，邀请码不存在或已被撤回"而非"你已是家庭成员"。

**根因：** `book/index.js` join action 成功后清空了 `inviteCode` 字段（设为空字符串），导致再次点击链接时按邀请码查不到任何账本，返回 `not_found`。

**修复：**
- `cloudfunctions/book/index.js` — join 成功后不再清空 `inviteCode`，保留邀请码值；`validateInviteCode` 仍可通过邀请码定位账本，检测到用户已是成员后返回 `already_member`
- 注：下次生成新邀请码时会覆盖旧码，旧链接对其他用户仍无效
- 云函数 `book` 需重新上传

### 10. 昵称更新后账本名称未同步（2026-05-28）

**状态：** ✅ 已修复

**问题：** 用户在"我的"页修改昵称后，账本名称仍为旧昵称+"的账本"（如"张三的账本"修改昵称后不更新）。

**修复：**
- `miniprogram/pages/mine/mine.js` — `onSaveProfile` 调用 `updateProfile` 时传递 `bookId`
- `cloudfunctions/login/index.js` — `updateProfile` action 检测如果用户是账本所有者，同步更新账本名为 `{nickName}的账本`
- 云函数 `login` 需重新上传

### 11. 预设分类重组（2026-05-28）

**状态：** ✅ 已更新

**背景：** 用户要求重新调整系统预设的支出和收入分类，使分类更贴近实际使用场景。

**支出变更：**
- 新增"其他（其他支出）"— 兜底分类，用户可自行添加小类

**收入变更：**
| 变更项 | 原来 | 改为 |
|--------|------|------|
| 重命名 | 奖金（年终奖/项目奖/全勤奖） | 公积金（公积金提取） |
| 重命名+删小类 | 兼职（freelancing/咨询/外包） | 副业兼职（咨询/外包） |
| 新增 | — | 医疗报销（医疗报销） |
| 新增 | — | 其他（其他收入） |

**修改文件：**
- `cloudfunctions/init-database/index.js` — 更新 `EXPENSE_CATEGORIES` 和 `INCOME_CATEGORIES` 数组

**待操作：**
1. 重新上传云函数 `init-database`
2. 运行 `clear-test-data` 清空旧分类
3. 清除缓存后重新登录 → 初始化新分类
4. 验证 TC-032 / TC-032b

---

## 十二、审核拒绝：强制登录问题（2026-06-04）

**状态：** ✅ 已修复

**问题：** 提交腾讯审核后被拒绝，理由：不允许一访问小程序就要求用户登录，需让用户体验部分功能后再选择是否登录。三次申诉均未通过。

**修复方案（方案 A — 游客模式）：**

核心理念：让用户先进入首页，可以浏览 Tab 栏和空状态界面，需要操作时再引导登录。

**具体改动：**

| 文件 | 改动 |
|------|------|
| `app.json` | pages 数组首页置顶（`pages/index/index` 成为入口页，替代 `pages/login/login`） |
| `pages/index/index.js` | `loadData()` 未登录时清空数据展示空状态而非 return；`goToAdd()` 未登录跳转 login |
| `pages/statistics/statistics.js` | `loadData()` 未登录时清空图表展示空状态而非 return |
| `pages/mine/mine.js` | `loadUserInfo()` 新增 `isLoggedIn` 状态；`goToFamily()`/`onShowEditModal()` 未登录跳转 login；新增 `goToLogin()` |
| `pages/mine/mine.wxml` | 编辑按钮/退出按钮用 `isLoggedIn` 条件渲染；未登录时显示"微信一键登录"按钮 |
| `pages/mine/mine.wxss` | 新增 `.login-btn` 样式（橙色圆角按钮） |
| `pages/login/login.js` | `onLoad()`/`onLogin()` 登录后智能返回：有上一页则 `navigateBack()`，否则 `switchTab` 到首页 |

**不改动的部分：**
- 登录页 UI 和交互不变（仍需要勾选协议 + 微信授权）
- 云函数不变
- 邀请码流程不变
- 退出登录逻辑不变

**改动后用户流程：**
1. 打开小程序 → 首页（Tab 栏可见，空状态提示"本月暂无账目"）
2. 切换到统计页 → 空状态
3. 切换到我的页 → 显示登录按钮
4. 点击"+"或"家庭"或"登录" → 跳转登录页
5. 登录后 → 返回来源页面，数据正常加载

**云函数：** 无需修改。

**相关文档：**
- 设计文档：2.1 登录策略、6.1 登录流程
- 问题记录：新增 #35
- 测试用例：新增 TC-048 ~ TC-050

---

*最后更新：2026-06-04*

---

## 十三、退出登录后头像昵称未清除（2026-06-04）

**状态：** ✅ 已修复

**问题：** 退出登录后从登录页返回首页 → 进入我的页，显示"微信一键登录"按钮（未登录状态），但头像和昵称仍为前一个已登录用户的信息。

**根因：** `app.js` `logout()` 当初刻意保留了 `userInfo`（注释："不清除 userInfo，保留用户修改的头像和昵称"），担心退出重登后丢失。但现在 login 云函数已支持从 `members` 集合恢复持久化资料，本地保留不再必要。

**影响：**
- 逻辑矛盾：未登录状态却显示用户个性化资料
- 隐私隐患：他人拿到设备可看到上一位用户的头像和昵称

**修复：**
- `app.js` `logout()` — 清除 `this.globalData.userInfo` + `wx.removeStorageSync('userInfo')`

**改动文件：** 1 个（`miniprogram/app.js`，删 1 行注释 + 加 2 行清除代码）

---

## 十、分类系统全面改造（2026-06-07）

### 1. 冷启动登录状态丢失

**问题：** 小程序被微信回收后重新打开，`onLaunch()` 未从 Storage 恢复 globalData，各页面直接读 `globalData.xxx` 判断为未登录；`bookId` 从未持久化到 Storage。

**根因：**
- `app.onLaunch()` 只初始化云环境，未恢复 `openId`/`bookId`/`userInfo`
- `login.js` 只设置 `globalData.bookId`，未 `setStorageSync`

**修复：**
- `app.js` `onLaunch` 新增 Storage → globalData 恢复
- `app.js` 新增 `getBookId`/`setBookId` 方法
- `login.js`/`family.js` 使用 `app.setBookId()` 替代直接赋值

**分支：** `fix/login-state-loss`

### 2. 首页记录排序

**问题：** 同日期记录仅按日期排序，同一天内的录入顺序随机。

**修复：** `record/list` 新增 `.orderBy('createdAt', 'desc')`

**注意：** 需在云开发控制台为 records 集合添加复合索引 `bookId(asc) + date(desc) + createdAt(desc)`

**分支：** `fix/record-sort-order`

### 3. 图片云存储环境前缀

**问题：** 测试与生产环境图片共用同一云存储路径，无法区分。

**修复：** `add.js`/`mine.js` 上传路径加 `test/` 或 `prod/` 前缀。

**分支：** `fix/image-env-prefix`

### 4. 分类系统重构

**背景：** 原分类系统大类固定为系统预设（`bookId: null`），所有账本共享；用户只能新增小类。

**改造要点：**
- **数据模型：** 每账本独立分类副本（`bookId` 有值，`isSystem` 标记预置），不再有共享分类
- **新增大类：** 可创建自定义大类（含 emoji），自动生成"其他"子类
- **改名：** 大类/小类均可改名（含改 emoji），仅限自己账本
- **删除：** 自建大类可删（有子类级联确认），小类有记录时提供归并选项（归并到父类或同父其他子类）
- **大类记账：** 记账可选大类（不选小类），`category-picker` 右侧顶部新增"记在「XXX」下"
- **分类管理页：** 新增独立页面，按支出/收入分 Tab，集中管理大类/小类增删改
- **预设分类调整：** 支出 9→16（新增通讯/育儿/美容护肤/服饰/运动健身/旅行/宠物），收入 7→7（新增奖金/红包礼金，合并闲置转卖/医疗报销入其他）
- **存量迁移：** `category` 云函数新增 `migrate` action（幂等）

**分支：** `feat/category-system-redesign`

**涉及文件：**
- 云函数：`category/index.js`、`init-database/index.js`
- 前端：`category-picker` 组件（js/wxml/wxss）、`add.js/wxml`、`app.json`
- 新增：`pages/category-manage/`（4个文件）
- 文档：设计文档、本记录、问题追踪表、测试用例