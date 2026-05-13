import { defenses, scenes, units } from './gameData.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function battle(target, squadIds) {
  let party = squadIds.map(id => clone(units.find(u => u.id === id))).filter(Boolean).slice(0, 5)
  const scene = scenes.find(s => s.id === target.scene) || scenes[0]
  const lines = [`🧭 小分队出发：${party.map(p => p.name).join('、')} → ${target.name}`, `地形：${scene.name}（${scene.note}）`]
  let blind = false
  let engineerUsed = false

  if (!party.length) return { lines: ['至少选择 1 名队员。'], gold: 0, xp: 0, pearl: 0, fame: 0, ok: false }

  for (const id of target.defense) {
    const d = defenses.find(x => x.id === id)
    if (!d || d.type !== 'trap' || !party.length) continue
    lines.push(`⚙️ 触发机关：${d.name}`)
    if (d.debuff === 'blind') {
      blind = true
      lines.push('迷雾升起：小分队命中率下降。')
    }
    const affected = d.id === 'boulder' ? [party[0]] : party
    for (const member of [...affected]) {
      let dmg = (d.dmg || 0) * scene.trap
      if (member.id === 'warrior') dmg *= .8
      if (member.id === 'rogue' && Math.random() < Math.max(.05, member.dodge - scene.dodgePenalty)) {
        lines.push(`  ${member.name}发动潜行，闪过了${d.name}。`)
        continue
      }
      if (member.id === 'engineer' && !engineerUsed) {
        dmg *= .5
        engineerUsed = true
        lines.push('  工匠完成临场拆解，本次机关伤害减半。')
      }
      member.hp -= Math.round(dmg)
      lines.push(`  ${member.name}受到 ${Math.round(dmg)} 点伤害，剩余生命 ${Math.max(0, member.hp)}。`)
    }
    party = party.filter(p => p.hp > 0)
  }

  let guards = target.defense
    .map(id => defenses.find(d => d.id === id))
    .filter(d => d && d.type === 'guard')
    .map(g => ({ ...g, hp: Math.round(g.hp * scene.guardHp) }))

  if (party.some(p => p.id === 'mage') && guards.length) {
    guards.forEach(g => { g.def = Math.round(g.def * .9) })
    lines.push('🔮 术士释放虚弱咒，所有守卫防御下降 10%。')
  }

  let round = 1
  while (party.length && guards.length && round <= 8) {
    lines.push(`— 第 ${round} 轮守卫战 —`)
    for (const p of [...party]) {
      const g = guards[0]
      if (!g) break
      if (Math.random() < (blind ? .18 : .05)) {
        lines.push(`  ${p.name}在混乱中打空了。`)
        continue
      }
      const dmg = Math.max(12, Math.round(p.atk * (.9 + Math.random() * .25) - g.def))
      g.hp -= dmg
      lines.push(`  ${p.name}攻击${g.name}，造成 ${dmg}。`)
      if (g.hp <= 0) {
        lines.push(`  ${g.name}被击败。`)
        guards.shift()
      }
    }
    for (const g of [...guards]) {
      const p = party[0]
      if (!p) break
      let dmg = Math.max(8, Math.round(g.atk * (.85 + Math.random() * .3) - p.def))
      if (g.crit && Math.random() < g.crit) {
        dmg *= 2
        lines.push(`  ${g.name}触发重击！`)
      }
      p.hp -= dmg
      lines.push(`  ${g.name}反击${p.name}，造成 ${dmg}，${p.name}剩余 ${Math.max(0, p.hp)}。`)
      if (p.hp <= 0) {
        lines.push(`  ${p.name}倒下，进入疗伤冷却。`)
        party.shift()
      }
    }
    if (scene.oxygen) {
      party.forEach(p => { p.hp -= 25 })
      lines.push('  湖底缺氧：所有幸存队员额外损耗 25 生命。')
      party = party.filter(p => p.hp > 0)
    }
    round += 1
  }

  if (party.length && !guards.length) {
    const reward = Math.round(target.value * (.75 + party.length * .08))
    lines.push(`🏆 挖宝胜利：带走宝藏，获得 ${reward} 金币与 120 经验。`)
    return { lines, gold: reward, xp: 120, pearl: 0, fame: 1, ok: true }
  }

  const consolation = Math.round(target.value * .08)
  lines.push(`💀 挖宝失败：小分队被防线击退。你获得 ${consolation} 安慰金币与 35 经验。`)
  return { lines, gold: consolation, xp: 35, pearl: 0, fame: 0, ok: true }
}
