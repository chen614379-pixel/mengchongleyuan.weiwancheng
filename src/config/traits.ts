/**
 * §9 装备式特技（每只动物 1 个槽位，布阵阶段装备）。
 *
 * 与「种族特技」（`config/species` 的 trait，开局自带、固定不可换）分开：
 * 这里的是可以装/卸的第二类特技，来源分「卡牌」（集市买到的特技卡）与「局外解锁」。
 * 三条需要选定「目标物种」的特技（借力模仿 / 共生血条 / 拟态伪装）在装备时
 * 通过 `equipSpecies` 指定目标，其余为纯被动。
 *
 * 战斗结算的落点见 core/equip.ts 与 core/{battle,damage}.ts（§10 伤害顺序）。
 */
import { SpeciesId } from './species';

export type EquipTraitId =
  /** 借力模仿：本局攻击力 = 所选目标物种的攻击力 */
  | 'mimicAtk'
  /** 共生血条：本局最大 HP = 所选目标物种的最大 HP（按比例继承当前血） */
  | 'symHp'
  /** 拟态伪装：克制判定中伪装成指定物种，敌方索敌与克制加成按伪装后计算 */
  | 'disguise'
  /** 荆棘反震：受到伤害时反弹 30% 给攻击者 */
  | 'thorns'
  /** 疾行：移速 +50% */
  | 'swift'
  /** 汲取：造成伤害的 25% 回复自身 */
  | 'drain'
  /** 不屈：首次死亡时以 30% HP 复活，每局一次 */
  | 'unyield'
  /** 嘲讽：强制吸引 1.5 单位内敌人优先攻击自己 */
  | 'taunt';

export interface EquipTraitDef {
  id: EquipTraitId;
  cn: string;
  desc: string;
  /** 装备时必须选定一个「目标物种」 */
  needsSpecies: boolean;
  /** 取得途径：集市特技卡 / 局外解锁 */
  source: 'card' | 'unlock';
}

export const EQUIP_TRAITS: Record<EquipTraitId, EquipTraitDef> = {
  mimicAtk: {
    id: 'mimicAtk', cn: '借力模仿', needsSpecies: true, source: 'card',
    desc: '本局攻击力 = 所选目标物种的攻击力',
  },
  symHp: {
    id: 'symHp', cn: '共生血条', needsSpecies: true, source: 'card',
    desc: '本局最大 HP = 所选目标物种的最大 HP（按比例继承当前血）',
  },
  disguise: {
    id: 'disguise', cn: '拟态伪装', needsSpecies: true, source: 'card',
    desc: '克制判定中伪装成指定物种，敌方索敌与克制加成按伪装后计算',
  },
  thorns: {
    id: 'thorns', cn: '荆棘反震', needsSpecies: false, source: 'card',
    desc: '受到伤害时反弹 30% 给攻击者',
  },
  swift: {
    id: 'swift', cn: '疾行', needsSpecies: false, source: 'card',
    desc: '移速 +50%',
  },
  drain: {
    id: 'drain', cn: '汲取', needsSpecies: false, source: 'card',
    desc: '造成伤害的 25% 回复自身',
  },
  unyield: {
    id: 'unyield', cn: '不屈', needsSpecies: false, source: 'unlock',
    desc: '首次死亡时以 30% HP 复活，每局一次',
  },
  taunt: {
    id: 'taunt', cn: '嘲讽', needsSpecies: false, source: 'unlock',
    desc: '强制吸引 1.5 单位内敌人优先攻击自己',
  },
};

/** 详情页/装备面板的固定顺序（§9 表格顺序）。 */
export const EQUIP_TRAIT_ORDER: EquipTraitId[] = [
  'mimicAtk', 'symHp', 'disguise', 'thorns', 'swift', 'drain', 'unyield', 'taunt',
];

/** 每只动物的特技槽数量（§9：1 个）。 */
export const EQUIP_SLOT_COUNT = 1;

const EQUIP_MAP = EQUIP_TRAITS as Record<string, EquipTraitDef | undefined>;

/** 按 id 取特技定义（未知 id 返回 null）。 */
export function equipTraitDef(id: EquipTraitId | null): EquipTraitDef | null {
  if (id === null) return null;
  const def = EQUIP_MAP[id];
  return def === undefined ? null : def;
}

/** 该特技是否需要选定目标物种。 */
export function equipNeedsSpecies(id: EquipTraitId | null): boolean {
  const def = equipTraitDef(id);
  return def !== null && def.needsSpecies;
}

/** 运行时校验：id 是否合法（存档/指令都可能带脏数据）。 */
export function isEquipTraitId(v: unknown): v is EquipTraitId {
  return typeof v === 'string' && EQUIP_MAP[v] !== undefined;
}

/** 目标物种是否合法（可空）。 */
export function isEquipSpecies(v: unknown): v is SpeciesId {
  return v === null || (typeof v === 'string' && v.length > 0);
}