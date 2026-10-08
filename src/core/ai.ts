/**
 * 小恶魔 AI（§12）——三档难度、拟人节奏、与玩家完全同源的 Command。
 *
 * 公平性：所有随机都取 state.rng；所有动作走 CommandQueue；
 * 布阵阶段只读己方信息（不偷看玩家锚点），观测之后才允许看全场。
 * 节奏全部以 state.time 计时，保证同种子可复现。
 */
import { BUFF_SLOTS } from '../config/cards';
import { ECONOMY } from '../config/economy';
import { COUNTER, SPECIES, SpeciesId, deployCapOfRound } from '../config/species';
import { Command, CommandQueue } from './command';
import { effectiveSpecies } from './damage';
import { nextFloat } from './rng';
import { anchorIndex, fieldUnits, powerOf, side, unitById } from './setup';
import { AiDifficulty, BattleState, Unit } from './types';

function rand(state: BattleState, lo: number, hi: number): number {
  return lo + nextFloat(state.rng) * (hi - lo);
}

function missRate(d: AiDifficulty): number {
  if (d === 'rookie') return 0.25;
  if (d === 'veteran') return 0.1;
  return 0.03;
}

/** 战力降序（同战力按 id 升序，保证确定性）。 */
function sortByPowerDesc(list: Unit[], powerOfUnit: (u: Unit) => number): void {
  for (let i = 1; i < list.length; i++) {
    const cur = list[i];
    const cp = powerOfUnit(cur);
    let j = i - 1;
    while (j >= 0) {
      const pp = powerOfUnit(list[j]);
      if (pp > cp || (pp === cp && list[j].id < cur.id)) break;
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = cur;
  }
}

/** 敌方半场布阵：row 4 是最前排（离玩家最近），3 只一排、列距 2。 */
function formationAnchor(index: number): number {
  const row = index < 3 ? 4 : 5;
  const col = 6 + (index % 3) * 2;
  return anchorIndex(col, row);
}

function randomEnemyAnchor(state: BattleState, used: number[]): number {
  for (let tries = 0; tries < 60; tries++) {
    const row = 4 + Math.floor(nextFloat(state.rng) * 4);
    const col = 6 + Math.floor(nextFloat(state.rng) * 6);
    const a = anchorIndex(col, row);
    if (a < 0) continue;
    let taken = false;
    for (let i = 0; i < used.length; i++) if (used[i] === a) taken = true;
    if (!taken) return a;
  }
  return formationAnchor(0);
}

/** 布阵计划：前排高战力、后排输出（菜鸟纯随机）。 */
function buildPlan(state: BattleState): void {
  const mem = state.ai;
  const s = side(state, 'enemy');
  const cap = deployCapOfRound(state.round);
  const pick: Unit[] = [];
  for (let i = 0; i < s.units.length && pick.length < cap; i++) {
    if (s.units[i].alive) pick.push(s.units[i]);
  }
  const benchUnits: Unit[] = [];
  for (let i = 0; i < s.bench.length; i++) {
    const u = s.bench[i];
    if (u !== null && u.alive) benchUnits.push(u);
  }
  sortByPowerDesc(benchUnits, powerOf);
  for (let i = 0; i < benchUnits.length && pick.length < cap; i++) pick.push(benchUnits[i]);
  if (mem.difficulty !== 'rookie') sortByPowerDesc(pick, powerOf);

  mem.planUnits = [];
  mem.planAnchors = [];
  const used: number[] = [];
  for (let i = 0; i < pick.length; i++) {
    let anchor: number;
    if (mem.difficulty === 'rookie') {
      anchor = randomEnemyAnchor(state, used);
    } else {
      anchor = formationAnchor(i);
    }
    if (anchor < 0) anchor = formationAnchor(i);
    used.push(anchor);
    mem.planUnits.push(pick[i].id);
    mem.planAnchors.push(anchor);
  }
}

function aiDeploy(state: BattleState, queue: CommandQueue): void {
  const mem = state.ai;
  if (!mem.planReady) {
    buildPlan(state);
    mem.planReady = true;
    mem.nextActionAt = state.time + rand(state, 300, 1200);
    return;
  }
  for (let i = 0; i < mem.planUnits.length; i++) {
    const id = mem.planUnits[i];
    const anchor = mem.planAnchors[i];
    const u = unitById(state, id);
    if (u === null || !u.alive) continue;
    if (u.anchor === anchor) continue;
    if (u.anchor >= 0) {
      // 已在场上但位置不对 → 先收回，下一拍再放
      queue.push({ type: 'Retreat', faction: 'enemy', unitId: id }, state.time, 'ai');
    } else {
      queue.push({ type: 'Deploy', faction: 'enemy', unitId: id, anchor: anchor }, state.time, 'ai');
    }
    mem.actionsThisPhase += 1;
    mem.nextActionAt = state.time + rand(state, 300, 1200);
    return;
  }
  queue.push({ type: 'ConfirmDeploy', faction: 'enemy' }, state.time, 'ai');
  mem.nextActionAt = state.time + rand(state, 300, 1200);
}

function aiObserve(state: BattleState, queue: CommandQueue): void {
  const mem = state.ai;
  if (mem.observeUntil <= 0) {
    mem.observeUntil = state.time + rand(state, 1500, 3000);
    mem.nextActionAt = state.time + 100;
    return;
  }
  if (state.time >= mem.observeUntil) {
    // 假装思考完 → 点开战（观测阶段唯一允许的动作）
    queue.push({ type: 'ConfirmDeploy', faction: 'enemy' }, state.time, 'ai');
    mem.nextActionAt = state.time + 500;
  }
}

/** 战斗指挥：抓对方核心（高攻 / 残血），恶魔会优先我方克制目标。 */
function aiBattle(state: BattleState, queue: CommandQueue): void {
  const mem = state.ai;
  const limit = mem.difficulty === 'rookie' ? 0 : mem.difficulty === 'veteran' ? 3 : 4;
  if (mem.commandCount >= limit) return;
  if (nextFloat(state.rng) < missRate(mem.difficulty)) {
    mem.nextActionAt = state.time + rand(state, 800, 2000);
    return;
  }
  const enemies = fieldUnits(state, 'player');
  const mine = fieldUnits(state, 'enemy');
  if (enemies.length === 0 || mine.length === 0) return;

  let caller: Unit | null = null;
  for (let i = 0; i < mine.length; i++) {
    const m = mine[i];
    if (m.commandReadyAt > state.time) continue;
    if (caller === null || m.atk > caller.atk) caller = m;
  }
  if (caller === null) return;

  const me = effectiveSpecies(caller) as SpeciesId;
  let best: Unit | null = null;
  let bestScore = -1e9;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    let score = e.atk * 0.02 + (1 - e.hp / e.maxHp) * 30;
    if (mem.difficulty === 'demon' && COUNTER[me] === (effectiveSpecies(e) as SpeciesId)) score += 25;
    if (best === null || score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  if (best === null) return;
  queue.push(
    { type: 'CommandAttack', faction: 'enemy', unitId: caller.id, targetId: best.id },
    state.time,
    'ai'
  );
  mem.commandCount += 1;
  mem.nextActionAt = state.time + rand(state, 800, 2000);
}

/** 是否有可合成的同种同级对。 */
function findCombinePair(state: BattleState): Unit[] | null {
  const s = side(state, 'enemy');
  const all: Unit[] = [];
  for (let i = 0; i < s.units.length; i++) if (s.units[i].alive) all.push(s.units[i]);
  for (let i = 0; i < s.bench.length; i++) {
    const u = s.bench[i];
    if (u !== null && u.alive) all.push(u);
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].species === all[j].species && all[i].level === all[j].level && all[i].level < 3) {
        return [all[i], all[j]];
      }
    }
  }
  return null;
}

