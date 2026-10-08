"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionScene = void 0;
exports.createCollectionScene = createCollectionScene;
/**
 * 图鉴与段位页（§13.4）—— 横屏 1280×720，手绘水彩森林风。
 *
 * 两个页签：
 *  - 「宠物图鉴」：8 物种 × 3 等级 = 24 格；未遇见的用灰剪影 + 迷雾，已遇见的展示
 *    统一尺寸的圆形木框立绘（立绘按框重绘、不做拉伸），并给出特技、性格与克制提示。
 *    全空时优雅降级为一张手绘空状态（篝火 + 「去冒险遇见它们」）。
 *  - 「段位」：青铜 → 白银 → 黄金 → 钻石 的手绘阶梯 + 战绩统计（读 save.rank / save.stats）。
 *
 * 数值与配色全部来自 `config/*` 与 `platform/storage`；通用手绘件复用同目录 deck.ts。
 */
var manager_1 = require("./manager");
var palette_1 = require("../config/palette");
var species_1 = require("../config/species");
var storage_1 = require("../platform/storage");
var audio_1 = require("../platform/audio");
var brush_1 = require("../ui/brush");
var theme_1 = require("../ui/theme");
var ease_1 = require("../ui/ease");
var paint_1 = require("../render/paint");
var assets_1 = require("../render/assets");
var deck_1 = require("./deck");
/* ---------------------------------------------------------------- 布局常量 */
var BACK_X = 26;
var BACK_Y = 24;
var BACK_SIZE = 60;
var TAB_Y = 30;
var TAB_W = 150;
var TAB_H = 54;
var TAB_X = 96;
var TAB_GAP = 10;
/** 图鉴网格：4 列 × 2 行 */
var GRID_X = 56;
var GRID_Y = 190;
var CARD_W = 268;
var CARD_H = 212;
var GRID_GAP_X = 18;
var GRID_GAP_Y = 16;
/** 段位阶梯的晋升步长（仅用于「晋升进度」这条展示条，不参与任何数值结算）。 */
var TIER_STEP = 100;
var TIER_NAMES = ['青铜', '白银', '黄金', '钻石'];
var TIER_NOTE = ['初始段位 · 小恶魔皮肤未解锁', 'AI 难度 +1 · 解锁铜角皮肤',
    'AI 难度 +2 · 解锁银翼皮肤', 'AI 难度 +3 · 解锁金焰皮肤'];
