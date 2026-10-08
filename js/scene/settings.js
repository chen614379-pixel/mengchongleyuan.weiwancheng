"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsScene = void 0;
exports.createSettingsScene = createSettingsScene;
/**
 * 设置页 —— 横屏 1280×720，手绘水彩森林风。
 *
 * 全部控件自绘（木牌行 + 手绘拨杆开关），不使用任何系统默认控件、不使用 strokeRect。
 *  - 声音：背景音乐 / 音效。音效开关会立即生效（开→播放反馈音，关→stopAllSfx）。
 *  - 玩法：重看教程 —— 打开 3 页手绘速览（集市 / 合成 / 克制），纯本页内自洽，不改存档结构。
 *  - 存档：重置存档走二次确认弹窗，确认后就地把存档字段复位并立即落盘。
 *  - 关于：版本、分辨率、操作方式、存档键。
 *
 * 通用手绘件复用同目录 deck.ts。
 */
var manager_1 = require("./manager");
var palette_1 = require("../config/palette");
var species_1 = require("../config/species");
var storage_1 = require("../platform/storage");
var audio_1 = require("../platform/audio");
var screen_1 = require("../platform/screen");
var brush_1 = require("../ui/brush");
var theme_1 = require("../ui/theme");
var ease_1 = require("../ui/ease");
var paint_1 = require("../render/paint");
var deck_1 = require("./deck");
var BACK_X = 26;
var BACK_Y = 24;
var BACK_SIZE = 60;
var L_X = 56;
var L_W = 576;
var R_X = 656;
var R_W = 568;
/** 声音行（放在标题带 y+72 的副标题之下，避免压字） */
var MUSIC_ROW_Y = 196;
var SFX_ROW_Y = 260;
var TOGGLE_W = 96;
var TOGGLE_H = 44;
/** 玩法行 */
var TUTORIAL_BTN = { x: 76, y: 436, w: 244, h: 58 };
/** 存档行 */
var RESET_BTN = { x: 676, y: 200, w: 228, h: 58 };
/** 弹窗按钮 */
var MODAL_BTN_W = 216;
var MODAL_BTN_H = 56;
var MODAL_OK_X = 640 - 120 - 12;
var MODAL_CANCEL_X = 640 + 120 + 12;
var SettingsScene = /** @class */ (function () {
    function SettingsScene() {
        this.name = 'settings';
        this.t = 0;
        this.t0 = -1;
        this.enterMs = 0;
        this.press = '';
        this.pressMs = 0;
        this.toastText = '';
        this.toastMs = 0;
        this.modal = '';
        this.page = 0;
    }
    SettingsScene.prototype.enter = function () {
        this.t0 = -1;
        this.enterMs = 0;
        this.press = '';
        this.toastMs = 0;
        this.modal = '';
        this.page = 0;
    };
    SettingsScene.prototype.tick = function (logicTime) {
        this.t = logicTime;
        if (this.t0 < 0)
            this.t0 = logicTime;
        this.enterMs = logicTime - this.t0;
        if (this.pressMs > 0)
            this.pressMs -= 50;
        if (this.toastMs > 0)
            this.toastMs -= 50;
    };
    SettingsScene.prototype.render = function (ctx, renderTime) {
        var t = renderTime;
        var save = (0, storage_1.loadSave)();
        var p = (0, ease_1.clamp01)(this.enterMs / 260);
        var s = 0.95 + 0.05 * (0, ease_1.easeOutCubic)(p);
        var cx = deck_1.SCREEN.W / 2;
        var cy = deck_1.SCREEN.H / 2;
        (0, deck_1.drawScreenBase)(ctx, t, 3100);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
        (0, deck_1.drawBackButton)(ctx, BACK_X, BACK_Y, BACK_SIZE, this.press === 'back', 3120);
        (0, deck_1.drawTitlePlate)(ctx, 660, 20, 260, 72, '设置', 3140);
        // 右上角版本木牌
        (0, deck_1.drawWoodPlate)(ctx, 1006, 34, 248, 52, { radius: 18, base: palette_1.PALETTE.barkLight, seedIndex: 3150 });
        (0, theme_1.textOutlined)(ctx, '版本 1.0.0', 1028, 62, theme_1.FONT.entry, palette_1.PALETTE.inkSoft, 'left', 2);
        (0, paint_1.drawSparkle)(ctx, 1226, 60, 10, palette_1.PALETTE.sunbeam, 0.6);
        this.drawSoundPlate(ctx, save);
        this.drawGameplayPlate(ctx);
        this.drawAboutPlate(ctx);
        this.drawSavePlate(ctx, save);
        this.drawTipsPlate(ctx, t);
        ctx.restore();
        (0, deck_1.drawRevealVeil)(ctx, p, 3200);
        if (this.toastMs > 0)
            (0, deck_1.drawToast)(ctx, this.toastText, (0, ease_1.clamp01)(this.toastMs / 300), 3220);
        if (this.modal !== '')
            this.drawModal(ctx, t, save);
    };
    /* ------------------------------------------------------------ 左列 */
    SettingsScene.prototype.drawSoundPlate = function (ctx, save) {
        (0, deck_1.drawWoodPlate)(ctx, L_X, 104, L_W, 228, { radius: 24, base: palette_1.PALETTE.paper, seedIndex: 3300 });
        this.rowTitle(ctx, L_X, 104, '声音', '木牌上的拨杆，点了会立刻响', 3302);
        this.drawToggleRow(ctx, L_X, MUSIC_ROW_Y, '背景音乐', save.audio.music, 'music', 3310);
        this.drawToggleRow(ctx, L_X, SFX_ROW_Y, '音效', save.audio.sfx, 'sfx', 3330);
    };
    SettingsScene.prototype.drawGameplayPlate = function (ctx) {
        (0, deck_1.drawWoodPlate)(ctx, L_X, 348, L_W, 170, { radius: 24, base: palette_1.PALETTE.paper, seedIndex: 3360 });
        this.rowTitle(ctx, L_X, 348, '玩法', '随时可以再看一遍', 3362);
        (0, deck_1.drawWoodButton)(ctx, TUTORIAL_BTN.x, TUTORIAL_BTN.y, TUTORIAL_BTN.w, TUTORIAL_BTN.h, '重看教程', this.press === 'tutorial', 3370);
        (0, theme_1.wrapText)(ctx, '3 页速览：集市怎么挑 · 两只合成 · 克制闭环。看完返回营地就能上手。', TUTORIAL_BTN.x + TUTORIAL_BTN.w + 20, TUTORIAL_BTN.y + 16, L_W - TUTORIAL_BTN.w - 60, theme_1.FONT.badge, 24, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.85), 'left', 3);
    };
    SettingsScene.prototype.drawAboutPlate = function (ctx) {
        (0, deck_1.drawWoodPlate)(ctx, L_X, 534, L_W, 176, { radius: 24, base: palette_1.PALETTE.paper, seedIndex: 3400 });
        this.rowTitle(ctx, L_X, 534, '关于', '《萌宠乱斗 · 林间乱斗》', 3402);
        var lines = [
            '画面 1280×720 横屏 · Canvas 2D 手绘',
            '操作：点按选择；集市阶段拖动卡牌上场',
            '存档键：' + storage_1.SAVE_KEY,
            '引擎：自研回合制，无第三方依赖'
        ];
        for (var i = 0; i < lines.length; i++) {
            var y = 622 + i * 24;
            var dot = (0, brush_1.arcPoints)(L_X + 34, y - 5, 5, 0, Math.PI * 2, 10);
            (0, deck_1.fillPanel)(ctx, dot, palette_1.PALETTE.leafMid, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: 3410 + i });
            (0, brush_1.strokeInk)(ctx, dot, { width: 1.6, close: true, seedIndex: 3420 + i });
            (0, theme_1.textPlain)(ctx, lines[i], L_X + 50, y, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.9), 'left', 'normal');
        }
    };
    /* ------------------------------------------------------------ 右列 */
    SettingsScene.prototype.drawSavePlate = function (ctx, save) {
        (0, deck_1.drawWoodPlate)(ctx, R_X, 104, R_W, 232, { radius: 24, base: palette_1.PALETTE.paper, seedIndex: 3500 });
        this.rowTitle(ctx, R_X, 104, '存档与数据', '本地存档，随时可复位', 3502);
        (0, deck_1.drawWoodButton)(ctx, RESET_BTN.x, RESET_BTN.y, RESET_BTN.w, RESET_BTN.h, '重置存档', this.press === 'reset', 3510);
        (0, theme_1.textPlain)(ctx, '爪印币 ' + save.coins + ' · 星辉 ' + save.stars, RESET_BTN.x + RESET_BTN.w + 24, RESET_BTN.y + 26, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.9), 'left', 'bold');
        (0, theme_1.textPlain)(ctx, '对局 ' + (save.stats.win + save.stats.lose + save.stats.draw) + ' 局', RESET_BTN.x + RESET_BTN.w + 24, RESET_BTN.y + 50, theme_1.FONT.badge - 2, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.75), 'left', 'normal');
        (0, theme_1.wrapText)(ctx, '重置会清空货币、图鉴、穿搭与战绩；按二次确认后才执行，无法撤销。', R_X + 24, RESET_BTN.y + 76, R_W - 48, theme_1.FONT.badge - 1, 24, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.82), 'left', 2);
        // 底部一枚小木牌提示
        var tip = (0, deck_1.roundPts)(R_X + 24, 292, R_W - 48, 34, 14);
        (0, deck_1.fillPanel)(ctx, tip, (0, palette_1.tint)(palette_1.PALETTE.sunbeam, 0.72, palette_1.PALETTE.paper), {
            alpha: 0.75, layers: 1, wetEdge: false, seedIndex: 3520,
        });
        (0, brush_1.strokeInk)(ctx, tip, { width: 2, close: true, seedIndex: 3521 });
        (0, theme_1.textPlain)(ctx, '存档只在微信环境落盘，自检环境不写入。', R_X + R_W / 2, 309, theme_1.FONT.badge - 2, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.85), 'center', 'normal');
    };
    SettingsScene.prototype.drawTipsPlate = function (ctx, t) {
        (0, deck_1.drawWoodPlate)(ctx, R_X, 356, R_W, 328, { radius: 24, base: palette_1.PALETTE.paper, seedIndex: 3540 });
        this.rowTitle(ctx, R_X, 356, '林间小抄', '三条最容易被忘掉的规则', 3542);
        var tips = [
            { title: '集市 5 张', body: '每轮 5 个摊位 + 1 张免费赠礼' },
            { title: '两只合成 ×2', body: '同名同星上场即合成，升 1 级' },
            { title: '克制闭环', body: '沿战力序打一圈，克制 ×1.5' }
        ];
        for (var i = 0; i < 3; i++) {
            var y = 412 + i * 88;
            var plate = (0, deck_1.roundPts)(R_X + 22, y, R_W - 44, 76, 18);
            (0, deck_1.fillPanel)(ctx, plate, (0, palette_1.tint)(palette_1.PALETTE.meadow, 0.55, palette_1.PALETTE.paper), {
                alpha: 0.85, layers: 1, wetEdge: false, seedIndex: 3550 + i,
            });
            (0, brush_1.strokeInk)(ctx, plate, { width: 2.2, close: true, seedIndex: 3554 + i });
            // 左侧小图
            if (i === 0) {
                for (var k = 0; k < 5; k++) {
                    var cw = 16;
                    var cxp = R_X + 40 + k * 20;
                    var cp = (0, deck_1.roundPts)(cxp, y + 30, cw, 24, 6);
                    (0, deck_1.fillPanel)(ctx, cp, palette_1.PALETTE.paper, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 3560 + k });
                    (0, brush_1.strokeInk)(ctx, cp, { width: 1.6, close: true, seedIndex: 3566 + k });
                }
            }
            else if (i === 1) {
                (0, deck_1.drawCreature)(ctx, 'dog', R_X + 52, y + 46, 34, t);
                (0, deck_1.drawCreature)(ctx, 'dog', R_X + 88, y + 46, 34, t);
                (0, brush_1.strokeInk)(ctx, [
                    { x: R_X + 108, y: y + 38 },
                    { x: R_X + 126, y: y + 30 },
                    { x: R_X + 144, y: y + 38 },
                ], { width: 2.2, jitter: 0.6, color: palette_1.PALETTE.forestDeep, seedIndex: 3570 });
                (0, theme_1.textPlain)(ctx, '×2', R_X + 140, y + 58, theme_1.FONT.badge, palette_1.PALETTE.leafMid, 'center', 'bold');
            }
            else {
                var ring = (0, brush_1.arcPoints)(R_X + 76, y + 38, 26, 0, Math.PI * 2, 20);
                (0, brush_1.strokeInk)(ctx, ring, { width: 2.2, color: palette_1.PALETTE.forestDeep, jitter: 1.0, seedIndex: 3574 });
                for (var k = 0; k < 4; k++) {
                    var a = (k / 4) * Math.PI * 2 - Math.PI / 2;
                    (0, deck_1.drawCreature)(ctx, species_1.SPECIES_ORDER[k], R_X + 76 + Math.cos(a) * 30, y + 60 + Math.sin(a) * 26, 26, t);
                }
            }
            (0, theme_1.textOutlined)(ctx, tips[i].title, R_X + 176, y + 30, theme_1.FONT.body - 1, palette_1.PALETTE.forestDeep, 'left', 2);
            (0, theme_1.textPlain)(ctx, tips[i].body, R_X + 176, y + 56, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.85), 'left', 'normal');
        }
        (0, paint_1.drawGrassTuft)(ctx, R_X + R_W - 44, 676, 20, palette_1.PALETTE.leafMid, 3580, Math.sin(t / 1500));
        (0, deck_1.drawPanelLeaf)(ctx, R_X + 20, 668, 26, Math.PI * 0.8, palette_1.PALETTE.leafMid, 3582, false);
    };
    /* ------------------------------------------------------------ 通用件 */
    SettingsScene.prototype.rowTitle = function (ctx, x, y, title, sub, seedIndex) {
        (0, theme_1.textOutlined)(ctx, title, x + 26, y + 46, theme_1.FONT.h2, palette_1.PALETTE.forestDeep, 'left', 2.2);
        (0, theme_1.textPlain)(ctx, sub, x + 24 + 26 + (title.length > 1 ? 0 : 0) + 6, y + 72, theme_1.FONT.badge - 2, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.7), 'left', 'normal');
        (0, deck_1.drawPanelLeaf)(ctx, x + 8, y + 40, 22, Math.PI * 0.85, palette_1.PALETTE.leafMid, seedIndex, false);
    };
    /** 一行自绘拨杆开关。 */
    SettingsScene.prototype.drawToggleRow = function (ctx, x, y, label, on, key, seedIndex) {
        var pressed = this.press === key;
        var rowPts = (0, deck_1.roundPts)(x + 22, y, L_W - 44, 56, 18);
        (0, deck_1.fillPanel)(ctx, rowPts, (0, palette_1.tint)(on ? palette_1.PALETTE.meadow : palette_1.PALETTE.soil, 0.62, palette_1.PALETTE.paper), {
            alpha: 0.8, layers: 1, wetEdge: false, seedIndex: seedIndex,
        });
        (0, brush_1.strokeInk)(ctx, rowPts, { width: 2.2, close: true, seedIndex: seedIndex + 1 });
        (0, theme_1.textOutlined)(ctx, label, x + 48, y + 36, theme_1.FONT.body - 1, palette_1.PALETTE.forestDeep, 'left', 2);
        this.drawToggle(ctx, x + L_W - 44 - TOGGLE_W - 18, y + (56 - TOGGLE_H) / 2, on, pressed, seedIndex + 10);
    };
    /** 手绘拨杆：木槽 + 圆木钮（开=苔绿 + 阳光光晕）。 */
    SettingsScene.prototype.drawToggle = function (ctx, x, y, on, pressed, seedIndex) {
        var track = (0, deck_1.roundPts)(x, y, TOGGLE_W, TOGGLE_H, TOGGLE_H / 2);
        (0, brush_1.dropShadow)(ctx, x, y, TOGGLE_W, TOGGLE_H, TOGGLE_H / 2, seedIndex);
        (0, deck_1.fillPanel)(ctx, track, on ? palette_1.PALETTE.leafMid : (0, palette_1.tint)(palette_1.PALETTE.soil, 0.35, palette_1.PALETTE.bark), {
            alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seedIndex + 1,
        });
        (0, paint_1.woodGrain)(ctx, x + 6, y + 5, TOGGLE_W - 12, TOGGLE_H - 10, seedIndex + 2);
        (0, brush_1.strokeInk)(ctx, track, { width: 2.6, close: true, seedIndex: seedIndex + 3 });
        // 钮
        var kr = TOGGLE_H / 2 - 5;
        var kx = on ? x + TOGGLE_W - kr - 5 : x + kr + 5;
        var ky = y + TOGGLE_H / 2 + (pressed ? 1 : 0);
        if (on) {
            var glow = (0, brush_1.arcPoints)(kx, ky, kr + 7, 0, Math.PI * 2, 16);
            (0, deck_1.fillPanel)(ctx, glow, palette_1.PALETTE.sunbeam, { alpha: 0.45, layers: 1, wetEdge: false, seedIndex: seedIndex + 5 });
        }
        var knob = (0, brush_1.arcPoints)(kx, ky, kr, 0, Math.PI * 2, 18);
        (0, deck_1.fillPanel)(ctx, knob, palette_1.PALETTE.creamMist, { alpha: 0.98, layers: 2, wetEdge: true, seedIndex: seedIndex + 6 });
        (0, brush_1.strokeInk)(ctx, knob, { width: 2.4, close: true, seedIndex: seedIndex + 7 });
        var hi = (0, brush_1.arcPoints)(kx - kr * 0.28, ky - kr * 0.3, kr * 0.26, 0, Math.PI * 2, 10);
        (0, deck_1.fillPanel)(ctx, hi, palette_1.PALETTE.paper, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seedIndex + 8 });
    };
    /* ------------------------------------------------------------ 弹窗 */
    SettingsScene.prototype.drawModal = function (ctx, t, save) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.6);
        var sbox = (0, screen_1.sceneBox)();
        ctx.fillRect(sbox.x, sbox.y, sbox.w, sbox.h);
        ctx.restore();
        if (this.modal === 'tutorial')
            this.drawTutorialModal(ctx, t);
        else
            this.drawResetModal(ctx);
    };
    SettingsScene.prototype.modalPlate = function (ctx, w, h) {
        var x = deck_1.SCREEN.W / 2 - w / 2;
        var y = deck_1.SCREEN.H / 2 - h / 2 - 10;
        (0, deck_1.drawWoodPlate)(ctx, x, y, w, h, { radius: 28, base: palette_1.PALETTE.paper, seedIndex: 3600 });
        return { x: x, y: y };
    };
    SettingsScene.prototype.drawTutorialModal = function (ctx, t) {
        var w = 860;
        var h = 470;
        var o = this.modalPlate(ctx, w, h);
        var page = this.page;
        var titles = ['集市怎么挑', '两只合成', '克制闭环'];
        var bodies = [
            '每轮集市摆 5 个摊位，标价就是费用（左上角圆牌）。另有 1 张免费赠礼可以先拿。刷新每次 2/3/4 阳光，每轮最多 3 次。',
            '两只同名同星的动物上场会合成 1 只，等级 +1：生命与攻击 ×1.8，攻速与移速不变。所以「留一对」比「买一只大的」更划算。',
            '8 物种沿战力序首尾相接：象→狮→虎→豹→狼→狗→猫→鼠→象。克制方伤害 ×1.5，被克制方 ×0.75。'
        ];
        // 页眉
        (0, deck_1.drawPanelLeaf)(ctx, o.x + 30, o.y + 30, 30, Math.PI * 0.8, palette_1.PALETTE.leafMid, 3610, true);
        (0, deck_1.drawPanelLeaf)(ctx, o.x + w - 30, o.y + 30, 30, Math.PI * 0.2, palette_1.PALETTE.leafMid, 3612, true);
        (0, theme_1.textOutlined)(ctx, '第 ' + (page + 1) + ' / 3 页 · ' + titles[page], deck_1.SCREEN.W / 2, o.y + 52, theme_1.FONT.h2, palette_1.PALETTE.forestDeep, 'center', 2.4);
        // 插图区
        var iy = o.y + 96;
        var plate = (0, deck_1.roundPts)(o.x + 40, iy, w - 80, 176, 22);
        (0, deck_1.fillPanel)(ctx, plate, (0, palette_1.tint)(palette_1.PALETTE.meadow, 0.5, palette_1.PALETTE.paper), {
            alpha: 0.8, layers: 1, wetEdge: false, seedIndex: 3620,
        });
        (0, brush_1.strokeInk)(ctx, plate, { width: 2.4, close: true, seedIndex: 3621 });
        if (page === 0) {
            for (var k = 0; k < 5; k++) {
                var cw = 108;
                var ch = 136;
                var cxp = o.x + 74 + k * (cw + 16);
                var cyp = iy + 20;
                var cp = (0, deck_1.roundPts)(cxp, cyp, cw, ch, 16);
                (0, deck_1.fillPanel)(ctx, cp, palette_1.PALETTE.paper, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: 3630 + k });
                (0, brush_1.strokeInk)(ctx, cp, { width: 2.4, close: true, seedIndex: 3636 + k });
                var sp = species_1.SPECIES_ORDER[k];
                (0, deck_1.drawCreature)(ctx, sp, cxp + cw / 2, cyp + 62, 74, t);
                var chip = (0, brush_1.arcPoints)(cxp + 22, cyp + 22, 16, 0, Math.PI * 2, 14);
                (0, deck_1.fillPanel)(ctx, chip, palette_1.PALETTE.sunbeam, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 3642 + k });
                (0, brush_1.strokeInk)(ctx, chip, { width: 2, close: true, seedIndex: 3646 + k });
                (0, theme_1.textPlain)(ctx, '' + species_1.SPECIES[sp].cost, cxp + 22, cyp + 23, 16, palette_1.PALETTE.inkSoft, 'center', 'bold');
                (0, theme_1.textOutlined)(ctx, species_1.SPECIES[sp].cn, cxp + cw / 2, cyp + ch - 22, theme_1.FONT.body - 2, palette_1.PALETTE.forestDeep, 'center', 2);
            }
        }
        else if (page === 1) {
            var base = o.x + 200;
            for (var k = 0; k < 2; k++) {
                (0, deck_1.drawCreature)(ctx, 'tiger', base + k * 96, iy + 96, 88, t);
            }
            (0, brush_1.strokeInk)(ctx, [
                { x: o.x + 400, y: iy + 92 },
                { x: o.x + 470, y: iy + 76 },
                { x: o.x + 540, y: iy + 92 },
            ], { width: 3, jitter: 0.8, color: palette_1.PALETTE.forestDeep, seedIndex: 3660 });
            (0, theme_1.textPlain)(ctx, '同名同星合成', o.x + 470, iy + 116, theme_1.FONT.badge, palette_1.PALETTE.forestDeep, 'center', 'bold');
            (0, deck_1.drawCreature)(ctx, 'tiger', o.x + 660, iy + 92, 110, t);
            var chip = (0, brush_1.arcPoints)(o.x + 700, iy + 34, 20, 0, Math.PI * 2, 14);
            (0, deck_1.fillPanel)(ctx, chip, palette_1.PALETTE.leafLight, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 3662 });
            (0, brush_1.strokeInk)(ctx, chip, { width: 2, close: true, seedIndex: 3663 });
            (0, theme_1.textPlain)(ctx, '2', o.x + 700, iy + 35, 18, palette_1.PALETTE.inkSoft, 'center', 'bold');
            (0, theme_1.textPlain)(ctx, '生命 / 攻击 ×1.8', o.x + 660, iy + 156, theme_1.FONT.badge, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.9), 'center', 'normal');
        }
        else {
            var cx0 = o.x + w / 2;
            var cy0 = iy + 88;
            var ring = (0, brush_1.arcPoints)(cx0, cy0, 62, 0, Math.PI * 2, 26);
            (0, brush_1.strokeInk)(ctx, ring, { width: 2.6, color: palette_1.PALETTE.forestDeep, jitter: 1.2, seedIndex: 3670 });
            for (var k = 0; k < 8; k++) {
                var a = (k / 8) * Math.PI * 2 - Math.PI / 2;
                var sp = species_1.SPECIES_ORDER[k];
                (0, deck_1.drawCreature)(ctx, sp, cx0 + Math.cos(a) * 92, cy0 + Math.sin(a) * 74, 56, t);
                (0, theme_1.textOutlined)(ctx, species_1.SPECIES[sp].cn, cx0 + Math.cos(a) * 92, cy0 + Math.sin(a) * 74 + 42, theme_1.FONT.badge, palette_1.PALETTE.forestDeep, 'center', 1.8);
            }
            (0, theme_1.textOutlined)(ctx, '克制 ×1.5', cx0, cy0 + 6, theme_1.FONT.body, palette_1.PALETTE.berry, 'center', 2);
        }
        // 正文
        (0, theme_1.wrapText)(ctx, bodies[page], o.x + 60, iy + 208, w - 120, theme_1.FONT.body - 2, 30, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.9), 'left', 3);
        // 页码点
        for (var k = 0; k < 3; k++) {
            var dot = (0, brush_1.arcPoints)(deck_1.SCREEN.W / 2 - 30 + k * 30, o.y + h - 96, 8, 0, Math.PI * 2, 12);
            (0, deck_1.fillPanel)(ctx, dot, k === page ? palette_1.PALETTE.leafMid : (0, palette_1.tint)(palette_1.PALETTE.inkSoft, 0.7, palette_1.PALETTE.paper), {
                alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 3680 + k,
            });
            (0, brush_1.strokeInk)(ctx, dot, { width: 2, close: true, seedIndex: 3684 + k });
        }
        // 按钮：上一步 / 下一步（最后一页为「完成」）
        var by = o.y + h - 84;
        if (page > 0) {
            (0, deck_1.drawWoodButton)(ctx, MODAL_CANCEL_X, by, MODAL_BTN_W, MODAL_BTN_H, '上一步', this.press === 'prev', 3690);
        }
        (0, deck_1.drawWoodButton)(ctx, MODAL_OK_X, by, MODAL_BTN_W, MODAL_BTN_H, page >= 2 ? '完成' : '下一步', this.press === 'next', 3692);
    };
    SettingsScene.prototype.drawResetModal = function (ctx) {
        var w = 640;
        var h = 300;
        var o = this.modalPlate(ctx, w, h);
        (0, theme_1.textOutlined)(ctx, '确认重置存档？', deck_1.SCREEN.W / 2, o.y + 56, theme_1.FONT.h2, palette_1.PALETTE.berry, 'center', 2.4);
        (0, theme_1.wrapText)(ctx, '会清空爪印币、星辉、图鉴、穿搭与战绩，并立即写入本地存档。这一步无法撤销。', deck_1.SCREEN.W / 2, o.y + 108, w - 90, theme_1.FONT.body - 2, 30, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.9), 'center', 3);
        var by = o.y + h - 88;
        (0, deck_1.drawWoodButton)(ctx, MODAL_CANCEL_X, by, MODAL_BTN_W, MODAL_BTN_H, '取消', this.press === 'cancel', 3700);
        (0, deck_1.drawWoodButton)(ctx, MODAL_OK_X, by, MODAL_BTN_W, MODAL_BTN_H, '确认重置', this.press === 'confirm', 3702);
    };
    /* ------------------------------------------------------------ 手势 */
    SettingsScene.prototype.gesture = function (e) {
        if (e.type === 'move')
            return;
        if (this.modal !== '') {
            var my = deck_1.SCREEN.H / 2 - (this.modal === 'tutorial' ? 470 : 300) / 2 - 10 +
                (this.modal === 'tutorial' ? 470 - 84 : 300 - 88);
            if (e.type === 'down') {
                if (this.modal === 'tutorial' && this.page > 0 &&
                    (0, deck_1.inRect)(e.x, e.y, MODAL_CANCEL_X, my, MODAL_BTN_W, MODAL_BTN_H))
                    this.press = 'prev';
                else if ((0, deck_1.inRect)(e.x, e.y, MODAL_OK_X, my, MODAL_BTN_W, MODAL_BTN_H)) {
                    this.press = this.modal === 'reset' ? 'confirm' : 'next';
                }
                else
                    this.press = '';
                this.pressMs = 200;
                return;
            }
            if (e.type !== 'up' || e.wasDrag)
                return;
            var was_1 = this.press;
            this.press = '';
            if (was_1 === 'prev') {
                (0, audio_1.playSfx)('tap');
                this.page--;
                return;
            }
            if (was_1 === 'confirm') {
                (0, audio_1.playSfx)('reject');
                this.applyReset();
                this.modal = '';
                this.showToast('存档已重置');
                return;
            }
            if (was_1 === 'next') {
                if (this.modal === 'reset') {
                    (0, audio_1.playSfx)('tap');
                    this.modal = '';
                    return;
                }
                if (this.page < 2) {
                    (0, audio_1.playSfx)('tap');
                    this.page++;
                }
                else {
                    (0, audio_1.playSfx)('cardPick');
                    this.modal = '';
                }
                return;
            }
            return;
        }
        if (e.type === 'down') {
            if ((0, deck_1.inRect)(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE))
                this.press = 'back';
            else if (this.musicToggleHit(e.x, e.y))
                this.press = 'music';
            else if (this.sfxToggleHit(e.x, e.y))
                this.press = 'sfx';
            else if ((0, deck_1.inRect)(e.x, e.y, TUTORIAL_BTN.x, TUTORIAL_BTN.y, TUTORIAL_BTN.w, TUTORIAL_BTN.h))
                this.press = 'tutorial';
            else if ((0, deck_1.inRect)(e.x, e.y, RESET_BTN.x, RESET_BTN.y, RESET_BTN.w, RESET_BTN.h))
                this.press = 'reset';
            else
                this.press = '';
            this.pressMs = 200;
            return;
        }
        if (e.type !== 'up' || e.wasDrag)
            return;
        var was = this.press;
        this.press = '';
        if ((0, deck_1.inRect)(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) {
            (0, audio_1.playSfx)('tap');
            (0, manager_1.pop)();
            return;
        }
        if (this.musicToggleHit(e.x, e.y)) {
            var save = (0, storage_1.loadSave)();
            save.audio.music = !save.audio.music;
            (0, storage_1.saveNow)();
            (0, audio_1.syncBgm)();
            (0, audio_1.playSfx)('tap');
            this.showToast(save.audio.music ? '背景音乐已开启' : '背景音乐已关闭');
            return;
        }
        if (this.sfxToggleHit(e.x, e.y)) {
            var save = (0, storage_1.loadSave)();
            save.audio.sfx = !save.audio.sfx;
            (0, storage_1.saveNow)();
            if (save.audio.sfx)
                (0, audio_1.playSfx)('cardPick');
            else
                (0, audio_1.stopAllSfx)();
            this.showToast(save.audio.sfx ? '音效已开启' : '音效已关闭');
            return;
        }
        if ((0, deck_1.inRect)(e.x, e.y, TUTORIAL_BTN.x, TUTORIAL_BTN.y, TUTORIAL_BTN.w, TUTORIAL_BTN.h)) {
            (0, audio_1.playSfx)('cardPick');
            this.page = 0;
            this.modal = 'tutorial';
            return;
        }
        if ((0, deck_1.inRect)(e.x, e.y, RESET_BTN.x, RESET_BTN.y, RESET_BTN.w, RESET_BTN.h)) {
            (0, audio_1.playSfx)('tap');
            this.modal = 'reset';
            return;
        }
        if (was !== '')
            this.pressMs = 0;
    };
    SettingsScene.prototype.musicToggleHit = function (x, y) {
        return (0, deck_1.inRect)(x, y, L_X + L_W - 44 - TOGGLE_W - 18, MUSIC_ROW_Y + (56 - TOGGLE_H) / 2, TOGGLE_W, TOGGLE_H);
    };
    SettingsScene.prototype.sfxToggleHit = function (x, y) {
        return (0, deck_1.inRect)(x, y, L_X + L_W - 44 - TOGGLE_W - 18, SFX_ROW_Y + (56 - TOGGLE_H) / 2, TOGGLE_W, TOGGLE_H);
    };
    /** 就地把存档字段复位 + 立即落盘（不改 storage.ts 的结构）。 */
    SettingsScene.prototype.applyReset = function () {
        var d = (0, storage_1.defaultSave)();
        var s = (0, storage_1.loadSave)();
        s.version = d.version;
        s.coins = d.coins;
        s.stars = d.stars;
        s.trainer = d.trainer;
        s.pets = d.pets;
        s.skills = d.skills;
        s.cardsSeen = d.cardsSeen;
        s.collection = d.collection;
        s.impSkin = d.impSkin;
        s.rank = d.rank;
        s.stats = d.stats;
        s.lastDailyWin = d.lastDailyWin;
        s.audio = d.audio;
        (0, storage_1.saveNow)();
    };
    SettingsScene.prototype.showToast = function (text) {
        this.toastText = text;
        this.toastMs = 320;
    };
    return SettingsScene;
}());
exports.SettingsScene = SettingsScene;
function createSettingsScene() {
    return new SettingsScene();
}
