"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.damageOpts = damageOpts;
exports.buffDefOfId = buffDefOfId;
exports.hasBuff = hasBuff;
exports.shieldCap = shieldCap;
exports.grantShield = grantShield;
exports.healUnit = healUnit;
exports.dealDamage = dealDamage;
exports.tickDamage = tickDamage;
exports.killUnit = killUnit;
exports.buffAtkMul = buffAtkMul;
exports.buffReduce = buffReduce;
exports.buffMoveMul = buffMoveMul;
exports.buffIntervalMul = buffIntervalMul;
exports.buffDetourFactor = buffDetourFactor;
exports.buffCritBonus = buffCritBonus;
exports.hasLowHpTarget = hasLowHpTarget;
exports.lowHpBonus = lowHpBonus;
exports.effectiveSpecies = effectiveSpecies;
exports.baseAtkOf = baseAtkOf;
exports.speciesPower = speciesPower;
/**
 * 伤害结算（§10 严格顺序）与 HP/护盾/治疗/DOT 的唯一入口。
 *
 * §10：基础攻击力 → 特技/加成牌(加算) → 天气修正 → 克制修正 → 目标减伤
 *      → 护盾吸收 → 特性结算(暴击/连击/处决) → 扣 HP → 反震/吸血
 *
 * 归因（结算页堆叠条）：把最终伤害做乘法分解，各分项之和在浮点意义上恒等于
 * 最终伤害（伸缩求和），因此「各项之和 vs 总计」误差为 0，远小于 1% 要求。
 */
var cards_1 = require("../config/cards");
var species_1 = require("../config/species");
var timing_1 = require("../config/timing");
var setup_1 = require("./setup");
function damageOpts(base) {
    return {
        base: base,
        addMul: 0,
        weatherMul: 1,
        counterMul: 1,
        traitMul: 1,
        reduce: 0,
        ignoreReduce: 0,
        source: null,
        secondary: true
    };
}
function buffDefOfId(id) {
    for (var i = 0; i < cards_1.BUFF_CARDS.length; i++)
        if (cards_1.BUFF_CARDS[i].id === id)
            return cards_1.BUFF_CARDS[i];
    return cards_1.BUFF_CARDS[0];
}
function hasBuff(u, id) {
    for (var i = 0; i < u.buffs.length; i++)
        if (u.buffs[i] === id)
            return true;
    return false;
}
/** 护盾上限（30% maxHP）。 */
function shieldCap(u) {
    return Math.floor(u.maxHp * timing_1.TIMING.SHIELD_CAP_RATIO);
}
/**
 * 获得护盾：上限 30% maxHP，多次获得取最大值而非叠加（§2.8）。
 * 返回实际获得的护盾量。
 */
function grantShield(state, unit, amount) {
    if (amount <= 0 || !unit.alive)
        return 0;
    var cap = shieldCap(unit);
    var want = amount > cap ? cap : amount;
    if (want <= unit.shield)
        return 0;
    var gained = want - unit.shield;
    unit.shield = want;
    unit.fx.shieldRipple = 1;
    (0, setup_1.pushEvent)(state, 'UnitShield', unit.owner, unit.id, -1, gained, null, unit.species);
    return gained;
}
/** 治疗：超过 maxHP 的部分按溢出治疗转护盾（§2.8）。返回真实回复量。 */
function healUnit(state, unit, amount) {
    if (amount <= 0 || !unit.alive)
        return 0;
    var room = unit.maxHp - unit.hp;
    if (room < 0)
        room = 0;
    var healed = room < amount ? room : amount;
    unit.hp += healed;
    unit.stat.healed += healed;
    if (healed > 0)
        (0, setup_1.pushEvent)(state, 'UnitHeal', unit.owner, unit.id, -1, healed, null, unit.species);
    var overflow = amount - healed;
    if (overflow > 0)
        grantShield(state, unit, overflow);
    return healed;
}
function addStat(u, source, amount) {
    if (amount <= 0)
        return;
    if (source === null)
        return;
    u.stat.bySource[source] += amount;
}
/**
 * 结算一次伤害（含护盾吸收与统计归因）。返回最终伤害值（含打在护盾上的部分）。
 */
