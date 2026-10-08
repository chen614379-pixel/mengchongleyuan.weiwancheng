"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawSky = drawSky;
exports.drawForestLayer = drawForestLayer;
exports.drawSunSpecks = drawSunSpecks;
exports.drawVignette = drawVignette;
exports.drawWeather = drawWeather;
exports.weatherTint = weatherTint;
exports.weatherShort = weatherShort;
exports.battleLightBoost = battleLightBoost;
/**
 * 森林背景三件套（§2.5）：天空 / 三层视差 / 叶隙光斑 / 天气 / 暗角。
 *
 * 视差系数：far 0.10 · mid 0.35 · near 1.00。
 * 近景草丛按 0.5Hz 摆动 ±3px；所有元素都走 `ui/brush` 的手绘路径 + 水彩填充，
 * 不允许出现直线贴图、硬边矩形或渐变按钮式色块。
 */
var layout_1 = require("../config/layout");
var palette_1 = require("../config/palette");
var timing_1 = require("../config/timing");
var brush_1 = require("../ui/brush");
var ease_1 = require("../ui/ease");
var paint_1 = require("./paint");
/** -1~1 确定性噪声 → 0~1。 */
function rnd(i, seed) {
    return ((0, brush_1.noiseAt)(i, seed) + 1) / 2;
}
function softBand(ctx, x, y, w, h, color, alpha, seedIndex) {
    var pts = [
        { x: x - 20, y: y + h * 0.14 },
        { x: x + w * 0.5, y: y - h * 0.16 },
        { x: x + w + 20, y: y + h * 0.1 },
        { x: x + w + 20, y: y + h },
        { x: x - 20, y: y + h },
    ];
    (0, brush_1.fillWatercolor)(ctx, pts, color, { alpha: alpha, layers: 2, wetEdge: true, seedIndex: seedIndex });
}
/** 天空：暖色水彩洗 + 云 + 地平线雾气 + 右上暖光。 */
function drawSky(ctx, w, h, time) {
    ctx.save();
    softBand(ctx, 0, -6, w, h + 12, palette_1.PALETTE.paper, 0.99, 7);
    // 天空底色：上冷下暖两段水彩洗，边缘都是有机曲线。
    softBand(ctx, 0, -h * 0.05, w, h * 0.52, (0, palette_1.tint)(palette_1.PALETTE.skyWarm, 0.18, palette_1.PALETTE.paper), 0.72, 11);
    softBand(ctx, 0, h * 0.24, w, h * 0.3, (0, palette_1.tint)(palette_1.PALETTE.creamMist, 0.1, palette_1.PALETTE.sunset), 0.5, 23);
    // 右上暖光（Ghibli 逆光）：两层水彩团，无发光滤镜。
    var sunX = w * 0.72;
    var sunY = h * 0.16;
    for (var i = 0; i < 3; i++) {
        var r = 190 - i * 46;
        ctx.save();
        ctx.globalAlpha = 0.1 + i * 0.06;
        ctx.fillStyle = palette_1.PALETTE.sunbeam;
        (0, brush_1.blobPath)(ctx, sunX - r, sunY - r * 0.8, r * 2, r * 1.6, 1.5, 31 + i);
        ctx.fill();
        ctx.restore();
    }
    // 云：三层，缓慢横移。
    var clouds = [
        { x: w * 0.14, y: h * 0.13, w: 300, h: 66, a: 0.5, sp: 42000 },
        { x: w * 0.46, y: h * 0.07, w: 240, h: 52, a: 0.42, sp: 61000 },
        { x: w * 0.86, y: h * 0.2, w: 260, h: 58, a: 0.36, sp: 52000 },
    ];
    for (var i = 0; i < clouds.length; i++) {
        var c = clouds[i];
        var drift = ((0, ease_1.cycle)(time, c.sp, i * 900) - 0.5) * 70;
        (0, paint_1.drawCloud)(ctx, c.x + drift, c.y, c.w, c.h, (0, palette_1.tint)(palette_1.PALETTE.creamMist, 0.12, palette_1.PALETTE.paper), c.a, 40 + i * 9);
    }
    // 远山雾带：把天空与森林接上，避免出现硬地平线。
    (0, paint_1.drawFogBand)(ctx, -30, h * 0.3, w + 60, h * 0.22, 0.55, 77);
    (0, brush_1.paperGrain)(ctx, 0, 0, w, h * 0.5, 0.05, 5);
    ctx.restore();
}
/** 远景树影（三层视差的一层）。 */
function farTrees(ctx, w, h, off, time) {
    var baseY = h * 0.62;
    var count = 9;
    var step = (w + 260) / count;
    for (var i = 0; i < count; i++) {
        var raw = i * step - 130 + rnd(i, 3) * step * 0.5 - off * 1.0;
        var x = ((raw % (w + 300)) + (w + 300)) % (w + 300) - 150;
        var hh = h * (0.44 + rnd(i * 7, 9) * 0.26);
        var sway = Math.sin((time / 1000) * 0.32 + i) * 4;
        (0, paint_1.drawPineTree)(ctx, x, baseY, hh, (0, palette_1.tint)(palette_1.PALETTE.forestMid, 0.3, palette_1.PALETTE.skyWarm), 100 + i * 5, 0.5 + rnd(i, 11) * 0.2);
        (0, paint_1.drawBroadleafTree)(ctx, x + step * 0.45, baseY, hh * 0.78, (0, palette_1.tint)(palette_1.PALETTE.forestDeep, 0.42, palette_1.PALETTE.skyWarm), 200 + i * 5, sway);
    }
    // 林间暖色光带（远处的太阳光束）
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = palette_1.PALETTE.sunbeam;
    var beam = [
        { x: w * 0.5 + off * 0.4, y: -10 },
        { x: w * 0.72 + off * 0.4, y: -10 },
        { x: w * 0.92 + off * 0.4, y: h * 0.72 },
        { x: w * 0.42 + off * 0.4, y: h * 0.72 },
    ];
    (0, brush_1.tracePath)(ctx, beam, true);
    ctx.fill();
    ctx.restore();
}
/** 中景：草地坡面 + 树干 + 蕨类 + 蘑菇 + 灌木。 */
function midForest(ctx, w, h, off, time) {
    // 草地坡面：用两段水彩洗铺满下半屏，边界自然起伏。
    var groundPts = [{ x: -20, y: h * 0.56 }];
    for (var i = 0; i <= 10; i++) {
        var t = i / 10;
        groundPts.push({ x: -20 + (w + 40) * t, y: h * (0.5 + Math.sin(t * 5.2 + 1.1) * 0.03 + rnd(i, 13) * 0.03) });
    }
    groundPts.push({ x: w + 20, y: h + 20 });
    groundPts.push({ x: -20, y: h + 20 });
    (0, brush_1.fillWatercolor)(ctx, groundPts, palette_1.PALETTE.meadow, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: 61 });
    (0, brush_1.fillWatercolor)(ctx, [
        { x: -20, y: h * 0.78 },
        { x: w * 0.5, y: h * 0.72 },
        { x: w + 20, y: h * 0.8 },
        { x: w + 20, y: h + 20 },
        { x: -20, y: h + 20 },
    ], (0, palette_1.tint)(palette_1.PALETTE.leafLight, 0.28, palette_1.PALETTE.paper), { alpha: 0.5, layers: 2, wetEdge: true, seedIndex: 62 });
    // 树干：沿左右两侧和画面中部几根，制造纵深。
    var trunks = [40, 210, 470, 760, 1010, 1230];
    for (var i = 0; i < trunks.length; i++) {
        var x = trunks[i] - off * 0.35;
        var hh = h * (0.5 + rnd(i * 3, 17) * 0.28);
        var sway = Math.sin((time / 1000) * 0.4 + i * 1.7) * 2.5;
        (0, paint_1.drawBroadleafTree)(ctx, x, h * 0.78, hh, (0, palette_1.tint)(palette_1.PALETTE.forestMid, 0.1 + rnd(i, 19) * 0.18, palette_1.PALETTE.paper), 300 + i * 11, sway);
    }
    // 灌木与蕨类（中景装饰，不挡棋盘中央）。
    var decor = [
        { x: 0.06, y: 0.66, k: 0 },
        { x: 0.16, y: 0.74, k: 1 },
        { x: 0.92, y: 0.68, k: 2 },
        { x: 0.84, y: 0.78, k: 3 },
        { x: 0.5, y: 0.63, k: 4 },
        { x: 0.66, y: 0.6, k: 5 },
    ];
    for (var i = 0; i < decor.length; i++) {
        var d = decor[i];
        var x = w * d.x - off * 0.35;
        var y = h * d.y;
        (0, paint_1.drawBush)(ctx, x, y, 42 + rnd(i, 21) * 22, 26 + rnd(i, 23) * 12, i % 2 === 0 ? palette_1.PALETTE.leafMid : palette_1.PALETTE.forestMid, 400 + i * 13);
        if (i % 2 === 1) {
            (0, paint_1.drawFern)(ctx, x + 46, y + 6, 34, -0.5 + rnd(i, 25) * 0.5, palette_1.PALETTE.leafLight, 500 + i * 9);
            (0, paint_1.drawMushroom)(ctx, x - 44, y + 12, 20, 600 + i * 7);
        }
    }
    (0, brush_1.paperGrain)(ctx, 0, h * 0.4, w, h * 0.6, 0.06, 71);
}
/** 近景：前景草丛 / 花 / 三叶草 / 卵石 / 几片垂落的叶。 */
function nearForest(ctx, w, h, off, time) {
    var swayAmp = 3;
    var tufts = 16;
    for (var i = 0; i < tufts; i++) {
        var x = (i / tufts) * (w + 80) - 40 - off;
        var baseY = h - 6 - rnd(i, 27) * 26;
        var hh = 34 + rnd(i * 5, 29) * 30;
        var sway = Math.sin((time / 1000) * 2 * 0.5 * 2 * Math.PI * 0.5 + i * 0.9) * swayAmp;
        (0, paint_1.drawGrassTuft)(ctx, x, baseY, hh, i % 3 === 0 ? palette_1.PALETTE.leafMid : palette_1.PALETTE.leafLight, 700 + i * 5, sway);
    }
    var flowers = [0.08, 0.22, 0.41, 0.58, 0.73, 0.88];
    for (var i = 0; i < flowers.length; i++) {
        var x = w * flowers[i] - off;
        var y = h - 30 - rnd(i, 31) * 22;
        (0, paint_1.drawFlower)(ctx, x, y, 9 + rnd(i, 33) * 4, i % 2 === 0 ? palette_1.PALETTE.blossom : palette_1.PALETTE.sunbeam, 800 + i * 6);
        if (i % 3 === 0)
            (0, paint_1.drawClover)(ctx, x + 30, y + 16, 8, 820 + i * 4);
    }
    // 前景卵石（左右下角，压住画面边角）
    (0, paint_1.drawStone)(ctx, 58 - off * 0.6, h - 22, 30, 900, true);
    (0, paint_1.drawStone)(ctx, w - 70 - off * 0.6, h - 16, 36, 910, false);
    // 垂落的叶（画面上缘，制造「在森林里」的窥视感）
    for (var i = 0; i < 4; i++) {
        var x = w * (0.08 + i * 0.28) - off * 0.5;
        var y = -18 + rnd(i, 35) * 26;
        var ang = Math.PI / 2 + (rnd(i, 37) - 0.5) * 0.6;
        var pts = [
            { x: x, y: y - 40 },
            { x: x + Math.cos(ang) * 66, y: y + Math.sin(ang) * 66 },
        ];
        var leaf = [];
        for (var k = 0; k <= 10; k++) {
            var t = k / 10;
            var lx = x + Math.cos(ang) * 66 * t;
            var ly = y + Math.sin(ang) * 66 * t;
            var half = Math.sin(t * Math.PI) * 26;
            leaf.push({ x: lx - Math.sin(ang) * half, y: ly + Math.cos(ang) * half });
        }
        for (var k = 10; k >= 0; k--) {
            var t = k / 10;
            var lx = x + Math.cos(ang) * 66 * t;
            var ly = y + Math.sin(ang) * 66 * t;
            var half = Math.sin(t * Math.PI) * 26;
            leaf.push({ x: lx + Math.sin(ang) * half, y: ly - Math.cos(ang) * half });
        }
        (0, brush_1.fillWatercolor)(ctx, leaf, (0, palette_1.tint)(palette_1.PALETTE.leafMid, 0.12, palette_1.PALETTE.forestDeep), {
            alpha: 0.95, layers: 2, wetEdge: true, seedIndex: 930 + i * 5,
        });
    }
}
/** 三层视差总入口：far / mid / near。 */
function drawForestLayer(ctx, w, h, scroll, layer, time) {
    if (layer === 'far')
        farTrees(ctx, w, h, scroll * layout_1.LAYOUT.PARALLAX.far, time);
    else if (layer === 'mid')
        midForest(ctx, w, h, scroll * layout_1.LAYOUT.PARALLAX.mid, time);
    else
        nearForest(ctx, w, h, scroll * layout_1.LAYOUT.PARALLAX.near, time);
}
/** 叶隙光斑：8~12 个，alpha 0.06~0.12，周期 6~10s 缓慢漂移。 */
function drawSunSpecks(ctx, w, h, time, intensity) {
    var k = intensity === undefined ? 1 : intensity;
    var n = layout_1.LAYOUT.SUNSPECKS.count;
    for (var i = 0; i < n; i++) {
        var period = layout_1.LAYOUT.SUNSPECKS.cycleMin + rnd(i * 3, 41) * (layout_1.LAYOUT.SUNSPECKS.cycleMax - layout_1.LAYOUT.SUNSPECKS.cycleMin);
        var t = (0, ease_1.cycle)(time, period, i * 640);
        var x = w * (0.06 + rnd(i, 43) * 0.88) + Math.sin(t * Math.PI * 2 + i) * 34;
        var y = h * (0.04 + rnd(i * 5, 45) * 0.9) + t * 46;
        var r = 16 + rnd(i * 7, 47) * 30;
        var aBase = layout_1.LAYOUT.SUNSPECKS.alphaMin + rnd(i * 11, 49) * (layout_1.LAYOUT.SUNSPECKS.alphaMax - layout_1.LAYOUT.SUNSPECKS.alphaMin);
        var breathe = 0.6 + 0.4 * Math.sin(t * Math.PI * 2);
        (0, paint_1.drawSunMote)(ctx, x, y, r, aBase * breathe * k);
    }
}
/** 暗角：四边冷色水彩压暗（不用径向渐变，避免「发光」感）。 */
function drawVignette(ctx, w, h) {
    var bands = [
        { x: 0, y: 0, w: 90, h: h, sx: 0 },
        { x: w - 90, y: 0, w: 90, h: h, sx: 1 },
        { x: 0, y: 0, w: w, h: 74, sx: 2 },
        { x: 0, y: h - 86, w: w, h: 86, sx: 3 },
    ];
    for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        (0, paint_1.drawFogBand)(ctx, b.x - (b.sx < 2 ? 40 : 0), b.y - (b.sx >= 2 ? 40 : 0), b.w + (b.sx < 2 ? 40 : 0), b.h + (b.sx >= 2 ? 40 : 0), 0.22, 950 + i * 7);
    }
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = palette_1.PALETTE.forestDeep;
    ctx.lineWidth = 18;
    ctx.lineJoin = 'round';
    (0, brush_1.tracePath)(ctx, [
        { x: 6, y: 6 },
        { x: w - 6, y: 6 },
        { x: w - 6, y: h - 6 },
        { x: 6, y: h - 6 },
    ], true);
    ctx.stroke();
    ctx.restore();
}
/** 天气粒子层（§2.5）：晴金尘上升 / 雾白絮横移 / 雨斜线+涟漪 / 彩虹 / 多云 / 雷闪。 */
function drawWeather(ctx, w, h, weather, time, intensity) {
    var k = intensity === undefined ? 1 : intensity;
    if (weather === 'none' || k <= 0)
        return;
    if (weather === 'sunny') {
        for (var i = 0; i < 16; i++) {
            var period = 4200 + rnd(i, 53) * 2600;
            var t = (0, ease_1.cycle)(time, period, i * 320);
            var x = w * rnd(i * 3, 55) + Math.sin(t * Math.PI * 2) * 18;
            var y = h * (0.95 - t * 0.9);
            (0, paint_1.drawSunMote)(ctx, x, y, 7 + rnd(i, 57) * 9, (0.1 + rnd(i * 5, 59) * 0.14) * k);
        }
        return;
    }
    if (weather === 'misty' || weather === 'cloudy') {
        var bands = weather === 'cloudy' ? 3 : 5;
        for (var i = 0; i < bands; i++) {
            var drift = ((0, ease_1.cycle)(time, 26000 + i * 7000, i * 500) - 0.5) * 120;
            (0, paint_1.drawFogBand)(ctx, -60 + drift, h * (0.16 + i * 0.13), w + 120, h * 0.14, (weather === 'cloudy' ? 0.24 : 0.2) * k, 960 + i * 9);
        }
        if (weather === 'cloudy') {
            (0, paint_1.drawCloud)(ctx, w * 0.3, h * 0.16, 340, 70, (0, palette_1.tint)(palette_1.PALETTE.creamMist, 0.2, palette_1.PALETTE.stream), 0.5 * k, 990);
            (0, paint_1.drawCloud)(ctx, w * 0.72, h * 0.1, 300, 62, (0, palette_1.tint)(palette_1.PALETTE.creamMist, 0.2, palette_1.PALETTE.stream), 0.45 * k, 991);
        }
        return;
    }
    if (weather === 'rainy' || weather === 'thunder') {
        if (weather === 'thunder') {
            // 每 2s 一次全屏白闪 0.08s（用 creamMist 提亮，纯白会超出纸感）
            var phase = (time % 2000) / 2000;
            if (phase < 0.04) {
                ctx.save();
                ctx.globalAlpha = 0.32 * (1 - phase / 0.04) * k;
                softBand(ctx, 0, -6, w, h + 12, palette_1.PALETTE.creamMist, 0.95, 71);
                ctx.restore();
            }
        }
        var drops = 90;
        ctx.save();
        ctx.lineCap = 'round';
        for (var i = 0; i < drops; i++) {
            var speed = 620 + rnd(i, 61) * 380;
            var x = ((w * rnd(i * 3, 63) + time * 0.08) % (w + 120)) - 60;
            var y = ((rnd(i * 5, 65) * h + (time * speed) / 1000) % (h + 80)) - 40;
            var len = 18 + rnd(i * 7, 67) * 22;
            ctx.globalAlpha = (0.16 + rnd(i, 69) * 0.2) * k;
            ctx.strokeStyle = palette_1.PALETTE.stream;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 5, y + len);
            ctx.stroke();
        }
        ctx.restore();
        for (var i = 0; i < 4; i++) {
            var t = (0, ease_1.cycle)(time, 1600, i * 420);
            var cx = w * (0.24 + i * 0.18);
            var cy = h * (0.72 + rnd(i, 71) * 0.16);
            if (t < 0.62)
                (0, paint_1.drawRipple)(ctx, cx, cy, 8 + t * 26, (0.4 - t * 0.5) * k);
        }
        return;
    }
    if (weather === 'rainbow') {
        ctx.save();
        ctx.globalAlpha = 0.22 * k;
        var colors = [palette_1.PALETTE.blossom, palette_1.PALETTE.sunset, palette_1.PALETTE.sunbeam, palette_1.PALETTE.leafLight, palette_1.PALETTE.stream, palette_1.PALETTE.twilight];
        for (var i = 0; i < colors.length; i++) {
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = 9;
            ctx.lineCap = 'round';
            var r = h * 0.46 - i * 9;
            var pts = [];
            for (var k2 = 0; k2 <= 28; k2++) {
                var a = Math.PI + (k2 / 28) * Math.PI;
                pts.push({ x: w * 0.62 + Math.cos(a) * r, y: h * 0.78 + Math.sin(a) * r });
            }
            (0, brush_1.tracePath)(ctx, pts, false);
            ctx.stroke();
        }
        ctx.restore();
        return;
    }
}
/** 天气 tint 提示色（供 HUD/卡面共用，禁止在别处再写魔法色）。 */
function weatherTint(id) {
    if (id === 'sunny' || id === 'rainbow')
        return palette_1.PALETTE.sunbeam;
    if (id === 'misty' || id === 'cloudy')
        return palette_1.PALETTE.moss;
    if (id === 'rainy' || id === 'thunder')
        return palette_1.PALETTE.stream;
    return palette_1.PALETTE.creamMist;
}
/** 天气中文短名（不带 emoji；配置里的 cn 含 emoji，禁止直接画）。 */
function weatherShort(id) {
    if (id === 'sunny')
        return '晴';
    if (id === 'misty')
        return '阴';
    if (id === 'rainy')
        return '雨';
    if (id === 'rainbow')
        return '彩虹';
    if (id === 'cloudy')
        return '多云';
    if (id === 'thunder')
        return '雷雨';
    return '无';
}
/** 战斗开始时的光斑增强包络（0~1，前 0.35s 冲到 0.2 以上再回落）。 */
function battleLightBoost(elapsedMs) {
    if (elapsedMs < 0)
        return 0;
    var rise = timing_1.TIMING.EASE_MS_MAX;
    if (elapsedMs < rise)
        return 1.6 * (elapsedMs / rise);
    var decay = 1 - (elapsedMs - rise) / 2200;
    return Math.max(0, decay) * 1.6;
}
