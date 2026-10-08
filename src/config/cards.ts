/**
 * 加成牌 ×12（§1.3）与卡牌通用规则（§1.1 / §7.5）。
 * 效果全部数值化，核心逻辑只读这些字段，不读文案。
 */
export type BuffId =
  | 'sharpClaw' | 'mossArmor' | 'swiftFeet' | 'morningDew' | 'poisonFang' | 'thornSpike'
  | 'stoneFist' | 'hunterInstinct' | 'herdHeart' | 'decoyStraw' | 'giantStrength' | 'clover';

export interface BuffCardDef {
  id: BuffId;
  cn: string;
  cost: number;
  /** 两行效果描述（卡面用） */
  desc: string[];
  /** 攻击力加算乘区（0.25 = +25%） */
  atkMul?: number;
  /** 受到伤害减免（0.20 = -20%） */
  dmgReduce?: number;
  /** 移速乘区 */
  moveMul?: number;
  /** 覆盖绕路系数（疾风足：1.6 → 1.3） */
  detourFactor?: number;
  /** 周期性回复最大 HP 的百分比与间隔（ms） */
  regenPct?: number;
  regenInterval?: number;
  /** 攻击附加流血：攻击力百分比/秒、持续、最大层数 */
  bleedPct?: number;
  bleedDuration?: number;
  bleedMaxStack?: number;
  /** 受击反弹攻击者的伤害百分比 */
  thornsPct?: number;
  /** 攻击概率击退：概率 / 距离（单位） */
  knockChance?: number;
  knockDist?: number;
  /** 优先攻击最低 HP 目标，且对其伤害加成 */
  lowHpTarget?: boolean;
  lowHpBonus?: number;
  /** 光环：半径内友军攻击力加成 */
  auraAtk?: number;
  auraRadius?: number;
  /** 死亡留下幻影：继承 HP 比例 / 存活时长（ms） */
  decoyHpPct?: number;
  decoyDuration?: number;
  /** 攻击间隔乘区（0.20 = 间隔 +20%，即变慢） */
  atkIntervalMul?: number;
  /** 必定暴击概率加成（与虎的暴击触发率叠乘） */
  critChanceBonus?: number;
  /** 卡面分组，用于集市排序与配色 */
  tag: 'atk' | 'def' | 'util';
}

export const BUFF_CARDS: BuffCardDef[] = [
  { id: 'sharpClaw', cn: '锋锐之爪', cost: 3, tag: 'atk', atkMul: 0.25, desc: ['攻击力 +25%', '——'] },
  { id: 'mossArmor', cn: '苔藓护甲', cost: 3, tag: 'def', dmgReduce: 0.20, desc: ['受到伤害 -20%', '——'] },
  {
    id: 'swiftFeet', cn: '疾风足', cost: 2, tag: 'util', moveMul: 0.40, detourFactor: 1.3,
    desc: ['移速 +40%', '绕路时间 ×1.6 → ×1.3']
  },
  {
    id: 'morningDew', cn: '晨露', cost: 3, tag: 'util', regenPct: 0.02, regenInterval: 3000,
    desc: ['每 3s 回复 2% 最大 HP', '——']
  },
  {
    id: 'poisonFang', cn: '毒牙', cost: 3, tag: 'atk', bleedPct: 0.12, bleedDuration: 3000, bleedMaxStack: 2,
    desc: ['攻击附加流血', '12% 攻击力/秒，3s，可叠 2 层']
  },
  { id: 'thornSpike', cn: '荆棘之刺', cost: 3, tag: 'def', thornsPct: 0.35, desc: ['受到伤害反弹 35%', '给对方'] },
  {
    id: 'stoneFist', cn: '碎石拳', cost: 2, tag: 'atk', knockChance: 0.25, knockDist: 0.5,
    desc: ['25% 概率击退 0.5 单位', '并打断当前动作']
  },
  {
    id: 'hunterInstinct', cn: '猎手直觉', cost: 2, tag: 'atk', lowHpTarget: true, lowHpBonus: 0.15,
    desc: ['优先攻击最低 HP 敌人', '对其伤害 +15%']
  },
  {
    id: 'herdHeart', cn: '兽群之心', cost: 4, tag: 'def', auraAtk: 0.12, auraRadius: 1.2,
    desc: ['相邻友军攻击力 +12%', '半径 1.2 单位']
  },
  {
    id: 'decoyStraw', cn: '替身草人', cost: 4, tag: 'util', decoyHpPct: 0.30, decoyDuration: 3000,
    desc: ['死亡留下幻影', '继承 30% HP，再战 3s']
  },
  {
    id: 'giantStrength', cn: '巨力', cost: 3, tag: 'atk', atkMul: 0.55, atkIntervalMul: 1.20,
    desc: ['攻击力 +55%', '攻击间隔 +20%（负面）']
  },
  {
    id: 'clover', cn: '四叶草', cost: 4, tag: 'atk', critChanceBonus: 0.20,
    desc: ['20% 必定暴击', '与虎暴击叠乘 → 44%']
  }
];

/** 每只动物最多携带的加成牌数量（§7.1） */
export const BUFF_SLOTS = 2;
/** 特技槽（§9） */
export const TRAIT_SLOTS = 1;

/** 卡牌类型与卡池占比（§11.1：动物 78% / 天气 12% / 加成 10%） */
export type CardKind = 'animal' | 'weather' | 'buff';
export const POOL_SHARE = { animal: 0.78, weather: 0.12, buff: 0.10 };
/** 「本局倾向物种」权重保底（§11.1） */
export const SPECIES_BIAS = 0.25;
/** 集市货架槽位（§2.5：一次展出 5 张） */
export const SHELF_SLOTS = 5;
/** 买入后卡片飞向替补席的动画时长 */
export const CARD_FLY_MS = 420;

/** 按 id 取加成牌定义 */
export function buffDef(id: BuffId): BuffCardDef {
  for (let i = 0; i < BUFF_CARDS.length; i++) if (BUFF_CARDS[i].id === id) return BUFF_CARDS[i];
  return BUFF_CARDS[0];
}