function dealDamage(state, attacker, target, opts) {
    if (!target.alive)
        return 0;
    var fBuff = 1 + opts.addMul;
    var fWeather = opts.weatherMul;
    var fCounter = opts.counterMul;
    var fTrait = opts.traitMul;
    var reduce = opts.reduce;
    if (opts.ignoreReduce > 0)
        reduce = reduce * (1 - opts.ignoreReduce);
    if (reduce < 0)
        reduce = 0;
    if (reduce > 0.9)
        reduce = 0.9;
    var common = fBuff * fWeather * fCounter * fTrait * (1 - reduce);
    var dmg = opts.base * common;
    if (dmg < 0)
        dmg = 0;
    var final = Math.floor(dmg);
    if (final <= 0)
        return 0;
    // ---- 归因分解（乘法链瀑布，保证各分项之和 == final） ----
    // base ×(1+addMul)[加成牌] ×weather ×counter ×trait，最后再乘目标减伤。
    // 分项按 final/v4 归一，使"减免后"的各分项之和恰好等于 final（§16 要求误差 < 1%）；
    // 单独为负的分项（被克制、负面天气）记 0，差额并入普攻，总和仍然不变。
    if (attacker !== null) {
        if (opts.source !== null) {
            addStat(attacker, opts.source, final);
        }
        else {
            var v1 = opts.base * fBuff;
            var v2 = v1 * fWeather;
            var v3 = v2 * fCounter;
            var v4 = v3 * fTrait;
            var scale = v4 > 0 ? final / v4 : 0;
            var cBuff = (v1 - opts.base) * scale;
            var cWeather = (v2 - v1) * scale;
            var cCounter = (v3 - v2) * scale;
            var cTrait = (v4 - v3) * scale;
            if (cBuff < 0)
                cBuff = 0;
            if (cWeather < 0)
                cWeather = 0;
            if (cCounter < 0)
                cCounter = 0;
            if (cTrait < 0)
                cTrait = 0;
            addStat(attacker, 'basic', final - cBuff - cWeather - cCounter - cTrait);
            addStat(attacker, 'buff', cBuff);
            addStat(attacker, 'weather', cWeather);
            addStat(attacker, 'counter', cCounter);
            addStat(attacker, 'trait', cTrait);
        }
        attacker.stat.damageDealt += final;
    }
    // ---- 护盾吸收 → 扣 HP ----
    var remaining = final;
    if (target.shield > 0) {
        var absorbed = target.shield < remaining ? target.shield : remaining;
        target.shield -= absorbed;
        remaining -= absorbed;
    }
    target.hp -= remaining;
    if (target.hp < 0)
        target.hp = 0;
    target.stat.damageTaken += final;
    target.fx.hitFlash = timing_1.TIMING.HIT_FLASH;
    if (attacker !== null) {
        target.fx.hitDir = target.pos.x >= attacker.pos.x ? 1 : -1;
        attacker.fx.counterHit = fCounter > 1 ? 1 : 0;
    }
    if (opts.event !== undefined) {
        (0, setup_1.pushEvent)(state, opts.event, attacker === null ? null : attacker.owner, attacker === null ? -1 : attacker.id, target.id, final, opts.source, attacker === null ? null : attacker.species);
    }
    else {
        (0, setup_1.pushEvent)(state, 'UnitDamage', attacker === null ? null : attacker.owner, attacker === null ? -1 : attacker.id, target.id, final, opts.source, attacker === null ? null : attacker.species);
    }
    // ---- 反震（荆棘之刺 / §9 荆棘反震）：DOT 不触发 ----
    if (opts.secondary && attacker !== null && attacker.alive) {
        var thorns = 0;
        // §9 装备式特技「荆棘反震」：受到伤害时反弹 30% 给攻击者
        var equipThorns = target.equip === 'thorns';
        if (equipThorns)
            thorns += timing_1.TIMING.EQUIP_THORNS_PCT;
        for (var i = 0; i < target.buffs.length; i++) {
            var def = buffDefOfId(target.buffs[i]);
            if (def.thornsPct !== undefined)
                thorns += def.thornsPct;
        }
        if (thorns > 0) {
            var reflect = Math.floor(final * thorns);
            if (reflect > 0) {
                var rOpts = damageOpts(reflect);
                rOpts.source = equipThorns ? 'trait' : 'buff';
                rOpts.secondary = false;
                rOpts.event = 'UnitDamage';
                applyRawDamage(state, target, attacker, rOpts);
            }
        }
    }
    // ---- 汲取（§9 装备式特技）：造成伤害的 25% 回复自身，DOT 与反震不触发 ----
    if (opts.secondary && attacker !== null && attacker.alive && attacker.equip === 'drain') {
        var heal = Math.floor(final * timing_1.TIMING.EQUIP_DRAIN_PCT);
        if (heal > 0)
            healUnit(state, attacker, heal);
    }
    if (target.hp <= 0)
        killUnit(state, target, attacker);
    return final;
}
/** 同上，但不触发反震递归（内部用）。 */
function applyRawDamage(state, from, to, opts) {
    return dealDamage(state, from, to, opts);
}
/**
 * 持续伤害统一入口（流血 / 天气 DOT）：不参与反击、吸血、反震二次结算（§2.8）。
 */
