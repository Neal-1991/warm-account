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

---

## 十四、分类系统重构测试 Bug 修复（2026-06-07）

### Bug A：分类选择器大类名称显示为空

**问题：** 点击记一笔，选择第二个及之后的大类时，「记在「」下」括号中为空，只有第一个大类能正常显示名称。

**根因：** `category-picker.wxml:33` 硬编码 `bigCategories[0].name`，表达式 `bigCategories[0]._id === selectedBigId` 在选中其他大类时为 false。

**修复：**
- `category-picker.js` — data 新增 `selectedBigName` 字段
- `initCategories()` — 初始化时设为第一个大类的名称
- `selectBig()` — 切换大类时动态更新 `selectedBigName`
- `category-picker.wxml` — 改为 `{{selectedBigName}}`

### Bug B：清空测试数据后预设大类只显示 4 个

**问题：** 清空 categories_test 后重新登录，记一笔页面支出大类只显示 4 个（预期 16 个）。

**根因（两层）：**
1. `category/list` 新查询条件为 `{ bookId }`，旧系统预设 `bookId: null` 查不到
2. 旧 `login` 云函数在登录时创建 per-book 分类副本，新版 `login` 不再创建，改为前端 `login.js` 对新用户（`isNew`）调用 `init-database`。但存量账本 `isNew: false`，`init-database` 从未被调用

**修复（login 云函数彻底改造）：**
- `login` 新增 `ensureCategories()` 函数，登录时自动检测并处理：
  1. 已有 per-book 大类 → 跳过
  2. 尝试 `migrate`（复制 bookId=null 预设 → per-book，remap 记录 categoryId）
  3. 回退 `init-database`（全新创建 16+7 预设）
- **新账本**：await 等待分类创建完毕再返回
- **存量账本**：await 等待迁移/初始化完毕再返回
- `login.js` 前端移除 `isNew` 时手动调用 `init-database` 的代码

### Bug C：分类选择器滚动穿透

**问题：** 分类选择器弹窗打开后，上下滑动会滚动下层页面而非弹窗内容。

**根因：** 弹窗遮罩层未阻止触摸滚动事件传递。

**修复：**
- `category-picker.wxml` — `picker-mask` 添加 `catchtouchmove="preventTouchMove"`
- `category-picker.js` — 新增 `preventTouchMove()` 空方法

### init-database 新增 updateSystemPresets

**用途：** 生产部署前，增量更新 `bookId: null` 系统预设为最新 16+7 版本。

**策略：**
- 同名大类 → 原地更新 icon/order（保留 `_id`，确保 migrate 能正确 remap 旧记录）
- 新大类 → 追加创建
- 缺失子类 → 补充创建

**调用方式：** `init-database` 云函数 `action=updateSystemPresets`（不需要 bookId）

### 涉及文件

| 文件 | 改动 |
|------|------|
| `cloudfunctions/login/index.js` | 新增 `ensureCategories()`，登录时自动初始化/迁移分类 |
| `cloudfunctions/init-database/index.js` | 新增 `updateSystemPresets` action + action 分发 |
| `miniprogram/pages/login/login.js` | 移除手动 `init-database` 调用 |
| `miniprogram/components/category-picker/category-picker.js` | 新增 `selectedBigName`、`preventTouchMove` |
| `miniprogram/components/category-picker/category-picker.wxml` | Bug A/C 修复 |

### 超时优化

**问题：** `init-database` 串行创建 83 条分类文档（23 大类 + 60 子类），每次登录可能超时（默认 3s）。

**修复：**
- `init-database/index.js` — 分类创建改为 2 轮并行（`Promise.all`）：创建所有大类 → 创建所有子类，总耗时 ~400ms（原 ~8s）
- 新增 `config.json` 文件为 3 个云函数设置超时：
  - `login/config.json` — 20s（内部分别调用 category/migrate 和 init-database）
  - `category/config.json` — 20s（migrate 需要分批更新记录 categoryId）
  - `init-database/config.json` — 15s（配合并行化后仍有充裕余量）

**数据安全分析：**
- 并行化后分类创建为原子操作（全部成功或全部失败），不会出现"只创建了部分大类"的中间态
- migrate 有幂等检查（per-book `existingBig`），超时后下次登录可继续
- 各云函数 `.catch()` 保证登录不受分类初始化失败影响

---

## 十五、生产环境部署 & 数据迁移清单（2026-06-07）

> 2026-06-09 补充：发布前需同时部署最新 `record`、`category`、`book`、`login`、`clear-test-data` 云函数；生产前端需将 `miniprogram/utils/config.js` 的 `isTest` 改为 `false`。

### 部署前（测试环境验证通过后执行）

**第一步：更新系统预设（bookId=null）**

在微信开发者工具控制台执行，**只执行一次，不可跳过**：

