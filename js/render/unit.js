"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.speciesBodyRadius = speciesBodyRadius;
exports.speciesHeight = speciesHeight;
exports.drawSpeciesCreature = drawSpeciesCreature;
exports.drawSpeciesSilhouette = drawSpeciesSilhouette;
exports.drawUnit = drawUnit;
exports.unitRingRadius = unitRingRadius;
exports.levelOf = levelOf;
exports.stableSeed = stableSeed;
exports.debugAnchors = debugAnchors;
var palette_1 = require("../config/palette");
var species_1 = require("../config/species");
var timing_1 = require("../config/timing");
var brush_1 = require("../ui/brush");
var ease_1 = require("../ui/ease");
var paint_1 = require("./paint");
var assets_1 = require("./assets");
var hpring_1 = require("./hpring");
var TAU = Math.PI * 2;
function rnd(i, seed) {
    return ((0, brush_1.noiseAt)(i, seed) + 1) / 2;
}
function ellipsePts(cx, cy, rx, ry, seed, wob) {
    var w = wob === undefined ? 0.07 : wob;
    var pts = [];
    var n = 26;
    for (var i = 0; i < n; i++) {
        var a = (i / n) * TAU;
        var k = 1 + (0, brush_1.noiseAt)(i, seed) * w;
        pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    return pts;
}
function rectPts(x, y, w, h) {
    return [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ];
}
/** 物种体型推荐半径（渲染像素，1 级）。 */
function speciesBodyRadius(species) {
    return species_1.SPECIES[species].bodyRadius;
}
/** 物种立绘近似高度（供场景排版/命中测试用）。 */
function speciesHeight(species, scale) {
    return species_1.SPECIES[species].bodyRadius * 2.5 * scale;
}
function makePaint(ctx, tone, seedBase) {
    var n = 0;
    return {
        fill: function (pts, color, alpha) {
            (0, brush_1.fillWatercolor)(ctx, pts, tone || color, {
                alpha: alpha === undefined ? 0.95 : alpha,
                layers: 2,
                wetEdge: true,
                seedIndex: seedBase + n++,
            });
        },
        ink: function (pts, width, color) {
            if (tone)
                return; // 剪影/闪白模式下不描边
            (0, brush_1.strokeInk)(ctx, pts, {
                width: width === undefined ? 2.6 : width,
                close: true,
                color: color || palette_1.PALETTE.inkSoft,
                jitter: 1.0,
                seedIndex: seedBase + n++,
            });
        },
    };
}
/** 四条腿（前后各两条，滞后摆动）。 */
function legs(p, c, bodyY, bodyRy, color, thick) {
    var phase = (c.time / 1000) * timing_1.TIMING.RUN_BOB_HZ * TAU;
    var swing = Math.sin(phase) * 0.34;
    var lag = Math.sin(phase - timing_1.TIMING.LIMB_LAG * TAU) * 0.34;
    var backX = -c.u * 0.62;
    var frontX = c.u * 0.62;
    var legLen = bodyRy * 0.95;
    // 后腿（先画，压在身体后面）
    legsOne(p, c, c.cx + backX, bodyY + bodyRy * 0.35, legLen, thick, swing, color, true);
    legsOne(p, c, c.cx + frontX, bodyY + bodyRy * 0.36, legLen, thick, lag, color, true);
}
function legsOne(p, c, x, y, len, thick, swing, color, back) {
    var pts = [
        { x: x - thick * 0.5, y: y },
        { x: x + swing * len * 0.4 - thick * 0.45, y: y + len * 0.55 },
        { x: x + swing * len * 0.8 - thick * 0.4, y: y + len },
        { x: x + swing * len * 0.8 + thick * 0.72, y: y + len },
        { x: x + swing * len * 0.4 + thick * 0.62, y: y + len * 0.55 },
        { x: x + thick * 0.62, y: y },
    ];
    p.fill(pts, color, back ? 0.9 : 0.98);
    if (!back)
        p.ink(pts, 2.2);
}
/** 眼睛（Ghibli 幼态：大眼 + 高光点 + 腮红）。 */
function face(p, c, hx, hy, hr, eyeGap, eyeY, eyeR, closed) {
    var ctx = c.ctx;
    // 腮红
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette_1.PALETTE.blossom;
    for (var i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.arc(hx + i * (eyeGap + hr * 0.34), hy + eyeY + eyeR * 1.6, hr * 0.2, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
    for (var i = -1; i <= 1; i += 2) {
        var ex = hx + i * eyeGap;
        var ey = hy + eyeY;
        if (closed) {
            p.ink([
                { x: ex - eyeR * 0.9, y: ey },
                { x: ex, y: ey + eyeR * 0.55 },
                { x: ex + eyeR * 0.9, y: ey },
            ], 2.0);
            continue;
        }
        p.fill(ellipsePts(ex, ey, eyeR, eyeR * 1.15, c.seed + i * 3, 0.05), palette_1.PALETTE.inkSoft, 1);
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = palette_1.PALETTE.paper;
        ctx.beginPath();
        ctx.arc(ex + eyeR * 0.3, ey - eyeR * 0.4, eyeR * 0.32, 0, TAU);
        ctx.fill();
        ctx.restore();
    }
}
/** 象：灰皮、巨扇耳、长鼻、短牙、粗腿。 */
function elephant(p, c, theme) {
    var ctx = c.ctx;
    var u = c.u;
    var by = c.groundY - u * 1.28;
    var bodyRy = u * 0.98;
    legs(p, c, by + bodyRy * 0.4, bodyRy, (0, palette_1.tint)(theme, 0.22, palette_1.PALETTE.forestDeep), u * 0.42);
    // 身体
    p.fill(ellipsePts(c.cx, by, u * 1.42, bodyRy, c.seed, 0.06), theme, 0.98);
    p.ink(ellipsePts(c.cx, by, u * 1.42, bodyRy, c.seed + 1, 0.06), 2.8);
    // 耳朵：两片大扇形
    for (var i = -1; i <= 1; i += 2) {
        var ex = c.cx + i * u * 0.86;
        var ey = by - u * 0.34;
        var pts = [];
        for (var k = 0; k <= 12; k++) {
            var a = -0.9 + (k / 12) * 2.6;
            pts.push({ x: ex + i * Math.cos(a) * u * 0.72, y: ey + Math.sin(a) * u * 0.62 });
        }
        p.fill(pts, (0, palette_1.tint)(theme, 0.18, palette_1.PALETTE.creamMist), 0.96);
        p.ink(pts, 2.4, (0, palette_1.tint)(theme, 0.5, palette_1.PALETTE.inkSoft));
    }
    // 头
    var hx = c.cx;
    var hy = by - u * 0.55;
    var hr = u * 0.78;
    p.fill(ellipsePts(hx, hy, hr, hr * 0.92, c.seed + 5, 0.06), theme, 0.98);
    p.ink(ellipsePts(hx, hy, hr, hr * 0.92, c.seed + 6, 0.06), 2.8);
    // 鼻子：下垂的长钩
    var trunk = [
        { x: hx + u * 0.06, y: hy + hr * 0.5 },
        { x: hx + u * 0.3, y: hy + hr * 1.1 },
        { x: hx + u * 0.42, y: hy + hr * 1.8 },
        { x: hx + u * 0.2, y: hy + hr * 2.15 },
        { x: hx - u * 0.08, y: hy + hr * 1.95 },
        { x: hx - u * 0.1, y: hy + hr * 1.2 },
        { x: hx - u * 0.16, y: hy + hr * 0.5 },
    ];
    p.fill(trunk, (0, palette_1.tint)(theme, 0.1, palette_1.PALETTE.creamMist), 0.98);
    p.ink(trunk, 2.2);
    // 牙
    for (var i = -1; i <= 1; i += 2) {
        p.fill([
            { x: hx + i * u * 0.26, y: hy + hr * 0.62 },
            { x: hx + i * u * 0.34, y: hy + hr * 1.05 },
            { x: hx + i * u * 0.2, y: hy + hr * 0.66 },
        ], palette_1.PALETTE.creamMist, 0.98);
    }
    face(p, c, hx, hy, hr, hr * 0.42, -hr * 0.08, hr * 0.15);
    return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.62, frontLegY: by + bodyRy * 0.9 };
}
/** 狮：鬃毛环 + 棕黄身体 + 带穗尾。 */
function lion(p, c, theme) {
    var ctx = c.ctx;
    var u = c.u;
    var by = c.groundY - u * 1.18;
    var bodyRy = u * 0.85;
    legs(p, c, by + bodyRy * 0.36, bodyRy, (0, palette_1.tint)(theme, 0.24, palette_1.PALETTE.soil), u * 0.32);
    p.fill(ellipsePts(c.cx, by, u * 1.3, bodyRy, c.seed, 0.06), theme, 0.98);
    p.ink(ellipsePts(c.cx, by, u * 1.3, bodyRy, c.seed + 1, 0.06), 2.8);
    // 尾巴 + 穗
    var tailPhase = Math.sin((c.time / 1000) * 2.4) * 0.28;
    var tail = [
        { x: c.cx - u * 1.2, y: by - u * 0.2 },
        { x: c.cx - u * 1.8, y: by - u * 0.5 + tailPhase * u * 0.5 },
        { x: c.cx - u * 2.1, y: by - u * 0.9 + tailPhase * u },
    ];
    p.ink(tail, 3.2, (0, palette_1.tint)(theme, 0.35, palette_1.PALETTE.soil));
    p.fill(ellipsePts(c.cx - u * 2.15, by - u * 1.0 + tailPhase * u, u * 0.28, u * 0.32, c.seed + 9, 0.1), (0, palette_1.tint)(theme, 0.1, palette_1.PALETTE.soil), 0.98);
    // 头 + 鬃毛
    var hx = c.cx + u * 0.06;
    var hy = by - u * 0.62;
    var hr = u * 0.66;
    var mane = [];
    for (var i = 0; i < 20; i++) {
        var a = (i / 20) * TAU;
        var rr = hr * (1.42 + rnd(i, c.seed + 3) * 0.22);
        mane.push({ x: hx + Math.cos(a) * rr, y: hy + Math.sin(a) * rr * 0.95 });
    }
    p.fill(mane, palette_1.PALETTE.sunset, 0.95);
    p.ink(mane, 2.4, (0, palette_1.tint)(palette_1.PALETTE.sunset, 0.45, palette_1.PALETTE.inkSoft));
    p.fill(ellipsePts(hx, hy, hr, hr * 0.94, c.seed + 11, 0.06), (0, palette_1.tint)(theme, 0.16, palette_1.PALETTE.creamMist), 0.98);
    p.ink(ellipsePts(hx, hy, hr, hr * 0.94, c.seed + 12, 0.06), 2.6);
    // 口鼻
    p.fill(ellipsePts(hx + hr * 0.42, hy + hr * 0.28, hr * 0.34, hr * 0.26, c.seed + 13, 0.08), palette_1.PALETTE.creamMist, 0.95);
    p.fill(ellipsePts(hx + hr * 0.62, hy + hr * 0.2, hr * 0.11, hr * 0.09, c.seed + 14, 0.05), palette_1.PALETTE.inkSoft, 1);
    face(p, c, hx, hy, hr, hr * 0.34, -hr * 0.18, hr * 0.13);
    return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.62, frontLegY: by + bodyRy * 0.8 };
}
/** 虎：橙底黑纹、圆耳、环纹长尾。 */
function tiger(p, c, theme) {
    var ctx = c.ctx;
    var u = c.u;
    var by = c.groundY - u * 1.1;
    var bodyRy = u * 0.8;
    legs(p, c, by + bodyRy * 0.36, bodyRy, (0, palette_1.tint)(theme, 0.2, palette_1.PALETTE.soil), u * 0.3);
    p.fill(ellipsePts(c.cx, by, u * 1.24, bodyRy, c.seed, 0.06), theme, 0.98);
    // 虎纹：身体三道弧 + 额头纹
    for (var i = 0; i < 3; i++) {
        var bx = c.cx - u * 0.5 + i * u * 0.55;
        p.ink([
            { x: bx, y: by - bodyRy * 0.86 },
            { x: bx + u * 0.06, y: by - bodyRy * 0.2 },
            { x: bx - u * 0.02, y: by + bodyRy * 0.5 },
        ], 2.6, palette_1.PALETTE.inkSoft);
    }
    p.ink(ellipsePts(c.cx, by, u * 1.24, bodyRy, c.seed + 1, 0.06), 2.8);
    // 尾巴（带环）
    var tw = Math.sin((c.time / 1000) * 2.2) * 0.3;
    var tailPts = [
        { x: c.cx - u * 1.1, y: by - u * 0.1 },
        { x: c.cx - u * 1.7, y: by - u * 0.55 + tw * u * 0.6 },
        { x: c.cx - u * 2.0, y: by - u * 1.05 + tw * u },
    ];
    p.ink(tailPts, 3.4, theme);
    for (var i = 0; i < 3; i++) {
        var t = 0.35 + i * 0.22;
        p.ink([
            { x: c.cx - u * (1.1 + t * 0.9), y: by - u * (0.1 + t * 0.95) + tw * u * t - u * 0.12 },
            { x: c.cx - u * (1.1 + t * 0.9), y: by - u * (0.1 + t * 0.95) + tw * u * t + u * 0.12 },
        ], 2.4, palette_1.PALETTE.inkSoft);
    }
    var hx = c.cx + u * 0.08;
    var hy = by - u * 0.6;
    var hr = u * 0.62;
    // 耳朵
    for (var i = -1; i <= 1; i += 2) {
        var pts = ellipsePts(hx + i * hr * 0.72, hy - hr * 0.52, hr * 0.26, hr * 0.3, c.seed + i * 5, 0.08);
        p.fill(pts, theme, 0.98);
        p.ink(pts, 2.2);
        p.fill(ellipsePts(hx + i * hr * 0.72, hy - hr * 0.5, hr * 0.13, hr * 0.16, c.seed + i * 7, 0.06), palette_1.PALETTE.blossom, 0.7);
    }
    p.fill(ellipsePts(hx, hy, hr, hr * 0.92, c.seed + 21, 0.06), theme, 0.98);
    p.ink(ellipsePts(hx, hy, hr, hr * 0.92, c.seed + 22, 0.06), 2.6);
    // 额头「王」字纹
    p.ink([{ x: hx - hr * 0.3, y: hy - hr * 0.5 }, { x: hx + hr * 0.3, y: hy - hr * 0.5 }], 2.2, palette_1.PALETTE.inkSoft);
    p.ink([{ x: hx, y: hy - hr * 0.56 }, { x: hx, y: hy - hr * 0.2 }], 2.2, palette_1.PALETTE.inkSoft);
    p.fill(ellipsePts(hx + hr * 0.44, hy + hr * 0.26, hr * 0.24, hr * 0.18, c.seed + 23, 0.08), palette_1.PALETTE.creamMist, 0.95);
    p.fill(ellipsePts(hx + hr * 0.58, hy + hr * 0.16, hr * 0.1, hr * 0.08, c.seed + 24, 0.05), palette_1.PALETTE.inkSoft, 1);
    face(p, c, hx, hy, hr, hr * 0.33, -hr * 0.14, hr * 0.13);
    return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.58, frontLegY: by + bodyRy * 0.8 };
}
/** 豹：细长身形 + 斑点 + 长尾。 */
function leopard(p, c, theme) {
    var ctx = c.ctx;
    var u = c.u;
    var by = c.groundY - u * 1.02;
    var bodyRy = u * 0.72;
    legs(p, c, by + bodyRy * 0.36, bodyRy, (0, palette_1.tint)(theme, 0.24, palette_1.PALETTE.soil), u * 0.26);
    p.fill(ellipsePts(c.cx, by, u * 1.3, bodyRy, c.seed, 0.06), theme, 0.98);
    // 斑点：两排玫瑰斑
    for (var i = 0; i < 7; i++) {
        var bx = c.cx - u * 0.9 + i * u * 0.3;
        var byy = by - bodyRy * 0.3 + (i % 2) * bodyRy * 0.5;
        p.ink(ellipsePts(bx, byy, u * 0.1, u * 0.08, c.seed + i * 3, 0.1), 2.0, (0, palette_1.tint)(palette_1.PALETTE.inkSoft, 0.2, theme));
    }
    p.ink(ellipsePts(c.cx, by, u * 1.3, bodyRy, c.seed + 1, 0.06), 2.8);
    var tw = Math.sin((c.time / 1000) * 2.6) * 0.34;
    p.ink([
        { x: c.cx - u * 1.15, y: by - u * 0.1 },
        { x: c.cx - u * 1.9, y: by - u * 0.5 + tw * u * 0.7 },
        { x: c.cx - u * 2.2, y: by - u * 1.0 + tw * u * 1.2 },
    ], 3.0, theme);
    var hx = c.cx + u * 0.16;
    var hy = by - u * 0.56;
    var hr = u * 0.58;
    for (var i = -1; i <= 1; i += 2) {
        var pts = ellipsePts(hx + i * hr * 0.68, hy - hr * 0.5, hr * 0.22, hr * 0.26, c.seed + i * 5, 0.08);
        p.fill(pts, theme, 0.98);
        p.ink(pts, 2.0);
    }
    p.fill(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 31, 0.06), theme, 0.98);
    p.ink(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 32, 0.06), 2.6);
    for (var i = 0; i < 3; i++) {
        p.ink(ellipsePts(hx - hr * 0.2 + i * hr * 0.28, hy - hr * 0.5, hr * 0.08, hr * 0.07, c.seed + 33 + i, 0.1), 1.8, palette_1.PALETTE.inkSoft);
    }
    p.fill(ellipsePts(hx + hr * 0.46, hy + hr * 0.24, hr * 0.22, hr * 0.16, c.seed + 37, 0.08), palette_1.PALETTE.creamMist, 0.95);
    p.fill(ellipsePts(hx + hr * 0.6, hy + hr * 0.16, hr * 0.09, hr * 0.07, c.seed + 38, 0.05), palette_1.PALETTE.inkSoft, 1);
    face(p, c, hx, hy, hr, hr * 0.32, -hr * 0.12, hr * 0.12);
    return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.6, frontLegY: by + bodyRy * 0.8 };
}
/** 狼：灰毛、尖立耳、蓬松尾、长吻。 */
function wolf(p, c, theme) {
    var ctx = c.ctx;
    var u = c.u;
    var by = c.groundY - u * 1.02;
    var bodyRy = u * 0.72;
    legs(p, c, by + bodyRy * 0.36, bodyRy, (0, palette_1.tint)(theme, 0.3, palette_1.PALETTE.forestDeep), u * 0.26);
    p.fill(ellipsePts(c.cx, by, u * 1.26, bodyRy, c.seed, 0.06), theme, 0.98);
    // 背鬃
    p.fill([
        { x: c.cx - u * 0.7, y: by - bodyRy * 0.92 },
        { x: c.cx - u * 0.2, y: by - bodyRy * 1.3 },
        { x: c.cx + u * 0.4, y: by - bodyRy * 0.86 },
    ], (0, palette_1.tint)(theme, 0.32, palette_1.PALETTE.forestDeep), 0.95);
    p.ink(ellipsePts(c.cx, by, u * 1.26, bodyRy, c.seed + 1, 0.06), 2.8);
    // 蓬松尾
    var tw = Math.sin((c.time / 1000) * 3.2) * 0.3;
    var tail = ellipsePts(c.cx - u * 1.5, by - u * 0.42 + tw * u * 0.4, u * 0.52, u * 0.28, c.seed + 3, 0.14);
    p.fill(tail, (0, palette_1.tint)(theme, 0.22, palette_1.PALETTE.creamMist), 0.98);
    p.ink(tail, 2.4);
    var hx = c.cx + u * 0.2;
    var hy = by - u * 0.58;
    var hr = u * 0.6;
    // 尖耳
    for (var i = -1; i <= 1; i += 2) {
        var ex = hx + i * hr * 0.58;
        var ear = [
            { x: ex - i * hr * 0.26, y: hy - hr * 0.5 },
            { x: ex + i * hr * 0.14, y: hy - hr * 1.32 },
            { x: ex + i * hr * 0.42, y: hy - hr * 0.42 },
        ];
        p.fill(ear, theme, 0.98);
        p.ink(ear, 2.2);
        p.fill([
            { x: ex - i * hr * 0.14, y: hy - hr * 0.55 },
            { x: ex + i * hr * 0.1, y: hy - hr * 1.1 },
            { x: ex + i * hr * 0.28, y: hy - hr * 0.5 },
        ], palette_1.PALETTE.blossom, 0.55);
    }
    p.fill(ellipsePts(hx, hy, hr, hr * 0.88, c.seed + 41, 0.06), theme, 0.98);
    p.ink(ellipsePts(hx, hy, hr, hr * 0.88, c.seed + 42, 0.06), 2.6);
    // 长吻
    p.fill(ellipsePts(hx + hr * 0.5, hy + hr * 0.3, hr * 0.4, hr * 0.24, c.seed + 43, 0.08), (0, palette_1.tint)(theme, 0.2, palette_1.PALETTE.creamMist), 0.96);
    p.fill(ellipsePts(hx + hr * 0.78, hy + hr * 0.24, hr * 0.12, hr * 0.1, c.seed + 44, 0.05), palette_1.PALETTE.inkSoft, 1);
    face(p, c, hx, hy, hr, hr * 0.36, -hr * 0.16, hr * 0.13);
    return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.58, frontLegY: by + bodyRy * 0.8 };
}
/** 狗：棕毛、垂耳、卷尾、吐舌。 */
function dog(p, c, theme) {
    var ctx = c.ctx;
    var u = c.u;
    var by = c.groundY - u * 0.98;
    var bodyRy = u * 0.7;
    legs(p, c, by + bodyRy * 0.36, bodyRy, (0, palette_1.tint)(theme, 0.24, palette_1.PALETTE.soil), u * 0.26);
    p.fill(ellipsePts(c.cx, by, u * 1.2, bodyRy, c.seed, 0.06), theme, 0.98);
    // 胸前白毛
    p.fill(ellipsePts(c.cx + u * 0.6, by + bodyRy * 0.2, u * 0.42, bodyRy * 0.5, c.seed + 2, 0.1), palette_1.PALETTE.creamMist, 0.9);
    p.ink(ellipsePts(c.cx, by, u * 1.2, bodyRy, c.seed + 1, 0.06), 2.8);
    // 卷尾（快摇）
    var wag = Math.sin((c.time / 1000) * 6.4) * 0.5;
    p.ink([
        { x: c.cx - u * 1.05, y: by - u * 0.3 },
        { x: c.cx - u * 1.6, y: by - u * 0.7 + wag * u * 0.3 },
        { x: c.cx - u * 1.5, y: by - u * 1.25 + wag * u * 0.6 },
    ], 3.4, (0, palette_1.tint)(theme, 0.18, palette_1.PALETTE.soil));
    var hx = c.cx + u * 0.24;
    var hy = by - u * 0.56;
    var hr = u * 0.6;
    // 垂耳
    for (var i = -1; i <= 1; i += 2) {
        var ex = hx + i * hr * 0.7;
        var ear = ellipsePts(ex + i * hr * 0.16, hy - hr * 0.05 + Math.sin((c.time / 1000) * 2) * hr * 0.06, hr * 0.26, hr * 0.48, c.seed + i * 6, 0.1);
        p.fill(ear, (0, palette_1.tint)(theme, 0.26, palette_1.PALETTE.soil), 0.98);
        p.ink(ear, 2.2);
    }
    p.fill(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 51, 0.06), theme, 0.98);
    p.ink(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 52, 0.06), 2.6);
    p.fill(ellipsePts(hx + hr * 0.46, hy + hr * 0.3, hr * 0.34, hr * 0.24, c.seed + 53, 0.08), palette_1.PALETTE.creamMist, 0.96);
    p.fill(ellipsePts(hx + hr * 0.66, hy + hr * 0.22, hr * 0.13, hr * 0.1, c.seed + 54, 0.05), palette_1.PALETTE.inkSoft, 1);
    // 舌头
    p.fill([
        { x: hx + hr * 0.42, y: hy + hr * 0.5 },
        { x: hx + hr * 0.66, y: hy + hr * 0.52 },
        { x: hx + hr * 0.6, y: hy + hr * 0.82 },
        { x: hx + hr * 0.44, y: hy + hr * 0.78 },
    ], palette_1.PALETTE.blossom, 0.95);
    face(p, c, hx, hy, hr, hr * 0.34, -hr * 0.16, hr * 0.13);
    return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.56, frontLegY: by + bodyRy * 0.8 };
}
/** 猫：粉调、三角耳、胡须、曲尾。 */
function cat(p, c, theme) {
    var ctx = c.ctx;
    var u = c.u;
    var by = c.groundY - u * 0.92;
    var bodyRy = u * 0.66;
    legs(p, c, by + bodyRy * 0.36, bodyRy, (0, palette_1.tint)(theme, 0.3, palette_1.PALETTE.twilight), u * 0.22);
    p.fill(ellipsePts(c.cx, by, u * 1.12, bodyRy, c.seed, 0.06), theme, 0.98);
    p.fill(ellipsePts(c.cx + u * 0.5, by + bodyRy * 0.24, u * 0.38, bodyRy * 0.44, c.seed + 2, 0.1), palette_1.PALETTE.creamMist, 0.85);
    p.ink(ellipsePts(c.cx, by, u * 1.12, bodyRy, c.seed + 1, 0.06), 2.6);
    // 曲尾
    var sw = Math.sin((c.time / 1000) * 2.6) * 0.3;
    p.ink([
        { x: c.cx - u * 1.0, y: by - u * 0.2 },
        { x: c.cx - u * 1.5, y: by - u * 0.7 + sw * u * 0.3 },
        { x: c.cx - u * 1.3, y: by - u * 1.2 + sw * u * 0.7 },
        { x: c.cx - u * 1.05, y: by - u * 1.3 + sw * u * 0.4 },
    ], 3.0, (0, palette_1.tint)(theme, 0.2, palette_1.PALETTE.twilight));
    var hx = c.cx + u * 0.28;
    var hy = by - u * 0.54;
    var hr = u * 0.58;
    for (var i = -1; i <= 1; i += 2) {
        var ex = hx + i * hr * 0.56;
        var ear = [
            { x: ex - i * hr * 0.3, y: hy - hr * 0.44 },
            { x: ex + i * hr * 0.06, y: hy - hr * 1.25 },
            { x: ex + i * hr * 0.44, y: hy - hr * 0.4 },
        ];
        p.fill(ear, theme, 0.98);
        p.ink(ear, 2.2);
        p.fill([
            { x: ex - i * hr * 0.14, y: hy - hr * 0.5 },
            { x: ex + i * hr * 0.06, y: hy - hr * 1.0 },
            { x: ex + i * hr * 0.26, y: hy - hr * 0.48 },
        ], palette_1.PALETTE.blossom, 0.6);
    }
    p.fill(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 61, 0.06), theme, 0.98);
    p.ink(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 62, 0.06), 2.6);
    // 胡须
    for (var i = -1; i <= 1; i += 2) {
        for (var k = 0; k < 3; k++) {
            p.ink([
                { x: hx + i * hr * 0.3, y: hy + hr * (0.24 + k * 0.1) },
                { x: hx + i * hr * 1.05, y: hy + hr * (0.12 + k * 0.16) },
            ], 1.4, palette_1.PALETTE.inkSoft);
        }
    }
    p.fill(ellipsePts(hx + hr * 0.1, hy + hr * 0.32, hr * 0.12, hr * 0.1, c.seed + 63, 0.05), palette_1.PALETTE.blossom, 0.9);
    face(p, c, hx, hy, hr, hr * 0.32, -hr * 0.14, hr * 0.14);
    return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.54, frontLegY: by + bodyRy * 0.8 };
}
/** 鼠：小体型、大圆耳、细长尾。 */
function mouse(p, c, theme) {
    var ctx = c.ctx;
    var u = c.u;
    var by = c.groundY - u * 0.76;
    var bodyRy = u * 0.56;
    legs(p, c, by + bodyRy * 0.34, bodyRy, (0, palette_1.tint)(theme, 0.3, palette_1.PALETTE.twilight), u * 0.18);
    p.fill(ellipsePts(c.cx, by, u * 0.98, bodyRy, c.seed, 0.06), theme, 0.98);
    p.ink(ellipsePts(c.cx, by, u * 0.98, bodyRy, c.seed + 1, 0.06), 2.4);
    // 细长尾
    var tw = Math.sin((c.time / 1000) * 3.6) * 0.4;
    p.ink([
        { x: c.cx - u * 0.9, y: by + u * 0.1 },
        { x: c.cx - u * 1.7, y: by - u * 0.1 + tw * u * 0.3 },
        { x: c.cx - u * 2.3, y: by - u * 0.5 + tw * u * 0.8 },
    ], 2.2, palette_1.PALETTE.blossom);
    var hx = c.cx + u * 0.52;
    var hy = by - u * 0.34;
    var hr = u * 0.5;
    // 大圆耳
    for (var i = -1; i <= 1; i += 2) {
        var ex = hx + i * hr * 0.56;
        var ey = hy - hr * 0.78;
        var ear = ellipsePts(ex, ey, hr * 0.48, hr * 0.44, c.seed + i * 4, 0.06);
        p.fill(ear, theme, 0.98);
        p.ink(ear, 2.2);
        p.fill(ellipsePts(ex, ey, hr * 0.28, hr * 0.26, c.seed + i * 5, 0.06), palette_1.PALETTE.blossom, 0.7);
    }
    p.fill(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 71, 0.06), theme, 0.98);
    p.ink(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 72, 0.06), 2.4);
    // 尖吻 + 胡须
    p.fill([
        { x: hx + hr * 0.5, y: hy + hr * 0.14 },
        { x: hx + hr * 1.15, y: hy + hr * 0.34 },
        { x: hx + hr * 0.5, y: hy + hr * 0.44 },
    ], (0, palette_1.tint)(theme, 0.3, palette_1.PALETTE.creamMist), 0.95);
    p.fill(ellipsePts(hx + hr * 0.98, hy + hr * 0.32, hr * 0.1, hr * 0.08, c.seed + 73, 0.05), palette_1.PALETTE.blossom, 1);
    for (var i = -1; i <= 1; i += 2) {
        for (var k = 0; k < 2; k++) {
            p.ink([
                { x: hx + hr * 0.6, y: hy + hr * (0.26 + k * 0.12) },
                { x: hx + i * hr * 1.3, y: hy + hr * (0.1 + k * 0.2) },
            ], 1.2, palette_1.PALETTE.inkSoft);
        }
    }
    face(p, c, hx, hy, hr, hr * 0.3, -hr * 0.16, hr * 0.13);
    return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.5, frontLegY: by + bodyRy * 0.8 };
}
/** 等级装饰：Lv2 藤蔓护腕 / Lv3 花冠（§5.2）。 */
function levelDecor(p, c, fig, level) {
    if (level <= 1)
        return;
    var ctx = c.ctx;
    if (level >= 2) {
        // 藤蔓护腕：前腿一圈
        var pts = [];
        for (var i = 0; i <= 8; i++) {
            var a = -0.4 + (i / 8) * 2.4;
            pts.push({
                x: fig.frontLegX + Math.cos(a) * c.u * 0.24,
                y: fig.frontLegY + Math.sin(a) * c.u * 0.14,
            });
        }
        (0, paint_1.drawVine)(ctx, pts, 501, { width: 2.4, leafEvery: 12, leafLen: 8 });
    }
    if (level >= 3) {
        // 花冠：头上三朵小花 + 藤
        var pts = [];
        for (var i = 0; i <= 10; i++) {
            var a = Math.PI + (i / 10) * Math.PI;
            pts.push({ x: fig.hx + Math.cos(a) * fig.hr * 0.95, y: fig.hy - fig.hr * 0.42 + Math.sin(a) * fig.hr * 0.5 });
        }
        (0, paint_1.drawVine)(ctx, pts, 511, { width: 2.2, leafEvery: 22, leafLen: 9 });
        (0, paint_1.drawFlower)(ctx, fig.hx - fig.hr * 0.62, fig.hy - fig.hr * 0.82, fig.hr * 0.3, palette_1.PALETTE.blossom, 521);
        (0, paint_1.drawFlower)(ctx, fig.hx, fig.hy - fig.hr * 1.0, fig.hr * 0.36, palette_1.PALETTE.sunbeam, 523);
        (0, paint_1.drawFlower)(ctx, fig.hx + fig.hr * 0.62, fig.hy - fig.hr * 0.82, fig.hr * 0.3, palette_1.PALETTE.blossom, 525);
    }
}
function drawBody(ctx, species, level, cx, groundY, scale, time, pose, seed, tone) {
    var def = species_1.SPECIES[species];
    var theme = species_1.SPECIES_THEME[species];
    var u = def.bodyRadius * scale;
    var p = makePaint(ctx, tone, seed);
    var c = { ctx: ctx, u: u, cx: cx, groundY: groundY, time: time, pose: pose, seed: seed };
    var fig;
    switch (species) {
        case 'elephant':
            fig = elephant(p, c, theme);
            break;
        case 'lion':
            fig = lion(p, c, theme);
            break;
        case 'tiger':
            fig = tiger(p, c, theme);
            break;
        case 'leopard':
            fig = leopard(p, c, theme);
            break;
        case 'wolf':
            fig = wolf(p, c, theme);
            break;
        case 'dog':
            fig = dog(p, c, theme);
            break;
        case 'cat':
            fig = cat(p, c, theme);
            break;
        default:
            fig = mouse(p, c, theme);
            break;
    }
    if (!tone)
        levelDecor(p, c, fig, level);
    return fig;
}
/**
 * 程序化动物立绘（无贴图时的唯一依靠，也是营地/图鉴/结算页的共用画法）。
 * `(cx, baseY)` 为脚下中心点；朝向由 `opts.facing` 控制。
 */
