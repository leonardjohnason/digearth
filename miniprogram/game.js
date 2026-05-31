const API_BASE = 'https://treasure-raiders-api-y62ah3nlkq-de.a.run.app'
const WIDTH = 750
const HEIGHT = 1334
const COLORS = {
  bg: '#07111f', sky1: '#102746', sky2: '#223f63', panel: '#142033', line: '#31486f',
  gold: '#ffd166', text: '#f4f7ff', muted: '#9fb0d1', green: '#37d697', red: '#ff6b6b', blue: '#58a6ff', sand: '#d9a85b'
}

const LEVELS = [
  { id: 1, name: '静谧山谷·新手遗物', scene: 'valley', targetId: 'npc-cliff', goal: '收集3枚金币，击败山谷守卫，挖出新手遗物', treasure: '新手遗物', bg: ['#15375a', '#1c6a7b'], traps: [{ x: 360, y: 760, r: 34, type: 'crossbow' }], coins: [{ x: 210, y: 620 }, { x: 520, y: 680 }, { x: 370, y: 910 }], guardian: { x: 375, y: 1030, hp: 3, icon: '🛡️' } },
  { id: 2, name: '湖底沉船·夜明珠匣', scene: 'lake', goal: '躲避氧气泡陷阱，找到夜明珠匣', locked: true, bg: ['#0c3559', '#0d6472'] },
  { id: 3, name: '雪山秘境·龙纹金杯', scene: 'snow', goal: '破解冰封迷阵，夺回龙纹金杯', locked: true, bg: ['#244e78', '#d3f4ff'] },
  { id: 4, name: '孤岛灯塔·海盗王冠', scene: 'island', goal: '点亮灯塔，突破海盗防线', locked: true, bg: ['#241d57', '#e69b5f'] },
  { id: 5, name: '火山地宫·终极宝库', scene: 'volcano', goal: '限时穿越岩浆，开启终极宝库', locked: true, bg: ['#3a1520', '#f06a3c'] }
]

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

function wxLogin() { return new Promise(resolve => wx.login({ success: resolve, fail: () => resolve({ code: `dev-${Date.now()}` }) })) }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }

class SoundFX {
  constructor() { this.enabled = true }
  beep(kind = 'tap') {
    if (!this.enabled || !wx.createInnerAudioContext) return
    try {
      const a = wx.createInnerAudioContext()
      a.obeyMuteSwitch = false
      a.volume = kind === 'win' ? 0.35 : 0.18
      a.src = `data:audio/wav;base64,${this.tone(kind)}`
      a.onEnded(() => a.destroy())
      a.onError(() => a.destroy())
      a.play()
    } catch (_) {}
  }
  tone(kind) {
    // Tiny silent-safe WAV blips. If a client rejects data URI audio, gameplay continues.
    return kind === 'win'
      ? 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
      : 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
  }
}

class TreasureRaidersGame {
  constructor() {
    this.canvas = wx.createCanvas()
    this.ctx = this.canvas.getContext('2d')
    const sys = wx.getSystemInfoSync()
    this.dpr = sys.pixelRatio || 1
    this.sw = sys.windowWidth
    this.sh = sys.windowHeight
    this.canvas.width = this.sw * this.dpr
    this.canvas.height = this.sh * this.dpr
    this.ctx.scale(this.dpr, this.dpr)
    this.scale = Math.min(this.sw / WIDTH, this.sh / HEIGHT)
    this.xPad = (this.sw - WIDTH * this.scale) / 2
    this.yPad = (this.sh - HEIGHT * this.scale) / 2
    this.buttons = []
    this.mode = 'menu'
    this.levelIndex = 0
    this.token = wx.getStorageSync('authToken') || ''
    this.profile = wx.getStorageSync('profile') || { nickName: '微信探险家' }
    this.game = null
    this.log = ['欢迎来到宝藏奇兵。']
    this.loading = false
    this.fx = new SoundFX()
    this.last = Date.now()
    this.t = 0
    this.resetLevel()
    wx.onTouchStart(e => this.onTouchStart(e.touches[0]))
    wx.onTouchMove(e => this.onTouchMove(e.touches[0]))
    wx.onTouchEnd(() => this.joystick = null)
    wx.onShow(() => { this.last = Date.now() })
    wx.onShareAppMessage(() => ({ title: '宝藏奇兵：来闯我的藏宝关卡', imageUrl: 'assets/share.svg' }))
    this.login().finally(() => this.reload())
    this.loop()
  }

