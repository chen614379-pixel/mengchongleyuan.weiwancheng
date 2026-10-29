"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareBattle = prepareBattle;
exports.stepBattle = stepBattle;
exports.battleOver = battleOver;
exports.fieldCount = fieldCount;
exports.effectiveInterval = effectiveInterval;
exports.effectiveSpeed = effectiveSpeed;
exports.reachOf = reachOf;
exports.unitDist = unitDist;
/**
 * 战斗推演（纯逻辑、无 DOM/wx、无网格判定）。
 *
 * 约定：
 * - 开战瞬间 `prepareBattle()` 把锚点吸附坐标声明为唯一连续坐标，之后一切按欧氏距离判定；
 *   本文件**不** import GRID_COLS / GRID_ROWS / anchorToPixel / LAYOUT.GRID，
 *   板上边界与"推进点"都来自 setup 预先算好的常量与字段（BATTLE_BOUNDS / pushPos / mirrorId）。
 * - 逻辑固定 20Hz，`stepBattle()` 恰好推进 TIMING.LOGIC_DT 毫秒。
 * - 所有随机数走 state.rng，所有单位按数组顺序遍历，保证同 seed 完全可复现。
 * - 攻击结算按"帧序号奇偶"交替先手阵营，消除玩家固定先手的公平性偏差（仍然完全确定）。
 */
