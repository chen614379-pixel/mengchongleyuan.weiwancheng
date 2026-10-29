/**
 * 开局构造、棋盘锚点几何与卡池工厂（纯逻辑，可无头运行）。
 *
 * 约定：
 * - 逻辑坐标单位 = 1 个点位间距；棋盘 12×8，我方 (col 0-5, row 0-3)、敌方 (col 6-11, row 4-7)。
 * - 锚点压缩编号 0..47（ANCHOR_COUNT）：0..23 = 我方半场，24..47 = 敌方半场。
 *   编号只是「布阵阶段的吸附位」标识，渲染层永不绘制；开战后 battle 只读连续坐标。
 * - 所有数值一律来自 src/config/*，本文件不硬编码任何平衡数值。
 */
import {
  BENCH_SLOTS,
  DEPLOY_LIMIT,
  SPECIES,
  SPECIES_ORDER,
  SpeciesId,
  TraitId,
  deployCapOfRound,
  LEVEL_MULT
} from '../config/species';
import { BUFF_CARDS, BuffId, CardKind, POOL_SHARE, SHELF_SLOTS, SPECIES_BIAS } from '../config/cards';
import { WEATHER_CARDS, WeatherId } from '../config/weather';
import { ECONOMY, tierTableForRound } from '../config/economy';
import { GRID_COLS, GRID_ROWS, TIMING } from '../config/timing';
import { LAYOUT } from '../config/layout';
import { createRng, nextInt, pickWeighted, RngState } from './rng';
import {
  AiDifficulty,
  AiMemory,
  BattleEvent,
  BattleEventType,
  BattleState,
  CardInstance,
  EconomyLog,
  Faction,
  SideState,
  ShelfSlot,
  Unit,
  UnitStat
} from './types';

/** 棋盘半场列数 / 行数（6 / 4）。 */
const HALF_COLS = GRID_COLS / 2;
const HALF_ROWS = GRID_ROWS / 2;
/** 每方锚点数（24）。 */
const HALF_ANCHORS = HALF_COLS * HALF_ROWS;
/** 全场锚点数（48）。 */
export const ANCHOR_COUNT = HALF_ANCHORS * 2;
/** 我方锚点区间 [0, PLAYER_ANCHOR_COUNT)。 */
export const PLAYER_ANCHOR_COUNT = HALF_ANCHORS;

/** 渲染像素 → 逻辑单位 的换算基准（与 LAYOUT.GRID.cellW 同源）。 */
export const PX_PER_UNIT = LAYOUT.GRID.cellW;

/** 战斗阶段的连续坐标软边界（battle 只用它做软性回归，不做任何格子判定）。 */
export const BATTLE_BOUNDS = { minX: 0, minY: 0, maxX: GRID_COLS, maxY: GRID_ROWS };

/* ------------------------------------------------------------------ */
/* 锚点几何                                                            */
/* ------------------------------------------------------------------ */

/** (col,row) → 紧凑锚点编号 0..47。非法组合返回 -1。 */
export function anchorIndex(col: number, row: number): number {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return -1;
  if (col < HALF_COLS) {
    if (row >= HALF_ROWS) return -1;
    return row * HALF_COLS + col;
  }
  if (row < HALF_ROWS) return -1;
  return PLAYER_ANCHOR_COUNT + (row - HALF_ROWS) * HALF_COLS + (col - HALF_COLS);
}

/** 紧凑锚点编号 → (col,row)。越界返回 { col:-1, row:-1 }。 */
export function anchorColRow(anchor: number): { col: number; row: number } {
  if (anchor < 0 || anchor >= ANCHOR_COUNT) return { col: -1, row: -1 };
  if (anchor < PLAYER_ANCHOR_COUNT) {
    return { col: anchor % HALF_COLS, row: Math.floor(anchor / HALF_COLS) };
  }
  const a = anchor - PLAYER_ANCHOR_COUNT;
  return { col: HALF_COLS + (a % HALF_COLS), row: HALF_ROWS + Math.floor(a / HALF_COLS) };
}

/** 是否我方半场锚点。 */
export function isPlayerAnchor(anchor: number): boolean {
  return anchor >= 0 && anchor < PLAYER_ANCHOR_COUNT;
}

/** 锚点中心连续坐标（单位 = 格），供渲染换算像素（render 自己乘 cellW）。 */
export function anchorCenter(anchor: number): { x: number; y: number } {
  const cr = anchorColRow(anchor);
  return { x: cr.col + 0.5, y: cr.row + 0.5 };
}

