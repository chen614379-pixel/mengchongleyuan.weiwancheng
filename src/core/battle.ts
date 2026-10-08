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
import { COUNTER, SPECIES, SpeciesId } from '../config/species';
import { TIMING } from '../config/timing';
import { EffectBundle } from '../config/weather';
import {
  buffAtkMul,
  buffCritBonus,
  buffDefOfId,
  buffDetourFactor,
  buffIntervalMul,
  buffMoveMul,
  buffReduce,
  damageOpts,
  dealDamage,
  effectiveSpecies,
  hasLowHpTarget,
  healUnit,
  lowHpBonus,
  tickDamage
} from './damage';
import { nextFloat } from './rng';
import {
  BATTLE_BOUNDS,
  PX_PER_UNIT,
  beginContinuous,
  fieldUnits,
  otherFaction,
  pushEvent,
  side,
  unitById
} from './setup';
import { BattleState, Faction, Unit } from './types';

const BOUNDARY_BAND = 0.5;
/** §9 狮·咆哮给主目标的减伤（config 未单列常量，此处按规格文案）。 */
const ROAR_GUARD_REDUCE = 0.2;

/** 移动解算的复用缓冲（避免每帧分配；顺序调用，无重入）。 */
const scratchUnits: Unit[] = [];
const scratchDX: number[] = [];
const scratchDY: number[] = [];