var species_1 = require("../config/species");
var timing_1 = require("../config/timing");
var damage_1 = require("./damage");
var rng_1 = require("./rng");
var setup_1 = require("./setup");
var BOUNDARY_BAND = 0.5;
/** §9 狮·咆哮给主目标的减伤（config 未单列常量，此处按规格文案）。 */
var ROAR_GUARD_REDUCE = 0.2;
/** 移动解算的复用缓冲（避免每帧分配；顺序调用，无重入）。 */
var scratchUnits = [];
var scratchDX = [];
var scratchDY = [];
function num(v) {
    return v === undefined ? 0 : v;
}
function clamp(v, lo, hi) {
    if (v < lo)
        return lo;
    if (v > hi)
        return hi;
    return v;
}
function radiusUnits(u) {
    return u.bodyRadius / setup_1.PX_PER_UNIT;
}
function distUnits(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
}
function unitDist(a, b) {
    return distUnits(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
}
/** 攻击够得着的中心距离（含目标体积）。 */
function reachOf(u, target) {
    return u.atkRange + radiusUnits(target);
}
function weatherOf(state, faction) {
    return state.weatherFx[faction];
}
/** 天气里的种族联动（猫攻速 / 狗移速 / 象血量）。 */
function synergyOf(state, faction, species) {
    var out = { atkSpeedMul: 0, moveMul: 0, hpMaxMul: 0 };
    var b = state.weatherFx[faction];
    var syn = b.synergy;
    if (!syn)
        return out;
    var family = species_1.SPECIES[species].family;
    for (var i = 0; i < syn.length; i++) {
        if (syn[i].family === family) {
            out.atkSpeedMul += num(syn[i].atkSpeedMul);
            out.moveMul += num(syn[i].moveMul);
            out.hpMaxMul += num(syn[i].hpMaxMul);
        }
    }
    return out;
}
/** 实际攻击间隔（ms）：基础 × 加成牌 × 攻速乘区（含减速为负）。 */
function effectiveInterval(state, u) {
    var b = weatherOf(state, u.owner);
    var s = synergyOf(state, u.owner, u.species);
    var slow = state.time < u.status.slowAtkUntil ? u.status.slowAtkMul : 0;
    var speedMul = 1 + num(b.atkSpeedMul) + s.atkSpeedMul + slow;
    var interval = (u.atkInterval * (0, damage_1.buffIntervalMul)(u)) / (speedMul > 0.1 ? speedMul : 0.1);
    return interval < timing_1.TIMING.LOGIC_DT ? timing_1.TIMING.LOGIC_DT : interval;
}
/** 实际移速（单位/秒）。 */
function effectiveSpeed(state, u) {
    var b = weatherOf(state, u.owner);
    var s = synergyOf(state, u.owner, u.species);
    // §9 疾行：装备式特技 +50% 移速（加算进乘区）
    var equipMove = u.equip === 'swift' ? timing_1.TIMING.EQUIP_SWIFT_MOVE : 0;
    var mul = 1 + (0, damage_1.buffMoveMul)(u) + num(b.moveMul) + s.moveMul + equipMove;
    var v = u.moveSpeed * (mul > 0.05 ? mul : 0.05);
    return v > 0 ? v : 0;
}
/** 绕路惩罚系数：司令目标不是最近可达敌人时路径变长。 */
function detourFactorOf(u) {
    var f = (0, damage_1.buffDetourFactor)(u);
    return f > 0 ? f : timing_1.TIMING.DETOUR_FACTOR;
}
/** 光环：半径内友军（含自己之外的 herdHeart 携带者）提供的攻击力加算。 */
function auraAtkOf(state, u) {
    var bonus = 0;
    var allies = (0, setup_1.side)(state, u.owner).units;
    for (var i = 0; i < allies.length; i++) {
        var a = allies[i];
        if (a.id === u.id || !a.alive)
            continue;
        for (var k = 0; k < a.buffs.length; k++) {
            var def = (0, damage_1.buffDefOfId)(a.buffs[k]);
            if (def.auraAtk !== undefined && def.auraRadius !== undefined) {
                if (unitDist(a, u) <= def.auraRadius)
                    bonus += def.auraAtk;
            }
        }
    }
    return bonus;
}
/** 克制乘区：克制 ×1.5、被克制 ×0.75、其余 1。 */
function counterMulOf(u, target) {
    var me = (0, damage_1.effectiveSpecies)(u);
    var them = (0, damage_1.effectiveSpecies)(target);
    if (species_1.COUNTER[me] === them)
        return timing_1.TIMING.COUNTER_BONUS;
    if (species_1.COUNTER[them] === me)
        return timing_1.TIMING.COUNTERED_PENALTY;
    return 1;
}
/** 目标减伤：加成牌 + 咆哮护体 + 天气。 */
function reduceOf(state, target) {
    var guard = state.time < target.status.guardUntil ? target.status.guardReduce : 0;
    var r = (0, damage_1.buffReduce)(target) + guard + num(weatherOf(state, target.owner).dmgReduce);
    if (r < 0)
        r = 0;
    if (r > 0.9)
        r = 0.9;
    return r;
}
function facingOf(u, dx) {
    if (dx > 0.01)
        u.facing = 1;
    else if (dx < -0.01)
        u.facing = -1;
}
/**
 * 击退（软边界内夹紧）。`interrupt` 才打断目标当前的攻击蓄力：
 * 只有石拳（加成牌）的击退附带打断（§9），践踏的击退不打断。
 */
function knockback(state, target, from, dist, interrupt) {
    var dx = target.pos.x - from.pos.x;
    var dy = target.pos.y - from.pos.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) {
        dx = from.owner === 'player' ? 1 : -1;
        dy = 0;
    }
    else {
        dx /= d;
        dy /= d;
    }
    var r = radiusUnits(target);
    target.pos.x = clamp(target.pos.x + dx * dist, setup_1.BATTLE_BOUNDS.minX + r, setup_1.BATTLE_BOUNDS.maxX - r);
    target.pos.y = clamp(target.pos.y + dy * dist, setup_1.BATTLE_BOUNDS.minY + r, setup_1.BATTLE_BOUNDS.maxY - r);
    target.fx.hitDir = dx >= 0 ? 1 : -1;
    if (interrupt)
        target.atkTimer = 0;
}
/**
 * 流血：分层池，层数封顶，每秒伤害取较大值，刷新持续时间。
 * `source` 决定结算归因（种族流血 trait / 毒牙 buff），`u` 为施加者（统计归属）。
 */
