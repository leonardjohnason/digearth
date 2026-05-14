export const scenes = [
  { id: 'valley', name: '静谧山谷', fee: 0, note: '无加成，适合新手', trap: 1, guardHp: 1, dodgePenalty: 0, image: '/assets/scene-valley.svg', video: 'valley.mp4', mood: 'gold' },
  { id: 'cliff', name: '悬崖边上', fee: .2, note: '陷阱伤害 +15%，进攻闪避 -10%', trap: 1.15, guardHp: 1, dodgePenalty: .1, image: '/assets/scene-cliff.svg', video: 'cliff.mp4', mood: 'red' },
  { id: 'lake', name: '湖底沉船', fee: .5, note: '守卫生命 +20%，每轮氧气损耗', trap: 1, guardHp: 1.2, oxygen: true, dodgePenalty: 0, image: '/assets/scene-lake.svg', video: 'lake.mp4', mood: 'blue' },
  { id: 'snow', name: '雪山秘境', fee: .6, note: '迷魂与冻结更强', trap: 1.05, guardHp: 1.1, snow: true, dodgePenalty: .05, image: '/assets/scene-snow.svg', video: 'snow.mp4', mood: 'ice' },
  { id: 'island', name: '孤岛灯塔', fee: 1, note: '全防御 +10%，无法侦查', trap: 1.1, guardHp: 1.1, dodgePenalty: .05, image: '/assets/scene-island.svg', video: 'island.mp4', mood: 'violet' }
]

export const treasures = [
  { id: 'relic', name: '新手遗物', value: 1000, rarity: '普通', image: '/assets/treasure-relic.svg' },
  { id: 'pearlbox', name: '夜明珠匣', value: 1800, rarity: '稀有', image: '/assets/treasure-pearl.svg' },
  { id: 'dragon', name: '龙纹金杯', value: 2600, rarity: '史诗', image: '/assets/treasure-dragon.svg' },
  { id: 'crown', name: '孤王冠冕', value: 4200, rarity: '传说', image: '/assets/treasure-crown.svg' }
]

export const defenses = [
  { id: 'crossbow', name: '连弩阵', type: 'trap', cost: 350, dmg: 150, icon: '🏹', desc: '对全队造成穿透伤害' },
  { id: 'boulder', name: '远古巨石', type: 'trap', cost: 800, dmg: 390, icon: '🪨', desc: '重创首位队员' },
  { id: 'maze', name: '迷魂阵', type: 'trap', cost: 500, dmg: 60, debuff: 'blind', icon: '🌀', desc: '全队命中率下降' },
  { id: 'guard', name: '基础守卫', type: 'guard', cost: 300, hp: 360, atk: 70, def: 20, icon: '🛡️', desc: '便宜稳定' },
  { id: 'elite', name: '精英守卫', type: 'guard', cost: 900, hp: 620, atk: 125, def: 35, crit: .2, icon: '⚔️', desc: '20% 重击' },
  { id: 'beast', name: '地穴怪兽', type: 'guard', cost: 1200, hp: 900, atk: 95, def: 45, icon: '🐲', desc: '高生命肉盾' }
]

export const units = [
  { id: 'warrior', name: '勇士', cost: 120, hp: 520, atk: 82, def: 36, dodge: .05, avatar: '🗡️', skill: '坚毅：陷阱伤害 -20%' },
  { id: 'rogue', name: '盗贼', cost: 150, hp: 300, atk: 120, def: 12, dodge: .3, avatar: '🕶️', skill: '潜行：高概率闪避机关' },
  { id: 'mage', name: '术士', cost: 180, hp: 330, atk: 135, def: 10, dodge: .08, avatar: '🔮', skill: '虚弱咒：守卫防御 -10%' },
  { id: 'engineer', name: '工匠', cost: 160, hp: 380, atk: 55, def: 20, dodge: .1, avatar: '🧰', skill: '拆解：首次机关伤害减半' }
]

export const npcTargets = [
  { id: 'npc-cliff', ownerId: 'npc', ownerName: '阿凯', name: '阿凯的悬崖秘藏', scene: 'cliff', value: 1300, defense: ['crossbow', 'guard'], isNpc: true },
  { id: 'npc-lake', ownerId: 'npc', ownerName: '莉娜', name: '莉娜的湖底沉船', scene: 'lake', value: 2200, defense: ['maze', 'elite', 'guard'], isNpc: true },
  { id: 'npc-snow', ownerId: 'npc', ownerName: '老周', name: '老周的雪山金库', scene: 'snow', value: 3100, defense: ['boulder', 'maze', 'beast'], isNpc: true }
]

export function freshState() {
  return {
    gold: 3500,
    diamond: 30,
    pearl: 0,
    xp: 0,
    level: 1,
    fame: 0,
    defense: [],
    published: null,
    profile: null,
    log: []
  }
}
