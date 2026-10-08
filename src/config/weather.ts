/**
 * 天气牌 ×3 与双方天气中和结果（§7.4）。
 * 天气在「下一轮战斗阶段」生效，持续 1 轮。
 */
export type WeatherId = 'none' | 'sunny' | 'misty' | 'rainy' | 'rainbow' | 'cloudy' | 'thunder';

/** 通用效果包：字段含义在 core/battle 里统一解释。 */
export interface EffectBundle {
  /** 攻击力乘区（0.12 = +12%） */
  atkMul?: number;
  /** 受到伤害乘区（0.18 = -18%） */
  dmgReduce?: number;
  /** 移速乘区（-0.15 = -15%） */
  moveMul?: number;
  /** 攻速乘区（0.10 = +10%） */
  atkSpeedMul?: number;
  /** 最大 HP 乘区 */
  hpMaxMul?: number;
  /** 每 regenInterval(ms) 回复最大 HP 的 regenPct */
  regenPct?: number;
  regenInterval?: number;
  /** 每 drainInterval(ms) 流失最大 HP（或当前 HP，见 drainOnCurrent）的 drainPct */
  drainPct?: number;
  drainInterval?: number;
  drainOnCurrent?: boolean;
  /** 暴击率加成 */
  critBonus?: number;
  /** 索敌延迟（ms） */
  targetDelay?: number;
  /** 种族联动 */
  synergy?: { family: 'cat' | 'dog' | 'elephant' | 'other'; atkSpeedMul?: number; moveMul?: number; hpMaxMul?: number }[];
}

export interface WeatherDef {
  id: WeatherId;
  cn: string;
  short: string;
  cost: number;
  /** 卡面配色提示（§7.5：晴=sunbeam、阴=moss、雨=stream） */
  tintKey: 'sunbeam' | 'moss' | 'stream' | 'blossom' | 'skyWarm' | 'twilight';
  self: EffectBundle;
  enemy: EffectBundle;
  /** 我方/敌方两行描述（卡面文字） */
  selfLines: string[];
  enemyLines: string[];
}

export const WEATHER_CARDS: WeatherDef[] = [
  {
    id: 'sunny', cn: '晴 · 林间光', short: '晴', cost: 2, tintKey: 'sunbeam',
    self: { atkMul: 0.12, synergy: [{ family: 'cat', atkSpeedMul: 0.08 }] },
    enemy: { drainPct: 0.01, drainInterval: 3000 },
    selfLines: ['我方：攻击 +12%', '猫科攻速 +8%'],
    enemyLines: ['敌方：每 3s 流失 1% HP', '（脱水）']
  },
  {
    id: 'misty', cn: '阴 · 薄雾', short: '阴', cost: 2, tintKey: 'moss',
    self: { dmgReduce: 0.18, synergy: [{ family: 'dog', moveMul: 0.15 }] },
    enemy: { moveMul: -0.15, targetDelay: 500 },
    selfLines: ['我方：受伤 -18%', '犬科移速 +15%'],
    enemyLines: ['敌方：移速 -15%', '索敌延迟 +0.5s']
  },
  {
    id: 'rainy', cn: '雨 · 骤雨', short: '雨', cost: 2, tintKey: 'stream',
    self: { regenPct: 0.012, regenInterval: 2000, synergy: [{ family: 'elephant', hpMaxMul: 0.15 }] },
    enemy: { atkSpeedMul: -0.12, synergy: [] },
    selfLines: ['我方：每 2s 回 1.2% HP', '象 HP 上限 +15%'],
    enemyLines: ['敌方：攻速 -12%', '鼠移速 -20%']
  }
];

export interface WeatherComboDef {
  id: WeatherId;
  cn: string;
  /** 双方共同效果 */
  both: EffectBundle;
  lines: string[];
}

/** 中和表（§7.4）：键为两个基础天气 id 排序后拼接。 */
export const WEATHER_COMBOS: { [key: string]: WeatherComboDef } = {
  'rainy|sunny': {
    id: 'rainbow', cn: '🌈 彩虹',
    both: { atkSpeedMul: 0.10, regenPct: 0.005, regenInterval: 1000 },
    lines: ['双方攻速 +10%', '每秒回 0.5% HP']
  },
  'misty|sunny': {
    id: 'cloudy', cn: '⛅ 多云',
    both: { critBonus: 0.15 },
    lines: ['双方暴击率 +15%']
  },
  'misty|rainy': {
    id: 'thunder', cn: '⛈ 雷雨',
    both: { atkSpeedMul: 0.10, drainPct: 0.01, drainInterval: 2000, drainOnCurrent: true },
    lines: ['双方攻速 +10%', '每 2s 受 1% 当前 HP 电击']
  }
};

/** 给定双方天气，求本回合实际生效的天气与双方效果。 */
export interface ResolvedWeather {
  id: WeatherId;
  cn: string;
  player: EffectBundle;
  enemy: EffectBundle;
  /** 是否被中和成共同天气 */
  neutralized: boolean;
  lines: string[];
}

export function resolveWeather(playerW: WeatherId, enemyW: WeatherId): ResolvedWeather {
  if (playerW === enemyW) {
    return { id: 'none', cn: '无天气', player: {}, enemy: {}, neutralized: true, lines: ['双方天气相同 → 抵消'] };
  }
  const ids: WeatherId[] = [playerW, enemyW];
  const basics: WeatherId[] = ['sunny', 'misty', 'rainy'];
  const pBasic = basics.indexOf(playerW) >= 0;
  const eBasic = basics.indexOf(enemyW) >= 0;
  if (pBasic && eBasic) {
    const key = ids.slice().sort().join('|');
    const combo = WEATHER_COMBOS[key];
    if (combo) {
      return { id: combo.id, cn: combo.cn, player: combo.both, enemy: combo.both, neutralized: true, lines: combo.lines };
    }
  }
  const pDef = weatherDef(playerW);
  const eDef = weatherDef(enemyW);
  return {
    id: playerW !== 'none' ? playerW : enemyW,
    cn: (pDef ? pDef.cn : '') + (eDef && playerW !== 'none' ? ' / ' + eDef.cn : ''),
    player: pDef ? pDef.self : {},
    enemy: eDef ? eDef.enemy : {},
    neutralized: false,
    lines: []
  };
}

export function weatherDef(id: WeatherId): WeatherDef | null {
  for (let i = 0; i < WEATHER_CARDS.length; i++) if (WEATHER_CARDS[i].id === id) return WEATHER_CARDS[i];
  return null;
}