"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARKET = exports.SHELF = exports.BANNER_RECT = exports.BOARD_RECT = void 0;
exports.sideOut = sideOut;
exports.inRect = inRect;
exports.rectCenter = rectCenter;
exports.entryRect = entryRect;
exports.entryPanelRect = entryPanelRect;
exports.entryAt = entryAt;
exports.gearRect = gearRect;
exports.scrollRect = scrollRect;
exports.sunCoinRect = sunCoinRect;
exports.coachRect = coachRect;
exports.houseRect = houseRect;
exports.impRect = impRect;
exports.benchRect = benchRect;
exports.benchAt = benchAt;
exports.handRect = handRect;
exports.handAt = handAt;
exports.shelfRect = shelfRect;
exports.shelfAt = shelfAt;
exports.refreshRect = refreshRect;
exports.giftRect = giftRect;
exports.readyRect = readyRect;
exports.detailRect = detailRect;
exports.warbookRect = warbookRect;
exports.settingsRect = settingsRect;
exports.detailButtonRect = detailButtonRect;
exports.resultButtonRect = resultButtonRect;
exports.reportArrowRect = reportArrowRect;
exports.anchorPixel = anchorPixel;
exports.snapRadiusPx = snapRadiusPx;
exports.nearestPlayerAnchor = nearestPlayerAnchor;
exports.nearestAnchor = nearestAnchor;
exports.anchorVisible = anchorVisible;
/**
 * 对局界面的几何与命中测试（§2.6 布局 / §4 棋盘 / §7.5 卡面）。
 *
 * 只做「逻辑坐标 ↔ 像素 ↔ 命中区」的换算，不画任何东西、不读任何状态，
 * 让场景层（渲染）与交互层共用同一份坐标定义，避免两处各写一套。
 */
var layout_1 = require("../config/layout");
var timing_1 = require("../config/timing");
var setup_1 = require("../core/setup");
var screen_1 = require("../platform/screen");
/**
 * 两侧 HUD 的「贴边外移量」（逻辑单位）。
 *
 * 1280×720 是设计基准，但视口会按真实屏幕比例等比外扩（见 platform/screen.ts）：
 * 逻辑可视区是 `-padX .. 1280 + padX`。左右两列 HUD（双方条目、齿轮、卷轴、阳光币、
 * 饲养员/小屋、小恶魔）必须跟着外移 padX，才能贴住真实屏幕两边——否则宽屏上会在
 * 两侧各留一条空背景，这正是「内容没有主动填满可用宽度」的观感问题。
 * 棋盘/替补席/手牌/横幅保持居中不动，贴合底板烘焙元素。
 */
