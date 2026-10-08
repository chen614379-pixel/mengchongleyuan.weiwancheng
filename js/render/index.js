"use strict";
/**
 * 渲染层统一出口。场景可以按模块直接 import，也可以从这里一次拿全。
 * 注意：这里显式列名 re-export（不用 `export *`），避免同名符号在不同模块间产生歧义。
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
exports.drawCostCoin = exports.drawCardBack = exports.drawCard = exports.cardSize = exports.ringPaperHint = exports.HP_TEXT_COLOR = exports.SIDEBAR_HP_SIZE = exports.deltaColor = exports.drawHpNumber = exports.drawStatusIcon = exports.drawStatusIcons = exports.ringColorFor = exports.drawSidebarRing = exports.drawHpRing = exports.debugAnchors = exports.stableSeed = exports.levelOf = exports.unitRingRadius = exports.speciesHeight = exports.speciesBodyRadius = exports.drawSpeciesSilhouette = exports.drawSpeciesCreature = exports.drawUnit = exports.drawHouseHp = exports.drawDeployArrow = exports.drawGrassRipple = exports.drawMossPatch = exports.drawEnemyFog = exports.drawBoard = exports.drawStream = exports.clearingPath = exports.battleLightBoost = exports.weatherShort = exports.weatherTint = exports.drawWeather = exports.drawVignette = exports.drawSunSpecks = exports.drawForestLayer = exports.drawSky = exports.VIEW_H = exports.VIEW_W = exports.assetFailed = exports.missingAssets = exports.clearSurfaces = exports.getSurface = exports.getImage = exports.reloadAssets = exports.assetProgress = exports.loadAssets = exports.ASSET_LIST = void 0;
exports.drawToast = exports.drawProgressLeaf = exports.drawIconButton = exports.drawTipBubble = exports.drawTitlePlate = exports.drawTabBar = exports.drawBackButton = exports.drawSunCoin = exports.drawGear = exports.drawButton = exports.drawWoodPanel = exports.drawPageDots = exports.drawRewardRow = exports.drawSunLedger = exports.drawHighlightStrip = exports.drawMvpPanel = exports.drawDamageStack = exports.drawReportCard = exports.drawResultBanner = exports.drawImp = exports.drawCoach = exports.drawScoreboardPanel = exports.drawDeployTimer = exports.drawCoachAvatar = exports.drawScrollButton = exports.drawBench = exports.drawSideEntry = exports.drawSidebar = exports.drawBuffIcon = exports.drawQualityMark = exports.drawCounterRing = void 0;
// 资源
var assets_1 = require("./assets");
Object.defineProperty(exports, "ASSET_LIST", { enumerable: true, get: function () { return assets_1.ASSET_LIST; } });
Object.defineProperty(exports, "loadAssets", { enumerable: true, get: function () { return assets_1.loadAssets; } });
Object.defineProperty(exports, "assetProgress", { enumerable: true, get: function () { return assets_1.assetProgress; } });
Object.defineProperty(exports, "reloadAssets", { enumerable: true, get: function () { return assets_1.reloadAssets; } });
Object.defineProperty(exports, "getImage", { enumerable: true, get: function () { return assets_1.getImage; } });
Object.defineProperty(exports, "getSurface", { enumerable: true, get: function () { return assets_1.getSurface; } });
Object.defineProperty(exports, "clearSurfaces", { enumerable: true, get: function () { return assets_1.clearSurfaces; } });
Object.defineProperty(exports, "missingAssets", { enumerable: true, get: function () { return assets_1.missingAssets; } });
Object.defineProperty(exports, "assetFailed", { enumerable: true, get: function () { return assets_1.assetFailed; } });
Object.defineProperty(exports, "VIEW_W", { enumerable: true, get: function () { return assets_1.VIEW_W; } });
Object.defineProperty(exports, "VIEW_H", { enumerable: true, get: function () { return assets_1.VIEW_H; } });
// 共享画笔库
__exportStar(require("./paint"), exports);
// 森林 / 天空 / 天气
var forest_1 = require("./forest");
Object.defineProperty(exports, "drawSky", { enumerable: true, get: function () { return forest_1.drawSky; } });
Object.defineProperty(exports, "drawForestLayer", { enumerable: true, get: function () { return forest_1.drawForestLayer; } });
Object.defineProperty(exports, "drawSunSpecks", { enumerable: true, get: function () { return forest_1.drawSunSpecks; } });
Object.defineProperty(exports, "drawVignette", { enumerable: true, get: function () { return forest_1.drawVignette; } });
Object.defineProperty(exports, "drawWeather", { enumerable: true, get: function () { return forest_1.drawWeather; } });
Object.defineProperty(exports, "weatherTint", { enumerable: true, get: function () { return forest_1.weatherTint; } });
Object.defineProperty(exports, "weatherShort", { enumerable: true, get: function () { return forest_1.weatherShort; } });
Object.defineProperty(exports, "battleLightBoost", { enumerable: true, get: function () { return forest_1.battleLightBoost; } });
// 棋盘
var board_1 = require("./board");
Object.defineProperty(exports, "clearingPath", { enumerable: true, get: function () { return board_1.clearingPath; } });
Object.defineProperty(exports, "drawStream", { enumerable: true, get: function () { return board_1.drawStream; } });
Object.defineProperty(exports, "drawBoard", { enumerable: true, get: function () { return board_1.drawBoard; } });
Object.defineProperty(exports, "drawEnemyFog", { enumerable: true, get: function () { return board_1.drawEnemyFog; } });
Object.defineProperty(exports, "drawMossPatch", { enumerable: true, get: function () { return board_1.drawMossPatch; } });
Object.defineProperty(exports, "drawGrassRipple", { enumerable: true, get: function () { return board_1.drawGrassRipple; } });
Object.defineProperty(exports, "drawDeployArrow", { enumerable: true, get: function () { return board_1.drawDeployArrow; } });
Object.defineProperty(exports, "drawHouseHp", { enumerable: true, get: function () { return board_1.drawHouseHp; } });
// 单位
var unit_1 = require("./unit");
Object.defineProperty(exports, "drawUnit", { enumerable: true, get: function () { return unit_1.drawUnit; } });
Object.defineProperty(exports, "drawSpeciesCreature", { enumerable: true, get: function () { return unit_1.drawSpeciesCreature; } });
Object.defineProperty(exports, "drawSpeciesSilhouette", { enumerable: true, get: function () { return unit_1.drawSpeciesSilhouette; } });
Object.defineProperty(exports, "speciesBodyRadius", { enumerable: true, get: function () { return unit_1.speciesBodyRadius; } });
Object.defineProperty(exports, "speciesHeight", { enumerable: true, get: function () { return unit_1.speciesHeight; } });
Object.defineProperty(exports, "unitRingRadius", { enumerable: true, get: function () { return unit_1.unitRingRadius; } });
Object.defineProperty(exports, "levelOf", { enumerable: true, get: function () { return unit_1.levelOf; } });
Object.defineProperty(exports, "stableSeed", { enumerable: true, get: function () { return unit_1.stableSeed; } });
Object.defineProperty(exports, "debugAnchors", { enumerable: true, get: function () { return unit_1.debugAnchors; } });
// 血量环 / 状态图标
var hpring_1 = require("./hpring");
Object.defineProperty(exports, "drawHpRing", { enumerable: true, get: function () { return hpring_1.drawHpRing; } });
Object.defineProperty(exports, "drawSidebarRing", { enumerable: true, get: function () { return hpring_1.drawSidebarRing; } });
Object.defineProperty(exports, "ringColorFor", { enumerable: true, get: function () { return hpring_1.ringColorFor; } });
Object.defineProperty(exports, "drawStatusIcons", { enumerable: true, get: function () { return hpring_1.drawStatusIcons; } });
Object.defineProperty(exports, "drawStatusIcon", { enumerable: true, get: function () { return hpring_1.drawStatusIcon; } });
Object.defineProperty(exports, "drawHpNumber", { enumerable: true, get: function () { return hpring_1.drawHpNumber; } });
Object.defineProperty(exports, "deltaColor", { enumerable: true, get: function () { return hpring_1.deltaColor; } });
Object.defineProperty(exports, "SIDEBAR_HP_SIZE", { enumerable: true, get: function () { return hpring_1.SIDEBAR_HP_SIZE; } });
Object.defineProperty(exports, "HP_TEXT_COLOR", { enumerable: true, get: function () { return hpring_1.HP_TEXT_COLOR; } });
Object.defineProperty(exports, "ringPaperHint", { enumerable: true, get: function () { return hpring_1.ringPaperHint; } });
// 卡牌
var card_1 = require("./card");
Object.defineProperty(exports, "cardSize", { enumerable: true, get: function () { return card_1.cardSize; } });
Object.defineProperty(exports, "drawCard", { enumerable: true, get: function () { return card_1.drawCard; } });
Object.defineProperty(exports, "drawCardBack", { enumerable: true, get: function () { return card_1.drawCardBack; } });
Object.defineProperty(exports, "drawCostCoin", { enumerable: true, get: function () { return card_1.drawCostCoin; } });
Object.defineProperty(exports, "drawCounterRing", { enumerable: true, get: function () { return card_1.drawCounterRing; } });
Object.defineProperty(exports, "drawQualityMark", { enumerable: true, get: function () { return card_1.drawQualityMark; } });
Object.defineProperty(exports, "drawBuffIcon", { enumerable: true, get: function () { return card_1.drawBuffIcon; } });
// 侧栏 / 替补席 / 战绩
var sidebar_1 = require("./sidebar");
Object.defineProperty(exports, "drawSidebar", { enumerable: true, get: function () { return sidebar_1.drawSidebar; } });
Object.defineProperty(exports, "drawSideEntry", { enumerable: true, get: function () { return sidebar_1.drawSideEntry; } });
Object.defineProperty(exports, "drawBench", { enumerable: true, get: function () { return sidebar_1.drawBench; } });
Object.defineProperty(exports, "drawScrollButton", { enumerable: true, get: function () { return sidebar_1.drawScrollButton; } });
Object.defineProperty(exports, "drawCoachAvatar", { enumerable: true, get: function () { return sidebar_1.drawCoachAvatar; } });
Object.defineProperty(exports, "drawDeployTimer", { enumerable: true, get: function () { return sidebar_1.drawDeployTimer; } });
Object.defineProperty(exports, "drawScoreboardPanel", { enumerable: true, get: function () { return sidebar_1.drawScoreboardPanel; } });
// NPC
var coach_1 = require("./coach");
Object.defineProperty(exports, "drawCoach", { enumerable: true, get: function () { return coach_1.drawCoach; } });
var imp_1 = require("./imp");
Object.defineProperty(exports, "drawImp", { enumerable: true, get: function () { return imp_1.drawImp; } });
// 结算
var result_1 = require("./result");
Object.defineProperty(exports, "drawResultBanner", { enumerable: true, get: function () { return result_1.drawResultBanner; } });
Object.defineProperty(exports, "drawReportCard", { enumerable: true, get: function () { return result_1.drawReportCard; } });
Object.defineProperty(exports, "drawDamageStack", { enumerable: true, get: function () { return result_1.drawDamageStack; } });
Object.defineProperty(exports, "drawMvpPanel", { enumerable: true, get: function () { return result_1.drawMvpPanel; } });
Object.defineProperty(exports, "drawHighlightStrip", { enumerable: true, get: function () { return result_1.drawHighlightStrip; } });
Object.defineProperty(exports, "drawSunLedger", { enumerable: true, get: function () { return result_1.drawSunLedger; } });
Object.defineProperty(exports, "drawRewardRow", { enumerable: true, get: function () { return result_1.drawRewardRow; } });
Object.defineProperty(exports, "drawPageDots", { enumerable: true, get: function () { return result_1.drawPageDots; } });
// 通用 UI 零件
var ui_1 = require("./ui");
Object.defineProperty(exports, "drawWoodPanel", { enumerable: true, get: function () { return ui_1.drawWoodPanel; } });
Object.defineProperty(exports, "drawButton", { enumerable: true, get: function () { return ui_1.drawButton; } });
Object.defineProperty(exports, "drawGear", { enumerable: true, get: function () { return ui_1.drawGear; } });
Object.defineProperty(exports, "drawSunCoin", { enumerable: true, get: function () { return ui_1.drawSunCoin; } });
Object.defineProperty(exports, "drawBackButton", { enumerable: true, get: function () { return ui_1.drawBackButton; } });
Object.defineProperty(exports, "drawTabBar", { enumerable: true, get: function () { return ui_1.drawTabBar; } });
Object.defineProperty(exports, "drawTitlePlate", { enumerable: true, get: function () { return ui_1.drawTitlePlate; } });
Object.defineProperty(exports, "drawTipBubble", { enumerable: true, get: function () { return ui_1.drawTipBubble; } });
Object.defineProperty(exports, "drawIconButton", { enumerable: true, get: function () { return ui_1.drawIconButton; } });
Object.defineProperty(exports, "drawProgressLeaf", { enumerable: true, get: function () { return ui_1.drawProgressLeaf; } });
Object.defineProperty(exports, "drawToast", { enumerable: true, get: function () { return ui_1.drawToast; } });
