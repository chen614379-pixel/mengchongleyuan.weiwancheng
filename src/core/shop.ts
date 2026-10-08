/**
 * 集市与经济（§7 / §11）。
 *
 * 设计说明（types 形状冻结带来的取舍，报告里已注明）：
 * - 货架 `state.shelf`、刷新计数 `state.refreshUsed` 是**全桌共享**的公共集市，
 *   双方抢同一批卡（刷新费用全局递增、每轮上限 3 次）。
 * - 免费赠礼 `BuyGift` 每方各自一次（`state.economy[faction].giftUsed`，同时同步 state.giftUsed 供 UI 显示）。
 * - 加成牌买下进 `hand`，用 EquipBuff 指定目标动物；卸下不退款但牌回手。
 */
import { BUFF_CARDS, BUFF_SLOTS } from '../config/cards';
import { ECONOMY, interestOf, sellValue } from '../config/economy';
import { SPECIES } from '../config/species';
import { WEATHER_CARDS } from '../config/weather';
import { CommandResult } from './command';
import { buffDefOfId, hasBuff } from './damage';
import {
  cardById,
  createUnit,
  findBenchSlot,
  removeHandCard,
  rollShelf,
  side,
  takeFromBench,
  takeFromField,
  unitById
} from './setup';
import { BattleState, CardInstance, Faction } from './types';

/** 卡面价格（唯一来源：config）。 */
export function costOfCard(card: CardInstance): number {
  if (card.kind === 'animal' && card.species !== undefined) return SPECIES[card.species].cost;
  if (card.kind === 'buff' && card.buff !== undefined) return buffDefOfId(card.buff).cost;
  if (card.kind === 'weather' && card.weather !== undefined) {
    for (let i = 0; i < WEATHER_CARDS.length; i++) {
      if (WEATHER_CARDS[i].id === card.weather) return WEATHER_CARDS[i].cost;
    }
  }
  return 0;
}

/** 当前刷新费用（共享集市：按本轮已刷新次数递增）。 */
export function refreshCost(state: BattleState): number {
  const used = state.refreshUsed;
  const list = ECONOMY.REFRESH_COST;
  if (used < 0) return list[0];
  if (used >= list.length) return list[list.length - 1];
  return list[used];
}

/** 集市/布阵阶段才可以买卖（战斗与观测只读）。 */
function canTrade(state: BattleState): boolean {
  return state.phase === 'market' || state.phase === 'deploy';
}

/**
 * 能否购买：返回 ok/reason（场景层点击前预判，不需要真买）。
 * reason ∈ 'bad-phase' | 'bad-slot' | 'slot-taken' | 'not-enough-sunlight' | 'bench-full' | 'gift-used'
 */
export function canBuy(
  state: BattleState,
  faction: Faction,
  slot: number,
  useGift: boolean
): { ok: boolean; reason?: string } {
  if (!canTrade(state)) return { ok: false, reason: 'bad-phase' };
  if (slot < 0 || slot >= state.shelf.length) return { ok: false, reason: 'bad-slot' };
  const item = state.shelf[slot];
  if (item === undefined || item === null || item.taken) return { ok: false, reason: 'slot-taken' };
  const s = side(state, faction);
  const card = item.card;
  if (card === null) return { ok: false, reason: 'slot-taken' };
  if (useGift) {
    if (state.economy[faction].giftUsed) return { ok: false, reason: 'gift-used' };
    if (card.kind === 'animal' && findBenchSlot(s) < 0) return { ok: false, reason: 'bench-full' };
    return { ok: true };
  }
  if (s.sunlight < costOfCard(card)) return { ok: false, reason: 'not-enough-sunlight' };
  if (card.kind === 'animal' && findBenchSlot(s) < 0) return { ok: false, reason: 'bench-full' };
  return { ok: true };
}

/** 购买货架第 slot 张（useGift = 用掉本轮免费赠礼）。 */
export function applyBuy(
  state: BattleState,
  faction: Faction,
  slot: number,
  useGift: boolean
): CommandResult {
  const check = canBuy(state, faction, slot, useGift);
  if (!check.ok) return { ok: false, reason: check.reason, fx: 'reject' };
  const s = side(state, faction);
  const item = state.shelf[slot];
  const card = item.card;
  if (card === null) return { ok: false, reason: 'slot-taken', fx: 'reject' };
  const cost = useGift ? 0 : costOfCard(card);

  if (card.kind === 'animal' && card.species !== undefined) {
    const bslot = findBenchSlot(s);
    const unit = createUnit(state, faction, card.species, 1, cost);
    s.bench[bslot] = unit;
  } else if (card.kind === 'buff' && card.buff !== undefined) {
    s.hand.push({ id: state.nextId++, kind: 'buff', buff: card.buff, boughtRound: state.round });
  } else if (card.kind === 'weather' && card.weather !== undefined) {
    state.weather[faction].next = card.weather;
  } else {
    return { ok: false, reason: 'bad-card', fx: 'reject' };
  }

  s.sunlight -= cost;
  state.economy[faction].buySpent += cost;
  if (useGift) {
    state.economy[faction].giftUsed = true;
    state.giftUsed = true;
  }
  item.taken = true;
  return { ok: true, fx: card.kind === 'animal' ? 'card-fly' : 'leaf-fall' };
}

