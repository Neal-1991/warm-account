## ADDED Requirements

### Requirement: 分类选择器提供大类入口
`category-picker` 组件 SHALL 在小类列表顶部提供"记在「XXX」下"选项，允许用户直接选择大类记账。

#### Scenario: 选择大类
- **WHEN** 用户在分类选择器中，点击右侧顶部的"记在「餐饮」下"
- **THEN** 系统将此选项高亮为选中状态
- **AND** 点击"确定"后返回 `categoryId = 餐饮大类._id`, `categoryName = "餐饮"`, `icon = "🍜"`

#### Scenario: 切换大类时刷新
- **WHEN** 用户在左侧从"餐饮"切换到"交通"
- **THEN** 右侧顶部更新为"记在「交通」下"，下方子类列表切换为交通的子类

### Requirement: 大类入口与小类平级可选
"记在「XXX」下" SHALL 与小类在同一列表中共存，同一个列表中互斥选择。

#### Scenario: 选中大类后切换为小类
- **WHEN** 用户已选中"记在「餐饮」下"，再点击"午餐"
- **THEN** "记在「餐饮」下"取消高亮，"午餐"高亮
- **AND** 确定后返回小类的信息

### Requirement: 分类选择器支持添加大类
`category-picker` 左侧大类列表底部 SHALL 提供"+ 添加大类"入口。

#### Scenario: 从选择器添加大类
- **WHEN** 用户在分类选择器中，点击左侧底部的"+ 添加大类"
- **THEN** 系统弹出输入框，填写名称和 emoji 后新大类出现在左侧列表中
- **AND** 云函数自动创建一个"其他"子类

### Requirement: 分类选择器管理入口跳转
`category-picker` 的"管理"按钮 SHALL 跳转至独立分类管理页。

#### Scenario: 管理入口跳转
- **WHEN** 用户点击分类选择器顶部的"管理"按钮
- **THEN** 系统关闭选择器，跳转至 `/pages/category-manage/category-manage`
- **AND** 从管理页返回后刷新选择器中的分类列表