/** 集市决策（优先级：二合一 > 赠礼 > 装加成牌 > 买卡/刷新 > 补阵）。 */
function chooseMarketAction(state: BattleState): Command | null {
  const mem = state.ai;
  const s = side(state, 'enemy');
  const d = mem.difficulty;
  if (mem.marketDone) return null;

  const pair = findCombinePair(state);
  if (pair !== null && pair.length === 2) {
    return { type: 'Combine', faction: 'enemy', unitA: pair[0].id, unitB: pair[1].id };
  }

  // 手中的加成牌优先装到最强单位
  if (s.hand.length > 0) {
    const card = s.hand[0];
    const pool: Unit[] = [];
    for (let i = 0; i < s.units.length; i++) if (s.units[i].alive) pool.push(s.units[i]);
    for (let i = 0; i < s.bench.length; i++) {
      const u = s.bench[i];
      if (u !== null && u.alive) pool.push(u);
    }
    sortByPowerDesc(pool, powerOf);
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].buffs.length < BUFF_SLOTS) {
        return { type: 'EquipBuff', faction: 'enemy', cardId: card.id, unitId: pool[i].id };
      }
    }
  }

  // 买卡：追二合一 / 追倾向物种 / 按难度买最强
  let bestSlot = -1;
  let bestSpecies: SpeciesId | null = null;
  let bestScore = -1;
  for (let i = 0; i < state.shelf.length; i++) {
    const item = state.shelf[i];
    if (item === undefined || item === null || item.taken) continue;
    const card = item.card;
    if (card === null) continue;
    if (card.kind !== 'animal' || card.species === undefined) continue;
    let score = SPECIES[card.species].power;
    if (card.species === s.biasSpecies) score += 3;
    for (let k = 0; k < s.bench.length; k++) {
      const u = s.bench[k];
      if (u !== null && u.species === card.species) score += 4;
    }
    for (let k = 0; k < s.units.length; k++) {
      if (s.units[k].species === card.species) score += 4;
    }
    if (d === 'rookie') score = nextFloat(state.rng) * 10;
    if (score > bestScore) {
      bestScore = score;
      bestSlot = i;
      bestSpecies = card.species;
    }
  }

  const freeGift = !state.economy.enemy.giftUsed && d !== 'rookie';
  if (bestSlot >= 0 && freeGift && (d === 'demon' || bestScore >= 8)) {
    return { type: 'BuyGift', faction: 'enemy', slot: bestSlot };
  }
  if (bestSlot >= 0 && bestSpecies !== null) {
    const cost = SPECIES[bestSpecies].cost;
    const wantsBuy =
      d === 'rookie'
        ? s.sunlight >= cost
        : bestScore >= (d === 'demon' ? 5 : 8) && s.sunlight >= cost;
    if (wantsBuy) return { type: 'Buy', faction: 'enemy', slot: bestSlot };
  }

  // 刷新（老练只在阳光 > 12 时刷，恶魔按利息理财）
  const cost = state.refreshUsed < ECONOMY.REFRESH_COST.length
    ? ECONOMY.REFRESH_COST[state.refreshUsed]
    : ECONOMY.REFRESH_COST[ECONOMY.REFRESH_COST.length - 1];
  const wantRefresh =
    state.refreshUsed < ECONOMY.REFRESH_LIMIT &&
    (d === 'demon' ? s.sunlight >= cost + 6 : d === 'veteran' ? s.sunlight > 12 : false);
  if (wantRefresh) return { type: 'Refresh', faction: 'enemy' };

  // 补阵：把替补席高战力摆上场
  const cap = deployCapOfRound(state.round);
  if (s.units.length < cap) {
    const bench: Unit[] = [];
    for (let i = 0; i < s.bench.length; i++) {
      const u = s.bench[i];
      if (u !== null && u.alive) bench.push(u);
    }
    if (bench.length > 0) {
      sortByPowerDesc(bench, powerOf);
      const used: number[] = [];
      for (let i = 0; i < s.units.length; i++) used.push(s.units[i].anchor);
      const anchor = d === 'rookie' ? randomEnemyAnchor(state, used) : formationAnchor(s.units.length);
      return { type: 'Deploy', faction: 'enemy', unitId: bench[0].id, anchor: anchor };
    }
  }

  mem.marketDone = true;
  return null;
}

