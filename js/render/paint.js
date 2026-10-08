"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paperBase = paperBase;
exports.woodGrain = woodGrain;
exports.leafPath = leafPath;
exports.drawLeaf = drawLeaf;
exports.drawVine = drawVine;
exports.drawBroadleafTree = drawBroadleafTree;
exports.drawPineTree = drawPineTree;
exports.drawBush = drawBush;
exports.drawFern = drawFern;
exports.drawMushroom = drawMushroom;
exports.drawPebble = drawPebble;
exports.drawGrassTuft = drawGrassTuft;
exports.drawFlower = drawFlower;
exports.drawClover = drawClover;
exports.drawRipple = drawRipple;
exports.drawFirefly = drawFirefly;
exports.drawSunMote = drawSunMote;
exports.drawFogBand = drawFogBand;
exports.drawCloud = drawCloud;
exports.drawSparkle = drawSparkle;
exports.drawSoftGroundShadow = drawSoftGroundShadow;
exports.drawWoodSign = drawWoodSign;
exports.drawStone = drawStone;
exports.drawMossLight = drawMossLight;
exports.alphaOf = alphaOf;
exports.boundsOf = boundsOf;
/**
 * 渲染层共享画笔库（父级约定：ui/ 目录已冻结，新增绘图工具放这里）。
 *
 * 所有道具/背景元素都只用 `ui/brush` 的手绘路径 + 水彩填充来画：
 * 没有 `strokeRect`、没有完美圆弧、没有渐变按钮、没有发光。
 */
