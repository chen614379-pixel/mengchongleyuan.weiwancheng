"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeckScene = exports.SCREEN = void 0;
exports.toHex = toHex;
exports.fillPanel = fillPanel;
exports.drawPanelLeaf = drawPanelLeaf;
exports.roundPts = roundPts;
exports.inCircle = inCircle;
exports.inRect = inRect;
exports.drawPanelTree = drawPanelTree;
exports.drawPanelBush = drawPanelBush;
exports.drawScreenBase = drawScreenBase;
exports.drawBackButton = drawBackButton;
exports.drawTitlePlate = drawTitlePlate;
exports.drawSunIcon = drawSunIcon;
exports.drawPawIcon = drawPawIcon;
exports.drawStarIcon = drawStarIcon;
exports.drawCurrencyChips = drawCurrencyChips;
exports.drawWoodPlate = drawWoodPlate;
exports.drawWoodButton = drawWoodButton;
exports.drawVineProgress = drawVineProgress;
exports.drawRevealVeil = drawRevealVeil;
exports.drawToast = drawToast;
exports.drawCreature = drawCreature;
exports.drawAnimalCard = drawAnimalCard;
exports.drawLock = drawLock;
exports.createDeckScene = createDeckScene;
/**
 * 卡组页（§13 局外 · 卡组展示）—— 横屏 1280×720，手绘水彩森林风。
 *
 * 【文件约定】本文件同时导出四块面板（deck / collection / settings / shop）共用的
 * 手绘通用件：纸底、顶部返回+标题+货币条、木牌背板、木牌按钮、手绘小动物、
 * 动物卡、雾气揭幕。这样四个场景文件不会各写一份重复的绘制代码。
 * 所有轮廓一律走 `ui/brush` 的 strokeInk / roundPts，颜色只取自 PALETTE 或 tint/rgba 派生。
 *
 * 卡面数值（费用 / 战力 / 特技名 / 特技说明）全部来自 `config/species` 的 SPECIES，
 * 不允许在场景里硬编码。
 */
var manager_1 = require("./manager");
var palette_1 = require("../config/palette");
var layout_1 = require("../config/layout");
var species_1 = require("../config/species");
var storage_1 = require("../platform/storage");
var audio_1 = require("../platform/audio");
var brush_1 = require("../ui/brush");
var theme_1 = require("../ui/theme");
var ease_1 = require("../ui/ease");
var paint_1 = require("../render/paint");
var card_1 = require("../render/card");
var assets_1 = require("../render/assets");
var screen_1 = require("../platform/screen");
exports.SCREEN = { W: layout_1.LAYOUT.SCREEN_W, H: layout_1.LAYOUT.SCREEN_H };
/* =========================================================================
 * 一、绘画小工具
 * ========================================================================= */
/**
 * 把 `tint()` / `rgba()` 产出的 `rgb(...)`／`rgba(...)` 字符串还原成 6 位 hex。
 *
 * 【为什么必须过这一层】`ui/brush` 的 `fillWatercolor()` 内部会再 `tint(color, …)` 一次来派生
 * 冷色暗部与湿边，而 `config/palette` 的 `tint()` 只认 6 位 hex：一旦收到 `rgb(...)` 字符串，
 * `parseInt('gb', 16)` 之类的解析就会得到 NaN，产出 `rgb(NaN,g,b)` 这种非法色。Canvas 对非法
 * 颜色字符串是**静默忽略**赋值并沿用上一个颜色，于是水彩暗部丢失、湿边还会串成上一个颜色。
 * 所以场景里凡是「派生色」再进水彩，统一先 `toHex()`。
 */
function toHex(color) {
    if (color.charAt(0) === '#')
        return color;
    var m = /rgba?\(([^)]+)\)/.exec(color);
    if (!m)
        return color;
    var parts = m[1].split(',');
    var ch = function (i) {
        var v = Math.round(parseFloat(parts[i]));
        if (!isFinite(v))
            v = 0;
        if (v < 0)
            v = 0;
        if (v > 255)
            v = 255;
        var s = v.toString(16);
        return s.length === 1 ? '0' + s : s;
    };
    return '#' + ch(0) + ch(1) + ch(2);
}
/**
 * 安全水彩填充：颜色先归一成 hex 再交给 `brush.fillWatercolor`。
 * 场景里所有水彩填充都走这里（直接调 fillWatercolor 传派生色会踩上面那个 NaN 坑）。
 */
function fillPanel(ctx, pts, color, opts) {
    (0, brush_1.fillWatercolor)(ctx, pts, toHex(color), opts);
}
/**
 * 手绘叶片（颜色先归一成 hex）。
 * `render/paint` 的 drawLeaf 内部同样是「颜色 → fillWatercolor → 再 tint」，直接喂派生色会踩 NaN 坑。
 */
function drawPanelLeaf(ctx, cx, cy, len, angle, color, seedIndex, outline) {
    (0, paint_1.drawLeaf)(ctx, cx, cy, len, angle, toHex(color), seedIndex, outline);
}
/** 追加点集（避免 concat 产生中间数组）。 */
function pushAll(dst, src) {
    for (var i = 0; i < src.length; i++)
        dst.push(src[i]);
}
/** 圆角矩形采样点（含四角弧），供 fillWatercolor / strokeInk 共用。 */
function roundPts(x, y, w, h, r) {
    var rr = Math.max(1, Math.min(r, Math.min(w, h) / 2));
    var pts = [];
    pushAll(pts, (0, brush_1.arcPoints)(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, 4));
    pushAll(pts, (0, brush_1.arcPoints)(x + w - rr, y + rr, rr, Math.PI * 1.5, Math.PI * 2, 4));
    pushAll(pts, (0, brush_1.arcPoints)(x + w - rr, y + h - rr, rr, 0, Math.PI * 0.5, 4));
    pushAll(pts, (0, brush_1.arcPoints)(x + rr, y + h - rr, rr, Math.PI * 0.5, Math.PI, 4));
    return pts;
}
/** 椭圆采样点。 */
function ellipsePts(cx, cy, rx, ry, steps) {
    var unit = (0, brush_1.arcPoints)(0, 0, 1, 0, Math.PI * 2, steps);
    var out = [];
    for (var i = 0; i < unit.length; i++)
        out.push({ x: cx + unit[i].x * rx, y: cy + unit[i].y * ry });
    return out;
}
/* =========================================================================
 * 二、面板通用件（四个场景共用）
 * ========================================================================= */
/** 一个点的命中判定（圆形）。 */
function inCircle(x, y, cx, cy, r) {
    var dx = x - cx;
    var dy = y - cy;
    return dx * dx + dy * dy <= r * r;
}
/** 矩形命中判定（含 6px 宽容）。 */
function inRect(x, y, rx, ry, rw, rh) {
    var pad = 6;
    return x >= rx - pad && x <= rx + rw + pad && y >= ry - pad && y <= ry + rh + pad;
}
/**
 * 面板背景阔叶树（自绘版）。
 *
 * 【为什么不用 `render/paint` 的 drawBroadleafTree】该函数把 `tint()` 的 **rgb(...) 输出**
 * 又交回 `fillWatercolor()`，而 brush 内部还会再 `tint()` 一次（`palette.tint` 只认 6 位 hex，
 * 遇到 `rgb(...)` 会算出 `rgb(NaN,g,b)` 的非法色）。非法 fillStyle 会被 Canvas 静默忽略并沿用
 * 上一个颜色，树冠就会失去暗部、湿边还会串色。这里自己画：只把 **hex** 交给 fillWatercolor
 * （hex 进去时内部 tint 派生是正常的），暗部与湿边因此都成立。
 */