```js
wx.cloud.callFunction({
  name: 'init-database',
  data: { action: 'updateSystemPresets', isTest: false }
})
```

作用：将 `categories_prod` 中 `bookId: null` 的旧预设原地更新为 16+7 新版。
- 同名大类原地更新 icon/order，**保留 `_id`**（确保 migrate 能正确 remap 旧记录 categoryId）
- 新大类（通讯/育儿/美容护肤/服饰/运动健身/旅行/宠物/奖金/红包礼金）追加创建
- 缺失子类补充创建
- 幂等，重复执行无副作用

**第二步：上传云函数（按顺序）**

| 顺序 | 云函数 | 包含改动 |
|------|--------|----------|
| 1 | `category` | addBig/rename/deleteChild/deleteBig/migrate（含 config.json 超时 20s） |
| 2 | `init-database` | updateSystemPresets + 并行创建分类（含 config.json 超时 15s） |
| 3 | `login` | ensureCategories 自动初始化/迁移（含 config.json 超时 20s） |

**第三步：上传前端**

微信开发者工具「上传」→ 提交审核。

### 用户侧自动迁移流程

部署后存量用户首次登录时，`login` 云函数自动执行：

```
用户登录
  → ensureCategories 检测：per-book 无大类
  → 调用 category/migrate：
      1. 复制 bookId=null 系统预设 → 写入 bookId=该账本（idMap: 旧_id → 新_id）
      2. 已有小类 parentId → remap 到新大类 _id
      3. 已有记录 categoryId → 按 idMap remap 到新分类 _id
  → 完成（幂等，下次登录秒过）
```

新用户登录 → `init-database` 并行创建 23 大类 + 60 子类（~0.5s）。

### 回滚预案

| 问题 | 处理 |
|------|------|
| migrate 超时（大量记录） | 幂等可重试，再次登录自动续传；部分 remap 不损坏数据 |
| 分类显示异常 | 重新执行 `action=updateSystemPresets` 同步预设 |
| 需回滚云函数 | 云开发控制台可回滚到上一个版本；旧 login 不含 ensureCategories 不影响功能 |
| 需回滚前端 | 重新上传旧版本即可；前端仅额外显示新功能入口，不影响基础记账 |

### 关键注意事项

- **不要删除 `categories_prod` 中的 `bookId: null` 文档** — 它们是 migrate 的源数据。删了会导致存量用户记录变为"未分类"
- `updateSystemPresets` 是**原地更新**，不会改变已有 `_id`，不影响指向旧分类的记录
- 存量生产用户的历史账本无需人工逐条迁移；用户首次登录生产版时，`login.ensureCategories()` 会检测该账本是否已有 per-book 大类，没有则自动调用 `category/migrate`。
- 如果希望发布前主动迁移某个生产用户，可在该用户登录态下调用 `category/migrate` 且传 `isTest:false`；该 action 幂等，已迁移账本会返回 `already migrated`。

---

## 十六、测试反馈补充修复（2026-06-07）

### 分类选择器无法滚动到确定按钮

**问题（第二次迭代）：** 第一次修复（`catchtouchmove` 在遮罩层）反而阻止了弹窗内部的滚动，因为 `catchtouchmove` 在微信小程序中会阻止默认滚动行为。

**根因：** `catchtouchmove` 事件同时阻止传播和默认行为。遮罩上的 `catchtouchmove` 阻止了弹窗内容区的滚动。

**修复：**
- `picker-content` 从 `<view>` 改为 `<scroll-view scroll-y>`（微信原生组件，内部滚动不通过 touchmove 事件传播）
- 遮罩保留 `catchtouchmove="preventTouchMove"` 阻止背景穿透
- CSS `max-height: 70vh` 限制弹窗高度

### 管理页修改分类后记账页不刷新

**问题：** 从分类管理页返回记账页后，打开分类选择器显示的是旧数据，需切换到收入再切回支出才能看到更新。

**根因：** `add.js` 仅在 `onLoad` 加载分类，从管理页返回触发 `onShow`，无重载逻辑。picker 组件的 `visible` observer 重新初始化，但源头 `categories` 属性是旧数据。

**修复：** `add.js` 新增 `onShow()` → `loadCategories()`，确保每次页面显示时分类为最新。picker 组件的 `categories` observer 自动触发 `initCategories()` 刷新 UI。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `miniprogram/components/category-picker/category-picker.wxml` | picker-content 改为 scroll-view |
| `miniprogram/components/category-picker/category-picker.wxss` | 移除 overflow-y:auto，保留 max-height:70vh |
| `miniprogram/pages/add/add.js` | 新增 onShow() 重新加载分类 |
- 新用户不受影响，login 直接创建 per-book 分类，不走 migrate 路径

---

## 十七、book/join 分类合并修复（2026-06-07）

### 问题发现

