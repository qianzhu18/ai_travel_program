// P10 我的照片页
const { photoApi, userApi } = require('../../utils/api.js')

Page({
  data: {
    user: {},
    photos: [],
    loading: false,
    refreshing: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    total: 0,
    points: 0,
    usedPoints: 0,
    latestMetaText: '',
    statusBarHeight: 20,
    navTop: 20,
    navHeight: 44,
    navBarHeight: 88,
    capsuleSpace: 0
  },

  onLoad() {
    // 初始化自定义导航栏（与胶囊按钮对齐，并预留右侧安全区）
    try {
      const systemInfo = wx.getSystemInfoSync()
      const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
      const statusBarHeight = systemInfo.statusBarHeight || 20
      const navTop = menuButton ? menuButton.top : statusBarHeight
      const navHeight = menuButton ? menuButton.height : 44
      const navBarHeight = menuButton ? menuButton.bottom : (navTop + navHeight)
      const capsuleSpace = menuButton ? Math.max(0, systemInfo.screenWidth - menuButton.left) : 0

      this.setData({
        statusBarHeight,
        navTop,
        navHeight,
        navBarHeight,
        capsuleSpace
      })
    } catch (error) {
      this.setData({
        statusBarHeight: 20,
        navTop: 20,
        navHeight: 44,
        navBarHeight: 88,
        capsuleSpace: 0
      })
    }

    this.loadUser()
    this.loadPhotos()
  },

  onShow() {
    // 每次显示时刷新数据
    if (this.data.photos.length > 0) {
      this.onRefresh()
    }
  },

  // 加载用户信息
  async loadUser() {
    try {
      const userOpenId = wx.getStorageSync('userOpenId')
      if (!userOpenId) {
        this.setData({ user: {} })
        return
      }

      const data = await userApi.getMe(userOpenId)
      if (!data) {
        this.setData({ user: {} })
        return
      }

      this.setData({
        user: {
          ...data,
          nickname: data.nickname || data.name || data.userName || ''
        },
        points: Number(data.points || 0),
        usedPoints: Math.max(0, Number(data.initialFreeCredits || 0) - Number(data.points || 0))
      })
    } catch (error) {
      console.error('加载用户信息失败:', error)
    }
  },

  // 加载照片列表
  async loadPhotos(refresh = false) {
    const userOpenId = wx.getStorageSync('userOpenId')
    if (!userOpenId) {
      this.setData({ loading: false, photos: [], hasMore: false })
      return
    }

    if (this.data.loading) return

    if (refresh) {
      this.setData({
        page: 1,
        photos: [],
        hasMore: true
      })
    }

    this.setData({ loading: true })

    try {
      const data = await photoApi.getMyPhotos(
        userOpenId,
        this.data.page,
        this.data.pageSize
      )

      const photos = (data.list || []).map(item => {
        const rawCreatedAt = item.createdAt
        return {
          ...item,
          photoId: item.photoId || item.id,
          resultImageUrl: item.resultUrl,
          originalImageUrl: item.selfieUrl,
          statusText: this.getStatusText(item.status),
          createdAt: this.formatDate(rawCreatedAt),
          rawCreatedAt
        }
      })

      const merged = refresh ? photos : [...this.data.photos, ...photos]
      const latest = merged[0]
      const latestMetaText = latest ? this.formatMetaText(latest) : ''

      this.setData({
        photos: merged,
        total: data.total || 0,
        hasMore: photos.length >= this.data.pageSize,
        latestMetaText
      })
    } catch (error) {
      console.error('加载照片列表失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 下拉刷新
  async onRefresh() {
    this.setData({ refreshing: true })
    await this.loadUser()
    await this.loadPhotos(true)
    this.setData({ refreshing: false })
  },

  // 加载更多
  loadMore() {
    if (!this.data.hasMore || this.data.loading) return

    this.setData({
      page: this.data.page + 1
    })
    this.loadPhotos()
  },

  // 查看照片详情
  viewPhoto(e) {
    const photo = e.currentTarget.dataset.photo

    if (photo.status === 'completed' && photo.resultImageUrl) {
      // 已完成的照片，跳转结果页或预览
      wx.navigateTo({
        url: `/pages/result/result?photoId=${photo.photoId}`
      })
    } else if (photo.status === 'processing') {
      // 处理中，跳转生成页
      wx.navigateTo({
        url: `/pages/generating/generating?photoId=${photo.photoId}`
      })
    } else if (photo.status === 'failed') {
      // 失败的照片，提示可以重新生成
      wx.showModal({
        title: '生成失败',
        content: '该照片生成失败，是否重新生成？',
        confirmText: '重新生成',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.regeneratePhoto(photo)
          }
        }
      })
    }
  },

  // 重新生成照片
  regeneratePhoto(photo) {
    if (!photo.templateId || !photo.originalImageUrl) {
      wx.showToast({
        title: '无法重新生成',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/template-detail/template-detail?id=${photo.templateId}&selfieUrl=${encodeURIComponent(photo.originalImageUrl)}`
    })
  },

  // 预览照片
  previewPhoto(e) {
    const photo = e.currentTarget.dataset.photo
    const url = photo.resultImageUrl || photo.originalImageUrl
    if (!url) return

    const urls = this.data.photos
      .filter(p => p.resultImageUrl || p.originalImageUrl)
      .map(p => p.resultImageUrl || p.originalImageUrl)

    wx.previewImage({
      current: url,
      urls: urls
    })
  },

  // 保存照片到相册
  async savePhoto(e) {
    const photo = e.currentTarget.dataset.photo
    const url = photo.resultImageUrl

    if (!url) {
      wx.showToast({
        title: '照片未完成',
        icon: 'none'
      })
      return
    }

    // 阻止事件冒泡
    e.stopPropagation && e.stopPropagation()

    wx.showLoading({ title: '保存中...' })

    try {
      // 先下载图片
      const downloadRes = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: url,
          success: resolve,
          fail: reject
        })
      })

      if (downloadRes.statusCode !== 200) {
        throw new Error('下载失败')
      }

      // 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: downloadRes.tempFilePath,
          success: resolve,
          fail: reject
        })
      })

      wx.hideLoading()
      wx.showToast({
        title: '已保存到相册',
        icon: 'success'
      })
    } catch (error) {
      wx.hideLoading()
      console.error('保存失败:', error)

      // 可能是没有权限
      if (error.errMsg && error.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请允许保存图片到相册',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting()
            }
          }
        })
      } else {
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    }
  },

  // 删除照片
  deletePhoto(e) {
    const photo = e.currentTarget.dataset.photo

    // 阻止事件冒泡
    e.stopPropagation && e.stopPropagation()

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这张照片吗？',
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })

          try {
            const userOpenId = wx.getStorageSync('userOpenId')

            // 调用删除 API
            await photoApi.deletePhoto(photo.photoId, userOpenId)

            // 删除成功，更新前端列表
            const photos = this.data.photos.filter(p => p.photoId !== photo.photoId)
            this.setData({
              photos,
              total: Math.max(0, this.data.total - 1)
            })

            wx.hideLoading()
            wx.showToast({
              title: '已删除',
              icon: 'success'
            })
          } catch (error) {
            wx.hideLoading()
            console.error('删除照片失败:', error)
            wx.showToast({
              title: '删除失败，请重试',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 去首页
  goToHome() {
    const selectedTemplateStr = wx.getStorageSync('selectedTemplate')
    if (selectedTemplateStr) {
      wx.navigateTo({
        url: '/pages/camera/camera'
      })
      return
    }

    wx.redirectTo({
      url: '/pages/index/index'
    })
  },

  // 返回
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({
          url: '/pages/index/index'
        })
      }
    })
  },

  // 格式化日期
  formatDate(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`

    return `${date.getMonth() + 1}月${date.getDate()}日`
  },

  // 组装顶部拍摄信息
  formatMetaText(photo) {
    if (!photo) return ''
    const rawCreatedAt = photo.rawCreatedAt || photo.createdAtRaw || photo.createdAt
    const parsedDate = rawCreatedAt ? new Date(rawCreatedAt) : null
    const hasValidDate = parsedDate && !Number.isNaN(parsedDate.getTime())
    const dateText = hasValidDate
      ? `${parsedDate.getFullYear()}年${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日`
      : ''
    const locationText = [photo.city, photo.scenicSpot].filter(Boolean).join('')
    if (dateText && locationText) return `${dateText} ${locationText}`
    if (dateText) return dateText
    if (locationText) return locationText
    return ''
  },

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      pending: '待处理',
      processing: '生成中',
      completed: '已完成',
      failed: '生成失败'
    }
    return statusMap[status] || status
  },

  // 更换自拍（不触发生成，仅更新自拍）
  changeSelfie() {
    wx.navigateTo({
      url: '/pages/camera/camera?mode=updateSelfie'
    })
  },

  // 修改昵称
  editNickname() {
    const userOpenId = wx.getStorageSync('userOpenId')
    if (!userOpenId) return

    const currentName = this.data.user.nickname || this.data.user.name || ''

    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: currentName || '请输入昵称',
      confirmText: '保存',
      content: currentName ? `当前昵称：${currentName}` : '',
      success: async (res) => {
        if (!res.confirm) return
        if (typeof res.content !== 'string') {
          wx.showToast({ title: '当前版本不支持修改昵称', icon: 'none' })
          return
        }

        const nickname = res.content.trim()
        if (!nickname) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' })
          return
        }

        if (nickname === currentName) {
          wx.showToast({ title: '昵称未修改', icon: 'none' })
          return
        }

        try {
          await userApi.updateProfile(userOpenId, { name: nickname })
          this.setData({
            user: {
              ...this.data.user,
              nickname,
              name: nickname
            }
          })
          wx.showToast({ title: '已更新', icon: 'success' })
        } catch (error) {
          console.error('更新昵称失败:', error)
          wx.showToast({ title: '更新失败', icon: 'none' })
        }
      },
      fail: () => {
        // ignore
      }
    })
  },

  // 修改头像
  changeAvatar() {
    const userOpenId = wx.getStorageSync('userOpenId')
    if (!userOpenId) return

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: async (res) => {
        const filePath = res.tempFilePaths && res.tempFilePaths[0]
        if (!filePath) return

        const ext = filePath.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'

        wx.showLoading({ title: '上传中...' })
        try {
          const base64 = await new Promise((resolve, reject) => {
            const fs = wx.getFileSystemManager()
            fs.readFile({
              filePath,
              encoding: 'base64',
              success: (data) => resolve(data.data),
              fail: reject
            })
          })

          const uploadRes = await userApi.uploadAvatar(userOpenId, base64, mimeType)
          if (uploadRes && uploadRes.url) {
            this.setData({
              user: {
                ...this.data.user,
                avatar: uploadRes.url
              }
            })
            wx.showToast({ title: '头像已更新', icon: 'success' })
          } else {
            wx.showToast({ title: '上传失败', icon: 'none' })
          }
        } catch (error) {
          console.error('上传头像失败:', error)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  }
})