function drawPanelTree(ctx, x, baseY, height, canopy, seedIndex, sway) {
    var sw = sway === undefined ? 0 : sway;
    var trunkW = Math.max(6, height * 0.09);
    var trunk = [
        { x: x - trunkW / 2 - 2, y: baseY },
        { x: x - trunkW * 0.3 + sw * 0.3, y: baseY - height * 0.55 },
        { x: x - trunkW * 0.4 + sw, y: baseY - height * 0.78 },
        { x: x + trunkW * 0.4 + sw, y: baseY - height * 0.78 },
        { x: x + trunkW * 0.34 + sw * 0.4, y: baseY - height * 0.52 },
        { x: x + trunkW / 2 + 2, y: baseY },
    ];
    fillPanel(ctx, trunk, palette_1.PALETTE.bark, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, trunk, { width: 2.6, close: true, seedIndex: seedIndex + 2 });
    var cy = baseY - height * 0.92 + sw * 0.8;
    var r = height * 0.3;
    var blobs = 5;
    for (var i = 0; i < blobs; i++) {
        var a = (i / blobs) * Math.PI * 2;
        var ox = Math.cos(a) * r * 0.62;
        var oy = Math.sin(a) * r * 0.4;
        var rx = r * (0.95 + (0, brush_1.noiseAt)(i, seedIndex) * 0.12);
        var ry = r * 0.78;
        var pts = [
            { x: x + ox - rx, y: cy + oy - ry },
            { x: x + ox + rx, y: cy + oy - ry },
            { x: x + ox + rx, y: cy + oy + ry },
            { x: x + ox - rx, y: cy + oy + ry },
        ];
        fillPanel(ctx, pts, i % 2 === 0 ? canopy : palette_1.PALETTE.forestDeep, {
            alpha: 0.9, layers: 2, wetEdge: true, seedIndex: seedIndex + 30 + i,
        });
    }
    (0, brush_1.strokeInk)(ctx, [
        { x: x - r * 1.15, y: cy + r * 0.45 },
        { x: x - r * 0.4, y: cy - r * 0.75 },
        { x: x + r * 0.35, y: cy - r * 0.66 },
        { x: x + r * 1.18, y: cy + r * 0.4 },
    ], { width: 2.8, jitter: 1.5, color: (0, palette_1.tint)(canopy, 0.45, palette_1.PALETTE.forestDeep), seedIndex: seedIndex + 40 });
}
/** 面板背景灌木（自绘版，理由同上）。 */
function drawPanelBush(ctx, x, y, rx, ry, color, seedIndex) {
    for (var i = 0; i < 3; i++) {
        var ox = (i - 1) * rx * 0.55;
        var oy = Math.abs(i - 1) * ry * 0.18;
        var pts = [
            { x: x + ox - rx * 0.7, y: y + oy - ry },
            { x: x + ox + rx * 0.7, y: y + oy - ry },
            { x: x + ox + rx * 0.7, y: y + oy + ry },
            { x: x + ox - rx * 0.7, y: y + oy + ry },
        ];
        fillPanel(ctx, pts, i === 1 ? palette_1.PALETTE.leafLight : color, {
            alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 10 + i,
        });
    }
}
/** 面板纸底 + 两侧森林边缘（所有面板页的背景）。 */
function drawScreenBase(ctx, t, seedIndex) {
    // 自适应全屏：纸底与边缘装饰铺满逻辑可视区，中央 1280×720 的排布完全不动
    var box = (0, screen_1.sceneBox)();
    var bx = box.x;
    var by = box.y;
    var bw = box.w;
    var bh = box.h;
    ctx.save();
    ctx.fillStyle = palette_1.PALETTE.creamMist;
    ctx.fillRect(bx, by, bw, bh);
    (0, paint_1.paperBase)(ctx, bx - 24, by - 24, bw + 48, bh + 48, palette_1.PALETTE.paper, 0.95, seedIndex);
    (0, brush_1.paperGrain)(ctx, bx, by, bw, bh, 0.045, seedIndex + 1);
    // 远景树（左右各两株，只在边缘露出，不侵入中央内容区）
    var swayA = Math.sin(t / 2600) * 2.2;
    drawPanelTree(ctx, bx - 26, 640, 560, palette_1.PALETTE.forestMid, seedIndex + 10, swayA);
    drawPanelTree(ctx, bx + 88, 600, 380, palette_1.PALETTE.forestDeep, seedIndex + 14, -swayA);
    drawPanelTree(ctx, bx + bw + 20, 660, 600, palette_1.PALETTE.forestMid, seedIndex + 18, -swayA);
    drawPanelTree(ctx, bx + bw - 92, 596, 360, palette_1.PALETTE.forestDeep, seedIndex + 22, swayA);
    // 近景灌木 / 蕨叶 / 草
    drawPanelBush(ctx, bx + 26, 700, 116, 52, palette_1.PALETTE.leafMid, seedIndex + 26);
    drawPanelBush(ctx, bx + bw - 30, 706, 124, 56, palette_1.PALETTE.leafMid, seedIndex + 30);
    (0, paint_1.drawFern)(ctx, bx + 34, 706, 66, -0.5, palette_1.PALETTE.leafLight, seedIndex + 34);
    (0, paint_1.drawFern)(ctx, bx + bw - 40, 710, 70, -2.6, palette_1.PALETTE.leafLight, seedIndex + 38);
    var tufts = Math.ceil(bw / 158) + 1;
    for (var i = 0; i < tufts; i++) {
        var gx = bx + 8 + i * 158;
        (0, paint_1.drawGrassTuft)(ctx, gx, 718, 22 + (i % 3) * 7, palette_1.PALETTE.leafMid, seedIndex + 42 + i, Math.sin(t / 1500 + i));
    }
    // 叶隙光斑（§2.1 常驻闲笔）
    for (var i = 0; i < 6; i++) {
        var ph = (t / (6200 + i * 900) + i * 0.21) % 1;
        (0, paint_1.drawSunMote)(ctx, bx + 40 + i * ((bw - 80) / 6), 96 + ph * 300, 10 + (i % 3) * 5, 0.09 * (1 - ph));
    }
    ctx.restore();
}
/** 顶部返回按钮（木质圆牌 + 手绘箭头）。 */
function drawBackButton(ctx, x, y, size, active, seedIndex) {
    var cx = x + size / 2;
    var cy = y + size / 2;
    var s = active ? 1.05 : 1.0;
    var r = (size / 2) * s;
    ctx.save();
    (0, brush_1.dropShadow)(ctx, cx - r, cy - r, r * 2, r * 2, r, seedIndex);
    var circle = (0, brush_1.arcPoints)(cx, cy, r, 0, Math.PI * 2, 20);
    fillPanel(ctx, circle, active ? palette_1.PALETTE.soil : palette_1.PALETTE.barkLight, {
        alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seedIndex + 1,
    });
    (0, paint_1.woodGrain)(ctx, cx - r + 6, cy - r + 6, r * 2 - 12, r * 2 - 12, seedIndex + 2);
    (0, brush_1.strokeInk)(ctx, circle, { width: 3, close: true, seedIndex: seedIndex + 3 });
    // 箭头（手绘折线，不用字符）
    (0, brush_1.strokeInk)(ctx, [
        { x: cx + r * 0.28, y: cy - r * 0.42 },
        { x: cx - r * 0.26, y: cy },
        { x: cx + r * 0.28, y: cy + r * 0.42 },
    ], { width: 3.4, jitter: 0.9, seedIndex: seedIndex + 4 });
    ctx.restore();
}
/** 标题木牌（顶部居中）。 */
function drawTitlePlate(ctx, cx, y, w, h, text, seedIndex) {
    var x = cx - w / 2;
    // 顶部两枚挂钉
    (0, brush_1.strokeInk)(ctx, [{ x: x + w * 0.16, y: y }, { x: x + w * 0.16, y: y - 10 }], { width: 3, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, [{ x: x + w * 0.84, y: y }, { x: x + w * 0.84, y: y - 10 }], { width: 3, seedIndex: seedIndex + 2 });
    var pts = roundPts(x, y, w, h, 16);
    (0, brush_1.dropShadow)(ctx, x, y, w, h, 16, seedIndex + 3);
    fillPanel(ctx, pts, palette_1.PALETTE.barkLight, { alpha: 0.97, layers: 2, wetEdge: true, seedIndex: seedIndex + 4 });
    (0, paint_1.woodGrain)(ctx, x + 8, y + 7, w - 16, h - 14, seedIndex + 5);
    (0, brush_1.strokeInk)(ctx, pts, { width: 3, close: true, seedIndex: seedIndex + 6 });
    // 两侧小叶
    drawPanelLeaf(ctx, x + 10, y + h / 2, 26, Math.PI * 0.9, palette_1.PALETTE.leafMid, seedIndex + 7, false);
    drawPanelLeaf(ctx, x + w - 10, y + h / 2, 26, Math.PI * 0.1, palette_1.PALETTE.leafMid, seedIndex + 8, false);
    // 木牌是浅木底：标题用深色字，奶油描边只做「压印」高光（奶油字在浅木上会糊成一团）
    (0, theme_1.textOutlined)(ctx, text, cx, y + h / 2 + 1, theme_1.FONT.h2, palette_1.PALETTE.inkSoft, 'center', 2.4);
}
/** 手绘太阳图标（阳光下注 · 货币）。 */
function drawSunIcon(ctx, cx, cy, r, t, seedIndex) {
    var pulse = 1 + 0.04 * Math.sin(t / 620);
    var body = (0, brush_1.arcPoints)(cx, cy, r * 0.62 * pulse, 0, Math.PI * 2, 16);
    fillPanel(ctx, body, palette_1.PALETTE.sunbeam, { alpha: 0.96, layers: 2, wetEdge: false, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, body, { width: 2, close: true, seedIndex: seedIndex + 2 });
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2 + 0.18;
        var r0 = r * 0.82;
        var r1 = r * (1.02 + 0.1 * Math.sin(t / 500 + i));
        (0, brush_1.strokeInk)(ctx, [
            { x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 },
            { x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 },
        ], { width: 2, jitter: 0.5, seedIndex: seedIndex + 3 + i });
    }
}
/** 手绘爪印图标（爪印币）。 */
function drawPawIcon(ctx, cx, cy, r, seedIndex) {
    var pad = ellipsePts(cx, cy + r * 0.30, r * 0.62, r * 0.52, 14);
    fillPanel(ctx, pad, palette_1.PALETTE.soil, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, pad, { width: 2.2, close: true, seedIndex: seedIndex + 2 });
    for (var i = 0; i < 3; i++) {
        var a = Math.PI * (0.18 + i * 0.32) * -1;
        var tx = cx + Math.cos(a) * r * 0.72;
        var ty = cy - r * 0.34 + Math.sin(a) * r * 0.26;
        var toe = ellipsePts(tx, ty, r * 0.22, r * 0.26, 10);
        fillPanel(ctx, toe, palette_1.PALETTE.soil, { alpha: 0.94, layers: 2, wetEdge: true, seedIndex: seedIndex + 3 + i });
        (0, brush_1.strokeInk)(ctx, toe, { width: 2, close: true, seedIndex: seedIndex + 6 + i });
    }
}
/** 手绘五角星图标（星辉）。 */
function drawStarIcon(ctx, cx, cy, r, t, seedIndex) {
    var spin = 0.06 * Math.sin(t / 900);
    var pts = [];
    for (var i = 0; i < 10; i++) {
        var a = (i / 10) * Math.PI * 2 - Math.PI / 2 + spin;
        var rr = i % 2 === 0 ? r : r * 0.46;
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    fillPanel(ctx, pts, palette_1.PALETTE.sunbeam, { alpha: 0.97, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, pts, { width: 2.2, close: true, seedIndex: seedIndex + 2 });
}
/** 顶部货币条（右上角两枚木牌 + 图标 + 数字）。 */
function drawCurrencyChips(ctx, y, t, save, seedIndex) {
    var w = 196;
    var h = 52;
    var gap = 12;
    var coinsX = exports.SCREEN.W - 26 - w;
    var starsX = coinsX - gap - w;
    drawWoodPlate(ctx, starsX, y, w, h, { radius: 18, base: palette_1.PALETTE.barkLight, seedIndex: seedIndex });
    drawWoodPlate(ctx, coinsX, y, w, h, { radius: 18, base: palette_1.PALETTE.barkLight, seedIndex: seedIndex + 20 });
    drawStarIcon(ctx, starsX + 28, y + h / 2, 15, t, seedIndex + 1);
    drawPawIcon(ctx, coinsX + 28, y + h / 2, 15, seedIndex + 21);
    (0, theme_1.setFont)(ctx, theme_1.FONT.entry + 2, 'bold');
    ctx.fillStyle = palette_1.PALETTE.creamMist;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('' + save.stars, starsX + 52, y + h / 2 + 1);
    ctx.fillText('' + save.coins, coinsX + 52, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    (0, theme_1.setFont)(ctx, theme_1.FONT.badge - 3, 'normal');
    ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.82);
    ctx.fillText('星辉', starsX + 132, y + h / 2 + 1);
    ctx.fillText('爪印币', coinsX + 132, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
}
/** 木牌背板（面板底衬）：木纹 + 手绘边框 + 水彩两层。 */
function drawWoodPlate(ctx, x, y, w, h, opts) {
    var o = opts || {};
    var r = o.radius === undefined ? layout_1.LAYOUT.PANEL_RADIUS : o.radius;
    var base = o.base === undefined ? palette_1.PALETTE.barkLight : o.base;
    var si = o.seedIndex === undefined ? 0 : o.seedIndex;
    var pts = roundPts(x, y, w, h, r);
    (0, brush_1.dropShadow)(ctx, x, y, w, h, r, si);
    fillPanel(ctx, pts, base, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: si + 1 });
    if (o.grain !== false)
        (0, paint_1.woodGrain)(ctx, x + 8, y + 7, w - 16, h - 14, si + 2);
    if (o.active) {
        ctx.save();
        ctx.globalAlpha = 0.30;
        var glow = roundPts(x + 3, y + 3, w - 6, h - 6, r - 2);
        fillPanel(ctx, glow, palette_1.PALETTE.sunbeam, { alpha: 0.5, layers: 1, wetEdge: false, seedIndex: si + 3 });
        ctx.restore();
    }
    (0, brush_1.strokeInk)(ctx, pts, { width: 3, close: true, seedIndex: si + 4 });
}
/** 木牌按钮（按下有反馈、文字带 cream 描边）。 */
function drawWoodButton(ctx, x, y, w, h, label, active, seedIndex) {
    var grow = active ? 1.03 : 1.0;
    var bw = w * grow;
    var bh = h * grow;
    var bx = x - (bw - w) / 2;
    var by = y - (bh - h) / 2 + (active ? 2 : 0);
    drawWoodPlate(ctx, bx, by, bw, bh, {
        radius: Math.min(layout_1.LAYOUT.BUTTON_RADIUS, bh / 2), base: palette_1.PALETTE.leafMid,
        active: active,
        seedIndex: seedIndex,
    });
    // 两端小叶装饰
    drawPanelLeaf(ctx, bx + 6, by + bh / 2, 20, Math.PI * 0.95, palette_1.PALETTE.leafLight, seedIndex + 9, false);
    drawPanelLeaf(ctx, bx + bw - 6, by + bh / 2, 20, Math.PI * 0.05, palette_1.PALETTE.leafLight, seedIndex + 11, false);
    var size = (0, theme_1.fitSize)(ctx, label, bw - 44, theme_1.FONT.h2, 16);
    // 绿叶木牌是浅底：奶油字必须配深色描边，否则笔画和描边同色糊成一团
    (0, theme_1.textOutlined)(ctx, label, bx + bw / 2, by + bh / 2 + 1, size, palette_1.PALETTE.creamMist, 'center', 2.6, palette_1.PALETTE.forestDeep);
}
/** 手绘小叶片进度条（图鉴收集度等）。 */
function drawVineProgress(ctx, x, y, w, h, ratio, label, seedIndex) {
    var r = (0, ease_1.clamp01)(ratio);
    var track = roundPts(x, y, w, h, h / 2);
    fillPanel(ctx, track, palette_1.PALETTE.forestDeep, { alpha: 0.35, layers: 1, wetEdge: false, seedIndex: seedIndex });
    (0, brush_1.strokeInk)(ctx, track, { width: 2.4, close: true, seedIndex: seedIndex + 1 });
    if (r > 0.01) {
        var fill = roundPts(x + 2, y + 2, (w - 4) * r, h - 4, (h - 4) / 2);
        fillPanel(ctx, fill, palette_1.PALETTE.leafLight, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 2 });
        (0, brush_1.strokeInk)(ctx, fill, { width: 2, close: true, seedIndex: seedIndex + 3 });
    }
    // 藤蔓缠绕感：几片小叶沿进度条分布
    var leaves = 5;
    for (var i = 0; i < leaves; i++) {
        var lx = x + (w * (i + 0.5)) / leaves;
        var ang = i % 2 === 0 ? -1.1 : 1.1 + Math.PI;
        drawPanelLeaf(ctx, lx, y + h / 2, 14, ang, palette_1.PALETTE.leafMid, seedIndex + 10 + i, false);
    }
    if (label.length > 0) {
        (0, theme_1.textPlain)(ctx, label, x + w / 2, y + h / 2 + 1, theme_1.FONT.badge, palette_1.PALETTE.creamMist, 'center', 'bold');
    }
}
/** 雾气揭幕（面板入场 0.2~0.3s 的淡入 + 缩放由各场景自己控制缩放）。 */
function drawRevealVeil(ctx, progress, seedIndex) {
    var inv = 1 - (0, ease_1.clamp01)(progress);
    if (inv <= 0.001)
        return;
    var box = (0, screen_1.sceneBox)();
    ctx.save();
    ctx.globalAlpha = inv * 0.55;
    ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.9);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = inv * 0.4;
    for (var i = 0; i < 4; i++) {
        var y = 80 + i * 170 + Math.sin(i * 2.3 + progress * 3) * 18;
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.skyWarm, 0.5);
        ctx.fillRect(box.x - 30, y, box.w + 60, 42 + (i % 2) * 22);
    }
    (0, brush_1.paperGrain)(ctx, box.x, box.y, box.w, box.h, inv * 0.05, seedIndex);
    ctx.restore();
}
/** 底部小字提示（余额不足抖动提示等）。 */
function drawToast(ctx, text, alpha, seedIndex) {
    if (alpha <= 0.02)
        return;
    var w = 460;
    var h = 52;
    var x = exports.SCREEN.W / 2 - w / 2;
    var y = exports.SCREEN.H - 86;
    ctx.save();
    ctx.globalAlpha = alpha;
    drawWoodPlate(ctx, x, y, w, h, { radius: 20, base: palette_1.PALETTE.berry, seedIndex: seedIndex, grain: false });
    (0, theme_1.textOutlined)(ctx, text, exports.SCREEN.W / 2, y + h / 2 + 1, theme_1.FONT.entry, palette_1.PALETTE.creamMist, 'center', 2);
    ctx.restore();
}
/**
 * 画一只 Q 版小动物。`size` = 整体高度（像素，建议 72~170）。
 * 骨架固定（大头 + 小身体 + 短腿），物种差异只体现在耳朵、尾巴、斑纹与附属件。
 */
