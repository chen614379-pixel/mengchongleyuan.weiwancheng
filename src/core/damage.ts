/**
 * 伤害结算（§10 严格顺序）与 HP/护盾/治疗/DOT 的唯一入口。
 *
 * §10：基础攻击力 → 特技/加成牌(加算) → 天气修正 → 克制修正 → 目标减伤
 *      → 护盾吸收 → 特性结算(暴击/连击/处决) → 扣 HP → 反震/吸血
 *
 * 归因（结算页堆叠条）：把最终伤害做乘法分解，各分项之和在浮点意义上恒等于
 * 最终伤害（伸缩求和），因此「各项之和 vs 总计」误差为 0，远小于 1% 要求。
 */
import { BUFF_CARDS, BuffCardDef, BuffId } from '../config/cards';
import { SPECIES } from '../config/species';
import { TIMING } from '../config/timing';
import { pushEvent } from './setup';
import { BattleEventType, BattleState, Unit, UnitStat } from './types';

/** 归因种类。 */
export type DamageSource = keyof UnitStat['bySource'];

export interface DamageOpts {
  /** 基础伤害（攻击力 × 段数比例等，未乘任何修正） */
  base: number;
  /** 特技/加成牌的加算乘区（0.25 = +25%） */
  addMul: number;
  /** 天气攻击乘区（1 = 无修正） */
  weatherMul: number;
  /** 克制乘区（COUNTER_BONUS / COUNTERED_PENALTY / 1） */
  counterMul: number;
  /** 特性倍率（暴击 2.0 / 爪击 2.0 / 1） */
  traitMul: number;
  /** 目标减伤比例（0.2 = -20%） */
  reduce: number;
  /** 无视目标减伤比例（鼠偷袭） */
  ignoreReduce: number;
  /** 强制归因来源；null = 按乘法分解自动归因 */
  source: DamageSource | null;
  /** 是否允许反震等二次结算（DOT 一律 false） */
  secondary: boolean;
  /** 事件类型（默认 UnitDamage） */
  event?: BattleEventType;
}

