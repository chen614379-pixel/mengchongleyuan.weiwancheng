"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearingPath = clearingPath;
exports.drawStream = drawStream;
exports.drawBoard = drawBoard;
exports.drawEnemyFog = drawEnemyFog;
exports.drawMossPatch = drawMossPatch;
exports.drawGrassRipple = drawGrassRipple;
exports.drawDeployArrow = drawDeployArrow;
exports.drawHouseHp = drawHouseHp;
/**
 * 棋盘：一整块苔藓草甸水彩空地 + 中间蜿蜒小溪 + 边缘藤蔓/卵石/花 + 敌半场雾（§2.5 / §2.6.4）。
 *
 * 绝对禁止：格子线、点位标记、坐标点、方框（附录 D）。
 * 唯一允许的落点反馈是苔藓光斑 + 草叶涟漪（拖拽时也一样）。
 */
var layout_1 = require("../config/layout");
var palette_1 = require("../config/palette");
var timing_1 = require("../config/timing");
var brush_1 = require("../ui/brush");
var ease_1 = require("../ui/ease");
var theme_1 = require("../ui/theme");
var paint_1 = require("./paint");
function rnd(i, seed) {
    return ((0, brush_1.noiseAt)(i, seed) + 1) / 2;
}
/** 草甸空地（含边界起伏），供棋盘与营地共用。 */
function clearingPath(x, y, w, h) {
    var pts = [];
    var seg = 52;
    for (var i = 0; i <= seg; i++) {
        var a = (i / seg) * Math.PI * 2;
        var rx = w / 2;
        var ry = h / 2;
        var wob = 1 + (0, brush_1.noiseAt)(i, 13) * 0.035 + Math.sin(a * 3 + 0.7) * 0.02;
        pts.push({ x: x + w / 2 + Math.cos(a) * rx * wob, y: y + h / 2 + Math.sin(a) * ry * wob * 0.98 });
    }
    return pts;
}
/** 小溪中心线上的 y（随时间轻微起伏，形成「流动」错觉）。 */
function streamY(x, time, board) {
    var t = (x - board.x) / board.w;
    var base = board.y + board.h * (0.5 + Math.sin(t * 2.4 + 0.4) * 0.055 - t * 0.02);
    var flow = Math.sin(t * 5.2 + time / 900) * 5 + Math.sin(t * 2.1 - time / 1400) * 3;
    return base + flow;
}
/** 画一条蜿蜒小溪（含岸线、水色、流动高光）。 */
function drawStream(ctx, x0, x1, time, hi) {
    var board = layout_1.LAYOUT.BOARD;
    var step = 14;
    var top = [];
    var bot = [];
    var count = Math.ceil((x1 - x0) / step);
    for (var i = 0; i <= count; i++) {
        var x = x0 + (i / count) * (x1 - x0);
        var y = streamY(x, time, board);
        var half = 15 + Math.sin(x * 0.02 + 1.2) * 6 + (0, brush_1.noiseAt)(i, 21) * 3;
        top.push({ x: x, y: y - half });
        bot.push({ x: x, y: y + half });
    }
    var outline = top.slice();
    for (var i = bot.length - 1; i >= 0; i--)
        outline.push(bot[i]);
    (0, brush_1.fillWatercolor)(ctx, outline, (0, palette_1.tint)(palette_1.PALETTE.stream, 0.1, palette_1.PALETTE.paper), {
        alpha: 0.9, layers: 2, wetEdge: true, seedIndex: 33,
    });
    // 岸边湿土
    (0, brush_1.strokeInk)(ctx, top, { width: 2.2, jitter: 0.9, color: (0, palette_1.tint)(palette_1.PALETTE.soil, 0.35, palette_1.PALETTE.stream), seedIndex: 34 });
    (0, brush_1.strokeInk)(ctx, bot, { width: 2.2, jitter: 0.9, color: (0, palette_1.tint)(palette_1.PALETTE.soil, 0.35, palette_1.PALETTE.stream), seedIndex: 35 });
    // 流动高光：三道断续白线（战斗时随 hi 增强）
    var boost = hi === undefined ? 0 : hi;
    ctx.save();
    ctx.lineCap = 'round';
    for (var k = 0; k < 3; k++) {
        var pts = [];
        for (var i = 0; i <= count; i++) {
            var x = x0 + (i / count) * (x1 - x0);
            var y = streamY(x, time + k * 260, board) - 4 + k * 5;
            var wobble = Math.sin(x * 0.08 + time / (520 - k * 90) + k) * 1.6;
            if (Math.sin(x * 0.05 + k * 2 + time / 700) > -0.35)
                pts.push({ x: x, y: y + wobble });
        }
        if (pts.length > 1) {
            ctx.globalAlpha = (0.2 + k * 0.08) * (1 + boost * 0.8);
            ctx.strokeStyle = palette_1.PALETTE.creamMist;
            ctx.lineWidth = 2.4 - k * 0.4;
            (0, brush_1.tracePath)(ctx, (0, brush_1.jitterPoints)(pts, 0.8, 36 + k, false), false);
            ctx.stroke();
        }
    }
    ctx.restore();
}
/** 空地边缘的收边装饰：藤蔓、卵石、三叶草、小花、蘑菇。 */
function edgeDecor(ctx, x, y, w, h, time) {
    var border = clearingPath(x, y, w, h);
    // 藤蔓沿边界的一段段（不画满，留呼吸感）
    for (var seg = 0; seg < 6; seg++) {
        var a0 = (seg / 6) * Math.PI * 2 + 0.2;
        var a1 = a0 + Math.PI * 2 / 6 - 0.45;
        var pts = [];
        for (var i = 0; i <= 10; i++) {
            var a = a0 + (a1 - a0) * (i / 10);
            pts.push({ x: x + w / 2 + Math.cos(a) * (w / 2), y: y + h / 2 + Math.sin(a) * (h / 2) });
        }
        (0, paint_1.drawVine)(ctx, pts, 300 + seg * 11, { width: 2.2, leafEvery: 30, leafLen: 11 });
    }
    // 卵石与小花：沿边界外侧零散分布
    for (var i = 0; i < 14; i++) {
        var a = (i / 14) * Math.PI * 2 + rnd(i, 25) * 0.2;
        var px = x + w / 2 + Math.cos(a) * (w / 2 + 10 + rnd(i, 27) * 16);
        var py = y + h / 2 + Math.sin(a) * (h / 2 + 8 + rnd(i, 29) * 12);
        if (i % 3 === 0)
            (0, paint_1.drawPebble)(ctx, px, py, 12 + rnd(i, 31) * 8, 8 + rnd(i, 33) * 5, 400 + i * 7);
        else if (i % 3 === 1)
            (0, paint_1.drawClover)(ctx, px, py, 9 + rnd(i, 35) * 4, 420 + i * 5);
        else
            (0, paint_1.drawFlower)(ctx, px, py, 8 + rnd(i, 37) * 4, i % 2 === 0 ? palette_1.PALETTE.blossom : palette_1.PALETTE.sunbeam, 440 + i * 9);
    }
    // 内侧几处苔藓团与蘑菇，弱化「空地块」的边界感
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2 + 0.5;
        var px = x + w / 2 + Math.cos(a) * (w / 2 - 26);
        var py = y + h / 2 + Math.sin(a) * (h / 2 - 22);
        (0, paint_1.drawBush)(ctx, px, py, 20 + rnd(i, 41) * 12, 13 + rnd(i, 43) * 6, i % 2 === 0 ? palette_1.PALETTE.moss : palette_1.PALETTE.leafMid, 460 + i * 7);
        if (i % 4 === 2)
            (0, paint_1.drawMushroom)(ctx, px + 26, py + 10, 16, 480 + i * 5);
        if (i % 5 === 3)
            (0, paint_1.drawFern)(ctx, px - 24, py + 12, 26, -0.4, palette_1.PALETTE.leafLight, 490 + i * 3);
    }
    // 随风轻摆的边缘草（可视化「这里是活的草地」）
    var sway = Math.sin((time / 1000) * Math.PI) * 2;
    for (var i = 0; i < 10; i++) {
        var x0 = x + 30 + (i / 9) * (w - 60);
        (0, paint_1.drawFern)(ctx, x0, y + h - 2 + sway, 22, -1.3, palette_1.PALETTE.leafLight, 520 + i * 3);
    }
}
/**
 * 棋盘主体（match.ts 调用：`drawBoard(ctx, renderTime)`）。
 * `opts.fog` > 0 时叠加敌半场雾（布阵/集市阶段 opacity 1，观测窗渐隐）。
 */