全局代码 review 时发现：`book/join` 中小类合并匹配使用 `parentId:name` 作为 key，但在 per-book 模型中，A 和 B 的大类 `_id` 不同（即使名称相同），导致匹配永远失败。

### 影响场景

- B 加入 A 的家庭时，B 的小类无法正确合并到 A 的对应大类下
- B 的大类记账记录（categoryId 指向 B 的大类 `_id`）在 join 后指向已删除的分类
- B 的自定义大类在 join 后丢失

### 修复方案

将 join 流程的合并逻辑从「按 parentId 匹配」改为「按大类名称匹配」：

1. **3a**: 先获取 A 和 B 的大类，构建三个映射表：
   - `bBigIdToName`: B 大类 `_id` → 名称
   - `aBigNameToId`: A 大类 `name:type` → `_id`
   - `aBigIdToName`: A 大类 `_id` → 名称

2. **3b**: 重映射 B 中直接引用大类的记录（大类记账），删除 A 已有的重复大类

3. **3c**: 按 `bigName:childName` 匹配小类（替代原来的 `parentId:name`），同名同父合并，无冲突迁移并重映射 parentId

4. **3d**: 迁移 B 剩余大类（A 中没有的自定义大类）到目标账本

5. **3e**: 批量迁移 B 的历史记录 bookId

### 涉及文件

| 文件 | 改动 |
|------|------|
| `cloudfunctions/book/index.js` | 重写 join 的 3a-3e 步骤，从 parentId 匹配改为名称匹配 |

---

## 十八、服务端授权与分类删除保护修复（2026-06-09）

### 问题发现

全量代码 review 后发现三类逻辑风险：

1. 多个云函数仍信任前端传入的 `openId` / `bookId`，攻击者可构造调用参数读取或修改非本人账本数据。
2. 删除大类时只检查大类自身，未检查其子类下是否存在记账记录，可能导致记录的 `categoryId` 指向已删除分类。
3. 记一笔页面在“支出/收入”之间切换时保留旧分类，可能提交跨类型分类记录。

### 根因

- 前端状态用于 UI 便利，但云函数中未统一将 `cloud.getWXContext().OPENID` 作为权限来源。
- 分类删除逻辑只覆盖当前分类节点，未按层级向下统计子类记录。
- `add.js` 的 `switchType` 只切换 `type` 并重新加载分类，未同步清空 `selectedCategory` 和提交状态。

### 修复方案

- `record` 云函数：新增账本成员校验、分类归属校验、记录所有权校验；`add/list/update/delete/countByCategory/getFileUrl` 均先确认调用者有权访问目标账本；更新/删除仅允许记录创建者或账本所有者执行。
- `book` 云函数：`get/generateInviteCode/validateInviteCode/join` 改用服务端 OPENID；生成邀请码仅允许账本所有者执行；加入家庭流程不再信任前端 `openId`。
- `category` 云函数：分类 CRUD 均校验账本成员身份；删除大类前统计大类及全部子类记录，存在记录时阻止删除；删除小类时支持安全归并并校验归并目标。
- `login.getMembers`：仅返回与调用者同账本的成员资料，并继续通过云函数生成头像临时 URL。
- `add.js`：切换收入/支出时清空已选分类、关闭分类选择器并禁用提交。
- `detail.js`：请求图片临时 URL 时传入 `bookId`，配合 `record/getFileUrl` 的服务端成员校验。
- `category-manage.js`：删除小类前使用 `record/countByCategory` 统计数量，避免错用月份列表接口导致归并弹窗不可用。

### 额外质量红线修复

检查微信小程序质量红线时发现登录页仍保留 `open-type="getUserInfo"` / `bindgetuserinfo`。该入口已不适合新版微信授权流程，本次一并改为普通 `bindtap` 登录：登录只负责通过云函数获取服务端 OPENID 并创建/读取账本，昵称头像仍由“我的”页编辑资料流程维护。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `cloudfunctions/record/index.js` | 统一服务端身份校验，新增 `countByCategory`，限制记录与图片访问权限 |
| `cloudfunctions/book/index.js` | 邀请码、账本查询、加入家庭改用服务端 OPENID 授权 |
| `cloudfunctions/category/index.js` | 分类 CRUD 加账本成员校验，删除大类前检查大类及子类记录 |
| `cloudfunctions/login/index.js` | `getMembers` 仅返回同账本成员 |
| `miniprogram/pages/add/add.js` | 类型切换时清空分类并禁用提交 |
| `miniprogram/pages/category-manage/category-manage.js` | 删除小类预检查改为 `countByCategory` |
| `miniprogram/pages/detail/detail.js` | 获取图片临时 URL 时携带 `bookId` |
| `miniprogram/pages/login/login.wxml` | 移除废弃 `open-type="getUserInfo"` 和 `bindgetuserinfo` |
| `miniprogram/pages/login/login.js` | 登录流程不再依赖 `e.detail.userInfo`，昵称头像使用云端持久化资料或默认值 |

