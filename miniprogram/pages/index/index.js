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
    stats: [],
    squadText: '尚未选择',
    selectedTargetName: '尚未锁定',
    selectedTargetMeta: '进入「进攻」选择一个藏宝点',
    nextHint: '先购买至少一个机关/守卫，然后发布宝藏；也可以直接进攻系统目标赚金币。',
    canPublish: false,
    canAttack: false
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
    const selectedIndex = Math.min(this.data.selectedTarget, Math.max(targets.length - 1, 0))
    const selected = targets[selectedIndex]
    const squadText = this.data.squad.length ? this.data.squad.map(id => (data.units.find(u => u.id === id) || {}).name).join('、') : '尚未选择'
    const canPublish = Boolean((data.state.defense || []).length && data.treasures.length && data.scenes.length)
    const canAttack = Boolean(selected && this.data.squad.length)
    const nextHint = canAttack
      ? `已锁定 ${selected.name}，小分队就绪，可以开战。`
      : canPublish
        ? '布防已完成，可以发布到在线世界；或去进攻页选择目标练兵。'
        : '建议先买一个基础守卫/机关，再发布自己的宝藏。'
    this.setData({
      me: data.me || this.data.me,
      authed: Boolean(data.me || wx.getStorageSync('authToken')),
      state: data.state,
      scenes: data.scenes,
      treasures: data.treasures,
      defenses: data.defenses,
      units: data.units,
      targets,
      selectedTarget: selectedIndex,
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
      selectedTargetName: selected ? selected.name : '尚未锁定',
      selectedTargetMeta: selected ? `${selected.ownerName}｜${selected.sceneName}｜价值 ${selected.value}` : '暂无可挑战目标',
      nextHint,
      canPublish,
      canAttack,
      reportText: data.state.log && data.state.log.length ? data.state.log.slice(-8).join('\n') : this.data.reportText
    })
  },

  setTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }) },
  pickTreasure(e) { this.setData({ treasureIndex: Number(e.detail.value) }) },
  pickScene(e) { this.setData({ sceneIndex: Number(e.detail.value), cinematic: 'scene-shift' }) },
  selectTarget(e) {
    const selectedTarget = Number(e.currentTarget.dataset.index)
    const target = this.data.targets[selectedTarget]
    this.setData({
      selectedTarget,
      selectedTargetName: target ? target.name : '尚未锁定',
      selectedTargetMeta: target ? `${target.ownerName}｜${target.sceneName}｜价值 ${target.value}` : '暂无可挑战目标',
      canAttack: Boolean(target && this.data.squad.length),
      nextHint: target ? `已锁定 ${target.name}，请选择小分队。` : this.data.nextHint,
      cinematic: 'target-lock'
    })
  },
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
    if (!this.data.state.defense || !this.data.state.defense.length) {
      return wx.showToast({ title: '至少布置一个防守点', icon: 'none' })
    }
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
    const target = this.data.targets[this.data.selectedTarget]
    this.setData({ squad, squadText, canAttack: Boolean(target), nextHint: target ? `小分队：${squadText}。可以开战。` : '请先选择一个目标。', cinematic: 'squad' })
  },
  clearSquad() { this.setData({ squad: [], squadText: '尚未选择', canAttack: false, nextHint: '小分队已清空，请重新选择队员。' }) },
  async attack() {
    const target = this.data.targets[this.data.selectedTarget]
    if (!target) return wx.showToast({ title: '请先选择目标', icon: 'none' })
    if (!this.data.squad.length) return wx.showToast({ title: '请先选择小分队', icon: 'none' })
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
