"use strict";
/**
 * barrel：core 的公开入口（场景层/无头自检都从这里 require）。
 * 除 core 各模块外，一并 re-export 配置里的类型与常量，避免上层再写相对路径。
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tint = exports.rgba = exports.HP_RING_COLOR = exports.FACTION_COLOR = exports.PALETTE = exports.anchorToPixel = exports.LAYOUT = exports.weatherDef = exports.resolveWeather = exports.WEATHER_COMBOS = exports.WEATHER_CARDS = exports.PLAYER_ROWS = exports.PLAYER_COLS = exports.GRID_ROWS = exports.GRID_COLS = exports.TIMING = exports.buffDef = exports.CARD_FLY_MS = exports.SHELF_SLOTS = exports.SPECIES_BIAS = exports.POOL_SHARE = exports.TRAIT_SLOTS = exports.BUFF_SLOTS = exports.BUFF_CARDS = exports.interestOf = exports.sellValue = exports.roundDamage = exports.tierTableForRound = exports.TIER_TABLE = exports.ECONOMY = exports.deployCapOfRound = exports.SPECIES_THEME = exports.BENCH_SLOTS = exports.LEVEL_DECOS = exports.LEVEL_MULT = exports.counteredBy = exports.COUNTER = exports.SPECIES_ORDER = exports.SPECIES = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./command"), exports);
__exportStar(require("./rng"), exports);
__exportStar(require("./setup"), exports);
__exportStar(require("./damage"), exports);
__exportStar(require("./battle"), exports);
__exportStar(require("./shop"), exports);
__exportStar(require("./ai"), exports);
__exportStar(require("./engine"), exports);
var species_1 = require("../config/species");
Object.defineProperty(exports, "SPECIES", { enumerable: true, get: function () { return species_1.SPECIES; } });
Object.defineProperty(exports, "SPECIES_ORDER", { enumerable: true, get: function () { return species_1.SPECIES_ORDER; } });
Object.defineProperty(exports, "COUNTER", { enumerable: true, get: function () { return species_1.COUNTER; } });
Object.defineProperty(exports, "counteredBy", { enumerable: true, get: function () { return species_1.counteredBy; } });
Object.defineProperty(exports, "LEVEL_MULT", { enumerable: true, get: function () { return species_1.LEVEL_MULT; } });
Object.defineProperty(exports, "LEVEL_DECOS", { enumerable: true, get: function () { return species_1.LEVEL_DECOS; } });
Object.defineProperty(exports, "BENCH_SLOTS", { enumerable: true, get: function () { return species_1.BENCH_SLOTS; } });
Object.defineProperty(exports, "SPECIES_THEME", { enumerable: true, get: function () { return species_1.SPECIES_THEME; } });
Object.defineProperty(exports, "deployCapOfRound", { enumerable: true, get: function () { return species_1.deployCapOfRound; } });
var economy_1 = require("../config/economy");
Object.defineProperty(exports, "ECONOMY", { enumerable: true, get: function () { return economy_1.ECONOMY; } });
Object.defineProperty(exports, "TIER_TABLE", { enumerable: true, get: function () { return economy_1.TIER_TABLE; } });
Object.defineProperty(exports, "tierTableForRound", { enumerable: true, get: function () { return economy_1.tierTableForRound; } });
Object.defineProperty(exports, "roundDamage", { enumerable: true, get: function () { return economy_1.roundDamage; } });
Object.defineProperty(exports, "sellValue", { enumerable: true, get: function () { return economy_1.sellValue; } });
Object.defineProperty(exports, "interestOf", { enumerable: true, get: function () { return economy_1.interestOf; } });
var cards_1 = require("../config/cards");
Object.defineProperty(exports, "BUFF_CARDS", { enumerable: true, get: function () { return cards_1.BUFF_CARDS; } });
Object.defineProperty(exports, "BUFF_SLOTS", { enumerable: true, get: function () { return cards_1.BUFF_SLOTS; } });
Object.defineProperty(exports, "TRAIT_SLOTS", { enumerable: true, get: function () { return cards_1.TRAIT_SLOTS; } });
Object.defineProperty(exports, "POOL_SHARE", { enumerable: true, get: function () { return cards_1.POOL_SHARE; } });
Object.defineProperty(exports, "SPECIES_BIAS", { enumerable: true, get: function () { return cards_1.SPECIES_BIAS; } });
Object.defineProperty(exports, "SHELF_SLOTS", { enumerable: true, get: function () { return cards_1.SHELF_SLOTS; } });
Object.defineProperty(exports, "CARD_FLY_MS", { enumerable: true, get: function () { return cards_1.CARD_FLY_MS; } });
Object.defineProperty(exports, "buffDef", { enumerable: true, get: function () { return cards_1.buffDef; } });
var timing_1 = require("../config/timing");
Object.defineProperty(exports, "TIMING", { enumerable: true, get: function () { return timing_1.TIMING; } });
Object.defineProperty(exports, "GRID_COLS", { enumerable: true, get: function () { return timing_1.GRID_COLS; } });
Object.defineProperty(exports, "GRID_ROWS", { enumerable: true, get: function () { return timing_1.GRID_ROWS; } });
Object.defineProperty(exports, "PLAYER_COLS", { enumerable: true, get: function () { return timing_1.PLAYER_COLS; } });
Object.defineProperty(exports, "PLAYER_ROWS", { enumerable: true, get: function () { return timing_1.PLAYER_ROWS; } });
var weather_1 = require("../config/weather");
Object.defineProperty(exports, "WEATHER_CARDS", { enumerable: true, get: function () { return weather_1.WEATHER_CARDS; } });
Object.defineProperty(exports, "WEATHER_COMBOS", { enumerable: true, get: function () { return weather_1.WEATHER_COMBOS; } });
Object.defineProperty(exports, "resolveWeather", { enumerable: true, get: function () { return weather_1.resolveWeather; } });
Object.defineProperty(exports, "weatherDef", { enumerable: true, get: function () { return weather_1.weatherDef; } });
var layout_1 = require("../config/layout");
Object.defineProperty(exports, "LAYOUT", { enumerable: true, get: function () { return layout_1.LAYOUT; } });
Object.defineProperty(exports, "anchorToPixel", { enumerable: true, get: function () { return layout_1.anchorToPixel; } });
var palette_1 = require("../config/palette");
Object.defineProperty(exports, "PALETTE", { enumerable: true, get: function () { return palette_1.PALETTE; } });
Object.defineProperty(exports, "FACTION_COLOR", { enumerable: true, get: function () { return palette_1.FACTION_COLOR; } });
Object.defineProperty(exports, "HP_RING_COLOR", { enumerable: true, get: function () { return palette_1.HP_RING_COLOR; } });
Object.defineProperty(exports, "rgba", { enumerable: true, get: function () { return palette_1.rgba; } });
Object.defineProperty(exports, "tint", { enumerable: true, get: function () { return palette_1.tint; } });