---

## 十九、clear-test-data 头像云存储清理补充（2026-06-09）

### 问题发现

测试环境清理脚本会清空 `books_test`、`records_test`、`categories_test`、`members_test`，并会删除 `records_test.images` 中引用的记账图片。但头像持久化后，`members_test.avatarUrl` 也可能保存 `cloud://` 文件 ID，原脚本清空 members 文档前没有删除这些头像文件。

### 影响

- 多次测试“编辑头像”后，测试环境云存储会残留 `test/avatars/...` 文件。
- 数据库看起来已清空，但云存储容量仍会增长。

### 修复方案

- `cloudfunctions/clear-test-data/index.js` 在删除云存储阶段同时读取 `records_test` 和 `members_test`。
- 收集 `records.images[]` 与 `members.avatarUrl` 中的 `cloud://` 文件 ID。
- 使用 `Set` 去重后按 50 个一批调用 `cloud.deleteFile()`。
- 之后再清空 `books_test`、`records_test`、`categories_test`、`members_test`。

### 待操作

重新上传云函数 `clear-test-data` 后再执行清理脚本：

```js
wx.cloud.callFunction({
  name: 'clear-test-data'
}).then(res => console.log('清空结果:', res))
```

---

## 二十、真机回归反馈记录（2026-06-09）

### 已验证通过

- 删除有记录的小类：重新上传 `record/category` 后，归并流程可用，归并后记录不再变成“未分类”。
- 删除子类下有记录的大类：重新上传 `category` 后，删除会被阻止，大类、子类和记录均保留。

### 暂缓到下个版本的问题

1. **小类删除归并提示不准确**
   - 当前逻辑只支持将小类记录归并到父大类或同父其他小类。
   - 真机提示容易让用户理解为“可以把已有记录迁移到任意其他分类”，但当前能力边界更窄。
   - 下版处理方向：优化文案，或新增跨大类/跨类型受控迁移能力。

2. **清除测试数据后首次登录超时，第二次登录成功**
   - 清库后首次登录会同时创建 member、创建 book、初始化/迁移分类，链路较长。
   - 第二次登录成功说明数据最终创建完成，问题偏向首登初始化耗时/前端超时处理。
   - 下版处理方向：拆分初始化、缩短 login 链路、增加前端重试与更明确的 loading 状态。

---

## 二十一、上线前分类回归与版本化修复（2026-06-10）

### 冒烟测试现象

1. 重新登录后，“记一笔”的支出大类只有旧版 6 类。
2. 分类管理页的支出、收入列表都为空，只显示“添加大类”。
3. 添加大类时点击 emoji 候选不会更新图标，只能创建后再次修改。

### 根因

- `login.ensureCategories()` 只检查“是否存在任意 per-book 大类”，旧版或半初始化账本只要有一条大类就被误判为完成。
- 分类管理页在同一个 WXML 节点同时使用 `wx:for` 和依赖 `item` 的 `wx:if`，条件求值时循环变量不可用，导致整组不渲染。
- 添加大类的 emoji 候选通过 `data-value` 传值，但处理函数只读取输入框事件的 `e.detail.value`。

### 长期修复

- 账本新增 `categorySchemaVersion`，当前版本为 `1`。
- 系统大类和默认子类新增稳定 `presetKey`；用户改名、改 emoji 后不改变该标识。
- `init-database` 改为幂等补齐：识别已有分类、创建缺失分类，全部成功后才更新账本版本。
- 登录统一调用 `init-database`；初始化失败则登录失败并提示重试，版本不前进，下次登录继续补齐。
- `category/list` 分页读取全量分类，避免超过云数据库单次查询上限后截断。
- 家庭合并优先按 `presetKey` 匹配，兼容双方修改过系统分类名称的场景。
- 管理页在 JS 中生成 `visibleBigCategories`；emoji 点击与手工输入使用统一取值函数。

### Emoji 二次回归补充

初版修复仍让候选点击和输入框共用同一个事件处理函数，在微信开发者工具/真机中候选点击仍可能无法稳定更新。最终调整为：

- 候选点击固定使用 `catchtap="onSelectAddBigEmoji"` + 数字 `data-index`，处理函数再从固定候选列表取 emoji，避免 dataset 直接传递复合 emoji 时解析不稳定，同时阻止点击事件继续冒泡。
- 输入框固定使用 `bindinput="onAddBigIconInput"` + `e.detail.value`。
- 管理页和“记一笔”分类选择器共用 `utils/category-emoji.js` 中的候选列表。
- emoji 输入框 `maxlength` 从 2 调整为 8，兼容 `✈️` 等复合 emoji。
- “记一笔”选择器内的快速新增大类也补充可点击 emoji 候选，不再只能手工输入。

### 一次性生产重置