function drawSpeciesCreature(ctx, species, level, cx, baseY, scale, time, opts) {
    var o = opts || {};
    var pose = o.pose || 'idle';
    var facing = o.facing === undefined ? 1 : o.facing;
    var seed = o.seedIndex === undefined ? 0 : o.seedIndex;
    ctx.save();
    ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    if (facing < 0) {
        ctx.translate(cx * 2, 0);
        ctx.scale(-1, 1);
    }
    drawBody(ctx, species, level, cx, baseY, scale, time, pose, seed, o.tone || null);
    ctx.restore();
}
/** 单色剪影（敌半场「？剪影」、图鉴未解锁态都用它）。 */
function drawSpeciesSilhouette(ctx, species, cx, cy, size, color, alpha) {
    var def = species_1.SPECIES[species];
    var scale = size / (def.bodyRadius * 2.6);
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 0.6 : alpha;
    drawBody(ctx, species, 1, cx, cy + size * 0.5, scale, 0, 'idle', 7, color);
    ctx.restore();
}
/** 有贴图用贴图，没有就程序化（贴图缺失时绝不画空白）。 */
function drawUnitImage(ctx, species, cx, baseY, scale, facing, alpha) {
    var img = (0, assets_1.getImage)('unit-' + species);
    if (!img)
        return false;
    var def = species_1.SPECIES[species];
    var size = def.bodyRadius * 3.1 * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (facing < 0) {
        ctx.translate(cx * 2, 0);
        ctx.scale(-1, 1);
    }
    try {
        ctx.drawImage(img, cx - size / 2, baseY - size * 0.92, size, size);
    }
    catch (e) {
        ctx.restore();
        return false;
    }
    ctx.restore();
    return true;
}
/**
 * 画一个棋子（战场单位 / 营地闲逛动物共用）。
 * `showRing:false` 时只画本体（营地与拖拽态）。
 */
