App({
  globalData: {
    apiBase: 'https://treasure-raiders-api-y62ah3nlkq-de.a.run.app'
  },
  onLaunch() {
    const configured = wx.getStorageSync('apiBase')
    if (configured) this.globalData.apiBase = configured
  }
})