function applyBleed(state, u, target, perSec, duration, maxStack, source) {
    var st = target.status;
    if (state.time >= st.bleedUntil) {
        st.bleedStacks = 0;
        st.bleedPerSec = 0;
    }
    if (st.bleedStacks <= 0) {
        st.bleedStacks = 1;
        st.bleedPerSec = perSec;
    }
    else {
        if (st.bleedStacks < maxStack)
            st.bleedStacks += 1;
        if (perSec > st.bleedPerSec)
            st.bleedPerSec = perSec;
    }
    st.bleedUntil = state.time + duration;
    if (source === 'trait' || target.bleedSource !== 'trait') {
        target.bleedSource = source;
        target.bleedFromId = u.id;
    }
}
/** 撕咬：攻速减速叠层（负值），封顶 -30%。 */
function applyRend(target, now) {
    var st = target.status;
    if (now >= st.slowAtkUntil)
        st.slowAtkMul = 0;
    st.slowAtkMul -= timing_1.TIMING.TRAIT_REND_ASPD;
    var cap = -timing_1.TIMING.TRAIT_REND_ASPD * timing_1.TIMING.TRAIT_REND_MAX_STACK;
    if (st.slowAtkMul < cap)
        st.slowAtkMul = cap;
    st.slowAtkUntil = now + timing_1.TIMING.TRAIT_REND_DURATION;
}
/** 践踏：主目标之外 1.2 单位内的敌人吃全额伤害，主目标被击退。 */
function trampleSplash(state, u, target) {
    var r = species_1.SPECIES.elephant.atkRange;
    var enemies = (0, setup_1.fieldUnits)(state, (0, setup_1.otherFaction)(u.owner));
    for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.id === target.id || !e.alive)
            continue;
        if (unitDist(u, e) > r)
            continue;
        var opts = (0, damage_1.damageOpts)(u.atk);
        opts.source = 'trait';
        (0, damage_1.dealDamage)(state, u, e, opts);
    }
    knockback(state, target, u, timing_1.TIMING.TRAIT_TRAMPLE_KNOCKBACK, false);
}
/** 咆哮：主目标获得 20% 减伤护体（§9 狮），1.0 单位内其他敌人吃 30%。 */
function roarSplash(state, u, target) {
    var until = state.time + timing_1.TIMING.TRAIT_ROAR_DURATION;
    if (target.status.guardUntil < until)
        target.status.guardUntil = until;
    if (target.status.guardReduce < ROAR_GUARD_REDUCE) {
        target.status.guardReduce = ROAR_GUARD_REDUCE;
    }
    var enemies = (0, setup_1.fieldUnits)(state, (0, setup_1.otherFaction)(u.owner));
    for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.id === target.id || !e.alive)
            continue;
        if (unitDist(target, e) > timing_1.TIMING.TRAIT_ROAR_RADIUS)
            continue;
        var opts = (0, damage_1.damageOpts)(u.atk * timing_1.TIMING.TRAIT_ROAR_SPLASH);
        opts.source = 'trait';
        (0, damage_1.dealDamage)(state, u, e, opts);
    }
}
/** 一次完整攻击结算（§10 顺序在 dealDamage 内实现）。 */
function performAttack(state, u, target) {
    var b = weatherOf(state, u.owner);
    var trait = u.trait;
    var addMul = (0, damage_1.buffAtkMul)(u) + auraAtkOf(state, u) + (0, damage_1.lowHpBonus)(u, target);
    var weatherMul = 1 + num(b.atkMul);
    var counterMul = counterMulOf(u, target);
    var reduce = reduceOf(state, target);
    var ignoreReduce = trait === 'ambush' ? timing_1.TIMING.TRAIT_AMBUSH_IGNORE_REDUCE : 0;
    var traitMul = 1;
    var critChance = num(b.critBonus) + (0, damage_1.buffCritBonus)(u) + (trait === 'crit' ? timing_1.TIMING.TRAIT_CRIT_CHANCE : 0);
    if (critChance > 0 && (0, rng_1.nextFloat)(state.rng) < clamp(critChance, 0, 1)) {
        traitMul *= timing_1.TIMING.TRAIT_CRIT_MULT;
    }
    if (trait === 'claw' && target.hp <= target.maxHp * timing_1.TIMING.TRAIT_CLAW_THRESHOLD) {
        traitMul *= timing_1.TIMING.TRAIT_CLAW_MULT;
    }
    u.fx.attackPulse = 1;
    u.fx.hitDir = u.pos.x <= target.pos.x ? 1 : -1;
    if (trait === 'combo') {
        for (var h = 0; h < timing_1.TIMING.TRAIT_COMBO_HITS; h++) {
            if (!target.alive)
                break;
            var opts = (0, damage_1.damageOpts)(u.atk * timing_1.TIMING.TRAIT_COMBO_SCALE);
            opts.addMul = addMul;
            opts.weatherMul = weatherMul;
            opts.counterMul = counterMul;
            opts.traitMul = traitMul;
            opts.reduce = reduce;
            opts.ignoreReduce = ignoreReduce;
            opts.source = 'trait';
            (0, damage_1.dealDamage)(state, u, target, opts);
        }
    }
    else {
        var opts = (0, damage_1.damageOpts)(u.atk);
        opts.addMul = addMul;
        opts.weatherMul = weatherMul;
        opts.counterMul = counterMul;
        opts.traitMul = traitMul;
        opts.reduce = reduce;
        opts.ignoreReduce = ignoreReduce;
        (0, damage_1.dealDamage)(state, u, target, opts);
    }
    if (!target.alive)
        return;
    if (trait === 'trample')
        trampleSplash(state, u, target);
    else if (trait === 'roar')
        roarSplash(state, u, target);
    else if (trait === 'bleed') {
        applyBleed(state, u, target, u.atk * timing_1.TIMING.TRAIT_BLEED_SCALE, timing_1.TIMING.TRAIT_BLEED_DURATION, timing_1.TIMING.TRAIT_BLEED_MAX_STACK, 'trait');
    }
    else if (trait === 'rend') {
        applyRend(target, state.time);
    }
    for (var i = 0; i < u.buffs.length; i++) {
        var def = (0, damage_1.buffDefOfId)(u.buffs[i]);
        if (def.bleedPct !== undefined) {
            applyBleed(state, u, target, u.atk * def.bleedPct, def.bleedDuration === undefined ? timing_1.TIMING.TRAIT_BLEED_DURATION : def.bleedDuration, def.bleedMaxStack === undefined ? 1 : def.bleedMaxStack, 'buff');
        }
        if (def.knockChance !== undefined && (0, rng_1.nextFloat)(state.rng) < def.knockChance) {
            knockback(state, target, u, def.knockDist === undefined ? 0.5 : def.knockDist, true);
        }
    }
}
/**
 * §9 嘲讽：返回 1.5 单位内最近的嘲讽者（没有则 null）。
 * 嘲讽是装备式特技（`u.equip === 'taunt'`），与种族特技无关。
 */