export function damageOpts(base: number): DamageOpts {
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

export function buffDefOfId(id: BuffId): BuffCardDef {
  for (let i = 0; i < BUFF_CARDS.length; i++) if (BUFF_CARDS[i].id === id) return BUFF_CARDS[i];
  return BUFF_CARDS[0];
}

export function hasBuff(u: Unit, id: BuffId): boolean {
  for (let i = 0; i < u.buffs.length; i++) if (u.buffs[i] === id) return true;
  return false;
}

/** 护盾上限（30% maxHP）。 */
export function shieldCap(u: Unit): number {
  return Math.floor(u.maxHp * TIMING.SHIELD_CAP_RATIO);
}

/**
 * 获得护盾：上限 30% maxHP，多次获得取最大值而非叠加（§2.8）。
 * 返回实际获得的护盾量。
 */
export function grantShield(state: BattleState, unit: Unit, amount: number): number {
  if (amount <= 0 || !unit.alive) return 0;
  const cap = shieldCap(unit);
  const want = amount > cap ? cap : amount;
  if (want <= unit.shield) return 0;
  const gained = want - unit.shield;
  unit.shield = want;
  unit.fx.shieldRipple = 1;
  pushEvent(state, 'UnitShield', unit.owner, unit.id, -1, gained, null, unit.species);
  return gained;
}

/** 治疗：超过 maxHP 的部分按溢出治疗转护盾（§2.8）。返回真实回复量。 */
export function healUnit(state: BattleState, unit: Unit, amount: number): number {
  if (amount <= 0 || !unit.alive) return 0;
  let room = unit.maxHp - unit.hp;
  if (room < 0) room = 0;
  const healed = room < amount ? room : amount;
  unit.hp += healed;
  unit.stat.healed += healed;
  if (healed > 0) pushEvent(state, 'UnitHeal', unit.owner, unit.id, -1, healed, null, unit.species);
  const overflow = amount - healed;
  if (overflow > 0) grantShield(state, unit, overflow);
  return healed;
}

function addStat(u: Unit, source: DamageSource | null, amount: number): void {
  if (amount <= 0) return;
  if (source === null) return;
  u.stat.bySource[source] += amount;
}

/**
 * 结算一次伤害（含护盾吸收与统计归因）。返回最终伤害值（含打在护盾上的部分）。
 */
export function dealDamage(
  state: BattleState,
  attacker: Unit | null,
  target: Unit,
  opts: DamageOpts
): number {
  if (!target.alive) return 0;
  const fBuff = 1 + opts.addMul;
  const fWeather = opts.weatherMul;
  const fCounter = opts.counterMul;
  const fTrait = opts.traitMul;
  let reduce = opts.reduce;
  if (opts.ignoreReduce > 0) reduce = reduce * (1 - opts.ignoreReduce);
  if (reduce < 0) reduce = 0;
  if (reduce > 0.9) reduce = 0.9;
  const common = fBuff * fWeather * fCounter * fTrait * (1 - reduce);
  let dmg = opts.base * common;
  if (dmg < 0) dmg = 0;
  const final = Math.floor(dmg);
  if (final <= 0) return 0;

  // ---- 归因分解（乘法链瀑布，保证各分项之和 == final） ----
  // base ×(1+addMul)[加成牌] ×weather ×counter ×trait，最后再乘目标减伤。
  // 分项按 final/v4 归一，使"减免后"的各分项之和恰好等于 final（§16 要求误差 < 1%）；
  // 单独为负的分项（被克制、负面天气）记 0，差额并入普攻，总和仍然不变。
  if (attacker !== null) {
    if (opts.source !== null) {
      addStat(attacker, opts.source, final);
    } else {
      const v1 = opts.base * fBuff;
      const v2 = v1 * fWeather;
      const v3 = v2 * fCounter;
      const v4 = v3 * fTrait;
      const scale = v4 > 0 ? final / v4 : 0;
      let cBuff = (v1 - opts.base) * scale;
      let cWeather = (v2 - v1) * scale;
      let cCounter = (v3 - v2) * scale;
      let cTrait = (v4 - v3) * scale;
      if (cBuff < 0) cBuff = 0;
      if (cWeather < 0) cWeather = 0;
      if (cCounter < 0) cCounter = 0;
      if (cTrait < 0) cTrait = 0;
      addStat(attacker, 'basic', final - cBuff - cWeather - cCounter - cTrait);
      addStat(attacker, 'buff', cBuff);
      addStat(attacker, 'weather', cWeather);
      addStat(attacker, 'counter', cCounter);
      addStat(attacker, 'trait', cTrait);
    }
    attacker.stat.damageDealt += final;
  }

  // ---- 护盾吸收 → 扣 HP ----
  let remaining = final;
  if (target.shield > 0) {
    const absorbed = target.shield < remaining ? target.shield : remaining;
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp -= remaining;
  if (target.hp < 0) target.hp = 0;
  target.stat.damageTaken += final;
  target.fx.hitFlash = TIMING.HIT_FLASH;
  if (attacker !== null) {
    target.fx.hitDir = target.pos.x >= attacker.pos.x ? 1 : -1;
    attacker.fx.counterHit = fCounter > 1 ? 1 : 0;
  }
  if (opts.event !== undefined) {
    pushEvent(
      state,
      opts.event,
      attacker === null ? null : attacker.owner,
      attacker === null ? -1 : attacker.id,
      target.id,
      final,
      opts.source,
      attacker === null ? null : attacker.species
    );
  } else {
    pushEvent(
      state,
      'UnitDamage',
      attacker === null ? null : attacker.owner,
      attacker === null ? -1 : attacker.id,
      target.id,
      final,
      opts.source,
      attacker === null ? null : attacker.species
    );
  }

  // ---- 反震（荆棘之刺 / 荆棘反震）：DOT 不触发 ----
  if (opts.secondary && attacker !== null && attacker.alive) {
    let thorns = 0;
    for (let i = 0; i < target.buffs.length; i++) {
      const def = buffDefOfId(target.buffs[i]);
      if (def.thornsPct !== undefined) thorns += def.thornsPct;
    }
    if (thorns > 0) {
      const reflect = Math.floor(final * thorns);
      if (reflect > 0) {
        const rOpts = damageOpts(reflect);
        rOpts.source = 'buff';
        rOpts.secondary = false;
        rOpts.event = 'UnitDamage';
        applyRawDamage(state, target, attacker, rOpts);
      }
    }
  }

  if (target.hp <= 0) killUnit(state, target, attacker);
  return final;
}

/** 同上，但不触发反震递归（内部用）。 */
function applyRawDamage(state: BattleState, from: Unit, to: Unit, opts: DamageOpts): number {
  return dealDamage(state, from, to, opts);
}

/**
 * 持续伤害统一入口（流血 / 天气 DOT）：不参与反击、吸血、反震二次结算（§2.8）。
 */
export function tickDamage(
  state: BattleState,
  target: Unit,
  amount: number,
  source: DamageSource,
  attacker: Unit | null
): number {
  const opts = damageOpts(amount);
  opts.source = source;
  opts.secondary = false;
  return dealDamage(state, attacker, target, opts);
}

/** 致死判定：替身草人优先触发一次，其次才真死（§7.3）。 */
export function killUnit(state: BattleState, target: Unit, killer: Unit | null): void {
  if (!target.alive) return;
  if (!target.isDecoy && !target.decoyUsed && hasBuff(target, 'decoyStraw')) {
    const def = buffDefOfId('decoyStraw');
    const pct = def.decoyHpPct !== undefined ? def.decoyHpPct : 0;
    const dur = def.decoyDuration !== undefined ? def.decoyDuration : 0;
    target.decoyUsed = true;
    target.isDecoy = true;
    target.shield = 0;
    target.hp = Math.floor(target.maxHp * pct);
    if (target.hp < 1) target.hp = 1;
    target.decoyUntil = state.time + dur;
    target.status.bleedStacks = 0;
    target.status.bleedUntil = 0;
    // 幻影不再计入存活统计的「再战」时长由 aliveMs 自然累加
    pushEvent(state, 'UnitShield', target.owner, target.id, -1, target.hp, 'buff', target.species);
    return;
  }
  target.alive = false;
  target.hp = 0;
  target.shield = 0;
  target.fx.deathFirefly = 1;
  if (killer !== null) killer.stat.kills += 1;
  pushEvent(state, 'UnitDeath', target.owner, target.id, -1, 0, null, target.species);
  if (target.owner === 'player') {
    pushEvent(state, 'PlayerUnitDeath', target.owner, target.id, -1, 0, null, target.species);
  }
}

/** 加成牌提供的攻击力加算总额。 */
export function buffAtkMul(u: Unit): number {
  let sum = 0;
  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.atkMul !== undefined) sum += def.atkMul;
  }
  return sum;
}