当前生产环境只有两名用户，且账目在其他 App 同步记录，因此本次允许一次性清空生产数据。`clear-test-data` 增加受保护的 production 模式：

1. 云函数环境变量配置 `PRODUCTION_RESET_OPENID=<管理员OPENID>`。
2. 上传最新 `clear-test-data`。
3. 在该管理员登录态下执行：

```js
wx.cloud.callFunction({
  name: 'clear-test-data',
  data: {
    target: 'production',
    confirmation: 'RESET_WARM_ACCOUNT_PRODUCTION'
  }
}).then(res => console.log('生产重置结果:', res))
```

未配置管理员 OpenID、调用者不匹配或确认短语错误时均拒绝生产清理。重置完成后可移除该环境变量。

### 发布顺序

1. 上传 `init-database`、`login`、`category`、`book`、`clear-test-data` 云函数。
2. 在 `_test` 使用两个账号验证 16 个支出大类、7 个收入大类、管理页、emoji 新增和家庭加入。
3. 仅在本次明确需要时执行一次受保护的生产重置。
4. 上传 `isTest=false` 的小程序前端，并在 `_prod` 做单账号最小冒烟。

---

## 二十二、家庭加入续跑与分类展示修复（2026-06-11）

### 冒烟现象与根因

1. B 第一次点击加入后弹窗消失但未加入，第二次点击同一邀请才成功。
   - `book/join` 在一次调用中串行迁移并提前删除重复分类，容易超过调用时限。
   - 中断后云端已完成部分写入，但没有保存阶段和映射上下文。
   - 前端异常补偿调用 `book/get` 后，只检查“返回账本包含当前用户”，因此把 B 原个人账本误判为加入成功。
2. 加入后大量记录显示“未分类”，少数如“晚餐”只显示小类且无大类图标。
   - join 对 A/B 分类使用未分页 `.get()`，新版分类数量超过单次返回范围时映射不完整。
   - 第一次中断已删除部分源大类，第二次无法恢复其子类父级关系。
3. “春节红包”不显示“红包礼金”图标。
   - 首页原逻辑在父类不存在时退化为小类自身名称和空图标；收入靠后的分类更容易受截断影响。

### 修复方案

- `book/join` 改为持久化分阶段状态机：`planning → remapCategories → moveCategories → moveRecords → verify → cleanup`。
- planning 阶段分页读取双方全部分类，按 `presetKey` 优先、名称与类型兜底，保存固定映射计划。
- 重复分类不再提前删除；记录分类、分类归属和记录账本全部迁移并校验后才清理。
- 目标账本用 `joinMigration` 保存任务，源账本用 `joinTargetBookId` 开启写保护；中断后同一邀请人继续原任务。
- `validateInviteCode` 返回目标 `bookId` 和 `joinStatus`；`join` 返回 `processing/completed` 与进度。
- family 页一次点击后自动续调；网络异常只在明确确认目标 `bookId` 已成为当前用户账本时提示成功。
- 新增统一 `category-display` 工具：首页小类显示父大类图标 + 小类名，统计按父大类聚合，孤立引用统一显示“未分类”并记录日志。
- 当前受损 `_test` 数据不做恢复；部署后清空测试数据，从 A/B 全新账本重测。

### 自动验证

- 分类分页超过 100 条仍可全量读取。
- 改名后的系统大类/小类继续按 `presetKey` 合并。
- 模拟迁移中断并重建服务后可续跑完成，不重复成员、分类或记录。
- 首页显示 `🍜 晚餐`、`🧧 春节红包`；统计分别聚合到“餐饮”“红包礼金”。

---

## 二十三、登录态与邀请过期闭环（2026-06-12）

### 问题根因

1. 冷启动虽然会读取 Storage，但页面仍直接读取 `globalData`，且历史版本可能只持久化了头像资料，没有完整 `openId/bookId`。
2. 加入超时后的旧补偿逻辑只判断“查询到的账本包含 B”，因此会把 B 原个人账本误判为目标账本；旧账本随后被云端删除，统计再使用旧 `bookId` 就返回 `permission denied`。
3. 分享页停留超过一小时后仍可能复用内存中的旧邀请码；首次接受也需要在真正占用邀请码的事务中再次校验截止时间。

### 修复

- `login` 新增只读 `restoreSession`，按服务端 OpenID 查询当前账本和 members 资料，不创建账本、不初始化分类。
- `app.ensureSession()` 统一恢复并校正 Storage；首页、统计、我的、记账、家庭、分类管理和详情页不再直接以 `globalData.openId/bookId` 判断登录。
- 主动退出写入 `manualLogout`；主动登录清除标记。远程恢复失败且本地会话不完整时清除残留头像，避免“未登录但显示旧资料”。
- 邀请生成返回 `expiresAt` 并检查现存邀请码碰撞；分享端仅复用仍有效的码。
- 首次加入在事务内重新读取目标账本，核对邀请码、占用者和 `inviteCodeExpire`，成功后写入 `joinMigration.acceptedAt`。
- 只有已写入 `acceptedAt` 的同一用户任务可以跨过期时间续跑；仅打开确认框不算接受。
- `book` 返回 `INVITE_INVALID/INVITE_EXPIRED/INVITE_USED/INVITE_IN_USE` 等稳定错误码；前端仅在 `completed` 且目标 `bookId` 精确一致时提示成功。