function num(v: number | undefined): number {
  return v === undefined ? 0 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function radiusUnits(u: Unit): number {
  return u.bodyRadius / PX_PER_UNIT;
}

function distUnits(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function unitDist(a: Unit, b: Unit): number {
  return distUnits(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
}

/** 攻击够得着的中心距离（含目标体积）。 */
function reachOf(u: Unit, target: Unit): number {
  return u.atkRange + radiusUnits(target);
}

function weatherOf(state: BattleState, faction: Faction): EffectBundle {
  return state.weatherFx[faction];
}

/** 天气里的种族联动（猫攻速 / 狗移速 / 象血量）。 */
function synergyOf(state: BattleState, faction: Faction, species: SpeciesId): {
  atkSpeedMul: number;
  moveMul: number;
  hpMaxMul: number;
} {
  const out = { atkSpeedMul: 0, moveMul: 0, hpMaxMul: 0 };
  const b = state.weatherFx[faction];
  const syn = b.synergy;
  if (!syn) return out;
  const family = SPECIES[species].family;
  for (let i = 0; i < syn.length; i++) {
    if (syn[i].family === family) {
      out.atkSpeedMul += num(syn[i].atkSpeedMul);
      out.moveMul += num(syn[i].moveMul);
      out.hpMaxMul += num(syn[i].hpMaxMul);
    }
  }
  return out;
}

/** 实际攻击间隔（ms）：基础 × 加成牌 × 攻速乘区（含减速为负）。 */
function effectiveInterval(state: BattleState, u: Unit): number {
  const b = weatherOf(state, u.owner);
  const s = synergyOf(state, u.owner, u.species);
  const slow = state.time < u.status.slowAtkUntil ? u.status.slowAtkMul : 0;
  const speedMul = 1 + num(b.atkSpeedMul) + s.atkSpeedMul + slow;
  const interval = (u.atkInterval * buffIntervalMul(u)) / (speedMul > 0.1 ? speedMul : 0.1);
  return interval < TIMING.LOGIC_DT ? TIMING.LOGIC_DT : interval;
}

/** 实际移速（单位/秒）。 */
function effectiveSpeed(state: BattleState, u: Unit): number {
  const b = weatherOf(state, u.owner);
  const s = synergyOf(state, u.owner, u.species);
  const mul = 1 + buffMoveMul(u) + num(b.moveMul) + s.moveMul;
  const v = u.moveSpeed * (mul > 0.05 ? mul : 0.05);
  return v > 0 ? v : 0;
}

/** 绕路惩罚系数：司令目标不是最近可达敌人时路径变长。 */
function detourFactorOf(u: Unit): number {
  const f = buffDetourFactor(u);
  return f > 0 ? f : TIMING.DETOUR_FACTOR;
}

/** 光环：半径内友军（含自己之外的 herdHeart 携带者）提供的攻击力加算。 */
function auraAtkOf(state: BattleState, u: Unit): number {
  let bonus = 0;
  const allies = side(state, u.owner).units;
  for (let i = 0; i < allies.length; i++) {
    const a = allies[i];
    if (a.id === u.id || !a.alive) continue;
    for (let k = 0; k < a.buffs.length; k++) {
      const def = buffDefOfId(a.buffs[k]);
      if (def.auraAtk !== undefined && def.auraRadius !== undefined) {
        if (unitDist(a, u) <= def.auraRadius) bonus += def.auraAtk;
      }
    }
  }
  return bonus;
}

/** 克制乘区：克制 ×1.5、被克制 ×0.75、其余 1。 */
function counterMulOf(u: Unit, target: Unit): number {
  const me = effectiveSpecies(u) as SpeciesId;
  const them = effectiveSpecies(target) as SpeciesId;
  if (COUNTER[me] === them) return TIMING.COUNTER_BONUS;
  if (COUNTER[them] === me) return TIMING.COUNTERED_PENALTY;
  return 1;
}

/** 目标减伤：加成牌 + 咆哮护体 + 天气。 */
function reduceOf(state: BattleState, target: Unit): number {
  const guard = state.time < target.status.guardUntil ? target.status.guardReduce : 0;
  let r = buffReduce(target) + guard + num(weatherOf(state, target.owner).dmgReduce);
  if (r < 0) r = 0;
  if (r > 0.9) r = 0.9;
  return r;
}

function facingOf(u: Unit, dx: number): void {
  if (dx > 0.01) u.facing = 1;
  else if (dx < -0.01) u.facing = -1;
}

/**
 * 击退（软边界内夹紧）。`interrupt` 才打断目标当前的攻击蓄力：
 * 只有石拳（加成牌）的击退附带打断（§9），践踏的击退不打断。
 */
function knockback(state: BattleState, target: Unit, from: Unit, dist: number, interrupt: boolean): void {
  let dx = target.pos.x - from.pos.x;
  let dy = target.pos.y - from.pos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) {
    dx = from.owner === 'player' ? 1 : -1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  const r = radiusUnits(target);
  target.pos.x = clamp(target.pos.x + dx * dist, BATTLE_BOUNDS.minX + r, BATTLE_BOUNDS.maxX - r);
  target.pos.y = clamp(target.pos.y + dy * dist, BATTLE_BOUNDS.minY + r, BATTLE_BOUNDS.maxY - r);
  target.fx.hitDir = dx >= 0 ? 1 : -1;
  if (interrupt) target.atkTimer = 0;
}

/**
 * 流血：分层池，层数封顶，每秒伤害取较大值，刷新持续时间。
 * `source` 决定结算归因（种族流血 trait / 毒牙 buff），`u` 为施加者（统计归属）。
 */
function applyBleed(
  state: BattleState,
  u: Unit,
  target: Unit,
  perSec: number,
  duration: number,
  maxStack: number,
  source: 'trait' | 'buff'
): void {
  const st = target.status;
  if (state.time >= st.bleedUntil) {
    st.bleedStacks = 0;
    st.bleedPerSec = 0;
  }
  if (st.bleedStacks <= 0) {
    st.bleedStacks = 1;
    st.bleedPerSec = perSec;
  } else {
    if (st.bleedStacks < maxStack) st.bleedStacks += 1;
    if (perSec > st.bleedPerSec) st.bleedPerSec = perSec;
  }
  st.bleedUntil = state.time + duration;
  if (source === 'trait' || target.bleedSource !== 'trait') {
    target.bleedSource = source;
    target.bleedFromId = u.id;
  }
}

/** 撕咬：攻速减速叠层（负值），封顶 -30%。 */
function applyRend(target: Unit, now: number): void {
  const st = target.status;
  if (now >= st.slowAtkUntil) st.slowAtkMul = 0;
  st.slowAtkMul -= TIMING.TRAIT_REND_ASPD;
  const cap = -TIMING.TRAIT_REND_ASPD * TIMING.TRAIT_REND_MAX_STACK;
  if (st.slowAtkMul < cap) st.slowAtkMul = cap;
  st.slowAtkUntil = now + TIMING.TRAIT_REND_DURATION;
}

/** 践踏：主目标之外 1.2 单位内的敌人吃全额伤害，主目标被击退。 */
function trampleSplash(state: BattleState, u: Unit, target: Unit): void {
  const r = SPECIES.elephant.atkRange;
  const enemies = fieldUnits(state, otherFaction(u.owner));
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.id === target.id || !e.alive) continue;
    if (unitDist(u, e) > r) continue;
    const opts = damageOpts(u.atk);
    opts.source = 'trait';
    dealDamage(state, u, e, opts);
  }
  knockback(state, target, u, TIMING.TRAIT_TRAMPLE_KNOCKBACK, false);
}

/** 咆哮：主目标获得 20% 减伤护体（§9 狮），1.0 单位内其他敌人吃 30%。 */
function roarSplash(state: BattleState, u: Unit, target: Unit): void {
  const until = state.time + TIMING.TRAIT_ROAR_DURATION;
  if (target.status.guardUntil < until) target.status.guardUntil = until;
  if (target.status.guardReduce < ROAR_GUARD_REDUCE) {
    target.status.guardReduce = ROAR_GUARD_REDUCE;
  }
  const enemies = fieldUnits(state, otherFaction(u.owner));
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.id === target.id || !e.alive) continue;
    if (unitDist(target, e) > TIMING.TRAIT_ROAR_RADIUS) continue;
    const opts = damageOpts(u.atk * TIMING.TRAIT_ROAR_SPLASH);
    opts.source = 'trait';
    dealDamage(state, u, e, opts);
  }
}