/** 正对点位（点对称 11-c, 7-r）。 */
export function mirrorAnchor(anchor: number): number {
  const cr = anchorColRow(anchor);
  if (cr.col < 0) return -1;
  return anchorIndex(GRID_COLS - 1 - cr.col, GRID_ROWS - 1 - cr.row);
}

/** 该方第 n 个合法锚点（n 从 0 起，越界返回 -1）。 */
export function factionAnchorAt(faction: Faction, n: number): number {
  const base = faction === 'player' ? 0 : PLAYER_ANCHOR_COUNT;
  if (n < 0 || n >= HALF_ANCHORS) return -1;
  return base + n;
}

/** 本回合出战上限（§5.2：min(6, 2+floor(round/2))）。 */
export function deployCap(state: BattleState, faction: Faction): number {
  void faction;
  return deployCapOfRound(state.round);
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

export function side(state: BattleState, faction: Faction): SideState {
  return faction === 'player' ? state.player : state.enemy;
}

export function otherFaction(faction: Faction): Faction {
  return faction === 'player' ? 'enemy' : 'player';
}

/** 等级倍率：HP/攻击力 ×1.8^(level-1)。 */
export function levelMultiplier(level: 1 | 2 | 3): number {
  let m = 1;
  for (let i = 1; i < level; i++) m *= LEVEL_MULT;
  return m;
}

export function emptyStat(): UnitStat {
  return {
    damageDealt: 0,
    damageTaken: 0,
    kills: 0,
    aliveMs: 0,
    bySource: { basic: 0, trait: 0, counter: 0, weather: 0, buff: 0 },
    healed: 0
  };
}

function emptyEconomy(): EconomyLog {
  return { income: 0, interest: 0, buySpent: 0, refreshSpent: 0, sellGained: 0, giftUsed: false };
}

export function pushEvent(
  state: BattleState,
  type: BattleEventType,
  faction: Faction | null,
  unitId: number,
  targetId: number,
  amount: number,
  source: keyof UnitStat['bySource'] | null,
  species: SpeciesId | null
): void {
  const ev: BattleEvent = { type: type, at: state.time };
  if (faction !== null) ev.faction = faction;
  if (unitId >= 0) ev.unitId = unitId;
  if (targetId >= 0) ev.targetId = targetId;
  if (amount !== 0) ev.amount = amount;
  if (source !== null) ev.source = source;
  if (species !== null) ev.species = species;
  state.events.push(ev);
  // 事件流只服务演出，长跑自检里不能无限增长
  if (state.events.length > 240) state.events.splice(0, state.events.length - 240);
}

export function unitById(state: BattleState, id: number): Unit | null {
  if (id < 0) return null;
  for (let i = 0; i < state.player.units.length; i++) {
    if (state.player.units[i].id === id) return state.player.units[i];
  }
  for (let i = 0; i < state.enemy.units.length; i++) {
    if (state.enemy.units[i].id === id) return state.enemy.units[i];
  }
  for (let i = 0; i < state.player.bench.length; i++) {
    const u = state.player.bench[i];
    if (u !== null && u.id === id) return u;
  }
  for (let i = 0; i < state.enemy.bench.length; i++) {
    const u = state.enemy.bench[i];
    if (u !== null && u.id === id) return u;
  }
  return null;
}

/** 场上单位（替补席不算）。 */
export function fieldUnits(state: BattleState, faction: Faction): Unit[] {
  const out: Unit[] = [];
  const units = side(state, faction).units;
  for (let i = 0; i < units.length; i++) if (units[i].alive) out.push(units[i]);
  return out;
}

/** 场上锚点是否已被占用。 */
export function anchorOccupied(state: BattleState, faction: Faction, anchor: number): boolean {
  const units = side(state, faction).units;
  for (let i = 0; i < units.length; i++) if (units[i].anchor === anchor) return true;
  return false;
}

export function findBenchSlot(s: SideState): number {
  for (let i = 0; i < s.bench.length; i++) if (s.bench[i] === null) return i;
  return -1;
}

/** 单位是否在替补席上（anchor === -1）。 */
export function isBenched(s: SideState, unitId: number): boolean {
  for (let i = 0; i < s.bench.length; i++) {
    const u = s.bench[i];
    if (u !== null && u.id === unitId) return true;
  }
  return false;
}

/** 从替补席移除（返回被移除的单位或 null）。 */
export function takeFromBench(s: SideState, unitId: number): Unit | null {
  for (let i = 0; i < s.bench.length; i++) {
    const u = s.bench[i];
    if (u !== null && u.id === unitId) {
      s.bench[i] = null;
      return u;
    }
  }
  return null;
}

/** 从场上移除。 */
export function takeFromField(s: SideState, unitId: number): Unit | null {
  for (let i = 0; i < s.units.length; i++) {
    if (s.units[i].id === unitId) {
      const u = s.units[i];
      s.units.splice(i, 1);
      return u;
    }
  }
  return null;
}

export function cardById(s: SideState, cardId: number): CardInstance | null {
  for (let i = 0; i < s.hand.length; i++) if (s.hand[i].id === cardId) return s.hand[i];
  return null;
}

export function removeHandCard(s: SideState, cardId: number): CardInstance | null {
  for (let i = 0; i < s.hand.length; i++) {
    if (s.hand[i].id === cardId) {
      const c = s.hand[i];
      s.hand.splice(i, 1);
      return c;
    }
  }
  return null;
}

export function buffDefOf(id: BuffId) {
  for (let i = 0; i < BUFF_CARDS.length; i++) if (BUFF_CARDS[i].id === id) return BUFF_CARDS[i];
  return BUFF_CARDS[0];
}

/** 单位累计投入（卖出返还用）。 */
export function investedOf(u: Unit): number {
  return u.invested;
}

/** 单位战力（结算伤害与 AI 估值）。 */
export function powerOf(u: Unit): number {
  return SPECIES[u.species].power * u.level;
}

/* ------------------------------------------------------------------ */
/* 单位与卡牌工厂                                                      */
/* ------------------------------------------------------------------ */

export function createUnit(
  state: BattleState,
  owner: Faction,
  species: SpeciesId,
  level: 1 | 2 | 3,
  invested: number
): Unit {
  const def = SPECIES[species];
  const mult = levelMultiplier(level);
  const maxHp = Math.floor(def.hp * mult);
  const atk = Math.floor(def.atk * mult);
  const trait: TraitId | null = def.trait;
  return {
    id: state.nextId++,
    owner: owner,
    species: species,
    level: level,
    buffs: [],
    trait: trait,
    maxHp: maxHp,
    hp: maxHp,
    shield: 0,
    atk: atk,
    atkInterval: Math.round(def.atkInterval * 1000),
    moveSpeed: def.moveSpeed,
    atkRange: def.atkRange,
    bodyRadius: def.bodyRadius,
    baseMaxHp: maxHp,
    baseAtk: atk,
    invested: invested,
    pos: { x: -1, y: -1 },
    anchor: -1,
    facing: owner === 'player' ? 1 : -1,
    alive: true,
    roundsPlayed: 0,
    stat: emptyStat(),
    atkTimer: 0,
    targetId: -1,
    targetTimer: 0,
    commandReadyAt: 0,
    forcedTargetId: -1,
    pendingCommandAt: 0,
    pendingTargetId: -1,
    status: {
      bleedStacks: 0,
      bleedPerSec: 0,
      bleedUntil: 0,
      slowAtkUntil: 0,
      slowAtkMul: 0,
      guardUntil: 0,
      guardReduce: 0,
      regenUntil: 0,
      tauntUntil: 0,
      mimic: null
    },
    decoyUntil: 0,
    decoyUsed: false,
    isDecoy: false,
    // §9 装备式特技：开局未装备、未选定目标物种、不屈未用
    equip: null,
    equipSpecies: null,
    unyieldUsed: false,
    mirrorId: -1,
    pushPos: { x: 0, y: 0 },
    bleedSource: 'trait',
    bleedFromId: -1,
    dotTimer: 0,
    regenTimer: 0,
    drainTimer: 0,
    fx: {
      hitFlash: 0,
      attackPulse: 0,
      deathFirefly: 0,
      combineBloom: 0,
      shieldRipple: 0,
      hitDir: 1,
      counterHit: 0
    }
  };
}

function makeAnimalCard(state: BattleState, species: SpeciesId, round: number): CardInstance {
  return { id: state.nextId++, kind: 'animal', species: species, boughtRound: round };
}

function makeWeatherCard(state: BattleState, weather: WeatherId, round: number): CardInstance {
  return { id: state.nextId++, kind: 'weather', weather: weather, boughtRound: round };
}

function makeBuffCard(state: BattleState, buff: BuffId, round: number): CardInstance {
  return { id: state.nextId++, kind: 'buff', buff: buff, boughtRound: round };
}

/** 按当前回合 tier 表 + 物种保底抽一张动物牌。 */
export function rollAnimalCard(state: BattleState): CardInstance {
  const tiers = tierTableForRound(state.round);
  const weights: number[] = [];
  for (let i = 0; i < tiers.length; i++) weights.push(tiers[i].weight);
  const tier = tiers[pickWeighted(state.rng, weights)];
  const pool: SpeciesId[] = [];
  const poolWeights: number[] = [];
  for (let i = 0; i < SPECIES_ORDER.length; i++) {
    const sp = SPECIES_ORDER[i];
    if (SPECIES[sp].cost !== tier.cost) continue;
    pool.push(sp);
    poolWeights.push(1 + (sp === state.player.biasSpecies ? SPECIES_BIAS : 0));
  }
  if (pool.length === 0) {
    // 该费用档无对应物种（配置极端情况）→ 退化为全池等权
    for (let i = 0; i < SPECIES_ORDER.length; i++) pool.push(SPECIES_ORDER[i]);
    for (let i = 0; i < SPECIES_ORDER.length; i++) poolWeights.push(1);
  }
  const picked = pool[pickWeighted(state.rng, poolWeights)];
  return makeAnimalCard(state, picked, state.round);
}

/** 按卡池占比（动物 78% / 天气 12% / 加成 10%）抽一张任意牌。 */
export function rollAnyCard(state: BattleState): CardInstance {
  const idx = pickWeighted(state.rng, [POOL_SHARE.animal, POOL_SHARE.weather, POOL_SHARE.buff]);
  const kind: CardKind = idx === 0 ? 'animal' : idx === 1 ? 'weather' : 'buff';
  if (kind === 'animal') return rollAnimalCard(state);
  if (kind === 'weather') {
    const w = WEATHER_CARDS[pickWeighted(state.rng, [1, 1, 1])];
    return makeWeatherCard(state, w.id, state.round);
  }
  const weights: number[] = [];
  for (let i = 0; i < BUFF_CARDS.length; i++) weights.push(1);
  const b = BUFF_CARDS[pickWeighted(state.rng, weights)];
  return makeBuffCard(state, b.id, state.round);
}

/** 重掷货架（SHELF_SLOTS 槽）。 */
export function rollShelf(state: BattleState): ShelfSlot[] {
  const out: ShelfSlot[] = [];
  for (let i = 0; i < SHELF_SLOTS; i++) out.push({ card: rollAnyCard(state), taken: false });
  return out;
}

/** 开局免费动物牌 → 直接进替补席（§3：双方各发 3 张随机动物牌）。 */
function dealStarters(state: BattleState, faction: Faction): void {
  const s = side(state, faction);
  for (let i = 0; i < ECONOMY.FREE_START_CARDS; i++) {
    const slot = findBenchSlot(s);
    if (slot < 0) break;
    const card = rollAnimalCard(state);
    const species = card.species as SpeciesId;
    const unit = createUnit(state, faction, species, 1, SPECIES[species].cost);
    unit.anchor = -1;
    s.bench[slot] = unit;
    pushEvent(state, 'UnitDeploy', faction, unit.id, -1, 0, null, species);
  }
}

function createSide(state: BattleState, faction: Faction, difficulty: AiDifficulty): SideState {
  const bench: (Unit | null)[] = [];
  for (let i = 0; i < BENCH_SLOTS; i++) bench.push(null);
  const bias = SPECIES_ORDER[nextInt(state.rng, 0, SPECIES_ORDER.length - 1)];
  const s: SideState = {
    faction: faction,
    sunlight: ECONOMY.START_SUNLIGHT,
    houseHp: ECONOMY.HOUSE_HP,
    houseHpMax: ECONOMY.HOUSE_HP,
    units: [],
    bench: bench,
    hand: [],
    biasSpecies: bias,
    deployed: false
  };
  if (faction === 'enemy') s.ai = difficulty;
  return s;
}

function createAiMemory(difficulty: AiDifficulty): AiMemory {
  return {
    difficulty: difficulty,
    nextActionAt: 0,
    actionsThisPhase: 0,
    planReady: false,
    planUnits: [],
    planAnchors: [],
    observeUntil: 0,
    commandCount: 0,
    marketDone: false
  };
}

/**
 * 开局构造：双方各 3 张免费随机动物牌（进替补席）、5 阳光、小屋 30 HP、各自随机倾向物种。
 * R1 不额外发放轮次基础收入（ECONOMY.START_SUNLIGHT 即全部开局资源）。
 */
export function createBattle(seed: number, difficulty: AiDifficulty): BattleState {
  const rng: RngState = createRng(seed);
  const state: BattleState = {
    seed: seed,
    rng: rng,
    nextId: 1,
    time: 0,
    phase: 'deploy',
    round: 1,
    phaseLeft: TIMING.DEPLOY_R1,
    player: null as unknown as SideState,
    enemy: null as unknown as SideState,
    weather: { player: { next: 'none', active: 'none' }, enemy: { next: 'none', active: 'none' } },
    weatherFx: { player: {}, enemy: {} },
    weatherText: '无天气',
    shelf: [],
    refreshUsed: 0,
    giftUsed: false,
    economy: { player: emptyEconomy(), enemy: emptyEconomy() },
    ai: createAiMemory(difficulty),
    outcome: null,
    log: [],
    events: [],
    highlights: []
  };
  state.player = createSide(state, 'player', 'veteran');
  state.enemy = createSide(state, 'enemy', difficulty);
  dealStarters(state, 'player');
  dealStarters(state, 'enemy');
  state.shelf = rollShelf(state);
  pushEvent(state, 'RoundStart', null, -1, -1, 0, null, null);
  return state;
}

/** 场上单位按锚点落位（布阵阶段每次变更后调用）。 */
export function syncFieldPositions(state: BattleState, faction: Faction): void {
  const units = side(state, faction).units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.anchor < 0) continue;
    const c = anchorCenter(u.anchor);
    u.pos.x = c.x;
    u.pos.y = c.y;
  }
}