### 验证与发布

- Node 自动测试 26 项通过，覆盖会话恢复、失效账本校正、主动退出竞态、邀请码碰撞、验证后过期、过期首次加入、过期续跑和 `acceptedAt` 持久化。
- 发布顺序：上传 `login/book/category/record/init-database/clear-test-data` → 在 `_test` 完成 A/B 邀请回归 → 必要时受保护地清空 `_prod` 并立即撤权 → 上传 `isTest=false` 的前端 → 在 `_prod` 完成单账号最小冒烟。
- 生产重置属于部署操作，本地实现与权限保护已完成，不在代码验证阶段自动执行。

---

## 二十四、云函数超时时间配置固化（2026-06-13）

- 线上检查发现 `book/category/record/init-collections` 仍为默认 3 秒，控制台配置与仓库不一致。
- 将超时基线固化到各函数 `config.json`：`login/book/category/init-database=20` 秒、`record=10` 秒、`init-collections=3` 秒、`clear-test-data=60` 秒。
- 实际验证发现微信开发者工具右键部署不会可靠应用 `config.json` 中的 `timeout`，且不会覆盖控制台已手工设置的值。
- 后续发布需将代码部署与运行配置更新视为两步：先部署代码，再在控制台或 CLI 显式设置超时并复核。

---

## 二十五、发布回归环境边界精简（2026-06-13）

### 问题

原生产发布手册在 `_prod` 重复安排了邀请过期、迁移中断续跑、双账号家庭合并、分类映射和统计等完整业务回归，还要求手工修改生产邀请码过期时间。测试与生产共用同一套代码和云函数，仅通过集合后缀隔离，这些重复测试增加生产数据污染和误操作风险。

### 调整

- `_test` 承担完整 A/B 回归和所有故障注入，包括邀请码过期、迁移中断续跑、分类引用完整性与权限检查。
- `_prod` 只验证发布边界：体验版确实为 `isTest=false`、请求写入 `_prod`、生产集合存在、登录与分类初始化正常、一条记录可增删、冷启动可恢复。
- 生产环境不再手工修改 `inviteCodeExpire`，不再故意中断家庭迁移，也不再重复完整 A/B 邀请流程。
- 生产重置保留为首次发布或明确数据迁移需要时的一次性受保护操作，不作为常规测试准备步骤。

---

## 二十六、预算管理 V1（2026-06-15）

### 产品决策

- 预算按账本、月份保存，金额继续使用整数分。
- 总预算必填，分类预算选填并只支持支出大类；小类支出按父大类归集。
- 未设置预算时，首页显示轻量设置入口；统计页仍正常展示饼图和分类数据，不把“未设置”误显示为“0 元预算”。
- 家庭成员都可查看，只有账本管理员可以新增、修改、复制和删除预算。
- 新增支出成功后，首次跨过 80% 或 100% 阈值时展示非阻塞提醒，不影响记账结果。

### 实现

- 新增 `budget` 云函数，提供 `getMonth/save/copyPrevious/remove`，并在服务端聚合总预算和分类预算使用情况。
- 新增 `budgets_test/budgets_prod` 集合，唯一约束为 `bookId + month`。
- 新增预算管理页，并在首页、统计页、“我的”和“记一笔”接入预算状态、进度和提醒。
- 删除支出大类前检查当前月及未来月份的分类预算引用；存在引用时阻止删除。
- 家庭加入完成时保留目标账本预算，清理来源个人账本预算；清理测试/生产数据时同步清空预算集合。

### 自动验证

- `npm test` 共 34 项通过，覆盖月份边界、父大类归集、未设置状态、80% / 100% 跨线提醒、成员只读状态和家庭合并预算清理。
- 新增及修改的 JavaScript 均通过 `node --check`。
- `openspec validate budget-management --strict` 通过。
- 主包约 1.20 MiB，`lazyCodeLoading: requiredComponents` 保持启用，图片资源均小于 200 KiB。

### 发布顺序

1. 在测试和生产环境分别创建 `budgets_test`、`budgets_prod`，并配置 `bookId + month` 唯一索引。
2. 部署 `budget`，再部署 `record/category/book/init-collections/clear-test-data`。
3. 上传小程序前端，在 `_test` 完成预算设置、阈值提醒、成员只读、分类删除保护和家庭加入回归。
4. `_prod` 只做集合存在、单月预算新增/查询/删除及一条支出提醒的最小冒烟。

