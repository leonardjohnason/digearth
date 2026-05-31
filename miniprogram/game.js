const API_BASE = 'https://treasure-raiders-api-y62ah3nlkq-de.a.run.app'
const WIDTH = 750
const HEIGHT = 1334
const TABS = ['world', 'defend', 'raid', 'report']
const TAB_NAMES = { world: '世界', defend: '藏宝', raid: '进攻', report: '战报' }
const COLORS = {
  bg: '#0b1020', panel: '#172033', panel2: '#101827', line: '#2e4268', gold: '#ffd166',
  text: '#f4f7ff', muted: '#9fb0d1', green: '#37d697', red: '#ff6b6b', blue: '#58a6ff'
}

function request(path, method = 'GET', data = {}, token = '') {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${path}`,
      method,
      data,
      timeout: 300000,
      header: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      success: res => res.statusCode >= 200 && res.statusCode < 300 ? resolve(res.data) : reject(new Error((res.data && res.data.error) || `HTTP ${res.statusCode}`)),
      fail: reject
    })
  })
}

function wxLogin() {
  return new Promise(resolve => wx.login({ success: resolve, fail: () => resolve({ code: `dev-${Date.now()}` }) }))
}

class TreasureRaidersGame {
  constructor() {
    this.canvas = wx.createCanvas()
    this.ctx = this.canvas.getContext('2d')
    this.dpr = wx.getSystemInfoSync().pixelRatio || 1
    this.canvas.width = wx.getSystemInfoSync().windowWidth * this.dpr
    this.canvas.height = wx.getSystemInfoSync().windowHeight * this.dpr
    this.ctx.scale(this.dpr, this.dpr)
    this.sw = wx.getSystemInfoSync().windowWidth
    this.sh = wx.getSystemInfoSync().windowHeight
    this.scale = Math.min(this.sw / WIDTH, this.sh / HEIGHT)
    this.xPad = (this.sw - WIDTH * this.scale) / 2
    this.yPad = (this.sh - HEIGHT * this.scale) / 2
    this.tab = 'world'
    this.scroll = 0
    this.buttons = []
    this.log = ['正在连接宝藏世界...']
    this.token = wx.getStorageSync('authToken') || ''
    this.selectedTarget = 0
    this.treasureIndex = 0
    this.sceneIndex = 0
    this.squad = []
    this.game = null
    this.loading = false
    this.flash = 0
    wx.onTouchStart(e => this.handleTouch(e.touches[0]))
    this.login().finally(() => this.reload())
    this.loop()
  }

  toGame(touch) { return { x: (touch.clientX - this.xPad) / this.scale, y: (touch.clientY - this.yPad) / this.scale } }
  addButton(id, x, y, w, h, text, onTap, style = 'primary') { this.buttons.push({ id, x, y, w, h, text, onTap, style }) }
  hit(b, p) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h }

  handleTouch(touch) {
    const p = this.toGame(touch)
    for (const b of [...this.buttons].reverse()) {
      if (this.hit(b, p)) { b.onTap(); return }
    }
  }

  async login() {
    if (this.token) return
    const login = await wxLogin()
    try {
      const data = await request('/api/auth/weixin', 'POST', { code: login.code || `dev-${Date.now()}`, profile: { nickName: '微信探险家' } })
      this.token = data.token
      wx.setStorageSync('authToken', this.token)
    } catch (err) { this.log.unshift(`登录降级：${err.message}`) }
  }

  async api(path, method = 'GET', data = {}) {
    this.loading = true
    try { return await request(path, method, data, this.token) }
    catch (err) { this.log.unshift(`⚠️ ${err.message}`); throw err }
    finally { this.loading = false }
  }

  async reload() {
    try { this.game = await this.api('/api/game'); this.log.unshift('世界已刷新') }
    catch (_) {}
  }

  hydrate(data) { this.game = data }

  async buyDefense(id) {
    try { this.hydrate(await this.api('/api/defense/buy', 'POST', { defenseId: id })); this.log.unshift('布防完成') } catch (_) {}
  }

  async removeDefense(index) {
    try { this.hydrate(await this.api('/api/defense/remove', 'POST', { index })); this.log.unshift('已移除防守点') } catch (_) {}
  }

  async publish() {
    const g = this.game
    if (!g || !g.state.defense.length) { this.log.unshift('至少布置一个机关或守卫再发布'); return }
    try {
      const treasure = g.treasures[this.treasureIndex]
      const scene = g.scenes[this.sceneIndex]
      this.hydrate(await this.api('/api/publish', 'POST', { treasureId: treasure.id, sceneId: scene.id }))
      this.tab = 'world'; this.log.unshift(`📣 ${treasure.name} 已上线给好友挑战`)
    } catch (_) {}
  }

  addUnit(id) {
    if (this.squad.length >= 5) { this.log.unshift('最多 5 人'); return }
    this.squad.push(id)
    this.log.unshift('队员加入小分队')
  }

  async attack() {
    const target = this.game && this.game.targets[this.selectedTarget]
    if (!target) { this.log.unshift('请先选择目标'); return }
    if (!this.squad.length) { this.log.unshift('请先选择小分队'); return }
    try {
      const data = await this.api('/api/attack', 'POST', { targetId: target.id, targetIndex: this.selectedTarget, squad: this.squad })
      this.squad = []
      this.hydrate(data.game)
      this.log = data.report.concat(this.log).slice(0, 30)
      this.tab = 'report'; this.flash = 18
    } catch (_) {}
  }

  rect(x, y, w, h, r, fill, stroke) {
    const c = this.ctx
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath()
    if (fill) { c.fillStyle = fill; c.fill() }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke() }
  }

  text(t, x, y, size = 28, color = COLORS.text, weight = '400', maxWidth = 680) {
    const c = this.ctx
    c.fillStyle = color; c.font = `${weight} ${size}px sans-serif`; c.textBaseline = 'top'
    c.fillText(String(t == null ? '' : t), x, y, maxWidth)
  }

  wrap(t, x, y, size = 24, color = COLORS.muted, maxWidth = 650, lineHeight = 36, maxLines = 3) {
    const c = this.ctx; c.font = `400 ${size}px sans-serif`; c.fillStyle = color; c.textBaseline = 'top'
    const chars = String(t || '').split(''); let line = '', lines = 0
    for (const ch of chars) {
      const test = line + ch
      if (c.measureText(test).width > maxWidth && line) { c.fillText(line, x, y + lines * lineHeight); line = ch; lines++; if (lines >= maxLines) return }
      else line = test
    }
    if (line && lines < maxLines) c.fillText(line, x, y + lines * lineHeight)
  }

  drawButton(x, y, w, h, text, onTap, style = 'primary') {
    const fill = style === 'danger' ? '#4a1f2a' : style === 'ghost' ? '#243452' : '#ffd166'
    const color = style === 'primary' ? '#152033' : COLORS.text
    this.rect(x, y, w, h, 18, fill, style === 'ghost' ? COLORS.line : null)
    this.text(text, x + 20, y + 15, 24, color, '800', w - 40)
    this.addButton(text + x + y, x, y, w, h, text, onTap, style)
  }

  drawHeader() {
    this.rect(24, 28, 702, 210, 28, '#111b30', COLORS.line)
    this.text('LIVE MULTIPLAYER TREASURE WORLD', 50, 54, 22, COLORS.gold, '800')
    this.text('宝藏奇兵', 50, 88, 64, COLORS.text, '900')
    this.text('小游戏版 · 真人藏宝攻防 · Google Cloud 后端', 52, 166, 25, COLORS.muted)
    this.drawButton(520, 60, 150, 58, '刷新', () => this.reload(), 'ghost')
    this.drawButton(520, 136, 150, 58, '分享', () => wx.shareAppMessage && wx.shareAppMessage(), 'primary')
  }

  drawStats(y) {
    const s = this.game ? this.game.state : { gold: 0, diamond: 0, pearl: 0, level: 1, fame: 0 }
    const stats = [['金币', s.gold], ['钻石', s.diamond], ['夜明珠', s.pearl], ['等级', s.level], ['声望', s.fame]]
    stats.forEach((it, i) => { const x = 24 + i * 142; this.rect(x, y, 128, 86, 18, '#15213a'); this.text(it[0], x + 16, y + 12, 20, COLORS.muted); this.text(it[1], x + 16, y + 42, 28, COLORS.gold, '800') })
  }

  drawTabs(y) {
    TABS.forEach((tab, i) => {
      const x = 24 + i * 176
      this.rect(x, y, 160, 58, 18, this.tab === tab ? COLORS.gold : '#17243e')
      this.text(TAB_NAMES[tab], x + 52, y + 15, 25, this.tab === tab ? '#142033' : COLORS.text, '800')
      this.addButton(tab, x, y, 160, 58, tab, () => { this.tab = tab })
    })
  }

  drawMission(y) {
    const g = this.game
    const target = g && g.targets[this.selectedTarget]
    const ready = target && this.squad.length
    this.rect(24, y, 702, 152, 24, '#172033', COLORS.line)
    this.text('当前行动', 50, y + 22, 22, COLORS.gold, '800')
    this.text(target ? target.name : '尚未锁定', 50, y + 52, 34, COLORS.text, '900')
    this.wrap(target ? `${target.ownerName}｜${target.sceneName || target.scene}｜价值 ${target.value}` : '选择目标并组织小分队', 50, y + 92, 24, COLORS.muted, 470, 32, 2)
    this.rect(568, y + 34, 124, 48, 18, ready ? '#1e654f' : '#263552')
    this.text(ready ? '可开战' : '准备中', 590, y + 46, 22, ready ? '#8ff0c9' : COLORS.muted, '800')
    this.drawButton(542, y + 92, 150, 44, '立即开战', () => this.attack(), 'primary')
  }

  drawWorld(y) {
    const g = this.game; if (!g) return this.wrap('正在载入世界...', 50, y, 28)
    this.text('在线宝藏世界', 36, y, 34, COLORS.text, '900')
    this.rect(36, y + 54, 678, 160, 24, '#101827', COLORS.line)
    this.text('实时挑战池', 64, y + 78, 30, COLORS.gold, '800')
    this.wrap(`已发现 ${g.targets.length} 个可挑战藏宝点。真人玩家发布的宝藏会优先显示。`, 64, y + 120, 26)
    this.text('排行榜', 36, y + 238, 34, COLORS.text, '900')
    ;(g.leaderboard || []).slice(0, 5).forEach((p, i) => {
      const yy = y + 290 + i * 76; this.rect(36, yy, 678, 62, 16, '#172033')
      this.text(`#${i + 1}`, 58, yy + 16, 24, COLORS.gold, '800'); this.text(p.nickName || '探险家', 130, yy + 13, 26); this.text(`Lv.${p.level} · 声望 ${p.fame}`, 400, yy + 17, 22, COLORS.muted); this.text(p.score || 0, 640, yy + 16, 24, COLORS.gold, '800')
    })
  }

  drawDefend(y) {
    const g = this.game; if (!g) return
    this.text('藏宝与布防', 36, y, 34, COLORS.text, '900')
    const treasure = g.treasures[this.treasureIndex], scene = g.scenes[this.sceneIndex]
    this.rect(36, y + 54, 678, 154, 24, '#172033', COLORS.line)
    this.text(`宝藏：${treasure.name}｜${treasure.rarity}｜${treasure.value}`, 60, y + 76, 26, COLORS.gold, '800')
    this.text(`地点：${scene.name}`, 60, y + 114, 26)
    this.wrap(scene.note, 60, y + 150, 24)
    this.drawButton(470, y + 75, 90, 46, '换宝', () => { this.treasureIndex = (this.treasureIndex + 1) % g.treasures.length }, 'ghost')
    this.drawButton(580, y + 75, 90, 46, '换地', () => { this.sceneIndex = (this.sceneIndex + 1) % g.scenes.length }, 'ghost')
    this.drawButton(470, y + 136, 200, 50, '发布宝藏', () => this.publish(), 'primary')
    this.text('购买机关/守卫', 36, y + 234, 30, COLORS.text, '900')
    g.defenses.forEach((d, i) => {
      const x = 36 + (i % 2) * 346, yy = y + 282 + Math.floor(i / 2) * 132
      this.rect(x, yy, 326, 112, 18, '#172033', COLORS.line)
      this.text(`${d.icon} ${d.name}`, x + 18, yy + 14, 26, COLORS.text, '800')
      this.text(`${d.cost} 金币`, x + 18, yy + 48, 22, COLORS.gold)
      this.wrap(d.desc, x + 18, yy + 76, 20, COLORS.muted, 190, 25, 1)
      this.drawButton(x + 220, yy + 34, 82, 44, '购买', () => this.buyDefense(d.id), 'primary')
    })
    const base = y + 700
    this.text('当前布防', 36, base, 30, COLORS.text, '900')
    ;(g.state.defense || []).slice(0, 4).forEach((id, i) => { const d = g.defenses.find(x => x.id === id) || {}; this.text(`${i + 1}. ${d.icon || ''} ${d.name || id}`, 54, base + 44 + i * 34, 24); this.addButton(`rm${i}`, 36, base + 36 + i * 34, 300, 32, 'remove', () => this.removeDefense(i)) })
    if (!g.state.defense.length) this.text('尚未布防', 54, base + 44, 24, COLORS.muted)
  }

  drawRaid(y) {
    const g = this.game; if (!g) return
    this.text('进攻目标', 36, y, 34, COLORS.text, '900')
    g.targets.slice(0, 5).forEach((t, i) => {
      const yy = y + 52 + i * 104
      this.rect(36, yy, 678, 88, 18, this.selectedTarget === i ? '#263552' : '#172033', this.selectedTarget === i ? COLORS.gold : COLORS.line)
      this.text(t.name, 58, yy + 12, 25, COLORS.text, '800')
      this.text(`${t.ownerName}｜${t.sceneName || t.scene}｜价值 ${t.value}｜防守 ${t.defenseCount}`, 58, yy + 46, 21, COLORS.muted)
      this.addButton(`target${i}`, 36, yy, 678, 88, 'target', () => { this.selectedTarget = i })
    })
    this.text('组织小分队', 36, y + 590, 34, COLORS.text, '900')
    g.units.forEach((u, i) => {
      const x = 36 + (i % 2) * 346, yy = y + 642 + Math.floor(i / 2) * 116
      this.rect(x, yy, 326, 96, 18, '#172033', COLORS.line)
      this.text(`${u.avatar} ${u.name}`, x + 18, yy + 12, 26, COLORS.text, '800')
      this.text(`${u.cost} 金币`, x + 18, yy + 46, 22, COLORS.gold)
      this.drawButton(x + 214, yy + 28, 92, 44, '加入', () => this.addUnit(u.id), 'primary')
    })
    const names = this.squad.map(id => (g.units.find(u => u.id === id) || {}).name).filter(Boolean).join('、') || '尚未选择'
    this.rect(36, y + 888, 678, 110, 20, '#101827', COLORS.line)
    this.wrap(`已选：${names}`, 58, y + 908, 25, COLORS.text, 480, 34, 2)
    this.drawButton(526, y + 915, 150, 50, '清空', () => { this.squad = [] }, 'ghost')
  }

  drawReport(y) {
    this.text('最新战报', 36, y, 34, COLORS.text, '900')
    this.rect(36, y + 54, 678, 760, 24, '#101827', COLORS.line)
    ;(this.log || []).slice(0, 16).forEach((line, i) => this.wrap(line, 60, y + 80 + i * 42, 23, i < 4 ? COLORS.text : COLORS.muted, 620, 34, 1))
  }

  render() {
    const c = this.ctx
    this.buttons = []
    c.save(); c.clearRect(0, 0, this.sw, this.sh); c.translate(this.xPad, this.yPad); c.scale(this.scale, this.scale)
    this.rect(0, 0, WIDTH, HEIGHT, 0, COLORS.bg)
    this.drawHeader(); this.drawStats(260); this.drawTabs(370); this.drawMission(452)
    const y = 632
    if (this.tab === 'world') this.drawWorld(y)
    if (this.tab === 'defend') this.drawDefend(y)
    if (this.tab === 'raid') this.drawRaid(y)
    if (this.tab === 'report') this.drawReport(y)
    if (this.loading) { this.rect(0, 0, WIDTH, HEIGHT, 0, 'rgba(0,0,0,.36)'); this.text('连接中...', 310, 640, 32, COLORS.gold, '900') }
    if (this.flash > 0) { c.fillStyle = `rgba(255,209,102,${this.flash / 60})`; c.fillRect(0, 0, WIDTH, HEIGHT); this.flash-- }
    c.restore()
  }

  loop() { this.render(); requestAnimationFrame(() => this.loop()) }
}

new TreasureRaidersGame()