var palette_1 = require("../config/palette");
var brush_1 = require("../ui/brush");
var brush_2 = require("../ui/brush");
/** 画面上的浅色水彩底（天空、面板、卡面通用）。 */
function paperBase(ctx, x, y, w, h, color, alpha, seedIndex) {
    var si = seedIndex === undefined ? 0 : seedIndex;
    var pts = [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ];
    (0, brush_1.fillWatercolor)(ctx, pts, color, {
        alpha: alpha === undefined ? 0.9 : alpha,
        layers: 2,
        wetEdge: false,
        seedIndex: si,
    });
}
/** 木纹（木牌、卡框、替补席木架都用它）。 */
function woodGrain(ctx, x, y, w, h, seedIndex, vertical) {
    var lines = Math.max(3, Math.floor((vertical ? w : h) / 7));
    var span = vertical ? h : w;
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = (0, palette_1.tint)(palette_1.PALETTE.bark, 0.4, palette_1.PALETTE.forestDeep);
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (var i = 0; i < lines; i++) {
        var off = ((i + 0.5) / lines) * (vertical ? w : h) + (0, brush_2.noiseAt)(i * 3, seedIndex) * 2.2;
        var pts = [];
        var segs = Math.max(3, Math.floor(span / 26));
        for (var k = 0; k <= segs; k++) {
            var t = k / segs;
            var wob = (0, brush_2.noiseAt)(i * 11 + k * 5, seedIndex) * 1.8;
            var a = vertical ? x + off + wob : x + t * span;
            var b = vertical ? y + t * span : y + off + wob;
            pts.push({ x: a, y: b });
        }
        (0, brush_1.tracePath)(ctx, (0, brush_1.jitterPoints)(pts, 0.7, seedIndex + i * 7, false), false);
        ctx.stroke();
    }
    ctx.restore();
}
/** 叶片路径（尖端朝向 angle）。 */
function leafPath(ctx, cx, cy, len, angle, seedIndex, widthScale) {
    var wf = widthScale === undefined ? 0.46 : widthScale;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var nx = -sin;
    var ny = cos;
    var pts = [];
    var steps = 12;
    for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        var along = (t - 0.5) * len;
        var half = Math.sin(t * Math.PI) * len * wf * (1 + (0, brush_2.noiseAt)(i, seedIndex) * 0.1);
        pts.push({ x: cx + cos * along + nx * half, y: cy + sin * along + ny * half });
    }
    for (var i = steps; i >= 0; i--) {
        var t = i / steps;
        var along = (t - 0.5) * len;
        var half = Math.sin(t * Math.PI) * len * wf * (1 + (0, brush_2.noiseAt)(i + 31, seedIndex) * 0.1);
        pts.push({ x: cx + cos * along - nx * half, y: cy + sin * along - ny * half });
    }
    return pts;
}
/** 画一片叶子（含中脉与一侧高光，§2.4 每个图标带一个暖色高光点）。 */
function drawLeaf(ctx, cx, cy, len, angle, color, seedIndex, outline) {
    var pts = leafPath(ctx, cx, cy, len, angle, seedIndex);
    (0, brush_1.fillWatercolor)(ctx, pts, color, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 3 });
    // 中脉
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    (0, brush_1.strokeInk)(ctx, [
        { x: cx - cos * len * 0.44, y: cy - sin * len * 0.44 },
        { x: cx + cos * len * 0.46, y: cy + sin * len * 0.46 },
    ], { width: 1.6, jitter: 0.6, color: (0, palette_1.tint)(color, 0.3, palette_1.PALETTE.forestDeep), seedIndex: seedIndex + 5 });
    // 暖色高光
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette_1.PALETTE.sunbeam;
    ctx.beginPath();
    ctx.arc(cx - sin * len * 0.1 + cos * len * 0.08, cy + cos * len * 0.1 + sin * len * 0.08, len * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (outline !== false)
        (0, brush_1.strokeInk)(ctx, pts, { width: 2.2, close: true, seedIndex: seedIndex + 7 });
}
/** 藤蔓：沿折线的细线 + 间隔小叶。 */
function drawVine(ctx, pts, seedIndex, opts) {
    var o = opts || {};
    var width = o.width === undefined ? 2.4 : o.width;
    var every = o.leafEvery === undefined ? 34 : o.leafEvery;
    var leafLen = o.leafLen === undefined ? 12 : o.leafLen;
    (0, brush_1.strokeInk)(ctx, pts, { width: width, jitter: 1.1, color: (0, palette_1.tint)(palette_1.PALETTE.bark, 0.25, palette_1.PALETTE.forestDeep), seedIndex: seedIndex });
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1];
        var b = pts[i];
        var d = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
        acc += d;
        if (acc >= every) {
            acc = 0;
            var ang = Math.atan2(b.y - a.y, b.x - a.x) + ((0, brush_2.noiseAt)(i, seedIndex + 9) > 0 ? 1.1 : -1.1);
            drawLeaf(ctx, b.x, b.y, leafLen, ang, o.color || palette_1.PALETTE.leafMid, seedIndex + i * 3, false);
        }
    }
}
/** 阔叶树（树冠用几个叠加水彩团块，避免死板圆）。 */
function drawBroadleafTree(ctx, x, baseY, height, canopy, seedIndex, sway) {
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
    (0, brush_1.fillWatercolor)(ctx, trunk, palette_1.PALETTE.bark, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, trunk, { width: 2.6, close: true, seedIndex: seedIndex + 2 });
    var cy = baseY - height * 0.92 + sw * 0.8;
    var r = height * 0.3;
    // 树冠：几个大团叠色，避免死板圆
    var blobs = 5;
    for (var i = 0; i < blobs; i++) {
        var a = (i / blobs) * Math.PI * 2;
        var ox = Math.cos(a) * r * 0.62;
        var oy = Math.sin(a) * r * 0.4;
        var rx = r * (0.95 + (0, brush_2.noiseAt)(i, seedIndex) * 0.12);
        var ry = r * 0.78;
        (0, brush_1.blobPath)(ctx, x + ox - rx, cy + oy - ry, rx * 2, ry * 2, 1.1, seedIndex + 20 + i);
        (0, brush_1.fillWatercolor)(ctx, [
            { x: x + ox - rx, y: cy + oy - ry },
            { x: x + ox + rx, y: cy + oy - ry },
            { x: x + ox + rx, y: cy + oy + ry },
            { x: x + ox - rx, y: cy + oy + ry },
        ], i % 2 === 0 ? canopy : (0, palette_1.tint)(canopy, 0.3, palette_1.PALETTE.forestDeep), {
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
/** 针叶树（远景剪影）。 */
function drawPineTree(ctx, x, baseY, height, color, seedIndex, alpha) {
    var w = height * 0.42;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (var i = 0; i < 4; i++) {
        var t = i / 4;
        var y = baseY - height * (0.24 + t * 0.72);
        var ww = w * (1.05 - t * 0.72);
        var pts = [
            { x: x - ww, y: y + height * 0.2 },
            { x: x, y: y - height * 0.18 },
            { x: x + ww, y: y + height * 0.2 },
        ];
        (0, brush_1.fillWatercolor)(ctx, pts, i % 2 === 0 ? color : (0, palette_1.tint)(color, 0.22, palette_1.PALETTE.forestDeep), {
            alpha: 0.92, layers: 2, wetEdge: false, seedIndex: seedIndex + i,
        });
        (0, brush_1.strokeInk)(ctx, pts, { width: 2.2, close: true, color: (0, palette_1.tint)(color, 0.5, palette_1.PALETTE.forestDeep), seedIndex: seedIndex + 5 + i });
    }
    ctx.restore();
}
/** 灌木团块。 */
function drawBush(ctx, x, y, rx, ry, color, seedIndex) {
    for (var i = 0; i < 3; i++) {
        var ox = (i - 1) * rx * 0.55;
        var oy = Math.abs(i - 1) * ry * 0.18;
        (0, brush_1.blobPath)(ctx, x + ox - rx * 0.7, y + oy - ry, rx * 1.4, ry * 2, 1.05, seedIndex + i * 3);
        (0, brush_1.fillWatercolor)(ctx, [
            { x: x + ox - rx * 0.7, y: y + oy - ry },
            { x: x + ox + rx * 0.7, y: y + oy - ry },
            { x: x + ox + rx * 0.7, y: y + oy + ry },
            { x: x + ox - rx * 0.7, y: y + oy + ry },
        ], i === 1 ? (0, palette_1.tint)(color, 0.16, palette_1.PALETTE.sunbeam) : color, {
            alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 10 + i,
        });
    }
}
/** 蕨类（中景细节）。 */
function drawFern(ctx, x, y, len, angle, color, seedIndex) {
    var leaves = 5;
    for (var i = 0; i < leaves; i++) {
        var a = angle + (i - (leaves - 1) / 2) * 0.42;
        var l = len * (0.62 + (0, brush_2.noiseAt)(i * 5, seedIndex) * 0.18);
        drawLeaf(ctx, x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5, l, a, color, seedIndex + i * 7, false);
    }
}
/** 蘑菇。 */
function drawMushroom(ctx, x, y, size, seedIndex) {
    var stem = [
        { x: x - size * 0.16, y: y },
        { x: x - size * 0.12, y: y - size * 0.6 },
        { x: x + size * 0.12, y: y - size * 0.6 },
        { x: x + size * 0.16, y: y },
    ];
    (0, brush_1.fillWatercolor)(ctx, stem, palette_1.PALETTE.creamMist, { alpha: 0.95, layers: 2, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, stem, { width: 1.8, close: true, seedIndex: seedIndex + 2 });
    var cap = [];
    for (var i = 0; i <= 12; i++) {
        var t = i / 12;
        cap.push({ x: x + (t - 0.5) * size, y: y - size * 0.58 - Math.sin(t * Math.PI) * size * 0.34 });
    }
    cap.push({ x: x + size * 0.5, y: y - size * 0.55 });
    cap.push({ x: x - size * 0.5, y: y - size * 0.55 });
    (0, brush_1.fillWatercolor)(ctx, cap, palette_1.PALETTE.berry, { alpha: 0.9, layers: 2, wetEdge: true, seedIndex: seedIndex + 3 });
    (0, brush_1.strokeInk)(ctx, cap, { width: 2.2, close: true, seedIndex: seedIndex + 4 });
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = palette_1.PALETTE.creamMist;
    for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + (i - 1) * size * 0.19, y - size * 0.72 + (i % 2) * size * 0.06, size * 0.055, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
/** 卵石（水边、棋盘收边）。 */
function drawPebble(ctx, x, y, rx, ry, seedIndex, tone) {
    (0, brush_1.blobPath)(ctx, x - rx, y - ry, rx * 2, ry * 2, 1.0, seedIndex);
    (0, brush_1.fillWatercolor)(ctx, [
        { x: x - rx, y: y - ry },
        { x: x + rx, y: y - ry },
        { x: x + rx, y: y + ry },
        { x: x - rx, y: y + ry },
    ], tone || palette_1.PALETTE.soil, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, [
        { x: x - rx * 0.95, y: y + ry * 0.2 },
        { x: x - rx * 0.2, y: y - ry * 0.9 },
        { x: x + rx * 0.9, y: y - ry * 0.3 },
        { x: x + rx * 0.85, y: y + ry * 0.6 },
        { x: x - rx * 0.5, y: y + ry * 0.8 },
    ], { width: 2.2, close: true, seedIndex: seedIndex + 2 });
}
/** 草丛（会随风摆）。 */
function drawGrassTuft(ctx, x, baseY, h, color, seedIndex, sway) {
    var blades = 5;
    var col = palette_1.PALETTE.leafMid;
    var seed = seedIndex === undefined ? 0 : seedIndex;
    var sw = sway === undefined ? 0 : sway;
    // 兼容两种调用：drawGrassTuft(ctx,x,baseY,h,color,seed,sway) 与 (ctx,x,baseY,h,seed)
    if (typeof color === 'number') {
        seed = color;
    }
    else if (typeof color === 'string') {
        col = color;
    }
    else if (typeof seedIndex === 'number' && typeof color === 'undefined') {
        seed = seedIndex;
    }
    void sw;
    ctx.save();
    ctx.globalAlpha = 0.95;
    for (var i = 0; i < blades; i++) {
        var dir = (i % 2 === 0 ? 1 : -1) * (0.35 + i * 0.16);
        var hh = h * (0.7 + (0, brush_2.noiseAt)(i * 3, seed) * 0.35);
        var pts = [
            { x: x, y: baseY },
            { x: x + dir * hh * 0.16 + sw * 0.4, y: baseY - hh * 0.5 },
            { x: x + dir * hh * 0.42 + sw, y: baseY - hh },
        ];
        (0, brush_1.strokeInk)(ctx, pts, {
            width: 2.6, jitter: 0.8, color: (0, palette_1.tint)(col, 0.2, i % 2 === 0 ? palette_1.PALETTE.forestDeep : palette_1.PALETTE.leafLight),
            seedIndex: seed + i,
        });
    }
    ctx.restore();
}
/** 小花。 */
function drawFlower(ctx, x, y, r, petalColor, seedIndex) {
    (0, brush_1.strokeInk)(ctx, [{ x: x, y: y + r * 2.2 }, { x: x, y: y }], { width: 1.8, jitter: 0.6, color: palette_1.PALETTE.leafMid, seedIndex: seedIndex + 1 });
    for (var i = 0; i < 5; i++) {
        var a = (i / 5) * Math.PI * 2 + (0, brush_2.noiseAt)(i, seedIndex) * 0.2;
        var px = x + Math.cos(a) * r * 0.7;
        var py = y + Math.sin(a) * r * 0.7;
        (0, brush_1.blobPath)(ctx, px - r * 0.55, py - r * 0.55, r * 1.1, r * 1.1, 0.9, seedIndex + 5 + i);
        (0, brush_1.fillWatercolor)(ctx, [
            { x: px - r * 0.55, y: py - r * 0.55 },
            { x: px + r * 0.55, y: py - r * 0.55 },
            { x: px + r * 0.55, y: py + r * 0.55 },
            { x: px - r * 0.55, y: py + r * 0.55 },
        ], petalColor, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seedIndex + 20 + i });
    }
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = palette_1.PALETTE.sunbeam;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
/** 三叶草。 */
function drawClover(ctx, x, y, r, seedIndex) {
    for (var i = 0; i < 3; i++) {
        var a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        drawLeaf(ctx, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 1.5, a, palette_1.PALETTE.leafMid, seedIndex + i * 6, false);
    }
}
/** 水面涟漪（落点/雨滴）。 */
function drawRipple(ctx, cx, cy, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = palette_1.PALETTE.creamMist;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    var pts = [];
    for (var i = 0; i <= 22; i++) {
        var a = (i / 22) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * r * (1 + (0, brush_2.noiseAt)(i, 5) * 0.05), y: cy + Math.sin(a) * r * 0.45 });
    }
    (0, brush_1.tracePath)(ctx, pts, true);
    ctx.stroke();
    ctx.restore();
}
/** 萤火虫（死亡消散、森间点缀）。 */
function drawFirefly(ctx, x, y, r, alpha, color) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = color || palette_1.PALETTE.sunbeam;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
/** 叶隙光斑（§2.5 sunbeam，alpha 0.06~0.12）。 */
function drawSunMote(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette_1.PALETTE.sunbeam;
    (0, brush_1.blobPath)(ctx, x - r, y - r * 0.72, r * 2, r * 1.44, 1.2, 77);
    ctx.fill();
    ctx.restore();
}
/** 雾带（时机揭示、敌半场遮挡）。 */
function drawFogBand(ctx, x, y, w, h, alpha, seedIndex) {
    var bands = 3;
    ctx.save();
    for (var i = 0; i < bands; i++) {
        var by = y + (i / bands) * h;
        var bh = h / bands * 1.5;
        ctx.globalAlpha = alpha * (0.55 + i * 0.14);
        ctx.fillStyle = i % 2 === 0 ? palette_1.PALETTE.creamMist : (0, palette_1.tint)(palette_1.PALETTE.creamMist, 0.2, palette_1.PALETTE.stream);
        ctx.beginPath();
        ctx.moveTo(x - 10, by + bh);
        var steps = 6;
        for (var k = 0; k <= steps; k++) {
            var t = k / steps;
            ctx.quadraticCurveTo(x + w * (t - 0.08), by + (0, brush_2.noiseAt)(k + i * 7, seedIndex) * bh * 0.5, x + w * t, by + bh * (0.45 + (0, brush_2.noiseAt)(k + i * 3, seedIndex) * 0.3));
        }
        ctx.lineTo(x + w + 10, by + bh * 1.4);
        ctx.lineTo(x - 10, by + bh * 1.4);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}
/** 云团。 */
function drawCloud(ctx, x, y, w, h, color, alpha, seedIndex) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (var i = 0; i < 3; i++) {
        var ox = (i - 1) * w * 0.28;
        var rx = w * (0.42 - Math.abs(i - 1) * 0.08);
        (0, brush_1.blobPath)(ctx, x + ox - rx, y - h * 0.5, rx * 2, h, 1.1, seedIndex + i * 4);
        ctx.fillStyle = i === 1 ? (0, palette_1.tint)(color, 0.12, palette_1.PALETTE.sunbeam) : color;
        ctx.fill();
    }
    ctx.restore();
}
/** 星辉/奖励闪光。 */
function drawSparkle(ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
    ctx.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
    ctx.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
/** 地面柔和投影（棋子/物件脚下，不用硬阴影）。 */
function drawSoftGroundShadow(ctx, cx, cy, rx, seedIndex) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = (0, palette_1.tint)(palette_1.PALETTE.forestDeep, 0.3, palette_1.PALETTE.soil);
    (0, brush_1.blobPath)(ctx, cx - rx, cy - rx * 0.26, rx * 2, rx * 0.55, 1.2, seedIndex);
    ctx.fill();
    ctx.restore();
}
/** 木牌路标（营地入口）。 */
function drawWoodSign(ctx, x, y, w, h, seedIndex) {
    (0, brush_1.strokeInk)(ctx, [{ x: x + w / 2, y: y + h }, { x: x + w / 2, y: y + h + h * 0.75 }], {
        width: 5, jitter: 1.0, color: palette_1.PALETTE.bark, seedIndex: seedIndex + 1,
    });
    (0, brush_1.roundRectPath)(ctx, x, y, w, h, 12, 1.1, seedIndex + 2);
    (0, brush_1.fillWatercolor)(ctx, [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ], palette_1.PALETTE.barkLight, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seedIndex + 3 });
    woodGrain(ctx, x + 6, y + 4, w - 12, h - 8, seedIndex + 4);
    (0, brush_1.strokeInk)(ctx, [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ], { width: 3, close: true, seedIndex: seedIndex + 5 });
}
/** 一块石头（可带苔）。 */
function drawStone(ctx, x, y, r, seedIndex, mossy) {
    var pts = [];
    for (var i = 0; i < 9; i++) {
        var a = (i / 9) * Math.PI * 2;
        var rr = r * (1 + (0, brush_2.noiseAt)(i, seedIndex) * 0.22);
        pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.72 });
    }
    (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.soil, { alpha: 0.94, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
    (0, brush_1.strokeInk)(ctx, pts, { width: 2.4, close: true, seedIndex: seedIndex + 2 });
    if (mossy) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = palette_1.PALETTE.moss;
        ctx.beginPath();
        ctx.arc(x - r * 0.2, y - r * 0.42, r * 0.34, Math.PI, Math.PI * 1.9);
        ctx.fill();
        ctx.restore();
    }
}
/** 苔藓光斑（§2.6.4 唯一允许的落点反馈）。 */
function drawMossLight(ctx, cx, cy, r, alpha, seedIndex) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette_1.PALETTE.leafLight;
    (0, brush_1.blobPath)(ctx, cx - r, cy - r * 0.55, r * 2, r * 1.1, 1.3, seedIndex);
    ctx.fill();
    ctx.globalAlpha = alpha * 1.5;
    ctx.strokeStyle = (0, palette_1.tint)(palette_1.PALETTE.leafLight, 0.25, palette_1.PALETTE.creamMist);
    ctx.lineWidth = 2.4;
    var ring = [];
    for (var i = 0; i <= 24; i++) {
        var a = (i / 24) * Math.PI * 2;
        ring.push({
            x: cx + Math.cos(a) * r * (1 + (0, brush_2.noiseAt)(i, seedIndex + 4) * 0.08),
            y: cy + Math.sin(a) * r * 0.56 * (1 + (0, brush_2.noiseAt)(i + 9, seedIndex + 4) * 0.08),
        });
    }
    (0, brush_1.tracePath)(ctx, ring, true);
    ctx.stroke();
    ctx.restore();
}
/** 便捷：从 rgba 取色，避免渲染层写魔法色。 */
function alphaOf(color, a) {
    return (0, palette_1.rgba)(color, a);
}
/** 便捷：包围盒（转出给其他模块用）。 */
function boundsOf(pts) {
    return (0, brush_1.bounds)(pts);
}