---

## 二十七、测试到腾讯审核发布手册升级（2026-06-15）

### 问题

- 原发布手册未覆盖预算集合、预算云函数、预算索引和 `TC-098` 至 `TC-108`。
- `init-collections` 返回了带后缀集合清单，但实际检测的是无后缀集合，容易误报。
- `config.js` 的集合映射遗漏 `budgets`。
- 应用内协议仍称登录时自动获取昵称头像，与当前用户主动填写/选择的实现不一致，也未说明预算数据。
- 原手册长期记录了生产重置管理员 OpenID，不符合敏感标识管理要求。

### 调整

- 重写 `docs/superpowers/plans/2026-06-13-production-release-runbook.md`，覆盖测试配置、集合、索引、云函数部署、超时、完整回归、生产冒烟、隐私检查、腾讯审核和审核后发布。
- `init-collections` 改为检查 10 个实际 `_test/_prod` 集合。
- 配置集合映射补充 `budgets`，并新增自动测试防止回归。
- 协议和隐私政策改为说明 OpenID、用户主动提交的昵称头像、账目图片、预算及家庭数据。
- 管理员 OpenID 仅允许临时写入云函数环境变量，不再写入仓库文档。

---

## 二十八、发布手册精简（2026-06-15）

原手册超过 700 行，对当前小型项目而言操作负担过重。现精简为 10 个实际步骤，仅保留测试/生产配置、35 项自动测试、集合和必要索引、8 个云函数、测试环境验收、生产体验版验证、腾讯审核及审核后发布。

---

## 二十九、预算提醒与客户端更新修复（2026-06-23）

### 问题与根因

1. 点击“复制上月”且上月无预算时，云函数虽然返回“上月未设置预算”，但前端在 toast 后由 `finally` 关闭 loading，提示可能被立即覆盖。
2. 分类预算提醒复用了“首次跨过 80% / 100%”算法。家庭账本一旦已有成员使分类达到 100%，后续成员继续在该分类记账不会再收到提醒。
3. 记账成功后的自定义遮罩弹窗要求点击“知道了”，打断连续操作；若直接从弹窗进入预算页又会增加已提交表单与返回栈管理复杂度。
4. 应用没有调用 `wx.getUpdateManager()`，关于页版本号也为硬编码，无法在新版本准备完成后要求当前实例重启。

### 修复方案

- `budget.copyPrevious` 在上月无预算时返回 `PREVIOUS_BUDGET_NOT_FOUND`；前端先关闭 loading，再展示固定提示，失败时不刷新也不创建目标预算。
- 分类预算首次跨过 80% 仍只提醒一次；首次达到 100% 和已经超支后的每笔分类支出均返回超支提醒。总预算继续保持首次跨线。
- 提醒优先级固定为：分类超支、总预算超支、分类预警、总预算预警；`record.add` 保留单个 `budgetAlert` 兼容字段，并新增 `trigger`。
- 记一笔页面使用提交按钮上方的非阻塞提示条，显示“记账成功，分类预算已超支”和使用详情；约 2 秒后自动 `switchTab` 返回首页。
- 提示期间维持提交锁，页面卸载时清理定时器，并用跳转标记避免重复返回。
- 新增 `utils/version.js`，统一版本为 `3.0.1`；关于页动态读取。
- 新增更新管理工具：更新就绪时不可取消地调用 `applyUpdate()`；下载失败时要求关闭小程序并退出当前实例。

### 验证

- 自动化测试增至 42 项，覆盖稳定错误码、分类持续超支、家庭共享口径、提醒优先级、非阻塞提示结构、统一版本号以及更新成功/失败流程。
- Emoji 候选、输入法自定义 Emoji 和复合 Emoji 保持原实现，仅做回归验证。

---

## 三十、首页性能与日期分组待办（2026-06-23）

### 1. 冷启动首页记录加载慢

用户反馈：重新打开小程序时登录状态仍然有效，但首页记账记录通常需要约 10 秒才显示。

只读排查发现当前冷启动链路存在多层叠加等待：

- 首页在 `onLoad` 和紧接着的 `onShow` 中各执行一次 `loadData()`，产生两轮重复请求。
- 本地已经保存 `openId/bookId` 时，首页仍等待远程 `login.restoreSession` 完成后才开始读取数据。
- 首页先读取分类，分类完成后才并行读取账目和预算，账目请求被分类请求阻塞。
- 前端等待账目和预算都返回后才统一渲染，较慢的预算接口会拖住记录列表。
- `budget.getMonth` 再次读取全部分类和当月全部支出，与首页已经发出的分类、账目请求重复。
- 冷启动时 `login/category/record/budget` 多个独立云函数可能分别发生冷启动。

建议下一版优先实施低风险优化：