/** 加成牌提供的减伤总额（可叠加，>0 表示受伤减免）。 */
export function buffReduce(u: Unit): number {
  let sum = 0;
  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.dmgReduce !== undefined) sum += def.dmgReduce;
  }
  return sum;
}

/** 加成牌提供的移速乘区。 */
export function buffMoveMul(u: Unit): number {
  let sum = 0;
  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.moveMul !== undefined) sum += def.moveMul;
  }
  return sum;
}

/** 加成牌提供的攻击间隔乘区（>1 = 变慢）。 */
export function buffIntervalMul(u: Unit): number {
  let m = 1;
  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.atkIntervalMul !== undefined) m *= def.atkIntervalMul;
  }
  return m;
}

/** 加成牌提供的绕路系数覆盖（疾风足）。 */
export function buffDetourFactor(u: Unit): number {
  let f = 0;
  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.detourFactor !== undefined && f === 0) f = def.detourFactor;
  }
  return f > 0 ? f : TIMING.DETOUR_FACTOR;
}

/** 加成牌提供的暴击率加成（四叶草）。 */
export function buffCritBonus(u: Unit): number {
  let sum = 0;
  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.critChanceBonus !== undefined) sum += def.critChanceBonus;
  }
  return sum;
}

export function hasLowHpTarget(u: Unit): boolean {
  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.lowHpTarget === true) return true;
  }
  return false;
}

export function lowHpBonus(u: Unit, target: Unit): number {
  let sum = 0;
  for (let i = 0; i < u.buffs.length; i++) {
    const def = buffDefOfId(u.buffs[i]);
    if (def.lowHpTarget === true && def.lowHpBonus !== undefined) sum += def.lowHpBonus;
  }
  void target;
  return sum;
}

/** 单位「当前有效物种」（拟态伪装时按伪装后计算克制）。 */
export function effectiveSpecies(u: Unit): string {
  if (u.status.mimic !== null) return u.status.mimic;
  return u.species;
}

/** 基础攻击力（裸值，不含加成牌）。 */
export function baseAtkOf(u: Unit): number {
  return u.baseAtk;
}

export function speciesPower(species: Unit['species']): number {
  return SPECIES[species].power;
}