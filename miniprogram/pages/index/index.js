const { request } = require('../../utils/api')

Page({
  data: {
    apiBase: 'http://localhost:8080',
    tab: 'defend',
    loading: false,
    state: { gold: 0, diamond: 0, pearl: 0, xp: 0, level: 1, fame: 0, defense: [] },
    scenes: [], treasures: [], defenses: [], units: [], targets: [],
    treasureIndex: 0,
    sceneIndex: 0,
    selectedTarget: 0,
    squad: [],
    reportText: '暂无战报。'
  },

  onLoad() {
    const app = getApp()
    this.setData({ apiBase: app.globalData.apiBase })
    this.reload()
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
    const targets = data.targets.map((t, idx) => ({ ...t, id: `${t.name}-${idx}`, sceneName: sceneName(t.scene), defenseCount: t.defense.length }))
    this.setData({
      state: data.state,
      scenes: data.scenes,
      treasures: data.treasures,
      defenses: data.defenses,
      units: data.units,
      targets,
      defenseNames: data.state.defense.map(id => (data.defenses.find(d => d.id === id) || {}).name || id),
      stats: [
        { name: '金币', value: data.state.gold },
        { name: '钻石', value: data.state.diamond },
        { name: '夜明珠', value: data.state.pearl },
        { name: '等级', value: data.state.level },
        { name: '声望', value: data.state.fame }
      ],
      squadText: this.data.squad.length ? this.data.squad.map(id => (data.units.find(u => u.id === id) || {}).name).join('、') : '尚未选择',
      reportText: data.state.log && data.state.log.length ? data.state.log.slice(-8).join('\n') : this.data.reportText
    })
  },

  setTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }) },
  pickTreasure(e) { this.setData({ treasureIndex: Number(e.detail.value) }) },
  pickScene(e) { this.setData({ sceneIndex: Number(e.detail.value) }) },
  selectTarget(e) { this.setData({ selectedTarget: Number(e.currentTarget.dataset.index) }) },
  onApiBaseInput(e) { this.setData({ apiBase: e.detail.value }) },

  saveApiBase() {
    const clean = this.data.apiBase.trim().replace(/\/$/, '')
    getApp().globalData.apiBase = clean
    wx.setStorageSync('apiBase', clean)
    wx.showToast({ title: '已保存', icon: 'success' })
    this.reload()
  },

  async buyDefense(e) {
    const data = await this.call('/api/defense/buy', 'POST', { defenseId: e.currentTarget.dataset.id })
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
    this.hydrate(data)
    wx.showToast({ title: '已发布', icon: 'success' })
  },
  addUnit(e) {
    if (this.data.squad.length >= 5) return wx.showToast({ title: '最多 5 人', icon: 'none' })
    const squad = [...this.data.squad, e.currentTarget.dataset.id]
    const squadText = squad.map(id => (this.data.units.find(u => u.id === id) || {}).name).join('、')
    this.setData({ squad, squadText })
  },
  clearSquad() { this.setData({ squad: [], squadText: '尚未选择' }) },
  async attack() {
    const data = await this.call('/api/attack', 'POST', { targetIndex: this.data.selectedTarget, squad: this.data.squad })
    this.setData({ squad: [], squadText: '尚未选择', tab: 'report', reportText: data.report.join('\n') })
    this.hydrate(data.game)
    this.setData({ tab: 'report', reportText: data.report.join('\n') })
  }
})
