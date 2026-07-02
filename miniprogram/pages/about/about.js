const { APP_VERSION } = require('../../utils/version')

Page({
  data: {
    appVersion: APP_VERSION
  },

  onLoad(options) {
    // If loaded with type parameter, show the agreement directly
    if (options.type === 'terms') {
      this.showAgreement('terms')
    } else if (options.type === 'privacy') {
      this.showAgreement('privacy')
    }
  },

  openTerms() {
    this.showAgreement('terms')
  },

  openPrivacy() {
    this.showAgreement('privacy')
  },

  showAgreement(type) {
    const titles = {
      terms: '用户协议',
      privacy: '隐私政策'
    }

    const contents = {
      terms: `【暖账用户协议】

欢迎您使用暖账小程序。

一、服务内容
暖账是一款家庭协作记账小程序，提供账目记录、分类管理、家庭成员协作、财务统计等功能。

二、账户注册与使用
您可以游客身份浏览基础页面。使用记账、预算和家庭协作功能时，需要通过微信账号登录；昵称和头像由您在“我的”页面主动填写或选择。

三、数据存储与使用
您在本小程序中创建的账目、分类、预算和家庭协作数据将存储于微信云开发提供的云数据库中。

四、知识产权
本小程序的所有权及知识产权归本小程序开发者所有。

五、免责声明
本小程序仅作为记账工具，不对您的财务决策承担责任。

如有任何疑问，请联系：18616146502@163.com`,
      privacy: `【暖账隐私政策】

暖账小程序非常重视您的个人信息保护。

一、信息收集范围
1. 账号标识：登录后用于识别账号的微信 OpenID
2. 个人资料：您主动填写的昵称和主动选择的头像
3. 账目与预算数据：金额、分类、日期、备注、图片和预算信息
4. 家庭信息：您参与的家庭账本和成员信息

二、信息使用目的
- 使用账号标识、昵称和头像展示账户及记账人信息
- 使用账目与预算数据提供记账、预算和统计功能
- 使用家庭信息用于家庭成员协作

三、信息存储
您的个人信息存储于微信云开发提供的云数据库中。

四、信息共享
我们不会主动向第三方出售您的个人信息。在家庭协作场景下，您的账目信息会对同一家庭账本的其他成员可见。

五、您的权利
您可以在小程序内访问和删除账目、修改个人资料；如需删除其他账号资料，可通过下方邮箱联系我们。

如有任何疑问，请联系：18616146502@163.com`
    }

    wx.showModal({
      title: titles[type],
      content: contents[type],
      showCancel: true,
      cancelText: '关闭',
      confirmText: '已读'
    })
  }
})
