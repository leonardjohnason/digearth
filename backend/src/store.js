import { Firestore } from '@google-cloud/firestore'
import { freshState } from './gameData.js'

const useMemory = process.env.USE_MEMORY_STORE === '1' || process.env.NODE_ENV === 'test'
const memory = new Map()
const firestore = useMemory ? null : new Firestore()
const COLLECTION = process.env.FIRESTORE_COLLECTION || 'treasure_raiders_players'

export async function getState(playerId = 'demo') {
  if (useMemory) {
    if (!memory.has(playerId)) memory.set(playerId, freshState())
    return structuredClone(memory.get(playerId))
  }
  const ref = firestore.collection(COLLECTION).doc(playerId)
  const snap = await ref.get()
  if (!snap.exists) {
    const state = freshState()
    await ref.set(state)
    return state
  }
  return snap.data()
}

export async function saveState(playerId = 'demo', state) {
  if (useMemory) {
    memory.set(playerId, structuredClone(state))
    return state
  }
  await firestore.collection(COLLECTION).doc(playerId).set(state, { merge: false })
  return state
}