function aiMarket(state: BattleState, queue: CommandQueue): void {
  const mem = state.ai;
  if (mem.marketDone) {
    queue.push({ type: 'ConfirmDeploy', faction: 'enemy' }, state.time, 'ai');
    mem.nextActionAt = state.time + 4000;
    return;
  }
  if (nextFloat(state.rng) < missRate(mem.difficulty) * 0.5) {
    mem.nextActionAt = state.time + rand(state, 400, 1400);
    return;
  }
  const action = chooseMarketAction(state);
  if (action === null) {
    queue.push({ type: 'ConfirmDeploy', faction: 'enemy' }, state.time, 'ai');
    mem.marketDone = true;
    mem.nextActionAt = state.time + 4000;
    return;
  }
  queue.push(action, state.time, 'ai');
  mem.actionsThisPhase += 1;
  mem.nextActionAt = state.time + rand(state, 400, 1400);
}

/** engine 每逻辑帧调用一次（内部按阶段与节奏自限速）。 */
export function aiTick(state: BattleState, queue: CommandQueue): void {
  if (state.phase === 'result' || state.phase === 'load' || state.phase === 'menu') return;
  if (state.ai.difficulty === undefined) return;
  if (state.time < state.ai.nextActionAt) return;
  if (state.phase === 'deploy') aiDeploy(state, queue);
  else if (state.phase === 'observe') aiObserve(state, queue);
  else if (state.phase === 'battle') aiBattle(state, queue);
  else if (state.phase === 'market') aiMarket(state, queue);
}

export { missRate, formationAnchor, findCombinePair };