/** 开战瞬间：把锚点吸附坐标声明为连续坐标，并算好正对对位。 */
export function beginContinuous(state: BattleState): void {
  syncFieldPositions(state, 'player');
  syncFieldPositions(state, 'enemy');
  for (let i = 0; i < state.player.units.length; i++) {
    const u = state.player.units[i];
    u.mirrorId = -1;
    if (u.anchor < 0) continue;
    const m = mirrorAnchor(u.anchor);
    for (let j = 0; j < state.enemy.units.length; j++) {
      if (state.enemy.units[j].anchor === m) u.mirrorId = state.enemy.units[j].id;
    }
  }
  for (let i = 0; i < state.enemy.units.length; i++) {
    const u = state.enemy.units[i];
    u.mirrorId = -1;
    if (u.anchor < 0) continue;
    const m = mirrorAnchor(u.anchor);
    for (let j = 0; j < state.player.units.length; j++) {
      if (state.player.units[j].anchor === m) u.mirrorId = state.player.units[j].id;
    }
  }
  // 无目标时的推进点 = 自身锚点的正对点（在敌方半场），开战前一次性算好，
  // 这样 battle.ts 永远不需要读网格常量。
  const pf: Faction[] = ['player', 'enemy'];
  for (let f = 0; f < pf.length; f++) {
    const units = side(state, pf[f]).units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.anchor < 0) {
        u.pushPos.x = u.pos.x;
        u.pushPos.y = u.pos.y;
        continue;
      }
      const c = anchorCenter(mirrorAnchor(u.anchor));
      u.pushPos.x = c.x;
      u.pushPos.y = c.y;
    }
  }
}

/** 战斗结束后把天气 HP 上限乘区还原为裸值（裸值 = 1 级基础 × 等级倍率）。 */
export function restoreBaseStats(state: BattleState): void {
  const factions: Faction[] = ['player', 'enemy'];
  for (let f = 0; f < factions.length; f++) {
    const units = side(state, factions[f]).units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const mult = levelMultiplier(u.level);
      u.maxHp = Math.floor(u.baseMaxHp * mult);
      if (u.hp > u.maxHp) u.hp = u.maxHp;
      u.atk = Math.floor(u.baseAtk * mult);
    }
  }
}

/** 场上是否还有存活单位。 */
export function hasAlive(state: BattleState, faction: Faction): boolean {
  const units = side(state, faction).units;
  for (let i = 0; i < units.length; i++) if (units[i].alive) return true;
  return false;
}

export { DEPLOY_LIMIT };