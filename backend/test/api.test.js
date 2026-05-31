import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

process.env.NODE_ENV = 'test'
process.env.USE_MEMORY_STORE = '1'
process.env.SESSION_SECRET = 'test-secret'

const { app } = await import('../src/server.js')
const { battle } = await import('../src/battle.js')

let server
let baseUrl

before(async () => {
  server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s))
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise(resolve => server.close(resolve))
})

async function api(path, { method = 'GET', playerId = 'test-player', body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-player-id': playerId
    },
    body: body == null ? undefined : JSON.stringify(body)
  })
  const data = await res.json()
  return { res, data }
}

test('health and game payload expose playable catalog data', async () => {
  const health = await api('/healthz')
  assert.equal(health.res.status, 200)
  assert.deepEqual(health.data, { ok: true })

  const { res, data } = await api('/api/game')
  assert.equal(res.status, 200)
  assert.equal(data.state.gold, 3500)
  assert.ok(data.scenes.length >= 5)
  assert.ok(data.treasures.length >= 4)
  assert.ok(data.defenses.length >= 6)
  assert.ok(data.units.length >= 4)
  assert.ok(data.targets.length >= 3)
})

test('player can buy defense, publish treasure, and appear as attack target', async () => {
  const playerId = `publisher-${Date.now()}`

  const bought = await api('/api/defense/buy', {
    method: 'POST',
    playerId,
    body: { defenseId: 'guard' }
  })
  assert.equal(bought.res.status, 200)
  assert.equal(bought.data.state.gold, 3200)
  assert.deepEqual(bought.data.state.defense, ['guard'])

  const published = await api('/api/publish', {
    method: 'POST',
    playerId,
    body: { treasureId: 'relic', sceneId: 'valley' }
  })
  assert.equal(published.res.status, 200)
  assert.equal(published.data.state.published.treasureId, 'relic')
  assert.equal(published.data.state.fame, 1)

  const viewer = await api('/api/game', { playerId: `${playerId}-viewer` })
  assert.ok(viewer.data.targets.some(t => t.ownerId === playerId && t.value === 1000 && t.name.includes('新手遗物')))
})

test('attack endpoint validates squads and returns a battle report', async () => {
  const empty = await api('/api/attack', {
    method: 'POST',
    playerId: `attacker-empty-${Date.now()}`,
    body: { targetId: 'npc-cliff', squad: [] }
  })
  assert.equal(empty.res.status, 400)
  assert.match(empty.data.error, /至少选择/)

  const attack = await api('/api/attack', {
    method: 'POST',
    playerId: `attacker-${Date.now()}`,
    body: { targetId: 'npc-cliff', squad: ['warrior', 'rogue', 'mage'] }
  })
  assert.equal(attack.res.status, 200)
  assert.ok(Array.isArray(attack.data.report))
  assert.ok(attack.data.report.length > 2)
  assert.ok(attack.data.game.state.xp >= 35)
})

test('battle engine rejects empty parties without rewards', () => {
  const result = battle({ name: '空城', scene: 'valley', value: 1000, defense: [] }, [])
  assert.equal(result.ok, false)
  assert.equal(result.gold, 0)
  assert.match(result.lines.join('\n'), /至少选择/)
})
