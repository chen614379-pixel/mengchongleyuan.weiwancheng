"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampScene = void 0;
var palette_1 = require("../config/palette");
var layout_1 = require("../config/layout");
var forest_1 = require("../render/forest");
var assets_1 = require("../render/assets");
var ui_1 = require("../render/ui");
var coach_1 = require("../render/coach");
var unit_1 = require("../render/unit");
var brush_1 = require("../ui/brush");
var deck_1 = require("./deck");
var theme_1 = require("../ui/theme");
var storage_1 = require("../platform/storage");
var audio_1 = require("../platform/audio");
var screen_1 = require("../platform/screen");
var CampScene = /** @class */ (function () {
    function CampScene(opts) {
        this.name = 'camp';
        this.t = 0;
        /** 热区一律对齐美术底图 `assets/bg/bg-camp.jpg` 里画好的木牌招牌（1280×720 逻辑坐标）。 */
        this.spots = [
            { id: 'battle', x: 366, y: 292, w: 92, h: 50, label: '对战', relabel: false },
            { id: 'collection', x: 434, y: 412, w: 70, h: 56, label: '图鉴', relabel: false },
            { id: 'deck', x: 592, y: 402, w: 116, h: 60, label: '卡组', relabel: true },
            { id: 'rank', x: 914, y: 392, w: 100, h: 54, label: '段位', relabel: true },
            { id: 'shop', x: 1098, y: 368, w: 88, h: 56, label: '商店', relabel: false }
        ];
        this.hover = -1;
        this.pressFlash = 0;
        this.pressSpot = -1;
        /** 营地里闲逛的三只动物（用美术立绘） */
        this.wander = [
            { species: 'tiger', baseX: 250, baseY: 520, phase: 0.0, scale: 0.62 },
            { species: 'dog', baseX: 640, baseY: 560, phase: 1.7, scale: 0.55 },
            { species: 'elephant', baseX: 900, baseY: 545, phase: 3.1, scale: 0.6 }
        ];
        this.opts = opts;
    }
    CampScene.prototype.enter = function () {
        this.t = 0;
    };
    CampScene.prototype.tick = function (logicTime) {
        this.t = logicTime;
        if (this.pressFlash > 0)
            this.pressFlash -= 20;
    };
    CampScene.prototype.render = function (ctx, renderTime) {
        var w = layout_1.LAYOUT.SCREEN_W;
        var h = layout_1.LAYOUT.SCREEN_H;
        var camp = (0, assets_1.getImage)('bg-camp');
        if (camp) {
            this.renderArt(ctx, w, h, renderTime);
            return;
        }
        this.renderProceduralCamp(ctx, w, h, renderTime);
    };
    /**
     * 美术底图模式：底图里已经画好招牌、齿轮、动物与饲养员，
     * 所以这里只补「底图不可能画进去」的东西——真实货币 HUD、热区反馈。
     */
    CampScene.prototype.renderArt = function (ctx, w, h, renderTime) {
        var camp = (0, assets_1.getImage)('bg-camp');
        if (!camp)
            return;
        (0, screen_1.drawPlateCover)(ctx, camp, 0, 0, w, h);
        // 真实货币（盖住底图上烘死的 ☀12 / 🐾1280 / ⭐3）
        var save = (0, storage_1.loadSave)();
        (0, deck_1.drawCurrencyChips)(ctx, 22, renderTime, { coins: save.coins, stars: save.stars }, 410);
        // 悬停/按下：招牌背后点一层暖色水彩（底图招牌本身不多抹一笔）
        for (var i = 0; i < this.spots.length; i++) {
            if (this.hover === i || (this.pressFlash > 0 && this.pressSpot === i)) {
                this.drawHotspotGlow(ctx, this.spots[i], renderTime);
            }
        }
        // 美术图里没有的入口：用同风格木牌盖掉底图上学错的招牌字
        for (var i = 0; i < this.spots.length; i++) {
            if (this.spots[i].relabel)
                this.drawRelabel(ctx, this.spots[i]);
        }
    };
    /** 招牌反馈：柔和暖光水彩（呼吸），只描在招牌外圈，不糊住字。 */
    CampScene.prototype.drawHotspotGlow = function (ctx, s, t) {
        var cx = s.x + s.w / 2;
        var cy = s.y + s.h / 2;
        var rx = s.w * 0.74;
        var ry = s.h * 0.92;
        var seed = 640 + Math.round(s.x);
        var pts = [];
        for (var i = 0; i <= 20; i++) {
            var a = (i / 20) * Math.PI * 2;
            var k = 1 + (0, brush_1.noiseAt)(i, seed) * 0.09;
            pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
        }
        (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.sunbeam, {
            alpha: 0.30 + 0.07 * Math.sin(t / 220), layers: 2, wetEdge: true, seedIndex: seed
        });
    };
    /** 自绘木牌：盖掉底图上字不对的招牌。 */
    CampScene.prototype.drawRelabel = function (ctx, s) {
        (0, ui_1.drawWoodPanel)(ctx, s.x, s.y, s.w, s.h, { radius: 10, tone: 'bark', seedIndex: 500 + Math.round(s.x) });
        (0, theme_1.textOutlined)(ctx, s.label, s.x + s.w / 2, s.y + s.h / 2 + 10, layout_1.LAYOUT.FONT.h2, palette_1.PALETTE.inkSoft, 'center');
    };
    CampScene.prototype.gesture = function (e) {
        if (e.type === 'move') {
            this.hover = this.hitTest(e.x, e.y);
            return;
        }
        if (e.type !== 'up' || e.wasDrag)
            return;
        var idx = this.hitTest(e.x, e.y);
        if (idx < 0) {
            if (this.inGear(e.x, e.y)) {
                (0, audio_1.playSfx)('tap');
                this.opts.onOpenSettings();
            }
            return;
        }
        (0, audio_1.playSfx)('tap');
        this.pressFlash = 320;
        this.pressSpot = idx;
        var id = this.spots[idx].id;
        if (id === 'battle')
            this.opts.onStartMatch();
        else if (id === 'deck')
            this.opts.onOpenDeck();
        else if (id === 'collection')
            this.opts.onOpenCollection();
        else if (id === 'shop')
            this.opts.onOpenShop();
        else if (id === 'rank')
            this.opts.onOpenRank();
    };
    CampScene.prototype.inGear = function (x, y) {
        // 美术底图上画好的齿轮在 (22,18)–(98,96)，热区放宽一点更好点
        if ((0, assets_1.getImage)('bg-camp'))
            return x >= 8 && x <= 108 && y >= 2 && y <= 106;
        var g = layout_1.LAYOUT.GEAR;
        return x >= g.x - 10 && x <= g.x + g.size + 10 && y >= g.y - 10 && y <= g.y + g.size + 10;
    };
    CampScene.prototype.hitTest = function (x, y) {
        for (var i = this.spots.length - 1; i >= 0; i--) {
            var s = this.spots[i];
            if (x >= s.x - 14 && x <= s.x + s.w + 14 && y >= s.y - 14 && y <= s.y + s.h + 14)
                return i;
        }
        return -1;
    };
    CampScene.prototype.drawPlate = function (ctx, s, active, t) {
        var grow = active ? 1.06 : 1.0;
        var w = s.w * grow;
        var h = s.h * grow;
        var x = s.x - (w - s.w) / 2;
        var y = s.y - (h - s.h) / 2;
        var pts = [];
        for (var i = 0; i <= 16; i++) {
            var a = (i / 16) * Math.PI * 2;
            pts.push({ x: x + w / 2 + Math.cos(a) * (w / 2), y: y + h / 2 + Math.sin(a) * (h / 2) });
        }
        (0, brush_1.fillWatercolor)(ctx, pts, active ? palette_1.PALETTE.sunbeam : palette_1.PALETTE.soil, { alpha: active ? 0.5 : 0.28, layers: 2, seedIndex: 40 + s.x });
        (0, brush_1.strokeInk)(ctx, pts, { width: 3, close: true, seedIndex: 41 + s.x });
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.h2, 700);
        ctx.fillStyle = palette_1.PALETTE.creamMist;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, x + w / 2, y + h / 2 + 1);
        ctx.textBaseline = 'alphabetic';
    };
    CampScene.prototype.renderProceduralCamp = function (ctx, w, h, t) {
        // 自适应全屏：天空与远景森林铺满逻辑可视区，营地陈设仍按 1280×720 居中
        var box = (0, screen_1.sceneBox)();
        var ox = (box.w - w) / 2;
        var oy = (box.h - h) / 2;
        ctx.save();
        ctx.translate(box.x - ox, box.y - oy);
        (0, forest_1.drawSky)(ctx, box.w, box.h, t);
        (0, forest_1.drawForestLayer)(ctx, box.w, box.h, 0, 'far', t);
        ctx.translate(ox, oy);
        // 树屋（对战入口）
        this.drawTreeHouse(ctx, 300, 400, t);
        (0, forest_1.drawForestLayer)(ctx, w, h, 0, 'mid', t);
        // 篝火
        this.drawCampfire(ctx, 560, 610, t);
        // 小溪
        this.drawStream(ctx, 950, 720, t);
        (0, forest_1.drawForestLayer)(ctx, w, h, 0, 'near', t);
        (0, forest_1.drawSunSpecks)(ctx, w, h, t, 1.0);
        // 营地里的动物（轻微呼吸 + 左右踱步）
        for (var i = 0; i < this.wander.length; i++) {
            var wd = this.wander[i];
            var bob = Math.sin(t / 900 + wd.phase) * 5;
            var dx = Math.sin(t / 5200 + wd.phase) * 22;
            (0, unit_1.drawUnit)(ctx, {
                id: -1 - i, species: wd.species, level: 1, hp: 100, maxHp: 100, shield: 0, alive: true,
                fx: { hitFlash: 0, attackPulse: 0, deathFirefly: 0, counterHit: 0, shieldRipple: 0 }
            }, {
                x: wd.baseX + dx, y: wd.baseY + bob, scale: wd.scale, time: t,
                showRing: false, selected: false, dim: false, facing: dx > 0 ? 1 : -1
            });
        }
        // 饲养员站在篝火旁
        (0, coach_1.drawCoach)(ctx, 470, 560, this.pressFlash > 0 ? 'proud' : 'idle', t);
        // 招牌热区
        for (var i = 0; i < this.spots.length; i++) {
            var s = this.spots[i];
            var active = this.hover === i || (this.pressFlash > 0 && this.pressSpot === i);
            this.drawPlate(ctx, s, active, t);
        }
        // 标题木牌
        (0, ui_1.drawWoodPanel)(ctx, w / 2 - 220, 28, 440, 84, { radius: layout_1.LAYOUT.PANEL_RADIUS, tone: 'bark' });
        (0, theme_1.textOutlined)(ctx, '萌宠乱斗', w / 2, 82, layout_1.LAYOUT.FONT.h1 * 1.15, palette_1.PALETTE.creamMist, 'center');
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.badge, 500);
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.9);
        ctx.textAlign = 'center';
        ctx.fillText('林间营地', w / 2, 122);
        ctx.textAlign = 'start';
        // 真实货币 + 齿轮设置 + 暗角
        var save = (0, storage_1.loadSave)();
        (0, deck_1.drawCurrencyChips)(ctx, 22, t, { coins: save.coins, stars: save.stars }, 410);
        (0, ui_1.drawGear)(ctx, layout_1.LAYOUT.GEAR.x, layout_1.LAYOUT.GEAR.y, layout_1.LAYOUT.GEAR.size, this.pressSpot === 99);
        ctx.translate(-ox, -oy);
        (0, forest_1.drawVignette)(ctx, box.w, box.h);
        ctx.restore();
    };
    CampScene.prototype.drawTreeHouse = function (ctx, x, y, t) {
        // 树干
        (0, brush_1.strokeInk)(ctx, [{ x: x, y: y }, { x: x + 10, y: y - 160 }, { x: x + 40, y: y - 300 }], { width: 3, seedIndex: 60 });
        (0, brush_1.fillWatercolor)(ctx, [
            { x: x - 34, y: y + 40 }, { x: x + 74, y: y + 40 }, { x: x + 54, y: y - 300 }, { x: x - 14, y: y - 300 }
        ], palette_1.PALETTE.bark, { alpha: 0.95, layers: 2, seedIndex: 61 });
        // 屋身
        var hx = x - 10;
        var hy = y - 400;
        (0, brush_1.roundRectPath)(ctx, hx, hy, 150, 110, 14, 1.0, 62);
        (0, brush_1.fillWatercolor)(ctx, [
            { x: hx, y: hy }, { x: hx + 150, y: hy }, { x: hx + 150, y: hy + 110 }, { x: hx, y: hy + 110 }
        ], palette_1.PALETTE.barkLight, { alpha: 0.96, layers: 2, seedIndex: 63 });
        (0, brush_1.strokeInk)(ctx, [
            { x: hx, y: hy }, { x: hx + 150, y: hy }, { x: hx + 150, y: hy + 110 }, { x: hx, y: hy + 110 }
        ], { width: 3, close: true, seedIndex: 64 });
        // 屋顶
        (0, brush_1.fillWatercolor)(ctx, [
            { x: hx - 26, y: hy }, { x: hx + 75, y: hy - 62 }, { x: hx + 176, y: hy }
        ], palette_1.PALETTE.berry, { alpha: 0.82, layers: 2, seedIndex: 65 });
        (0, brush_1.strokeInk)(ctx, [
            { x: hx - 26, y: hy }, { x: hx + 75, y: hy - 62 }, { x: hx + 176, y: hy }, { x: hx - 26, y: hy }
        ], { width: 3, close: true, seedIndex: 66 });
        // 窗（暖光呼吸）
        var glow = 0.55 + 0.12 * Math.sin(t / 700);
        (0, brush_1.fillWatercolor)(ctx, [
            { x: hx + 22, y: hy + 34 }, { x: hx + 62, y: hy + 34 }, { x: hx + 62, y: hy + 74 }, { x: hx + 22, y: hy + 74 }
        ], palette_1.PALETTE.sunbeam, { alpha: glow, layers: 2, seedIndex: 67 });
        (0, brush_1.strokeInk)(ctx, [
            { x: hx + 22, y: hy + 34 }, { x: hx + 62, y: hy + 34 }, { x: hx + 62, y: hy + 74 }, { x: hx + 22, y: hy + 74 }
        ], { width: 2.6, close: true, seedIndex: 68 });
        // 梯子
        for (var i = 0; i < 6; i++) {
            var ly = y - 280 + i * 26;
            (0, brush_1.strokeInk)(ctx, [{ x: x + 40, y: ly }, { x: x + 96, y: ly }], { width: 2.6, seedIndex: 70 + i });
        }
        (0, brush_1.strokeInk)(ctx, [{ x: x + 40, y: y - 280 }, { x: x + 46, y: y - 60 }], { width: 2.8, seedIndex: 80 });
        (0, brush_1.strokeInk)(ctx, [{ x: x + 96, y: y - 280 }, { x: x + 92, y: y - 60 }], { width: 2.8, seedIndex: 81 });
    };
    CampScene.prototype.drawCampfire = function (ctx, x, y, t) {
        // 石圈
        for (var i = 0; i < 7; i++) {
            var a = (i / 7) * Math.PI * 2;
            var px = x + Math.cos(a) * 52;
            var py = y + Math.sin(a) * 16;
            var r = 11 + (i % 3);
            var pts = [];
            for (var k = 0; k <= 10; k++) {
                var b = (k / 10) * Math.PI * 2;
                pts.push({ x: px + Math.cos(b) * r, y: py + Math.sin(b) * r * 0.8 });
            }
            (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.soil, { alpha: 0.9, layers: 1, seedIndex: 90 + i });
            (0, brush_1.strokeInk)(ctx, pts, { width: 2.4, close: true, seedIndex: 91 + i });
        }
        // 柴火
        (0, brush_1.strokeInk)(ctx, [{ x: x - 30, y: y }, { x: x + 30, y: y - 16 }], { width: 4, seedIndex: 100 });
        (0, brush_1.strokeInk)(ctx, [{ x: x - 26, y: y - 14 }, { x: x + 26, y: y + 2 }], { width: 4, seedIndex: 101 });
        // 火焰（三层水彩）
        var flick = 1 + 0.12 * Math.sin(t / 120) + 0.06 * Math.sin(t / 47);
        var flame = function (scale, color, alpha, seed) {
            var fh = 58 * scale * flick;
            var pts = [];
            pts.push({ x: x - 22 * scale, y: y - 16 });
            pts.push({ x: x - 12 * scale, y: y - 16 - fh * 0.55 });
            pts.push({ x: x - 2 * scale, y: y - 16 - fh });
            pts.push({ x: x + 10 * scale, y: y - 16 - fh * 0.5 });
            pts.push({ x: x + 20 * scale, y: y - 16 });
            (0, brush_1.fillWatercolor)(ctx, pts, color, { alpha: alpha, layers: 2, wetEdge: true, seedIndex: seed });
        };
        flame(1.15, palette_1.PALETTE.sunset, 0.5, 110);
        flame(0.85, palette_1.PALETTE.sunbeam, 0.7, 111);
        flame(0.5, palette_1.PALETTE.creamMist, 0.75, 112);
    };
    CampScene.prototype.drawStream = function (ctx, x, y, t) {
        var pts = [];
        for (var i = 0; i <= 12; i++) {
            var p = i / 12;
            pts.push({ x: x + Math.sin(p * 3) * 40 - 60, y: y - p * 420 });
        }
        for (var i = 12; i >= 0; i--) {
            var p = i / 12;
            pts.push({ x: x + Math.sin(p * 3) * 40 + 60, y: y - p * 420 });
        }
        (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.stream, { alpha: 0.55, layers: 2, wetEdge: true, seedIndex: 120 });
        // 水波
        for (var i = 0; i < 5; i++) {
            var p = ((t / 2200 + i * 0.2) % 1);
            var wy = y - p * 400;
            var wx = x + Math.sin(p * 3) * 40 + Math.sin(t / 600 + i) * 6;
            (0, brush_1.strokeInk)(ctx, [{ x: wx - 22, y: wy }, { x: wx + 22, y: wy }], { width: 2, jitter: 1.0, seedIndex: 130 + i });
        }
    };
    return CampScene;
}());
exports.CampScene = CampScene;