var TIER_THEME = [palette_1.PALETTE.soil, palette_1.PALETTE.skyWarm, palette_1.PALETTE.sunbeam, palette_1.PALETTE.sunset];
var CollectionScene = /** @class */ (function () {
    function CollectionScene(opts) {
        this.name = 'collection';
        this.t = 0;
        this.t0 = -1;
        this.enterMs = 0;
        this.sel = 0;
        this.press = '';
        this.pressMs = 0;
        this.toastText = '';
        this.toastMs = 0;
        this.scrollY = 0;
        var o = opts || {};
        this.tab = o.tab === 'rank' ? 'rank' : 'pets';
    }
    CollectionScene.prototype.enter = function () {
        this.t0 = -1;
        this.enterMs = 0;
        this.press = '';
        this.toastMs = 0;
    };
    CollectionScene.prototype.tick = function (logicTime) {
        this.t = logicTime;
        if (this.t0 < 0)
            this.t0 = logicTime;
        this.enterMs = logicTime - this.t0;
        if (this.pressMs > 0)
            this.pressMs -= 50;
        if (this.toastMs > 0)
            this.toastMs -= 50;
    };
    CollectionScene.prototype.render = function (ctx, renderTime) {
        var t = renderTime;
        var save = (0, storage_1.loadSave)();
        var p = (0, ease_1.clamp01)(this.enterMs / 260);
        var s = 0.95 + 0.05 * (0, ease_1.easeOutCubic)(p);
        var cx = deck_1.SCREEN.W / 2;
        var cy = deck_1.SCREEN.H / 2;
        (0, deck_1.drawScreenBase)(ctx, t, 2100);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
        (0, deck_1.drawBackButton)(ctx, BACK_X, BACK_Y, BACK_SIZE, this.press === 'back', 2120);
        this.drawTabs(ctx, t);
        (0, deck_1.drawTitlePlate)(ctx, 660, 20, 320, 72, this.tab === 'rank' ? '段位' : '萌宠图鉴', 2140);
        (0, deck_1.drawCurrencyChips)(ctx, 34, t, save, 2160);
        if (this.tab === 'pets')
            this.drawPetsTab(ctx, t, save);
        else
            this.drawRankTab(ctx, t, save);
        ctx.restore();
        (0, deck_1.drawRevealVeil)(ctx, p, 2400);
        if (this.toastMs > 0)
            (0, deck_1.drawToast)(ctx, this.toastText, (0, ease_1.clamp01)(this.toastMs / 300), 2420);
    };
    /** 顶部两个页签（木质木牌，选中态有 sunbeam 光晕）。 */
    CollectionScene.prototype.drawTabs = function (ctx, t) {
        var labels = ['宠物图鉴', '段位'];
        for (var i = 0; i < 2; i++) {
            var x = TAB_X + i * (TAB_W + TAB_GAP);
            var active = (i === 0 && this.tab === 'pets') || (i === 1 && this.tab === 'rank');
            var pressed = this.press === 'tab' + i;
            (0, deck_1.drawWoodPlate)(ctx, x, TAB_Y + (pressed ? 2 : 0), TAB_W, TAB_H, {
                radius: 16, base: active ? palette_1.PALETTE.barkLight : palette_1.PALETTE.soil,
                active: active,
                seedIndex: 2200 + i * 9,
            });
            // 页签底是 barkLight / soil，两者都是浅木色，字必须用深色
            (0, theme_1.textOutlined)(ctx, labels[i], x + TAB_W / 2, TAB_Y + TAB_H / 2 + 1, theme_1.FONT.entry, palette_1.PALETTE.inkSoft, 'center', 2);
        }
    };
    /* ============================================================ 页签一：图鉴 */
    CollectionScene.prototype.discoveredCount = function () {
        var save = (0, storage_1.loadSave)();
        var n = 0;
        for (var i = 0; i < species_1.SPECIES_ORDER.length; i++) {
            if (this.isDiscovered(species_1.SPECIES_ORDER[i]))
                n++;
        }
        return n;
    };
    CollectionScene.prototype.isDiscovered = function (sp) {
        var save = (0, storage_1.loadSave)();
        if (save.collection.indexOf(sp + '1') >= 0)
            return true;
        if (save.collection.indexOf(sp) >= 0)
            return true;
        for (var i = 0; i < save.pets.length; i++) {
            if (save.pets[i] && save.pets[i].species === sp)
                return true;
        }
        return false;
    };
    /** 已解锁到第几级（0 表示未遇见）。 */
    CollectionScene.prototype.levelOf = function (sp) {
        var save = (0, storage_1.loadSave)();
        var lv = 0;
        for (var i = 1; i <= 3; i++)
            if (save.collection.indexOf(sp + i) >= 0)
                lv = i;
        if (lv === 0 && this.isDiscovered(sp))
            lv = 1;
        return lv;
    };
    CollectionScene.prototype.drawPetsTab = function (ctx, t, save) {
        var found = this.discoveredCount();
        var gridSeen = save.collection.length;
        var cardsSeen = save.cardsSeen.length;
        // 顶部进度带
        (0, deck_1.drawWoodPlate)(ctx, 56, 104, 760, 64, { radius: 18, base: palette_1.PALETTE.paper, seedIndex: 2500 });
        (0, theme_1.textPlain)(ctx, '图鉴收录 · 物种 × 等级 24 格', 76, 128, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.92), 'left', 'bold');
        (0, deck_1.drawVineProgress)(ctx, 76, 134, 300, 20, gridSeen / 24, gridSeen + '/24', 2504);
        (0, theme_1.textPlain)(ctx, '萌宠', 76, 162, theme_1.FONT.badge - 3, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8), 'left', 'normal');
        (0, deck_1.drawVineProgress)(ctx, 420, 134, 300, 20, cardsSeen > 0 ? Math.min(1, cardsSeen / 12) : 0, cardsSeen + ' 张', 2510);
        (0, theme_1.textPlain)(ctx, '卡牌图鉴', 420, 162, theme_1.FONT.badge - 3, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8), 'left', 'normal');
        // 星辉奖励说明
        (0, deck_1.drawWoodPlate)(ctx, 846, 104, 392, 64, { radius: 18, base: palette_1.PALETTE.barkLight, seedIndex: 2520 });
        (0, paint_1.drawSparkle)(ctx, 880, 136, 12, palette_1.PALETTE.sunbeam, 0.9);
        (0, theme_1.textOutlined)(ctx, '首次收录 +2 星辉', 902, 130, theme_1.FONT.badge, palette_1.PALETTE.inkSoft, 'left', 1.8);
        (0, theme_1.textPlain)(ctx, '已遇见 ' + found + ' / 8 物种', 902, 154, theme_1.FONT.badge - 3, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.88), 'left', 'normal');
        if (found === 0 && cardsSeen === 0) {
            // 一只未遇见时也照常铺满 8 格（灰剪影 + ？？？），不再整页替换成空状态
            this.drawHintStrip(ctx, t);
        }
        // 8 格网格
        for (var i = 0; i < species_1.SPECIES_ORDER.length; i++) {
            var col = i % 4;
            var row = Math.floor(i / 4);
            var x = GRID_X + col * (CARD_W + GRID_GAP_X);
            var y = GRID_Y + row * (CARD_H + GRID_GAP_Y);
            this.drawPetEntry(ctx, x, y, species_1.SPECIES_ORDER[i], i, t);
        }
        // 底部详情条
        this.drawPetDetail(ctx, t);
    };
    /** 一张图鉴卡：圆形木框立绘 + 名字 + 特技 + 等级点。 */
    CollectionScene.prototype.drawPetEntry = function (ctx, x, y, sp, idx, t) {
        var def = species_1.SPECIES[sp];
        var locked = !this.isDiscovered(sp);
        var selected = this.sel === idx;
        var pressed = this.press === 'card' + idx;
        var dy = pressed ? 3 : 0;
        (0, deck_1.drawWoodPlate)(ctx, x, y + dy, CARD_W, CARD_H, {
            radius: 20, base: palette_1.PALETTE.paper, active: selected, seedIndex: 2600 + idx * 11,
        });
        (0, brush_1.paperGrain)(ctx, x + 8, y + 8 + dy, CARD_W - 16, CARD_H - 16, 0.035, 2602 + idx * 11);
        // 圆形木框 + 立绘（统一尺寸重绘，不做拉伸）
        var pcx = x + 74;
        var pcy = y + 84 + dy;
        var pr = 54;
        var ring = (0, brush_1.arcPoints)(pcx, pcy, pr, 0, Math.PI * 2, 26);
        (0, deck_1.fillPanel)(ctx, ring, (0, palette_1.tint)(locked ? palette_1.PALETTE.inkSoft : def.theme, 0.78, palette_1.PALETTE.creamMist), {
            alpha: 0.7, layers: 2, wetEdge: true, seedIndex: 2604 + idx * 11,
        });
        (0, brush_1.strokeInk)(ctx, ring, { width: 3, close: true, seedIndex: 2606 + idx * 11 });
        var ring2 = (0, brush_1.arcPoints)(pcx, pcy, pr - 6, 0, Math.PI * 2, 24);
        (0, brush_1.strokeInk)(ctx, ring2, { width: 1.6, jitter: 1.2, seedIndex: 2608 + idx * 11 });
        var petImg = locked ? undefined : (0, assets_1.getImage)('unit-' + sp);
        if (petImg) {
            // 圆框内裁切贴美术抠图（100% 还原用户原画）
            ctx.save();
            var clipRing = (0, brush_1.arcPoints)(pcx, pcy, pr - 4, 0, Math.PI * 2, 30);
            (0, brush_1.tracePath)(ctx, clipRing, true);
            ctx.clip();
            var ph = 108;
            ctx.drawImage(petImg, pcx - ph / 2, pcy + 4 - ph / 2, ph, ph);
            ctx.restore();
        }
        else {
            (0, deck_1.drawCreature)(ctx, sp, pcx, pcy + 8, 88, t, { silhouette: locked });
        }
        // 文本区
        var tx = x + 142;
        var name = locked ? '？？？' : def.cn;
        (0, theme_1.textOutlined)(ctx, name, tx, y + 52 + dy, theme_1.FONT.h2, palette_1.PALETTE.forestDeep, 'left', 2.2);
        if (locked) {
            (0, theme_1.textPlain)(ctx, '尚未遇见', tx, y + 84 + dy, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.75), 'left', 'normal');
            (0, theme_1.textPlain)(ctx, '去战斗里遇见它', tx, y + 112 + dy, theme_1.FONT.badge - 3, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.6), 'left', 'normal');
            (0, deck_1.drawLock)(ctx, x + CARD_W - 30, y + 34 + dy, 13, 2610 + idx * 11);
        }
        else {
            (0, theme_1.textOutlined)(ctx, '特技 · ' + def.traitName, tx, y + 84 + dy, theme_1.FONT.body - 2, palette_1.PALETTE.leafMid, 'left', 1.8);
            (0, theme_1.wrapText)(ctx, def.traitDesc, tx, y + 112 + dy, CARD_W - 160, theme_1.FONT.badge - 2, 22, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.88), 'left', 2);
            // 等级点（species × level）
            var lv = this.levelOf(sp);
            (0, theme_1.textPlain)(ctx, '等级', tx, y + 168 + dy, theme_1.FONT.badge - 3, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.8), 'left', 'normal');
            for (var i = 0; i < 3; i++) {
                var dotX = tx + 52 + i * 26;
                var dot = (0, brush_1.arcPoints)(dotX, y + 163 + dy, 8, 0, Math.PI * 2, 12);
                (0, deck_1.fillPanel)(ctx, dot, i < lv ? palette_1.PALETTE.sunbeam : (0, palette_1.tint)(palette_1.PALETTE.inkSoft, 0.7, palette_1.PALETTE.paper), {
                    alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 2620 + idx * 11 + i,
                });
                (0, brush_1.strokeInk)(ctx, dot, { width: 2, close: true, seedIndex: 2624 + idx * 11 + i });
                if (i < lv)
                    (0, theme_1.textPlain)(ctx, '' + (i + 1), dotX, y + 164 + dy, 11, palette_1.PALETTE.inkSoft, 'center', 'bold');
            }
        }
        if (selected) {
            var outline = (0, deck_1.roundPts)(x - 4, y - 4 + dy, CARD_W + 8, CARD_H + 8, 23);
            (0, brush_1.strokeInk)(ctx, outline, { width: 3, color: palette_1.PALETTE.sunbeam, jitter: 1.6, seedIndex: 2630 + idx * 11 });
        }
    };
    /** 底部：选中动物的详情（克制闭环 + 性格 + 收集奖励）。 */
    CollectionScene.prototype.drawPetDetail = function (ctx, t) {
        var sp = species_1.SPECIES_ORDER[this.sel];
        var def = species_1.SPECIES[sp];
        var locked = !this.isDiscovered(sp);
        var y = 648;
        (0, deck_1.drawWoodPlate)(ctx, 56, y, 1168, 58, { radius: 20, base: palette_1.PALETTE.barkLight, seedIndex: 2700 });
        if (locked) {
            (0, theme_1.textOutlined)(ctx, '这一格还是空的 —— 在对战里遇见它，图鉴就会亮起来。', 640, y + 31, theme_1.FONT.entry, palette_1.PALETTE.inkSoft, 'center', 2.2);
            return;
        }
        var barPet = (0, assets_1.getImage)('unit-' + sp);
        if (barPet)
            ctx.drawImage(barPet, 100 - 20, y + 32 - 20, 40, 40);
        else
            (0, deck_1.drawCreature)(ctx, sp, 100, y + 32, 46, t);
        (0, theme_1.textOutlined)(ctx, def.cn + ' · 性格', 138, y + 24, theme_1.FONT.body - 2, palette_1.PALETTE.inkSoft, 'left', 2);
        (0, theme_1.textPlain)(ctx, this.personaOf(sp), 138, y + 46, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9), 'left', 'normal');
        var beats = species_1.SPECIES[species_1.COUNTER[sp]];
        var loses = species_1.SPECIES[(0, species_1.counteredBy)(sp)];
        (0, theme_1.textPlain)(ctx, '克制', 640, y + 22, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9), 'center', 'normal');
        var beatsBar = (0, assets_1.getImage)('unit-' + beats.id);
        if (beatsBar)
            ctx.drawImage(beatsBar, 700 - 18, y + 32 - 18, 36, 36);
        else
            (0, deck_1.drawCreature)(ctx, beats.id, 700, y + 32, 40, t);
        (0, theme_1.textOutlined)(ctx, beats.cn, 730, y + 34, theme_1.FONT.body - 2, palette_1.PALETTE.inkSoft, 'left', 2);
        (0, theme_1.textPlain)(ctx, '被克制', 900, y + 22, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9), 'center', 'normal');
        var losesBar = (0, assets_1.getImage)('unit-' + loses.id);
        if (losesBar)
            ctx.drawImage(losesBar, 960 - 18, y + 32 - 18, 36, 36);
        else
            (0, deck_1.drawCreature)(ctx, loses.id, 960, y + 32, 40, t);
        (0, theme_1.textOutlined)(ctx, loses.cn, 990, y + 34, theme_1.FONT.body - 2, palette_1.PALETTE.inkSoft, 'left', 2);
        (0, theme_1.textPlain)(ctx, '伤害 ×1.5 / ×0.75', 1160, y + 33, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9), 'right', 'normal');
    };
    /** 一句性格文案（纯展示用，按物种给固定句子，不参与任何结算）。 */
    CollectionScene.prototype.personaOf = function (sp) {
        if (sp === 'elephant')
            return '温柔的大力士，走一步地面都会轻轻发抖';
        if (sp === 'lion')
            return '森林的骄傲，一开口连风都停下来听';
        if (sp === 'tiger')
            return '急性子的小探险家，尾巴比脑子先动';
        if (sp === 'leopard')
            return '悄无声息，等你发现时已经绕到背后';
        if (sp === 'wolf')
            return '安静的守望者，认得每一条回家的路';
        if (sp === 'dog')
            return '永远第一个冲出去，也第一个摇尾巴';
        if (sp === 'cat')
            return '趴在树影里打盹，爪子却一直醒着';
        return '小小的身影，藏着最机灵的一击';
    };
    /** 一只都没遇见时的顶部一行提示（网格照常铺满 8 格灰剪影）。 */
    CollectionScene.prototype.drawHintStrip = function (ctx, t) {
        var fx = 640;
        var fy = 182;
        var flick = Math.sin(t / 260) * 3;
        var flame = [
            { x: fx - 118, y: fy + 4 },
            { x: fx - 108, y: fy - 12 + flick },
            { x: fx - 99, y: fy + 4 },
        ];
        (0, deck_1.fillPanel)(ctx, flame, palette_1.PALETTE.sunset, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: 2820 });
        (0, brush_1.strokeInk)(ctx, flame, { width: 2, close: true, seedIndex: 2821 });
        (0, theme_1.textPlain)(ctx, '还没有遇见任何萌宠 —— 图鉴会在对战里慢慢亮起来', fx + 12, fy, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9), 'center', 'bold');
    };
    /* ============================================================ 页签二：段位 */
    CollectionScene.prototype.drawRankTab = function (ctx, t, save) {
        var tier = Math.max(0, Math.min(3, save.rank.tier));
        var point = save.rank.point;
        // 段位阶梯：4 块木牌，当前段位亮起
        for (var i = 0; i < 4; i++) {
            var x = 56 + i * 300;
            var y = 132;
            var w = 284;
            var h = 250;
            var cur = i === tier;
            (0, deck_1.drawWoodPlate)(ctx, x, y + (i % 2 === 0 ? 0 : 14), w, h, {
                radius: 24, base: cur ? palette_1.PALETTE.barkLight : palette_1.PALETTE.paper, active: cur, seedIndex: 2900 + i * 13,
            });
            var by = y + (i % 2 === 0 ? 0 : 14);
            // 段位纹章：叶片徽记 + 颜色随段位变化
            var emblemX = x + w / 2;
            var emblemY = by + 92;
            this.drawEmblem(ctx, emblemX, emblemY, 54, i, cur, t, 2910 + i * 13);
            (0, theme_1.textOutlined)(ctx, TIER_NAMES[i], emblemX, by + 176, theme_1.FONT.h2, cur ? palette_1.PALETTE.forestDeep : (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.62), 'center', 2.2);
            (0, theme_1.wrapText)(ctx, TIER_NOTE[i], emblemX, by + 204, w - 44, theme_1.FONT.badge - 2, 22, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, cur ? 0.9 : 0.62), 'center', 2);
            if (cur) {
                var ribbon = (0, deck_1.roundPts)(emblemX - 52, by + 16, 104, 34, 15);
                (0, deck_1.fillPanel)(ctx, ribbon, palette_1.PALETTE.sunbeam, { alpha: 0.96, layers: 2, wetEdge: false, seedIndex: 2930 + i });
                (0, brush_1.strokeInk)(ctx, ribbon, { width: 2.2, close: true, seedIndex: 2931 + i });
                (0, theme_1.textPlain)(ctx, '当前', emblemX, by + 34, theme_1.FONT.badge, palette_1.PALETTE.inkSoft, 'center', 'bold');
                for (var k = 0; k < 4; k++) {
                    var a = (k / 4) * Math.PI * 2 + t / 1600;
                    (0, paint_1.drawSparkle)(ctx, emblemX + Math.cos(a) * 82, emblemY + Math.sin(a) * 62, 6, palette_1.PALETTE.sunbeam, 0.5);
                }
            }
            else if (i < tier) {
                // 已通过的段位：一枚小叶片勾
                (0, deck_1.drawPanelLeaf)(ctx, x + w - 34, by + 34, 30, Math.PI * 0.25, palette_1.PALETTE.leafMid, 2940 + i, false);
            }
            else {
                (0, deck_1.drawLock)(ctx, x + w - 32, by + 36, 13, 2944 + i);
            }
        }
        // 战绩木牌
        var sy = 452;
        (0, deck_1.drawWoodPlate)(ctx, 56, sy, 700, 212, { radius: 24, base: palette_1.PALETTE.paper, seedIndex: 2960 });
        (0, theme_1.textOutlined)(ctx, '战绩', 92, sy + 46, theme_1.FONT.h2, palette_1.PALETTE.forestDeep, 'left', 2.2);
        var win = save.stats.win;
        var lose = save.stats.lose;
        var draw = save.stats.draw;
        var total = win + lose + draw;
        var rate = total > 0 ? Math.round((win / total) * 100) : 0;
        var cells = [
            { label: '胜', value: '' + win, color: palette_1.PALETTE.leafMid },
            { label: '负', value: '' + lose, color: palette_1.PALETTE.berry },
            { label: '平', value: '' + draw, color: palette_1.PALETTE.soil },
            { label: '最高回合', value: '' + save.stats.bestRound, color: palette_1.PALETTE.stream }
        ];
        for (var i = 0; i < 4; i++) {
            var bx = 92 + i * 164;
            var by2 = sy + 70;
            var plate = (0, deck_1.roundPts)(bx, by2, 148, 76, 18);
            (0, deck_1.fillPanel)(ctx, plate, (0, palette_1.tint)(cells[i].color, 0.8, palette_1.PALETTE.creamMist), {
                alpha: 0.85, layers: 1, wetEdge: false, seedIndex: 2970 + i,
            });
            (0, brush_1.strokeInk)(ctx, plate, { width: 2.2, close: true, seedIndex: 2974 + i });
            (0, theme_1.textPlain)(ctx, cells[i].value, bx + 74, by2 + 32, theme_1.FONT.h2, palette_1.PALETTE.forestDeep, 'center', 'bold');
            (0, theme_1.textPlain)(ctx, cells[i].label, bx + 74, by2 + 58, theme_1.FONT.badge - 2, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.82), 'center', 'normal');
        }
        (0, theme_1.textPlain)(ctx, '胜率 ' + rate + '%（共 ' + total + ' 局）', 92, sy + 178, theme_1.FONT.body - 2, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9), 'left', 'bold');
        if (total === 0) {
            (0, theme_1.textPlain)(ctx, '还没有战绩，去营地左侧的树屋开一局。', 92, sy + 202, theme_1.FONT.badge - 2, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.7), 'left', 'normal');
        }
        // 晋升进度木牌
        (0, deck_1.drawWoodPlate)(ctx, 784, sy, 440, 212, { radius: 24, base: palette_1.PALETTE.barkLight, seedIndex: 2990 });
        (0, theme_1.textOutlined)(ctx, '晋升进度', 820, sy + 46, theme_1.FONT.h2, palette_1.PALETTE.inkSoft, 'left', 2.2);
        (0, theme_1.textPlain)(ctx, TIER_NAMES[tier] + ' → ' + TIER_NAMES[Math.min(3, tier + 1)], 820, sy + 82, theme_1.FONT.body - 2, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.95), 'left', 'normal');
        var ratio = tier >= 3 ? 1 : (0, ease_1.clamp01)((point % TIER_STEP) / TIER_STEP);
        (0, deck_1.drawVineProgress)(ctx, 820, sy + 106, 372, 26, ratio, (tier >= 3 ? '已达最高' : (point % TIER_STEP) + ' / ' + TIER_STEP), 2994);
        (0, theme_1.textPlain)(ctx, '累计段位点 ' + point, 820, sy + 164, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9), 'left', 'normal');
        (0, theme_1.textPlain)(ctx, tier >= 3 ? '已达最高段位，继续保持。' : '每 100 点晋升一段，胜局累积。', 820, sy + 190, theme_1.FONT.badge - 3, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8), 'left', 'normal');
    };
    /** 段位纹章：叶片外圈 + 中心宝石，颜色随段位递增。 */
    CollectionScene.prototype.drawEmblem = function (ctx, cx, cy, r, tier, cur, t, seedIndex) {
        for (var i = 0; i < 10; i++) {
            var a = (i / 10) * Math.PI * 2 + (cur ? t / 3000 : 0);
            (0, deck_1.drawPanelLeaf)(ctx, cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, r * 0.62, a + Math.PI * 0.5, i % 2 === 0 ? palette_1.PALETTE.leafMid : palette_1.PALETTE.leafLight, seedIndex + i, false);
        }
        var gem = (0, brush_1.arcPoints)(cx, cy, r * 0.62, 0, Math.PI * 2, 20);
        (0, deck_1.fillPanel)(ctx, gem, TIER_THEME[tier], { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seedIndex + 20 });
        (0, brush_1.strokeInk)(ctx, gem, { width: 3, close: true, seedIndex: seedIndex + 21 });
        var shine = ellipsePtsLocal(cx - r * 0.2, cy - r * 0.24, r * 0.22, r * 0.14);
        (0, deck_1.fillPanel)(ctx, shine, palette_1.PALETTE.creamMist, { alpha: 0.6, layers: 1, wetEdge: false, seedIndex: seedIndex + 22 });
        // 段位数字刻度
        for (var i = 0; i < tier + 1; i++) {
            var dot = (0, brush_1.arcPoints)(cx - r * 0.3 + i * r * 0.3, cy + r * 0.34, r * 0.08, 0, Math.PI * 2, 10);
            (0, deck_1.fillPanel)(ctx, dot, palette_1.PALETTE.creamMist, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seedIndex + 30 + i });
        }
    };
    /* ============================================================ 手势 */
    CollectionScene.prototype.gesture = function (e) {
        var tabHit = function (x, y) {
            for (var i = 0; i < 2; i++) {
                var bx = TAB_X + i * (TAB_W + TAB_GAP);
                if ((0, deck_1.inRect)(x, y, bx, TAB_Y, TAB_W, TAB_H))
                    return i;
            }
            return -1;
        };
        var cardHit = function (x, y) {
            for (var i = 0; i < species_1.SPECIES_ORDER.length; i++) {
                var col = i % 4;
                var row = Math.floor(i / 4);
                var bx = GRID_X + col * (CARD_W + GRID_GAP_X);
                var by = GRID_Y + row * (CARD_H + GRID_GAP_Y);
                if ((0, deck_1.inRect)(x, y, bx, by, CARD_W, CARD_H))
                    return i;
            }
            return -1;
        };
        if (e.type === 'move')
            return;
        if (e.type === 'down') {
            var ti = tabHit(e.x, e.y);
            if (ti >= 0)
                this.press = 'tab' + ti;
            else if ((0, deck_1.inRect)(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE))
                this.press = 'back';
            else if (this.tab === 'pets' && this.discoveredCount() === 0 &&
                (0, deck_1.inRect)(e.x, e.y, 240 + 400 - 150, 200 + 178, 300, 56))
                this.press = 'adventure';
            else {
                var ci_1 = cardHit(e.x, e.y);
                this.press = ci_1 >= 0 ? 'card' + ci_1 : '';
            }
            this.pressMs = 200;
            return;
        }
        if (e.type !== 'up' || e.wasDrag)
            return;
        var was = this.press;
        this.press = '';
        if (tabHit(e.x, e.y) >= 0) {
            var ti = tabHit(e.x, e.y);
            var next = ti === 0 ? 'pets' : 'rank';
            if (next !== this.tab) {
                this.tab = next;
                (0, audio_1.playSfx)('tap');
            }
            return;
        }
        if ((0, deck_1.inRect)(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) {
            (0, audio_1.playSfx)('tap');
            (0, manager_1.pop)();
            return;
        }
        if (this.tab === 'pets' && this.discoveredCount() === 0 &&
            (0, deck_1.inRect)(e.x, e.y, 240 + 400 - 150, 200 + 178, 300, 56)) {
            (0, audio_1.playSfx)('cardPick');
            this.showToast('回到营地，点左侧树屋开一局');
            return;
        }
        var ci = cardHit(e.x, e.y);
        if (ci >= 0) {
            var sp = species_1.SPECIES_ORDER[ci];
            if (!this.isDiscovered(sp)) {
                (0, audio_1.playSfx)('reject');
                this.showToast('这一格还没有遇见');
            }
            else {
                this.sel = ci;
                (0, audio_1.playSfx)('tap');
            }
            return;
        }
        if (was !== '')
            this.pressMs = 0;
    };
    CollectionScene.prototype.showToast = function (text) {
        this.toastText = text;
        this.toastMs = 320;
    };
    return CollectionScene;
}());
exports.CollectionScene = CollectionScene;
/** 局部椭圆点集（避免额外依赖）。 */
function ellipsePtsLocal(cx, cy, rx, ry) {
    var unit = (0, brush_1.arcPoints)(0, 0, 1, 0, Math.PI * 2, 12);
    var out = [];
    for (var i = 0; i < unit.length; i++)
        out.push({ x: cx + unit[i].x * rx, y: cy + unit[i].y * ry });
    return out;
}
function createCollectionScene(opts) {
    return new CollectionScene(opts);
}
