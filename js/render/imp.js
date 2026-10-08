"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawImp = drawImp;
/**
 * 小恶魔（敌方场边 NPC）：紫色圆身 + 蝙蝠翅 + 金铃项圈 + 带尖尾巴。
 * `drawImp(ctx, cx, baseY, state, time)`，(cx, baseY) 是脚底中心。
 */
var palette_1 = require("../config/palette");
var brush_1 = require("../ui/brush");
var ease_1 = require("../ui/ease");
var paint_1 = require("./paint");
var BODY = palette_1.PALETTE.twilight;
var BODY_DEEP = (0, palette_1.tint)(palette_1.PALETTE.twilight, 0.34, palette_1.PALETTE.forestDeep);
var BELLY = (0, palette_1.tint)(palette_1.PALETTE.blossom, 0.62, palette_1.PALETTE.paper);
function blob(cx, cy, rx, ry, n, seed, jag) {
    var pts = [];
    for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2;
        var k = 1 + Math.sin(i * 21.3 + seed) * 0.5 * jag;
        pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    return pts;
}
function drawImp(ctx, cx, baseY, state, time) {
    var hurt = state === 'hurt' || state === 'sad';
    var laugh = state === 'laugh';
    var hover = (0, ease_1.bob)(time, 0.42, 5) + 4; // 恶魔是飘着的
    var flap = Math.sin(time / 180) * 0.5;
    ctx.save();
    ctx.translate(cx, baseY);
    // 地面影（飘起来所以更淡）
    ctx.save();
    ctx.globalAlpha = 0.16;
    (0, brush_1.fillWatercolor)(ctx, blob(0, 2, 30, 8, 14, 1101, 0.06), palette_1.PALETTE.forestDeep, { alpha: 0.6, layers: 1, seedIndex: 1102 });
    ctx.restore();
    var cy = -68 - hover;
    // 翅膀（在身后画）
    for (var i = -1; i <= 1; i += 2) {
        var wa = i < 0 ? Math.PI - 0.5 : 0.5;
        var wcx = i * 30;
        var wing = [
            { x: i * 14, y: cy - 6 },
            { x: wcx + i * 34, y: cy - 40 - flap * 12 },
            { x: wcx + i * 40, y: cy + 2 },
            { x: wcx + i * 22, y: cy + 16 },
            { x: i * 14, y: cy + 10 },
        ];
        (0, brush_1.fillWatercolor)(ctx, wing, (0, palette_1.tint)(BODY, 0.22, palette_1.PALETTE.twilight), { alpha: 0.9, layers: 1, seedIndex: 1110 + i });
        (0, brush_1.strokeInk)(ctx, wing, { width: 2.2, close: true, color: (0, palette_1.rgba)(BODY_DEEP, 0.9), seedIndex: 1114 + i, jitter: 1.2 });
    }
    // 尾巴（带尖）
    var tailSway = (0, ease_1.sway)(time, 0.0) * 8;
    var tail = [
        { x: 14, y: cy + 30 },
        { x: 40, y: cy + 40 + tailSway },
        { x: 54, y: cy + 22 + tailSway },
    ];
    (0, brush_1.strokeInk)(ctx, tail, { width: 6, color: BODY, seedIndex: 1120, jitter: 1.4 });
    var tip = [
        { x: 54, y: cy + 22 + tailSway },
        { x: 62, y: cy + 10 + tailSway },
        { x: 50, y: cy + 14 + tailSway },
    ];
    (0, brush_1.fillWatercolor)(ctx, tip, BODY_DEEP, { alpha: 1, layers: 1, seedIndex: 1121 });
    (0, brush_1.strokeInk)(ctx, tip, { width: 2, close: true, seedIndex: 1122, jitter: 0.8 });
    // 身体（圆润的水滴形）
    var body = [
        { x: -26, y: cy + 34 },
        { x: -24, y: cy - 4 },
        { x: -12, y: cy - 24 },
        { x: 12, y: cy - 24 },
        { x: 24, y: cy - 4 },
        { x: 26, y: cy + 34 },
    ];
    (0, brush_1.fillWatercolor)(ctx, body, BODY, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: 1130 });
    (0, brush_1.strokeInk)(ctx, body, { width: 2.8, close: true, color: BODY_DEEP, seedIndex: 1131, jitter: 1.1 });
    // 亮肚皮
    var belly = [
        { x: -13, y: cy + 30 },
        { x: -12, y: cy + 2 },
        { x: 12, y: cy + 2 },
        { x: 13, y: cy + 30 },
    ];
    (0, brush_1.fillWatercolor)(ctx, belly, BELLY, { alpha: 0.55, layers: 1, seedIndex: 1132 });
    // 角
    for (var i = -1; i <= 1; i += 2) {
        var horn = [
            { x: i * 8, y: cy - 22 },
            { x: i * 18, y: cy - 40 },
            { x: i * 20, y: cy - 20 },
        ];
        (0, brush_1.fillWatercolor)(ctx, horn, palette_1.PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: 1140 + i });
        (0, brush_1.strokeInk)(ctx, horn, { width: 2.2, close: true, seedIndex: 1144 + i, jitter: 0.8 });
    }
    // 尖耳
    for (var i = -1; i <= 1; i += 2) {
        var ear = [
            { x: i * 22, y: cy - 12 },
            { x: i * 38, y: cy - 24 },
            { x: i * 30, y: cy + 2 },
        ];
        (0, brush_1.fillWatercolor)(ctx, ear, BODY, { alpha: 0.98, layers: 1, seedIndex: 1150 + i });
        (0, brush_1.strokeInk)(ctx, ear, { width: 2.2, close: true, color: BODY_DEEP, seedIndex: 1154 + i, jitter: 0.9 });
    }
    // 眼睛
    for (var i = -1; i <= 1; i += 2) {
        var ex = i * 10;
        var ey = cy;
        if (hurt) {
            (0, brush_1.strokeInk)(ctx, [{ x: ex - 4, y: ey - 4 }, { x: ex + 4, y: ey + 4 }], { width: 2.2, color: palette_1.PALETTE.berry, seedIndex: 1160 + i });
            (0, brush_1.strokeInk)(ctx, [{ x: ex + 4, y: ey - 4 }, { x: ex - 4, y: ey + 4 }], { width: 2.2, color: palette_1.PALETTE.berry, seedIndex: 1164 + i });
        }
        else {
            ctx.save();
            ctx.fillStyle = palette_1.PALETTE.inkSoft;
            ctx.beginPath();
            ctx.ellipse(ex, ey, 4.6, laugh ? 2.2 : 5.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.75;
            ctx.fillStyle = palette_1.PALETTE.paper;
            ctx.beginPath();
            ctx.arc(ex - 1.6, ey - 1.8, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    // 坏笑嘴
    var mouth = laugh
        ? [
            { x: -11, y: cy + 10 },
            { x: 0, y: cy + 20 },
            { x: 11, y: cy + 10 },
        ]
        : [
            { x: -10, y: cy + 13 },
            { x: 0, y: cy + 19 },
            { x: 10, y: cy + 11 },
        ];
    (0, brush_1.strokeInk)(ctx, mouth, { width: 2.2, color: palette_1.PALETTE.inkSoft, seedIndex: 1170 });
    // 小尖牙
    (0, brush_1.fillWatercolor)(ctx, [
        { x: 2, y: cy + 17 },
        { x: 7, y: cy + 17 },
        { x: 4.5, y: cy + 22 },
    ], palette_1.PALETTE.paper, { alpha: 1, layers: 1, seedIndex: 1171 });
    // 金铃项圈
    (0, brush_1.strokeInk)(ctx, [
        { x: -18, y: cy + 24 },
        { x: 0, y: cy + 30 },
        { x: 18, y: cy + 24 },
    ], { width: 5, color: palette_1.PALETTE.sunbeam, seedIndex: 1180, jitter: 1.0 });
    (0, brush_1.fillWatercolor)(ctx, blob(0, cy + 30, 6.5, 6.5, 10, 1181, 0.05), palette_1.PALETTE.sunset, { alpha: 1, layers: 1, seedIndex: 1182 });
    (0, brush_1.strokeInk)(ctx, blob(0, cy + 30, 6.5, 6.5, 10, 1183, 0.05), { width: 1.8, close: true, seedIndex: 1184, jitter: 0.7 });
    // 手里的小叶片（嘲讽/挥动）
    var leafAng = -0.6 + Math.sin(time / 300) * 0.5;
    (0, paint_1.drawLeaf)(ctx, -30, cy + 22, 16, leafAng, palette_1.PALETTE.leafMid, 1190);
    // 受伤时冒星
    if (hurt && (0, ease_1.cycle)(time, 900, 0) < 0.5) {
        (0, paint_1.drawFirefly)(ctx, 26, cy - 30, 3.2, 0.85, palette_1.PALETTE.sunbeam);
        (0, paint_1.drawFirefly)(ctx, 34, cy - 20, 2.4, 0.6, palette_1.PALETTE.sunbeam);
    }
    ctx.restore();
}