function drawUnit(ctx, unit, opts) {
    var time = opts.time;
    var scale = opts.scale === undefined ? 1 : opts.scale;
    var facing = opts.facing === undefined ? 1 : opts.facing;
    var fxx = unit.fx || {};
    var def = species_1.SPECIES[unit.species];
    var alpha = opts.alpha === undefined ? 1 : opts.alpha;
    if (opts.dim)
        alpha *= 0.55;
    if (opts.ghost)
        alpha *= 0.6;
    // 死亡：550ms 内缩小旋转上升 + 3 只萤火虫
    var death = fxx.deathFirefly === undefined ? 0 : (0, ease_1.clamp01)(fxx.deathFirefly);
    if (!unit.alive) {
        if (death <= 0.001)
            return;
        var t = (0, ease_1.clamp01)(death);
        var rise = (0, ease_1.easeOutCubic)(t) * 46;
        var s = scale * (1 - 0.55 * t);
        ctx.save();
        ctx.globalAlpha = alpha * (1 - (0, ease_1.easeOutCubic)(t));
        ctx.translate(opts.x, opts.y - rise);
        drawSpeciesCreature(ctx, unit.species, unit.level, 0, 0, s, time, { facing: facing, seedIndex: unit.id * 7 });
        ctx.restore();
        for (var i = 0; i < 3; i++) {
            var a = t * TAU + i * (TAU / 3);
            var rr = 16 + t * 34;
            (0, paint_1.drawFirefly)(ctx, opts.x + Math.cos(a) * rr, opts.y - rise + Math.sin(a) * rr * 0.6, 3.2 - i * 0.6, 1 - t, i === 1 ? palette_1.PALETTE.sunbeam : palette_1.PALETTE.leafLight);
        }
        return;
    }
    // 姿态形变
    var attack = fxx.attackPulse === undefined ? 0 : (0, ease_1.clamp01)(fxx.attackPulse);
    var hurt = fxx.counterHit === undefined ? 0 : (0, ease_1.clamp01)(fxx.counterHit);
    var pose = attack > 0.35 ? 'attack' : hurt > 0.35 ? 'hurt' : opts.pose || 'idle';
    var bobAmp = def.bodyRadius * scale * 0.06;
    var bobY = pose === 'idle' ? -Math.sin((time / 1000) * timing_1.TIMING.RUN_BOB_HZ * TAU) * bobAmp : 0;
    var lunge = pose === 'attack' ? timing_1.TIMING.ATTACK_LUNGE * attack * scale : 0;
    var recoil = pose === 'hurt' ? -8 * hurt : 0;
    var dragging = !!opts.dragging;
    var drawScale = dragging ? scale * 1.12 : scale;
    var x = opts.x + (lunge + recoil) * facing;
    // 地面投影（拖拽时是更淡的草影，不带底座）
    if (opts.showShadow !== false) {
        ctx.save();
        ctx.globalAlpha = dragging ? 0.14 : 0.2;
        (0, paint_1.drawSoftGroundShadow)(ctx, x, opts.y + 2, def.bodyRadius * scale * (dragging ? 0.9 : 1.15), unit.id * 3 + 5);
        ctx.restore();
    }
    var baseY = opts.y + bobY;
    var usedImage = drawUnitImage(ctx, unit.species, x, baseY, drawScale, facing, alpha);
    if (!usedImage) {
        // 受击白闪：同一套几何用纸白再画一遍（0.08s），不做滤镜发光
        var flash = fxx.hitFlash === undefined ? 0 : (0, ease_1.clamp01)(fxx.hitFlash);
        ctx.save();
        ctx.globalAlpha = alpha;
        drawSpeciesCreature(ctx, unit.species, unit.level, x, baseY, drawScale, time, {
            facing: facing,
            pose: pose,
            seedIndex: unit.id * 7 + 3,
        });
        if (flash > 0.02) {
            ctx.save();
            ctx.globalAlpha = alpha * 0.75 * flash;
            drawSpeciesCreature(ctx, unit.species, unit.level, x, baseY, drawScale, time, {
                facing: facing,
                pose: pose,
                seedIndex: unit.id * 7 + 3,
                tone: palette_1.PALETTE.creamMist,
            });
            ctx.restore();
        }
        ctx.restore();
    }
    // 受击抖动 ±4px（命中方向）
    if (hurt > 0.35) {
        var dir = fxx.hitDir === undefined ? 1 : fxx.hitDir >= 0 ? 1 : -1;
        ctx.save();
        ctx.globalAlpha = 0.4 * hurt;
        ctx.fillStyle = palette_1.PALETTE.creamMist;
        (0, brush_1.blobPath)(ctx, x + dir * 14 - 10, baseY - def.bodyRadius * scale * 1.6 - 10, 20, 20, 1.4, unit.id * 5);
        ctx.fill();
        ctx.restore();
    }
    // 血量环（拖拽态与 ghost 不画环；只允许环形表达血量）
    if (opts.showRing !== false && !dragging && !opts.ghost) {
        var ratio = unit.maxHp > 0 ? (0, ease_1.clamp01)(unit.hp / unit.maxHp) : 0;
        var shieldRatio = unit.maxHp > 0 ? (0, ease_1.clamp01)(unit.shield / (unit.maxHp * timing_1.TIMING.SHIELD_CAP_RATIO)) : 0;
        var ghostRatio = opts.ghostHp === undefined || unit.maxHp <= 0 ? ratio : (0, ease_1.clamp01)(opts.ghostHp / unit.maxHp);
        (0, hpring_1.drawHpRing)(ctx, x, baseY - def.bodyRadius * scale * 1.05, def.ringRadius * drawScale, ratio, {
            time: time,
            seedIndex: unit.id * 11,
            ghostRatio: ghostRatio,
            shieldRatio: shieldRatio,
            shieldPulse: fxx.shieldRipple,
            commandTarget: !!opts.commandTarget,
            alpha: alpha,
        });
        if (opts.statuses && opts.statuses.length > 0) {
            (0, hpring_1.drawStatusIcons)(ctx, x, baseY - def.bodyRadius * scale * 1.05, def.ringRadius * drawScale, opts.statuses, 3);
        }
        // 选中：环外一层暖色薄光（不是高亮框）
        if (opts.selected) {
            ctx.save();
            ctx.globalAlpha = 0.28;
            (0, paint_1.drawSoftGroundShadow)(ctx, x, baseY + 2, def.bodyRadius * scale * 1.5, unit.id * 13);
            ctx.restore();
        }
    }
    // 合并/进化开花（combineBloom 由场景用 scale 表达，这里给一点花瓣）
    if (death === 0 && unit.level >= 3 && pose === 'idle') {
        var t = (time % 3200) / 3200;
        if (t < 0.2) {
            ctx.save();
            ctx.globalAlpha = 0.5 * (0, ease_1.easeOutBack)(t / 0.2);
            (0, paint_1.drawFlower)(ctx, x + def.bodyRadius * scale * 0.9, baseY - def.bodyRadius * scale * 2.1, 7, palette_1.PALETTE.blossom, unit.id * 17);
            ctx.restore();
        }
    }
}
/** 血量环半径的公开取值（拖拽/命中测试用）。 */
function unitRingRadius(species, scale) {
    var s = scale === undefined ? 1 : scale;
    return species_1.SPECIES[species].ringRadius * s;
}
/** 一级到三级的倍率（渲染层换算 HP 环/体型用，来源同 config）。 */
function levelOf(level) {
    if (level >= 3)
        return 3;
    if (level === 2)
        return 2;
    return 1;
}
/** 让营地/图鉴可以拿到一个稳定相位（同一只动物每次画的抖动一致）。 */
function stableSeed(id) {
    return Math.abs(Math.round(id)) % 977;
}
/** 供绘制骨架调试：把关键锚点画出来（默认不调用，tools 预览脚本会用）。 */
function debugAnchors(ctx, species, cx, baseY, scale) {
    var def = species_1.SPECIES[species];
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = palette_1.PALETTE.berry;
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.lineTo(cx, baseY - def.bodyRadius * 2.4 * scale);
    ctx.stroke();
    (0, brush_1.tracePath)(ctx, ellipsePts(cx, baseY - def.bodyRadius * scale * 1.5, def.ringRadius * scale, def.ringRadius * scale, 1, 0.02), true);
    ctx.restore();
}
