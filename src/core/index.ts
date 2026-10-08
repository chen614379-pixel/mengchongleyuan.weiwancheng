/**
 * barrel：core 的公开入口（场景层/无头自检都从这里 require）。
 * 除 core 各模块外，一并 re-export 配置里的类型与常量，避免上层再写相对路径。
 */

/**
 * 类型层补丁（无运行时代码）：tsconfig 的 lib 只有 ES5 + ES2015.Iterable，
 * 而 `rng.ts` 用 `Math.imul` 做 mulberry32 确定性哈希（ES2015 API）。
 * 这里只补上类型声明，运行时不新增任何东西；tsc 才可能做到零错误。
 * 若担心老版本 iOS JSCore 缺少 Math.imul，需要在启动处加一行 polyfill（属 platform 层）。
 */
declare global {
  interface Math {
    imul(a: number, b: number): number;
  }
}
export * from './types';
export * from './command';
export * from './rng';
export * from './setup';
export * from './damage';
export * from './battle';
export * from './shop';
export * from './ai';
export * from './engine';

export type { SpeciesId, Level, TraitId, SpeciesDef } from '../config/species';
export type { BuffId, CardKind, BuffCardDef } from '../config/cards';
export type { WeatherId, EffectBundle, WeatherDef, ResolvedWeather, WeatherComboDef } from '../config/weather';
export type { TierWeight } from '../config/economy';
export type { PaletteKey } from '../config/palette';

export {
  SPECIES,
  SPECIES_ORDER,
  COUNTER,
  counteredBy,
  LEVEL_MULT,
  LEVEL_DECOS,
  BENCH_SLOTS,
  SPECIES_THEME,
  deployCapOfRound
} from '../config/species';
export { ECONOMY, TIER_TABLE, tierTableForRound, roundDamage, sellValue, interestOf } from '../config/economy';
export {
  BUFF_CARDS,
  BUFF_SLOTS,
  TRAIT_SLOTS,
  POOL_SHARE,
  SPECIES_BIAS,
  SHELF_SLOTS,
  CARD_FLY_MS,
  buffDef
} from '../config/cards';
export { TIMING, GRID_COLS, GRID_ROWS, PLAYER_COLS, PLAYER_ROWS } from '../config/timing';
export { WEATHER_CARDS, WEATHER_COMBOS, resolveWeather, weatherDef } from '../config/weather';
export { LAYOUT, anchorToPixel } from '../config/layout';
export { PALETTE, FACTION_COLOR, HP_RING_COLOR, rgba, tint } from '../config/palette';