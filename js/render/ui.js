"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawScoreboardPanel = exports.easeOutBack = exports.easeOutCubic = exports.bob = exports.roundRectPath = exports.drawVine = exports.paperBase = void 0;
exports.drawPlateWoodPatch = drawPlateWoodPatch;
exports.drawWoodPanel = drawWoodPanel;
exports.drawButton = drawButton;
exports.drawGear = drawGear;
exports.drawSunCoin = drawSunCoin;
exports.drawBackButton = drawBackButton;
exports.drawTabBar = drawTabBar;
exports.drawTitlePlate = drawTitlePlate;
exports.drawTipBubble = drawTipBubble;
exports.drawIconButton = drawIconButton;
exports.drawProgressLeaf = drawProgressLeaf;
exports.drawToast = drawToast;
/**
 * 通用 UI 零件：木牌面板、手绘按钮、齿轮、阳光币、返回钮、页签、标题牌、提示气泡、
 * 图标按钮、叶片进度条、Toast。全部走手绘生成器，颜色只来自 theme/palette。
 */
var layout_1 = require("../config/layout");
var palette_1 = require("../config/palette");
var brush_1 = require("../ui/brush");
Object.defineProperty(exports, "roundRectPath", { enumerable: true, get: function () { return brush_1.roundRectPath; } });
var ease_1 = require("../ui/ease");
Object.defineProperty(exports, "bob", { enumerable: true, get: function () { return ease_1.bob; } });
Object.defineProperty(exports, "easeOutBack", { enumerable: true, get: function () { return ease_1.easeOutBack; } });
Object.defineProperty(exports, "easeOutCubic", { enumerable: true, get: function () { return ease_1.easeOutCubic; } });
var theme_1 = require("../ui/theme");
var paint_1 = require("./paint");
Object.defineProperty(exports, "drawVine", { enumerable: true, get: function () { return paint_1.drawVine; } });
Object.defineProperty(exports, "paperBase", { enumerable: true, get: function () { return paint_1.paperBase; } });
var TAU = Math.PI * 2;
function rectPts(x, y, w, h) {
    return [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ];
}
var TONES = {
    bark: { face: palette_1.PALETTE.barkLight, edge: palette_1.PALETTE.bark, text: palette_1.PALETTE.creamMist },
    paper: { face: palette_1.PALETTE.paper, edge: palette_1.PALETTE.creamMist, text: palette_1.PALETTE.inkSoft },
    leaf: { face: palette_1.PALETTE.leafMid, edge: palette_1.PALETTE.forestMid, text: palette_1.PALETTE.creamMist },
    soil: { face: palette_1.PALETTE.soil, edge: palette_1.PALETTE.bark, text: palette_1.PALETTE.inkSoft },
};
/**
 * 用**底板自身的像素**铺一块木底（1:1 取样 + 镜像交替平铺，接缝处像素天然连续）。
 *
 * 为什么需要它：底板 `ui-market-wide.jpg` 在五个卡位里烘死了整张样例卡，
 * 必须盖掉才能画自己的卡；但铺一块程序化 bark 木栏去盖，屏幕上就是
 * 「木栏压着底板木架」两套 UI 叠在一起。按提示词 0-①「冲突时保留被压着的那一版」，
 * 这里不再另画一套风格，而是**取底板自己的边缘木纹**补上去——
 * 补丁与底板同源，玩家读到的仍是同一张木架。
 *
 * `strips` 是按顺序拼成一个 tile 的取材条（图像像素坐标，通常取左右两条边缘），
 * tile 以「正向 → 镜像 → 正向 → …」交替铺满 `dest`：
 * 镜像后相邻边界是同一列像素，所以看不出拼贴接缝。
 */
