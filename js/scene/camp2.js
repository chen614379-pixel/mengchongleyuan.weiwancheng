"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Camp2Scene = void 0;
var palette_1 = require("../config/palette");
var layout_1 = require("../config/layout");
var assets_1 = require("../render/assets");
var ui_1 = require("../render/ui");
var brush_1 = require("../ui/brush");
var theme_1 = require("../ui/theme");
var storage_1 = require("../platform/storage");
var audio_1 = require("../platform/audio");
var screen_1 = require("../platform/screen");
var W = layout_1.LAYOUT.SCREEN_W;
var H = layout_1.LAYOUT.SCREEN_H;
/** 底部木坞（拇指区）。 */
var DOCK = { x: 24, y: 604, w: 1232, h: 96 };
/** 主行动：开始对战 / 次行动：图鉴。 */
var CTA = { x: 64, y: 352, w: 212, h: 64 };
var CTA_2 = { x: 288, y: 352, w: 112, h: 64 };
/** 顶部天气卡：y=84 起，避开右上角微信胶囊（112×40）。 */
var WEATHER = { x: 896, y: 84, w: 360, h: 64 };
/** 底部四个入口。 */
var TILES = [
    { id: 'deck', label: '卡组', sub: 'DECK · 12', x: 250, badge: 2 },
    { id: 'collection', label: '图鉴', sub: 'DEX · 8', x: 394, badge: 0 },
    { id: 'shop', label: '商店', sub: 'SHOP · 3', x: 538, badge: 1 },
    { id: 'rank', label: '段位', sub: 'RANK · 青铜', x: 682, badge: 0 }
];
var TILE_W = 132;
var TILE_H = 64;
var SETTINGS = { x: 1176, y: 628, w: 48, h: 48 };
function hitRect(id, r) {
    return { id: id, x: r.x, y: r.y, w: r.w, h: r.h };
}
var Camp2Scene = /** @class */ (function () {
    function Camp2Scene(opts) {
        this.name = 'camp2';
        this.t = 0;
        this.hover = '';
        this.pressed = '';
        this.pressAt = -9999;
        this.opts = opts;
        this.hits = [
            hitRect('battle', CTA),
            hitRect('collection2', CTA_2),
            hitRect('settings', SETTINGS)
        ];
        for (var i = 0; i < TILES.length; i++) {
            this.hits.push({ id: TILES[i].id, x: TILES[i].x, y: DOCK.y + 16, w: TILE_W, h: TILE_H });
        }
    }
    Camp2Scene.prototype.enter = function () {
        this.t = 0;
        this.hover = '';
    };
    Camp2Scene.prototype.tick = function (logicTime) {
        this.t = logicTime;
        if (this.pressed && this.t - this.pressAt > 180)
            this.pressed = '';
    };
    Camp2Scene.prototype.render = function (ctx, renderTime) {
        var box = (0, screen_1.sceneBox)();
        var ox = (box.w - W) / 2;
        var oy = (box.h - H) / 2;
        // 极宽屏时先铺底，再把 1280×720 的设计框居中
        ctx.fillStyle = palette_1.PALETTE.forestDeep;
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.save();
        ctx.translate(ox, oy);
        this.drawBackdrop(ctx);
        this.drawLight(ctx);
        this.drawPets(ctx);
        this.drawFire(ctx);
        this.drawTop(ctx);
        this.drawHero(ctx);
        this.drawWeather(ctx);
        this.drawDock(ctx);
        this.drawFireflies(ctx);
        ctx.restore();
    };
    /* ------------------------------------------------------------------ */
    /* 背景（离屏缓存，不参与每帧重绘）                                    */
    /* ------------------------------------------------------------------ */
    Camp2Scene.prototype.drawBackdrop = function (ctx) {
        var bg = (0, assets_1.getSurface)('camp2-bg-v1', W, H, function (cv, c) { return paintBackdrop(c); });
        if (bg) {
            ctx.drawImage(bg, 0, 0, W, H);
            return;
        }
        paintBackdrop(ctx);
    };
    /** 暖光：静态底上再叠一层随呼吸变化的中心光，让画面不死。 */
    Camp2Scene.prototype.drawLight = function (ctx) {
        var pulse = 0.82 + 0.18 * Math.sin(this.t / 2600);
        var g = ctx.createRadialGradient(910, 540, 30, 910, 540, 560);
        g.addColorStop(0, (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.18 * pulse));
        g.addColorStop(0.55, (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.05 * pulse));
        g.addColorStop(1, (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    };
    Camp2Scene.prototype.drawPets = function (ctx) {
        var cast = [
            { species: 'wolf', x: 664, y: 600, scale: 0.55, phase: 0.4 },
            { species: 'tiger', x: 792, y: 602, scale: 0.72, phase: 1.6 },
            { species: 'dog', x: 912, y: 600, scale: 0.56, phase: 2.7 },
            { species: 'elephant', x: 1022, y: 600, scale: 0.70, phase: 3.6 },
            { species: 'cat', x: 1118, y: 600, scale: 0.48, phase: 4.4 },
            { species: 'leopard', x: 1186, y: 598, scale: 0.44, phase: 5.1 }
        ];
        for (var i = 0; i < cast.length; i++) {
            var p = cast[i];
            var bob = Math.sin(this.t / 820 + p.phase) * 3.4;
            var sway = Math.sin(this.t / 5200 + p.phase) * 8;
            var img = (0, assets_1.getImage)('unit-' + p.species);
            var size = 256 * p.scale;
            var x = p.x + sway;
            var y = p.y + bob;
            // 地面阴影
            ctx.save();
            ctx.globalAlpha = 0.22;
            var sh = blobPoints(x, y + 3, size * 0.3, size * 0.07, 10, 700 + i);
            (0, brush_1.fillWatercolor)(ctx, sh, palette_1.PALETTE.forestDeep, { alpha: 0.6, layers: 1, seedIndex: 701 + i });
            ctx.restore();
            if (img) {
                ctx.drawImage(img, x - size / 2, y - size, size, size);
            }
        }
    };
    /** 篝火：画在宠物前，压住脚边，给画面一个「营地」的锚点。 */
    Camp2Scene.prototype.drawFire = function (ctx) {
        var x = 924;
        var y = 600;
        var flick = 1 + 0.1 * Math.sin(this.t / 130) + 0.05 * Math.sin(this.t / 51);
        // 火光：先铺一层暖色，让周围的草和动物边缘有点橙
        var glow = ctx.createRadialGradient(x, y - 44, 8, x, y - 44, 156);
        glow.addColorStop(0, (0, palette_1.rgba)(palette_1.PALETTE.sunset, 0.24));
        glow.addColorStop(0.55, (0, palette_1.rgba)(palette_1.PALETTE.sunset, 0.08));
        glow.addColorStop(1, (0, palette_1.rgba)(palette_1.PALETTE.sunset, 0));
        ctx.save();
        ctx.fillStyle = glow;
        ctx.fillRect(x - 160, y - 200, 320, 260);
        ctx.restore();
        // 石圈
        for (var i = 0; i < 8; i++) {
            var a = (i / 8) * Math.PI * 2;
            var px = x + Math.cos(a) * 56;
            var py = y + Math.sin(a) * 15;
            var pts = blobPoints(px, py, 11, 9, 9, 720 + i);
            (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.soil, { alpha: 0.95, layers: 1, seedIndex: 721 + i });
            (0, brush_1.strokeInk)(ctx, pts, { width: 2, close: true, seedIndex: 731 + i, jitter: 0.6 });
        }
        // 柴
        (0, brush_1.strokeInk)(ctx, [{ x: x - 34, y: y }, { x: x + 34, y: y - 16 }], { width: 8, color: palette_1.PALETTE.bark, seedIndex: 740 });
        (0, brush_1.strokeInk)(ctx, [{ x: x - 30, y: y - 14 }, { x: x + 30, y: y + 3 }], { width: 8, color: palette_1.PALETTE.barkLight, seedIndex: 741 });
        // 火焰三层（水彩）
        var flame = function (s, color, alpha, seed) {
            var fh = 74 * s * flick;
            var pts = [
                { x: x - 27 * s, y: y - 10 },
                { x: x - 13 * s, y: y - 10 - fh * 0.55 },
                { x: x + 1 * s, y: y - 10 - fh },
                { x: x + 15 * s, y: y - 10 - fh * 0.5 },
                { x: x + 27 * s, y: y - 10 }
            ];
            (0, brush_1.fillWatercolor)(ctx, pts, color, { alpha: alpha, layers: 2, wetEdge: true, seedIndex: seed });
        };
        flame(1.42, palette_1.PALETTE.sunset, 0.6, 750);
        flame(1.08, palette_1.PALETTE.sunbeam, 0.78, 751);
        flame(0.62, palette_1.PALETTE.creamMist, 0.85, 752);
    };
    Camp2Scene.prototype.drawFireflies = function (ctx) {
        for (var i = 0; i < 14; i++) {
            var p = this.t / (2600 + i * 170) + i * 0.7;
            var x = 560 + ((i * 97) % 660) + Math.sin(p) * 16;
            var y = 250 + ((i * 61) % 320) + Math.cos(p * 0.8) * 14;
            var a = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(p * 2.2));
            var r = 1.3 + (i % 3) * 0.5;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = i % 4 === 0 ? palette_1.PALETTE.creamMist : palette_1.PALETTE.sunbeam;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = a * 0.18;
            ctx.beginPath();
            ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    };
    /* ------------------------------------------------------------------ */
    /* 顶栏                                                               */
    /* ------------------------------------------------------------------ */
    Camp2Scene.prototype.drawTop = function (ctx) {
        // 品牌：叶片圆牌 + 两行字
        var cx = 47;
        var cy = 40;
        var ring = blobPoints(cx, cy, 23, 23, 18, 800);
        (0, brush_1.fillWatercolor)(ctx, ring, palette_1.PALETTE.leafMid, { alpha: 0.96, layers: 1, seedIndex: 801 });
        (0, brush_1.strokeInk)(ctx, ring, { width: 2.4, close: true, color: palette_1.PALETTE.forestDeep, seedIndex: 802 });
        drawLeaf(ctx, cx + 1, cy - 2, 13, -0.7, palette_1.PALETTE.creamMist, 803);
        (0, theme_1.textOutlined)(ctx, '萌宠乱斗', 80, 33, 23, palette_1.PALETTE.creamMist, 'left', 2.4, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.7));
        (0, theme_1.textPlain)(ctx, 'FOREST CAMP', 80, 53, 9, (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.55), 'left', 'bold');
        // 货币：金阳 + 爪印币 + 星辉（左上，不碰右上胶囊）
        var save = (0, storage_1.loadSave)();
        this.drawChip(ctx, 224, 20, 118, 40, 'sun', '' + save.coins);
        this.drawChip(ctx, 354, 20, 108, 40, 'star', '' + save.stars);
    };
    Camp2Scene.prototype.drawChip = function (ctx, x, y, w, h, icon, value) {
        var pts = (0, brush_1.roundedRectPoints)(x, y, w, h, h / 2);
        (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.inkSoft, { alpha: 0.42, layers: 1, wetEdge: true, seedIndex: 810 + x });
        (0, brush_1.strokeInk)(ctx, pts, { width: 1.6, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.26), seedIndex: 811 + x });
        var ix = x + 22;
        var iy = y + h / 2;
        if (icon === 'sun')
            drawSun(ctx, ix, iy, 10, 812);
        else if (icon === 'star')
            drawStar(ctx, ix, iy, 10, 813);
        else
            drawPaw(ctx, ix, iy, 10, 814);
        (0, theme_1.setFont)(ctx, 19, 'bold');
        ctx.fillStyle = palette_1.PALETTE.creamMist;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(value, ix + 18, iy + 1);
        ctx.textBaseline = 'alphabetic';
    };
    /* ------------------------------------------------------------------ */
    /* 主视觉                                                             */
    /* ------------------------------------------------------------------ */
    Camp2Scene.prototype.drawHero = function (ctx) {
        // eyebrow
        (0, brush_1.strokeInk)(ctx, [{ x: 64, y: 128 }, { x: 100, y: 128 }], {
            width: 2, color: (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.65), seedIndex: 820, jitter: 0.4
        });
        (0, theme_1.textPlain)(ctx, 'FOREST CAMP · 第 4 回合', 112, 128, 14, (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.62), 'left', 'bold');
        // 标题：先压一层暗影再描边，浅色字在深林里也不糊
        (0, theme_1.textOutlined)(ctx, '萌宠乱斗', 65, 218, 90, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.35), 'left', 5, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.35));
        (0, theme_1.textOutlined)(ctx, '萌宠乱斗', 64, 214, 90, palette_1.PALETTE.creamMist, 'left', 3, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9));
        (0, theme_1.textPlain)(ctx, '带 6 只小动物 走上林间草地。', 66, 296, 21, (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.9), 'left', 'bold');
        (0, theme_1.textPlain)(ctx, '用克制、天气与站位，赢下 8 个回合。', 66, 326, 21, (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.9), 'left', 'bold');
        var ctaDown = this.pressed === 'battle' ? 'pressed' : 'normal';
        if (this.hover === 'battle' || this.pressed === 'battle') {
            var glow = (0, brush_1.roundedRectPoints)(CTA.x - 10, CTA.y - 8, CTA.w + 20, CTA.h + 18, 30);
            (0, brush_1.fillWatercolor)(ctx, glow, palette_1.PALETTE.sunbeam, { alpha: 0.18, layers: 1, seedIndex: 830 });
        }
        (0, ui_1.drawButton)(ctx, CTA.x, CTA.y, CTA.w, CTA.h, '开始对战', {
            state: ctaDown, time: this.t, radius: 22, tone: 'berry'
        });
        // 次行动：纸牌，不做第二颗红按钮
        var paper = (0, brush_1.roundedRectPoints)(CTA_2.x, CTA_2.y, CTA_2.w, CTA_2.h, 20);
        (0, brush_1.fillWatercolor)(ctx, paper, palette_1.PALETTE.paper, { alpha: 0.96, layers: 1, wetEdge: true, seedIndex: 840 });
        (0, brush_1.strokeInk)(ctx, paper, { width: 2.4, close: true, color: palette_1.PALETTE.bark, seedIndex: 841 });
        if (this.hover === 'collection2') {
            (0, brush_1.fillWatercolor)(ctx, paper, palette_1.PALETTE.sunbeam, { alpha: 0.18, layers: 1, seedIndex: 842 });
        }
        (0, theme_1.textOutlined)(ctx, '图鉴', CTA_2.x + CTA_2.w / 2, CTA_2.y + CTA_2.h / 2 + 1, 21, palette_1.PALETTE.inkSoft, 'center', 1.6, palette_1.PALETTE.paper);
        // 上一局摘要
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = palette_1.PALETTE.sunbeam;
        ctx.beginPath();
        ctx.arc(70, 440, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        (0, theme_1.textPlain)(ctx, '上一局 · 第 8 回合胜利 · MVP 虎', 82, 440, 14, (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.55), 'left');
    };
    Camp2Scene.prototype.drawWeather = function (ctx) {
        var pts = (0, brush_1.roundedRectPoints)(WEATHER.x, WEATHER.y, WEATHER.w, WEATHER.h, 18);
        (0, brush_1.fillWatercolor)(ctx, pts, (0, palette_1.tint)(palette_1.PALETTE.inkSoft, 0.34, palette_1.PALETTE.forestDeep), { alpha: 0.8, layers: 1, wetEdge: true, seedIndex: 850 });
        (0, brush_1.strokeInk)(ctx, pts, { width: 1.6, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.3), seedIndex: 851 });
        drawSun(ctx, WEATHER.x + 32, WEATHER.y + 32, 13, 852);
        (0, theme_1.textPlain)(ctx, '今日 · 林间晴', WEATHER.x + 56, WEATHER.y + 23, 17, palette_1.PALETTE.creamMist, 'left', 'bold');
        (0, theme_1.textPlain)(ctx, '我方攻击 +12% · 敌方每 3s 流失 1% 血', WEATHER.x + 56, WEATHER.y + 45, 12.5, (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.72), 'left');
    };
    /* ------------------------------------------------------------------ */
    /* 底坞                                                               */
    /* ------------------------------------------------------------------ */
    Camp2Scene.prototype.drawDock = function (ctx) {
        var pts = (0, brush_1.roundedRectPoints)(DOCK.x, DOCK.y, DOCK.w, DOCK.h, 26);
        (0, brush_1.fillWatercolor)(ctx, pts, (0, palette_1.tint)(palette_1.PALETTE.bark, 0.58, palette_1.PALETTE.inkSoft), { alpha: 0.99, layers: 1, wetEdge: true, seedIndex: 860 });
        (0, brush_1.strokeInk)(ctx, pts, { width: 2.6, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.26), seedIndex: 861 });
        (0, brush_1.strokeInk)(ctx, [
            { x: DOCK.x + 40, y: DOCK.y + 4 }, { x: DOCK.x + DOCK.w - 40, y: DOCK.y + 4 }
        ], { width: 2, color: (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.16), seedIndex: 862, jitter: 0.5 });
        // 头像：草帽男孩脸部
        var ax = 40;
        var ay = 620;
        var ar = 32;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + ar, ay + ar, ar - 2, 0, Math.PI * 2);
        ctx.clip();
        var coach = (0, assets_1.getImage)('coach-boy');
        if (coach)
            ctx.drawImage(coach, 0, 0, 256, 300, ax, ay - 6, 64, 75);
        else {
            ctx.fillStyle = palette_1.PALETTE.soil;
            ctx.fillRect(ax, ay, 64, 64);
        }
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.75);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ax + ar, ay + ar, ar - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        (0, theme_1.textPlain)(ctx, '小园丁', 118, 638, 19, palette_1.PALETTE.creamMist, 'left', 'bold');
        (0, theme_1.textPlain)(ctx, 'Lv.6', 190, 638, 11, (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.9), 'left', 'bold');
        // 段位进度
        var barW = 112;
        var barX = 118;
        var barY = 654;
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9);
        (0, brush_1.roundRectPath)(ctx, barX, barY, barW, 5, 2.5, 0, 863);
        ctx.fill();
        ctx.fillStyle = palette_1.PALETTE.sunbeam;
        (0, brush_1.roundRectPath)(ctx, barX, barY, 74, 5, 2.5, 0, 864);
        ctx.fill();
        (0, theme_1.textPlain)(ctx, '青铜 III · 距白银 36', 118, 672, 10, (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.5), 'left');
        // 分隔
        (0, brush_1.strokeInk)(ctx, [{ x: 236, y: DOCK.y + 18 }, { x: 236, y: DOCK.y + DOCK.h - 18 }], {
            width: 1.6, color: (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.18), seedIndex: 865, jitter: 0.4
        });
        for (var i = 0; i < TILES.length; i++)
            this.drawTile(ctx, TILES[i]);
        // 设置
        var s = SETTINGS;
        var sp = (0, brush_1.roundedRectPoints)(s.x, s.y, s.w, s.h, 24);
        (0, brush_1.fillWatercolor)(ctx, sp, this.hover === 'settings' ? palette_1.PALETTE.sunbeam : palette_1.PALETTE.paper, {
            alpha: 0.92, layers: 1, wetEdge: true, seedIndex: 866
        });
        (0, brush_1.strokeInk)(ctx, sp, { width: 2, close: true, color: palette_1.PALETTE.bark, seedIndex: 867 });
        drawSliders(ctx, s.x + 12, s.y + 12, 24, palette_1.PALETTE.inkSoft, 868);
    };
    Camp2Scene.prototype.drawTile = function (ctx, tile) {
        var y = DOCK.y + 16;
        var active = this.hover === tile.id;
        var down = this.pressed === tile.id ? 2 : 0;
        var pts = (0, brush_1.roundedRectPoints)(tile.x, y + down, TILE_W, TILE_H, 16);
        (0, brush_1.fillWatercolor)(ctx, pts, active ? palette_1.PALETTE.sunbeam : palette_1.PALETTE.paper, {
            alpha: 0.95, layers: 1, wetEdge: true, seedIndex: 870 + tile.x
        });
        (0, brush_1.strokeInk)(ctx, pts, { width: 2, close: true, color: palette_1.PALETTE.bark, seedIndex: 871 + tile.x });
        var ix = tile.x + 27;
        var iy = y + 32 + down;
        if (tile.id === 'deck')
            drawCardsIcon(ctx, ix, iy, 24, palette_1.PALETTE.inkSoft, 872);
        else if (tile.id === 'collection')
            drawBookIcon(ctx, ix, iy, 24, palette_1.PALETTE.inkSoft, 873);
        else if (tile.id === 'shop')
            drawBagIcon(ctx, ix, iy, 24, palette_1.PALETTE.inkSoft, 874);
        else
            drawMedalIcon(ctx, ix, iy, 24, palette_1.PALETTE.inkSoft, 875);
        (0, theme_1.textPlain)(ctx, tile.label, tile.x + 48, y + 27 + down, 17, palette_1.PALETTE.inkSoft, 'left', 'bold');
        (0, theme_1.textPlain)(ctx, tile.sub, tile.x + 48, y + 46 + down, 9, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.55), 'left', 'bold');
        if (tile.badge > 0) {
            ctx.save();
            ctx.fillStyle = palette_1.PALETTE.berry;
            ctx.beginPath();
            ctx.arc(tile.x + TILE_W - 12, y + 10 + down, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            (0, theme_1.textPlain)(ctx, '' + tile.badge, tile.x + TILE_W - 12, y + 10 + down, 10, palette_1.PALETTE.creamMist, 'center', 'bold');
        }
    };
    /* ------------------------------------------------------------------ */
    /* 手势                                                               */
    /* ------------------------------------------------------------------ */
    Camp2Scene.prototype.gesture = function (e) {
        if (e.type === 'move') {
            this.hover = this.hit(e.x, e.y);
            return;
        }
        if (e.type !== 'up' || e.wasDrag)
            return;
        var id = this.hit(e.x, e.y);
        if (!id)
            return;
        (0, audio_1.playSfx)('tap');
        this.pressed = id;
        this.pressAt = this.t;
        if (id === 'battle')
            this.opts.onStartMatch();
        else if (id === 'collection' || id === 'collection2')
            this.opts.onOpenCollection();
        else if (id === 'deck')
            this.opts.onOpenDeck();
        else if (id === 'shop')
            this.opts.onOpenShop();
        else if (id === 'rank')
            this.opts.onOpenRank();
        else if (id === 'settings')
            this.opts.onOpenSettings();
    };
    Camp2Scene.prototype.hit = function (x, y) {
        for (var i = this.hits.length - 1; i >= 0; i--) {
            var h = this.hits[i];
            if (x >= h.x - 6 && x <= h.x + h.w + 6 && y >= h.y - 6 && y <= h.y + h.h + 8)
                return h.id;
        }
        return '';
    };
    return Camp2Scene;
}());
exports.Camp2Scene = Camp2Scene;
/* -------------------------------------------------------------------- */
/* 背景绘制（只在离屏画布跑一次）                                        */
/* -------------------------------------------------------------------- */
function paintBackdrop(ctx) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, (0, palette_1.tint)(palette_1.PALETTE.forestDeep, 0.04, palette_1.PALETTE.inkSoft));
    g.addColorStop(0.44, palette_1.PALETTE.forestDeep);
    g.addColorStop(0.76, (0, palette_1.tint)(palette_1.PALETTE.forestMid, 0.14, palette_1.PALETTE.forestDeep));
    g.addColorStop(1, (0, palette_1.tint)(palette_1.PALETTE.forestDeep, 0.08, palette_1.PALETTE.inkSoft));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 中央暖光：所有宠物站在光里，四周自然压暗
    var rg = ctx.createRadialGradient(900, 520, 20, 900, 520, 620);
    rg.addColorStop(0, (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.16));
    rg.addColorStop(0.55, (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.045));
    rg.addColorStop(1, (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    // 地面：深苔色，不抢宠物
    (0, brush_1.fillWatercolor)(ctx, blobPoints(640, 700, 760, 150, 26, 930), palette_1.PALETTE.forestMid, {
        alpha: 0.45, layers: 2, wetEdge: true, seedIndex: 931
    });
    (0, brush_1.fillWatercolor)(ctx, blobPoints(880, 650, 540, 110, 26, 932), palette_1.PALETTE.leafMid, {
        alpha: 0.12, layers: 1, seedIndex: 933
    });
    // 两侧树干剪影，框住画面
    (0, brush_1.fillWatercolor)(ctx, [
        { x: 0, y: 0 }, { x: 74, y: 0 }, { x: 58, y: 240 }, { x: 70, y: 520 }, { x: 30, y: 720 }, { x: 0, y: 720 }
    ], palette_1.PALETTE.inkSoft, { alpha: 0.4, layers: 2, wetEdge: true, seedIndex: 940 });
    (0, brush_1.fillWatercolor)(ctx, [
        { x: W, y: 0 }, { x: W - 70, y: 0 }, { x: W - 52, y: 260 }, { x: W - 64, y: 540 }, { x: W - 26, y: 720 }, { x: W, y: 720 }
    ], palette_1.PALETTE.inkSoft, { alpha: 0.36, layers: 2, wetEdge: true, seedIndex: 941 });
    // 光柱：从右上斜插到草地
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = palette_1.PALETTE.sunbeam;
    ctx.beginPath();
    ctx.moveTo(980, 0);
    ctx.lineTo(1110, 0);
    ctx.lineTo(760, 640);
    ctx.lineTo(610, 640);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.035;
    ctx.beginPath();
    ctx.moveTo(1140, 0);
    ctx.lineTo(1200, 0);
    ctx.lineTo(930, 600);
    ctx.lineTo(850, 600);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 四边压暗（比全局 vignette 更稳，不依赖中段透明度）
    var top = ctx.createLinearGradient(0, 0, 0, 250);
    top.addColorStop(0, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.5));
    top.addColorStop(1, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0));
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 250);
    var bottom = ctx.createLinearGradient(0, 430, 0, H);
    bottom.addColorStop(0, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0));
    bottom.addColorStop(1, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.52));
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 430, W, H - 430);
    var left = ctx.createLinearGradient(0, 0, 260, 0);
    left.addColorStop(0, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.3));
    left.addColorStop(1, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0));
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, 260, H);
    var right = ctx.createLinearGradient(W - 240, 0, W, 0);
    right.addColorStop(0, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0));
    right.addColorStop(1, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.3));
    ctx.fillStyle = right;
    ctx.fillRect(W - 240, 0, 240, H);
    // 地面细碎的点：草簇/小石
    for (var i = 0; i < 26; i++) {
        var x = 640 + ((i * 113) % 640);
        var y = 606 + ((i * 47) % 100);
        var r = 1.2 + (i % 3) * 0.7;
        ctx.save();
        ctx.globalAlpha = 0.12 + (i % 4) * 0.025;
        ctx.fillStyle = i % 3 === 0 ? palette_1.PALETTE.sunbeam : palette_1.PALETTE.moss;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
/* -------------------------------------------------------------------- */
/* 小工具                                                               */
/* -------------------------------------------------------------------- */
function blobPoints(cx, cy, rx, ry, n, seed) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
        var a = (i / n) * Math.PI * 2;
        var k = 1 + ((0, brush_1.noiseAt)(i, seed) - 0.5) * 0.12;
        pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    return pts;
}
function drawLeaf(ctx, x, y, size, rot, color, seed) {
    var pts = [];
    for (var i = 0; i <= 12; i++) {
        var p = i / 12;
        var w = Math.sin(p * Math.PI) * size * 0.55;
        pts.push({ x: x + Math.cos(rot) * (p * size - size / 2) - Math.sin(rot) * w, y: y + Math.sin(rot) * (p * size - size / 2) + Math.cos(rot) * w });
    }
    for (var i = 12; i >= 0; i--) {
        var p = i / 12;
        var w = Math.sin(p * Math.PI) * size * 0.55;
        pts.push({ x: x + Math.cos(rot) * (p * size - size / 2) + Math.sin(rot) * w, y: y + Math.sin(rot) * (p * size - size / 2) - Math.cos(rot) * w });
    }
    (0, brush_1.fillWatercolor)(ctx, pts, color, { alpha: 0.9, layers: 1, seedIndex: seed });
    (0, brush_1.strokeInk)(ctx, pts, { width: 1.6, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.55), seedIndex: seed + 1 });
}
function drawSun(ctx, x, y, r, seed) {
    ctx.save();
    ctx.strokeStyle = palette_1.PALETTE.sunbeam;
    ctx.fillStyle = palette_1.PALETTE.sunbeam;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
        ctx.lineTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2);
        ctx.stroke();
    }
    ctx.restore();
}
function drawStar(ctx, x, y, r, seed) {
    ctx.save();
    ctx.fillStyle = palette_1.PALETTE.sunbeam;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        var rr = i % 2 === 0 ? r : r * 0.45;
        var px = x + Math.cos(a) * rr;
        var py = y + Math.sin(a) * rr;
        if (i === 0)
            ctx.moveTo(px, py);
        else
            ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
function drawPaw(ctx, x, y, r, seed) {
    ctx.save();
    ctx.fillStyle = palette_1.PALETTE.sunbeam;
    for (var i = 0; i < 4; i++) {
        var px = x - r * 0.7 + i * r * 0.47;
        var py = y - r * 0.55 + (i === 0 || i === 3 ? r * 0.15 : 0);
        ctx.beginPath();
        ctx.arc(px, py, r * 0.24, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y + r * 0.25);
    ctx.scale(1, 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
}
function iconInk(ctx, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}
function drawCardsIcon(ctx, x, y, s, color, seed) {
    iconInk(ctx, color);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.5;
    (0, brush_1.roundRectPath)(ctx, -s * 0.42, -s * 0.5, s * 0.66, s * 0.9, 3, 0, seed);
    ctx.stroke();
    ctx.globalAlpha = 1;
    (0, brush_1.roundRectPath)(ctx, -s * 0.3, -s * 0.56, s * 0.72, s * 0.96, 3, 0, seed + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, -s * 0.18);
    ctx.lineTo(s * 0.18, -s * 0.18);
    ctx.moveTo(-s * 0.12, 0);
    ctx.lineTo(s * 0.18, 0);
    ctx.stroke();
    ctx.restore();
}
function drawBookIcon(ctx, x, y, s, color, seed) {
    iconInk(ctx, color);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.42);
    ctx.quadraticCurveTo(-s * 0.5, -s * 0.55, -s * 0.62, -s * 0.28);
    ctx.lineTo(-s * 0.62, s * 0.36);
    ctx.quadraticCurveTo(-s * 0.46, s * 0.18, 0, s * 0.4);
    ctx.quadraticCurveTo(s * 0.46, s * 0.18, s * 0.62, s * 0.36);
    ctx.lineTo(s * 0.62, -s * 0.28);
    ctx.quadraticCurveTo(s * 0.5, -s * 0.55, 0, -s * 0.42);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.38);
    ctx.lineTo(0, s * 0.36);
    ctx.stroke();
    ctx.restore();
}
function drawBagIcon(ctx, x, y, s, color, seed) {
    iconInk(ctx, color);
    ctx.save();
    ctx.translate(x, y);
    (0, brush_1.roundRectPath)(ctx, -s * 0.46, -s * 0.22, s * 0.92, s * 0.74, 5, 0, seed);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -s * 0.22, s * 0.26, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
function drawMedalIcon(ctx, x, y, s, color, seed) {
    iconInk(ctx, color);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, s * 0.5);
    ctx.lineTo(-s * 0.1, s * 0.06);
    ctx.moveTo(s * 0.28, s * 0.5);
    ctx.lineTo(s * 0.1, s * 0.06);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -s * 0.18, s * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -s * 0.18, s * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
function drawSliders(ctx, x, y, s, color, seed) {
    iconInk(ctx, color);
    var rows = [0, 0.33, 0.66];
    for (var i = 0; i < 3; i++) {
        var yy = y + rows[i] * s;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + s, yy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + s * (0.3 + i * 0.22), yy, 3, 0, Math.PI * 2);
        ctx.fillStyle = palette_1.PALETTE.paper;
        ctx.fill();
        ctx.stroke();
    }
}