/** 一次完整攻击结算（§10 顺序在 dealDamage 内实现）。 */
function performAttack(state: BattleState, u: Unit, target: Unit): void {
  const b = weatherOf(state, u.owner);
  const trait = u.trait;
  const addMul = buffAtkMul(u) + auraAtkOf(state, u) + lowHpBonus(u, target);
  const weatherMul = 1 + num(b.atkMul);
  const counterMul = counterMulOf(u, target);
  const reduce = reduceOf(state, target);
  const ignoreReduce = trait === 'ambush' ? TIMING.TRAIT_AMBUSH_IGNORE_REDUCE : 0;

  let traitMul = 1;
  const critChance =
    num(b.critBonus) + buffCritBonus(u) + (trait === 'crit' ? TIMING.TRAIT_CRIT_CHANCE : 0);
  if (critChance > 0 && nextFloat(state.rng) < clamp(critChance, 0, 1)) {
    traitMul *= TIMING.TRAIT_CRIT_MULT;
  }
  if (trait === 'claw' && target.hp <= target.maxHp * TIMING.TRAIT_CLAW_THRESHOLD) {
    traitMul *= TIMING.TRAIT_CLAW_MULT;
  }

  u.fx.attackPulse = 1;
  u.fx.hitDir = u.pos.x <= target.pos.x ? 1 : -1;

  if (trait === 'combo') {
    for (let h = 0; h < TIMING.TRAIT_COMBO_HITS; h++) {
      if (!target.alive) break;
      const opts = damageOpts(u.atk * TIMING.TRAIT_COMBO_SCALE);
      opts.addMul = addMul;
      opts.weatherMul = weatherMul;
      opts.counterMul = counterMul;
      opts.traitMul = traitMul;
      opts.reduce = reduce;
      opts.ignoreReduce = ignoreReduce;
      opts.source = 'trait';
      dealDamage(state, u, target, opts);
    }
  } else {
    const opts = damageOpts(u.atk);
    opts.addMul = addMul;
    opts.weatherMul = weatherMul;
    opts.counterMul = counterMul;
    opts.traitMul = traitMul;
    opts.reduce = reduce;
    opts.ignoreReduce = ignoreReduce;
    dealDamage(state, u, target, opts);
  }

  if (!target.alive) return;

  if (trait === 'trample') trampleSplash(state, u, target);
  else if (trait === 'roar') roarSplash(state, u, target);
  else if (trait === 'bleed') {
    applyBleed(
      state,
      u,
      target,
      u.atk * TIMING.TRAIT_BLEED_SCALE,
      TIMING.TRAIT_BLEED_DURATION,
      TIMING.TRAIT_BLEED_MAX_STACK,
      'trait'
    );
  } else if (trait === 'rend') {
    applyRend(target, state.time);
  }

  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.bleedPct !== undefined) {
      applyBleed(
        state,
        u,
        target,
        u.atk * def.bleedPct,
        def.bleedDuration === undefined ? TIMING.TRAIT_BLEED_DURATION : def.bleedDuration,
        def.bleedMaxStack === undefined ? 1 : def.bleedMaxStack,
        'buff'
      );
    }
    if (def.knockChance !== undefined && nextFloat(state.rng) < def.knockChance) {
      knockback(state, target, u, def.knockDist === undefined ? 0.5 : def.knockDist, true);
    }
  }
}

