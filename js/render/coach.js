"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STROKE = exports.blobPath = exports.breathe = exports.easeOutCubic = exports.tint = exports.rgba = exports.paperBase = void 0;
exports.drawCoach = drawCoach;
/**
 * 饲养员 NPC：手绘水彩 + 描边，站在我方棋盘左下角（`drawCoach(ctx,306,596,...)`）。
 * (x, y) 是**脚底中心**锚点；角色朝右。
 */
var palette_1 = require("../config/palette");
Object.defineProperty(exports, "rgba", { enumerable: true, get: function () { return palette_1.rgba; } });
Object.defineProperty(exports, "tint", { enumerable: true, get: function () { return palette_1.tint; } });
var brush_1 = require("../ui/brush");
Object.defineProperty(exports, "blobPath", { enumerable: true, get: function () { return brush_1.blobPath; } });
var ease_1 = require("../ui/ease");
Object.defineProperty(exports, "breathe", { enumerable: true, get: function () { return ease_1.breathe; } });
Object.defineProperty(exports, "easeOutCubic", { enumerable: true, get: function () { return ease_1.easeOutCubic; } });
var theme_1 = require("../ui/theme");
Object.defineProperty(exports, "STROKE", { enumerable: true, get: function () { return theme_1.STROKE; } });
var paint_1 = require("./paint");
Object.defineProperty(exports, "paperBase", { enumerable: true, get: function () { return paint_1.paperBase; } });
// 全部由 PALETTE 派生（禁止魔法颜色值，§16）
var SKIN = (0, palette_1.tint)(palette_1.PALETTE.sunset, 0.58, palette_1.PALETTE.creamMist);
var SKIN_DEEP = (0, palette_1.tint)(palette_1.PALETTE.sunset, 0.32, palette_1.PALETTE.soil);
var CLOTH = (0, palette_1.tint)(palette_1.PALETTE.stream, 0.3, palette_1.PALETTE.creamMist);
var CLOTH_DEEP = (0, palette_1.tint)(palette_1.PALETTE.stream, 0.35, palette_1.PALETTE.forestDeep);
var PANT = (0, palette_1.tint)(palette_1.PALETTE.leafMid, 0.45, palette_1.PALETTE.forestMid);
function ellipsePts(cx, cy, rx, ry, n, seed, jag) {
    var pts = [];
    for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2;
        var k = 1 + Math.sin(i * 12.9898 + seed) * 0.5 * jag;
        pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    return pts;
}
function drawCoach(ctx, x, y, state, time) {
    var proud = state === 'proud' || state === 'win';
    var hurt = state === 'hurt' || state === 'lose';
    var breatheY = (0, ease_1.bob)(time, 0.5, 2.4);
    var lean = hurt ? -0.07 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.scale(1, 1);
    // 地面软影
    ctx.save();
    ctx.globalAlpha = 0.2;
    (0, brush_1.fillWatercolor)(ctx, ellipsePts(0, 2, 34, 9, 14, 910, 0.06), palette_1.PALETTE.forestDeep, { alpha: 0.5, layers: 1, seedIndex: 911 });
    ctx.restore();
    var baseY = breatheY;
    ctx.translate(0, baseY);
    // 腿 + 靴
    for (var i = -1; i <= 1; i += 2) {
        var lx = i * 11;
        var leg = [
            { x: lx - 8, y: 0 },
            { x: lx + 8, y: 0 },
            { x: lx + 7, y: -34 },
            { x: lx - 7, y: -34 },
        ];
        (0, brush_1.fillWatercolor)(ctx, leg, PANT, { alpha: 0.97, layers: 1, seedIndex: 920 + i });
        var boot = [
            { x: lx - 11, y: 2 },
            { x: lx + 12, y: 2 },
            { x: lx + 12, y: -8 },
            { x: lx - 11, y: -8 },
        ];
        (0, brush_1.fillWatercolor)(ctx, boot, palette_1.PALETTE.bark, { alpha: 0.98, layers: 1, seedIndex: 930 + i });
        (0, brush_1.strokeInk)(ctx, boot, { width: 2.2, close: true, seedIndex: 934 + i, jitter: 0.9 });
    }
    // 背带裤躯干
    var torso = [
        { x: -20, y: -34 },
        { x: 20, y: -34 },
        { x: 24, y: -78 },
        { x: -24, y: -78 },
    ];
    (0, brush_1.fillWatercolor)(ctx, torso, PANT, { alpha: 0.97, layers: 1, seedIndex: 940 });
    (0, brush_1.strokeInk)(ctx, torso, { width: 2.6, close: true, seedIndex: 941, jitter: 1.0 });
    // 衬衫
    var shirt = [
        { x: -22, y: -78 },
        { x: 22, y: -78 },
        { x: 26, y: -108 },
        { x: -26, y: -108 },
    ];
    (0, brush_1.fillWatercolor)(ctx, shirt, CLOTH, { alpha: 0.97, layers: 1, wetEdge: true, seedIndex: 942 });
    (0, brush_1.strokeInk)(ctx, shirt, { width: 2.6, close: true, seedIndex: 943, jitter: 1.0 });
    // 背带
    for (var i = -1; i <= 1; i += 2) {
        (0, brush_1.strokeInk)(ctx, [
            { x: i * 12, y: -108 },
            { x: i * 14, y: -78 },
        ], { width: 4, color: palette_1.PALETTE.barkLight, seedIndex: 944 + i, jitter: 1.0 });
    }
    // 口袋 + 小铲子挂饰
    (0, paint_1.drawLeaf)(ctx, 0, -60, 14, 1.4, palette_1.PALETTE.leafLight, 946);
    // 手臂：proud 时右上举
    var armAng = proud ? -2.35 : hurt ? -1.15 : -0.32;
    var swing = Math.sin(time / 620) * 0.08;
    for (var i = -1; i <= 1; i += 2) {
        var a = i < 0 ? Math.PI - armAng : armAng + swing * i;
        var sx = i * 22;
        var ex = sx + Math.cos(a) * 34;
        var ey = -100 + Math.sin(a) * 30;
        var arm = [
            { x: sx - 7, y: -104 },
            { x: sx + 7, y: -100 },
            { x: ex + 6, y: ey },
            { x: ex - 6, y: ey },
        ];
        (0, brush_1.fillWatercolor)(ctx, arm, CLOTH_DEEP, { alpha: 0.97, layers: 1, seedIndex: 950 + i });
        (0, brush_1.strokeInk)(ctx, arm, { width: 2.4, close: true, seedIndex: 954 + i, jitter: 0.9 });
        // 手
        (0, brush_1.fillWatercolor)(ctx, ellipsePts(ex, ey + 2, 6.5, 6.5, 10, 958 + i, 0.05), SKIN, { alpha: 1, layers: 1, seedIndex: 960 + i });
    }
    // 头
    var headY = -128;
    (0, brush_1.fillWatercolor)(ctx, ellipsePts(0, headY, 21, 22, 16, 970, 0.04), SKIN, { alpha: 1, layers: 1, seedIndex: 971 });
    (0, brush_1.strokeInk)(ctx, ellipsePts(0, headY, 21, 22, 16, 972, 0.04), { width: 2.4, close: true, seedIndex: 973, jitter: 0.8 });
    // 眼睛
    for (var i = -1; i <= 1; i += 2) {
        var ex = i * 7.5;
        var ey = headY + 1;
        if (proud) {
            (0, brush_1.strokeInk)(ctx, [{ x: ex - 3.4, y: ey }, { x: ex, y: ey + 3.2 }, { x: ex + 3.4, y: ey }], { width: 2, seedIndex: 976 + i, color: palette_1.PALETTE.inkSoft });
        }
        else {
            ctx.save();
            ctx.fillStyle = palette_1.PALETTE.inkSoft;
            ctx.beginPath();
            ctx.arc(ex, ey, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(ex - 0.8, ey - 0.9, 0.8, 0, Math.PI * 2);
            ctx.fillStyle = palette_1.PALETTE.paper;
            ctx.fill();
            ctx.restore();
        }
    }
    // 腮红
    ctx.save();
    ctx.globalAlpha = 0.35;
    (0, brush_1.fillWatercolor)(ctx, ellipsePts(-13, headY + 9, 4.6, 2.8, 10, 980, 0.06), palette_1.PALETTE.blossom, { alpha: 0.6, layers: 1, seedIndex: 981 });
    (0, brush_1.fillWatercolor)(ctx, ellipsePts(13, headY + 9, 4.6, 2.8, 10, 982, 0.06), palette_1.PALETTE.blossom, { alpha: 0.6, layers: 1, seedIndex: 983 });
    ctx.restore();
    // 嘴
    if (hurt) {
        (0, brush_1.strokeInk)(ctx, [{ x: -5, y: headY + 15 }, { x: 0, y: headY + 11 }, { x: 5, y: headY + 15 }], { width: 2, seedIndex: 985 });
    }
    else {
        (0, brush_1.strokeInk)(ctx, [{ x: -6, y: headY + 10 }, { x: 0, y: headY + 17 }, { x: 6, y: headY + 10 }], { width: 2, seedIndex: 986 });
    }
    // 草帽
    var hatBrim = [
        { x: -34, y: headY + 2 },
        { x: 34, y: headY + 2 },
        { x: 36, y: headY - 6 },
        { x: -36, y: headY - 6 },
    ];
    (0, brush_1.fillWatercolor)(ctx, hatBrim, palette_1.PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: 990 });
    (0, brush_1.strokeInk)(ctx, hatBrim, { width: 2.6, close: true, seedIndex: 991, jitter: 1.1 });
    var hatTop = [
        { x: -22, y: headY - 6 },
        { x: 22, y: headY - 6 },
        { x: 15, y: headY - 26 },
        { x: -15, y: headY - 26 },
    ];
    (0, brush_1.fillWatercolor)(ctx, hatTop, palette_1.PALETTE.sunbeam, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: 992 });
    (0, brush_1.strokeInk)(ctx, hatTop, { width: 2.6, close: true, seedIndex: 993, jitter: 1.0 });
    // 帽上叶片
    var sway = Math.sin(time / 420) * 0.22;
    (0, paint_1.drawLeaf)(ctx, -26, headY - 4, 20, Math.PI - 0.6 + sway, palette_1.PALETTE.leafMid, 995);
    (0, paint_1.drawLeaf)(ctx, 27, headY - 2, 16, -0.3 - sway, palette_1.PALETTE.leafLight, 996);
    // 受伤：汗滴
    if (hurt) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        (0, brush_1.fillWatercolor)(ctx, ellipsePts(22, headY - 14, 4, 6, 10, 997, 0.05), palette_1.PALETTE.stream, { alpha: 0.9, layers: 1, seedIndex: 998 });
        ctx.restore();
    }
    ctx.restore();
}
