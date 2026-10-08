"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardSize = cardSize;
exports.drawCostCoin = drawCostCoin;
exports.drawQualityMark = drawQualityMark;
exports.drawBuffIcon = drawBuffIcon;
exports.drawCounterRing = drawCounterRing;
exports.drawCardBack = drawCardBack;
exports.drawCard = drawCard;
/**
 * 卡牌渲染（§7.5）：牛皮纸 + 手绘木框 + 四角叶藤，费用圆牌 / 品质花纹 / 半身动物 /
 * 木牌名称条 / 图标数字行 / 克制关系环 / 特性说明。
 *
 * 天气牌不走木框：按天气给角落染色并用云、光、雨丝做软边；
 * 加成牌左上带「指定」手绘标签；不可购买 = 灰雾 + 费用闪红；可购买 = 右下阳光点旋转。
 */
var layout_1 = require("../config/layout");
var palette_1 = require("../config/palette");
var species_1 = require("../config/species");
var weather_1 = require("../config/weather");
var brush_1 = require("../ui/brush");
var ease_1 = require("../ui/ease");
var theme_1 = require("../ui/theme");
var paint_1 = require("./paint");
var assets_1 = require("./assets");
var unit_1 = require("./unit");
var forest_1 = require("./forest");
var TAU = Math.PI * 2;
/** 卡牌基准尺寸（与 LAYOUT.CARD 同步）。 */
function cardSize() {
    return { w: layout_1.LAYOUT.CARD.w, h: layout_1.LAYOUT.CARD.h };
}
function rectPts(x, y, w, h) {
    return [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ];
}
function tagColor(tag) {
    if (tag === 'atk')
        return palette_1.PALETTE.berry;
    if (tag === 'def')
        return palette_1.PALETTE.forestMid;
    return palette_1.PALETTE.stream;
}
/* ------------------------------------------------------------------ */
/* 零件                                                                */
/* ------------------------------------------------------------------ */
/** 费用圆牌：太阳圆盘 + 手绘数字（不可购买时闪红）。 */
function drawCostCoin(ctx, cx, cy, r, cost, time, flash) {
    var t = time === undefined ? 0 : time;
    var pulse = flash ? 0.5 + 0.5 * Math.sin(t / 60) : 0;
    ctx.save();
    // 太阳光刺
    ctx.globalAlpha = 0.85;
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * TAU + t / 2600;
        ctx.save();
        ctx.strokeStyle = (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.75);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2));
        ctx.lineTo(cx + Math.cos(a) * (r + 8), cy + Math.sin(a) * (r + 8));
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
    // 圆盘
    ctx.save();
    var pts = [];
    for (var i = 0; i < 18; i++) {
        var a = (i / 18) * TAU;
        var k = 1 + (0, brush_1.noiseAt)(i, 31) * 0.06;
        pts.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
    }
    (0, brush_1.fillWatercolor)(ctx, pts, flash ? (0, palette_1.tint)(palette_1.PALETTE.berry, 0.3, palette_1.PALETTE.sunbeam) : palette_1.PALETTE.sunbeam, {
        alpha: 0.98, layers: 2, wetEdge: true, seedIndex: 32,
    });
    (0, brush_1.strokeInk)(ctx, pts, { width: 2.6, close: true, seedIndex: 33, jitter: 0.9 });
    ctx.restore();
    if (pulse > 0.02) {
        ctx.save();
        ctx.globalAlpha = pulse * 0.5;
        (0, brush_1.strokeInk)(ctx, pts, { width: 3, close: true, color: palette_1.PALETTE.berry, seedIndex: 34, jitter: 1.4 });
        ctx.restore();
    }
    (0, theme_1.textOutlined)(ctx, '' + cost, cx, cy + r * 0.42, r * 1.5, palette_1.PALETTE.inkSoft, 'center', 0);
}
/** 品质花纹：花瓣数 = 等级（1~3）。 */
function drawQualityMark(ctx, cx, cy, r, level, seedIndex) {
    var n = Math.max(1, Math.min(3, Math.round(level)));
    var seed = seedIndex === undefined ? 0 : seedIndex;
    ctx.save();
    var petals = 5;
    for (var i = 0; i < petals; i++) {
        var a = (i / petals) * TAU - Math.PI / 2;
        var px = cx + Math.cos(a) * r * 0.62;
        var py = cy + Math.sin(a) * r * 0.62;
        var p = [];
        for (var k = 0; k < 12; k++) {
            var b = (k / 12) * TAU;
            p.push({ x: px + Math.cos(b) * r * 0.44 * (1 + (0, brush_1.noiseAt)(k, seed + i) * 0.08), y: py + Math.sin(b) * r * 0.34 });
        }
        (0, brush_1.fillWatercolor)(ctx, p, n >= 3 ? palette_1.PALETTE.berry : n === 2 ? palette_1.PALETTE.forestMid : palette_1.PALETTE.leafMid, {
            alpha: 0.92, layers: 1, seedIndex: seed + i * 3,
        });
        (0, brush_1.strokeInk)(ctx, p, { width: 1.6, close: true, seedIndex: seed + i * 5, jitter: 0.7 });
    }
    // 花心
    var c = [];
    for (var i = 0; i < 12; i++) {
        var a = (i / 12) * TAU;
        c.push({ x: cx + Math.cos(a) * r * 0.3, y: cy + Math.sin(a) * r * 0.3 });
    }
    (0, brush_1.fillWatercolor)(ctx, c, palette_1.PALETTE.sunbeam, { alpha: 0.95, layers: 1, seedIndex: seed + 9 });
    (0, brush_1.strokeInk)(ctx, c, { width: 1.6, close: true, seedIndex: seed + 11, jitter: 0.6 });
    // 等级点
    ctx.restore();
}
/** 加成牌小图标（按 tag 分三种母题，全部手绘）。 */
function drawBuffIcon(ctx, cx, cy, r, buff, tag, seedIndex) {
    var seed = seedIndex === undefined ? 0 : seedIndex;
    void buff;
    var color = tagColor(tag);
    ctx.save();
    // 圆底
    var disc = [];
    for (var i = 0; i < 14; i++) {
        var a = (i / 14) * TAU;
        disc.push({ x: cx + Math.cos(a) * r * (1 + (0, brush_1.noiseAt)(i, seed) * 0.07), y: cy + Math.sin(a) * r * (1 + (0, brush_1.noiseAt)(i + 3, seed) * 0.07) });
    }
    (0, brush_1.fillWatercolor)(ctx, disc, palette_1.PALETTE.creamMist, { alpha: 0.95, layers: 1, seedIndex: seed + 1 });
    (0, brush_1.strokeInk)(ctx, disc, { width: 1.8, close: true, color: color, seedIndex: seed + 2, jitter: 0.7 });
    if (tag === 'atk') {
        for (var i = -1; i <= 1; i++) {
            (0, brush_1.strokeInk)(ctx, [
                { x: cx + i * r * 0.34, y: cy - r * 0.5 },
                { x: cx + i * r * 0.34 + r * 0.2, y: cy + r * 0.5 },
            ], { width: 2.2, color: color, seedIndex: seed + 5 + i });
        }
    }
    else if (tag === 'def') {
        var shield = [
            { x: cx - r * 0.45, y: cy - r * 0.42 },
            { x: cx + r * 0.45, y: cy - r * 0.42 },
            { x: cx + r * 0.34, y: cy + r * 0.36 },
            { x: cx, y: cy + r * 0.58 },
            { x: cx - r * 0.34, y: cy + r * 0.36 },
        ];
        (0, brush_1.fillWatercolor)(ctx, shield, (0, palette_1.tint)(color, 0.35, palette_1.PALETTE.leafLight), { alpha: 0.95, layers: 1, seedIndex: seed + 6 });
        (0, brush_1.strokeInk)(ctx, shield, { width: 1.8, close: true, color: color, seedIndex: seed + 7 });
    }
    else {
        (0, paint_1.drawVine)(ctx, [
            { x: cx - r * 0.4, y: cy + r * 0.3 },
            { x: cx, y: cy - r * 0.4 },
            { x: cx + r * 0.42, y: cy + r * 0.28 },
        ], seed + 8, { width: 2.2, leafEvery: 10, leafLen: r * 0.5, color: color });
    }
    ctx.restore();
}
/** 克制关系环：左 = 被我克制的物种，右 = 克制我的物种（两端都要画，§7.5 强制）。 */
function drawCounterRing(ctx, x, y, w, h, species) {
    ctx.save();
    // 木牌底
    var bar = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, bar, palette_1.PALETTE.barkLight, { alpha: 0.95, layers: 1, wetEdge: true, seedIndex: 71 });
    (0, paint_1.woodGrain)(ctx, x, y, w, h, 72);
    (0, brush_1.strokeInk)(ctx, bar, { width: 2.2, close: true, seedIndex: 73, jitter: 0.8 });
    // 两端藤叶
    (0, paint_1.drawVine)(ctx, [{ x: x + 3, y: y + h / 2 }, { x: x + 16, y: y + h / 2 }], 74, { width: 2, leafEvery: 8, leafLen: 7 });
    (0, paint_1.drawVine)(ctx, [{ x: x + w - 3, y: y + h / 2 }, { x: x + w - 16, y: y + h / 2 }], 75, { width: 2, leafEvery: 8, leafLen: 7 });
    // 双向箭头
    var cy = y + h / 2;
    var ax = x + w * 0.5;
    var half = w * 0.17;
    (0, brush_1.strokeInk)(ctx, [
        { x: ax - half, y: cy },
        { x: ax + half, y: cy },
    ], { width: 2.6, color: palette_1.PALETTE.bark, seedIndex: 76 });
    for (var i = -1; i <= 1; i += 2) {
        (0, brush_1.strokeInk)(ctx, [
            { x: ax + i * half, y: cy },
            { x: ax + i * (half - 6), y: cy - 5 },
            { x: ax + i * (half - 6), y: cy + 5 },
        ], { width: 2.2, color: palette_1.PALETTE.bark, seedIndex: 77 + i });
    }
    // 两端物种小像
    var ox = x + w * 0.22;
    (0, unit_1.drawSpeciesSilhouette)(ctx, preyOf(species), ox, cy, h * 0.62, palette_1.PALETTE.forestMid, 0.9);
    var dx = x + w * 0.78;
    (0, unit_1.drawSpeciesSilhouette)(ctx, (0, species_1.counteredBy)(species), dx, cy, h * 0.62, palette_1.PALETTE.twilight, 0.9);
    ctx.restore();
}
/** 被我克制的物种（COUNTER 表的正向前驱）。 */
function preyOf(species) {
    var all = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'mouse'];
    for (var i = 0; i < all.length; i++) {
        if ((0, species_1.counteredBy)(all[i]) === species)
            return all[i];
    }
    return 'mouse';
}
/** 卡背：牛皮纸 + 藤结 + 爪印（洗牌/未解锁用）。 */
function drawCardBack(ctx, x, y, w, h, time) {
    var ww = w === undefined ? layout_1.LAYOUT.CARD.w : w;
    var hh = h === undefined ? layout_1.LAYOUT.CARD.h : h;
    var t = time === undefined ? 0 : time;
    ctx.save();
    (0, paint_1.paperBase)(ctx, x, y, ww, hh, palette_1.PALETTE.barkLight, 0.95, 81);
    var inner = rectPts(x + 8, y + 8, ww - 16, hh - 16);
    (0, brush_1.fillWatercolor)(ctx, inner, palette_1.PALETTE.creamMist, { alpha: 0.9, layers: 1, seedIndex: 82 });
    (0, brush_1.strokeInk)(ctx, inner, { width: 2.2, close: true, seedIndex: 83, jitter: 0.9 });
    var cx = x + ww / 2;
    var cy = y + hh / 2;
    (0, paint_1.drawVine)(ctx, [
        { x: cx - ww * 0.22, y: cy + hh * 0.16 },
        { x: cx, y: cy - hh * 0.06 + Math.sin(t / 900) * 2 },
        { x: cx + ww * 0.22, y: cy + hh * 0.16 },
    ], 84, { width: 3, leafEvery: 14, leafLen: 12, color: palette_1.PALETTE.forestMid });
    // 爪印
    var pr = Math.min(ww, hh) * 0.09;
    (0, brush_1.fillWatercolor)(ctx, [
        { x: cx - pr, y: cy + pr * 0.4 },
        { x: cx, y: cy + pr * 1.5 },
        { x: cx + pr, y: cy + pr * 0.4 },
        { x: cx + pr * 0.4, y: cy - pr * 0.2 },
        { x: cx - pr * 0.4, y: cy - pr * 0.2 },
    ], palette_1.PALETTE.bark, { alpha: 0.85, layers: 1, seedIndex: 85 });
    ctx.restore();
}
/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */
function drawAnimalArt(ctx, card, artX, artY, artW, artH, time, seed) {
    var species = card.species || 'mouse';
    var level = card.level === undefined ? 1 : card.level;
    // 画框内的林间小景
    ctx.save();
    (0, brush_1.roundRectPath)(ctx, artX, artY, artW, artH, 10, 1.2, seed + 3);
    ctx.clip();
    (0, brush_1.fillWatercolor)(ctx, rectPts(artX, artY, artW, artH), palette_1.PALETTE.skyWarm, { alpha: 0.85, layers: 1, seedIndex: seed + 4 });
    (0, brush_1.fillWatercolor)(ctx, rectPts(artX, artY + artH * 0.55, artW, artH * 0.45), palette_1.PALETTE.moss, { alpha: 0.8, layers: 1, wetEdge: true, seedIndex: seed + 5 });
    // 光斑
    (0, paint_1.drawSunMote)(ctx, artX + artW * 0.3, artY + artH * 0.3, artW * 0.09, 0.35);
    (0, paint_1.drawSunMote)(ctx, artX + artW * 0.72, artY + artH * 0.22, artW * 0.06, 0.28);
    ctx.restore();
    // 半身动物：允许溢出画框 12px（§7.5）
    var size = artH * 0.78;
    var bodyR = species_1.SPECIES[species].bodyRadius;
    var scale = size / (bodyR * 2.4);
    (0, unit_1.drawSpeciesCreature)(ctx, species, level, artX + artW * 0.5, artY + artH + layout_1.LAYOUT.CARD.overflow * 0.4, scale, time, {
        seedIndex: seed + 9,
    });
    // 画框描边（压在动物之上，形成「溢出画框」的错觉）
    ctx.save();
    var fr = rectPts(artX, artY, artW, artH);
    (0, brush_1.strokeInk)(ctx, fr, { width: 2.4, close: true, seedIndex: seed + 11, jitter: 0.9 });
    ctx.restore();
}
function drawStatsRow(ctx, card, x, y, w, h, seed) {
    var cells = 3;
    var cw = w / cells;
    var cx0 = x + cw * 0.5;
    var label = layout_1.LAYOUT.FONT.badge;
    var value = layout_1.LAYOUT.FONT.entry;
    // 剑 / 沙漏 / 心
    var iconY = y + h * 0.34;
    var numY = y + h * 0.82;
    for (var i = 0; i < cells; i++) {
        var cx = cx0 + i * cw;
        if (i === 0) {
            (0, brush_1.strokeInk)(ctx, [{ x: cx - 8, y: iconY + 8 }, { x: cx + 6, y: iconY - 7 }], { width: 3.2, color: palette_1.PALETTE.forestMid, seedIndex: seed + i * 4 });
            (0, brush_1.strokeInk)(ctx, [{ x: cx - 10, y: iconY + 1 }, { x: cx - 3, y: iconY + 8 }], { width: 2.4, color: palette_1.PALETTE.forestMid, seedIndex: seed + i * 4 + 1 });
        }
        else if (i === 1) {
            var g = [
                { x: cx - 8, y: iconY - 8 },
                { x: cx + 8, y: iconY - 8 },
                { x: cx, y: iconY + 10 },
            ];
            (0, brush_1.strokeInk)(ctx, g, { width: 2.4, close: true, color: palette_1.PALETTE.bark, seedIndex: seed + i * 4 + 2 });
        }
        else {
            var heart = [
                { x: cx - 9, y: iconY - 2 },
                { x: cx - 4, y: iconY - 8 },
                { x: cx, y: iconY - 2 },
                { x: cx + 4, y: iconY - 8 },
                { x: cx + 9, y: iconY - 2 },
                { x: cx, y: iconY + 10 },
            ];
            (0, brush_1.fillWatercolor)(ctx, heart, palette_1.PALETTE.blossom, { alpha: 0.9, layers: 1, seedIndex: seed + i * 4 + 3 });
        }
    }
    // 数字
    var atk = card.atk === undefined ? 0 : card.atk;
    var spd = card.atkInterval === undefined ? 0 : card.atkInterval;
    var hp = card.hp === undefined ? 0 : card.hp;
    (0, theme_1.textOutlined)(ctx, '攻', cx0 - cw * 0.22, y + h * 0.42, label, palette_1.PALETTE.inkSoft, 'center', 0);
    (0, theme_1.textOutlined)(ctx, '' + Math.round(atk), cx0 + cw * 0.16, y + h * 0.46, value, palette_1.PALETTE.inkSoft, 'center', 0);
    (0, theme_1.textOutlined)(ctx, '速', cx0 + cw * 0.8, y + h * 0.42, label, palette_1.PALETTE.inkSoft, 'center', 0);
    (0, theme_1.textOutlined)(ctx, (spd >= 1 ? spd.toFixed(2) : spd.toFixed(2)) + 's', cx0 + cw * 1.16, y + h * 0.46, label, palette_1.PALETTE.inkSoft, 'center', 0);
    (0, theme_1.textOutlined)(ctx, '血', cx0 + cw * 1.78, y + h * 0.42, label, palette_1.PALETTE.inkSoft, 'center', 0);
    (0, theme_1.textOutlined)(ctx, '' + Math.round(hp), cx0 + cw * 2.16, y + h * 0.46, value, palette_1.PALETTE.inkSoft, 'center', 0);
    void numY;
}
function drawTextBlock(ctx, lines, colors, x, y, w, lineH) {
    for (var i = 0; i < lines.length; i++) {
        var size = (0, theme_1.fitSize)(ctx, lines[i], w, layout_1.LAYOUT.FONT.badge, 12);
        (0, theme_1.textPlain)(ctx, lines[i], x, y + i * lineH + size * 0.62, size, colors[i] || palette_1.PALETTE.inkSoft, 'left');
    }
}
/**
 * 用户原图卡面：直接把 `assets/cards/card-<species>.jpg` 铺满卡位。
 * 源图 336×464 与卡位 168×232 严格同比例（0.7241），无变形、无拉伸，
 * 木框 / 费用太阳牌 / 品质花饰 / 名称木牌 / 攻速血图标 / 克制关系环 /
 * 特性说明全部来自原图，因此与用户目标图逐像素一致。
 * 本函数只叠加「原图里不可能预先烘死」的动态元素：等级角标、不可购买、选中。
 */
