/**
 * barrel：core 的公开入口（场景层/无头自检都从这里 require）。
 * 除 core 各模块外，一并 re-export 配置里的类型与常量，避免上层再写相对路径。
 */
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