function drawCreature(ctx, sp, cx, cy, size, time, opts) {
    var o = opts || {};
    var u = size / 100;
    var face = o.facing === undefined ? 1 : o.facing;
    var def = species_1.SPECIES[sp];
    var sil = !!o.silhouette;
    var theme = sil ? (0, palette_1.tint)(palette_1.PALETTE.inkSoft, 0.52, palette_1.PALETTE.forestDeep) : def.theme;
    var belly = sil ? theme : (0, palette_1.tint)(def.theme, 0.60, palette_1.PALETTE.paper);
    var deep = sil ? theme : (0, palette_1.tint)(def.theme, 0.30, palette_1.PALETTE.twilight);
    var ink = palette_1.PALETTE.inkSoft;
    var groundY = cy + 44 * u + (0, ease_1.bob)(time, 0.5, 2.4 * u);
    var bw = 30 * u;
    var bh = 24 * u;
    var bodyY = groundY - 26 * u;
    var headR = 29 * u;
    var headY = bodyY - bh * 0.92 - headR * 0.34;
    var seed = 300 + (sp.length * 7);
    ctx.save();
    (0, paint_1.drawSoftGroundShadow)(ctx, cx, groundY + 2 * u, 30 * u, seed);
    // ---- 尾巴（在身体之后画） ----
    if (!sil) {
        if (sp === 'mouse') {
            (0, brush_1.strokeInk)(ctx, [
                { x: cx - face * bw * 0.9, y: bodyY + 4 * u },
                { x: cx - face * (bw + 26) * u * 1.0, y: bodyY + 20 * u },
                { x: cx - face * (bw + 34) * u, y: bodyY - 6 * u },
            ], { width: 3.4 * u, color: (0, palette_1.tint)(palette_1.PALETTE.blossom, 0.2, palette_1.PALETTE.bark), seedIndex: seed + 1 });
        }
        else if (sp === 'cat') {
            (0, brush_1.strokeInk)(ctx, [
                { x: cx - face * bw * 0.86, y: bodyY + 6 * u },
                { x: cx - face * (bw + 20) * u, y: bodyY - 8 * u },
                { x: cx - face * (bw + 32) * u, y: bodyY - 26 * u },
            ], { width: 5 * u, color: deep, seedIndex: seed + 2 });
        }
        else if (sp === 'elephant' || sp === 'lion' || sp === 'tiger' || sp === 'leopard' || sp === 'wolf' || sp === 'dog') {
            (0, brush_1.strokeInk)(ctx, [
                { x: cx - face * bw * 0.84, y: bodyY + 4 * u },
                { x: cx - face * (bw + 22) * u, y: bodyY - 2 * u },
                { x: cx - face * (bw + 28) * u, y: bodyY - 22 * u },
            ], { width: 5.4 * u, color: deep, seedIndex: seed + 3 });
        }
    }
    // ---- 四条短腿 ----
    for (var i = 0; i < 4; i++) {
        var lx = cx + (i < 2 ? -1 : 1) * bw * (i % 2 === 0 ? 0.62 : 0.28);
        var leg = roundPts(lx - 6.5 * u, bodyY + bh * 0.42, 13 * u, 17 * u, 5 * u);
        fillPanel(ctx, leg, deep, { alpha: 0.94, layers: 2, wetEdge: true, seedIndex: seed + 10 + i });
        (0, brush_1.strokeInk)(ctx, leg, { width: 2.2 * u, close: true, seedIndex: seed + 14 + i });
    }
    // ---- 身体 ----
    var body = ellipsePts(cx, bodyY, bw, bh, 22);
    fillPanel(ctx, body, theme, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seed + 20 });
    var chest = ellipsePts(cx + face * 3 * u, bodyY + 4 * u, bw * 0.52, bh * 0.56, 18);
    fillPanel(ctx, chest, belly, { alpha: 0.85, layers: 1, wetEdge: false, seedIndex: seed + 21 });
    (0, brush_1.strokeInk)(ctx, body, { width: 2.8 * u, close: true, seedIndex: seed + 22 });
    // 斑纹（虎：条纹；豹：环斑）
    if (!sil && (sp === 'tiger' || sp === 'leopard')) {
        for (var i = 0; i < 3; i++) {
            var sx = cx - face * bw * 0.62 + face * i * bw * 0.34;
            if (sp === 'tiger') {
                (0, brush_1.strokeInk)(ctx, [
                    { x: sx, y: bodyY - bh * 0.72 },
                    { x: sx + face * 5 * u, y: bodyY - bh * 0.2 },
                ], { width: 3 * u, color: ink, jitter: 0.8, seedIndex: seed + 30 + i });
            }
            else {
                var ring = ellipsePts(sx, bodyY + (i % 2 === 0 ? -bh * 0.3 : bh * 0.2), 5 * u, 4 * u, 10);
                (0, brush_1.strokeInk)(ctx, ring, { width: 1.8 * u, close: true, color: ink, seedIndex: seed + 34 + i });
            }
        }
    }
    // ---- 耳朵 / 鬃毛（在头部之后，头先画） ----
    var earY = headY - headR * 0.62;
    // 头部
    var head = ellipsePts(cx, headY, headR, headR * 0.94, 24);
    fillPanel(ctx, head, theme, { alpha: 0.97, layers: 2, wetEdge: true, seedIndex: seed + 40 });
    // 狮子鬃毛：一圈叶片
    if (!sil && sp === 'lion') {
        for (var i = 0; i < 14; i++) {
            var a = (i / 14) * Math.PI * 2;
            var len = 30 * u + (i % 3) * 3 * u;
            drawPanelLeaf(ctx, cx + Math.cos(a) * headR * 0.9, headY + Math.sin(a) * headR * 0.86, len, a, i % 2 === 0 ? palette_1.PALETTE.sunset : palette_1.PALETTE.barkLight, seed + 50 + i, false);
        }
    }
    if (!sil) {
        if (sp === 'elephant' || sp === 'mouse') {
            var ex = 26 * u;
            for (var i = 0; i < 2; i++) {
                var sgn = i === 0 ? -1 : 1;
                var ear = ellipsePts(cx + sgn * ex, earY + 4 * u, 17 * u, 17 * u, 16);
                fillPanel(ctx, ear, deep, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed + 60 + i });
                var inner = ellipsePts(cx + sgn * ex, earY + 4 * u, 10 * u, 10 * u, 14);
                fillPanel(ctx, inner, (0, palette_1.tint)(palette_1.PALETTE.blossom, 0.35, palette_1.PALETTE.paper), {
                    alpha: 0.55, layers: 1, wetEdge: false, seedIndex: seed + 62 + i,
                });
                (0, brush_1.strokeInk)(ctx, ear, { width: 2.4 * u, close: true, seedIndex: seed + 64 + i });
            }
        }
        else if (sp === 'wolf') {
            for (var i = 0; i < 2; i++) {
                var sgn = i === 0 ? -1 : 1;
                var tri = [
                    { x: cx + sgn * 14 * u, y: earY + 6 * u },
                    { x: cx + sgn * 22 * u, y: earY - 16 * u },
                    { x: cx + sgn * 30 * u, y: earY + 8 * u },
                ];
                fillPanel(ctx, tri, deep, { alpha: 0.95, layers: 2, wetEdge: false, seedIndex: seed + 66 + i });
                (0, brush_1.strokeInk)(ctx, tri, { width: 2.2 * u, close: true, seedIndex: seed + 68 + i });
            }
        }
        else if (sp === 'dog') {
            for (var i = 0; i < 2; i++) {
                var sgn = i === 0 ? -1 : 1;
                drawPanelLeaf(ctx, cx + sgn * 24 * u, earY + 16 * u, 46 * u, sgn > 0 ? Math.PI * 0.62 : Math.PI * 0.38, deep, seed + 70 + i, true);
            }
        }
        else {
            // 猫科小三角耳
            for (var i = 0; i < 2; i++) {
                var sgn = i === 0 ? -1 : 1;
                var tri = [
                    { x: cx + sgn * 10 * u, y: earY + 10 * u },
                    { x: cx + sgn * 19 * u, y: earY - 14 * u },
                    { x: cx + sgn * 27 * u, y: earY + 10 * u },
                ];
                fillPanel(ctx, tri, theme, { alpha: 0.96, layers: 2, wetEdge: false, seedIndex: seed + 72 + i });
                var inner = [
                    { x: cx + sgn * 14 * u, y: earY + 7 * u },
                    { x: cx + sgn * 19 * u, y: earY - 7 * u },
                    { x: cx + sgn * 24 * u, y: earY + 7 * u },
                ];
                fillPanel(ctx, inner, (0, palette_1.tint)(palette_1.PALETTE.blossom, 0.3, palette_1.PALETTE.paper), {
                    alpha: 0.6, layers: 1, wetEdge: false, seedIndex: seed + 74 + i,
                });
                (0, brush_1.strokeInk)(ctx, tri, { width: 2.2 * u, close: true, seedIndex: seed + 76 + i });
            }
        }
    }
    (0, brush_1.strokeInk)(ctx, head, { width: 2.8 * u, close: true, seedIndex: seed + 80 });
    if (sil) {
        ctx.restore();
        return;
    }
    // ---- 五官 ----
    var eyeY = headY - 2 * u;
    var eyeX = 10.5 * u;
    for (var i = 0; i < 2; i++) {
        var sgn = i === 0 ? -1 : 1;
        var ex = cx + sgn * eyeX;
        ctx.save();
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(ex, eyeY, 3.1 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.9);
        ctx.beginPath();
        ctx.arc(ex + 1.1 * u, eyeY - 1.2 * u, 1.1 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 腮红
        var blush = ellipsePts(cx + sgn * 20 * u, eyeY + 9 * u, 6.5 * u, 4.4 * u, 12);
        fillPanel(ctx, blush, palette_1.PALETTE.blossom, { alpha: 0.42, layers: 1, wetEdge: false, seedIndex: seed + 90 + i });
    }
    // 口鼻
    var muzzle = ellipsePts(cx, headY + 12 * u, 13 * u, 10 * u, 16);
    fillPanel(ctx, muzzle, (0, palette_1.tint)(theme, 0.72, palette_1.PALETTE.paper), {
        alpha: 0.92, layers: 1, wetEdge: false, seedIndex: seed + 94,
    });
    (0, brush_1.strokeInk)(ctx, muzzle, { width: 2 * u, close: true, seedIndex: seed + 95 });
    // 鼻 + 嘴
    var nose = [
        { x: cx - 3.4 * u, y: headY + 8.4 * u },
        { x: cx + 3.4 * u, y: headY + 8.4 * u },
        { x: cx, y: headY + 11.6 * u },
    ];
    fillPanel(ctx, nose, ink, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seed + 96 });
    (0, brush_1.strokeInk)(ctx, nose, { width: 1.6 * u, close: true, seedIndex: seed + 97 });
    (0, brush_1.strokeInk)(ctx, [
        { x: cx - 5 * u, y: headY + 13 * u },
        { x: cx - 1 * u, y: headY + 15 * u },
        { x: cx, y: headY + 13 * u },
        { x: cx + 1 * u, y: headY + 15 * u },
        { x: cx + 5 * u, y: headY + 13 * u },
    ], { width: 1.8 * u, jitter: 0.5, seedIndex: seed + 98 });
    // 物种专属件
    if (sp === 'elephant') {
        // 象鼻
        var trunk = [];
        for (var i = 0; i <= 8; i++) {
            var t = i / 8;
            trunk.push({ x: cx + Math.sin(t * 2.1) * 6 * u, y: headY + 16 * u + t * 26 * u });
        }
        (0, brush_1.strokeInk)(ctx, trunk, { width: 9 * u, color: deep, jitter: 0.8, seedIndex: seed + 100 });
        (0, brush_1.strokeInk)(ctx, trunk, { width: 2 * u, jitter: 1.0, seedIndex: seed + 101 });
        // 象牙
        for (var i = 0; i < 2; i++) {
            var sgn = i === 0 ? -1 : 1;
            var tusk = [
                { x: cx + sgn * 8 * u, y: headY + 15 * u },
                { x: cx + sgn * 13 * u, y: headY + 22 * u },
                { x: cx + sgn * 10 * u, y: headY + 25 * u },
            ];
            fillPanel(ctx, tusk, palette_1.PALETTE.paper, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: seed + 102 + i });
            (0, brush_1.strokeInk)(ctx, tusk, { width: 1.6 * u, close: true, seedIndex: seed + 104 + i });
        }
    }
    else if (sp === 'cat') {
        for (var i = 0; i < 3; i++) {
            var wy = headY + 10 * u + i * 3.4 * u;
            (0, brush_1.strokeInk)(ctx, [{ x: cx + 14 * u, y: wy }, { x: cx + 30 * u, y: wy - 3 * u }], {
                width: 1.4 * u, jitter: 0.4, seedIndex: seed + 110 + i,
            });
            (0, brush_1.strokeInk)(ctx, [{ x: cx - 14 * u, y: wy }, { x: cx - 30 * u, y: wy - 3 * u }], {
                width: 1.4 * u, jitter: 0.4, seedIndex: seed + 114 + i,
            });
        }
    }
    else if (sp === 'dog') {
        var tongue = ellipsePts(cx, headY + 17 * u, 4.6 * u, 6 * u, 12);
        fillPanel(ctx, tongue, palette_1.PALETTE.blossom, { alpha: 0.88, layers: 1, wetEdge: false, seedIndex: seed + 120 });
        (0, brush_1.strokeInk)(ctx, tongue, { width: 1.6 * u, close: true, seedIndex: seed + 121 });
    }
    else if (sp === 'wolf') {
        var fluff = ellipsePts(cx, bodyY + 8 * u, bw * 0.46, bh * 0.5, 16);
        fillPanel(ctx, fluff, (0, palette_1.tint)(palette_1.PALETTE.paper, 0.35, theme), {
            alpha: 0.6, layers: 1, wetEdge: false, seedIndex: seed + 124,
        });
    }
    else if (sp === 'tiger') {
        for (var i = 0; i < 2; i++) {
            var sgn = i === 0 ? -1 : 1;
            (0, brush_1.strokeInk)(ctx, [
                { x: cx + sgn * 6 * u, y: headY - headR * 0.78 },
                { x: cx + sgn * 12 * u, y: headY - headR * 0.46 },
            ], { width: 2.6 * u, color: ink, jitter: 0.6, seedIndex: seed + 126 + i });
        }
    }
    ctx.restore();
}
/** 画一张动物卡：牛皮纸底 + 木框 + 立绘 + 名称条 + 费用圆牌。 */
function drawAnimalCard(ctx, x, y, w, h, sp, state, t, seedIndex) {
    var st = state || {};
    var press = st.press === undefined ? 0 : st.press;
    var def = species_1.SPECIES[sp];
    var grow = 1 + press * 0.05;
    var cw = w * grow;
    var ch = h * grow;
    var cx0 = x - (cw - w) / 2;
    var cy0 = y - (ch - h) / 2;
    var r = layout_1.LAYOUT.CARD.radius;
    // 卡面纸底 + 木框
    var cardPts = roundPts(cx0, cy0, cw, ch, r);
    (0, brush_1.dropShadow)(ctx, cx0, cy0, cw, ch, r, seedIndex);
    fillPanel(ctx, cardPts, palette_1.PALETTE.paper, { alpha: 0.98, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
    (0, paint_1.woodGrain)(ctx, cx0 + 5, cy0 + 5, cw - 10, ch - 10, seedIndex + 2);
    (0, brush_1.strokeInk)(ctx, cardPts, { width: 3, close: true, seedIndex: seedIndex + 3 });
    var frame = roundPts(cx0 + 5, cy0 + 5, cw - 10, ch - 10, r - 3);
    (0, brush_1.strokeInk)(ctx, frame, { width: 1.8, jitter: 1.0, seedIndex: seedIndex + 4 });
    // 四角小叶
    drawPanelLeaf(ctx, cx0 + 8, cy0 + 8, 17, Math.PI * 0.75, palette_1.PALETTE.leafMid, seedIndex + 5, false);
    drawPanelLeaf(ctx, cx0 + cw - 8, cy0 + 8, 17, Math.PI * 0.25, palette_1.PALETTE.leafMid, seedIndex + 6, false);
    // 立绘
    drawCreature(ctx, sp, cx0 + cw / 2, cy0 + ch * 0.42, ch * 0.44, t, { silhouette: st.locked });
    // 名称条
    var nameH = Math.max(24, ch * 0.17);
    var nameY = cy0 + ch - nameH - 6;
    var namePts = roundPts(cx0 + 7, nameY, cw - 14, nameH, 11);
    fillPanel(ctx, namePts, palette_1.PALETTE.barkLight, { alpha: 0.97, layers: 2, wetEdge: true, seedIndex: seedIndex + 10 });
    (0, paint_1.woodGrain)(ctx, cx0 + 12, nameY + 3, cw - 24, nameH - 6, seedIndex + 11);
    (0, brush_1.strokeInk)(ctx, namePts, { width: 2.4, close: true, seedIndex: seedIndex + 12 });
    var nameText = st.locked ? '？？？' : def.cn;
    var nameSize = (0, theme_1.fitSize)(ctx, nameText, cw - 26, theme_1.FONT.h2, 14);
    (0, theme_1.textOutlined)(ctx, nameText, cx0 + cw / 2, nameY + nameH / 2 + 1, nameSize, palette_1.PALETTE.inkSoft, 'center', 2);
    // 费用圆牌（左上，sunbeam 底）
    var cr = Math.max(11, cw * 0.10);
    var chipCx = cx0 + cr + 7;
    var chipCy = cy0 + cr + 7;
    var chip = (0, brush_1.arcPoints)(chipCx, chipCy, cr, 0, Math.PI * 2, 16);
    fillPanel(ctx, chip, palette_1.PALETTE.sunbeam, { alpha: 0.97, layers: 2, wetEdge: false, seedIndex: seedIndex + 20 });
    (0, brush_1.strokeInk)(ctx, chip, { width: 2.2, close: true, seedIndex: seedIndex + 21 });
    (0, theme_1.textPlain)(ctx, '' + def.cost, chipCx, chipCy + 1, cr * 1.25, palette_1.PALETTE.inkSoft, 'center', 'bold');
    if (st.locked) {
        // 灰色剪影 + 手绘锁 + 迷雾
        ctx.save();
        ctx.globalAlpha = 0.5;
        var veil = roundPts(cx0 + 3, cy0 + 3, cw - 6, ch - 6, r - 2);
        fillPanel(ctx, veil, (0, palette_1.tint)(palette_1.PALETTE.inkSoft, 0.55, palette_1.PALETTE.creamMist), {
            alpha: 0.7, layers: 1, wetEdge: false, seedIndex: seedIndex + 30,
        });
        ctx.restore();
        drawLock(ctx, cx0 + cw - 22, cy0 + 22, 13, seedIndex + 31);
    }
    if (st.selected) {
        // 选中：一圈 sunbeam 光点缓慢旋转（§7.5 可购买反馈的同款语言）
        var ringPts = roundPts(cx0 - 5, cy0 - 5, cw + 10, ch + 10, r + 4);
        (0, brush_1.strokeInk)(ctx, ringPts, { width: 3.4, color: palette_1.PALETTE.sunbeam, jitter: 1.6, seedIndex: seedIndex + 40 });
        for (var i = 0; i < 6; i++) {
            var a = (i / 6) * Math.PI * 2 + t / 1400;
            (0, paint_1.drawSparkle)(ctx, cx0 + cw / 2 + Math.cos(a) * (cw * 0.56), cy0 + ch / 2 + Math.sin(a) * (ch * 0.54), 5 + (i % 3), palette_1.PALETTE.sunbeam, 0.5);
        }
    }
}
/** 手绘小锁（未解锁格子）。 */
function drawLock(ctx, cx, cy, r, seedIndex) {
    var body = roundPts(cx - r, cy - r * 0.2, r * 2, r * 1.5, r * 0.4);
    fillPanel(ctx, body, (0, palette_1.tint)(palette_1.PALETTE.soil, 0.25, palette_1.PALETTE.bark), {
        alpha: 0.95, layers: 2, wetEdge: false, seedIndex: seedIndex,
    });
    (0, brush_1.strokeInk)(ctx, body, { width: 2.4, close: true, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, [
        { x: cx - r * 0.55, y: cy - r * 0.24 },
        { x: cx - r * 0.55, y: cy - r * 0.72 },
        { x: cx, y: cy - r * 1.05 },
        { x: cx + r * 0.55, y: cy - r * 0.72 },
        { x: cx + r * 0.55, y: cy - r * 0.24 },
    ], { width: 2.4, jitter: 0.7, seedIndex: seedIndex + 2 });
    var hole = ellipsePts(cx, cy + r * 0.34, r * 0.22, r * 0.3, 10);
    fillPanel(ctx, hole, palette_1.PALETTE.inkSoft, { alpha: 0.85, layers: 1, wetEdge: false, seedIndex: seedIndex + 3 });
}
/* =========================================================================
 * 五、卡组页场景
 * ========================================================================= */
var CARD_W = 124;
var CARD_H = 172;
var GRID_X = 110;
var GRID_Y = 106;
var GRID_GAP_X = 16;
var GRID_GAP_Y = 12;
var PANEL_X = 556;
var PANEL_Y = 106;
var PANEL_W = 664;
var PANEL_H = 540;
var BTN_X = 490;
var BTN_Y = 656;
var BTN_W = 300;
var BTN_H = 52;
var BACK_X = 26;
var BACK_Y = 24;
var BACK_SIZE = 60;
var DeckScene = /** @class */ (function () {
    function DeckScene() {
        this.name = 'deck';
        this.t = 0;
        this.t0 = -1;
        this.enterMs = 0;
        /** 当前选中的卡（0..7） */
        this.sel = 2;
        this.hover = -1;
        this.press = '';
        this.pressMs = 0;
        this.modal = false;
        this.modalOkActive = false;
    }
    DeckScene.prototype.enter = function () {
        this.t0 = -1;
        this.enterMs = 0;
        this.press = '';
        this.modal = false;
    };
    DeckScene.prototype.tick = function (logicTime) {
        this.t = logicTime;
        if (this.t0 < 0)
            this.t0 = logicTime;
        this.enterMs = logicTime - this.t0;
        if (this.press !== '' && this.pressMs > 0)
            this.pressMs -= 50;
    };
    DeckScene.prototype.render = function (ctx, renderTime) {
        var t = renderTime;
        var save = (0, storage_1.loadSave)();
        var p = (0, ease_1.clamp01)(this.enterMs / 260);
        var s = 0.94 + 0.06 * (0, ease_1.easeOutCubic)(p);
        var cx = exports.SCREEN.W / 2;
        var cy = exports.SCREEN.H / 2;
        drawScreenBase(ctx, t, 700);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
        // 顶部
        drawBackButton(ctx, BACK_X, BACK_Y, BACK_SIZE, this.press === 'back', 730);
        drawTitlePlate(ctx, exports.SCREEN.W / 2, 18, 360, 76, '我的卡组', 760);
        drawCurrencyChips(ctx, 34, t, save, 800);
        // 3×3 卡位（8 只动物 + 1 个未解锁位）——动物牌一律贴用户原图卡面（100% 还原）
        var cardScale = CARD_W / layout_1.LAYOUT.CARD.w;
        for (var i = 0; i < 9; i++) {
            var col = i % 3;
            var row = Math.floor(i / 3);
            var x = GRID_X + col * (CARD_W + GRID_GAP_X);
            var y = GRID_Y + row * (CARD_H + GRID_GAP_Y);
            if (i < species_1.SPECIES_ORDER.length) {
                var sp = species_1.SPECIES_ORDER[i];
                var def = species_1.SPECIES[sp];
                var press = this.press === 'card' + i ? (0, ease_1.clamp01)(this.pressMs / 200) : 0;
                (0, card_1.drawCard)(ctx, {
                    kind: 'animal', cn: def.cn, cost: def.cost, species: sp,
                    level: 1, quality: 1, atk: def.atk, atkInterval: def.atkInterval, hp: def.hp,
                    traitName: def.traitName, traitDesc: def.traitDesc,
                }, x, y, {
                    time: t, scale: cardScale, affordable: true,
                    selected: this.sel === i, pressed: press > 0,
                });
            }
            else {
                drawAnimalCard(ctx, x, y, CARD_W, CARD_H, species_1.SPECIES_ORDER[0], { locked: true }, t, 860 + i * 7);
            }
        }
        // 右侧详情面板
        this.drawDetailPanel(ctx, t);
        // 底部按钮
        drawWoodButton(ctx, BTN_X, BTN_Y, BTN_W, BTN_H, '编辑卡组', this.press === 'edit', 1200);
        ctx.restore();
        drawRevealVeil(ctx, p, 1240);
        if (this.modal)
            this.drawModal(ctx);
    };
    /** 右侧：当前选中动物的立绘与完整数值（数值全部读 SPECIES）。 */
    DeckScene.prototype.drawDetailPanel = function (ctx, t) {
        var sp = species_1.SPECIES_ORDER[this.sel];
        var def = species_1.SPECIES[sp];
        var x = PANEL_X;
        var y = PANEL_Y;
        var w = PANEL_W;
        var h = PANEL_H;
        drawWoodPlate(ctx, x, y, w, h, { radius: layout_1.LAYOUT.PANEL_RADIUS, base: palette_1.PALETTE.paper, seedIndex: 1300 });
        (0, brush_1.paperGrain)(ctx, x + 8, y + 8, w - 16, h - 16, 0.04, 1302);
        // 立绘
        var artX = x + 132;
        var artY = y + 152;
        var ring = (0, brush_1.arcPoints)(artX, artY + 6, 96, 0, Math.PI * 2, 26);
        fillPanel(ctx, ring, (0, palette_1.tint)(def.theme, 0.72, palette_1.PALETTE.creamMist), {
            alpha: 0.55, layers: 2, wetEdge: true, seedIndex: 1304,
        });
        (0, brush_1.strokeInk)(ctx, ring, { width: 2.4, close: true, seedIndex: 1305 });
        var petImg = (0, assets_1.getImage)('unit-' + sp);
        if (petImg) {
            var ph = 182;
            ctx.drawImage(petImg, artX - ph / 2, artY + 6 - ph / 2, ph, ph);
        }
        else {
            drawCreature(ctx, sp, artX, artY, 168, t);
        }
        // 名称 + 费用
        var nameX = x + 268;
        (0, theme_1.textOutlined)(ctx, def.cn, nameX, y + 66, theme_1.FONT.h1, palette_1.PALETTE.forestDeep, 'left', 2.4);
        var chip = (0, brush_1.arcPoints)(nameX + 116, y + 64, 26, 0, Math.PI * 2, 16);
        fillPanel(ctx, chip, palette_1.PALETTE.sunbeam, { alpha: 0.97, layers: 2, wetEdge: false, seedIndex: 1306 });
        (0, brush_1.strokeInk)(ctx, chip, { width: 2.4, close: true, seedIndex: 1307 });
        (0, theme_1.textPlain)(ctx, '' + def.cost, nameX + 116, y + 65, theme_1.FONT.h2, palette_1.PALETTE.inkSoft, 'center', 'bold');
        (0, theme_1.textPlain)(ctx, '费用', nameX + 152, y + 66, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.85), 'left', 'normal');
        // 数值行
        var statY = y + 118;
        var stats = [
            { label: '战力序', value: '' + def.power },
            { label: '生命', value: '' + def.hp },
            { label: '攻击', value: '' + def.atk },
            { label: '攻速', value: def.atkInterval.toFixed(2) + 's' },
        ];
        for (var i = 0; i < stats.length; i++) {
            var bx = nameX + i * 96;
            var badge = roundPts(bx, statY - 20, 88, 40, 16);
            fillPanel(ctx, badge, palette_1.PALETTE.meadow, { alpha: 0.8, layers: 1, wetEdge: false, seedIndex: 1310 + i });
            (0, brush_1.strokeInk)(ctx, badge, { width: 2, close: true, seedIndex: 1314 + i });
            (0, theme_1.textPlain)(ctx, stats[i].value, bx + 44, statY - 6, theme_1.FONT.entry, palette_1.PALETTE.forestDeep, 'center', 'bold');
            (0, theme_1.textPlain)(ctx, stats[i].label, bx + 44, statY + 12, theme_1.FONT.badge - 3, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.8), 'center', 'normal');
        }
        // 特技
        var trY = y + 194;
        var trPlate = roundPts(nameX - 14, trY, w - 268 - 40, 108, 18);
        fillPanel(ctx, trPlate, (0, palette_1.tint)(palette_1.PALETTE.leafMid, 0.86, palette_1.PALETTE.creamMist), {
            alpha: 0.85, layers: 2, wetEdge: true, seedIndex: 1320,
        });
        (0, brush_1.strokeInk)(ctx, trPlate, { width: 2.4, close: true, seedIndex: 1321 });
        drawPanelLeaf(ctx, nameX + 4, trY + 22, 22, Math.PI * 0.85, palette_1.PALETTE.leafMid, 1322, false);
        (0, theme_1.textOutlined)(ctx, '特技 · ' + def.traitName, nameX + 24, trY + 24, theme_1.FONT.body, palette_1.PALETTE.forestDeep, 'left', 2);
        (0, theme_1.wrapText)(ctx, def.traitDesc, nameX + 4, trY + 60, w - 300, theme_1.FONT.badge + 1, 24, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.9), 'left', 3);
        // 克制关系（§6 闭环，学克制系统的入口）
        var cY = y + 318;
        var cw = w - 268 - 40;
        (0, theme_1.textPlain)(ctx, '克制闭环', nameX, cY, theme_1.FONT.badge + 2, palette_1.PALETTE.forestDeep, 'left', 'bold');
        var beats = species_1.SPECIES[species_1.COUNTER[sp]];
        var loses = species_1.SPECIES[(0, species_1.counteredBy)(sp)];
        var box = roundPts(nameX, cY + 16, cw, 122, 18);
        fillPanel(ctx, box, (0, palette_1.tint)(palette_1.PALETTE.sunbeam, 0.72, palette_1.PALETTE.paper), {
            alpha: 0.7, layers: 1, wetEdge: false, seedIndex: 1330,
        });
        (0, brush_1.strokeInk)(ctx, box, { width: 2.2, close: true, seedIndex: 1331 });
        // 中间是当前宠物：左＝克制我的，右＝我克制的。箭头方向就是克制方向。
        var sY = cY + 56;
        var cX = nameX + 178;
        var lX = nameX + 46;
        var rX = nameX + 310;
        var spImg = (0, assets_1.getImage)('unit-' + sp);
        var beatsImg = (0, assets_1.getImage)('unit-' + beats.id);
        var losesImg = (0, assets_1.getImage)('unit-' + loses.id);
        if (losesImg)
            ctx.drawImage(losesImg, lX - 24, sY - 24, 48, 48);
        else
            drawCreature(ctx, loses.id, lX, sY, 40, t);
        if (spImg)
            ctx.drawImage(spImg, cX - 32, sY - 32, 64, 64);
        else
            drawCreature(ctx, sp, cX, sY, 52, t);
        if (beatsImg)
            ctx.drawImage(beatsImg, rX - 24, sY - 24, 48, 48);
        else
            drawCreature(ctx, beats.id, rX, sY, 40, t);
        // 左箭头指向中间（谁克制我），右箭头由中间指出（我克制谁）
        (0, brush_1.strokeInk)(ctx, [{ x: lX + 34, y: sY + 2 }, { x: lX + 62, y: sY - 8 }, { x: lX + 90, y: sY + 2 }], { width: 2.6, jitter: 0.8, color: palette_1.PALETTE.berry, seedIndex: 1332 });
        (0, brush_1.strokeInk)(ctx, [{ x: cX + 44, y: sY + 2 }, { x: cX + 70, y: sY - 8 }, { x: cX + 96, y: sY + 2 }], { width: 2.6, jitter: 0.8, color: palette_1.PALETTE.forestDeep, seedIndex: 1333 });
        (0, theme_1.textPlain)(ctx, loses.cn, lX, sY + 38, theme_1.FONT.badge - 2, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.85), 'center', 'bold');
        (0, theme_1.textPlain)(ctx, def.cn, cX, sY + 46, theme_1.FONT.badge - 2, palette_1.PALETTE.inkSoft, 'center', 'bold');
        (0, theme_1.textPlain)(ctx, beats.cn, rX, sY + 38, theme_1.FONT.badge - 2, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.85), 'center', 'bold');
        (0, theme_1.textPlain)(ctx, '左：克制我的（伤害 ×0.75）　右：我克制的（伤害 ×1.5）', nameX + cw / 2, cY + 120, theme_1.FONT.badge - 3, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.85), 'center', 'normal');
        // 页脚说明
        (0, theme_1.textPlain)(ctx, '本作 8 物种全解锁：卡组编辑用于装扮用途，暂仅展示。', x + w / 2, y + h - 26, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8), 'center', 'normal');
    };
    /** 「编辑卡组」的手绘提示弹窗。 */
    DeckScene.prototype.drawModal = function (ctx) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.55);
        var mbox = (0, screen_1.sceneBox)();
        ctx.fillRect(mbox.x, mbox.y, mbox.w, mbox.h);
        ctx.restore();
        var w = 560;
        var h = 268;
        var x = exports.SCREEN.W / 2 - w / 2;
        var y = exports.SCREEN.H / 2 - h / 2 - 14;
        drawWoodPlate(ctx, x, y, w, h, { radius: 28, base: palette_1.PALETTE.paper, seedIndex: 1400 });
        drawPanelLeaf(ctx, x + 26, y + 28, 30, Math.PI * 0.8, palette_1.PALETTE.leafMid, 1401, true);
        drawPanelLeaf(ctx, x + w - 26, y + 28, 30, Math.PI * 0.2, palette_1.PALETTE.leafMid, 1402, true);
        (0, theme_1.textOutlined)(ctx, '卡组编辑', exports.SCREEN.W / 2, y + 52, theme_1.FONT.h2, palette_1.PALETTE.forestDeep, 'center', 2.4);
        (0, theme_1.wrapText)(ctx, '本作采用 8 物种全解锁的设计：出战阵容在战斗内的集市阶段用阳光现场购买与合成。' +
            '这里的卡组编辑只用于装扮与展示，暂仅展示。', exports.SCREEN.W / 2, y + 116, w - 80, theme_1.FONT.body - 1, 30, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.9), 'center', 4);
        drawWoodButton(ctx, exports.SCREEN.W / 2 - 110, y + h - 76, 220, 54, '知道了', this.modalOkActive, 1410);
    };
    /** 卡位命中判定（返回 0..8，-1 未命中）。 */
    DeckScene.prototype.hitCard = function (x, y) {
        for (var i = 0; i < 9; i++) {
            var col = i % 3;
            var row = Math.floor(i / 3);
            var cxp = GRID_X + col * (CARD_W + GRID_GAP_X);
            var cyp = GRID_Y + row * (CARD_H + GRID_GAP_Y);
            if (inRect(x, y, cxp, cyp, CARD_W, CARD_H))
                return i;
        }
        return -1;
    };
    DeckScene.prototype.gesture = function (e) {
        if (e.type === 'move') {
            this.hover = this.hitCard(e.x, e.y);
            if (this.modal)
                this.modalOkActive = inRect(e.x, e.y, exports.SCREEN.W / 2 - 110, exports.SCREEN.H / 2 - 14 + 134 - 76, 220, 54);
            return;
        }
        if (e.type === 'down') {
            if (this.modal) {
                this.modalOkActive = inRect(e.x, e.y, exports.SCREEN.W / 2 - 110, exports.SCREEN.H / 2 - 14 + 134 - 76, 220, 54);
                return;
            }
            if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE))
                this.press = 'back';
            else if (inRect(e.x, e.y, BTN_X, BTN_Y, BTN_W, BTN_H))
                this.press = 'edit';
            else {
                var idx_1 = this.hitCard(e.x, e.y);
                this.press = idx_1 >= 0 ? 'card' + idx_1 : '';
            }
            this.pressMs = 200;
            return;
        }
        if (e.type !== 'up' || e.wasDrag)
            return;
        var was = this.press;
        this.press = '';
        if (this.modal) {
            var ok = inRect(e.x, e.y, exports.SCREEN.W / 2 - 110, exports.SCREEN.H / 2 - 14 + 134 - 76, 220, 54);
            if (ok) {
                (0, audio_1.playSfx)('tap');
                this.modal = false;
            }
            return;
        }
        if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) {
            (0, audio_1.playSfx)('tap');
            popScene();
            return;
        }
        if (inRect(e.x, e.y, BTN_X, BTN_Y, BTN_W, BTN_H)) {
            (0, audio_1.playSfx)('cardPick');
            this.modal = true;
            return;
        }
        var idx = this.hitCard(e.x, e.y);
        if (idx >= 0) {
            if (idx < species_1.SPECIES_ORDER.length) {
                this.sel = idx;
                (0, audio_1.playSfx)('tap');
            }
            else {
                (0, audio_1.playSfx)('reject');
            }
            return;
        }
        if (was !== '')
            this.pressMs = 0;
    };
    return DeckScene;
}());
exports.DeckScene = DeckScene;
/** 返回上一场景（走 manager 的 pop，带纸页淡出）。 */
function popScene() {
    (0, manager_1.pop)();
}
/** 卡组页工厂。 */
function createDeckScene() {
    return new DeckScene();
}