function drawArtCardFace(ctx, card, x, y, w, h, img, o, seed, time) {
    var level = card.level === undefined ? 1 : card.level;
    var affordable = o.affordable === undefined ? true : o.affordable;
    var radius = layout_1.LAYOUT.CARD.radius * (w / layout_1.LAYOUT.CARD.w);
    ctx.save();
    (0, brush_1.roundRectPath)(ctx, x, y, w, h, radius, 1.0, seed + 90);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    if (!affordable) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = palette_1.PALETTE.creamMist;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
    }
    ctx.restore();
    // 等级角标（L2 藤蔓护腕 / L3 花冠）：压在原图右上品质花饰上
    if (level >= 2) {
        var bw = Math.round(w * 0.4);
        var bh = Math.round(22 * (w / layout_1.LAYOUT.CARD.w));
        var bx = x + w - bw - Math.round(9 * (w / layout_1.LAYOUT.CARD.w));
        var by = y + Math.round(8 * (w / layout_1.LAYOUT.CARD.w));
        var pts = rectPts(bx, by, bw, bh);
        (0, brush_1.fillWatercolor)(ctx, pts, level >= 3 ? palette_1.PALETTE.sunbeam : palette_1.PALETTE.leafLight, {
            alpha: 0.96, layers: 1, wetEdge: true, seedIndex: seed + 91,
        });
        (0, brush_1.strokeInk)(ctx, pts, { width: 2.2, close: true, seedIndex: seed + 92, jitter: 0.8 });
        (0, theme_1.textOutlined)(ctx, 'Lv.' + level, bx + bw / 2, by + bh * 0.72, bh * 0.66, palette_1.PALETTE.inkSoft, 'center', 0);
    }
    // 不可购买：灰雾 + 费用红闪（原图费用不能改，所以用整卡红框闪烁提示）
    if (!affordable) {
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.22 * (0.5 + 0.5 * Math.sin(time / 120));
        (0, brush_1.strokeInk)(ctx, rectPts(x, y, w, h), {
            width: 3.4, close: true, color: palette_1.PALETTE.berry, seedIndex: seed + 93, jitter: 1.2,
        });
        ctx.restore();
    }
    if (o.selected) {
        ctx.save();
        ctx.globalAlpha = 0.72;
        (0, brush_1.strokeInk)(ctx, rectPts(x - 4, y - 4, w + 8, h + 8), {
            width: 3.4, close: true, color: palette_1.PALETTE.sunbeam, seedIndex: seed + 94, jitter: 1.4,
        });
        ctx.restore();
    }
}
/**
 * 天气牌卡面：美术区取自用户集市目标图里烘死的天气卡（`assets/cards/weather-*.jpg`，
 * 190×173 与卡位美术区 156×142 同比例 1.098 → 无变形），木框 / 费用太阳牌 / 名称木牌 /
 * 两行效果文字由渲染层实时绘制，所以文案永远等于 `src/config/weather.ts`（含 我方/敌方 首行）。
 * 「阴 · 薄雾」没有独立烘死美术，用晴的美术叠一层雾色。
 */
