# 暖账

家庭协作记账微信小程序。家庭成员共同记录日常收支，通过分类统计和饼图查看消费结构。

## 功能

- 日常收支记录（支出/收入）
- 分类管理（16 个支出大类 + 7 个收入大类，支持大小类两级结构与自定义）
- 月度统计环形饼图
- 图片上传与查看（最多 9 张/条）
- 家庭协作：邀请码制，成员共享账本
- 游客模式：未登录可浏览界面
- 语音快速记账：按住说话录音→ASR 识别→规则+AI 解析→文本编辑→多笔预览→批量确认
- 月度预算管理：总预算、分类预算、预算进度、超支提醒
- 家庭成员管理：管理员可移除成员、转让账本所有权
- 客户端版本更新：启动检查新版本，强制重启更新，失败提示重开

## 技术栈

- 前端：微信小程序原生框架 + ECharts
- 后端：微信云开发（云函数 + 云数据库 + 云存储）
- 数据库：类 MongoDB 文档数据库

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 配置环境（首次使用）
cp miniprogram/utils/env.example.js miniprogram/utils/env.js
```

编辑 `miniprogram/utils/env.js`，填入你的云开发环境 ID 和小程序 AppID：

```js
module.exports = {
  env: 'your-cloud-env-id',
  appId: 'your-miniprogram-appid',
  isTest: false  // true = 测试环境，false = 生产环境
}
```

### 2. 导入项目

1. 下载[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目，选择项目根目录（包含 `project.config.json` 的目录），工具会自动识别 `miniprogram/` 前端和 `cloudfunctions/` 云函数
3. 在 `project.config.json` 中修改 `appid` 为你的小程序 AppID

### 3. 部署云函数

在微信开发者工具中，右键 `cloudfunctions/` 下的每个函数，选择「上传并部署：云端安装依赖」。

### 4. 初始化数据库

在云开发控制台创建以下集合：

| 集合 | 说明 |
|------|------|
| `books_prod` | 账本 |
| `records_prod` | 记账记录 |
| `categories_prod` | 分类 |
| `members_prod` | 成员信息 |
| `budgets_prod` | 预算 |
| `voiceRequests_prod` | 语音记账请求 |

`voiceRequests_prod` 需创建 `openId` + `requestId` 组合唯一索引。

如需测试环境，将 `env.js` 中 `isTest` 改为 `true`，并创建对应 `_test` 后缀集合。

### 5. 切换环境

编辑 `miniprogram/utils/env.js`（本地文件，不入库）中的 `isTest` 字段：

```js
isTest: true   // 测试环境
isTest: false  // 生产环境
```

## 项目结构

```
├── cloudfunctions/           # 后端云函数
│   ├── login/                #   微信登录 + 成员资料
│   ├── book/                 #   账本 CRUD + 邀请码 + 成员迁移/移除 + 账本转让
│   ├── record/               #   记账记录 CRUD + 预算预警
│   ├── category/             #   分类管理
│   ├── budget/               #   预算管理
│   ├── voice-entry/          #   ASR 语音识别 + 本地规则解析 + Hy3 AI 兜底
│   ├── init-database/        #   初始化默认分类
│   ├── init-collections/     #   数据库集合说明
│   └── clear-test-data/      #   清理测试数据
├── miniprogram/              # 前端
│   ├── pages/                #   11 个页面
│   │   ├── index/            #     首页：月份选择、汇总卡片、预算卡片、记录按日期分组
│   │   ├── add/              #     记一笔：金额/分类/日期/备注/图片
│   │   ├── voice-entry/      #     语音记账：按住录音、ASR、文本编辑、多笔预览
│   │   ├── statistics/       #     统计：ECharts 饼图 + 图例
│   │   ├── mine/             #     我的：头像昵称、家庭管理、预算入口
│   │   ├── family/           #     家庭：邀请码、成员列表
│   │   ├── budget/           #     预算管理：总预算、分类预算、进度
│   │   ├── category-manage/  #     分类管理：大类/小类增删改
│   │   ├── login/            #     登录：微信授权
│   │   ├── about/            #     关于：版本、协议
│   │   └── detail/           #     记录详情：图片预览、删除
│   ├── components/           #   6 个可复用组件（category-icon/category-picker/ec-canvas/month-selector/record-card/summary-card）
│   └── utils/                #   工具函数（预算/分类/日期/邀请/主题/版本更新 + ECharts）
└── project.config.json       # 微信开发者工具配置
```

## 环境切换

通过 `miniprogram/utils/env.js`（本地文件，不入库）中 `isTest` 字段控制：

- `true`：操作 `_test` 后缀集合
- `false`：操作 `_prod` 后缀集合

云函数通过前端传入的 `isTest` 参数决定操作哪个集合。

## License

MIT