function nearestTaunter(state, u) {
    var enemies = (0, setup_1.fieldUnits)(state, (0, setup_1.otherFaction)(u.owner));
    var best = null;
    var bestD = 0;
    for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (!e.alive || e.equip !== 'taunt')
            continue;
        var d = unitDist(u, e);
        if (d > timing_1.TIMING.EQUIP_TAUNT_RANGE)
            continue;
        if (best === null || d < bestD) {
            best = e;
            bestD = d;
        }
    }
    return best;
}
/** 索敌：指挥目标 > 正对 > 最低 HP（偷袭/猎手本能）> 被自己克制 > 最近 > 推进敌方半场。 */
function recalcTarget(state, u) {
    if (u.forcedTargetId >= 0) {
        var ft = (0, setup_1.unitById)(state, u.forcedTargetId);
        if (ft !== null && ft.alive) {
            u.targetId = ft.id;
            return;
        }
        u.forcedTargetId = -1;
    }
    // §9 嘲讽：1.5 单位内的嘲讽者强制吸引（优先级高于镜像对手与打分）
    var taunter = nearestTaunter(state, u);
    if (taunter !== null) {
        u.targetId = taunter.id;
        return;
    }
    var enemies = (0, setup_1.fieldUnits)(state, (0, setup_1.otherFaction)(u.owner));
    if (u.mirrorId >= 0) {
        var m = (0, setup_1.unitById)(state, u.mirrorId);
        if (m !== null && m.alive && unitDist(u, m) <= timing_1.TIMING.PERCEIVE_RANGE) {
            u.targetId = m.id;
            return;
        }
    }
    var preferLowHp = u.trait === 'ambush' || (0, damage_1.hasLowHpTarget)(u);
    var me = (0, damage_1.effectiveSpecies)(u);
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (!e.alive)
            continue;
        var d = unitDist(u, e);
        if (d > timing_1.TIMING.PERCEIVE_RANGE)
            continue;
        if (preferLowHp) {
            if (best === null || e.hp < best.hp)
                best = e;
            continue;
        }
        var score = 0;
        if (species_1.COUNTER[me] === (0, damage_1.effectiveSpecies)(e))
            score += 1000;
        score += timing_1.TIMING.PERCEIVE_RANGE - d;
        if (best === null || score > bestScore) {
            best = e;
            bestScore = score;
        }
    }
    u.targetId = best === null ? -1 : best.id;
}
/** 移动同时解算：先算全部位移，再统一落位（与遍历顺序无关）。 */
function stepMovement(state, dt) {
    var all = scratchUnits;
    all.length = 0;
    var pf = ['player', 'enemy'];
    for (var f = 0; f < pf.length; f++) {
        var units = (0, setup_1.side)(state, pf[f]).units;
        for (var i = 0; i < units.length; i++)
            if (units[i].alive)
                all.push(units[i]);
    }
    var n = all.length;
    for (var i = 0; i < n; i++) {
        scratchDX[i] = 0;
        scratchDY[i] = 0;
    }
    for (var i = 0; i < n; i++) {
        var u = all[i];
        var target = u.targetId >= 0 ? (0, setup_1.unitById)(state, u.targetId) : null;
        if (target !== null && target.alive && unitDist(u, target) <= reachOf(u, target))
            continue;
        var dx = void 0;
        var dy = void 0;
        if (target !== null && target.alive) {
            dx = target.pos.x - u.pos.x;
            dy = target.pos.y - u.pos.y;
        }
        else {
            dx = u.pushPos.x - u.pos.x;
            dy = u.pushPos.y - u.pos.y;
        }
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-6) {
            dx = u.owner === 'player' ? 1 : -1;
            dy = 0;
            d = 1;
        }
        dx /= d;
        dy /= d;
        // 转向避让：前方 60° 锥内最近的阻挡单位 → 向空侧偏转 30°~60°
        var steer = 0;
        var blockDist = 1e9;
        var blockSide = 0;
        for (var j = 0; j < n; j++) {
            if (j === i)
                continue;
            var o = all[j];
            var ox = o.pos.x - u.pos.x;
            var oy = o.pos.y - u.pos.y;
            var od = Math.sqrt(ox * ox + oy * oy);
            if (od < 1e-6 || od > timing_1.TIMING.SEPARATION_RADIUS)
                continue;
            if ((ox * dx + oy * dy) / od < Math.cos(timing_1.TIMING.STEER_CONE * 0.5))
                continue;
            if (od < blockDist) {
                blockDist = od;
                var cross = dx * oy - dy * ox;
                if (cross > 0.0001)
                    blockSide = -1;
                else if (cross < -0.0001)
                    blockSide = 1;
                else
                    blockSide = u.id % 2 === 0 ? 1 : -1;
            }
        }
        if (blockSide !== 0) {
            var t = 1 - blockDist / timing_1.TIMING.SEPARATION_RADIUS;
            steer = (timing_1.TIMING.STEER_MIN + (timing_1.TIMING.STEER_MAX - timing_1.TIMING.STEER_MIN) * t) * blockSide;
            var cs = Math.cos(steer);
            var sn = Math.sin(steer);
            var rx = dx * cs - dy * sn;
            var ry = dx * sn + dy * cs;
            dx = rx;
            dy = ry;
        }
        // 0.7 单位内软分离互推
        var sepX = 0;
        var sepY = 0;
        for (var j = 0; j < n; j++) {
            if (j === i)
                continue;
            var o = all[j];
            var ox = u.pos.x - o.pos.x;
            var oy = u.pos.y - o.pos.y;
            var od = Math.sqrt(ox * ox + oy * oy);
            if (od > timing_1.TIMING.SEPARATION_RADIUS)
                continue;
            if (od < 1e-6) {
                var a = (u.id % 8) * (Math.PI / 4);
                ox = Math.cos(a);
                oy = Math.sin(a);
                od = 1;
            }
            else {
                ox /= od;
                oy /= od;
            }
            var w = 1 - od / timing_1.TIMING.SEPARATION_RADIUS;
            sepX += ox * w;
            sepY += oy * w;
        }
        // 软边界推回
        var pushX = 0;
        var pushY = 0;
        if (u.pos.x < setup_1.BATTLE_BOUNDS.minX + BOUNDARY_BAND)
            pushX += 1;
        if (u.pos.x > setup_1.BATTLE_BOUNDS.maxX - BOUNDARY_BAND)
            pushX -= 1;
        if (u.pos.y < setup_1.BATTLE_BOUNDS.minY + BOUNDARY_BAND)
            pushY += 1;
        if (u.pos.y > setup_1.BATTLE_BOUNDS.maxY - BOUNDARY_BAND)
            pushY -= 1;
        var mx = dx + sepX * timing_1.TIMING.SEPARATION_PUSH + pushX * timing_1.TIMING.BOUNDARY_PUSH;
        var my = dy + sepY * timing_1.TIMING.SEPARATION_PUSH + pushY * timing_1.TIMING.BOUNDARY_PUSH;
        var ml = Math.sqrt(mx * mx + my * my);
        if (ml < 1e-6)
            continue;
        mx /= ml;
        my /= ml;
        var speed = effectiveSpeed(state, u);
        if (u.forcedTargetId >= 0) {
            // 绕路系数只作用于"被迫脱离最近敌人"的情况
            var enemies = (0, setup_1.fieldUnits)(state, (0, setup_1.otherFaction)(u.owner));
            var nearestId = -1;
            var nearestD = 1e9;
            for (var k = 0; k < enemies.length; k++) {
                var ed = unitDist(u, enemies[k]);
                if (ed < nearestD) {
                    nearestD = ed;
                    nearestId = enemies[k].id;
                }
            }
            if (nearestId !== -1 && nearestId !== u.forcedTargetId) {
                speed = speed / detourFactorOf(u);
            }
        }
        scratchDX[i] = mx * speed * dt;
        scratchDY[i] = my * speed * dt;
    }
    for (var i = 0; i < n; i++) {
        var u = all[i];
        if (scratchDX[i] === 0 && scratchDY[i] === 0)
            continue;
        var r = radiusUnits(u);
        u.pos.x = clamp(u.pos.x + scratchDX[i], setup_1.BATTLE_BOUNDS.minX + r, setup_1.BATTLE_BOUNDS.maxX - r);
        u.pos.y = clamp(u.pos.y + scratchDY[i], setup_1.BATTLE_BOUNDS.minY + r, setup_1.BATTLE_BOUNDS.maxY - r);
        facingOf(u, scratchDX[i]);
    }
}
/**
 * 一帧的攻击推进。两遍式：先对双方统一判定"本帧出手"（读的是本帧攻击前的状态），
 * 再统一结算伤害。这样双方同帧出手是**真正同时**的，不会因为遍历顺序让先被扫到的一方
 * 白赚一次攻击（曾导致镜像对战中出现系统性"先手一次攻击"优势）。
 */
