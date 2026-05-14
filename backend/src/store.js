import { Firestore } from '@google-cloud/firestore'
import { freshState } from './gameData.js'

const useMemory = process.env.USE_MEMORY_STORE === '1' || process.env.NODE_ENV === 'test'
const memory = {
  players: new Map(),
  treasures: new Map(),
  attacks: []
}
const firestore = useMemory ? null : new Firestore()
const PLAYERS = process.env.FIRESTORE_PLAYERS_COLLECTION || 'treasure_raiders_players'
const TREASURES = process.env.FIRESTORE_TREASURES_COLLECTION || 'treasure_raiders_treasures'
const ATTACKS = process.env.FIRESTORE_ATTACKS_COLLECTION || 'treasure_raiders_attacks'

const clone = value => structuredClone(value)
const now = () => new Date().toISOString()

export async function getState(playerId = 'demo') {
  if (useMemory) {
    if (!memory.players.has(playerId)) memory.players.set(playerId, freshState())
    return clone(memory.players.get(playerId))
  }
  const ref = firestore.collection(PLAYERS).doc(playerId)
  const snap = await ref.get()
  if (!snap.exists) {
    const state = freshState()
    await ref.set(state)
    return state
  }
  return snap.data()
}

export async function saveState(playerId = 'demo', state) {
  const clean = { ...state, updatedAt: now() }
  if (useMemory) {
    memory.players.set(playerId, clone(clean))
    return clean
  }
  await firestore.collection(PLAYERS).doc(playerId).set(clean, { merge: false })
  return clean
}

export async function upsertProfile(playerId, profile = {}) {
  const state = await getState(playerId)
  state.profile = {
    nickName: profile.nickName || state.profile?.nickName || `探险家${playerId.slice(-4)}`,
    avatarUrl: profile.avatarUrl || state.profile?.avatarUrl || '',
    city: profile.city || state.profile?.city || '',
    updatedAt: now()
  }
  return saveState(playerId, state)
}

export async function publishTreasure(ownerId, treasure) {
  const id = `${ownerId}_${Date.now()}`
  const record = { id, ownerId, status: 'open', createdAt: now(), raidedCount: 0, ...treasure }
  if (useMemory) {
    memory.treasures.set(id, clone(record))
    return record
  }
  await firestore.collection(TREASURES).doc(id).set(record)
  return record
}

export async function getTreasure(id) {
  if (useMemory) return memory.treasures.has(id) ? clone(memory.treasures.get(id)) : null
  const snap = await firestore.collection(TREASURES).doc(id).get()
  return snap.exists ? snap.data() : null
}

export async function updateTreasure(id, patch) {
  const current = await getTreasure(id)
  if (!current) return null
  const next = { ...current, ...patch, updatedAt: now() }
  if (useMemory) {
    memory.treasures.set(id, clone(next))
    return next
  }
  await firestore.collection(TREASURES).doc(id).set(next, { merge: false })
  return next
}

export async function listTreasures({ excludeOwnerId, limit = 30 } = {}) {
  if (useMemory) {
    return [...memory.treasures.values()]
      .filter(t => t.status === 'open' && t.ownerId !== excludeOwnerId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map(clone)
  }
  let query = firestore.collection(TREASURES).where('status', '==', 'open').orderBy('createdAt', 'desc').limit(limit)
  const snap = await query.get()
  return snap.docs.map(d => d.data()).filter(t => t.ownerId !== excludeOwnerId)
}

export async function recordAttack(entry) {
  const record = { id: `${entry.attackerId}_${Date.now()}`, createdAt: now(), ...entry }
  if (useMemory) {
    memory.attacks.push(clone(record))
    return record
  }
  await firestore.collection(ATTACKS).doc(record.id).set(record)
  return record
}

export async function leaderboard(limit = 20) {
  const score = state => (state.fame || 0) * 1000 + (state.level || 1) * 250 + Math.floor((state.gold || 0) / 10)
  if (useMemory) {
    return [...memory.players.entries()]
      .map(([id, state]) => ({ playerId: id, nickName: state.profile?.nickName || `探险家${id.slice(-4)}`, avatarUrl: state.profile?.avatarUrl || '', fame: state.fame || 0, level: state.level || 1, gold: state.gold || 0, score: score(state) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
  const snap = await firestore.collection(PLAYERS).limit(200).get()
  return snap.docs
    .map(d => ({ playerId: d.id, state: d.data() }))
    .map(({ playerId, state }) => ({ playerId, nickName: state.profile?.nickName || `探险家${playerId.slice(-4)}`, avatarUrl: state.profile?.avatarUrl || '', fame: state.fame || 0, level: state.level || 1, gold: state.gold || 0, score: score(state) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
