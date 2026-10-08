"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.easeOutCubic = exports.drawSpeciesSilhouette = exports.RADIUS = exports.fitSize = void 0;
exports.drawResultBanner = drawResultBanner;
exports.drawReportCard = drawReportCard;
exports.drawDamageStack = drawDamageStack;
exports.drawMvpPanel = drawMvpPanel;
exports.drawHighlightStrip = drawHighlightStrip;
exports.drawSunLedger = drawSunLedger;
exports.drawRewardRow = drawRewardRow;
exports.drawPageDots = drawPageDots;
var palette_1 = require("../config/palette");
var species_1 = require("../config/species");
var brush_1 = require("../ui/brush");
var ease_1 = require("../ui/ease");
Object.defineProperty(exports, "easeOutCubic", { enumerable: true, get: function () { return ease_1.easeOutCubic; } });
var theme_1 = require("../ui/theme");
Object.defineProperty(exports, "RADIUS", { enumerable: true, get: function () { return theme_1.RADIUS; } });
Object.defineProperty(exports, "fitSize", { enumerable: true, get: function () { return theme_1.fitSize; } });
var paint_1 = require("./paint");
var unit_1 = require("./unit");
Object.defineProperty(exports, "drawSpeciesSilhouette", { enumerable: true, get: function () { return unit_1.drawSpeciesSilhouette; } });
var TAU = Math.PI * 2;
var SEG_COLOR = {
    basic: palette_1.PALETTE.leafMid,
    trait: palette_1.PALETTE.sunset,
    counter: palette_1.PALETTE.berry,
    weather: palette_1.PALETTE.stream,
    buff: palette_1.PALETTE.twilight,
};
function rectPts(x, y, w, h) {
    return [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ];
}
/* ------------------------------------------------------------------ */
/* 顶部横幅                                                            */
/* ------------------------------------------------------------------ */
function drawResultBanner(ctx, x, y, w, h, outcome, time) {
    var win = outcome === 'win';
    var draw = outcome === 'draw';
    var title = win ? '胜 利' : draw ? '平 局' : '惜 败';
    var sub = win ? '苔藓林地重归安宁' : draw ? '势均力敌' : '下次换个阵容试试';
    var accent = win ? palette_1.PALETTE.sunbeam : draw ? palette_1.PALETTE.moss : palette_1.PALETTE.blossom;
    var seed = 1301;
    ctx.save();
    // 卷轴底
    var body = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, body, win ? (0, palette_1.tint)(palette_1.PALETTE.barkLight, 0.12, palette_1.PALETTE.sunbeam) : palette_1.PALETTE.barkLight, {
        alpha: 0.98, layers: 1, wetEdge: true, seedIndex: seed,
    });
    (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 1);
    (0, brush_1.strokeInk)(ctx, body, { width: theme_1.STROKE + 1, close: true, seedIndex: seed + 2, jitter: 1.2 });
    // 两端木轴
    for (var i = 0; i < 2; i++) {
        var rx = i === 0 ? x - 14 : x + w - 10;
        var rod = rectPts(rx, y - 6, 24, h + 12);
        (0, brush_1.fillWatercolor)(ctx, rod, palette_1.PALETTE.bark, { alpha: 0.98, layers: 1, seedIndex: seed + 10 + i });
        (0, brush_1.strokeInk)(ctx, rod, { width: 2.4, close: true, seedIndex: seed + 12 + i, jitter: 0.9 });
    }
    // 文字
    var pop = (0, ease_1.easeOutBack)((0, ease_1.clamp01)((0, ease_1.cycle)(time, 100000, 0) * 4 + 0.6), 1.4);
    ctx.save();
    ctx.translate(x + w / 2, y + h * 0.42);
    ctx.scale(0.92 + pop * 0.08, 0.92 + pop * 0.08);
    (0, theme_1.textOutlined)(ctx, title, 0, 0, theme_1.FONT.h1 + 14, win ? palette_1.PALETTE.creamMist : palette_1.PALETTE.paper, 'center', 3);
    ctx.restore();
    (0, theme_1.textPlain)(ctx, sub, x + w / 2, y + h * 0.82, theme_1.FONT.entry, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.85), 'center');
    // 星辉 / 花瓣
    for (var i = 0; i < 5; i++) {
        var t = (0, ease_1.cycle)(time, 4200, i * 800);
        if (t < 0.5)
            continue;
        var a = i * 1.2 + 0.4;
        (0, paint_1.drawSparkle)(ctx, x + w / 2 + Math.cos(a) * (w * 0.42), y + h / 2 + Math.sin(a) * (h * 0.34), 4 + i, accent, (t - 0.5) * 2 * 0.9);
    }
    (0, paint_1.drawLeaf)(ctx, x + 44, y + h / 2, 22, 1.3, palette_1.PALETTE.leafMid, seed + 30);
    (0, paint_1.drawLeaf)(ctx, x + w - 44, y + h / 2, 22, Math.PI - 1.3, palette_1.PALETTE.leafMid, seed + 31);
    ctx.restore();
}
/* ------------------------------------------------------------------ */
/* 复盘卡                                                              */
/* ------------------------------------------------------------------ */
function drawReportCard(ctx, x, y, w, h, page, time, index, total) {
    var seed = 1401;
    ctx.save();
    // 木框
    var frame = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, frame, palette_1.PALETTE.barkLight, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: seed });
    (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 1);
    (0, brush_1.strokeInk)(ctx, frame, { width: theme_1.STROKE, close: true, seedIndex: seed + 2, jitter: 1.3 });
    // 内纸
    var ip = rectPts(x + 14, y + 14, w - 28, h - 28);
    (0, paint_1.paperBase)(ctx, x + 14, y + 14, w - 28, h - 28, palette_1.PALETTE.paper, 0.97, seed + 3);
    (0, brush_1.fillWatercolor)(ctx, ip, palette_1.PALETTE.paper, { alpha: 0.95, layers: 1, seedIndex: seed + 4 });
    (0, brush_1.strokeInk)(ctx, ip, { width: 2.2, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8), seedIndex: seed + 5, jitter: 1.0 });
    // 四角叶藤
    (0, paint_1.drawLeaf)(ctx, x + 30, y + 30, 18, 1.1, palette_1.PALETTE.leafMid, seed + 6);
    (0, paint_1.drawLeaf)(ctx, x + w - 30, y + 30, 18, Math.PI - 1.1, palette_1.PALETTE.leafLight, seed + 7);
    (0, paint_1.drawLeaf)(ctx, x + 30, y + h - 30, 18, Math.PI + 1.1, palette_1.PALETTE.leafMid, seed + 8);
    (0, paint_1.drawLeaf)(ctx, x + w - 30, y + h - 30, 18, -1.1, palette_1.PALETTE.leafLight, seed + 9);
    // 标题条
    var tw = Math.min(w - 200, 320);
    var tx = x + (w - tw) / 2;
    var tp = rectPts(tx, y + 20, tw, 40);
    (0, brush_1.fillWatercolor)(ctx, tp, palette_1.PALETTE.creamMist, { alpha: 0.96, layers: 1, seedIndex: seed + 10 });
    (0, brush_1.strokeInk)(ctx, tp, { width: 2.2, close: true, seedIndex: seed + 11, jitter: 0.9 });
    (0, theme_1.textOutlined)(ctx, page.title, x + w / 2, y + 42, theme_1.FONT.h2, palette_1.PALETTE.inkSoft, 'center', 0);
    (0, theme_1.textPlain)(ctx, (index + 1) + ' / ' + total, x + w - 34, y + 42, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.7), 'center');
    var cx = x + w / 2;
    var cy = y + 66;
    var cw = w - 60;
    var ch = h - 100;
    if (page.kind === 'damage' && page.segments) {
        // 堆叠条由场景单独调用 drawDamageStack 绘制，这里只放图例占位与提示
        (0, theme_1.textPlain)(ctx, '伤害构成 · 误差 <1%', cx, cy + 8, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.7), 'center');
        for (var i = 0; i < page.segments.length; i++) {
            var s = page.segments[i];
            var lx = x + 60 + (i % 3) * 200;
            var ly = cy + ch - 40 - Math.floor(i / 3) * 26;
            (0, paint_1.drawLeaf)(ctx, lx, ly - 6, 12, 1.2, SEG_COLOR[s.key] || palette_1.PALETTE.leafMid, seed + 20 + i);
            (0, theme_1.textPlain)(ctx, s.label, lx + 14, ly - 6, theme_1.FONT.badge, palette_1.PALETTE.inkSoft, 'left');
        }
    }
    else if (page.kind === 'mvp' && page.mvp) {
        drawMvpPanel(ctx, x + 30, cy, cw, ch, page.mvp, time);
    }
    else if (page.kind === 'highlight' && page.highlights) {
        drawHighlightStrip(ctx, x + 30, cy, cw, ch, page.highlights, time);
    }
    ctx.restore();
}
/** 伤害堆叠条（唯一的矩形条场景之一）+ 点击展开明细。 */
function drawDamageStack(ctx, x, y, w, h, segments, time, expanded) {
    var e_1, _a;
    var seed = 1501;
    var total = 0;
    try {
        for (var segments_1 = __values(segments), segments_1_1 = segments_1.next(); !segments_1_1.done; segments_1_1 = segments_1.next()) {
            var s = segments_1_1.value;
            total += Math.max(0, s.value);
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (segments_1_1 && !segments_1_1.done && (_a = segments_1.return)) _a.call(segments_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    var hasData = total > 0;
    var denom = hasData ? total : 1;
    var n = Math.max(1, segments.length);
    ctx.save();
    // 版式对齐目标图（ui-result-victory）：数值行在上、色块横条居中、标签行在下、总伤害居中最底。
    var barY = y + 32;
    var barH = Math.max(48, Math.min(72, h - 76));
    var track = rectPts(x, barY, w, barH);
    (0, brush_1.fillWatercolor)(ctx, track, palette_1.PALETTE.creamMist, { alpha: 0.95, layers: 1, seedIndex: seed });
    (0, brush_1.strokeInk)(ctx, track, { width: 2.4, close: true, seedIndex: seed + 1, jitter: 1.0 });
    var innerW = w - 4;
    var cursor = x + 2;
    for (var i = 0; i < segments.length; i++) {
        var s = segments[i];
        // 没有战报数据时按等分铺色（整条压暗），保证结算页版式与目标图一致。
        var frac = hasData ? Math.max(0, s.value) / denom : 1 / n;
        var sw = innerW * frac;
        var sp = rectPts(cursor, barY + 2, sw, barH - 4);
        (0, brush_1.fillWatercolor)(ctx, sp, SEG_COLOR[s.key] || palette_1.PALETTE.leafMid, {
            alpha: hasData ? 0.95 : 0.32, layers: 1, seedIndex: seed + 10 + i,
        });
        (0, brush_1.strokeInk)(ctx, sp, { width: 1.8, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.paper, 0.85), seedIndex: seed + 30 + i, jitter: 0.9 });
        if (expanded === i || expanded === s.key) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            (0, paint_1.drawMossLight)(ctx, cursor + sw / 2, barY + barH / 2, sw * 0.7, barH / 96, seed + 20 + i);
            ctx.restore();
        }
        var pct = Math.round(frac * 1000) / 10;
        if (sw > 44) {
            // 数值在条上方、百分比压在色块里，与目标图相同。
            (0, theme_1.textOutlined)(ctx, '' + Math.round(s.value), cursor + sw / 2, barY - 16, theme_1.FONT.entry, palette_1.PALETTE.inkSoft, 'center', 0);
            (0, theme_1.textPlain)(ctx, pct + '%', cursor + sw / 2, barY + barH / 2, theme_1.FONT.badge, palette_1.PALETTE.paper, 'center');
        }
        else if (sw > 20) {
            (0, theme_1.textPlain)(ctx, pct + '%', cursor + sw / 2, barY + barH / 2, theme_1.FONT.badge - 2, palette_1.PALETTE.paper, 'center');
        }
        (0, theme_1.textPlain)(ctx, s.label, cursor + sw / 2, barY + barH + 24, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.9), 'center');
        cursor += sw;
    }
    (0, theme_1.textOutlined)(ctx, '总伤害 ' + Math.round(total), x + w / 2, y + h - 6, theme_1.FONT.h2, palette_1.PALETTE.inkSoft, 'center', 0);
    ctx.restore();
}
/** MVP 面板（画在复盘卡内）。 */
function drawMvpPanel(ctx, x, y, w, h, mvp, time) {
    var seed = 1601;
    ctx.save();
    var pad = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, pad, (0, palette_1.tint)(palette_1.PALETTE.moss, 0.66, palette_1.PALETTE.paper), { alpha: 0.7, layers: 1, seedIndex: seed });
    (0, brush_1.strokeInk)(ctx, pad, { width: 2, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.6), seedIndex: seed + 1, jitter: 1.2 });
    // 左侧头像
    var ax = x + 96;
    var ay = y + h / 2;
    var r = 62;
    var disc = [];
    for (var i = 0; i < 20; i++) {
        var a = (i / 20) * TAU;
        var k = 1 + (0, brush_1.noiseAt)(i, seed + 2) * 0.05;
        disc.push({ x: ax + Math.cos(a) * r * k, y: ay + Math.sin(a) * r * k });
    }
    (0, brush_1.fillWatercolor)(ctx, disc, (0, palette_1.tint)(species_1.SPECIES[mvp.species].theme, 0.6, palette_1.PALETTE.creamMist), { alpha: 0.95, layers: 1, seedIndex: seed + 3 });
    ctx.save();
    (0, brush_1.roundRectPath)(ctx, ax - r, ay - r, r * 2, r * 2, r, 0.8, seed + 4);
    ctx.clip();
    (0, unit_1.drawSpeciesCreature)(ctx, mvp.species, mvp.level, ax, ay + r * 1.05, (r * 1.9) / (species_1.SPECIES[mvp.species].bodyRadius * 2.4), time, {
        seedIndex: seed + 5,
    });
    ctx.restore();
    (0, brush_1.strokeInk)(ctx, disc, { width: 2.6, close: true, color: palette_1.PALETTE.sunbeam, seedIndex: seed + 6, jitter: 1.0 });
    // 冠冕小叶片
    var sway = Math.sin(time / 400) * 0.2;
    (0, paint_1.drawLeaf)(ctx, ax - 8, ay - r - 6, 20, -0.5 + sway, palette_1.PALETTE.sunbeam, seed + 7);
    (0, paint_1.drawLeaf)(ctx, ax + 10, ay - r - 2, 16, 0.3 - sway, palette_1.PALETTE.leafLight, seed + 8);
    // 右侧数据
    var lx = x + 200;
    (0, theme_1.textOutlined)(ctx, '本场 MVP', lx, y + 26, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8), 'left', 0);
    (0, theme_1.textOutlined)(ctx, mvp.name + ' · Lv.' + mvp.level, lx, y + 54, theme_1.FONT.h2, palette_1.PALETTE.inkSoft, 'left', 0);
    var rows = [
        { k: '总伤害', v: '' + Math.round(mvp.damage) },
        { k: '承受伤害', v: '' + Math.round(mvp.taken) },
        { k: '击杀', v: '' + mvp.kills },
        { k: '存活', v: Math.round(mvp.aliveSec) + 's / ' + mvp.rounds + ' 回合' },
    ];
    for (var i = 0; i < rows.length; i++) {
        var ry = y + 86 + i * 30;
        (0, paint_1.drawLeaf)(ctx, lx + 6, ry, 12, 1.2, palette_1.PALETTE.leafMid, seed + 20 + i);
        (0, theme_1.textPlain)(ctx, rows[i].k, lx + 22, ry, theme_1.FONT.entry, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8), 'left');
        (0, theme_1.textOutlined)(ctx, rows[i].v, x + w - 20, ry, theme_1.FONT.entry, palette_1.PALETTE.inkSoft, 'right', 0);
    }
    ctx.restore();
}
/** 高光时刻条（画在复盘卡内）。 */
function drawHighlightStrip(ctx, x, y, w, h, highlights, time) {
    var seed = 1701;
    ctx.save();
    var rowH = Math.min(60, h / Math.max(1, highlights.length));
    var _loop_1 = function (i) {
        var hl = highlights[i];
        var ry = y + i * rowH;
        var pad = rectPts(x, ry + 4, w, rowH - 10);
        (0, brush_1.fillWatercolor)(ctx, pad, i % 2 === 0 ? (0, palette_1.tint)(palette_1.PALETTE.moss, 0.7, palette_1.PALETTE.paper) : (0, palette_1.tint)(palette_1.PALETTE.creamMist, 0.5, palette_1.PALETTE.paper), {
            alpha: 0.75, layers: 1, seedIndex: seed + i,
        });
        (0, brush_1.strokeInk)(ctx, pad, { width: 1.8, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.5), seedIndex: seed + 10 + i, jitter: 1.1 });
        // 头像
        var cx = x + 34;
        var cy = ry + rowH / 2 - 1;
        (0, brush_1.fillWatercolor)(ctx, (function () {
            var pts = [];
            for (var k = 0; k < 14; k++) {
                var a = (k / 14) * TAU;
                pts.push({ x: cx + Math.cos(a) * 18, y: cy + Math.sin(a) * 18 });
            }
            return pts;
        })(), (0, palette_1.tint)(species_1.SPECIES[hl.species].theme, 0.55, palette_1.PALETTE.creamMist), { alpha: 0.95, layers: 1, seedIndex: seed + 20 + i });
        ctx.save();
        (0, brush_1.roundRectPath)(ctx, cx - 18, cy - 18, 36, 36, 18, 0.8, seed + 30 + i);
        ctx.clip();
        (0, unit_1.drawSpeciesCreature)(ctx, hl.species, 1, cx, cy + 20, 1.15, time, { seedIndex: seed + 40 + i, facing: 1 });
        ctx.restore();
        (0, theme_1.textOutlined)(ctx, '第 ' + hl.round + ' 回合', x + 62, ry + rowH / 2 - 10, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8), 'left', 0);
        (0, theme_1.textOutlined)(ctx, hl.label, x + 62, ry + rowH / 2 + 12, theme_1.FONT.entry, palette_1.PALETTE.inkSoft, 'left', 0);
        var vs = hl.value >= 100 ? '' + Math.round(hl.value) : (Math.round(hl.value * 10) / 10) + '';
        (0, theme_1.textOutlined)(ctx, vs, x + w - 20, ry + rowH / 2 + 1, theme_1.FONT.h2, palette_1.PALETTE.berry, 'right', 0);
        if ((0, ease_1.cycle)(time, 3000, i * 500) < 0.25) {
            (0, paint_1.drawSparkle)(ctx, x + w - 70, ry + rowH / 2 - 14, 5, palette_1.PALETTE.sunbeam, 0.6);
        }
    };
    for (var i = 0; i < highlights.length; i++) {
        _loop_1(i);
    }
    ctx.restore();
}
/* ------------------------------------------------------------------ */
/* 账本 / 奖励 / 翻页点                                                 */
/* ------------------------------------------------------------------ */
function drawSunLedger(ctx, x, y, w, h, rows, time) {
    var seed = 1801;
    ctx.save();
    var pad = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, pad, palette_1.PALETTE.barkLight, { alpha: 0.97, layers: 1, seedIndex: seed });
    (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 1);
    (0, brush_1.strokeInk)(ctx, pad, { width: theme_1.STROKE, close: true, seedIndex: seed + 2, jitter: 1.1 });
    var colW = w / Math.max(1, rows.length);
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var cx = x + colW * (i + 0.5);
        if (i > 0) {
            (0, brush_1.strokeInk)(ctx, [{ x: x + colW * i, y: y + 10 }, { x: x + colW * i, y: y + h - 10 }], { width: 1.4, color: (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.25), seedIndex: seed + 10 + i, jitter: 1.2 });
        }
        drawSunCoinMini(ctx, x + colW * i + 16, y + h * 0.5, time, seed + 20 + i);
        ctx.save();
        ctx.globalAlpha = 0.85;
        (0, theme_1.setFont)(ctx, theme_1.FONT.badge, 'normal');
        ctx.textAlign = 'left';
        ctx.fillStyle = palette_1.PALETTE.creamMist;
        ctx.fillText(r.label, x + colW * i + 34, y + h * 0.5);
        ctx.restore();
        var v = (r.value > 0 ? '+' : '') + Math.round(r.value);
        (0, theme_1.textOutlined)(ctx, v, x + colW * (i + 1) - 12, y + h * 0.5, theme_1.FONT.entry, r.value >= 0 ? palette_1.PALETTE.sunbeam : palette_1.PALETTE.blossom, 'right', 1.6);
    }
    ctx.restore();
}
function drawSunCoinMini(ctx, cx, cy, time, seed) {
    ctx.save();
    var disc = [];
    for (var i = 0; i < 16; i++) {
        var a = (i / 16) * TAU;
        disc.push({ x: cx + Math.cos(a) * 11, y: cy + Math.sin(a) * 11 });
    }
    (0, brush_1.fillWatercolor)(ctx, disc, palette_1.PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: seed });
    (0, brush_1.strokeInk)(ctx, disc, { width: 1.8, close: true, color: palette_1.PALETTE.sunset, seedIndex: seed + 1, jitter: 0.7 });
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * TAU + time / 3000;
        (0, brush_1.strokeInk)(ctx, [{ x: cx + Math.cos(a) * 13, y: cy + Math.sin(a) * 13 }, { x: cx + Math.cos(a) * 16, y: cy + Math.sin(a) * 16 }], {
            width: 1.6, color: (0, palette_1.rgba)(palette_1.PALETTE.sunset, 0.7), seedIndex: seed + 2 + i, jitter: 0.5,
        });
    }
    ctx.restore();
}
function drawRewardRow(ctx, x, y, w, h, rewards, progress, time) {
    var seed = 1901;
    var p = (0, ease_1.clamp01)(progress);
    ctx.save();
    var pad = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, pad, palette_1.PALETTE.creamMist, { alpha: 0.96, layers: 1, seedIndex: seed });
    (0, brush_1.strokeInk)(ctx, pad, { width: theme_1.STROKE, close: true, seedIndex: seed + 1, jitter: 1.1 });
    var colW = w / Math.max(1, rewards.length);
    for (var i = 0; i < rewards.length; i++) {
        var r = rewards[i];
        var cx = x + colW * (i + 0.5);
        var pop = (0, ease_1.easeOutBack)((0, ease_1.clamp01)((p - i * 0.25) * 4), 1.5);
        ctx.save();
        ctx.translate(cx, y + h * 0.42);
        ctx.scale(pop, pop);
        if (r.kind === 'coin') {
            drawSunCoinMini(ctx, 0, 0, time, seed + 10 + i);
        }
        else {
            drawStarBig(ctx, 0, 0, 12, seed + 20 + i);
        }
        ctx.restore();
        var shown = Math.round(r.value * (0, ease_1.clamp01)((p - i * 0.25) * 4));
        (0, theme_1.textOutlined)(ctx, '+' + shown, cx, y + h * 0.82, theme_1.FONT.entry, palette_1.PALETTE.inkSoft, 'center', 0);
        (0, theme_1.textPlain)(ctx, r.label, cx, y + 12, theme_1.FONT.badge - 2, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.75), 'center');
    }
    ctx.restore();
}
function drawStarBig(ctx, cx, cy, r, seed) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + (i / 10) * TAU;
        var rr = i % 2 === 0 ? r : r * 0.46;
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: seed });
    (0, brush_1.strokeInk)(ctx, pts, { width: 1.8, close: true, color: palette_1.PALETTE.sunset, seedIndex: seed + 1, jitter: 0.7 });
}
function drawPageDots(ctx, cx, y, count, active, time) {
    ctx.save();
    var gap = 34;
    for (var i = 0; i < count; i++) {
        var x = cx - ((count - 1) * gap) / 2 + i * gap;
        var on = i === active;
        var r = on ? 11 : 7;
        var bounce = on ? 1 + Math.sin(time / 320) * 0.08 : 1;
        (0, paint_1.drawLeaf)(ctx, x, y, r * 2 * bounce, on ? -0.4 : 1.1, on ? palette_1.PALETTE.leafLight : palette_1.PALETTE.moss, 2001 + i);
        if (on) {
            ctx.save();
            ctx.globalAlpha = 0.5 + Math.sin(time / 400) * 0.15;
            (0, paint_1.drawMossLight)(ctx, x, y, 18, 0.5, 2010 + i);
            ctx.restore();
        }
    }
    ctx.restore();
}
