// app.js
const websocket = require('./utils/websocket.js')

App({
  globalData: {
    apiBaseUrl: 'http://localhost:3000', // 修改为你的API地址
    token: '',
    userInfo: null
  },

  onLaunch() {
    console.log('小程序启动')
    this.clearLegacyTemplateLocalData()
    // 自动登录（暂时禁用，因为后端还未实现）
    // this.autoLogin()

    // 初始化 WebSocket 连接
    this.initWebSocket()
  },

  clearLegacyTemplateLocalData() {
    try {
      const info = wx.getStorageInfoSync()
      const prefixes = ['templateCache:p1:', 'templateCache:p8:']
      const staticKeys = ['templateVersion', 'lastSelectedTemplate']

      const keysToRemove = info.keys.filter((key) => {
        if (staticKeys.includes(key)) return true
        return prefixes.some((prefix) => key.indexOf(prefix) === 0)
      })

      keysToRemove.forEach((key) => wx.removeStorageSync(key))
      if (keysToRemove.length > 0) {
        console.log('[App] 已清理模板本地缓存数量:', keysToRemove.length)
      }
    } catch (error) {
      console.warn('[App] 清理模板本地缓存失败:', error)
    }
  },

  // 初始化 WebSocket
  initWebSocket() {
    // 延迟连接，等待网络就绪
    setTimeout(() => {
      websocket.connect()
    }, 1000)
  },

  // 自动登录
  autoLogin() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
      this.getUserInfo()
    } else {
      this.wxLogin()
    }
  },

  // 微信登录
  wxLogin() {
    wx.login({
      success: (res) => {
        if (res.code) {
          // 发送 code 到后端换取 token
          this.loginWithCode(res.code)
        }
      },
      fail: (err) => {
        console.error('微信登录失败:', err)
      }
    })
  },

  // 用 code 换取 token
  loginWithCode(code) {
    wx.request({
      url: `${this.globalData.apiBaseUrl}/api/miniprogram/wx-login`,
      method: 'POST',
      data: { code },
      success: (res) => {
        if (res.data.success && res.data.token) {
          this.globalData.token = res.data.token
          this.globalData.userInfo = res.data.user
          wx.setStorageSync('token', res.data.token)
          wx.setStorageSync('userInfo', res.data.user)
        }
      },
      fail: (err) => {
        console.error('登录失败:', err)
      }
    })
  },

  // 获取用户信息
  getUserInfo() {
    wx.request({
      url: `${this.globalData.apiBaseUrl}/api/auth/me`,
      header: {
        'Authorization': `Bearer ${this.globalData.token}`
      },
      success: (res) => {
        if (res.data) {
          this.globalData.userInfo = res.data
          wx.setStorageSync('userInfo', res.data)
        }
      }
    })
  }
})
