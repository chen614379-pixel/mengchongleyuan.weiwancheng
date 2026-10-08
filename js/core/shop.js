"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.costOfCard = costOfCard;
exports.refreshCost = refreshCost;
exports.canBuy = canBuy;
exports.applyBuy = applyBuy;
exports.applyRefresh = applyRefresh;
exports.applySell = applySell;
exports.applyEquipBuff = applyEquipBuff;
exports.applyRemoveBuff = applyRemoveBuff;
exports.grantRoundIncome = grantRoundIncome;
exports.grantWinBonus = grantWinBonus;
exports.beginMarket = beginMarket;
exports.shelfIntegrity = shelfIntegrity;
/**
 * 集市与经济（§7 / §11）。
 *
 * 设计说明（types 形状冻结带来的取舍，报告里已注明）：
 * - 货架 `state.shelf`、刷新计数 `state.refreshUsed` 是**全桌共享**的公共集市，
 *   双方抢同一批卡（刷新费用全局递增、每轮上限 3 次）。
 * - 免费赠礼 `BuyGift` 每方各自一次（`state.economy[faction].giftUsed`，同时同步 state.giftUsed 供 UI 显示）。
 * - 加成牌买下进 `hand`，用 EquipBuff 指定目标动物；卸下不退款但牌回手。
 */
var cards_1 = require("../config/cards");
var economy_1 = require("../config/economy");
var species_1 = require("../config/species");
var weather_1 = require("../config/weather");
var damage_1 = require("./damage");
var setup_1 = require("./setup");
/** 卡面价格（唯一来源：config）。 */
function costOfCard(card) {
    if (card.kind === 'animal' && card.species !== undefined)
        return species_1.SPECIES[card.species].cost;
    if (card.kind === 'buff' && card.buff !== undefined)
        return (0, damage_1.buffDefOfId)(card.buff).cost;
    if (card.kind === 'weather' && card.weather !== undefined) {
        for (var i = 0; i < weather_1.WEATHER_CARDS.length; i++) {
            if (weather_1.WEATHER_CARDS[i].id === card.weather)
                return weather_1.WEATHER_CARDS[i].cost;
        }
    }
    return 0;
}
/** 当前刷新费用（共享集市：按本轮已刷新次数递增）。 */
function refreshCost(state) {
    var used = state.refreshUsed;
    var list = economy_1.ECONOMY.REFRESH_COST;
    if (used < 0)
        return list[0];
    if (used >= list.length)
        return list[list.length - 1];
    return list[used];
}
/** 集市/布阵阶段才可以买卖（战斗与观测只读）。 */
function canTrade(state) {
    return state.phase === 'market' || state.phase === 'deploy';
}
/**
 * 能否购买：返回 ok/reason（场景层点击前预判，不需要真买）。
 * reason ∈ 'bad-phase' | 'bad-slot' | 'slot-taken' | 'not-enough-sunlight' | 'bench-full' | 'gift-used'
 */