/** 索敌：指挥目标 > 正对 > 最低 HP（偷袭/猎手本能）> 被自己克制 > 最近 > 推进敌方半场。 */
function recalcTarget(state: BattleState, u: Unit): void {
  if (u.forcedTargetId >= 0) {
    const ft = unitById(state, u.forcedTargetId);
    if (ft !== null && ft.alive) {
      u.targetId = ft.id;
      return;
    }
    u.forcedTargetId = -1;
  }
  const enemies = fieldUnits(state, otherFaction(u.owner));
  if (u.mirrorId >= 0) {
    const m = unitById(state, u.mirrorId);
    if (m !== null && m.alive && unitDist(u, m) <= TIMING.PERCEIVE_RANGE) {
      u.targetId = m.id;
      return;
    }
  }
  const preferLowHp = u.trait === 'ambush' || hasLowHpTarget(u);
  const me = effectiveSpecies(u) as SpeciesId;
  let best: Unit | null = null;
  let bestScore = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    const d = unitDist(u, e);
    if (d > TIMING.PERCEIVE_RANGE) continue;
    if (preferLowHp) {
      if (best === null || e.hp < best.hp) best = e;
      continue;
    }
    let score = 0;
    if (COUNTER[me] === (effectiveSpecies(e) as SpeciesId)) score += 1000;
    score += TIMING.PERCEIVE_RANGE - d;
    if (best === null || score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  u.targetId = best === null ? -1 : best.id;
}

/** 移动同时解算：先算全部位移，再统一落位（与遍历顺序无关）。 */
function stepMovement(state: BattleState, dt: number): void {
  const all = scratchUnits;
  all.length = 0;
  const pf: Faction[] = ['player', 'enemy'];
  for (let f = 0; f < pf.length; f++) {
    const units = side(state, pf[f]).units;
    for (let i = 0; i < units.length; i++) if (units[i].alive) all.push(units[i]);
  }
  const n = all.length;
  for (let i = 0; i < n; i++) {
    scratchDX[i] = 0;
    scratchDY[i] = 0;
  }

  for (let i = 0; i < n; i++) {
    const u = all[i];
    const target = u.targetId >= 0 ? unitById(state, u.targetId) : null;
    if (target !== null && target.alive && unitDist(u, target) <= reachOf(u, target)) continue;

    let dx: number;
    let dy: number;
    if (target !== null && target.alive) {
      dx = target.pos.x - u.pos.x;
      dy = target.pos.y - u.pos.y;
    } else {
      dx = u.pushPos.x - u.pos.x;
      dy = u.pushPos.y - u.pos.y;
    }
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) {
      dx = u.owner === 'player' ? 1 : -1;
      dy = 0;
      d = 1;
    }
    dx /= d;
    dy /= d;

    // 转向避让：前方 60° 锥内最近的阻挡单位 → 向空侧偏转 30°~60°
    let steer = 0;
    let blockDist = 1e9;
    let blockSide = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = all[j];
      const ox = o.pos.x - u.pos.x;
      const oy = o.pos.y - u.pos.y;
      const od = Math.sqrt(ox * ox + oy * oy);
      if (od < 1e-6 || od > TIMING.SEPARATION_RADIUS) continue;
      if ((ox * dx + oy * dy) / od < Math.cos(TIMING.STEER_CONE * 0.5)) continue;
      if (od < blockDist) {
        blockDist = od;
        const cross = dx * oy - dy * ox;
        if (cross > 0.0001) blockSide = -1;
        else if (cross < -0.0001) blockSide = 1;
        else blockSide = u.id % 2 === 0 ? 1 : -1;
      }
    }
    if (blockSide !== 0) {
      const t = 1 - blockDist / TIMING.SEPARATION_RADIUS;
      steer = (TIMING.STEER_MIN + (TIMING.STEER_MAX - TIMING.STEER_MIN) * t) * blockSide;
      const cs = Math.cos(steer);
      const sn = Math.sin(steer);
      const rx = dx * cs - dy * sn;
      const ry = dx * sn + dy * cs;
      dx = rx;
      dy = ry;
    }

    // 0.7 单位内软分离互推
    let sepX = 0;
    let sepY = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = all[j];
      let ox = u.pos.x - o.pos.x;
      let oy = u.pos.y - o.pos.y;
      let od = Math.sqrt(ox * ox + oy * oy);
      if (od > TIMING.SEPARATION_RADIUS) continue;
      if (od < 1e-6) {
        const a = (u.id % 8) * (Math.PI / 4);
        ox = Math.cos(a);
        oy = Math.sin(a);
        od = 1;
      } else {
        ox /= od;
        oy /= od;
      }
      const w = 1 - od / TIMING.SEPARATION_RADIUS;
      sepX += ox * w;
      sepY += oy * w;
    }

    // 软边界推回
    let pushX = 0;
    let pushY = 0;
    if (u.pos.x < BATTLE_BOUNDS.minX + BOUNDARY_BAND) pushX += 1;
    if (u.pos.x > BATTLE_BOUNDS.maxX - BOUNDARY_BAND) pushX -= 1;
    if (u.pos.y < BATTLE_BOUNDS.minY + BOUNDARY_BAND) pushY += 1;
    if (u.pos.y > BATTLE_BOUNDS.maxY - BOUNDARY_BAND) pushY -= 1;

    let mx = dx + sepX * TIMING.SEPARATION_PUSH + pushX * TIMING.BOUNDARY_PUSH;
    let my = dy + sepY * TIMING.SEPARATION_PUSH + pushY * TIMING.BOUNDARY_PUSH;
    const ml = Math.sqrt(mx * mx + my * my);
    if (ml < 1e-6) continue;
    mx /= ml;
    my /= ml;

    let speed = effectiveSpeed(state, u);
    if (u.forcedTargetId >= 0) {
      // 绕路系数只作用于"被迫脱离最近敌人"的情况
      const enemies = fieldUnits(state, otherFaction(u.owner));
      let nearestId = -1;
      let nearestD = 1e9;
      for (let k = 0; k < enemies.length; k++) {
        const ed = unitDist(u, enemies[k]);
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

  for (let i = 0; i < n; i++) {
    const u = all[i];
    if (scratchDX[i] === 0 && scratchDY[i] === 0) continue;
    const r = radiusUnits(u);
    u.pos.x = clamp(u.pos.x + scratchDX[i], BATTLE_BOUNDS.minX + r, BATTLE_BOUNDS.maxX - r);
    u.pos.y = clamp(u.pos.y + scratchDY[i], BATTLE_BOUNDS.minY + r, BATTLE_BOUNDS.maxY - r);
    facingOf(u, scratchDX[i]);
  }
}

/**
 * 一帧的攻击推进。两遍式：先对双方统一判定"本帧出手"（读的是本帧攻击前的状态），
 * 再统一结算伤害。这样双方同帧出手是**真正同时**的，不会因为遍历顺序让先被扫到的一方
 * 白赚一次攻击（曾导致镜像对战中出现系统性"先手一次攻击"优势）。
 */
function stepAttacks(state: BattleState, dtMs: number): void {
  const pf: Faction[] = ['player', 'enemy'];
  const firedUnits: Unit[] = [];
  const firedTargets: Unit[] = [];
  for (let f = 0; f < pf.length; f++) {
    const units = side(state, pf[f]).units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      const target = u.targetId >= 0 ? unitById(state, u.targetId) : null;
      const inReach = target !== null && target.alive && unitDist(u, target) <= reachOf(u, target);
      const iv = effectiveInterval(state, u);
      u.atkTimer += dtMs;
      if (!inReach) {
        if (u.atkTimer > iv) u.atkTimer = iv;
        continue;
      }
      if (u.atkTimer >= iv) {
        u.atkTimer = 0;
        firedUnits.push(u);
        firedTargets.push(target as Unit);
      }
    }
  }
  for (let i = 0; i < firedUnits.length; i++) {
    // 出手判定已完成：即使出手者本帧被打死，这一击也已经打出去了（同时结算）。
    if (!firedTargets[i].alive) continue;
    performAttack(state, firedUnits[i], firedTargets[i]);
  }
}

