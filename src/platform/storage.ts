/**
 * 存档（§13：wx.setStorageSync('petbrawl_save_v1')）。
 * 结构固定，缺失字段用默认值补齐；core 不感知存档，局外养成由 scene 读写。
 */
import { WX, HAS_WX } from './wx-shim';
import { SpeciesId } from '../config/species';
import { BuffId } from '../config/cards';

export const SAVE_KEY = 'petbrawl_save_v1';

export interface PetSave {
  species: SpeciesId;
  /** 4 区上色（0 表示用默认主题色） */
  colors: [string, string, string, string];
  /** 已购装饰件 id 列表 */
  decos: string[];
  owned: boolean;
}

export interface PlayerSave {
  version: number;
  coins: number;
  stars: number;
  trainer: {
    hair: number; skin: number; cloth: number; acc: number;
    colors: { cloth: string; hair: string; acc: string };
  };
  pets: PetSave[];
  skills: string[];
  cardsSeen: string[];
  collection: string[];
  impSkin: number;
  rank: { tier: number; point: number };
  stats: { win: number; lose: number; draw: number; bestRound: number };
  /** 每日首胜标记（yyyymmdd） */
  lastDailyWin: string;
  /** 音量设置 */
  audio: { music: boolean; sfx: boolean };
}

export function defaultSave(): PlayerSave {
  return {
    version: 1,
    coins: 0,
    stars: 0,
    trainer: {
      hair: 0, skin: 0, cloth: 0, acc: 0,
      colors: { cloth: '#FFFBF0', hair: '#6B4F3A', acc: '#A67C52' }
    },
    pets: [],
    skills: [],
    cardsSeen: [],
    collection: [],
    impSkin: 0,
    rank: { tier: 0, point: 0 },
    stats: { win: 0, lose: 0, draw: 0, bestRound: 0 },
    lastDailyWin: '',
    audio: { music: true, sfx: true }
  };
}

let cache: PlayerSave | null = null;

export function loadSave(): PlayerSave {
  if (cache) return cache;
  let raw: any = null;
  if (HAS_WX) {
    try { raw = WX.getStorageSync(SAVE_KEY); } catch (e) { raw = null; }
  }
  const def = defaultSave();
  if (!raw || typeof raw !== 'object') {
    cache = def;
    return cache;
  }
  const merged: PlayerSave = {
    version: typeof raw.version === 'number' ? raw.version : def.version,
    coins: num(raw.coins, def.coins),
    stars: num(raw.stars, def.stars),
    trainer: {
      hair: num(raw.trainer && raw.trainer.hair, 0),
      skin: num(raw.trainer && raw.trainer.skin, 0),
      cloth: num(raw.trainer && raw.trainer.cloth, 0),
      acc: num(raw.trainer && raw.trainer.acc, 0),
      colors: {
        cloth: str(raw.trainer && raw.trainer.colors && raw.trainer.colors.cloth, def.trainer.colors.cloth),
        hair: str(raw.trainer && raw.trainer.colors && raw.trainer.colors.hair, def.trainer.colors.hair),
        acc: str(raw.trainer && raw.trainer.colors && raw.trainer.colors.acc, def.trainer.colors.acc)
      }
    },
    pets: Array.isArray(raw.pets) ? raw.pets : [],
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    cardsSeen: Array.isArray(raw.cardsSeen) ? raw.cardsSeen : [],
    collection: Array.isArray(raw.collection) ? raw.collection : [],
    impSkin: num(raw.impSkin, 0),
    rank: { tier: num(raw.rank && raw.rank.tier, 0), point: num(raw.rank && raw.rank.point, 0) },
    stats: {
      win: num(raw.stats && raw.stats.win, 0),
      lose: num(raw.stats && raw.stats.lose, 0),
      draw: num(raw.stats && raw.stats.draw, 0),
      bestRound: num(raw.stats && raw.stats.bestRound, 0)
    },
    lastDailyWin: str(raw.lastDailyWin, ''),
    audio: {
      music: !(raw.audio && raw.audio.music === false),
      sfx: !(raw.audio && raw.audio.sfx === false)
    }
  };
  cache = merged;
  return merged;
}

export function saveNow(): void {
  if (!cache) return;
  if (!HAS_WX) return;
  try { WX.setStorageSync(SAVE_KEY, cache); } catch (e) { /* 忽略写入失败 */ }
}

/**
 * 视觉自检专用存档（只在 `src/main.ts` 的 DEV_ENTRY 打开时调用，发布流程永不触发）：
 * 把存档填成「玩过几局的玩家」，让图鉴/卡组/段位/商店能展示有数据的真实排版，
 * 否则新存档下这些页面全是空态或灰剪影，无法与目标图比对。
 */
export function devSeedSave(): void {
  const s = loadSave();
  s.coins = 320;
  s.stars = 24;
  s.collection = ['elephant', 'lion', 'tiger', 'leopard', 'wolf'];
  s.cardsSeen = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog'];
  s.rank = { tier: 1, point: 40 };
  s.stats = { win: 7, lose: 3, draw: 1, bestRound: 8 };
  cache = s;
}

/** 局末结算：写入货币/统计/图鉴并落盘。 */
export function applyMatchResult(outcome: 'win' | 'lose' | 'draw', coins: number, stars: number, seen: string[]): PlayerSave {
  const s = loadSave();
  s.coins += coins;
  s.stars += stars;
  if (outcome === 'win') s.stats.win++;
  else if (outcome === 'lose') s.stats.lose++;
  else s.stats.draw++;
  for (let i = 0; i < seen.length; i++) {
    if (s.cardsSeen.indexOf(seen[i]) < 0) s.cardsSeen.push(seen[i]);
  }
  saveNow();
  return s;
}

function num(v: any, def: number): number {
  return typeof v === 'number' && isFinite(v) ? v : def;
}
function str(v: any, def: string): string {
  return typeof v === 'string' && v.length > 0 ? v : def;
}