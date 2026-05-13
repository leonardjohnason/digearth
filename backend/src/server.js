import express from 'express'
import helmet from 'helmet'
import { battle } from './battle.js'
import { defenses, freshState, npcTargets, scenes, treasures, units } from './gameData.js'
import { getState, saveState } from './store.js'

const app = express()
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(express.json({ limit: '128kb' }))

const playerId = req => req.header('x-player-id') || req.query.playerId || 'demo'
const publicGame = state => ({
  state,
  scenes,
  treasures,
  defenses,
  units,
  targets: [...(state.published ? [{ ...state.published, name: '演示：挑战自己的布防' }] : []), ...npcTargets]
})
const fail = (res, status, message) => res.status(status).json({ error: message })

app.get('/healthz', (_req, res) => res.json({ ok: true }))

app.get('/api/game', async (req, res, next) => {
  try { res.json(publicGame(await getState(playerId(req)))) } catch (err) { next(err) }
})

app.post('/api/reset', async (req, res, next) => {
  try { res.json(publicGame(await saveState(playerId(req), freshState()))) } catch (err) { next(err) }
})

app.post('/api/defense/buy', async (req, res, next) => {
  try {
    const state = await getState(playerId(req))
    const d = defenses.find(x => x.id === req.body.defenseId)
    if (!d) return fail(res, 400, 'Unknown defense')
    if (state.gold < d.cost) return fail(res, 400, `金币不足，无法购买 ${d.name}`)
    state.gold -= d.cost
    state.defense.push(d.id)
    state.log.push(`已布置 ${d.name}。`)
    await saveState(playerId(req), state)
    res.json(publicGame(state))
  } catch (err) { next(err) }
})

app.post('/api/defense/remove', async (req, res, next) => {
  try {
    const state = await getState(playerId(req))
    const index = Number(req.body.index)
    if (!Number.isInteger(index) || index < 0 || index >= state.defense.length) return fail(res, 400, 'Invalid index')
    const [id] = state.defense.splice(index, 1)
    const d = defenses.find(x => x.id === id)
    state.gold += Math.floor((d?.cost || 0) * .7)
    state.log.push(`移除 ${d?.name || id}，返还 70% 金币。`)
    await saveState(playerId(req), state)
    res.json(publicGame(state))
  } catch (err) { next(err) }
})

app.post('/api/publish', async (req, res, next) => {
  try {
    const state = await getState(playerId(req))
    const t = treasures.find(x => x.id === req.body.treasureId)
    const s = scenes.find(x => x.id === req.body.sceneId)
    if (!t || !s) return fail(res, 400, 'Unknown treasure or scene')
    if (!state.defense.length) return fail(res, 400, '至少布置一个机关或守卫再发布。')
    const fee = Math.round(t.value * (.08 + s.fee * .12))
    if (state.gold < fee) return fail(res, 400, `藏宝费用需要 ${fee} 金币。`)
    state.gold -= fee
    state.published = { name: `我的${t.name}`, scene: s.id, value: t.value, defense: [...state.defense] }
    state.fame += 1
    state.log.push(`📣 已在${s.name}埋下${t.name}，支付 ${fee} 金币，布防 ${state.defense.length} 个。`)
    await saveState(playerId(req), state)
    res.json(publicGame(state))
  } catch (err) { next(err) }
})

app.post('/api/attack', async (req, res, next) => {
  try {
    const state = await getState(playerId(req))
    const targets = [...(state.published ? [{ ...state.published, name: '演示：挑战自己的布防' }] : []), ...npcTargets]
    const target = targets[Number(req.body.targetIndex || 0)]
    const squad = Array.isArray(req.body.squad) ? req.body.squad.slice(0, 5) : []
    if (!target) return fail(res, 400, 'Unknown target')
    if (!squad.length) return fail(res, 400, '至少选择 1 名队员。')
    const cost = squad.reduce((sum, id) => sum + (units.find(u => u.id === id)?.cost || 0), 0)
    if (state.gold < cost) return fail(res, 400, `金币不足，雇佣小队需要 ${cost} 金币。`)
    state.gold -= cost
    const result = battle(target, squad)
    state.gold += result.gold
    state.xp += result.xp
    state.pearl += result.pearl
    state.fame += result.fame
    if (state.xp >= state.level * 500) {
      state.xp = 0
      state.level += 1
      result.lines.push(`⬆️ 你升级为 ${state.level} 级藏宝大师。`)
    }
    state.log.push(result.lines[result.lines.length - 1])
    await saveState(playerId(req), state)
    res.json({ report: result.lines, game: publicGame(state) })
  } catch (err) { next(err) }
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Server error' })
})

const port = Number(process.env.PORT || 8080)
app.listen(port, () => console.log(`Treasure Raiders API listening on ${port}`))
