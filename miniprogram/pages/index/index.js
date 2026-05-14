const { request, saveToken } = require('../../utils/api')

Page({
  data: {
    apiBase: 'http://localhost:8080',
    tab: 'world',
    loading: false,
    authed: false,
    me: null,
    leaderboard: [],
    state: { gold: 0, diamond: 0, pearl: 0, xp: 0, level: 1, fame: 0, defense: [] },
    scenes: [], treasures: [], defenses: [], units: [], targets: [],
    treasureIndex: 0,
    sceneIndex: 0,
    selectedTarget: 0,
    squad: [],
    battleLines: [],
    reportText: '暂无战报。',
    cinematic: 'idle',
    defenseNames: [],
    stats: []
  },

  onLoad() {
    const app = getApp()
    this.setData({ apiBase: app.globalData.apiBase, authed: Boolean(wx.getStorageSync('authToken')) })
    this.loginSilently().finally(() => this.reload())
  },

  wxLogin() {
    return new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
  },

  async loginSilently() {
    if (wx.getStorageSync('authToken')) return
    try {
      const login = await this.wxLogin()
      const profile = wx.getStorageSync('profile') || { nickName: '微信探险家', avatarUrl: '' }
      const data = await request('/api/auth/weixin', 'POST', { code: login.code || `dev-${Date.now()}`, profile }, { retries: 0 })
      saveToken(data.token)
      this.setData({ authed: true, me: data.player })
    } catch (err) {
      console.warn('login failed', err)
    }
  },

  async call(path, method = 'GET', data = {}) {
    this.setData({ loading: true })
    try {
      return await request(path, method, data)
    } catch (err) {
      wx.showToast({ title: err.message || '请求失败', icon: 'none' })
      throw err
    } finally {
      this.setData({ loading: false })
    }
  },

  async reload() {
    try {
      const data = await this.call('/api/game')
      this.hydrate(data)
    } catch (_) {}
  },

  hydrate(data) {
    const sceneName = id => (data.scenes.find(s => s.id === id) || {}).name || id
    const targets = (data.targets || []).map((t, idx) => ({ ...t, sceneName: t.sceneName || sceneName(t.scene), uiIndex: idx }))
    const squadText = this.data.squad.length ? this.data.squad.map(id => (data.units.find(u => u.id === id) || {}).name).join('、') : '尚未选择'
    this.setData({
      me: data.me || this.data.me,
      authed: Boolean(data.me || wx.getStorageSync('authToken')),
      state: data.state,
      scenes: data.scenes,
      treasures: data.treasures,
      defenses: data.defenses,
      units: data.units,
      targets,
      leaderboard: data.leaderboard || [],
      defenseNames: (data.state.defense || []).map(id => {
        const d = data.defenses.find(x => x.id === id) || {}
        return `${d.icon || ''} ${d.name || id}`
      }),
      stats: [
        { name: '金币', value: data.state.gold },
        { name: '钻石', value: data.state.diamond },
        { name: '夜明珠', value: data.state.pearl },
        { name: '等级', value: data.state.level },
        { name: '声望', value: data.state.fame }
      ],
      squadText,
      reportText: data.state.log && data.state.log.length ? data.state.log.slice(-8).join('\n') : this.data.reportText
    })
  },

  setTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }) },
  pickTreasure(e) { this.setData({ treasureIndex: Number(e.detail.value) }) },
  pickScene(e) { this.setData({ sceneIndex: Number(e.detail.value), cinematic: 'scene-shift' }) },
  selectTarget(e) { this.setData({ selectedTarget: Number(e.currentTarget.dataset.index), cinematic: 'target-lock' }) },
  onApiBaseInput(e) { this.setData({ apiBase: e.detail.value }) },

  saveApiBase() {
    const clean = this.data.apiBase.trim().replace(/\/$/, '')
    getApp().globalData.apiBase = clean
    wx.setStorageSync('apiBase', clean)
    wx.removeStorageSync('authToken')
    wx.showToast({ title: '已保存', icon: 'success' })
    this.loginSilently().finally(() => this.reload())
  },

  async onChooseAvatar(e) {
    const profile = { ...(wx.getStorageSync('profile') || {}), avatarUrl: e.detail.avatarUrl }
    wx.setStorageSync('profile', profile)
    const data = await this.call('/api/profile', 'POST', { profile })
    this.hydrate(data)
  },

  onNicknameInput(e) {
    const profile = { ...(wx.getStorageSync('profile') || {}), nickName: e.detail.value || '微信探险家' }
    wx.setStorageSync('profile', profile)
  },

  async saveProfile() {
    const profile = wx.getStorageSync('profile') || { nickName: '微信探险家' }
    const data = await this.call('/api/profile', 'POST', { profile })
    this.hydrate(data)
    wx.showToast({ title: '身份已同步', icon: 'success' })
  },

  async buyDefense(e) {
    const data = await this.call('/api/defense/buy', 'POST', { defenseId: e.currentTarget.dataset.id })
    this.setData({ cinematic: 'fortify' })
    this.hydrate(data)
  },
  async removeDefense(e) {
    const data = await this.call('/api/defense/remove', 'POST', { index: Number(e.currentTarget.dataset.index) })
    this.hydrate(data)
  },
  async publishTreasure() {
    const treasure = this.data.treasures[this.data.treasureIndex]
    const scene = this.data.scenes[this.data.sceneIndex]
    const data = await this.call('/api/publish', 'POST', { treasureId: treasure.id, sceneId: scene.id })
    this.setData({ cinematic: 'publish', tab: 'world' })
    this.hydrate(data)
    wx.showToast({ title: '已上线给好友', icon: 'success' })
  },
  addUnit(e) {
    if (this.data.squad.length >= 5) return wx.showToast({ title: '最多 5 人', icon: 'none' })
    const squad = [...this.data.squad, e.currentTarget.dataset.id]
    const squadText = squad.map(id => (this.data.units.find(u => u.id === id) || {}).name).join('、')
    this.setData({ squad, squadText, cinematic: 'squad' })
  },
  clearSquad() { this.setData({ squad: [], squadText: '尚未选择' }) },
  async attack() {
    const target = this.data.targets[this.data.selectedTarget]
    const data = await this.call('/api/attack', 'POST', { targetId: target && target.id, targetIndex: this.data.selectedTarget, squad: this.data.squad })
    this.setData({ squad: [], squadText: '尚未选择', tab: 'report', reportText: data.report.join('\n'), battleLines: data.report, cinematic: 'battle' })
    this.hydrate(data.game)
    this.setData({ tab: 'report', reportText: data.report.join('\n'), battleLines: data.report })
  },

  shareGame() {
    wx.showShareMenu({ withShareTicket: true })
  },

  onShareAppMessage() {
    const published = this.data.state.published
    return {
      title: published ? `来挖我的宝藏：${published.name}` : '宝藏奇兵：来一场真人藏宝攻防',
      path: '/pages/index/index',
      imageUrl: '/assets/share.svg'
    }
  }
})
