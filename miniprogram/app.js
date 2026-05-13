App({
  globalData: {
    // Replace with your Cloud Run HTTPS URL after deployment, e.g. https://treasure-raiders-xxx-uc.a.run.app
    apiBase: 'http://localhost:8080'
  },
  onLaunch() {
    const configured = wx.getStorageSync('apiBase')
    if (configured) this.globalData.apiBase = configured
  }
})