  resetLevel() {
    const lv = LEVELS[this.levelIndex]
    this.player = { x: 110, y: 1030, r: 28, hp: 5, coins: 0, atkCooldown: 0, inv: 0 }
    this.levelState = {
      coins: (lv.coins || []).map(c => ({ ...c, taken: false, pulse: 0 })),
      traps: (lv.traps || []).map(t => ({ ...t, phase: 0 })),
      guardian: lv.guardian ? { ...lv.guardian } : null,
      won: false,
      message: lv.goal
    }
    this.joystick = null
    this.effects = []
  }

  toGame(touch) { return { x: (touch.clientX - this.xPad) / this.scale, y: (touch.clientY - this.yPad) / this.scale } }
  addButton(id, x, y, w, h, text, onTap, style = 'primary') { this.buttons.push({ id, x, y, w, h, text, onTap, style }) }
  hit(b, p) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h }

  onTouchStart(touch) {
    const p = this.toGame(touch)
    for (const b of [...this.buttons].reverse()) if (this.hit(b, p)) { this.fx.beep('tap'); b.onTap(); return }
    if (this.mode === 'play') this.joystick = { sx: p.x, sy: p.y, x: p.x, y: p.y }
  }
  onTouchMove(touch) { if (this.joystick) { const p = this.toGame(touch); this.joystick.x = p.x; this.joystick.y = p.y } }

  async login(forceProfile = false) {
    if (this.token && !forceProfile) return
    const login = await wxLogin()
    try {
      const data = await request('/api/auth/weixin', 'POST', { code: login.code || `dev-${Date.now()}`, profile: this.profile })
      this.token = data.token
      wx.setStorageSync('authToken', this.token)
      this.profile = data.player.profile || this.profile
      wx.setStorageSync('profile', this.profile)
      this.log.unshift(`微信登录成功：${data.player.source === 'weixin' ? '正式账号' : '开发模式'}`)
    } catch (err) { this.log.unshift(`登录失败：${err.message}`) }
  }

  async chooseAvatar() {
    if (!wx.chooseAvatar) { this.log.unshift('当前微信版本不支持头像选择'); return }
    wx.chooseAvatar({ success: async res => { this.profile.avatarUrl = res.avatarUrl; wx.setStorageSync('profile', this.profile); await this.syncProfile() } })
  }
  async syncProfile() {
    try { this.game = await this.api('/api/profile', 'POST', { profile: this.profile }); this.log.unshift('微信资料已同步') } catch (_) {}
  }
  async api(path, method = 'GET', data = {}) {
    this.loading = true
    try { return await request(path, method, data, this.token) }
    catch (err) { this.log.unshift(`⚠️ ${err.message}`); throw err }
    finally { this.loading = false }
  }
  async reload() { try { this.game = await this.api('/api/game'); this.log.unshift('世界数据已同步') } catch (_) {} }

  startLevel(i) {
    if (LEVELS[i].locked) { this.log.unshift('后续关卡已设计，先完成第一关后解锁。'); return }
    this.levelIndex = i; this.resetLevel(); this.mode = 'play'
  }

  async finishLevel() {
    if (this.levelState.won) return
    this.levelState.won = true
    this.mode = 'win'
    this.fx.beep('win')
    this.log.unshift('第一关完成：新手遗物已收入宝库。')
    try {
      // Use existing backend battle endpoint to persist meaningful progression.
      const data = await this.api('/api/attack', 'POST', { targetId: LEVELS[0].targetId, squad: ['warrior', 'rogue', 'engineer'] })
      this.game = data.game
      this.log = ['云端奖励已结算'].concat(data.report.slice(-3), this.log).slice(0, 30)
    } catch (_) {}
  }

  update(dt) {
    this.t += dt
    if (this.player.atkCooldown > 0) this.player.atkCooldown -= dt
    if (this.player.inv > 0) this.player.inv -= dt
    if (this.mode !== 'play') return
    const p = this.player
    if (this.joystick) {
      const dx = this.joystick.x - this.joystick.sx, dy = this.joystick.y - this.joystick.sy
      const len = Math.hypot(dx, dy)
      if (len > 8) {
        const speed = 260
        p.x += dx / len * speed * dt
        p.y += dy / len * speed * dt
      }
    }
    p.x = clamp(p.x, 56, WIDTH - 56); p.y = clamp(p.y, 430, HEIGHT - 92)
    for (const c of this.levelState.coins) {
      c.pulse += dt
      if (!c.taken && dist(p, c) < 48) { c.taken = true; p.coins++; this.fx.beep('coin'); this.effects.push({ x: c.x, y: c.y, text: '+金币', ttl: 0.8 }) }
    }
    for (const trap of this.levelState.traps) {
      trap.phase += dt
      if (dist(p, trap) < trap.r + p.r && p.inv <= 0) { p.hp--; p.inv = 1.2; this.fx.beep('hit'); this.effects.push({ x: p.x, y: p.y - 40, text: '-生命', ttl: 0.8 }); if (p.hp <= 0) { this.log.unshift('探险家倒下了，已重置第一关。'); this.resetLevel() } }
    }
    const g = this.levelState.guardian
    if (g && g.hp > 0 && dist(p, g) < 76 && p.atkCooldown <= 0) {
      g.hp--; p.atkCooldown = 0.8; this.fx.beep('hit'); this.effects.push({ x: g.x, y: g.y - 60, text: '攻击!', ttl: 0.7 })
    }
    if (g && g.hp <= 0 && p.coins >= this.levelState.coins.length && dist(p, { x: 630, y: 500 }) < 80) this.finishLevel()
    this.effects.forEach(e => { e.ttl -= dt; e.y -= 36 * dt })
    this.effects = this.effects.filter(e => e.ttl > 0)
  }

  rect(x, y, w, h, r, fill, stroke) {
    const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath()
    if (fill) { c.fillStyle = fill; c.fill() } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke() }
  }
  circle(x, y, r, fill, stroke) { const c = this.ctx; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill() } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke() } }
  text(t, x, y, size = 28, color = COLORS.text, weight = '400', maxWidth = 680) { const c = this.ctx; c.fillStyle = color; c.font = `${weight} ${size}px sans-serif`; c.textBaseline = 'top'; c.fillText(String(t == null ? '' : t), x, y, maxWidth) }
  center(t, x, y, size = 28, color = COLORS.text, weight = '700') { const c = this.ctx; c.fillStyle = color; c.font = `${weight} ${size}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, x, y); c.textAlign = 'left' }
  wrap(t, x, y, size = 24, color = COLORS.muted, maxWidth = 650, lineHeight = 36, maxLines = 3) {
    const c = this.ctx; c.font = `400 ${size}px sans-serif`; c.fillStyle = color; c.textBaseline = 'top'; let line = '', lines = 0
    for (const ch of String(t || '')) { const test = line + ch; if (c.measureText(test).width > maxWidth && line) { c.fillText(line, x, y + lines * lineHeight); line = ch; lines++; if (lines >= maxLines) return } else line = test }
    if (line && lines < maxLines) c.fillText(line, x, y + lines * lineHeight)
  }
  button(x, y, w, h, text, onTap, style = 'primary') { const fill = style === 'ghost' ? '#243452' : style === 'red' ? '#4b2530' : COLORS.gold; this.rect(x, y, w, h, 20, fill, style === 'ghost' ? COLORS.line : null); this.center(text, x + w / 2, y + h / 2, 25, style === 'primary' ? '#162033' : COLORS.text, '900'); this.addButton(text + x + y, x, y, w, h, text, onTap, style) }

  bg(a = COLORS.sky1, b = COLORS.sky2) {
    const c = this.ctx, g = c.createLinearGradient(0, 0, 0, HEIGHT); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, WIDTH, HEIGHT)
    for (let i = 0; i < 36; i++) { this.circle((i * 97 + this.t * 16) % 820 - 40, 80 + (i * 53) % 280, 1.4 + (i % 3), 'rgba(255,255,255,.32)') }
  }

  drawTop() {
    this.rect(24, 24, 702, 138, 28, 'rgba(10,18,32,.78)', COLORS.line)
    this.text('宝藏奇兵', 50, 45, 48, COLORS.text, '900')
    this.text(this.profile.nickName || '微信探险家', 52, 104, 24, COLORS.gold, '800')
    const s = this.game && this.game.state
    this.text(`金币 ${s ? s.gold : 0}  Lv.${s ? s.level : 1}  声望 ${s ? s.fame : 0}`, 330, 58, 25, COLORS.gold, '800')
    this.button(570, 98, 120, 42, '同步', () => this.reload(), 'ghost')
  }

  drawMenu() {
    this.bg('#0c2344', '#0d5f74'); this.drawTop()
    this.text('五关藏宝冒险', 42, 195, 42, COLORS.text, '900')
    this.wrap('先完成第一关：操控探险家收集金币，避开机关，击败守卫，在宝箱处完成结算。后四关已做成关卡规划，后续逐步扩展。', 42, 252, 26, '#d7e6ff', 664, 38, 4)
    LEVELS.forEach((lv, i) => {
      const y = 420 + i * 132
      this.rect(42, y, 666, 108, 24, lv.locked ? 'rgba(20,32,51,.68)' : '#142033', lv.locked ? '#26364e' : COLORS.gold)
      this.text(`${lv.id}. ${lv.name}`, 70, y + 18, 29, lv.locked ? COLORS.muted : COLORS.text, '900')
      this.wrap(lv.goal, 70, y + 56, 22, lv.locked ? '#7585a0' : COLORS.muted, 450, 30, 1)
      this.text(lv.locked ? '规划中' : '可玩', 610, y + 32, 25, lv.locked ? '#7585a0' : COLORS.green, '900')
      this.addButton(`level${i}`, 42, y, 666, 108, lv.name, () => this.startLevel(i))
    })
    this.button(72, 1115, 250, 60, '微信登录/同步', () => this.login(true), 'primary')
    this.button(428, 1115, 250, 60, '选择头像', () => this.chooseAvatar(), 'ghost')
  }

  drawScene() {
    const lv = LEVELS[this.levelIndex]
    this.bg(lv.bg[0], lv.bg[1])
    this.drawTop()
    // terrain
    this.rect(0, 390, WIDTH, 944, 0, '#2d6b4f')
    this.rect(54, 450, 642, 790, 34, '#2f7e55', '#9ddc8d')
    for (let i = 0; i < 8; i++) { this.circle(80 + i * 92, 520 + (i % 3) * 170, 18, '#1f5b3b') }
    // path and treasure
    this.rect(120, 565, 505, 560, 90, 'rgba(226,184,96,.46)')
    this.circle(630, 500, 54, COLORS.gold, '#fff0a8'); this.center('宝箱', 630, 500, 23, '#5b3600', '900')
    this.text(lv.name, 44, 190, 35, COLORS.text, '900'); this.wrap(lv.goal, 44, 238, 24, '#dbe8ff', 660, 34, 2)
    this.text(`生命 ${'❤'.repeat(this.player.hp)}  金币 ${this.player.coins}/${this.levelState.coins.length}`, 44, 318, 28, COLORS.gold, '900')
    for (const coin of this.levelState.coins) if (!coin.taken) { const r = 20 + Math.sin(this.t * 6 + coin.x) * 3; this.circle(coin.x, coin.y, r, COLORS.gold, '#fff4b4'); this.center('¥', coin.x, coin.y + 1, 22, '#7a4b00', '900') }
    for (const trap of this.levelState.traps) { const pulse = 1 + Math.sin(this.t * 5) * .12; this.circle(trap.x, trap.y, trap.r * pulse, 'rgba(255,80,80,.28)', COLORS.red); this.center('弩', trap.x, trap.y, 27, '#ffd6d6', '900') }
    const g = this.levelState.guardian
    if (g && g.hp > 0) { this.circle(g.x, g.y, 48, '#263552', COLORS.gold); this.center(g.icon, g.x, g.y - 2, 42); this.text(`守卫 ${g.hp}/3`, g.x - 48, g.y + 58, 23, COLORS.text, '800') }
    const blink = this.player.inv > 0 && Math.floor(this.t * 12) % 2 === 0
    if (!blink) { this.circle(this.player.x, this.player.y, this.player.r, '#56d6a6', '#dcfff2'); this.center('🧭', this.player.x, this.player.y - 2, 30) }
    for (const e of this.effects) this.center(e.text, e.x, e.y, 24, COLORS.gold, '900')
    this.drawJoystick()
    this.button(44, 1220, 150, 56, '返回', () => { this.mode = 'menu' }, 'ghost')
    this.button(556, 1220, 150, 56, '重来', () => this.resetLevel(), 'ghost')
  }

  drawJoystick() {
    const base = this.joystick || { sx: 135, sy: 1135, x: 135, y: 1135 }
    this.circle(base.sx, base.sy, 78, 'rgba(255,255,255,.13)', 'rgba(255,255,255,.35)')
    const dx = clamp(base.x - base.sx, -52, 52), dy = clamp(base.y - base.sy, -52, 52)
    this.circle(base.sx + dx, base.sy + dy, 34, 'rgba(255,209,102,.9)')
    this.text('按住拖动移动', 46, 1024, 23, '#dbe8ff')
  }

  drawWin() {
    this.drawScene()
    this.rect(58, 365, 634, 420, 32, 'rgba(10,18,32,.92)', COLORS.gold)
    this.center('第一关完成！', WIDTH / 2, 430, 48, COLORS.gold, '900')
    this.wrap('你收集了山谷金币，击败守卫，并打开新手遗物宝箱。云端奖励已经结算到你的微信登录账号。', 110, 500, 29, COLORS.text, 530, 44, 4)
    this.button(110, 675, 220, 64, '再玩一次', () => { this.resetLevel(); this.mode = 'play' }, 'primary')
    this.button(420, 675, 220, 64, '关卡菜单', () => { this.mode = 'menu' }, 'ghost')
  }

  drawLoading() { if (this.loading) { this.rect(0, 0, WIDTH, HEIGHT, 0, 'rgba(0,0,0,.32)'); this.center('连接云端...', WIDTH / 2, HEIGHT / 2, 34, COLORS.gold, '900') } }

  render() {
    this.buttons = []
    const c = this.ctx
    c.save(); c.clearRect(0, 0, this.sw, this.sh); c.translate(this.xPad, this.yPad); c.scale(this.scale, this.scale)
    if (this.mode === 'play') this.drawScene(); else if (this.mode === 'win') this.drawWin(); else this.drawMenu()
    this.drawLoading()
    c.restore()
  }
  loop() { const now = Date.now(); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.update(dt); this.render(); requestAnimationFrame(() => this.loop()) }
}

new TreasureRaidersGame()