/** 每秒结算型状态：流血、回复、天气流失、演出衰减。 */
function tickStatus(state: BattleState, dtMs: number): void {
  const pf: Faction[] = ['player', 'enemy'];
  const decay = dtMs / 1000;
  for (let f = 0; f < pf.length; f++) {
    const units = side(state, pf[f]).units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;

      // 流血（tickDamage：不触发反震/吸血二次结算）
      if (u.status.bleedStacks > 0) {
        u.dotTimer += dtMs;
        while (u.dotTimer >= 1000) {
          u.dotTimer -= 1000;
          const amount = Math.floor(u.status.bleedPerSec * u.status.bleedStacks);
          if (amount > 0) {
            const src = unitById(state, u.bleedFromId);
            tickDamage(state, u, amount, u.bleedSource, src);
          }
          if (!u.alive) break;
        }
      } else {
        u.dotTimer = 0;
      }
      if (!u.alive) continue;

      const wb = weatherOf(state, u.owner);

      // 回复（加成牌 + 天气）
      let regenPct = 0;
      let regenInterval = 0;
      for (let k = 0; k < u.buffs.length; k++) {
        const def = buffDefOfId(u.buffs[k]);
        if (def.regenPct !== undefined) {
          regenPct += def.regenPct;
          const ri = def.regenInterval === undefined ? 3000 : def.regenInterval;
          if (ri > regenInterval) regenInterval = ri;
        }
      }
      if (num(wb.regenPct) > 0) {
        regenPct += num(wb.regenPct);
        const ri = num(wb.regenInterval) === 0 ? 1000 : num(wb.regenInterval);
        if (ri > regenInterval) regenInterval = ri;
      }
      if (regenPct > 0 && regenInterval > 0) {
        u.regenTimer += dtMs;
        while (u.regenTimer >= regenInterval) {
          u.regenTimer -= regenInterval;
          healUnit(state, u, Math.floor(u.maxHp * regenPct));
          if (!u.alive) break;
        }
      } else {
        u.regenTimer = 0;
      }

      // 天气流失
      const drainPct = num(wb.drainPct);
      if (drainPct > 0) {
        const drainInterval = num(wb.drainInterval) === 0 ? 1000 : num(wb.drainInterval);
        u.drainTimer += dtMs;
        while (u.drainTimer >= drainInterval) {
          u.drainTimer -= drainInterval;
          const basis = wb.drainOnCurrent ? u.hp : u.maxHp;
          const amount = Math.floor(basis * drainPct);
          if (amount > 0) tickDamage(state, u, amount, 'weather', null);
          if (!u.alive) break;
        }
      } else {
        u.drainTimer = 0;
      }

      // 演出计时衰减
      if (u.fx.hitFlash > 0) {
        u.fx.hitFlash -= decay / TIMING.HIT_FLASH;
        if (u.fx.hitFlash < 0) u.fx.hitFlash = 0;
      }
      if (u.fx.attackPulse > 0) {
        u.fx.attackPulse -= decay * 4;
        if (u.fx.attackPulse < 0) u.fx.attackPulse = 0;
      }
      if (u.fx.shieldRipple > 0) {
        u.fx.shieldRipple -= decay * 2;
        if (u.fx.shieldRipple < 0) u.fx.shieldRipple = 0;
      }
      if (u.fx.counterHit > 0) {
        u.fx.counterHit -= decay * 2;
        if (u.fx.counterHit < 0) u.fx.counterHit = 0;
      }
    }
  }
}