function drawPlateWoodPatch(ctx, img, dest, strips, anchorX) {
    if (!img || !strips.length)
        return;
    var tileW = 0;
    for (var i = 0; i < strips.length; i++)
        tileW += strips[i].w;
    if (tileW <= 0)
        return;
    // 平铺相位锚点：同一片区域分几次补（例如避开圆牌而拆成两块）时传同一个 anchorX，
    // 接缝两侧的木纹才对得上，不会出现错位的竖纹。
    var ax = anchorX === undefined ? dest.x : anchorX;
    var k0 = Math.floor((dest.x - ax) / tileW);
    ctx.save();
    ctx.beginPath();
    ctx.rect(dest.x, dest.y, dest.w, dest.h);
    ctx.clip();
    var n = Math.ceil((dest.x - ax + dest.w) / tileW) + 1;
    for (var j = 0; j < n; j++) {
        var k = k0 + j;
        var dx0 = ax + k * tileW;
        if (dx0 >= dest.x + dest.w)
            break;
        if (dx0 + tileW <= dest.x)
            continue;
        ctx.save();
        ctx.translate(dx0, 0);
        if (((k % 2) + 2) % 2 === 1) {
            ctx.translate(tileW, 0);
            ctx.scale(-1, 1);
        }
        var ox = 0;
        for (var i = 0; i < strips.length; i++) {
            var s = strips[i];
            ctx.drawImage(img, s.x, s.y, s.w, s.h, ox, dest.y, s.w, dest.h);
            ox += s.w;
        }
        ctx.restore();
    }
    ctx.restore();
}
/** 木 / 纸面板。每个面板都带手绘描边，绝不出现硬边矩形。 */
function drawWoodPanel(ctx, x, y, w, h, opts) {
    var tone = TONES[(opts && opts.tone) || 'bark'] || TONES.bark;
    var radius = (opts && opts.radius) || theme_1.RADIUS.panel;
    var seed = (opts && opts.seedIndex) || Math.round(x * 7 + y * 13 + w);
    var alpha = opts && opts.alpha !== undefined ? opts.alpha : 0.98;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (tone.face === palette_1.PALETTE.barkLight)
        (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 1);
    var r = Math.max(8, Math.min(radius, Math.min(w, h) / 2));
    var pts = (0, brush_1.roundedRectPoints)(x, y, w, h, r);
    (0, brush_1.fillWatercolor)(ctx, pts, tone.face, { alpha: 0.97, layers: 1, wetEdge: true, seedIndex: seed });
    if (tone.face === palette_1.PALETTE.barkLight)
        (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 2);
    (0, brush_1.strokeInk)(ctx, pts, { width: theme_1.STROKE + 0.6, close: true, color: tone.edge, seedIndex: seed + 3, jitter: 1.4 });
    ctx.restore();
}
/** 手绘按钮：皮革/叶片底 + 描边 + 上下浮动的字。 */
function drawButton(ctx, x, y, w, h, label, opts) {
    var state = (opts && opts.state) || 'normal';
    var time = (opts && opts.time) || 0;
    var radius = (opts && opts.radius) || layout_1.LAYOUT.BUTTON_RADIUS;
    var disabled = state === 'disabled';
    var pressed = state === 'pressed';
    var toneKey = (opts && opts.tone) || 'leaf';
    var green = toneKey === 'leaf' || toneKey === 'berry';
    var face = disabled
        ? toneKey === 'bark'
            ? (0, palette_1.tint)(palette_1.PALETTE.barkLight, 0.42, palette_1.PALETTE.inkSoft)
            : palette_1.PALETTE.moss
        : toneKey === 'bark'
            ? palette_1.PALETTE.barkLight
            : toneKey === 'berry'
                ? palette_1.PALETTE.berry
                : toneKey === 'sun'
                    ? palette_1.PALETTE.sunset
                    : palette_1.PALETTE.leafMid;
    var edge = disabled
        ? toneKey === 'bark'
            ? palette_1.PALETTE.bark
            : palette_1.PALETTE.forestMid
        : toneKey === 'bark'
            ? palette_1.PALETTE.bark
            : toneKey === 'berry'
                ? (0, palette_1.tint)(palette_1.PALETTE.berry, 0.3, palette_1.PALETTE.inkSoft)
                : palette_1.PALETTE.forestDeep;
    var seed = Math.round(x * 3 + y * 5 + w);
    var dy = pressed ? 3 : 0;
    var r = Math.max(10, Math.min(radius, h / 2));
    ctx.save();
    ctx.translate(0, dy);
    // 底影
    ctx.save();
    ctx.globalAlpha = disabled ? 0.1 : 0.24;
    (0, brush_1.fillWatercolor)(ctx, (0, brush_1.roundedRectPoints)(x + 2, y + 6, w, h, r), palette_1.PALETTE.forestDeep, { alpha: 0.6, layers: 1, seedIndex: seed });
    ctx.restore();
    // 木/叶面板
    var pts = (0, brush_1.roundedRectPoints)(x, y, w, h, r);
    (0, brush_1.fillWatercolor)(ctx, pts, face, { alpha: disabled ? 0.75 : 0.98, layers: 1, wetEdge: true, seedIndex: seed + 1 });
    if (toneKey === 'bark' && !disabled)
        (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 2);
    // 顶缘高光 + 底缘暗线：做出木牌的厚度
    (0, brush_1.strokeInk)(ctx, [{ x: x + r, y: y + 3 }, { x: x + w - r, y: y + 3 }], {
        width: 3, color: (0, palette_1.rgba)((0, palette_1.tint)(face, 0.5, palette_1.PALETTE.creamMist), 0.5), seedIndex: seed + 6, jitter: 0.6,
    });
    (0, brush_1.strokeInk)(ctx, [{ x: x + r, y: y + h - 3 }, { x: x + w - r, y: y + h - 3 }], {
        width: 3, color: (0, palette_1.rgba)((0, palette_1.tint)(face, 0.4, palette_1.PALETTE.inkSoft), 0.45), seedIndex: seed + 7, jitter: 0.6,
    });
    (0, brush_1.strokeInk)(ctx, pts, { width: theme_1.STROKE + 0.9, close: true, color: edge, seedIndex: seed + 3, jitter: 1.2 });
    // 绿叶端饰（只给叶片底色的按钮，木牌按钮不加）
    if (green && !disabled && h >= 34) {
        (0, paint_1.drawLeaf)(ctx, x + 16, y + h / 2, Math.min(15, h * 0.34), 1.2, palette_1.PALETTE.leafLight, seed + 4);
        (0, paint_1.drawLeaf)(ctx, x + w - 16, y + h / 2, Math.min(15, h * 0.34), Math.PI - 1.2, palette_1.PALETTE.leafLight, seed + 5);
    }
    // 文字
    var size = (0, theme_1.fitSize)(ctx, label, w - 34, Math.min(theme_1.FONT.body, h * 0.46));
    var txtColor = disabled ? (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.7) : green ? palette_1.PALETTE.creamMist : palette_1.PALETTE.inkSoft;
    // 浅色底（绿叶 / 阳光）上奶油字必须配深色描边；深色底（木牌 / 莓红）沿用奶油描边
    var edgeColor = green ? palette_1.PALETTE.forestDeep : palette_1.PALETTE.creamMist;
    (0, theme_1.textOutlined)(ctx, label, x + w / 2, y + h * 0.53, size, txtColor, 'center', green ? 2.6 : 2.2, edgeColor);
    ctx.restore();
}
/** 齿轮（设置）：木齿轮 + 叶片装饰。 */
function drawGear(ctx, x, y, size, pressed) {
    var cx = x + size / 2;
    var cy = y + size / 2;
    var r = size * 0.36;
    var seed = 2101;
    ctx.save();
    ctx.translate(0, pressed ? 2 : 0);
    // 齿
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * TAU;
        var tx = cx + Math.cos(a) * r * 1.42;
        var ty = cy + Math.sin(a) * r * 1.42;
        var tooth = [
            { x: tx + Math.cos(a + Math.PI / 2) * 6, y: ty + Math.sin(a + Math.PI / 2) * 6 },
            { x: tx + Math.cos(a - Math.PI / 2) * 6, y: ty + Math.sin(a - Math.PI / 2) * 6 },
            { x: cx + Math.cos(a - 0.24) * r * 1.05, y: cy + Math.sin(a - 0.24) * r * 1.05 },
            { x: cx + Math.cos(a + 0.24) * r * 1.05, y: cy + Math.sin(a + 0.24) * r * 1.05 },
        ];
        (0, brush_1.fillWatercolor)(ctx, tooth, palette_1.PALETTE.barkLight, { alpha: 0.98, layers: 1, seedIndex: seed + i });
        (0, brush_1.strokeInk)(ctx, tooth, { width: 2, close: true, seedIndex: seed + 10 + i, jitter: 0.7 });
    }
    // 圆盘
    var disc = [];
    for (var i = 0; i < 18; i++) {
        var a = (i / 18) * TAU;
        var k = 1 + (0, brush_1.noiseAt)(i, seed + 20) * 0.05;
        disc.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
    }
    (0, brush_1.fillWatercolor)(ctx, disc, palette_1.PALETTE.barkLight, { alpha: 0.98, layers: 1, seedIndex: seed + 21 });
    (0, paint_1.woodGrain)(ctx, cx - r, cy - r, r * 2, r * 2, seed + 22);
    (0, brush_1.strokeInk)(ctx, disc, { width: 2.6, close: true, seedIndex: seed + 23, jitter: 1.0 });
    // 中心孔
    (0, brush_1.fillWatercolor)(ctx, disc.map(function (p) { return ({ x: cx + (p.x - cx) * 0.3, y: cy + (p.y - cy) * 0.3 }); }), palette_1.PALETTE.forestDeep, {
        alpha: 0.9, layers: 1, seedIndex: seed + 24,
    });
    (0, paint_1.drawLeaf)(ctx, cx + r * 0.9, cy - r * 0.9, 12, -0.5, palette_1.PALETTE.leafMid, seed + 25);
    ctx.restore();
}
/** 阳光币：太阳圆牌 + 光线；`delta < 0` 时不显示数字（例如营地纯装饰）。 */
function drawSunCoin(ctx, x, y, size, delta, time) {
    var cx = x + size / 2;
    var cy = y + size / 2;
    var r = size * 0.36;
    var seed = 2201;
    ctx.save();
    // 光线
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * TAU + Math.sin(time / 2600) * 0.06;
        var len = r * (1.5 + 0.08 * Math.sin(time / 700 + i));
        (0, brush_1.strokeInk)(ctx, [{ x: cx + Math.cos(a) * r * 1.1, y: cy + Math.sin(a) * r * 1.1 }, { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len }], {
            width: 3, color: (0, palette_1.rgba)(palette_1.PALETTE.sunset, 0.8), seedIndex: seed + i, jitter: 0.8,
        });
    }
    var disc = [];
    for (var i = 0; i < 18; i++) {
        var a = (i / 18) * TAU;
        var k = 1 + (0, brush_1.noiseAt)(i, seed + 30) * 0.05;
        disc.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
    }
    (0, brush_1.fillWatercolor)(ctx, disc, palette_1.PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: seed + 31 });
    (0, brush_1.fillWatercolor)(ctx, disc.map(function (p) { return ({ x: cx + (p.x - cx) * 0.72, y: cy + (p.y - cy) * 0.72 }); }), (0, palette_1.tint)(palette_1.PALETTE.sunbeam, 0.18, palette_1.PALETTE.paper), {
        alpha: 0.9, layers: 1, seedIndex: seed + 32,
    });
    (0, brush_1.strokeInk)(ctx, disc, { width: 2.6, close: true, color: palette_1.PALETTE.sunset, seedIndex: seed + 33, jitter: 1.0 });
    if (delta >= 0) {
        var t = '' + Math.round(delta);
        var fs = (0, theme_1.fitSize)(ctx, t, r * 1.7, theme_1.FONT.coin);
        (0, theme_1.textOutlined)(ctx, t, cx, cy + 1, fs, palette_1.PALETTE.inkSoft, 'center', 0);
    }
    ctx.restore();
}
/** 左上返回：卷叶箭头。 */
function drawBackButton(ctx, x, y, size, pressed, time) {
    var t = time || 0;
    ctx.save();
    ctx.translate(0, pressed ? 2 : 0);
    var pts = rectPts(x, y, size, size);
    (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.creamMist, { alpha: 0.97, layers: 1, seedIndex: 2301 });
    (0, brush_1.strokeInk)(ctx, pts, { width: theme_1.STROKE, close: true, seedIndex: 2302, jitter: 1.2 });
    var cx = x + size / 2;
    var cy = y + size / 2;
    var w = size * 0.3;
    var head = [
        { x: cx - w, y: cy },
        { x: cx + w * 0.2, y: cy - w * 0.8 },
        { x: cx + w * 0.2, y: cy + w * 0.8 },
    ];
    (0, brush_1.fillWatercolor)(ctx, head, palette_1.PALETTE.forestMid, { alpha: 0.98, layers: 1, seedIndex: 2303 });
    (0, brush_1.strokeInk)(ctx, head, { width: 2.4, close: true, seedIndex: 2304, jitter: 0.8 });
    (0, brush_1.strokeInk)(ctx, [{ x: cx - w * 0.1, y: cy }, { x: cx + w, y: cy }], { width: 3.4, color: palette_1.PALETTE.forestMid, seedIndex: 2305, jitter: 0.6 });
    (0, paint_1.drawLeaf)(ctx, x + size * 0.18, y + size * 0.2, 12, -0.6 + Math.sin(t / 500) * 0.15, palette_1.PALETTE.leafMid, 2306);
    ctx.restore();
}
/** 顶部页签条：木牌 + 选中叶片。 */
function drawTabBar(ctx, x, y, w, h, tabs, active, time) {
    ctx.save();
    var pad = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, pad, palette_1.PALETTE.barkLight, { alpha: 0.96, layers: 1, seedIndex: 2401 });
    (0, paint_1.woodGrain)(ctx, x, y, w, h, 2402);
    (0, brush_1.strokeInk)(ctx, pad, { width: theme_1.STROKE, close: true, seedIndex: 2403, jitter: 1.3 });
    var colW = w / Math.max(1, tabs.length);
    for (var i = 0; i < tabs.length; i++) {
        var tx = x + colW * i;
        var on = i === active;
        if (on) {
            ctx.save();
            var tab = rectPts(tx + 6, y + 6, colW - 12, h - 12);
            (0, brush_1.fillWatercolor)(ctx, tab, palette_1.PALETTE.creamMist, { alpha: 0.96, layers: 1, seedIndex: 2410 + i });
            (0, brush_1.strokeInk)(ctx, tab, { width: 2.4, close: true, seedIndex: 2420 + i, jitter: 1.0 });
            ctx.restore();
        }
        var size = (0, theme_1.fitSize)(ctx, tabs[i], colW - 26, theme_1.FONT.entry);
        (0, theme_1.textOutlined)(ctx, tabs[i], tx + colW / 2, y + h * 0.53, size, on ? palette_1.PALETTE.inkSoft : (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.85), 'center', 0);
        if (on) {
            (0, paint_1.drawLeaf)(ctx, tx + colW / 2, y + h - 8, 14, -0.4 + Math.sin(time / 500 + i) * 0.15, palette_1.PALETTE.leafLight, 2430 + i);
        }
    }
    ctx.restore();
}
/** 大标题木牌。 */
function drawTitlePlate(ctx, cx, y, w, h, title, sub) {
    ctx.save();
    var x = cx - w / 2;
    var pts = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.barkLight, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: 2501 });
    (0, paint_1.woodGrain)(ctx, x, y, w, h, 2502);
    (0, brush_1.strokeInk)(ctx, pts, { width: theme_1.STROKE + 1, close: true, seedIndex: 2503, jitter: 1.4 });
    var size = (0, theme_1.fitSize)(ctx, title, w - 60, theme_1.FONT.h1);
    (0, theme_1.textOutlined)(ctx, title, cx, y + h * (sub ? 0.36 : 0.52), size, palette_1.PALETTE.inkSoft, 'center', 0);
    if (sub)
        (0, theme_1.textPlain)(ctx, sub, cx, y + h * 0.74, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.75), 'center');
    (0, paint_1.drawLeaf)(ctx, x + 20, y + h / 2, 20, 1.2, palette_1.PALETTE.leafMid, 2504);
    (0, paint_1.drawLeaf)(ctx, x + w - 20, y + h / 2, 20, Math.PI - 1.2, palette_1.PALETTE.leafMid, 2505);
    ctx.restore();
}
/** 提示气泡（叶子尾巴指向 tailX）。 */
function drawTipBubble(ctx, cx, y, w, h, text, time, tailX) {
    ctx.save();
    var x = cx - w / 2;
    var pop = 1 + Math.sin(time / 400) * 0.015;
    ctx.translate(cx, y + h / 2);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -(y + h / 2));
    var pts = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.creamMist, { alpha: 0.98, layers: 1, seedIndex: 2601 });
    (0, brush_1.strokeInk)(ctx, pts, { width: 2.6, close: true, seedIndex: 2602, jitter: 1.1 });
    var tx = tailX === undefined ? cx : tailX;
    var tail = [
        { x: tx - 10, y: y + h - 2 },
        { x: tx + 10, y: y + h - 2 },
        { x: tx, y: y + h + 12 },
    ];
    (0, brush_1.fillWatercolor)(ctx, tail, palette_1.PALETTE.creamMist, { alpha: 0.98, layers: 1, seedIndex: 2603 });
    (0, brush_1.strokeInk)(ctx, tail, { width: 2.2, close: true, seedIndex: 2604, jitter: 0.8 });
    var size = (0, theme_1.fitSize)(ctx, text, w - 26, theme_1.FONT.entry);
    (0, theme_1.textOutlined)(ctx, text, cx, y + h * 0.55, size, palette_1.PALETTE.berry, 'center', 0);
    ctx.restore();
}
/** 圆形图标按钮：kind 决定图形（back / close / info / share / refresh）。 */
function drawIconButton(ctx, x, y, size, kind, pressed, time) {
    ctx.save();
    ctx.translate(0, pressed ? 2 : 0);
    var cx = x + size / 2;
    var cy = y + size / 2;
    var r = size / 2 - 2;
    var disc = [];
    for (var i = 0; i < 18; i++) {
        var a = (i / 18) * TAU;
        var k = 1 + (0, brush_1.noiseAt)(i, 2700) * 0.05;
        disc.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
    }
    (0, brush_1.fillWatercolor)(ctx, disc, palette_1.PALETTE.creamMist, { alpha: 0.96, layers: 1, seedIndex: 2701 });
    (0, brush_1.strokeInk)(ctx, disc, { width: 2.6, close: true, seedIndex: 2702, jitter: 1.0 });
    var w = size * 0.22;
    if (kind === 'back') {
        var head = [
            { x: cx - w, y: cy },
            { x: cx + w * 0.2, y: cy - w * 0.8 },
            { x: cx + w * 0.2, y: cy + w * 0.8 },
        ];
        (0, brush_1.fillWatercolor)(ctx, head, palette_1.PALETTE.forestMid, { alpha: 0.98, layers: 1, seedIndex: 2703 });
        (0, brush_1.strokeInk)(ctx, head, { width: 2, close: true, seedIndex: 2704, jitter: 0.7 });
    }
    else if (kind === 'close') {
        for (var i = -1; i <= 1; i += 2) {
            (0, brush_1.strokeInk)(ctx, [{ x: cx - w, y: cy - w * i }, { x: cx + w, y: cy + w * i }], { width: 3, color: palette_1.PALETTE.berry, seedIndex: 2705 + i, jitter: 0.6 });
        }
    }
    else if (kind === 'refresh') {
        (0, brush_1.strokeInk)(ctx, [
            { x: cx + w, y: cy - w * 0.4 },
            { x: cx + w * 0.4, y: cy - w },
            { x: cx - w * 0.6, y: cy - w * 0.2 },
            { x: cx - w * 0.2, y: cy + w },
            { x: cx + w * 0.8, y: cy + w * 0.6 },
        ], { width: 3, color: palette_1.PALETTE.forestMid, seedIndex: 2707, jitter: 0.8 });
    }
    else if (kind === 'share') {
        for (var i = 0; i < 3; i++) {
            var a = -Math.PI / 2 + (i / 3) * TAU;
            (0, brush_1.fillWatercolor)(ctx, [
                { x: cx + Math.cos(a) * w * 1.2 - 4, y: cy + Math.sin(a) * w * 1.2 - 4 },
                { x: cx + Math.cos(a) * w * 1.2 + 4, y: cy + Math.sin(a) * w * 1.2 - 4 },
                { x: cx + Math.cos(a) * w * 1.2 + 4, y: cy + Math.sin(a) * w * 1.2 + 4 },
                { x: cx + Math.cos(a) * w * 1.2 - 4, y: cy + Math.sin(a) * w * 1.2 + 4 },
            ], palette_1.PALETTE.leafMid, { alpha: 0.98, layers: 1, seedIndex: 2708 + i });
        }
    }
    else {
        // info
        (0, theme_1.textOutlined)(ctx, '?', cx, cy + 1, size * 0.5, palette_1.PALETTE.inkSoft, 'center', 0);
        (0, paint_1.drawLeaf)(ctx, cx, cy - r * 0.5, 10, -0.5, palette_1.PALETTE.leafMid, 2709);
    }
    if ((0, ease_1.cycle)(time, 3600, 0) < 0.05) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        (0, paint_1.drawSparkle)(ctx, cx + r * 0.7, cy - r * 0.7, 5, palette_1.PALETTE.sunbeam, 0.6);
        ctx.restore();
    }
    ctx.restore();
}
/** 叶片进度条（加载用）：藤 + 叶 + 光晕。 */
function drawProgressLeaf(ctx, x, y, w, h, progress, time) {
    var p = (0, ease_1.clamp01)(progress);
    ctx.save();
    var y0 = y + h / 2;
    (0, brush_1.strokeInk)(ctx, [{ x: x, y: y0 }, { x: x + w, y: y0 }], { width: 5, color: (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.7), seedIndex: 2801, jitter: 1.0 });
    (0, brush_1.strokeInk)(ctx, [{ x: x, y: y0 }, { x: x + w * p, y: y0 }], { width: 5.4, color: palette_1.PALETTE.leafLight, seedIndex: 2802, jitter: 1.2 });
    // 未走完的藤叶
    for (var i = 0; i < 6; i++) {
        var t = i / 6;
        if (t > p)
            break;
        (0, paint_1.drawLeaf)(ctx, x + w * t, y0 + Math.sin(time / 500 + i) * 2, 14, -0.5 + i, palette_1.PALETTE.leafMid, 2810 + i);
    }
    (0, paint_1.drawMossLight)(ctx, x + w * p, y0, 18, 0.6 + Math.sin(time / 300) * 0.15, 2820);
    ctx.restore();
}
/** 顶部 Toast（半透明叶脉纸）。 */
function drawToast(ctx, cx, y, text, alpha) {
    ctx.save();
    ctx.globalAlpha = (0, ease_1.clamp01)(alpha);
    var size = (0, theme_1.fitSize)(ctx, text, 560, theme_1.FONT.body);
    (0, theme_1.setFont)(ctx, size, 'normal');
    var tw = ctx.measureText(text).width + 56;
    var h = 46;
    var x = cx - tw / 2;
    var pts = rectPts(x, y, tw, h);
    (0, brush_1.fillWatercolor)(ctx, pts, (0, palette_1.tint)(palette_1.PALETTE.forestDeep, 0.5, palette_1.PALETTE.inkSoft), { alpha: 0.92, layers: 1, seedIndex: 2901 });
    (0, brush_1.strokeInk)(ctx, pts, { width: 2.4, close: true, color: palette_1.PALETTE.leafMid, seedIndex: 2902, jitter: 1.1 });
    (0, theme_1.textOutlined)(ctx, text, cx, y + h * 0.55, size, palette_1.PALETTE.creamMist, 'center', 0);
    (0, paint_1.drawLeaf)(ctx, x + 18, y + h / 2, 14, 1.2, palette_1.PALETTE.leafLight, 2903);
    (0, paint_1.drawLeaf)(ctx, x + tw - 18, y + h / 2, 14, Math.PI - 1.2, palette_1.PALETTE.leafLight, 2904);
    ctx.restore();
}
var sidebar_1 = require("./sidebar");
Object.defineProperty(exports, "drawScoreboardPanel", { enumerable: true, get: function () { return sidebar_1.drawScoreboardPanel; } });