function drawBoard(ctx, time, opts) {
    var b = layout_1.LAYOUT.BOARD;
    // 棋盘外的森林地面（避免侧栏两侧出现空白）
    ctx.save();
    ctx.globalAlpha = 0.5;
    var outer = [
        { x: b.x - 6, y: b.y - 6 },
        { x: b.x + b.w + 6, y: b.y - 6 },
        { x: b.x + b.w + 6, y: b.y + b.h + 6 },
        { x: b.x - 6, y: b.y + b.h + 6 },
    ];
    (0, brush_1.fillWatercolor)(ctx, outer, (0, palette_1.tint)(palette_1.PALETTE.forestMid, 0.35, palette_1.PALETTE.paper), { alpha: 0.5, layers: 1, seedIndex: 2 });
    ctx.restore();
    // 空地本体：一层苔藓底 + 一层受光草甸
    var clearing = clearingPath(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    (0, brush_1.fillWatercolor)(ctx, clearing, palette_1.PALETTE.meadow, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: 3 });
    (0, brush_1.fillWatercolor)(ctx, [
        { x: b.x + 40, y: b.y + b.h * 0.42 },
        { x: b.x + b.w - 60, y: b.y + b.h * 0.3 },
        { x: b.x + b.w - 30, y: b.y + b.h - 30 },
        { x: b.x + 60, y: b.y + b.h - 16 },
    ], (0, palette_1.tint)(palette_1.PALETTE.leafLight, 0.34, palette_1.PALETTE.paper), { alpha: 0.45, layers: 2, wetEdge: true, seedIndex: 4 });
    // 草地上的深浅斑块（水彩的自然不均）
    for (var i = 0; i < 9; i++) {
        var px = b.x + 60 + rnd(i, 51) * (b.w - 120);
        var py = b.y + 60 + rnd(i * 3, 53) * (b.h - 120);
        (0, brush_1.blobPath)(ctx, px - 60, py - 26, 120, 52, 1.4, 55 + i);
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = i % 2 === 0 ? palette_1.PALETTE.moss : (0, palette_1.tint)(palette_1.PALETTE.leafMid, 0.2, palette_1.PALETTE.paper);
        ctx.fill();
        ctx.restore();
    }
    // 小溪横穿中央 + 踏脚石
    drawStream(ctx, b.x + 6, b.x + b.w - 6, time, opts && opts.fog ? 0 : 0.2);
    var stones = [0.22, 0.5, 0.78];
    for (var i = 0; i < stones.length; i++) {
        var sx = b.x + b.w * stones[i];
        var sy = streamY(sx, time, b) + (i % 2 === 0 ? -3 : 4);
        (0, paint_1.drawStone)(ctx, sx, sy, 15 + i * 3, 600 + i * 5, i === 1);
        (0, paint_1.drawRipple)(ctx, sx, sy + 8, 14 + i * 3, 0.25);
    }
    edgeDecor(ctx, b.x + 8, b.y + 8, b.w - 16, b.h - 16, time);
    // 敌半场雾（布阵/集市：敌方棋盘绝对不可见）
    if (opts && opts.fog && opts.fog > 0)
        drawEnemyFog(ctx, time, opts.fog);
}
/** 敌半场雾 + 树影 + ？剪影（§2.6.4）。density 0~1。 */
function drawEnemyFog(ctx, time, density) {
    var d = density === undefined ? 1 : Math.max(0, Math.min(1, density));
    if (d <= 0)
        return;
    var b = layout_1.LAYOUT.BOARD;
    var x = b.x;
    var y = b.y;
    var w = b.w;
    var h = b.h * 0.56;
    ctx.save();
    ctx.globalAlpha = d;
    // 雾后的树影
    for (var i = 0; i < 7; i++) {
        var tx = x + 60 + i * (w / 6.6) + Math.sin(time / 2600 + i) * 8;
        var th = 120 + rnd(i, 61) * 90;
        var cols = [];
        for (var k = 0; k < 7; k++) {
            var a = (k / 7) * Math.PI * 2;
            cols.push({ x: tx + Math.cos(a) * 46 * (1 + (0, brush_1.noiseAt)(k, 63) * 0.2), y: y + h - 30 + Math.sin(a) * 26 });
        }
        (0, brush_1.fillWatercolor)(ctx, cols, (0, palette_1.tint)(palette_1.PALETTE.forestDeep, 0.5, palette_1.PALETTE.creamMist), {
            alpha: 0.5, layers: 2, wetEdge: false, seedIndex: 70 + i,
        });
        (0, brush_1.strokeInk)(ctx, [{ x: tx - 7, y: y + h - 24 }, { x: tx - 4, y: y + h - th }, { x: tx + 6, y: y + h - th * 0.9 }, { x: tx + 7, y: y + h - 20 }], {
            width: 6, jitter: 1.4, color: (0, palette_1.tint)(palette_1.PALETTE.bark, 0.35, palette_1.PALETTE.creamMist), seedIndex: 90 + i,
        });
    }
    // 雾层
    for (var i = 0; i < 4; i++) {
        var drift = ((0, ease_1.cycle)(time, 18000 + i * 5200, i * 610) - 0.5) * 70;
        (0, paint_1.drawFogBand)(ctx, x - 20 + drift, y + (i / 4) * h, w + 40, h / 3.4, 0.42, 130 + i * 11);
    }
    // ？剪影：提示「这里有敌人，但看不清」
    var qs = [0.2, 0.44, 0.68, 0.86];
    for (var i = 0; i < qs.length; i++) {
        var qx = x + w * qs[i];
        var qy = y + h * (0.62 + rnd(i, 65) * 0.22);
        var pulse = 0.5 + 0.2 * (0, ease_1.breathe)(time, 2400 + i * 300);
        ctx.save();
        ctx.globalAlpha = 0.5 * pulse;
        ctx.fillStyle = palette_1.PALETTE.twilight;
        (0, brush_1.blobPath)(ctx, qx - 34, qy - 46, 68, 92, 1.2, 150 + i * 7);
        ctx.fill();
        ctx.restore();
        (0, theme_1.setFont)(ctx, theme_1.FONT.h1, 'bold');
        (0, theme_1.textOutlined)(ctx, '?', qx, qy - 2, theme_1.FONT.h1, palette_1.PALETTE.creamMist, 'center');
    }
    ctx.restore();
}
/** 呼吸的苔藓光斑（唯一允许的落点反馈；MOSS_BREATH = 800ms）。 */
function drawMossPatch(ctx, cx, cy, r, time, alpha) {
    var breath = 0.72 + 0.28 * (0, ease_1.breathe)(time, timing_1.TIMING.MOSS_BREATH);
    var a = (alpha === undefined ? 0.5 : alpha) * breath;
    (0, paint_1.drawMossLight)(ctx, cx, cy, r, a, 7);
}
/** 落位草叶涟漪（0.25s）：一圈散开的草叶 + 渐隐苔藓斑。 */
function drawGrassRipple(ctx, cx, cy, progress) {
    var p = Math.max(0, Math.min(1, progress));
    var fade = (0, ease_1.decay)(p * timing_1.TIMING.MOSS_RIPPLE, timing_1.TIMING.MOSS_RIPPLE);
    var r = 22 + p * 34;
    // 草叶：8 根向外倒伏
    ctx.save();
    ctx.globalAlpha = 0.7 * fade;
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2 + 0.3;
        var len = r * (0.7 + (0, brush_1.noiseAt)(i, 3) * 0.25);
        var pts = [
            { x: cx + Math.cos(a) * r * 0.28, y: cy + Math.sin(a) * r * 0.16 },
            { x: cx + Math.cos(a) * len * 0.7, y: cy + Math.sin(a) * len * 0.4 },
            { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len * 0.52 },
        ];
        (0, brush_1.strokeInk)(ctx, pts, {
            width: 2.4, jitter: 0.9, color: (0, palette_1.tint)(palette_1.PALETTE.leafMid, 0.2, palette_1.PALETTE.forestDeep), seedIndex: 21 + i,
        });
    }
    ctx.restore();
    (0, paint_1.drawMossLight)(ctx, cx, cy, 16 + p * 20, 0.42 * fade, 31);
    (0, paint_1.drawRipple)(ctx, cx, cy, r * 0.9, 0.3 * fade);
}
/**
 * 拖起时的淡箭头（§4.3：只有拖拽时出现，指向敌方半场；不画任何网格/连线到对位）。
 * `dirX` 为拖拽水平方向（-1/0/1），只影响箭头轻微倾斜。
 */