function sideOut() {
    return (0, screen_1.getViewport)().padX;
}
function inRect(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function rectCenter(r) {
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
/** 棋盘可交互区域（不含左右侧栏与底部替补席）。 */
exports.BOARD_RECT = layout_1.LAYOUT.BOARD;
/** 阶段横幅（回合·阶段名·倒计时）。 */
exports.BANNER_RECT = { x: 210 + (860 - 320) / 2, y: 12, w: 320, h: 62 };
/** 左：我方条目 6 条；右：敌方条目 6 条（左右列按视口留边外移，贴住真实屏幕边）。 */
function entryRect(faction, index) {
    var e = faction === 'player' ? layout_1.LAYOUT.MY_ENTRY : layout_1.LAYOUT.ENEMY_ENTRY;
    var out = sideOut();
    var x = faction === 'player' ? e.x - out : e.x + out;
    return { x: x, y: e.y + index * (e.h + e.gap), w: e.w, h: e.h };
}
/** 两侧条目背后的木质挂条（与条目同宽同高，随条目一起外移）。 */
function entryPanelRect(faction) {
    var e = faction === 'player' ? layout_1.LAYOUT.MY_ENTRY : layout_1.LAYOUT.ENEMY_ENTRY;
    var out = sideOut();
    var colH = e.h * 6 + e.gap * 5 + 24;
    var x = faction === 'player' ? e.x - 6 - out : e.x - 6 + out;
    return { x: x, y: e.y - 12, w: e.w + 12, h: colH };
}
function entryAt(x, y) {
    for (var i = 0; i < 6; i++) {
        if (inRect(entryRect('player', i), x, y))
            return { faction: 'player', index: i };
    }
    for (var i = 0; i < 6; i++) {
        if (inRect(entryRect('enemy', i), x, y))
            return { faction: 'enemy', index: i };
    }
    return null;
}
/** 齿轮（设置）/ 卷轴（战绩）/ 阳光币：均随两侧 HUD 外移贴边。 */
function gearRect() {
    var out = sideOut();
    return { x: layout_1.LAYOUT.GEAR.x - out, y: layout_1.LAYOUT.GEAR.y, w: layout_1.LAYOUT.GEAR.size, h: layout_1.LAYOUT.GEAR.size };
}
function scrollRect() {
    var out = sideOut();
    return { x: layout_1.LAYOUT.SCROLL.x + out, y: layout_1.LAYOUT.SCROLL.y, w: layout_1.LAYOUT.SCROLL.size, h: layout_1.LAYOUT.SCROLL.size };
}
function sunCoinRect() {
    var out = sideOut();
    return { x: layout_1.LAYOUT.SUN_COIN.x + out, y: layout_1.LAYOUT.SUN_COIN.y, w: layout_1.LAYOUT.SUN_COIN.size, h: layout_1.LAYOUT.SUN_COIN.size };
}
/** 左下饲养员头像 + 小屋 HP。 */
function coachRect() {
    var c = layout_1.LAYOUT.MY_COACH;
    var out = sideOut();
    return { x: c.x - out, y: c.y, w: c.avatar, h: c.avatar };
}
function houseRect() {
    var c = layout_1.LAYOUT.MY_COACH;
    var cr = coachRect();
    return { x: cr.x + c.avatar + 8, y: c.y + 4, w: c.house.w, h: c.house.h };
}
/** 右下敌方小恶魔立绘区。 */
function impRect() {
    var out = sideOut();
    return { x: layout_1.LAYOUT.ENEMY_IMP.x + out, y: layout_1.LAYOUT.ENEMY_IMP.y, w: layout_1.LAYOUT.ENEMY_IMP.w, h: layout_1.LAYOUT.ENEMY_IMP.h };
}
/** 替补席 8 格（战斗阶段收窄）。 */
function benchRect(index, narrow) {
    var b = layout_1.LAYOUT.BENCH;
    var total = b.slots * b.cell + (b.slots - 1) * b.gap;
    var x0 = layout_1.LAYOUT.BOARD.x + (layout_1.LAYOUT.BOARD.w - total) / 2;
    var h = narrow ? layout_1.LAYOUT.BENCH_NARROW_H : b.cell;
    var y = narrow ? layout_1.LAYOUT.SCREEN_H - layout_1.LAYOUT.BENCH_NARROW_H - 6 : b.y;
    return { x: x0 + index * (b.cell + b.gap), y: y, w: b.cell, h: h };
}
function benchAt(x, y, narrow) {
    for (var i = 0; i < layout_1.LAYOUT.BENCH.slots; i++) {
        if (inRect(benchRect(i, narrow), x, y))
            return i;
    }
    return -1;
}
/** 手牌区（买到的加成牌停在这里，等玩家拖到动物身上）。 */
function handRect(index) {
    var w = 96;
    var h = 132;
    var gap = 12;
    var total = 5 * w + 4 * gap;
    var x0 = layout_1.LAYOUT.BOARD.x + (layout_1.LAYOUT.BOARD.w - total) / 2;
    var y = layout_1.LAYOUT.BENCH.y - h - 12;
    return { x: x0 + index * (w + gap), y: y, w: w, h: h };
}
function handAt(x, y) {
    for (var i = 0; i < 5; i++) {
        if (inRect(handRect(i), x, y))
            return i;
    }
    return -1;
}
/** 集市货架 5 张卡：坐标对齐集市底板（art-src/ui-market-v2）里烘死的 5 个卡位。 */
exports.SHELF = { x0: 80, y0: 170, w: 210, h: 390, pitch: 231 };
function shelfRect(index) {
    return { x: exports.SHELF.x0 + index * exports.SHELF.pitch, y: exports.SHELF.y0, w: exports.SHELF.w, h: exports.SHELF.h };
}
function shelfAt(x, y) {
    for (var i = 0; i < 5; i++) {
        if (inRect(shelfRect(i), x, y))
            return i;
    }
    return -1;
}
/** 集市底板里烘死的木质元素位置，程序化 HUD 按这些坐标盖上去。 */
exports.MARKET = {
    banner: { x: 456, y: 16, w: 374, h: 92 },
    gear: { x: 4, y: 6, size: 100 },
    sunRect: { x: 1002, y: 8, w: 234, h: 84 },
    ready: { x: 1116, y: 100, w: 154, h: 56 },
};
/** 集市：刷新圆牌 + 本轮免费赠礼木牌（对齐底板上烘死的圆牌与木牌）。 */
function refreshRect() {
    return { x: 1100, y: 555, w: 150, h: 150 };
}
function giftRect() {
    return { x: 862, y: 612, w: 188, h: 84 };
}
/** 布阵阶段「准备就绪」木牌。 */
function readyRect() {
    return { x: layout_1.LAYOUT.BOARD.x + layout_1.LAYOUT.BOARD.w / 2 - 110, y: 500, w: 220, h: 66 };
}
/** 详情页 / 战绩卷轴 / 设置 面板。 */
function detailRect() {
    return { x: layout_1.LAYOUT.BOARD.x + 24, y: 54, w: 520, h: 540 };
}
function warbookRect() {
    return { x: 748, y: 64, w: 500, h: 520 };
}
function settingsRect() {
    return { x: 420, y: 110, w: 440, h: 440 };
}
/** 详情页按钮：卸下加成 / 卖出 / 关闭。 */
function detailButtonRect(index) {
    var d = detailRect();
    var w = 150;
    var gap = 16;
    var x0 = d.x + (d.w - (3 * w + 2 * gap)) / 2;
    return { x: x0 + index * (w + gap), y: d.y + d.h - 74, w: w, h: 56 };
}
/** 结算页底部三按钮：再来一局 / 返回营地 / 分享战绩。 */
function resultButtonRect(index) {
    var w = 268;
    var gap = 18;
    var x0 = 306;
    return { x: x0 + index * (w + gap), y: 632, w: w, h: 68 };
}
/** 结算页战报翻页箭头（贴在伤害构成面板左右木框上）。 */
function reportArrowRect(dir) {
    return { x: dir < 0 ? 334 : 736, y: 314, w: 30, h: 30 };
}
/**
 * 逻辑点位 → 棋盘像素。逻辑层点位号（0..47）与渲染网格不同：
 * setup 里 anchor 0..5 / row 0 起按行优先编号，这里统一走 `anchorColRow`。
 */
var ANCHOR_PIXELS = (function () {
    var out = [];
    for (var a = 0; a < setup_1.ANCHOR_COUNT; a++) {
        var cr = (0, setup_1.anchorColRow)(a);
        out.push((0, layout_1.anchorToPixel)(cr.col, cr.row));
    }
    return out;
})();
function anchorPixel(anchor) {
    if (anchor < 0 || anchor >= ANCHOR_PIXELS.length)
        return { x: -999, y: -999 };
    return ANCHOR_PIXELS[anchor];
}
/** 落点判定半径：格子边长的一半（拖拽吸附距离 = 0.5 单位，§4.3）。 */
function snapRadiusPx() {
    return layout_1.LAYOUT.GRID.cellW * timing_1.TIMING.SNAP_DISTANCE;
}
/** 最近的**我方**点位（敌方点位任何阶段都不可交互）。点不到返回 -1。 */
function nearestPlayerAnchor(x, y, maxPx) {
    var lim = maxPx === undefined ? snapRadiusPx() : maxPx;
    var best = -1;
    var bestD = lim * lim;
    for (var a = 0; a < ANCHOR_PIXELS.length; a++) {
        if (!(0, setup_1.isPlayerAnchor)(a))
            continue;
        var p = ANCHOR_PIXELS[a];
        var dx = p.x - x;
        var dy = p.y - y;
        var d = dx * dx + dy * dy;
        if (d <= bestD) {
            bestD = d;
            best = a;
        }
    }
    return best;
}
/** 像素落在哪个点位判定圈里（含敌方，用于日志/演出，不用于交互）。 */
function nearestAnchor(x, y, maxPx) {
    var lim = maxPx === undefined ? snapRadiusPx() : maxPx;
    var best = -1;
    var bestD = lim * lim;
    for (var a = 0; a < ANCHOR_PIXELS.length; a++) {
        var p = ANCHOR_PIXELS[a];
        var dx = p.x - x;
        var dy = p.y - y;
        var d = dx * dx + dy * dy;
        if (d <= bestD) {
            bestD = d;
            best = a;
        }
    }
    return best;
}
/** 点位是否在棋盘可视范围内（用于裁剪与视差）。 */
function anchorVisible(anchor) {
    var p = anchorPixel(anchor);
    return inRect(exports.BOARD_RECT, p.x, p.y);
}