1. 首页首次进入只加载一次，并为并发 `loadData` 增加请求去重。
2. 分类、账目和预算并行请求。
3. 账目返回后先渲染，预算随后独立更新。
4. 未设置预算时尽早返回，不读取分类和当月支出。
5. 后续再评估本地缓存、后台会话校正和首页聚合云函数。

目标指标：冷启动有本地登录态时，首页记录首屏由约 10 秒降低至 2～4 秒；后续可通过缓存实现先展示旧数据、后台刷新。

### 2. 首页记录按日期分组

用户希望首页记录在现有月份列表内按具体日期进行分组或分隔显示，避免不同日期的账目连续平铺。

当前只确认产品目标，具体前端方案留待后续讨论，包括：

- 日期标题显示“今天 / 昨天 / 6月21日”还是统一日期格式。
- 日期标题是否同时显示当日收入、支出小计。
- 分隔采用标题条、细线还是卡片分组。
- 日期标题是否需要滚动吸顶。

该功能计划与首页性能优化一起实现：云函数继续返回排序后的原始记录，前端在数据处理阶段生成日期分组，避免为纯展示需求增加额外数据库查询。

---

## 三十一、首页加载性能与日期分组优化（2026-06-25）

### 问题根因

1. 冷启动进入首页时，`onLoad` 与紧接着的 `onShow` 都会触发完整 `loadData()`，导致首页重复请求。
2. 本地已有 `openId/bookId` 时，首页仍等待远程 `restoreSession` 完成后才开始读取账目，首屏被登录态校正阻塞。
3. 首页原链路先读分类，再读账目和预算；账目列表必须等预算接口返回后才一起渲染。
4. `budget.getMonth` 在当月未设置预算时仍继续聚合分类和支出，增加了无效等待。
5. 首页记录按时间平铺显示，不同日期之间缺少明显分隔。

### 修复方案

- 首页冷启动优先使用本地会话加载数据，同时在后台进行远程会话校正；如果远程判定会话失效，再清空本地状态并跳转登录。
- 增加首屏 `onShow` 跳过机制和请求序号保护，避免重复加载和旧响应覆盖新月份。
- 分类、账目和预算并行请求；分类与账目返回后优先渲染记录列表和月度汇总，预算卡随后独立刷新。
- `budget.getMonth` 在未设置预算时快速返回 `budget: null`、`usage: null`、`canEdit` 和 `isHistorical`，不再读取分类和当月支出。
- 新增首页记录分组工具，前端按日期生成 `recordGroups`，只对今天/昨天使用相对文案，其余日期显示准确日期；每组展示当日收入/支出小计。
- 首页分组场景下记录卡片隐藏重复日期，但保留记账人、分类、金额和点击进入详情能力。

### 验证

- 新增 `tests/homepage-performance.test.js`，覆盖日期分组、当日小计、今天/昨天/跨年文案、首页源码契约和预算未设置快速返回契约。
- `npm test` 共 47 项通过。
- 相关 JavaScript 文件通过 `node --check`。
- `openspec validate homepage-performance-date-groups --strict` 通过。
- 主包约 1.215 MiB，`lazyCodeLoading: requiredComponents` 保持启用，图片均小于 200 KiB，未检出 `getUserInfo` 废弃入口。

### 已完成生产确认（原待手工项）

- 微信开发者工具和真机已确认冷启动首页首屏记录不再出现约 10 秒等待。
- 体验版和生产回归已确认今天、昨天、4～5 天前和跨年记录的分组标题、小计和详情跳转符合预期。

---

## 三十二、已上线版本收口（2026-07-02）

### 状态确认

- `3.0.1` 已完成生产发布和生产回归，预算复制、分类持续超支提醒、非阻塞预算提示、首页冷启动加载、账目日期分组和客户端更新机制均按当前生产行为记录。
- `category-system-redesign` 剩余的手工验收、迁移验证、首页排序、统计聚合和生产发布任务已根据已完成的手工验收补记为完成。
- 生产重置能力仅作为明确需要时的受保护工具保留，不作为常规发布、回归或收口步骤。

### 文档收口

- 更新用户操作手册，补齐游客模式、分类管理、预算管理、预算提醒、首页日期分组和版本更新说明。
- 更新通用发布手册，将自动化测试预期改为 47 项、版本号来源改为 `utils/version.js`，并移除“明天测试”等过期标记。
- 更新 `3.0.1` 专项上线手册，标记生产发布和最终验证已完成。

### 下一轮优化候选

- 记录列表分页：替代 `record/list` 当前 `.limit(500)` 限制。
- 环境切换自动化：降低手动修改 `config.js` 的生产/测试切换风险。
- 统一云函数调用封装：逐步使用 `utils/cloud.js` 或新的统一 wrapper 复用错误处理。
- 分类删除/归并体验：明确同父归并范围，后续可评估跨分类迁移能力。