function stepAttacks(state, dtMs) {
    var pf = ['player', 'enemy'];
    var firedUnits = [];
    var firedTargets = [];
    for (var f = 0; f < pf.length; f++) {
        var units = (0, setup_1.side)(state, pf[f]).units;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u.alive)
                continue;
            var target = u.targetId >= 0 ? (0, setup_1.unitById)(state, u.targetId) : null;
            var inReach = target !== null && target.alive && unitDist(u, target) <= reachOf(u, target);
            var iv = effectiveInterval(state, u);
            u.atkTimer += dtMs;
            if (!inReach) {
                if (u.atkTimer > iv)
                    u.atkTimer = iv;
                continue;
            }
            if (u.atkTimer >= iv) {
                u.atkTimer = 0;
                firedUnits.push(u);
                firedTargets.push(target);
            }
        }
    }
    for (var i = 0; i < firedUnits.length; i++) {
        // 出手判定已完成：即使出手者本帧被打死，这一击也已经打出去了（同时结算）。
        if (!firedTargets[i].alive)
            continue;
        performAttack(state, firedUnits[i], firedTargets[i]);
    }
}
/** 每秒结算型状态：流血、回复、天气流失、演出衰减。 */
function tickStatus(state, dtMs) {
    var pf = ['player', 'enemy'];
    var decay = dtMs / 1000;
    for (var f = 0; f < pf.length; f++) {
        var units = (0, setup_1.side)(state, pf[f]).units;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u.alive)
                continue;
            // 流血（tickDamage：不触发反震/吸血二次结算）
            if (u.status.bleedStacks > 0) {
                u.dotTimer += dtMs;
                while (u.dotTimer >= 1000) {
                    u.dotTimer -= 1000;
                    var amount = Math.floor(u.status.bleedPerSec * u.status.bleedStacks);
                    if (amount > 0) {
                        var src = (0, setup_1.unitById)(state, u.bleedFromId);
                        (0, damage_1.tickDamage)(state, u, amount, u.bleedSource, src);
                    }
                    if (!u.alive)
                        break;
                }
            }
            else {
                u.dotTimer = 0;
            }
            if (!u.alive)
                continue;
            var wb = weatherOf(state, u.owner);
            // 回复（加成牌 + 天气）
            var regenPct = 0;
            var regenInterval = 0;
            for (var k = 0; k < u.buffs.length; k++) {
                var def = (0, damage_1.buffDefOfId)(u.buffs[k]);
                if (def.regenPct !== undefined) {
                    regenPct += def.regenPct;
                    var ri = def.regenInterval === undefined ? 3000 : def.regenInterval;
                    if (ri > regenInterval)
                        regenInterval = ri;
                }
            }
            if (num(wb.regenPct) > 0) {
                regenPct += num(wb.regenPct);
                var ri = num(wb.regenInterval) === 0 ? 1000 : num(wb.regenInterval);
                if (ri > regenInterval)
                    regenInterval = ri;
            }
            if (regenPct > 0 && regenInterval > 0) {
                u.regenTimer += dtMs;
                while (u.regenTimer >= regenInterval) {
                    u.regenTimer -= regenInterval;
                    (0, damage_1.healUnit)(state, u, Math.floor(u.maxHp * regenPct));
                    if (!u.alive)
                        break;
                }
            }
            else {
                u.regenTimer = 0;
            }
            // 天气流失
            var drainPct = num(wb.drainPct);
            if (drainPct > 0) {
                var drainInterval = num(wb.drainInterval) === 0 ? 1000 : num(wb.drainInterval);
                u.drainTimer += dtMs;
                while (u.drainTimer >= drainInterval) {
                    u.drainTimer -= drainInterval;
                    var basis = wb.drainOnCurrent ? u.hp : u.maxHp;
                    var amount = Math.floor(basis * drainPct);
                    if (amount > 0)
                        (0, damage_1.tickDamage)(state, u, amount, 'weather', null);
                    if (!u.alive)
                        break;
                }
            }
            else {
                u.drainTimer = 0;
            }
            // 演出计时衰减
            if (u.fx.hitFlash > 0) {
                u.fx.hitFlash -= decay / timing_1.TIMING.HIT_FLASH;
                if (u.fx.hitFlash < 0)
                    u.fx.hitFlash = 0;
            }
            if (u.fx.attackPulse > 0) {
                u.fx.attackPulse -= decay * 4;
                if (u.fx.attackPulse < 0)
                    u.fx.attackPulse = 0;
            }
            if (u.fx.shieldRipple > 0) {
                u.fx.shieldRipple -= decay * 2;
                if (u.fx.shieldRipple < 0)
                    u.fx.shieldRipple = 0;
            }
            if (u.fx.counterHit > 0) {
                u.fx.counterHit -= decay * 2;
                if (u.fx.counterHit < 0)
                    u.fx.counterHit = 0;
            }
        }
    }
}
/**
 * 开战准备：应用天气 HP 上限乘区、清空战斗态计时与目标、把锚点吸附声明为连续坐标。
 * 由 engine 在 observe → battle 切换时调用一次。
 */