function drawWeatherCardFace(ctx, card, x, y, w, h, img, o, seed, time) {
    var u = w / layout_1.LAYOUT.CARD.w;
    var affordable = o.affordable === undefined ? true : o.affordable;
    var radius = layout_1.LAYOUT.CARD.radius * u;
    var artX = x + 8 * u;
    var artY = y + 8 * u;
    var artW = w - 16 * u;
    var artH = 142 * u;
    // 木框底
    (0, paint_1.paperBase)(ctx, x, y, w, h, palette_1.PALETTE.barkLight, 0.98, seed);
    (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 1);
    (0, brush_1.strokeInk)(ctx, rectPts(x, y, w, h), { width: theme_1.STROKE, close: true, seedIndex: seed + 4, jitter: 1.1 });
    // 美术区
    var artPts = (0, brush_1.roundedRectPoints)(artX, artY, artW, artH, Math.max(2, radius - 3 * u));
    ctx.save();
    (0, brush_1.tracePath)(ctx, artPts, true);
    ctx.clip();
    ctx.drawImage(img, artX, artY, artW, artH);
    if (card.weather === 'misty') {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = palette_1.PALETTE.moss;
        ctx.fillRect(artX, artY, artW, artH);
        ctx.restore();
    }
    ctx.restore();
    (0, brush_1.strokeInk)(ctx, artPts, { width: 2.4 * u, close: true, seedIndex: seed + 3, jitter: 0.9 });
    // 费用太阳牌
    drawCostCoin(ctx, x + 26 * u, y + 28 * u, 21 * u, card.cost, time, o.pressed === true && !affordable);
    // 名称木牌
    var nameX = x + 14 * u;
    var nameY = y + 154 * u;
    var nameW = w - 28 * u;
    var nameH = 26 * u;
    var nameBar = rectPts(nameX, nameY, nameW, nameH);
    (0, brush_1.fillWatercolor)(ctx, nameBar, palette_1.PALETTE.barkLight, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: seed + 30 });
    (0, paint_1.woodGrain)(ctx, nameX, nameY, nameW, nameH, seed + 31);
    (0, brush_1.strokeInk)(ctx, nameBar, { width: 2.6 * u, close: true, seedIndex: seed + 32, jitter: 0.9 });
    var nameSize = (0, theme_1.fitSize)(ctx, card.cn, nameW - 22 * u, layout_1.LAYOUT.FONT.cardName, layout_1.LAYOUT.FONT.badge);
    (0, theme_1.textPlain)(ctx, card.cn, x + w / 2, nameY + nameH * 0.74, nameSize, palette_1.PALETTE.inkSoft, 'center');
    // 两行效果（实时取自配置）——基线写死，保证无论缩放都不出卡
    var lines = weatherLines(card);
    var fsize = Math.max(11, Math.round(16.5 * u));
    var s1 = (0, theme_1.fitSize)(ctx, lines[0], w - 30 * u, fsize, 10);
    (0, theme_1.textPlain)(ctx, lines[0], x + 15 * u, y + 203 * u, s1, palette_1.PALETTE.forestMid, 'left');
    var s2 = (0, theme_1.fitSize)(ctx, lines[1], w - 30 * u, fsize, 10);
    (0, theme_1.textPlain)(ctx, lines[1], x + 15 * u, y + 224 * u, s2, palette_1.PALETTE.berry, 'left');
    // 不可购买：灰雾 + 红框闪
    if (!affordable) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = palette_1.PALETTE.creamMist;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 0.3 + 0.22 * (0.5 + 0.5 * Math.sin(time / 120));
        (0, brush_1.strokeInk)(ctx, rectPts(x, y, w, h), { width: 3.4, close: true, color: palette_1.PALETTE.berry, seedIndex: seed + 93, jitter: 1.2 });
        ctx.restore();
    }
    if (o.selected) {
        ctx.save();
        ctx.globalAlpha = 0.72;
        (0, brush_1.strokeInk)(ctx, rectPts(x - 4, y - 4, w + 8, h + 8), { width: 3.4, close: true, color: palette_1.PALETTE.sunbeam, seedIndex: seed + 94, jitter: 1.4 });
        ctx.restore();
    }
}
function drawCard(ctx, card, x, y, opts) {
    var o = opts || {};
    var time = o.time === undefined ? 0 : o.time;
    var scale = o.scale === undefined ? 1 : o.scale;
    var alpha = o.alpha === undefined ? 1 : o.alpha;
    var w = layout_1.LAYOUT.CARD.w;
    var h = layout_1.LAYOUT.CARD.h;
    var r = layout_1.LAYOUT.CARD.radius;
    var affordable = o.affordable === undefined ? true : o.affordable;
    var seed = (card.species ? card.species.length : 1) * 17 + (card.cost * 7) + (card.cn.length * 3);
    var shake = o.pressed ? Math.sin(time / 42) * 4 : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (o.drag) {
        ctx.translate(x + w / 2 + shake, y + h / 2);
        ctx.rotate(Math.sin(time / 260) * 0.035);
        ctx.scale(scale, scale);
        ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    else if (scale !== 1) {
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);
    }
    else {
        ctx.translate(shake, 0);
    }
    // 动物牌：优先贴用户原图卡面（100% 还原），缺图时回落到下面的程序化手绘。
    var artImg = card.kind === 'animal' ? (0, assets_1.getImage)('card-' + (card.species || 'mouse')) : undefined;
    if (artImg) {
        drawArtCardFace(ctx, card, x, y, w, h, artImg, o, seed, time);
        ctx.restore();
        return;
    }
    // 天气牌：美术取自用户集市目标图裁出的天气卡美术区，木框/名牌/效果行由渲染层实时绘制。
    if (card.kind === 'weather') {
        var wImg = (0, assets_1.getImage)(card.weather === 'rainy' ? 'weather-rainy' : 'weather-sunny');
        if (wImg) {
            drawWeatherCardFace(ctx, card, x, y, w, h, wImg, o, seed, time);
            ctx.restore();
            return;
        }
    }
    var isWeather = card.kind === 'weather';
    // 底 + 框
    if (isWeather) {
        (0, paint_1.paperBase)(ctx, x, y, w, h, palette_1.PALETTE.paper, 0.98, seed);
        var tintKey = (0, forest_1.weatherTint)(card.weather || 'sunny');
        // 角落染色 + 软边
        ctx.save();
        (0, brush_1.roundRectPath)(ctx, x, y, w, h, r, 1.2, seed + 2);
        ctx.clip();
        (0, brush_1.fillWatercolor)(ctx, rectPts(x - 10, y - 10, w + 20, h * 0.42), tintKey, { alpha: 0.5, layers: 2, wetEdge: true, seedIndex: seed + 3 });
        if (card.weather === 'rainy') {
            for (var i = 0; i < 5; i++) {
                var rx = x + 12 + i * (w - 24) / 4;
                (0, brush_1.strokeInk)(ctx, [{ x: rx, y: y + 8 }, { x: rx - 6, y: y + 40 }], { width: 1.8, color: palette_1.PALETTE.stream, seedIndex: seed + 40 + i });
            }
        }
        else if (card.weather === 'misty') {
            (0, paint_1.drawCloud)(ctx, x + w * 0.5, y + 30, w * 0.8, 30, palette_1.PALETTE.creamMist, 0.55, seed + 44);
        }
        else if (card.weather === 'thunder') {
            (0, brush_1.strokeInk)(ctx, [{ x: x + w * 0.6, y: y + 8 }, { x: x + w * 0.48, y: y + 34 }, { x: x + w * 0.62, y: y + 30 }, { x: x + w * 0.5, y: y + 56 }], { width: 2.4, color: palette_1.PALETTE.sunbeam, seedIndex: seed + 45 });
        }
        else {
            (0, paint_1.drawSunMote)(ctx, x + w * 0.7, y + 34, 13, 0.5);
        }
        ctx.restore();
        var fr = rectPts(x, y, w, h);
        (0, brush_1.strokeInk)(ctx, fr, { width: 3, close: true, seedIndex: seed + 4, jitter: 1.0 });
    }
    else {
        (0, paint_1.paperBase)(ctx, x, y, w, h, palette_1.PALETTE.barkLight, 0.98, seed);
        (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 1);
        // 内层牛皮纸
        var inner = rectPts(x + 9, y + 9, w - 18, h - 18);
        (0, brush_1.fillWatercolor)(ctx, inner, palette_1.PALETTE.paper, { alpha: 0.97, layers: 1, seedIndex: seed + 2 });
        ctx.save();
        (0, brush_1.roundRectPath)(ctx, x + 9, y + 9, w - 18, h - 18, r - 6, 1.0, seed + 5);
        ctx.clip();
        (0, brush_1.strokeInk)(ctx, inner, { width: 2.2, close: true, seedIndex: seed + 6, jitter: 0.9 });
        ctx.restore();
        var fr = rectPts(x, y, w, h);
        (0, brush_1.strokeInk)(ctx, fr, { width: theme_1.STROKE, close: true, seedIndex: seed + 7, jitter: 1.1 });
        // 四角叶片藤蔓
        (0, paint_1.drawLeaf)(ctx, x + 16, y + 16, 16, -0.7, palette_1.PALETTE.leafMid, seed + 8);
        (0, paint_1.drawLeaf)(ctx, x + w - 16, y + 16, 16, 0.7, palette_1.PALETTE.leafMid, seed + 9);
        (0, paint_1.drawLeaf)(ctx, x + 16, y + h - 16, 16, 0.9, palette_1.PALETTE.leafMid, seed + 10);
        (0, paint_1.drawLeaf)(ctx, x + w - 16, y + h - 16, 16, -0.9, palette_1.PALETTE.leafMid, seed + 11);
    }
    var artX = x + 12;
    var artY = y + 12;
    var artW = w - 24;
    var artH = Math.round(h * layout_1.LAYOUT.CARD.artRatio) - 6;
    if (card.kind === 'animal') {
        drawAnimalArt(ctx, card, artX, artY, artW, artH, time, seed);
    }
    else if (card.kind === 'buff') {
        // 加成牌：中央大图标
        var tag = card.tag || 'atk';
        drawBuffIcon(ctx, artX + artW * 0.5, artY + artH * 0.48, artH * 0.30, card.buff || 'sharpClaw', tag, seed + 20);
        // 左上「指定」手绘标签
        var lx = x + 10;
        var ly = y + 74;
        var pointed = [
            { x: lx, y: ly },
            { x: lx + 62, y: ly - 4 },
            { x: lx + 62, y: ly + 20 },
            { x: lx, y: ly + 24 },
        ];
        (0, brush_1.fillWatercolor)(ctx, pointed, palette_1.PALETTE.sunbeam, { alpha: 0.95, layers: 1, seedIndex: seed + 21 });
        (0, brush_1.strokeInk)(ctx, pointed, { width: 2, close: true, seedIndex: seed + 22, jitter: 0.8 });
        (0, brush_1.strokeInk)(ctx, [{ x: lx + 66, y: ly + 10 }, { x: lx + 82, y: ly + 10 }], { width: 2.2, color: palette_1.PALETTE.inkSoft, seedIndex: seed + 23 });
        (0, theme_1.textOutlined)(ctx, '指定', lx + 31, ly + 17, layout_1.LAYOUT.FONT.badge, palette_1.PALETTE.inkSoft, 'center', 0);
    }
    else {
        (0, paint_1.drawSunMote)(ctx, artX + artW * 0.5, artY + artH * 0.5, artH * 0.3, 0.4);
    }
    // 名称木条（加成牌的美术区只是一个中央图标，名条位置上移，给两行效果留足空间）
    var isBuff = card.kind === 'buff';
    var nameY = isBuff ? y + 140 : y + 9 + Math.round(h * layout_1.LAYOUT.CARD.artRatio);
    var nameW = isBuff ? w - 34 : w - 28;
    var nameH = isBuff ? 28 : 32;
    var nameBar = rectPts(x + (w - nameW) / 2, nameY, nameW, nameH);
    (0, brush_1.fillWatercolor)(ctx, nameBar, palette_1.PALETTE.barkLight, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: seed + 30 });
    (0, paint_1.woodGrain)(ctx, x + (w - nameW) / 2, nameY, nameW, nameH, seed + 31);
    (0, brush_1.strokeInk)(ctx, nameBar, { width: 2.6, close: true, seedIndex: seed + 32, jitter: 0.9 });
    (0, paint_1.drawLeaf)(ctx, x + 20, nameY + nameH / 2, 12, -0.6, palette_1.PALETTE.leafMid, seed + 33);
    (0, paint_1.drawLeaf)(ctx, x + w - 20, nameY + nameH / 2, 12, Math.PI + 0.6, palette_1.PALETTE.leafMid, seed + 34);
    var nameSize = (0, theme_1.fitSize)(ctx, card.cn, nameW - 30, layout_1.LAYOUT.FONT.cardName, layout_1.LAYOUT.FONT.badge);
    // 浅木名牌必须用深字（奶油填充 + 奶油描边会在浅底上糊成一团）
    (0, theme_1.textOutlined)(ctx, card.cn, x + w / 2, nameY + nameH * 0.72, nameSize, palette_1.PALETTE.inkSoft, 'center', 2, palette_1.PALETTE.creamMist);
    // 费用圆牌 + 品质纹
    drawCostCoin(ctx, x + 26, y + 28, 21, card.cost, time, o.pressed && !affordable);
    if (card.kind === 'animal') {
        drawQualityMark(ctx, x + w - 26, y + 26, 15, card.quality === undefined ? card.level || 1 : card.quality, seed + 36);
    }
    // 说明区
    var infoY = nameY + nameH + 6;
    if (card.kind === 'animal') {
        drawStatsRow(ctx, card, x + 16, infoY, w - 32, 42, seed + 50);
        var counterY = infoY + 44;
        drawCounterRing(ctx, x + 20, counterY, w - 40, 26, card.species || 'mouse');
        var trait = card.traitName && card.traitDesc ? card.traitName + '：' + card.traitDesc : card.traitName || '';
        if (trait) {
            var ts = (0, theme_1.fitSize)(ctx, trait, w - 40, layout_1.LAYOUT.FONT.badge, 12);
            (0, theme_1.textPlain)(ctx, trait, x + w / 2, y + h - 10, ts, palette_1.PALETTE.inkSoft, 'center');
        }
    }
    else if (card.kind === 'weather') {
        var lines = weatherLines(card);
        var colors = [palette_1.PALETTE.forestMid, palette_1.PALETTE.forestMid, palette_1.PALETTE.berry, palette_1.PALETTE.berry];
        drawTextBlock(ctx, lines, colors, x + 20, infoY + 2, w - 40, 24);
    }
    else {
        var d = card.desc || ['——', '——'];
        // 两行效果写死基线 + 最小字号 10，保证再长的文案也不出卡
        var bw = w - 26;
        var f1 = (0, theme_1.fitSize)(ctx, d[0] || '', bw, layout_1.LAYOUT.FONT.badge, 10);
        (0, theme_1.textPlain)(ctx, d[0] || '', x + 13, infoY + f1 * 0.66, f1, palette_1.PALETTE.inkSoft, 'left');
        var f2 = (0, theme_1.fitSize)(ctx, d[1] || '', bw, layout_1.LAYOUT.FONT.badge, 10);
        (0, theme_1.textPlain)(ctx, d[1] || '', x + 13, infoY + 19 + f2 * 0.66, f2, palette_1.PALETTE.inkSoft, 'left');
        // 槽位提示：可装备到动物（手绘箭头，落在图标与名牌之间的空档里）
        (0, brush_1.strokeInk)(ctx, [
            { x: x + w * 0.5 - 18, y: y + 132 },
            { x: x + w * 0.5, y: y + 122 },
            { x: x + w * 0.5 + 18, y: y + 132 },
        ], { width: 2.4, color: tagColor(card.tag), seedIndex: seed + 60 });
    }
    // 可购买：右下阳光点旋转；不可购买：灰雾 + 费用闪红
    if (card.kind === 'animal' || card.kind === 'weather' || card.kind === 'buff') {
        if (affordable) {
            var t = (0, ease_1.cycle)(time, 2600, 0);
            for (var i = 0; i < 3; i++) {
                var a = t * TAU + (i / 3) * TAU;
                (0, paint_1.drawSunMote)(ctx, x + w - 22 + Math.cos(a) * 3, y + h - 22 + Math.sin(a) * 3, 2.6, 0.55);
            }
        }
        else {
            ctx.save();
            ctx.globalAlpha = 0.4;
            (0, brush_1.fillWatercolor)(ctx, rectPts(x, y, w, h), palette_1.PALETTE.creamMist, { alpha: 0.85, layers: 1, seedIndex: seed + 70 });
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(time / 120));
            var fr2 = rectPts(x, y, w, h);
            (0, brush_1.strokeInk)(ctx, fr2, { width: 3.4, close: true, color: palette_1.PALETTE.berry, seedIndex: seed + 71, jitter: 1.2 });
            ctx.restore();
        }
    }
    if (o.selected) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        var fr3 = rectPts(x - 4, y - 4, w + 8, h + 8);
        (0, brush_1.strokeInk)(ctx, fr3, { width: 3, close: true, color: palette_1.PALETTE.sunbeam, seedIndex: seed + 80, jitter: 1.4 });
        ctx.restore();
    }
    ctx.restore();
}
/** 天气牌两行文案：直接读 `src/config/weather.ts`（渲染层不再自带一份会过期的副本）。 */
function weatherLines(card) {
    var id = card.weather || 'sunny';
    var def = (0, weather_1.weatherDef)(id);
    if (def)
        return [def.selfLines[0], def.enemyLines[0]];
    var combo = weather_1.WEATHER_COMBOS[id];
    if (combo)
        return [combo.lines[0], combo.lines[1] || combo.lines[0]];
    return ['我方：—', '敌方：—'];
}