/**
 * 开战准备：应用天气 HP 上限乘区、清空战斗态计时与目标、把锚点吸附声明为连续坐标。
 * 由 engine 在 observe → battle 切换时调用一次。
 */
export function prepareBattle(state: BattleState): void {
  const pf: Faction[] = ['player', 'enemy'];
  for (let f = 0; f < pf.length; f++) {
    const faction = pf[f];
    const b = weatherOf(state, faction);
    const units = side(state, faction).units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const s = synergyOf(state, faction, u.species);
      const mul = 1 + num(b.hpMaxMul) + s.hpMaxMul;
      const newMax = Math.floor(u.baseMaxHp * mul);
      const wasFull = u.hp >= u.maxHp;
      if (wasFull) u.hp = newMax;
      else if (u.maxHp > 0) u.hp = Math.min(newMax, Math.floor((u.hp * newMax) / u.maxHp));
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
  beginContinuous(state);
}

/** 推进一个逻辑帧（恰好 TIMING.LOGIC_DT 毫秒）。 */
export function stepBattle(state: BattleState): void {
  const dtMs = TIMING.LOGIC_DT;
  const dt = dtMs / 1000;
  const pf: Faction[] = ['player', 'enemy'];

  // (a) 计时、指挥落地、幻影到期、索敌重算
  for (let f = 0; f < pf.length; f++) {
    const units = side(state, pf[f]).units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      u.stat.aliveMs += dtMs;

      if (u.status.bleedUntil > 0 && state.time >= u.status.bleedUntil) {
        u.status.bleedStacks = 0;
        u.status.bleedPerSec = 0;
      }
      if (u.status.slowAtkUntil > 0 && state.time >= u.status.slowAtkUntil) u.status.slowAtkMul = 0;
      if (u.status.guardUntil > 0 && state.time >= u.status.guardUntil) u.status.guardReduce = 0;

      if (u.pendingCommandAt > 0 && state.time >= u.pendingCommandAt) {
        u.forcedTargetId = u.pendingTargetId;
        u.pendingCommandAt = 0;
        u.pendingTargetId = -1;
        pushEvent(state, 'CommandApplied', u.owner, u.id, u.forcedTargetId, 0, null, u.species);
        recalcTarget(state, u);
      }

      if (u.isDecoy && state.time >= u.decoyUntil) {
        u.isDecoy = false;
        u.alive = false;
        u.hp = 0;
        pushEvent(state, 'UnitDeath', u.owner, u.id, -1, 0, null, u.species);
        continue;
      }

      u.targetTimer -= dtMs;
      if (u.targetTimer <= 0) {
        recalcTarget(state, u);
        u.targetTimer = TIMING.TARGET_RECALC + num(weatherOf(state, u.owner).targetDelay);
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
export function battleOver(state: BattleState): boolean {
  let playerAlive = false;
  let enemyAlive = false;
  for (let i = 0; i < state.player.units.length; i++) if (state.player.units[i].alive) playerAlive = true;
  for (let i = 0; i < state.enemy.units.length; i++) if (state.enemy.units[i].alive) enemyAlive = true;
  return !playerAlive || !enemyAlive;
}

/** 场上单位总数（自检用）。 */
export function fieldCount(state: BattleState): number {
  let n = 0;
  for (let i = 0; i < state.player.units.length; i++) if (state.player.units[i].alive) n++;
  for (let i = 0; i < state.enemy.units.length; i++) if (state.enemy.units[i].alive) n++;
  return n;
}

export { effectiveInterval, effectiveSpeed, reachOf, unitDist };