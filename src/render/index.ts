/**
 * 渲染层统一出口。场景可以按模块直接 import，也可以从这里一次拿全。
 * 注意：这里显式列名 re-export（不用 `export *`），避免同名符号在不同模块间产生歧义。
 */

// 资源
export {
  ASSET_LIST, loadAssets, assetProgress, reloadAssets, getImage, getSurface,
  clearSurfaces, missingAssets, assetFailed, VIEW_W, VIEW_H,
} from './assets';
export type { AssetEntry } from './assets';

// 共享画笔库
export * from './paint';

// 森林 / 天空 / 天气
export { drawSky, drawForestLayer, drawSunSpecks, drawVignette, drawWeather, weatherTint, weatherShort, battleLightBoost } from './forest';

// 棋盘
export { clearingPath, drawStream, drawBoard, drawEnemyFog, drawMossPatch, drawGrassRipple, drawDeployArrow, drawHouseHp } from './board';

// 单位
export {
  drawUnit, drawSpeciesCreature, drawSpeciesSilhouette, speciesBodyRadius, speciesHeight,
  unitRingRadius, levelOf, stableSeed, debugAnchors,
} from './unit';
export type { UnitView, UnitDrawOpts } from './unit';

// 血量环 / 状态图标
export {
  drawHpRing, drawSidebarRing, ringColorFor, drawStatusIcons, drawStatusIcon, drawHpNumber,
  deltaColor, SIDEBAR_HP_SIZE, HP_TEXT_COLOR, ringPaperHint,
} from './hpring';

// 卡牌
export { cardSize, drawCard, drawCardBack, drawCostCoin, drawCounterRing, drawQualityMark, drawBuffIcon } from './card';
export type { CardView, CardDrawOpts } from './card';

// 侧栏 / 替补席 / 战绩
export {
  drawSidebar, drawSideEntry, drawBench, drawScrollButton, drawCoachAvatar, drawDeployTimer, drawScoreboardPanel,
} from './sidebar';
export type { SideEntryView, RoundLogView } from './sidebar';

// NPC
export { drawCoach } from './coach';
export { drawImp } from './imp';

// 结算
export {
  drawResultBanner, drawReportCard, drawDamageStack, drawMvpPanel, drawHighlightStrip,
  drawSunLedger, drawRewardRow, drawPageDots,
} from './result';
export type { DamageSegment, MvpView, HighlightView, LedgerRow, RewardView, ReportPage, MatchResult } from './result';

// 通用 UI 零件
export {
  drawWoodPanel, drawButton, drawGear, drawSunCoin, drawBackButton, drawTabBar, drawTitlePlate,
  drawTipBubble, drawIconButton, drawProgressLeaf, drawToast,
} from './ui';
export type { PanelOpts, ButtonOpts } from './ui';