function prepareBattle(state) {
    var pf = ['player', 'enemy'];
    for (var f = 0; f < pf.length; f++) {
        var faction = pf[f];
        var b = weatherOf(state, faction);
        var units = (0, setup_1.side)(state, faction).units;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            var s = synergyOf(state, faction, u.species);
            var mul = 1 + num(b.hpMaxMul) + s.hpMaxMul;
            // baseMaxHp 存的是 1 级裸值，等级倍率必须显式乘回来（否则二合一的 L2/L3 数值会被抹掉）
            var newMax = Math.floor(u.baseMaxHp * (0, setup_1.levelMultiplier)(u.level) * mul);
            var wasFull = u.hp >= u.maxHp;
            if (wasFull)
                u.hp = newMax;
            else if (u.maxHp > 0)
                u.hp = Math.min(newMax, Math.floor((u.hp * newMax) / u.maxHp));
            u.maxHp = newMax;
            u.atkTimer = 0;
            u.targetId = -1;
            u.targetTimer = 0;
            u.forcedTargetId = -1;
            u.pendingCommandAt = 0;
            u.pendingTargetId = -1;
            u.commandReadyAt = 0;
            u.bleedFromId = -1;
            u.dotTimer = 0;
            u.regenTimer = 0;
            u.drainTimer = 0;
            u.decoyUsed = false;
            u.isDecoy = false;
            u.decoyUntil = 0;
            u.status.bleedStacks = 0;
            u.status.bleedPerSec = 0;
            u.status.bleedUntil = 0;
            u.status.slowAtkUntil = 0;
            u.status.slowAtkMul = 0;
            u.status.guardUntil = 0;
            u.status.guardReduce = 0;
            u.status.regenUntil = 0;
            u.status.tauntUntil = 0;
            u.fx.hitFlash = 0;
            u.fx.attackPulse = 0;
            u.fx.shieldRipple = 0;
            u.fx.counterHit = 0;
        }
    }
    (0, setup_1.beginContinuous)(state);
}
/** 推进一个逻辑帧（恰好 TIMING.LOGIC_DT 毫秒）。 */
function stepBattle(state) {
    var dtMs = timing_1.TIMING.LOGIC_DT;
    var dt = dtMs / 1000;
    var pf = ['player', 'enemy'];
    // (a) 计时、指挥落地、幻影到期、索敌重算
    for (var f = 0; f < pf.length; f++) {
        var units = (0, setup_1.side)(state, pf[f]).units;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u.alive)
                continue;
            u.stat.aliveMs += dtMs;
            if (u.status.bleedUntil > 0 && state.time >= u.status.bleedUntil) {
                u.status.bleedStacks = 0;
                u.status.bleedPerSec = 0;
            }
            if (u.status.slowAtkUntil > 0 && state.time >= u.status.slowAtkUntil)
                u.status.slowAtkMul = 0;
            if (u.status.guardUntil > 0 && state.time >= u.status.guardUntil)
                u.status.guardReduce = 0;
            if (u.pendingCommandAt > 0 && state.time >= u.pendingCommandAt) {
                u.forcedTargetId = u.pendingTargetId;
                u.pendingCommandAt = 0;
                u.pendingTargetId = -1;
                (0, setup_1.pushEvent)(state, 'CommandApplied', u.owner, u.id, u.forcedTargetId, 0, null, u.species);
                recalcTarget(state, u);
            }
            if (u.isDecoy && state.time >= u.decoyUntil) {
                u.isDecoy = false;
                u.alive = false;
                u.hp = 0;
                (0, setup_1.pushEvent)(state, 'UnitDeath', u.owner, u.id, -1, 0, null, u.species);
                continue;
            }
            u.targetTimer -= dtMs;
            if (u.targetTimer <= 0) {
                recalcTarget(state, u);
                u.targetTimer = timing_1.TIMING.TARGET_RECALC + num(weatherOf(state, u.owner).targetDelay);
            }
        }
    }
    // (b) 移动（同时解算）
    stepMovement(state, dt);
    // (c) 攻击（双方同帧出手 = 同时结算，见 stepAttacks）
    stepAttacks(state, dtMs);
    // (d) 每秒结算型状态
    tickStatus(state, dtMs);
}
/** 战斗是否已经分出结果（任一方全灭）。 */
function battleOver(state) {
    var playerAlive = false;
    var enemyAlive = false;
    for (var i = 0; i < state.player.units.length; i++)
        if (state.player.units[i].alive)
            playerAlive = true;
    for (var i = 0; i < state.enemy.units.length; i++)
        if (state.enemy.units[i].alive)
            enemyAlive = true;
    return !playerAlive || !enemyAlive;
}
/** 场上单位总数（自检用）。 */
function fieldCount(state) {
    var n = 0;
    for (var i = 0; i < state.player.units.length; i++)
        if (state.player.units[i].alive)
            n++;
    for (var i = 0; i < state.enemy.units.length; i++)
        if (state.enemy.units[i].alive)
            n++;
    return n;
}