function canBuy(state, faction, slot, useGift) {
    if (!canTrade(state))
        return { ok: false, reason: 'bad-phase' };
    if (slot < 0 || slot >= state.shelf.length)
        return { ok: false, reason: 'bad-slot' };
    var item = state.shelf[slot];
    if (item === undefined || item === null || item.taken)
        return { ok: false, reason: 'slot-taken' };
    var s = (0, setup_1.side)(state, faction);
    var card = item.card;
    if (card === null)
        return { ok: false, reason: 'slot-taken' };
    if (useGift) {
        if (state.economy[faction].giftUsed)
            return { ok: false, reason: 'gift-used' };
        if (card.kind === 'animal' && (0, setup_1.findBenchSlot)(s) < 0)
            return { ok: false, reason: 'bench-full' };
        return { ok: true };
    }
    if (s.sunlight < costOfCard(card))
        return { ok: false, reason: 'not-enough-sunlight' };
    if (card.kind === 'animal' && (0, setup_1.findBenchSlot)(s) < 0)
        return { ok: false, reason: 'bench-full' };
    return { ok: true };
}
/** 购买货架第 slot 张（useGift = 用掉本轮免费赠礼）。 */
function applyBuy(state, faction, slot, useGift) {
    var check = canBuy(state, faction, slot, useGift);
    if (!check.ok)
        return { ok: false, reason: check.reason, fx: 'reject' };
    var s = (0, setup_1.side)(state, faction);
    var item = state.shelf[slot];
    var card = item.card;
    if (card === null)
        return { ok: false, reason: 'slot-taken', fx: 'reject' };
    var cost = useGift ? 0 : costOfCard(card);
    if (card.kind === 'animal' && card.species !== undefined) {
        var bslot = (0, setup_1.findBenchSlot)(s);
        var unit = (0, setup_1.createUnit)(state, faction, card.species, 1, cost);
        s.bench[bslot] = unit;
    }
    else if (card.kind === 'buff' && card.buff !== undefined) {
        s.hand.push({ id: state.nextId++, kind: 'buff', buff: card.buff, boughtRound: state.round });
    }
    else if (card.kind === 'weather' && card.weather !== undefined) {
        state.weather[faction].next = card.weather;
    }
    else {
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
function applyRefresh(state, faction) {
    if (!canTrade(state))
        return { ok: false, reason: 'bad-phase', fx: 'reject' };
    if (state.refreshUsed >= economy_1.ECONOMY.REFRESH_LIMIT) {
        return { ok: false, reason: 'refresh-limit', fx: 'reject' };
    }
    var cost = refreshCost(state);
    var s = (0, setup_1.side)(state, faction);
    if (s.sunlight < cost)
        return { ok: false, reason: 'not-enough-sunlight', fx: 'reject' };
    s.sunlight -= cost;
    state.economy[faction].refreshSpent += cost;
    state.refreshUsed += 1;
    state.shelf = (0, setup_1.rollShelf)(state);
    return { ok: true, fx: 'leaf-fall' };
}
/** 卖出替补席或场上单位：返还累计费用 × 80%，身上的加成牌回手。 */
function applySell(state, faction, unitId) {
    if (!canTrade(state))
        return { ok: false, reason: 'bad-phase', fx: 'reject' };
    var s = (0, setup_1.side)(state, faction);
    var u = (0, setup_1.takeFromBench)(s, unitId);
    if (u === null)
        u = (0, setup_1.takeFromField)(s, unitId);
    if (u === null)
        return { ok: false, reason: 'no-such-unit', fx: 'reject' };
    u.alive = false;
    var gain = (0, economy_1.sellValue)(u.invested);
    s.sunlight += gain;
    state.economy[faction].sellGained += gain;
    for (var i = 0; i < u.buffs.length; i++) {
        s.hand.push({ id: state.nextId++, kind: 'buff', buff: u.buffs[i], boughtRound: state.round });
    }
    return { ok: true, fx: 'leaf-fall' };
}
/** 把手中的加成牌装到指定动物（每只 2 张，同名牌不可重复）。 */
function applyEquipBuff(state, faction, cardId, unitId) {
    var s = (0, setup_1.side)(state, faction);
    var card = (0, setup_1.cardById)(s, cardId);
    if (card === null || card.kind !== 'buff' || card.buff === undefined) {
        return { ok: false, reason: 'no-such-card', fx: 'reject' };
    }
    var u = (0, setup_1.unitById)(state, unitId);
    if (u === null || u.owner !== faction)
        return { ok: false, reason: 'no-such-unit', fx: 'reject' };
    if (u.buffs.length >= cards_1.BUFF_SLOTS)
        return { ok: false, reason: 'buff-slots-full', fx: 'reject' };
    if ((0, damage_1.hasBuff)(u, card.buff))
        return { ok: false, reason: 'duplicate-buff', fx: 'reject' };
    u.buffs.push(card.buff);
    (0, setup_1.removeHandCard)(s, cardId);
    return { ok: true, fx: 'buff-wrap' };
}
/** 卸下某张加成牌（不退款，牌回手）。 */
function applyRemoveBuff(state, faction, unitId, buffIndex) {
    var s = (0, setup_1.side)(state, faction);
    var u = (0, setup_1.unitById)(state, unitId);
    if (u === null || u.owner !== faction)
        return { ok: false, reason: 'no-such-unit', fx: 'reject' };
    if (buffIndex < 0 || buffIndex >= u.buffs.length) {
        return { ok: false, reason: 'no-such-buff', fx: 'reject' };
    }
    var buff = u.buffs[buffIndex];
    u.buffs.splice(buffIndex, 1);
    s.hand.push({ id: state.nextId++, kind: 'buff', buff: buff, boughtRound: state.round });
    return { ok: true, fx: 'leaf-fall' };
}
/** 下一轮基础收入 + 利息（R1 不发放，开局只有 START_SUNLIGHT）。 */
function grantRoundIncome(state, faction) {
    if (state.round <= 1)
        return;
    var s = (0, setup_1.side)(state, faction);
    var interest = (0, economy_1.interestOf)(s.sunlight);
    s.sunlight += economy_1.ECONOMY.ROUND_INCOME + interest;
    state.economy[faction].income += economy_1.ECONOMY.ROUND_INCOME;
    state.economy[faction].interest += interest;
}
/** 回合胜利奖励（结算阶段立刻进账）。 */
function grantWinBonus(state, faction) {
    var s = (0, setup_1.side)(state, faction);
    s.sunlight += economy_1.ECONOMY.WIN_SUNLIGHT;
    state.economy[faction].income += economy_1.ECONOMY.WIN_SUNLIGHT;
}
/** 进入集市：换一整套新货架、重置刷新/赠礼计数，并发放本轮收入。 */
function beginMarket(state) {
    state.shelf = (0, setup_1.rollShelf)(state);
    state.refreshUsed = 0;
    state.giftUsed = false;
    state.economy.player.giftUsed = false;
    state.economy.enemy.giftUsed = false;
    grantRoundIncome(state, 'player');
    grantRoundIncome(state, 'enemy');
}
/** 校验货架与加成牌的静态一致性（自检用，正常应恒为 true）。 */
function shelfIntegrity(state) {
    if (state.shelf.length === 0)
        return false;
    for (var i = 0; i < state.shelf.length; i++) {
        var item = state.shelf[i];
        if (item === undefined || item === null)
            return false;
        var card = item.card;
        if (card === null)
            continue;
        if (card.kind === 'animal' && card.species === undefined)
            return false;
        if (card.kind === 'buff' && card.buff === undefined)
            return false;
        if (card.kind === 'weather' && card.weather === undefined)
            return false;
    }
    return cards_1.BUFF_CARDS.length > 0 && cards_1.BUFF_SLOTS > 0;
}