function drawDeployArrow(ctx, fromX, fromY, dirX, time, alpha) {
    var a = alpha === undefined ? 0.5 : alpha;
    var pulse = 0.75 + 0.25 * (0, ease_1.breathe)(time, 900);
    var tilt = Math.max(-0.4, Math.min(0.4, dirX * 0.28));
    var len = 54;
    var tipX = fromX + tilt * len;
    var tipY = fromY - len;
    ctx.save();
    ctx.globalAlpha = a * pulse;
    (0, brush_1.strokeInk)(ctx, [{ x: fromX, y: fromY - 6 }, { x: fromX + tilt * len * 0.5, y: fromY - len * 0.6 }, { x: tipX, y: tipY }], {
        width: 3, jitter: 1.1, color: palette_1.PALETTE.creamMist, seedIndex: 41,
    });
    // 箭头头部：两笔手绘短划
    (0, brush_1.strokeInk)(ctx, [{ x: tipX - 9, y: tipY + 12 }, { x: tipX, y: tipY }, { x: tipX + 9, y: tipY + 12 }], {
        width: 3, jitter: 0.9, color: palette_1.PALETTE.creamMist, seedIndex: 42,
    });
    ctx.globalAlpha = a * pulse * 0.5;
    (0, paint_1.drawMossLight)(ctx, fromX, fromY, 20, 0.5, 43);
    ctx.restore();
}
/** 小屋 HP（§2.8 允许的矩形例外：木牌 + 圆角条）。 */
function drawHouseHp(ctx, x, y, w, h, hp, maxHp) {
    var ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    (0, brush_1.fillWatercolor)(ctx, [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ], palette_1.PALETTE.barkLight, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: 8 });
    (0, paint_1.woodGrain)(ctx, x + 4, y + 3, w - 8, h - 6, 9);
    (0, brush_1.strokeInk)(ctx, [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h },
    ], { width: 2.6, close: true, seedIndex: 10 });
    // 轨道 + 血量（≥30% 绿，<30% 浆果红）
    var inX = x + 6;
    var inY = y + h * 0.52;
    var inW = w - 12;
    var inH = h * 0.34;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette_1.PALETTE.forestDeep;
    ctx.beginPath();
    ctx.rect(inX, inY, inW, inH);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = ratio < 0.3 ? palette_1.PALETTE.berry : palette_1.PALETTE.leafLight;
    ctx.beginPath();
    ctx.rect(inX + 1, inY + 1, Math.max(0, (inW - 2) * ratio), inH - 2);
    ctx.fill();
    ctx.restore();
    (0, theme_1.setFont)(ctx, theme_1.FONT.badge, 'bold');
    (0, theme_1.textPlain)(ctx, 'HP ' + Math.round(hp) + '/' + Math.round(maxHp), x + w / 2, y + h * 0.28, theme_1.FONT.badge, palette_1.PALETTE.creamMist, 'center', 'bold');
}