function tickDamage(state, target, amount, source, attacker) {
    var opts = damageOpts(amount);
    opts.source = source;
    opts.secondary = false;
    return dealDamage(state, attacker, target, opts);
}
/** 致死判定：替身草人优先触发一次，其次才真死（§7.3）。 */
function killUnit(state, target, killer) {
    if (!target.alive)
        return;
    if (!target.isDecoy && !target.decoyUsed && hasBuff(target, 'decoyStraw')) {
        var def = buffDefOfId('decoyStraw');
        var pct = def.decoyHpPct !== undefined ? def.decoyHpPct : 0;
        var dur = def.decoyDuration !== undefined ? def.decoyDuration : 0;
        target.decoyUsed = true;
        target.isDecoy = true;
        target.shield = 0;
        target.hp = Math.floor(target.maxHp * pct);
        if (target.hp < 1)
            target.hp = 1;
        target.decoyUntil = state.time + dur;
        target.status.bleedStacks = 0;
        target.status.bleedUntil = 0;
        // 幻影不再计入存活统计的「再战」时长由 aliveMs 自然累加
        (0, setup_1.pushEvent)(state, 'UnitShield', target.owner, target.id, -1, target.hp, 'buff', target.species);
        return;
    }
    // §9 装备式特技「不屈」：首次死亡时以 30% 最大 HP 复活（每局一次）
    if (!target.unyieldUsed && target.equip === 'unyield') {
        target.unyieldUsed = true;
        target.hp = Math.floor(target.maxHp * timing_1.TIMING.EQUIP_UNYIELD_HP);
        if (target.hp < 1)
            target.hp = 1;
        target.status.bleedStacks = 0;
        target.status.bleedUntil = 0;
        (0, setup_1.pushEvent)(state, 'UnitHeal', target.owner, target.id, -1, target.hp, 'trait', target.species);
        return;
    }
    target.alive = false;
    target.hp = 0;
    target.shield = 0;
    target.fx.deathFirefly = 1;
    if (killer !== null)
        killer.stat.kills += 1;
    (0, setup_1.pushEvent)(state, 'UnitDeath', target.owner, target.id, -1, 0, null, target.species);
    if (target.owner === 'player') {
        (0, setup_1.pushEvent)(state, 'PlayerUnitDeath', target.owner, target.id, -1, 0, null, target.species);
    }
}
/** 加成牌提供的攻击力加算总额。 */
function buffAtkMul(u) {
    var sum = 0;
    for (var i = 0; i < u.buffs.length; i++) {
        var def = buffDefOfId(u.buffs[i]);
        if (def.atkMul !== undefined)
            sum += def.atkMul;
    }
    return sum;
}
/** 加成牌提供的减伤总额（可叠加，>0 表示受伤减免）。 */
function buffReduce(u) {
    var sum = 0;
    for (var i = 0; i < u.buffs.length; i++) {
        var def = buffDefOfId(u.buffs[i]);
        if (def.dmgReduce !== undefined)
            sum += def.dmgReduce;
    }
    return sum;
}
/** 加成牌提供的移速乘区。 */
function buffMoveMul(u) {
    var sum = 0;
    for (var i = 0; i < u.buffs.length; i++) {
        var def = buffDefOfId(u.buffs[i]);
        if (def.moveMul !== undefined)
            sum += def.moveMul;
    }
    return sum;
}
/** 加成牌提供的攻击间隔乘区（>1 = 变慢）。 */
function buffIntervalMul(u) {
    var m = 1;
    for (var i = 0; i < u.buffs.length; i++) {
        var def = buffDefOfId(u.buffs[i]);
        if (def.atkIntervalMul !== undefined)
            m *= def.atkIntervalMul;
    }
    return m;
}
/** 加成牌提供的绕路系数覆盖（疾风足）。 */
function buffDetourFactor(u) {
    var f = 0;
    for (var i = 0; i < u.buffs.length; i++) {
        var def = buffDefOfId(u.buffs[i]);
        if (def.detourFactor !== undefined && f === 0)
            f = def.detourFactor;
    }
    return f > 0 ? f : timing_1.TIMING.DETOUR_FACTOR;
}
/** 加成牌提供的暴击率加成（四叶草）。 */
function buffCritBonus(u) {
    var sum = 0;
    for (var i = 0; i < u.buffs.length; i++) {
        var def = buffDefOfId(u.buffs[i]);
        if (def.critChanceBonus !== undefined)
            sum += def.critChanceBonus;
    }
    return sum;
}
function hasLowHpTarget(u) {
    for (var i = 0; i < u.buffs.length; i++) {
        var def = buffDefOfId(u.buffs[i]);
        if (def.lowHpTarget === true)
            return true;
    }
    return false;
}
function lowHpBonus(u, target) {
    var sum = 0;
    for (var i = 0; i < u.buffs.length; i++) {
        var def = buffDefOfId(u.buffs[i]);
        if (def.lowHpTarget === true && def.lowHpBonus !== undefined)
            sum += def.lowHpBonus;
    }
    void target;
    return sum;
}
/** 单位「当前有效物种」（拟态伪装时按伪装后计算克制）。 */
function effectiveSpecies(u) {
    if (u.status.mimic !== null)
        return u.status.mimic;
    return u.species;
}
/** 基础攻击力（裸值，不含加成牌）。 */
function baseAtkOf(u) {
    return u.baseAtk;
}
function speciesPower(species) {
    return species_1.SPECIES[species].power;
}