/** 刷新货架（共享集市，每轮上限 ECONOMY.REFRESH_LIMIT 次）。 */
export function applyRefresh(state: BattleState, faction: Faction): CommandResult {
  if (!canTrade(state)) return { ok: false, reason: 'bad-phase', fx: 'reject' };
  if (state.refreshUsed >= ECONOMY.REFRESH_LIMIT) {
    return { ok: false, reason: 'refresh-limit', fx: 'reject' };
  }
  const cost = refreshCost(state);
  const s = side(state, faction);
  if (s.sunlight < cost) return { ok: false, reason: 'not-enough-sunlight', fx: 'reject' };
  s.sunlight -= cost;
  state.economy[faction].refreshSpent += cost;
  state.refreshUsed += 1;
  state.shelf = rollShelf(state);
  return { ok: true, fx: 'leaf-fall' };
}

/** 卖出替补席或场上单位：返还累计费用 × 80%，身上的加成牌回手。 */
export function applySell(state: BattleState, faction: Faction, unitId: number): CommandResult {
  if (!canTrade(state)) return { ok: false, reason: 'bad-phase', fx: 'reject' };
  const s = side(state, faction);
  let u = takeFromBench(s, unitId);
  if (u === null) u = takeFromField(s, unitId);
  if (u === null) return { ok: false, reason: 'no-such-unit', fx: 'reject' };
  u.alive = false;
  const gain = sellValue(u.invested);
  s.sunlight += gain;
  state.economy[faction].sellGained += gain;
  for (let i = 0; i < u.buffs.length; i++) {
    s.hand.push({ id: state.nextId++, kind: 'buff', buff: u.buffs[i], boughtRound: state.round });
  }
  return { ok: true, fx: 'leaf-fall' };
}

/** 把手中的加成牌装到指定动物（每只 2 张，同名牌不可重复）。 */
export function applyEquipBuff(
  state: BattleState,
  faction: Faction,
  cardId: number,
  unitId: number
): CommandResult {
  const s = side(state, faction);
  const card = cardById(s, cardId);
  if (card === null || card.kind !== 'buff' || card.buff === undefined) {
    return { ok: false, reason: 'no-such-card', fx: 'reject' };
  }
  const u = unitById(state, unitId);
  if (u === null || u.owner !== faction) return { ok: false, reason: 'no-such-unit', fx: 'reject' };
  if (u.buffs.length >= BUFF_SLOTS) return { ok: false, reason: 'buff-slots-full', fx: 'reject' };
  if (hasBuff(u, card.buff)) return { ok: false, reason: 'duplicate-buff', fx: 'reject' };
  u.buffs.push(card.buff);
  removeHandCard(s, cardId);
  return { ok: true, fx: 'buff-wrap' };
}

/** 卸下某张加成牌（不退款，牌回手）。 */
export function applyRemoveBuff(
  state: BattleState,
  faction: Faction,
  unitId: number,
  buffIndex: number
): CommandResult {
  const s = side(state, faction);
  const u = unitById(state, unitId);
  if (u === null || u.owner !== faction) return { ok: false, reason: 'no-such-unit', fx: 'reject' };
  if (buffIndex < 0 || buffIndex >= u.buffs.length) {
    return { ok: false, reason: 'no-such-buff', fx: 'reject' };
  }
  const buff = u.buffs[buffIndex];
  u.buffs.splice(buffIndex, 1);
  s.hand.push({ id: state.nextId++, kind: 'buff', buff: buff, boughtRound: state.round });
  return { ok: true, fx: 'leaf-fall' };
}

/** 下一轮基础收入 + 利息（R1 不发放，开局只有 START_SUNLIGHT）。 */
export function grantRoundIncome(state: BattleState, faction: Faction): void {
  if (state.round <= 1) return;
  const s = side(state, faction);
  const interest = interestOf(s.sunlight);
  s.sunlight += ECONOMY.ROUND_INCOME + interest;
  state.economy[faction].income += ECONOMY.ROUND_INCOME;
  state.economy[faction].interest += interest;
}

/** 回合胜利奖励（结算阶段立刻进账）。 */
export function grantWinBonus(state: BattleState, faction: Faction): void {
  const s = side(state, faction);
  s.sunlight += ECONOMY.WIN_SUNLIGHT;
  state.economy[faction].income += ECONOMY.WIN_SUNLIGHT;
}

/** 进入集市：换一整套新货架、重置刷新/赠礼计数，并发放本轮收入。 */
export function beginMarket(state: BattleState): void {
  state.shelf = rollShelf(state);
  state.refreshUsed = 0;
  state.giftUsed = false;
  state.economy.player.giftUsed = false;
  state.economy.enemy.giftUsed = false;
  grantRoundIncome(state, 'player');
  grantRoundIncome(state, 'enemy');
}

/** 校验货架与加成牌的静态一致性（自检用，正常应恒为 true）。 */
export function shelfIntegrity(state: BattleState): boolean {
  if (state.shelf.length === 0) return false;
  for (let i = 0; i < state.shelf.length; i++) {
    const item = state.shelf[i];
    if (item === undefined || item === null) return false;
    const card = item.card;
    if (card === null) continue;
    if (card.kind === 'animal' && card.species === undefined) return false;
    if (card.kind === 'buff' && card.buff === undefined) return false;
    if (card.kind === 'weather' && card.weather === undefined) return false;
  }
  return BUFF_CARDS.length > 0 && BUFF_SLOTS > 0;
}