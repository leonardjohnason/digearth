import express from 'express'
import helmet from 'helmet'
import { battle } from './battle.js'
import { authMiddleware, exchangeWeixinCode, issueToken, requireAuth } from './auth.js'
import { defenses, freshState, npcTargets, scenes, treasures, units } from './gameData.js'
import { getState, getTreasure, leaderboard, listTreasures, publishTreasure, recordAttack, saveState, updateTreasure, upsertProfile } from './store.js'

const app = express()
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(express.json({ limit: '256kb' }))
app.use(authMiddleware)

const playerId = req => req.auth?.openid || req.header('x-player-id') || req.query.playerId || 'demo'
const fail = (res, status, message) => res.status(status).json({ error: message })
const sceneName = id => (scenes.find(s => s.id === id) || scenes[0]).name
const publicTarget = t => ({
  id: t.id,
  ownerId: t.ownerId,
  ownerName: t.ownerName || t.ownerProfile?.nickName || '神秘玩家',
  ownerAvatar: t.ownerAvatar || t.ownerProfile?.avatarUrl || '',
  name: t.name,
  scene: t.scene,
  sceneName: sceneName(t.scene),
  value: t.value,
  defenseCount: t.defense?.length || 0,
  raidedCount: t.raidedCount || 0,
  isNpc: Boolean(t.isNpc)
})

async function publicGame(req, state) {
  const online = await listTreasures({ excludeOwnerId: playerId(req), limit: 40 })
  const self = state.published ? [{ ...state.published, id: 'self', ownerId: playerId(req), ownerName: state.profile?.nickName || '我', name: '演示：挑战自己的布防' }] : []
  const targets = [...online, ...self, ...npcTargets].map(publicTarget)
  return { me: req.auth || null, state, scenes, treasures, defenses, units, targets, leaderboard: await leaderboard(12) }
}

app.get('/healthz', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/weixin', async (req, res, next) => {
  try {
    const session = await exchangeWeixinCode(req.body.code || '')
    const token = issueToken({ openid: session.openid, unionid: session.unionid, source: session.source })
    const state = await upsertProfile(session.openid, req.body.profile || {})
    res.json({ token, player: { openid: session.openid, source: session.source, profile: state.profile } })
  } catch (err) { next(err) }
})

app.post('/api/profile', requireAuth, async (req, res, next) => {
  try {
    const state = await upsertProfile(playerId(req), req.body.profile || {})
    res.json(await publicGame(req, state))
  } catch (err) { next(err) }
})

app.get('/api/game', async (req, res, next) => {
  try { res.json(await publicGame(req, await getState(playerId(req)))) } catch (err) { next(err) }
})

app.post('/api/reset', async (req, res, next) => {
  try { res.json(await publicGame(req, await saveState(playerId(req), freshState()))) } catch (err) { next(err) }
})

app.post('/api/defense/buy', async (req, res, next) => {
  try {
    const id = playerId(req)
    const state = await getState(id)
    const d = defenses.find(x => x.id === req.body.defenseId)
    if (!d) return fail(res, 400, 'Unknown defense')
    if (state.gold < d.cost) return fail(res, 400, `金币不足，无法购买 ${d.name}`)
    state.gold -= d.cost
    state.defense.push(d.id)
    state.log.push(`已布置 ${d.name}。`)
    res.json(await publicGame(req, await saveState(id, state)))
  } catch (err) { next(err) }
})

app.post('/api/defense/remove', async (req, res, next) => {
  try {
    const id = playerId(req)
    const state = await getState(id)
    const index = Number(req.body.index)
    if (!Number.isInteger(index) || index < 0 || index >= state.defense.length) return fail(res, 400, 'Invalid index')
    const [defenseId] = state.defense.splice(index, 1)
    const d = defenses.find(x => x.id === defenseId)
    state.gold += Math.floor((d?.cost || 0) * .7)
    state.log.push(`移除 ${d?.name || defenseId}，返还 70% 金币。`)
    res.json(await publicGame(req, await saveState(id, state)))
  } catch (err) { next(err) }
})

app.post('/api/publish', async (req, res, next) => {
  try {
    const id = playerId(req)
    const state = await getState(id)
    const t = treasures.find(x => x.id === req.body.treasureId)
    const s = scenes.find(x => x.id === req.body.sceneId)
    if (!t || !s) return fail(res, 400, 'Unknown treasure or scene')
    if (!state.defense.length) return fail(res, 400, '至少布置一个机关或守卫再发布。')
    const fee = Math.round(t.value * (.08 + s.fee * .12))
    if (state.gold < fee) return fail(res, 400, `藏宝费用需要 ${fee} 金币。`)
    state.gold -= fee
    const treasure = {
      ownerProfile: state.profile || null,
      ownerName: state.profile?.nickName || `探险家${id.slice(-4)}`,
      ownerAvatar: state.profile?.avatarUrl || '',
      name: `${state.profile?.nickName || '神秘玩家'}的${t.name}`,
      treasureId: t.id,
      treasureName: t.name,
      treasureImage: t.image,
      scene: s.id,
      value: t.value,
      defense: [...state.defense]
    }
    const published = await publishTreasure(id, treasure)
    state.published = published
    state.fame += 1
    state.log.push(`📣 已在${s.name}埋下${t.name}，上线给好友挑战。`)
    res.json(await publicGame(req, await saveState(id, state)))
  } catch (err) { next(err) }
})

app.post('/api/attack', async (req, res, next) => {
  try {
    const id = playerId(req)
    const state = await getState(id)
    const targets = [...await listTreasures({ excludeOwnerId: id, limit: 50 }), ...(state.published ? [{ ...state.published, id: 'self', ownerId: id, name: '演示：挑战自己的布防' }] : []), ...npcTargets]
    const targetId = req.body.targetId
    const target = targetId ? targets.find(t => t.id === targetId) : targets[Number(req.body.targetIndex || 0)]
    const squad = Array.isArray(req.body.squad) ? req.body.squad.slice(0, 5) : []
    if (!target) return fail(res, 400, 'Unknown target')
    if (!squad.length) return fail(res, 400, '至少选择 1 名队员。')
    const cost = squad.reduce((sum, unitId) => sum + (units.find(u => u.id === unitId)?.cost || 0), 0)
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
    await recordAttack({ attackerId: id, targetId: target.id, ownerId: target.ownerId, won: result.ok, gold: result.gold, squad })

    if (target.id && !target.isNpc && target.id !== 'self') {
      const remote = await getTreasure(target.id)
      if (remote) await updateTreasure(target.id, { raidedCount: (remote.raidedCount || 0) + 1, lastRaidedAt: new Date().toISOString() })
    }

    res.json({ report: result.lines, game: await publicGame(req, await saveState(id, state)) })
  } catch (err) { next(err) }
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Server error' })
})

const port = Number(process.env.PORT || 8080)
app.listen(port, () => console.log(`Treasure Raiders API listening on ${port}`))
