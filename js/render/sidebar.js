"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blobPath = exports.easeOutCubic = exports.ringColorFor = void 0;
exports.drawSideEntry = drawSideEntry;
exports.drawSidebar = drawSidebar;
exports.drawBench = drawBench;
exports.drawScrollButton = drawScrollButton;
exports.drawCoachAvatar = drawCoachAvatar;
exports.drawDeployTimer = drawDeployTimer;
exports.drawScoreboardPanel = drawScoreboardPanel;
/**
 * 左右侧栏 HUD + 替补席 + 卷轴/战绩面板（§2.6）。
 *
 * 硬规则：
 * - 侧栏条目**绝不出现矩形血条**，血量只用头像外的手绘环 + 数字（§2.8 / §16）。
 * - 回合间（布阵/集市）敌方侧栏只能显示「上回合情报」，用冷紫灰 + 标签区分。
 * - 全部颜色/描边/圆角来自 ui/theme 与手绘生成器。
 */
var layout_1 = require("../config/layout");
var palette_1 = require("../config/palette");
var species_1 = require("../config/species");
var brush_1 = require("../ui/brush");
Object.defineProperty(exports, "blobPath", { enumerable: true, get: function () { return brush_1.blobPath; } });
var ease_1 = require("../ui/ease");
Object.defineProperty(exports, "easeOutCubic", { enumerable: true, get: function () { return ease_1.easeOutCubic; } });
var theme_1 = require("../ui/theme");
var paint_1 = require("./paint");
var hpring_1 = require("./hpring");
Object.defineProperty(exports, "ringColorFor", { enumerable: true, get: function () { return hpring_1.ringColorFor; } });
var unit_1 = require("./unit");
var card_1 = require("./card");
var assets_1 = require("./assets");
var forest_1 = require("./forest");
var TAU = Math.PI * 2;
function rectPts(x, y, w, h) {
    return [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ];
}
/* ------------------------------------------------------------------ */
/* 侧栏条目                                                            */
/* ------------------------------------------------------------------ */
function drawSideEntry(ctx, x, y, w, h, entry, opts) {
    var faction = opts.faction;
    var time = opts.time;
    var ghost = !!entry.ghost;
    var seed = 101 + opts.index * 13 + (faction === 'enemy' ? 7 : 0);
    var accent = faction === 'player' ? palette_1.PALETTE.leafMid : palette_1.PALETTE.twilight;
    var deep = faction === 'player' ? palette_1.PALETTE.forestMid : palette_1.PALETTE.forestDeep;
    ctx.save();
    if (entry.empty) {
        ctx.globalAlpha = 0.2;
        var pts = rectPts(x, y, w, h);
        (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.creamMist, { alpha: 0.34, layers: 1, seedIndex: seed });
        (0, brush_1.strokeInk)(ctx, pts, { width: 2, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.bark, 0.45), seedIndex: seed + 1, jitter: 1.6 });
        ctx.restore();
        return;
    }
    // 纸白条目 + 手绘描边
    var pts2 = rectPts(x, y, w, h);
    (0, paint_1.paperBase)(ctx, x, y, w, h, ghost ? (0, palette_1.tint)(palette_1.PALETTE.creamMist, 0.22, palette_1.PALETTE.twilight) : palette_1.PALETTE.creamMist, 0.97, seed + 2);
    (0, brush_1.fillWatercolor)(ctx, pts2, ghost ? (0, palette_1.tint)(palette_1.PALETTE.paper, 0.3, palette_1.PALETTE.twilight) : palette_1.PALETTE.paper, {
        alpha: 0.9, layers: 1, seedIndex: seed + 3,
    });
    (0, brush_1.strokeInk)(ctx, pts2, { width: theme_1.STROKE - 0.4, close: true, color: palette_1.PALETTE.inkSoft, seedIndex: seed + 4, jitter: 1.1 });
    // 阵营色侧边叶
    (0, paint_1.drawLeaf)(ctx, x + 10, y + h / 2, 14, Math.PI / 2, accent, seed + 5);
    // 头像 + 环
    var avR = layout_1.LAYOUT.RING.sidebarRadius;
    var ax = x + 14 + avR;
    var ay = y + h / 2;
    ctx.save();
    var face = [];
    for (var i = 0; i < 18; i++) {
        var a = (i / 18) * TAU;
        var k = 1 + (0, brush_1.noiseAt)(i, seed + 6) * 0.05;
        face.push({ x: ax + Math.cos(a) * avR * k, y: ay + Math.sin(a) * avR * k });
    }
    (0, brush_1.fillWatercolor)(ctx, face, (0, palette_1.tint)(species_1.SPECIES[entry.species].theme, 0.55, palette_1.PALETTE.creamMist), { alpha: 0.9, layers: 1, seedIndex: seed + 7 });
    ctx.restore();
    ctx.save();
    (0, brush_1.roundRectPath)(ctx, ax - avR, ay - avR, avR * 2, avR * 2, avR, 0.8, seed + 8);
    ctx.clip();
    var scale = (avR * 1.9) / (species_1.SPECIES[entry.species].bodyRadius * 2.5);
    (0, unit_1.drawSpeciesCreature)(ctx, entry.species, entry.level, ax, ay + avR * 1.15, scale, time, {
        seedIndex: seed + 9, facing: faction === 'player' ? 1 : -1,
    });
    ctx.restore();
    var ratio = entry.maxHp > 0 ? (0, ease_1.clamp01)(entry.hp / entry.maxHp) : 0;
    (0, hpring_1.drawSidebarRing)(ctx, ax, ay, avR, ratio, time, seed + 10, ghost);
    // HP 数字（绝不用矩形血条）
    var hpSize = theme_1.FONT.body;
    (0, theme_1.setFont)(ctx, theme_1.FONT.badge, 'bold');
    ctx.textAlign = 'left';
    ctx.fillStyle = (0, palette_1.rgba)(deep, 0.85);
    ctx.fillText('HP', x + 70, y + 22);
    var hpText = '' + Math.max(0, Math.round(entry.hp));
    (0, theme_1.textOutlined)(ctx, hpText, x + 70, y + 48, hpSize, ghost ? palette_1.PALETTE.twilight : palette_1.PALETTE.inkSoft, 'left', 0);
    var dn = deltaMark(entry);
    if (dn > 0) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        (0, theme_1.setFont)(ctx, theme_1.FONT.badge, 'bold');
        ctx.fillStyle = palette_1.PALETTE.berry;
        ctx.textAlign = 'left';
        ctx.fillText('▼' + dn, x + 72 + ctx.measureText(hpText).width + 6, y + 48);
        ctx.restore();
    }
    // 等级角标（Lv2 起才有装饰，Lv1 不显示）
    if (entry.level >= 2) {
        var bw = 46;
        var bh = 20;
        var bx = x + w - bw - 8;
        var by = y + h - bh - 8;
        var bp = rectPts(bx, by, bw, bh);
        (0, brush_1.fillWatercolor)(ctx, bp, entry.level >= 3 ? palette_1.PALETTE.berry : palette_1.PALETTE.barkLight, { alpha: 0.95, layers: 1, seedIndex: seed + 11 });
        (0, brush_1.strokeInk)(ctx, bp, { width: 1.8, close: true, seedIndex: seed + 12, jitter: 0.8 });
        (0, theme_1.textOutlined)(ctx, 'Lv.' + entry.level, bx + bw / 2, by + bh * 0.62, theme_1.FONT.badge, palette_1.PALETTE.creamMist, 'center', 1.4);
    }
    // 状态图标（最多 3 个）
    for (var i = 0; i < entry.statuses.length && i < 3; i++) {
        (0, hpring_1.drawStatusIcon)(ctx, x + w - 22 - i * 22, y + 18, 9, entry.statuses[i], seed + 20 + i);
    }
    // 上回合情报标签
    if (ghost) {
        var tw = 96;
        var tx = x + w / 2 - tw / 2;
        var ty = y - 9;
        var tp = rectPts(tx, ty, tw, 18);
        (0, brush_1.fillWatercolor)(ctx, tp, (0, palette_1.tint)(palette_1.PALETTE.twilight, 0.35, palette_1.PALETTE.creamMist), { alpha: 0.95, layers: 1, seedIndex: seed + 30 });
        (0, brush_1.strokeInk)(ctx, tp, { width: 1.6, close: true, color: palette_1.PALETTE.twilight, seedIndex: seed + 31, jitter: 0.7 });
        (0, theme_1.textOutlined)(ctx, '上回合情报', tx + tw / 2, ty + 11, theme_1.FONT.badge - 2, palette_1.PALETTE.forestDeep, 'center', 1.2);
    }
    // 受击白闪
    var flash = entry.hitFlash === undefined ? 0 : (0, ease_1.clamp01)(entry.hitFlash);
    if (flash > 0.02) {
        ctx.save();
        ctx.globalAlpha = 0.5 * flash;
        (0, brush_1.fillWatercolor)(ctx, pts2, palette_1.PALETTE.creamMist, { alpha: 0.9, layers: 1, seedIndex: seed + 40 });
        ctx.restore();
    }
    ctx.restore();
}
function deltaMark(entry) {
    void entry;
    return 0;
}
/** 一整条侧栏（纸白长条 + 6 条目）。 */
function drawSidebar(ctx, x, y, w, h, entries, opts) {
    ctx.save();
    var pts = rectPts(x, y, w, h);
    (0, paint_1.paperBase)(ctx, x, y, w, h, palette_1.PALETTE.creamMist, 0.94, 301);
    (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.paper, { alpha: 0.75, layers: 1, seedIndex: 302 });
    (0, brush_1.strokeInk)(ctx, pts, { width: theme_1.STROKE, close: true, seedIndex: 303, jitter: 1.2 });
    ctx.restore();
    var rowH = layout_1.LAYOUT.ENTRY.h;
    var gap = layout_1.LAYOUT.MY_ENTRY.gap;
    for (var i = 0; i < entries.length && i < 6; i++) {
        drawSideEntry(ctx, x + 10, y + 10 + i * (rowH + gap), layout_1.LAYOUT.ENTRY.w, rowH, entries[i], {
            faction: opts.faction, time: opts.time, index: i,
        });
    }
}
/* ------------------------------------------------------------------ */
/* 替补席                                                              */
/* ------------------------------------------------------------------ */
function drawBench(ctx, x, y, w, h, slots, opts) {
    var time = opts.time;
    var narrow = !!opts.narrow;
    var seed = 401;
    // 木架
    var rack = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, rack, palette_1.PALETTE.barkLight, { alpha: 0.96, layers: 1, wetEdge: true, seedIndex: seed });
    (0, paint_1.woodGrain)(ctx, x, y, w, h, seed + 1);
    (0, brush_1.strokeInk)(ctx, rack, { width: theme_1.STROKE, close: true, seedIndex: seed + 2, jitter: 1.1 });
    // 两端藤
    (0, paint_1.drawLeaf)(ctx, x + 8, y + h / 2, 16, 1.2, palette_1.PALETTE.leafMid, seed + 3);
    (0, paint_1.drawLeaf)(ctx, x + w - 8, y + h / 2, 16, Math.PI - 1.2, palette_1.PALETTE.leafMid, seed + 4);
    var b = layout_1.LAYOUT.BENCH;
    for (var i = 0; i < slots.length && i < b.slots; i++) {
        var sx = x + 8 + i * (b.cell + b.gap) - 4;
        var sy = y + (h - (narrow ? 38 : b.cell - 16)) / 2;
        var sw = narrow ? b.cell - 12 : b.cell - 16;
        var sh = narrow ? 38 : b.cell - 16;
        var hover = opts.dragHoverIndex === i;
        // 凹槽
        var hole = rectPts(sx, sy, sw, sh);
        (0, brush_1.fillWatercolor)(ctx, hole, (0, palette_1.tint)(palette_1.PALETTE.bark, 0.35, palette_1.PALETTE.soil), { alpha: 0.9, layers: 1, seedIndex: seed + 10 + i });
        (0, brush_1.strokeInk)(ctx, hole, { width: 2, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.7), seedIndex: seed + 20 + i, jitter: 0.9 });
        if (hover) {
            (0, paint_1.drawMossLight)(ctx, sx + sw / 2, sy + sh / 2, sw * 0.6, 0.5, seed + 30 + i);
        }
        var card = slots[i];
        if (!card) {
            (0, theme_1.textPlain)(ctx, '空', sx + sw / 2, sy + sh / 2, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.35), 'center');
            continue;
        }
        if (narrow) {
            // 战斗阶段：只留小头像 + 等级。整只生物按小格子缩放会顶出凹槽，
            // 改成把美术头像裁进凹槽（等比 cover），与图鉴/卡组里的宠物抠图同一套素材。
            var img = (0, assets_1.getImage)('unit-' + (card.species || 'mouse'));
            ctx.save();
            (0, brush_1.roundRectPath)(ctx, sx, sy, sw, sh, 9, 0);
            ctx.clip();
            if (img) {
                var sc = Math.max(sw / img.width, sh / img.height);
                var dw = img.width * sc;
                var dh = img.height * sc;
                ctx.drawImage(img, sx + (sw - dw) / 2, sy + (sh - dh) / 2, dw, dh);
            }
            else {
                var scale = (sh * 1.5) / (species_1.SPECIES[card.species || 'mouse'].bodyRadius * 3.1);
                (0, unit_1.drawSpeciesCreature)(ctx, card.species || 'mouse', card.level || 1, sx + sw * 0.5, sy + sh * 0.95, scale, time, {
                    seedIndex: seed + 40 + i,
                });
            }
            ctx.restore();
            if ((card.level || 1) >= 2) {
                (0, theme_1.textOutlined)(ctx, 'Lv.' + card.level, sx + sw - 4, sy + 10, theme_1.FONT.badge - 4, palette_1.PALETTE.sunbeam, 'center', 1.2);
            }
        }
        else {
            // 宽态凹槽是方形（≈84×84），卡面 168×232 若按宽度缩放会上下各顶出约 16px；
            // 改按「能完整放进凹槽」的比例缩放（contain），不再裁掉卡面美术。
            var scale = Math.min(sw / layout_1.LAYOUT.CARD.w, sh / layout_1.LAYOUT.CARD.h);
            (0, card_1.drawCard)(ctx, card, sx + (sw - layout_1.LAYOUT.CARD.w * scale) / 2, sy + (sh - layout_1.LAYOUT.CARD.h * scale) / 2, {
                time: time, scale: scale,
            });
        }
    }
}
/* ------------------------------------------------------------------ */
/* 角落小件                                                            */
/* ------------------------------------------------------------------ */
/** 战绩卷轴按钮（46×46）。 */
function drawScrollButton(ctx, x, y, size, pressed, time) {
    ctx.save();
    ctx.translate(0, pressed ? 2 : 0);
    // 两端的卷轴木轴
    for (var i = 0; i < 2; i++) {
        var ry = y + (i === 0 ? size * 0.18 : size * 0.82);
        var rod = rectPts(x + 4, ry - 5, size - 8, 10);
        (0, brush_1.fillWatercolor)(ctx, rod, palette_1.PALETTE.bark, { alpha: 0.98, layers: 1, seedIndex: 501 + i });
        (0, brush_1.strokeInk)(ctx, rod, { width: 2, close: true, seedIndex: 503 + i, jitter: 0.7 });
    }
    // 纸面
    var paper = rectPts(x + 8, y + size * 0.18, size - 16, size * 0.64);
    (0, brush_1.fillWatercolor)(ctx, paper, palette_1.PALETTE.creamMist, { alpha: 0.97, layers: 1, seedIndex: 505 });
    (0, brush_1.strokeInk)(ctx, paper, { width: 2, close: true, seedIndex: 506, jitter: 0.9 });
    // 字痕（三道横线）
    for (var i = 0; i < 3; i++) {
        var ly = y + size * (0.32 + i * 0.16);
        (0, brush_1.strokeInk)(ctx, [{ x: x + 14, y: ly }, { x: x + size - 14, y: ly }], { width: 1.6, color: (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.75), seedIndex: 510 + i, jitter: 1.2 });
    }
    if ((0, ease_1.cycle)(time, 3000, 0) < 0.06) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        (0, brush_1.strokeInk)(ctx, rectPts(x + 4, y + 4, size - 8, size - 8), { width: 2.4, close: true, color: palette_1.PALETTE.sunbeam, seedIndex: 515, jitter: 1.4 });
        ctx.restore();
    }
    ctx.restore();
}
/** 左下饲养员小头像（56×56）+ 状态表情。 */
function drawCoachAvatar(ctx, x, y, w, state, time) {
    var cx = x + w / 2;
    var cy = y + w / 2;
    var r = w / 2 - 2;
    var seed = 601;
    ctx.save();
    // 圆形纸底
    var disc = [];
    for (var i = 0; i < 20; i++) {
        var a = (i / 20) * TAU;
        disc.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    (0, brush_1.fillWatercolor)(ctx, disc, palette_1.PALETTE.creamMist, { alpha: 0.97, layers: 1, seedIndex: seed });
    ctx.save();
    (0, brush_1.roundRectPath)(ctx, x, y, w, w, r, 0.8, seed + 1);
    ctx.clip();
    // 脸
    var face = [];
    for (var i = 0; i < 16; i++) {
        var a = (i / 16) * TAU;
        face.push({ x: cx + Math.cos(a) * r * 0.66, y: cy + Math.sin(a) * r * 0.68 + r * 0.06 });
    }
    (0, brush_1.fillWatercolor)(ctx, face, (0, palette_1.tint)(palette_1.PALETTE.sunset, 0.5, palette_1.PALETTE.creamMist), { alpha: 0.98, layers: 1, seedIndex: seed + 2 });
    // 草帽
    var brim = [
        { x: cx - r * 0.86, y: cy - r * 0.2 },
        { x: cx + r * 0.86, y: cy - r * 0.2 },
        { x: cx + r * 0.4, y: cy - r * 0.56 },
        { x: cx - r * 0.4, y: cy - r * 0.56 },
    ];
    (0, brush_1.fillWatercolor)(ctx, brim, palette_1.PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: seed + 3 });
    (0, brush_1.strokeInk)(ctx, brim, { width: 2, close: true, seedIndex: seed + 4, jitter: 0.8 });
    // 眼睛 + 嘴（状态）
    var happy = state === 'proud' || state === 'win';
    var sad = state === 'hurt' || state === 'lose';
    for (var i = -1; i <= 1; i += 2) {
        var ex = cx + i * r * 0.26;
        var ey = cy + r * 0.12;
        if (happy) {
            (0, brush_1.strokeInk)(ctx, [{ x: ex - 3, y: ey }, { x: ex, y: ey + 3 }, { x: ex + 3, y: ey }], { width: 1.8, seedIndex: seed + 10 + i });
        }
        else {
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.fillStyle = palette_1.PALETTE.inkSoft;
            ctx.beginPath();
            ctx.arc(ex, ey, 2, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
    }
    var mouth = sad
        ? [{ x: cx - r * 0.22, y: cy + r * 0.42 }, { x: cx, y: cy + r * 0.28 }, { x: cx + r * 0.22, y: cy + r * 0.42 }]
        : [{ x: cx - r * 0.24, y: cy + r * 0.3 }, { x: cx, y: cy + r * 0.48 }, { x: cx + r * 0.24, y: cy + r * 0.3 }];
    (0, brush_1.strokeInk)(ctx, mouth, { width: 2, seedIndex: seed + 20 });
    ctx.restore();
    (0, brush_1.strokeInk)(ctx, disc, { width: 2.6, close: true, color: palette_1.PALETTE.forestMid, seedIndex: seed + 30, jitter: 0.9 });
    // 满状态时头顶小叶片抖动
    if (happy) {
        var sw = Math.sin(time / 300) * 0.2;
        (0, paint_1.drawLeaf)(ctx, cx + r * 0.1, cy - r * 1.02, 12, -0.4 + sw, palette_1.PALETTE.leafMid, seed + 40);
    }
    ctx.restore();
}
/** 阶段倒计时：藤蔓轨道 + 光点 + 秒数（不是几何进度条）。 */
function drawDeployTimer(ctx, cx, y, progress, secs, time) {
    var w = 240;
    var x0 = cx - w / 2;
    var p = (0, ease_1.clamp01)(progress);
    ctx.save();
    (0, brush_1.strokeInk)(ctx, [{ x: x0, y: y }, { x: x0 + w, y: y }], { width: 4, color: (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.75), seedIndex: 701, jitter: 0.8 });
    // 已走部分：叶绿色水彩
    (0, brush_1.strokeInk)(ctx, [{ x: x0, y: y }, { x: x0 + w * p, y: y }], { width: 4.6, color: palette_1.PALETTE.leafLight, seedIndex: 702, jitter: 1.0 });
    // 光点
    var gx = x0 + w * p;
    ctx.globalAlpha = 0.9;
    (0, brush_1.fillWatercolor)(ctx, [
        { x: gx - 6, y: y - 6 },
        { x: gx + 6, y: y - 6 },
        { x: gx + 6, y: y + 6 },
        { x: gx - 6, y: y + 6 },
    ], palette_1.PALETTE.sunbeam, { alpha: 0.9, layers: 1, seedIndex: 703 });
    ctx.restore();
    (0, theme_1.textOutlined)(ctx, Math.max(0, Math.round(secs)) + 's', cx, y - 16, theme_1.FONT.entry, palette_1.PALETTE.creamMist, 'center', 1.6);
}
/** 战绩卷轴面板：每回合一行。 */
function drawScoreboardPanel(ctx, x, y, w, h, logs, time) {
    ctx.save();
    var pts = rectPts(x, y, w, h);
    (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.paper, { alpha: 0.96, layers: 1, seedIndex: 801 });
    (0, brush_1.strokeInk)(ctx, pts, { width: 2.4, close: true, seedIndex: 802, jitter: 1.0 });
    (0, theme_1.textOutlined)(ctx, '战绩卷轴', x + w / 2, y + 30, theme_1.FONT.h2, palette_1.PALETTE.inkSoft, 'center', 0);
    (0, brush_1.strokeInk)(ctx, [{ x: x + 40, y: y + 52 }, { x: x + w - 40, y: y + 52 }], { width: 2, color: (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.6), seedIndex: 803, jitter: 1.4 });
    if (logs.length === 0) {
        (0, theme_1.textPlain)(ctx, '还没有打完一回合', x + w / 2, y + h / 2, theme_1.FONT.body, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.6), 'center');
        ctx.restore();
        return;
    }
    var rowH = 54;
    for (var i = 0; i < logs.length && i < 7; i++) {
        var l = logs[i];
        var ry = y + 72 + i * rowH;
        if (ry + rowH > y + h - 12)
            break;
        if (i % 2 === 0) {
            (0, brush_1.fillWatercolor)(ctx, rectPts(x + 24, ry - 4, w - 48, rowH - 8), (0, palette_1.tint)(palette_1.PALETTE.moss, 0.5, palette_1.PALETTE.paper), {
                alpha: 0.5, layers: 1, seedIndex: 810 + i,
            });
        }
        var win = l.winner === 'player';
        var drone = l.winner === 'enemy';
        (0, theme_1.textOutlined)(ctx, '第 ' + l.round + ' 回合', x + 40, ry + 14, theme_1.FONT.entry, palette_1.PALETTE.inkSoft, 'left', 0);
        (0, theme_1.textPlain)(ctx, win ? '我方占优' : drone ? '敌方占优' : '平手', x + 172, ry + 14, theme_1.FONT.entry, win ? palette_1.PALETTE.forestMid : drone ? palette_1.PALETTE.berry : palette_1.PALETTE.bark, 'left', 'bold');
        var dmg = Math.abs(Math.round(l.houseDamage));
        (0, theme_1.textPlain)(ctx, '小屋伤害 ' + dmg, x + 172, ry + 38, theme_1.FONT.badge, palette_1.PALETTE.inkSoft, 'left');
        (0, theme_1.textPlain)(ctx, '天气 ' + (0, forest_1.weatherShort)(l.weather), x + 320, ry + 38, theme_1.FONT.badge, palette_1.PALETTE.stream, 'left');
        // 回合小叶子标记
        for (var k = 0; k < Math.min(3, l.buffCount); k++) {
            (0, paint_1.drawLeaf)(ctx, x + w - 60 - k * 16, ry + 20, 12, 1.1, palette_1.PALETTE.leafMid, 820 + i * 3 + k);
        }
    }
    if (logs.length > 7) {
        (0, theme_1.textPlain)(ctx, '……共 ' + logs.length + ' 回合', x + w / 2, y + h - 22, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.7), 'center');
    }
    ctx.restore();
}
