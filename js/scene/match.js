"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMatchScene = createMatchScene;
/**
 * 对局场景（§3 一局循环 / §4 棋盘 / §6 克制 / §7 卡牌 / §8 指挥 / §11 结算）。
 *
 * 职责边界：本文件只做「把可见状态画出来」+「把手势翻译成 Command」，
 * 绝不修改 core 状态（唯一写入口是 `CommandQueue`）。
 */
var manager_1 = require("./manager");
var match_layout_1 = require("./match-layout");
var layout_1 = require("../config/layout");
var palette_1 = require("../config/palette");
var timing_1 = require("../config/timing");
var species_1 = require("../config/species");
var cards_1 = require("../config/cards");
var economy_1 = require("../config/economy");
var weather_1 = require("../config/weather");
var command_1 = require("../core/command");
var setup_1 = require("../core/setup");
var engine_1 = require("../core/engine");
var ai_1 = require("../core/ai");
var shop_1 = require("../core/shop");
var storage_1 = require("../platform/storage");
var audio_1 = require("../platform/audio");
var screen_1 = require("../platform/screen");
var theme_1 = require("../ui/theme");
var fx_1 = require("../ui/fx");
var forest_1 = require("../render/forest");
var assets_1 = require("../render/assets");
var board_1 = require("../render/board");
var unit_1 = require("../render/unit");
var hpring_1 = require("../render/hpring");
var card_1 = require("../render/card");
var sidebar_1 = require("../render/sidebar");
var coach_1 = require("../render/coach");
var imp_1 = require("../render/imp");
var result_1 = require("../render/result");
var ui_1 = require("../render/ui");
var paint_1 = require("../render/paint");
var brush_1 = require("../ui/brush");
/** 结算页伤害堆叠条的矩形（绘制与点击判定共用，改一处即同步）。 */
var DAMAGE_STACK = { x: 365, y: 344, w: 370, h: 190 };
function createMatchScene(opts) {
    return new MatchScene(opts || {});
}
var MatchScene = /** @class */ (function () {
    function MatchScene(opts) {
        this.name = 'match';
        this.battle = null;
        this.queue = new command_1.CommandQueue();
        this.results = [];
        this.fx = (0, fx_1.createFx)();
        this.time = 0;
        this.logicTime = 0;
        this.drag = null;
        this.handDrag = null;
        this.selectedUnit = -1;
        this.detailUnit = -1;
        this.showWarbook = false;
        this.showSettings = false;
        this.giftArmed = false;
        this.pressed = '';
        this.toast = '';
        this.toastUntil = -1;
        this.rejectAt = -9999;
        this.rejectCard = -1;
        this.prevHp = {};
        this.prevAlive = {};
        this.enemyGhost = null;
        this.resultApplied = false;
        /** dev 自检阶段位（正常游戏恒为 0，不会进入任何分支） */
        this.devStage = 0;
        this.devPhase = '';
        this.devConfirmDone = false;
        this.devMarketBuy = -1;
        this.reportPage = 0;
        this.expandedSeg = '';
        this.rewardProgress = 0;
        this.coinGain = 0;
        this.starGain = 0;
        this.housePrev = 30;
        this.opts = opts;
    }
    /* ------------------------------------------------------------------ */
    /* 生命周期                                                            */
    /* ------------------------------------------------------------------ */
    MatchScene.prototype.enter = function () {
        var seed = this.opts.seed === undefined ? (Date.now() % 100000) : this.opts.seed;
        this.battle = (0, setup_1.createBattle)(seed, this.opts.difficulty || 'veteran');
        this.queue = new command_1.CommandQueue();
        this.results = [];
        this.fx.clear();
        this.captureSnapshot();
        this.housePrev = this.battle.player.houseHp;
        this.showToast('第 1 回合 · 布阵阶段，长按动物拖到棋盘上', 3200);
    };
    MatchScene.prototype.exit = function () {
        this.fx.clear();
    };
    MatchScene.prototype.tick = function (dtMs, logicTime) {
        this.time += dtMs;
        this.logicTime = logicTime;
        this.fx.update(dtMs);
        var b = this.battle;
        if (!b)
            return;
        var before = b.phase;
        if (this.opts.dev)
            this.devStep(b);
        (0, ai_1.aiTick)(b, this.queue);
        (0, engine_1.tick)(b, this.queue, this.results);
        this.consumeResults();
        this.syncUnitFx();
        if (b.phase !== before)
            this.onPhaseChange(before, b.phase);
        if (b.phase === 'result' && !this.resultApplied)
            this.finishMatch();
        // 雾气散开时给一点光尘，保持场景“活”（确定性：不用 Math.random）
        if (b.phase === 'observe') {
            var beat = (this.time / 250) % 1;
            if (beat < 0.06) {
                var j = (this.time * 0.618) % 1;
                var k = (this.time * 0.37) % 1;
                this.fx.dust(layout_1.LAYOUT.BOARD.x + 40 + j * (layout_1.LAYOUT.BOARD.w - 80), 90 + k * 130, 1);
            }
        }
    };
    /* ------------------------------------------------------------------ */
    /* 指令与演出                                                          */
    /* ------------------------------------------------------------------ */
    /** 仅 dev 入口执行：自动布阵、自动确认、压缩阶段时长，两回合后直接进结算。 */
    MatchScene.prototype.devStep = function (b) {
        if (this.devStage === 0 && b.time >= 400) {
            this.devStage = 1;
            var bench = b.player.bench;
            var placed = 0;
            for (var i = 0; i < bench.length && placed < 4; i++) {
                var u = bench[i];
                if (!u)
                    continue;
                this.push({ type: 'Deploy', faction: 'player', unitId: u.id, anchor: placed * 2 });
                placed++;
            }
        }
        if (this.devPhase !== b.phase) {
            this.devPhase = b.phase;
            this.devConfirmDone = false;
        }
        if (b.phase === 'deploy') {
            if (b.phaseLeft > 6000)
                b.phaseLeft = 6000;
            if (b.phaseLeft < 1000 && !this.devConfirmDone) {
                this.devConfirmDone = true;
                this.push({ type: 'ConfirmDeploy', faction: 'player' });
            }
        }
        if (b.phase === 'observe' && b.phaseLeft > 2000)
            b.phaseLeft = 2000;
        if (b.phase === 'battle') {
            if (b.round >= 2)
                b.round = 8;
            if (b.phaseLeft > 6000)
                b.phaseLeft = 6000;
        }
        if (b.phase === 'settle') {
            var cap = b.round >= 8 ? 600 : 1000;
            if (b.phaseLeft > cap)
                b.phaseLeft = cap;
        }
        if (b.phase === 'market') {
            if (this.devMarketBuy !== b.round) {
                this.devMarketBuy = b.round;
                this.push({ type: 'Buy', faction: 'player', slot: 0 });
            }
            if (b.phaseLeft > 4000)
                b.phaseLeft = 4000;
            if (b.phaseLeft < 1200 && !this.devConfirmDone) {
                this.devConfirmDone = true;
                this.push({ type: 'ConfirmDeploy', faction: 'player' });
            }
        }
    };
    MatchScene.prototype.push = function (cmd) {
        if (!this.battle)
            return;
        this.queue.push(cmd, this.battle.time, 'player');
    };
    MatchScene.prototype.consumeResults = function () {
        for (var i = 0; i < this.results.length; i++) {
            var r = this.results[i];
            if (!r.ok) {
                (0, audio_1.playSfx)('reject');
                this.rejectAt = this.time;
                this.showToast(reasonText(r.reason), 1600);
                continue;
            }
            var f = r.fx;
            if (f === 'card-fly')
                (0, audio_1.playSfx)('cardPick');
            else if (f === 'buff-wrap')
                (0, audio_1.playSfx)('combine');
            else if (f === 'combine-bloom') {
                (0, audio_1.playSfx)('combine');
                this.fx.petals(640, 300, 4);
            }
            else if (f === 'command-fly')
                (0, audio_1.playSfx)('command');
            else if (f === 'reject')
                (0, audio_1.playSfx)('reject');
            else
                (0, audio_1.playSfx)('tap');
        }
        this.results.length = 0;
    };
    /** 对比上一帧的 HP/存活，生成命中、治疗、死亡演出（渲染层只读事件）。 */
    MatchScene.prototype.syncUnitFx = function () {
        var b = this.battle;
        if (!b)
            return;
        for (var f = 0; f < 2; f++) {
            var fac = f === 0 ? 'player' : 'enemy';
            var units = (0, setup_1.side)(b, fac).units;
            for (var i = 0; i < units.length; i++) {
                var u = units[i];
                var key = '' + u.id;
                var prev = this.prevHp[key];
                var wasAlive = this.prevAlive[key];
                var p = this.unitPixel(u);
                if (prev !== undefined && u.hp < prev && wasAlive !== false) {
                    var dmg = prev - u.hp;
                    this.fx.damage(p.x, p.y - (0, unit_1.speciesBodyRadius)(u.species) - 10, dmg, {
                        counter: u.fx.counterHit > 0,
                        crit: dmg > u.maxHp * 0.18,
                        source: u.bleedSource
                    });
                    this.fx.hitLeaves(p.x, p.y, u.facing, 2);
                    this.fx.slashArc(p.x, p.y, u.facing);
                    if (b.phase === 'battle') {
                        (0, audio_1.playSfx)('hit');
                        this.fx.shake(dmg > u.maxHp * 0.2 ? 5 : 3);
                    }
                }
                else if (prev !== undefined && u.hp > prev) {
                    this.fx.heal(p.x, p.y - (0, unit_1.speciesBodyRadius)(u.species) - 12, u.hp - prev);
                }
                if (prev !== undefined && u.shield > 0 && u.fx.shieldRipple > 0) {
                    this.fx.shield(p.x, p.y, u.shield);
                }
                if (wasAlive === true && !u.alive) {
                    this.fx.fireflyBurst(p.x, p.y - (0, unit_1.speciesBodyRadius)(u.species), 3);
                    (0, audio_1.playSfx)('death');
                    this.fx.shake(4);
                }
                this.prevHp[key] = u.hp;
                this.prevAlive[key] = u.alive;
            }
        }
    };
    MatchScene.prototype.captureSnapshot = function () {
        var b = this.battle;
        if (!b)
            return;
        this.prevHp = {};
        this.prevAlive = {};
        for (var f = 0; f < 2; f++) {
            var units = (0, setup_1.side)(b, f === 0 ? 'player' : 'enemy').units;
            for (var i = 0; i < units.length; i++) {
                var u = units[i];
                this.prevHp['' + u.id] = u.hp;
                this.prevAlive['' + u.id] = u.alive;
            }
        }
    };
    MatchScene.prototype.onPhaseChange = function (from, to) {
        var b = this.battle;
        if (!b)
            return;
        this.fx.clearMoss();
        this.selectedUnit = -1;
        this.drag = null;
        this.handDrag = null;
        if (to === 'deploy') {
            this.showToast('第 ' + b.round + ' 回合 · 布阵 ' + Math.round(timing_1.TIMING.DEPLOY_RN / 1000) + 's', 2200);
        }
        else if (to === 'observe') {
            (0, audio_1.playSfx)('tap');
            this.enemyGhost = null;
            this.showToast('观测 4s · 看清对手与克制关系（不可操作）', 2200);
        }
        else if (to === 'battle') {
            (0, audio_1.playSfx)('land');
            this.showToast('战斗开始！点选我方动物 → 点敌方目标 下达集火', 2600);
        }
        else if (to === 'settle') {
            var win = b.player.houseHp < this.housePrev;
            (0, audio_1.playSfx)(win ? 'roundLose' : 'roundWin');
            this.housePrev = b.player.houseHp;
            this.captureSnapshot();
        }
        else if (to === 'market') {
            this.enemyGhost = this.ghostFromLastRound();
            (0, audio_1.playSfx)('tap');
            this.showToast('集市 ' + Math.round(timing_1.TIMING.MARKET / 1000) + 's · 买卡 / 刷新 / 合成', 2200);
        }
        else if (to === 'result') {
            this.resultApplied = false;
        }
    };
    MatchScene.prototype.finishMatch = function () {
        var b = this.battle;
        if (!b)
            return;
        this.resultApplied = true;
        var outcome = b.outcome || 'draw';
        var win = outcome === 'win';
        var draw = outcome === 'draw';
        this.coinGain = win ? economy_1.ECONOMY.REWARD_WIN_COINS : draw ? economy_1.ECONOMY.REWARD_DRAW_COINS : economy_1.ECONOMY.REWARD_LOSE_COINS;
        this.starGain = win ? economy_1.ECONOMY.REWARD_WIN_STARS : 0;
        var seen = [];
        for (var f = 0; f < 2; f++) {
            var s = (0, setup_1.side)(b, f === 0 ? 'player' : 'enemy');
            for (var i = 0; i < s.units.length; i++)
                pushUnique(seen, s.units[i].species);
            for (var i = 0; i < s.bench.length; i++) {
                var u = s.bench[i];
                if (u)
                    pushUnique(seen, u.species);
            }
        }
        (0, storage_1.applyMatchResult)(outcome, this.coinGain, this.starGain, seen);
        (0, audio_1.playSfx)(win ? 'victory' : draw ? 'tap' : 'defeat');
        this.showToast(win ? '胜利！' : draw ? '平局' : '惜败', 2000);
    };
    MatchScene.prototype.showToast = function (text, ms) {
        this.toast = text;
        this.toastUntil = this.time + ms;
    };
    /* ------------------------------------------------------------------ */
    /* 手势 → Command                                                      */
    /* ------------------------------------------------------------------ */
    MatchScene.prototype.gesture = function (e) {
        var b = this.battle;
        if (!b)
            return;
        if (this.showSettings && e.type === 'up' && !e.wasDrag) {
            this.gestureSettings(e.x, e.y);
            return;
        }
        if (b.phase === 'result') {
            if (e.type === 'up' && !e.wasDrag)
                this.gestureResult(e.x, e.y);
            return;
        }
        if (e.type === 'down') {
            this.pressed = this.hitButton(e.x, e.y);
            if (!this.pressed)
                this.prepareDrag(e.x, e.y);
            return;
        }
        if (e.type === 'dragStart') {
            this.beginDrag(e.x, e.y);
            return;
        }
        if (e.type === 'move') {
            if (this.drag) {
                this.drag.x = e.x;
                this.drag.y = e.y;
                this.updateDragTarget();
            }
            else if (this.handDrag) {
                this.handDrag.x = e.x;
                this.handDrag.y = e.y;
                this.handDrag.hoverUnit = this.unitAtPixel(e.x, e.y);
            }
            return;
        }
        if (e.type === 'up') {
            if (this.drag) {
                this.commitDrag(e.x, e.y, e.wasDrag);
                return;
            }
            if (this.handDrag) {
                this.commitHandDrag(e.x, e.y);
                return;
            }
            if (!e.wasDrag)
                this.onTap(e.x, e.y);
            else if (this.showWarbook)
                this.showWarbook = false;
            this.pressed = '';
            return;
        }
        if (e.type === 'cancel') {
            this.drag = null;
            this.handDrag = null;
            this.pressed = '';
        }
    };
    MatchScene.prototype.hitButton = function (x, y) {
        var b = this.battle;
        if (!b)
            return '';
        if (this.showWarbook)
            return (0, match_layout_1.inRect)((0, match_layout_1.warbookRect)(), x, y) ? 'warbook' : '';
        if (this.detailUnit >= 0) {
            for (var i = 0; i < 3; i++)
                if ((0, match_layout_1.inRect)((0, match_layout_1.detailButtonRect)(i), x, y))
                    return 'detailBtn' + i;
            return (0, match_layout_1.inRect)((0, match_layout_1.detailRect)(), x, y) ? 'detail' : '';
        }
        if ((0, match_layout_1.inRect)((0, match_layout_1.gearRect)(), x, y))
            return 'gear';
        if ((0, match_layout_1.inRect)((0, match_layout_1.scrollRect)(), x, y))
            return 'scroll';
        if (b.phase === 'market') {
            if ((0, match_layout_1.inRect)((0, match_layout_1.refreshRect)(), x, y))
                return 'refresh';
            if ((0, match_layout_1.inRect)((0, match_layout_1.giftRect)(), x, y))
                return 'gift';
        }
        if (b.phase === 'deploy' || b.phase === 'market') {
            // 集市阶段的按钮画在 MARKET.ready（底板右上角），判定必须用同一个矩形，否则按钮点了没反应
            var rr = b.phase === 'market' ? match_layout_1.MARKET.ready : (0, match_layout_1.readyRect)();
            if ((0, match_layout_1.inRect)(rr, x, y))
                return 'ready';
        }
        return '';
    };
    MatchScene.prototype.prepareDrag = function (x, y) {
        // 手牌里的加成牌：按住即可拖（仍遵守长按起拖）
        var idx = (0, match_layout_1.handAt)(x, y);
        if (idx >= 0 && this.battle && idx < this.battle.player.hand.length) {
            this.drag = null;
            return;
        }
        this.drag = null;
    };
    MatchScene.prototype.beginDrag = function (x, y) {
        var b = this.battle;
        if (!b)
            return;
        var hidx = (0, match_layout_1.handAt)(x, y);
        if (hidx >= 0 && hidx < b.player.hand.length) {
            this.handDrag = { cardId: b.player.hand[hidx].id, x: x, y: y, hoverUnit: -1 };
            (0, audio_1.playSfx)('cardPick');
            return;
        }
        if (b.phase !== 'deploy' && b.phase !== 'market')
            return;
        var anchor = (0, match_layout_1.nearestPlayerAnchor)(x, y, layout_1.LAYOUT.GRID.cellW * 0.8);
        if (anchor >= 0) {
            var u = this.unitAtAnchor('player', anchor);
            if (u && u.alive) {
                this.drag = {
                    unitId: u.id, fromAnchor: anchor, fromBench: -1,
                    x: x,
                    y: y,
                    hover: anchor,
                    valid: true, overBench: -1, startedAt: this.time
                };
                (0, audio_1.playSfx)('tap');
                return;
            }
        }
        var slot = (0, match_layout_1.benchAt)(x, y);
        if (slot >= 0) {
            var u = b.player.bench[slot];
            if (u) {
                this.drag = {
                    unitId: u.id, fromAnchor: -1, fromBench: slot,
                    x: x,
                    y: y,
                    hover: -1,
                    valid: false, overBench: -1, startedAt: this.time
                };
                (0, audio_1.playSfx)('tap');
            }
        }
    };
    MatchScene.prototype.updateDragTarget = function () {
        var d = this.drag;
        var b = this.battle;
        if (!d || !b)
            return;
        d.hover = (0, match_layout_1.nearestPlayerAnchor)(d.x, d.y);
        d.overBench = (0, match_layout_1.benchAt)(d.x, d.y);
        var source = (0, setup_1.unitById)(b, d.unitId);
        d.valid = false;
        if (d.hover >= 0) {
            if (d.hover === d.fromAnchor)
                d.valid = true;
            else {
                var occupant = this.unitAtAnchor('player', d.hover);
                if (!occupant) {
                    var cap = (0, setup_1.deployCap)(b, 'player');
                    var onField = (0, setup_1.fieldUnits)(b, 'player').length;
                    d.valid = d.fromAnchor >= 0 || onField < cap;
                }
                else {
                    d.valid = true;
                }
            }
        }
        if (d.overBench >= 0 && d.fromAnchor >= 0)
            d.valid = true;
        void source;
    };
    MatchScene.prototype.commitDrag = function (x, y, wasDrag) {
        var b = this.battle;
        var d = this.drag;
        this.drag = null;
        if (!b || !d)
            return;
        if (d.overBench >= 0 && d.fromAnchor >= 0) {
            this.push({ type: 'Retreat', faction: 'player', unitId: d.unitId });
            (0, audio_1.playSfx)('land');
            return;
        }
        var anchor = (0, match_layout_1.nearestPlayerAnchor)(x, y);
        if (anchor < 0) {
            if (wasDrag)
                (0, audio_1.playSfx)('reject');
            this.fx.clearMoss();
            return;
        }
        var occupant = this.unitAtAnchor('player', anchor);
        if (d.fromAnchor < 0) {
            // 替补席 → 点位
            this.push({ type: 'Deploy', faction: 'player', unitId: d.unitId, anchor: anchor });
            (0, audio_1.playSfx)('land');
            this.fx.moss(this.anchorPixel(anchor).x, this.anchorPixel(anchor).y, (0, unit_1.speciesBodyRadius)(this.unitSpecies(d.unitId)) + 10);
            return;
        }
        if (anchor === d.fromAnchor) {
            this.fx.moss(this.anchorPixel(anchor).x, this.anchorPixel(anchor).y, 40);
            return;
        }
        if (occupant) {
            var a = (0, setup_1.unitById)(b, d.unitId);
            if (a && occupant.species === a.species && occupant.level === a.level && a.level < 3) {
                this.push({ type: 'Combine', faction: 'player', unitA: d.unitId, unitB: occupant.id });
                (0, audio_1.playSfx)('combine');
            }
            else {
                this.push({ type: 'Swap', faction: 'player', unitA: d.unitId, unitB: occupant.id });
                (0, audio_1.playSfx)('land');
            }
            return;
        }
        // 空点位：先收回再放下（core 只有 Deploy/Retreat 两种落位指令）
        this.push({ type: 'Retreat', faction: 'player', unitId: d.unitId });
        this.push({ type: 'Deploy', faction: 'player', unitId: d.unitId, anchor: anchor });
        (0, audio_1.playSfx)('land');
        var p = this.anchorPixel(anchor);
        this.fx.moss(p.x, p.y, (0, unit_1.speciesBodyRadius)(this.unitSpecies(d.unitId)) + 10);
    };
    MatchScene.prototype.commitHandDrag = function (x, y) {
        var h = this.handDrag;
        this.handDrag = null;
        if (!h)
            return;
        var target = this.unitAtPixel(x, y);
        if (target < 0) {
            (0, audio_1.playSfx)('reject');
            return;
        }
        this.push({ type: 'EquipBuff', faction: 'player', cardId: h.cardId, unitId: target });
        var p = this.unitPixelById(target);
        this.fx.petals(p.x, p.y, 3);
    };
    MatchScene.prototype.onTap = function (x, y) {
        var b = this.battle;
        if (!b)
            return;
        if (this.showWarbook) {
            this.showWarbook = false;
            return;
        }
        if (this.detailUnit >= 0) {
            this.gestureDetail(x, y);
            return;
        }
        var btn = this.hitButton(x, y);
        if (btn) {
            this.pressButton(btn);
            return;
        }
        var ent = (0, match_layout_1.entryAt)(x, y);
        if (ent) {
            var list = entryUnits(b, ent.faction, this.enemyGhost);
            if (ent.index < list.length) {
                if (ent.faction === 'player') {
                    this.detailUnit = list[ent.index];
                    (0, audio_1.playSfx)('tap');
                }
                else {
                    this.showToast(entryTip(list[ent.index]), 1500);
                }
            }
            return;
        }
        if (b.phase === 'market') {
            var slot = (0, match_layout_1.shelfAt)(x, y);
            if (slot >= 0) {
                var check = (0, shop_1.canBuy)(b, 'player', slot, false);
                if (check.ok) {
                    this.push(this.giftArmed ? { type: 'BuyGift', faction: 'player', slot: slot } : { type: 'Buy', faction: 'player', slot: slot });
                    this.giftArmed = false;
                    (0, audio_1.playSfx)('cardPick');
                }
                else {
                    this.rejectAt = this.time;
                    this.rejectCard = slot;
                    (0, audio_1.playSfx)('reject');
                    this.showToast(reasonText(check.reason), 1500);
                }
                return;
            }
            if ((0, match_layout_1.inRect)(match_layout_1.BOARD_RECT, x, y))
                this.showToast('拖动物调整阵型，或点右下刷新', 1200);
            return;
        }
        if (b.phase === 'battle') {
            var own = this.unitAtPixelFaction(x, y, 'player');
            if (own >= 0) {
                this.selectedUnit = this.selectedUnit === own ? -1 : own;
                (0, audio_1.playSfx)('tap');
                var u = (0, setup_1.unitById)(b, own);
                if (u && u.commandReadyAt > b.time) {
                    this.showToast('指挥冷却中 ' + Math.ceil((u.commandReadyAt - b.time) / 1000) + 's', 1200);
                }
                return;
            }
            if (this.selectedUnit >= 0) {
                var target = this.unitAtPixelFaction(x, y, 'enemy');
                if (target >= 0) {
                    var p = this.unitPixelById(this.selectedUnit);
                    var t = this.unitPixelById(target);
                    var label = '集火';
                    this.fx.bubble(p.x, p.y - 40, t.x, t.y - 20, label);
                    this.push({ type: 'CommandAttack', faction: 'player', unitId: this.selectedUnit, targetId: target });
                    this.selectedUnit = -1;
                    (0, audio_1.playSfx)('command');
                    return;
                }
                this.selectedUnit = -1;
            }
            return;
        }
        if (b.phase === 'deploy') {
            var own = this.unitAtPixelFaction(x, y, 'player');
            if (own >= 0) {
                this.detailUnit = own;
                (0, audio_1.playSfx)('tap');
            }
        }
    };
    MatchScene.prototype.pressButton = function (id) {
        var b = this.battle;
        if (!b)
            return;
        if (id === 'gear') {
            this.showSettings = true;
            (0, audio_1.playSfx)('tap');
        }
        else if (id === 'scroll') {
            this.showWarbook = true;
            (0, audio_1.playSfx)('tap');
        }
        else if (id === 'gift') {
            this.giftArmed = !this.giftArmed;
            (0, audio_1.playSfx)('tap');
            this.showToast(this.giftArmed ? '已选择免费赠礼：点一张卡免费拿走' : '取消免费赠礼', 1600);
        }
        else if (id === 'refresh') {
            this.push({ type: 'Refresh', faction: 'player' });
            (0, audio_1.playSfx)('refresh');
        }
        else if (id === 'ready') {
            this.push({ type: 'ConfirmDeploy', faction: 'player' });
            (0, audio_1.playSfx)('tap');
        }
    };
    MatchScene.prototype.gestureDetail = function (x, y) {
        var b = this.battle;
        if (!b)
            return;
        for (var i = 0; i < 3; i++) {
            if ((0, match_layout_1.inRect)((0, match_layout_1.detailButtonRect)(i), x, y)) {
                if (i === 0) {
                    // 卸下最后一张加成牌（详情页里逐个图标也能卸）
                    var u = (0, setup_1.unitById)(b, this.detailUnit);
                    if (u && u.buffs.length > 0) {
                        this.push({ type: 'RemoveBuff', faction: 'player', unitId: u.id, buffIndex: u.buffs.length - 1 });
                        (0, audio_1.playSfx)('tap');
                    }
                    else {
                        this.showToast('没有可卸下的加成', 1200);
                    }
                }
                else if (i === 1) {
                    var u = (0, setup_1.unitById)(b, this.detailUnit);
                    if (u) {
                        if (u.anchor >= 0)
                            this.showToast('场上单位请先收回替补席再卖出', 1500);
                        else {
                            this.push({ type: 'Sell', faction: 'player', unitId: u.id });
                            (0, audio_1.playSfx)('cardPick');
                            this.detailUnit = -1;
                        }
                    }
                }
                else {
                    this.detailUnit = -1;
                    (0, audio_1.playSfx)('tap');
                }
                return;
            }
        }
        this.detailUnit = -1;
    };
    MatchScene.prototype.gestureSettings = function (x, y) {
        var r = (0, match_layout_1.settingsRect)();
        if (!(0, match_layout_1.inRect)(r, x, y)) {
            this.showSettings = false;
            return;
        }
        // 三行开关 + 关闭
        var w = r.w - 80;
        var x0 = r.x + 40;
        for (var i = 0; i < 3; i++) {
            var y0 = r.y + 130 + i * 74;
            if (y >= y0 && y <= y0 + 56 && x >= x0 && x <= x0 + w) {
                (0, audio_1.playSfx)('tap');
                if (i === 0)
                    this.showToast('音效开关：设置页可切换（存档写入中）', 1400);
                if (i === 1)
                    this.showToast('返回营地', 900);
                if (i === 2) {
                    this.showSettings = false;
                    return;
                }
            }
        }
        if (y > r.y + r.h - 70)
            this.showSettings = false;
    };
    MatchScene.prototype.gestureResult = function (x, y) {
        for (var i = 0; i < 3; i++) {
            if ((0, match_layout_1.inRect)((0, match_layout_1.resultButtonRect)(i), x, y)) {
                (0, audio_1.playSfx)('tap');
                if (i === 0)
                    (0, manager_1.pop)();
                else if (i === 1) {
                    var seed = (this.opts.seed === undefined ? Date.now() : this.opts.seed + 1) % 100000;
                    this.opts = { seed: seed, difficulty: this.opts.difficulty };
                    this.resultApplied = false;
                    this.reportPage = 0;
                    this.enter();
                }
                else {
                    this.showToast('分享战绩（真机环境会唤起微信转发）', 1600);
                }
                return;
            }
        }
        if ((0, match_layout_1.inRect)((0, match_layout_1.reportArrowRect)(-1), x, y)) {
            this.reportPage = (this.reportPage + 2) % 3;
            (0, audio_1.playSfx)('tap');
        }
        else if ((0, match_layout_1.inRect)((0, match_layout_1.reportArrowRect)(1), x, y)) {
            this.reportPage = (this.reportPage + 1) % 3;
            (0, audio_1.playSfx)('tap');
        }
        else if (this.reportPage === 0) {
            var seg = this.segmentAt(x, y);
            if (seg) {
                this.expandedSeg = this.expandedSeg === seg ? '' : seg;
                (0, audio_1.playSfx)('tap');
            }
        }
        else if (this.reportPage === 2) {
            var idx = this.highlightAt(x, y);
            if (idx >= 0) {
                (0, audio_1.playSfx)('tap');
                this.showToast('高光回放 ' + (idx + 1) + ' · 1.5s（用确定性 state + 命令流重演）', 1800);
            }
        }
    };
    /* ------------------------------------------------------------------ */
    /* 命中测试小工具                                                      */
    /* ------------------------------------------------------------------ */
    MatchScene.prototype.unitSpecies = function (id) {
        var b = this.battle;
        if (!b)
            return 'mouse';
        var u = (0, setup_1.unitById)(b, id);
        return u ? u.species : 'mouse';
    };
    MatchScene.prototype.unitAtAnchor = function (faction, anchor) {
        var b = this.battle;
        if (!b)
            return null;
        var units = (0, setup_1.side)(b, faction).units;
        for (var i = 0; i < units.length; i++) {
            if (units[i].anchor === anchor && units[i].alive && !units[i].isDecoy)
                return units[i];
        }
        return null;
    };
    MatchScene.prototype.unitAtPixel = function (x, y) {
        var b = this.battle;
        if (!b)
            return -1;
        var a = this.unitAtPixelFaction(x, y, 'player');
        if (a >= 0)
            return a;
        return this.unitAtPixelFaction(x, y, 'enemy');
    };
    MatchScene.prototype.unitAtPixelFaction = function (x, y, faction) {
        var b = this.battle;
        if (!b)
            return -1;
        var visible = this.enemyVisible();
        if (faction === 'enemy' && !visible)
            return -1;
        var units = (0, setup_1.side)(b, faction).units;
        var best = -1;
        var bestD = 1e9;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u.alive || u.anchor < 0 || u.isDecoy)
                continue;
            var p = this.unitPixel(u);
            var r = (0, unit_1.speciesBodyRadius)(u.species) + 10;
            var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
            if (d <= r * r && d < bestD) {
                bestD = d;
                best = u.id;
            }
        }
        return best;
    };
    MatchScene.prototype.unitPixel = function (u) {
        var g = layout_1.LAYOUT.GRID;
        var depthRow = (g.rows - 1 - (u.pos.y - 0.5)) / (g.rows - 1);
        var squash = 1 - layout_1.LAYOUT.PERSPECTIVE * clamp(depthRow, 0, 1);
        return {
            x: g.originX + u.pos.x * g.cellW,
            y: g.originY + u.pos.y * g.cellH * squash + (1 - squash) * 40
        };
    };
    MatchScene.prototype.unitPixelById = function (id) {
        var b = this.battle;
        if (!b)
            return { x: -999, y: -999 };
        var u = (0, setup_1.unitById)(b, id);
        return u ? this.unitPixel(u) : { x: -999, y: -999 };
    };
    MatchScene.prototype.anchorPixel = function (anchor) {
        var cr = (0, setup_1.anchorColRow)(anchor);
        if (cr.col < 0)
            return { x: -999, y: -999 };
        return (0, layout_1.anchorToPixel)(cr.col, cr.row);
    };
    MatchScene.prototype.enemyVisible = function () {
        var b = this.battle;
        if (!b)
            return false;
        return b.phase === 'observe' || b.phase === 'battle' || b.phase === 'settle' || b.phase === 'result';
    };
    MatchScene.prototype.ghostFromLastRound = function () {
        var b = this.battle;
        if (!b || b.log.length === 0)
            return null;
        var last = b.log[b.log.length - 1];
        var out = [];
        for (var i = 0; i < last.enemyUnits.length && i < 6; i++) {
            var lu = last.enemyUnits[i];
            out.push({
                species: lu.species, level: lu.level, hp: lu.hpMax, maxHp: lu.hpMax,
                statuses: [], empty: false, ghost: true
            });
        }
        return out;
    };
    MatchScene.prototype.segmentAt = function (x, y) {
        var pages = this.buildReport();
        var segs = pages[0].segments || [];
        var r = DAMAGE_STACK;
        if (!(0, match_layout_1.inRect)(r, x, y))
            return null;
        var cx = r.x + 8;
        for (var i = 0; i < segs.length; i++) {
            var w = 60;
            if (x >= cx && x <= cx + w)
                return segs[i].key;
            cx += w + 6;
        }
        return null;
    };
    /**
     * 盖住底板两侧烘焙的「镜像补边」条纹。
     *
     * 战场/布阵底板两侧的条纹是旧管线把镜像补边烘进图里留下的，1280 基准下正好压在
     * 代码画的侧栏木框后面，宽屏（padX>0）侧栏外移后就会露出来。这里用底板自身最外侧
     * 的 AI 森林（阔图多出来的 192px）横向拉伸铺满那两条，并把靠画面中央的一侧按 10 级
     * alpha 羽化，边界不会出现硬直边，读起来仍是连续树林。
     */
    MatchScene.prototype.hideBakedSideBands = function (ctx, plate, t) {
        if (!plate)
            return;
        var box = (0, screen_1.sceneBox)();
        var H = layout_1.LAYOUT.SCREEN_H;
        var iw = plate.width || 1664;
        var band = Math.min(192, Math.round(iw * 0.115));
        var leftEnd = 292;
        var rightStart = 988;
        if (leftEnd - box.x > 0) {
            this.drawBandSlices(ctx, plate, 0, band, box.x, leftEnd - box.x, H, 1);
        }
        var rw = box.x + box.w - rightStart;
        if (rw > 0) {
            this.drawBandSlices(ctx, plate, iw - band, band, rightStart, rw, H, -1);
        }
    };
    /** 把一段森林原画按 10 级 alpha 铺开：外缘不透明，靠画面中央的一侧逐渐淡出。 */
    MatchScene.prototype.drawBandSlices = function (ctx, img, sx, sw, dx, dw, dh, dir) {
        var N = 12;
        ctx.save();
        for (var i = 0; i < N; i++) {
            var t0 = i / N;
            var t1 = (i + 1) / N;
            var w = dw * (t1 - t0);
            var x = dir > 0 ? dx + dw * t0 : dx + dw * (1 - t1);
            // 前 70% 完全盖住条纹，最后 30% 才淡出，和底板草甸接上
            ctx.globalAlpha = i < 7 ? 1 : [0.74, 0.5, 0.32, 0.18, 0.1][i - 7];
            ctx.drawImage(img, sx + sw * t0, 0, sw * (t1 - t0), img.height || 720, x, 0, w + 1, dh);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    };
    MatchScene.prototype.highlightAt = function (x, y) {
        var pages = this.buildReport();
        var items = pages[2].highlights || [];
        var r = { x: 380, y: 300, w: 520, h: 150 };
        if (!(0, match_layout_1.inRect)(r, x, y))
            return -1;
        var w = Math.min(160, r.w / Math.max(1, items.length));
        var idx = Math.floor((x - r.x) / (w + 12));
        return idx >= 0 && idx < items.length ? idx : -1;
    };
    /* ------------------------------------------------------------------ */
    /* 渲染                                                                */
    /* ------------------------------------------------------------------ */
    MatchScene.prototype.render = function (ctx, renderTime) {
        var b = this.battle;
        var w = layout_1.LAYOUT.SCREEN_W;
        var h = layout_1.LAYOUT.SCREEN_H;
        if (!b)
            return;
        var shake = this.fx.shakeOffset(renderTime);
        ctx.save();
        ctx.translate(shake.x, shake.y);
        // 布阵阶段用带晨雾的底板（雾已烘在图里，敌半场不可见）；集市阶段用集市底板；结算用结算底板；其余用干净战场底板。
        var marketPlate = b.phase === 'market' ? (0, assets_1.getImage)('ui-market') : null;
        var resultPlate = b.phase === 'result' ? (0, assets_1.getImage)('ui-result-victory') : null;
        var plate = (b.phase === 'deploy' ? (0, assets_1.getImage)('ui-deploy-fog') : null) || marketPlate || resultPlate || (0, assets_1.getImage)('bg-board-plain');
        if (plate) {
            (0, screen_1.drawPlateCover)(ctx, plate, 0, 0, w, h);
            // 结算底板只有胜利版一张（男孩举奖杯的庆祝插画）：败 / 平时压一层冷色水彩罩，
            // 让画面读起来是「惜败」而不是「夺冠」；我们自己的 HUD 随后画在罩子之上，不受影响。
            if (resultPlate && b.outcome !== 'win') {
                var veil = b.outcome === 'draw' ? 0.26 : 0.4;
                (0, brush_1.fillWatercolor)(ctx, (0, screen_1.sceneCorners)(), palette_1.PALETTE.forestDeep, { alpha: veil, layers: 1, wetEdge: false, seedIndex: 41 });
            }
        }
        else {
            // 自适应全屏：程序化底板也要铺满逻辑可视区
            var box = (0, screen_1.sceneBox)();
            ctx.save();
            ctx.translate(box.x, box.y);
            (0, forest_1.drawSky)(ctx, box.w, box.h, renderTime);
            (0, forest_1.drawForestLayer)(ctx, box.w, box.h, 0, 'far', renderTime);
            (0, forest_1.drawForestLayer)(ctx, box.w, box.h, 0, 'mid', renderTime);
            ctx.restore();
            (0, board_1.drawBoard)(ctx, renderTime, { fog: b.phase === 'deploy' || b.phase === 'market' ? 1 : 0.3 });
            ctx.save();
            ctx.translate(box.x, box.y);
            (0, forest_1.drawForestLayer)(ctx, box.w, box.h, 0, 'near', renderTime);
            ctx.restore();
        }
        // 旧战场/布阵底板的两侧烘死了「镜像补边」条纹（从美术图裁出来时就带上了）：
        // 1280 基准下它们正好压在代码画的侧栏木框之后，宽屏把侧栏推到屏幕两边后就会露出来。
        // 这里用同一套程序化森林按不规则水彩轮廓盖住那两条，和底板中央的草甸自然相接。
        if (plate && plate !== marketPlate && plate !== resultPlate) {
            this.hideBakedSideBands(ctx, plate, renderTime);
        }
        // 统一色grading：一层薄薄的深绿 + 顶部暖光，抵消水彩层的低饱和（不覆盖单位）
        if (!plate) {
            (0, brush_1.fillWatercolor)(ctx, (0, screen_1.sceneCorners)(), palette_1.PALETTE.leafMid, { alpha: 0.11, layers: 1, wetEdge: false, seedIndex: 8 });
            (0, brush_1.fillWatercolor)(ctx, [
                { x: -20, y: -10 },
                { x: w + 20, y: -10 },
                { x: w + 20, y: h * 0.34 },
                { x: -20, y: h * 0.34 },
            ], palette_1.PALETTE.sunbeam, { alpha: 0.07, layers: 1, wetEdge: false, seedIndex: 9 });
        }
        this.fx.draw(ctx, renderTime, 'back');
        if (!resultPlate) {
            if (!marketPlate)
                this.drawCoaches(ctx, renderTime);
            this.drawField(ctx, renderTime);
            this.fx.draw(ctx, renderTime, 'front');
            this.drawForeground(ctx, renderTime, w);
            (0, forest_1.drawSunSpecks)(ctx, w, h, renderTime, b.phase === 'battle' ? 1.4 : 1);
            if (b.weather.player.active !== 'none') {
                (0, forest_1.drawWeather)(ctx, w, h, b.weather.player.active, renderTime, b.phase === 'battle' ? 1 : 0.7);
            }
        }
        {
            var vbox = (0, screen_1.sceneBox)();
            ctx.save();
            ctx.translate(vbox.x, vbox.y);
            (0, forest_1.drawVignette)(ctx, vbox.w, vbox.h);
            ctx.restore();
        }
        ctx.restore();
        var overlay = !!(marketPlate || resultPlate);
        if (!overlay) {
            this.drawSidebars(ctx, renderTime);
            this.drawBench(ctx, renderTime);
        }
        if (b.phase === 'market')
            this.drawShelf(ctx, renderTime);
        if (!resultPlate) {
            this.drawHand(ctx, renderTime);
            this.drawBanner(ctx, renderTime);
        }
        if (marketPlate) {
            // 集市底板已烘死齿轮、阳光币条、圆牌与本轮赠礼牌：用程序化件按原坐标盖住并接管数值。
            var sr = match_layout_1.MARKET.sunRect;
            (0, ui_1.drawWoodPanel)(ctx, sr.x, sr.y, sr.w, sr.h, { tone: 'bark', radius: layout_1.LAYOUT.PANEL_RADIUS });
            (0, ui_1.drawSunCoin)(ctx, sr.x + 14, sr.y + 12, 60, b.player.sunlight, renderTime);
            (0, ui_1.drawGear)(ctx, match_layout_1.MARKET.gear.x, match_layout_1.MARKET.gear.y, match_layout_1.MARKET.gear.size, this.pressed === 'gear');
        }
        else if (!resultPlate) {
            // 小屋血量牌放在 HUD 层绘制：场景层内部有未回收的画布变换，会把文字画倒。
            (0, board_1.drawHouseHp)(ctx, (0, match_layout_1.houseRect)().x, (0, match_layout_1.houseRect)().y, (0, match_layout_1.houseRect)().w, (0, match_layout_1.houseRect)().h, b.player.houseHp, b.player.houseHpMax);
        }
        this.drawDragLayer(ctx, renderTime);
        this.drawPanels(ctx, renderTime);
        this.drawToastLayer(ctx);
    };
    MatchScene.prototype.drawCoaches = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        var coachState = b.phase === 'battle' ? 'idle' : b.phase === 'settle' ? 'proud' : 'idle';
        var cr = (0, match_layout_1.coachRect)();
        (0, sidebar_1.drawCoachAvatar)(ctx, cr.x, cr.y, cr.w, coachState, renderTime);
        var callout = { x: match_layout_1.BOARD_RECT.x + 96, y: 596 };
        (0, coach_1.drawCoach)(ctx, callout.x, callout.y, coachState, renderTime);
        var ir = (0, match_layout_1.impRect)();
        var impState = b.phase === 'battle' ? 'idle' : b.phase === 'settle' ? 'hurt' : 'idle';
        (0, imp_1.drawImp)(ctx, ir.x + ir.w / 2, ir.y + ir.h, impState, renderTime);
    };
    MatchScene.prototype.drawField = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        var visible = this.enemyVisible();
        var list = [];
        var pu = (0, setup_1.fieldUnits)(b, 'player');
        for (var i = 0; i < pu.length; i++)
            list.push(pu[i]);
        if (visible) {
            var eu = (0, setup_1.fieldUnits)(b, 'enemy');
            for (var i = 0; i < eu.length; i++)
                list.push(eu[i]);
        }
        list.sort(function (a, c) { return a.pos.y - c.pos.y; });
        for (var i = 0; i < list.length; i++) {
            var u = list[i];
            if (!u.alive)
                continue;
            if (this.drag && this.drag.unitId === u.id)
                continue;
            var p = this.unitPixel(u);
            var isSelected = this.selectedUnit === u.id;
            var dim = this.selectedUnit >= 0 && !isSelected && u.owner === 'player';
            var view = {
                id: u.id, species: u.species, level: u.level, hp: u.hp, maxHp: u.maxHp,
                shield: u.shield, alive: u.alive,
                fx: {
                    hitFlash: u.fx.hitFlash, attackPulse: u.fx.attackPulse, deathFirefly: u.fx.deathFirefly,
                    counterHit: u.fx.counterHit, shieldRipple: u.fx.shieldRipple, hitDir: u.fx.hitDir
                }
            };
            (0, unit_1.drawUnit)(ctx, view, {
                x: p.x, y: p.y, time: renderTime, facing: u.facing, showRing: true,
                selected: isSelected,
                dim: dim,
                statuses: statusTags(u),
                commandTarget: u.forcedTargetId >= 0 || (this.selectedUnit >= 0 && this.selectedUnit === u.id)
            });
            // 核心写的一次性演出标记：渲染消费后清零（render 只读 state，但清标记是约定）
            u.fx.hitFlash = 0;
            u.fx.counterHit = 0;
            u.fx.shieldRipple = 0;
            u.fx.attackPulse = 0;
        }
        // 集火目标：血量环外 berry 断续虚线环
        for (var i = 0; i < list.length; i++) {
            var u = list[i];
            if (!u.alive || u.forcedTargetId < 0)
                continue;
            var t = (0, setup_1.unitById)(b, u.forcedTargetId);
            if (!t || !t.alive)
                continue;
            var p = this.unitPixel(t);
            var r = (0, unit_1.speciesBodyRadius)(t.species) + layout_1.LAYOUT.RING.gap + 5;
            (0, hpring_1.drawHpRing)(ctx, p.x, p.y, r, t.hp / Math.max(1, t.maxHp), {
                time: renderTime, commandTarget: true, width: 3, notch: false, alpha: 0.9
            });
        }
    };
    MatchScene.prototype.drawForeground = function (ctx, renderTime, w) {
        var y = layout_1.LAYOUT.BOARD.y + layout_1.LAYOUT.BOARD.h - 12;
        ctx.save();
        for (var i = 0; i < 26; i++) {
            var x = layout_1.LAYOUT.BOARD.x + (i / 25) * layout_1.LAYOUT.BOARD.w;
            (0, paint_1.drawGrassTuft)(ctx, x, y + ((i % 3) - 1) * 4, 16 + (i % 5) * 3, renderTime, i);
        }
        ctx.restore();
        void w;
    };
    MatchScene.prototype.drawSidebars = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        var gearPressed = this.pressed === 'gear';
        var gr = (0, match_layout_1.gearRect)();
        (0, ui_1.drawGear)(ctx, gr.x, gr.y, gr.w, gearPressed);
        var sr = (0, match_layout_1.scrollRect)();
        (0, sidebar_1.drawScrollButton)(ctx, sr.x, sr.y, sr.w, this.pressed === 'scroll', renderTime);
        // 两侧木质挂条（对齐参考图：条目坐在木条上，而不是浮在森林里）
        var pl = (0, match_layout_1.entryPanelRect)('player');
        var pe = (0, match_layout_1.entryPanelRect)('enemy');
        (0, ui_1.drawWoodPanel)(ctx, pl.x, pl.y, pl.w, pl.h, { tone: 'bark', radius: 18, alpha: 0.9, seedIndex: 501 });
        (0, ui_1.drawWoodPanel)(ctx, pe.x, pe.y, pe.w, pe.h, { tone: 'bark', radius: 18, alpha: 0.9, seedIndex: 502 });
        var myEntries = entryViews(b, 'player', false);
        for (var i = 0; i < 6; i++) {
            var r = (0, match_layout_1.entryRect)('player', i);
            var e = i < myEntries.length ? myEntries[i] : emptyEntry();
            (0, sidebar_1.drawSideEntry)(ctx, r.x, r.y, r.w, r.h, e, { faction: 'player', time: renderTime, index: i });
        }
        var enemyEntries = entryViews(b, 'enemy', !this.enemyVisible(), this.enemyGhost);
        for (var i = 0; i < 6; i++) {
            var r = (0, match_layout_1.entryRect)('enemy', i);
            var e = i < enemyEntries.length ? enemyEntries[i] : emptyEntry();
            (0, sidebar_1.drawSideEntry)(ctx, r.x, r.y, r.w, r.h, e, { faction: 'enemy', time: renderTime, index: i });
        }
        var sc = (0, match_layout_1.sunCoinRect)();
        (0, ui_1.drawSunCoin)(ctx, sc.x, sc.y, sc.w, b.player.sunlight, renderTime);
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.coin, 'bold');
        ctx.fillStyle = palette_1.PALETTE.creamMist;
        ctx.textAlign = 'left';
        ctx.fillText('' + b.player.sunlight, sc.x - 44, sc.y + 38);
        // 本回合天气（小溪上空两枚图标碰撞的静态版：显示已生效结果）
        if (b.weatherText) {
            (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'normal');
            ctx.textAlign = 'center';
            ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.9);
            ctx.fillText(b.weatherText, layout_1.LAYOUT.SCREEN_W / 2, 96);
        }
    };
    MatchScene.prototype.drawBench = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        var narrow = b.phase === 'battle' || b.phase === 'observe' || b.phase === 'settle';
        var r0 = (0, match_layout_1.benchRect)(0, narrow);
        var total = layout_1.LAYOUT.BENCH.slots * layout_1.LAYOUT.BENCH.cell + (layout_1.LAYOUT.BENCH.slots - 1) * layout_1.LAYOUT.BENCH.gap;
        // 替补席木质底板
        (0, ui_1.drawWoodPanel)(ctx, r0.x - 12, r0.y - 10, total + 24, r0.h + 20, {
            tone: 'bark', radius: 16, alpha: 0.92, seedIndex: 503
        });
        var slots = [];
        for (var i = 0; i < layout_1.LAYOUT.BENCH.slots; i++) {
            var u = b.player.bench[i];
            slots.push(u ? unitCardView(u) : null);
        }
        (0, sidebar_1.drawBench)(ctx, r0.x, r0.y, total, r0.h, slots, {
            time: renderTime,
            narrow: narrow,
            dragHoverIndex: this.drag && this.drag.overBench >= 0 ? this.drag.overBench : -1
        });
    };
    MatchScene.prototype.drawHand = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        for (var i = 0; i < b.player.hand.length && i < 5; i++) {
            var c = b.player.hand[i];
            if (this.handDrag && this.handDrag.cardId === c.id)
                continue;
            var r = (0, match_layout_1.handRect)(i);
            (0, card_1.drawCard)(ctx, cardViewFromInstance(c), r.x, r.y, { time: renderTime, scale: r.w / layout_1.LAYOUT.CARD.w });
        }
    };
    MatchScene.prototype.drawShelf = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        // 每格一块与底板同色的木底，盖掉烘死的样例卡；空位内嵌浅色纸面
        for (var i = 0; i < 5; i++) {
            var r = (0, match_layout_1.shelfRect)(i);
            (0, ui_1.drawWoodPanel)(ctx, r.x, r.y, r.w, r.h, { tone: 'bark', radius: 20 });
            var slot = b.shelf[i];
            if (!slot || !slot.card || slot.taken) {
                (0, brush_1.strokeInk)(ctx, (0, brush_1.roundedRectPoints)(r.x + 20, r.y + 20, r.w - 40, r.h - 40, 14), {
                    width: 2, close: true, color: (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.22), seedIndex: 700 + i, jitter: 1.6
                });
                (0, theme_1.setFont)(ctx, 22, 'normal');
                ctx.textAlign = 'center';
                ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.42);
                ctx.fillText('空摊位', r.x + r.w / 2, r.y + r.h / 2 + 8);
                continue;
            }
            var check = (0, shop_1.canBuy)(b, 'player', i, false);
            var cw = r.w - 10;
            var ch = cw * (layout_1.LAYOUT.CARD.h / layout_1.LAYOUT.CARD.w);
            (0, card_1.drawCard)(ctx, cardViewFromInstance(slot.card), r.x + 5, r.y + (r.h - ch) / 2, {
                time: renderTime, affordable: check.ok, scale: cw / layout_1.LAYOUT.CARD.w,
                pressed: this.rejectCard === i && this.time - this.rejectAt < 400
            });
        }
        // 刷新圆牌（底板上烘死的绿圆牌先被一块木底盖住）
        var rr = (0, match_layout_1.refreshRect)();
        var pad = 12;
        (0, ui_1.drawWoodPanel)(ctx, rr.x - pad, rr.y - pad, rr.w + pad * 2, rr.h + pad * 2, {
            tone: 'bark', radius: (rr.w + pad * 2) / 2
        });
        drawWoodSignCircle(ctx, rr.x, rr.y, rr.w, '刷新 · ' + (0, shop_1.refreshCost)(b), b.refreshUsed >= economy_1.ECONOMY.REFRESH_LIMIT, renderTime);
        // 免费赠礼（对齐底板烘死的双行木牌）
        var gr = (0, match_layout_1.giftRect)();
        ctx.save();
        if (this.giftArmed)
            ctx.translate(0, 3);
        (0, ui_1.drawWoodPanel)(ctx, gr.x, gr.y, gr.w, gr.h, { tone: 'bark', radius: layout_1.LAYOUT.BUTTON_RADIUS });
        if (b.giftUsed) {
            (0, theme_1.textOutlined)(ctx, '本回合已领', gr.x + gr.w / 2, gr.y + gr.h * 0.57, 20, (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.6), 'center', 1.6);
        }
        else {
            (0, theme_1.textOutlined)(ctx, '本轮免费赠礼', gr.x + gr.w / 2, gr.y + 32, 19, palette_1.PALETTE.inkSoft, 'center', 1.8);
            (0, theme_1.textOutlined)(ctx, '1 张', gr.x + gr.w / 2, gr.y + 68, 26, palette_1.PALETTE.forestDeep, 'center', 2);
        }
        ctx.restore();
    };
    MatchScene.prototype.drawBanner = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        var r = b.phase === 'market' ? match_layout_1.MARKET.banner : match_layout_1.BANNER_RECT;
        var phaseName = phaseText(b.phase);
        var secs = Math.max(0, Math.ceil(b.phaseLeft / 1000));
        (0, ui_1.drawWoodPanel)(ctx, r.x, r.y, r.w, r.h, { tone: 'bark', radius: layout_1.LAYOUT.PANEL_RADIUS });
        var title = '第 ' + b.round + ' 回合 · ' + phaseName;
        (0, theme_1.textOutlined)(ctx, title, r.x + r.w / 2, r.y + r.h * 0.5 + 10, (0, theme_1.fitSize)(ctx, title, r.w - 44, layout_1.LAYOUT.FONT.h2, 20), palette_1.PALETTE.inkSoft, 'center');
        if (b.phase === 'deploy' || b.phase === 'observe' || b.phase === 'battle' || b.phase === 'market') {
            (0, sidebar_1.drawDeployTimer)(ctx, r.x + r.w / 2, r.y + r.h + 6, 1 - b.phaseLeft / phaseTotal(b.phase), secs, renderTime);
        }
        if (b.phase === 'deploy' || b.phase === 'market') {
            var rr = b.phase === 'market' ? match_layout_1.MARKET.ready : (0, match_layout_1.readyRect)();
            (0, ui_1.drawButton)(ctx, rr.x, rr.y, rr.w, rr.h, b.phase === 'deploy' ? '准备就绪' : '结束集市', {
                state: 'normal', time: renderTime, radius: layout_1.LAYOUT.BUTTON_RADIUS
            });
        }
        if (b.phase === 'deploy') {
            (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'normal');
            ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.85);
            ctx.textAlign = 'center';
            ctx.fillText('出战上限 ' + (0, setup_1.deployCap)(b, 'player') + ' · 长按拖动 · 落点苔藓光斑为合法位置', layout_1.LAYOUT.SCREEN_W / 2, r.y + r.h + 44);
        }
    };
    MatchScene.prototype.drawDragLayer = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        var d = this.drag;
        if (d) {
            if (d.hover >= 0) {
                var p = this.anchorPixel(d.hover);
                var r = (0, unit_1.speciesBodyRadius)(this.unitSpecies(d.unitId)) + 12;
                (0, board_1.drawMossPatch)(ctx, p.x, p.y, d.valid ? r : r * 0.7, renderTime, d.valid ? 1 : 0.35);
            }
            var u = (0, setup_1.unitById)(b, d.unitId);
            if (u) {
                (0, unit_1.drawUnit)(ctx, unitViewOf(u), {
                    x: d.x, y: d.y, time: renderTime, scale: 1.12, facing: u.facing,
                    showRing: false, dragging: true, showShadow: true
                });
                if (d.hover >= 0) {
                    var gp = this.anchorPixel(d.hover);
                    (0, hpring_1.drawHpRing)(ctx, gp.x, gp.y, (0, unit_1.speciesBodyRadius)(u.species) + layout_1.LAYOUT.RING.gap, 0.7, {
                        time: renderTime, alpha: 0.35, width: 3
                    });
                }
            }
            return;
        }
        var hd = this.handDrag;
        if (hd) {
            var c = handCardById(b, hd.cardId);
            if (c)
                (0, card_1.drawCard)(ctx, cardViewFromInstance(c), hd.x - 60, hd.y - 80, { time: renderTime, drag: true, alpha: 0.92, scale: 1.25 });
            if (hd.hoverUnit >= 0) {
                var p = this.unitPixelById(hd.hoverUnit);
                (0, hpring_1.drawHpRing)(ctx, p.x, p.y, (0, unit_1.speciesBodyRadius)(this.unitSpecies(hd.hoverUnit)) + layout_1.LAYOUT.RING.gap + 4, 1, {
                    time: renderTime, width: 4, alpha: 0.85
                });
            }
        }
    };
    MatchScene.prototype.drawPanels = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        if (this.showWarbook) {
            var r = (0, match_layout_1.warbookRect)();
            (0, ui_1.drawWoodPanel)(ctx, r.x, r.y, r.w, r.h, { tone: 'bark', radius: layout_1.LAYOUT.PANEL_RADIUS });
            (0, sidebar_1.drawScoreboardPanel)(ctx, r.x + 16, r.y + 16, r.w - 32, r.h - 32, roundLogViews(b), renderTime);
            return;
        }
        if (this.detailUnit >= 0) {
            var u = (0, setup_1.unitById)(b, this.detailUnit);
            if (u)
                this.drawDetail(ctx, u, renderTime);
            return;
        }
        if (this.showSettings) {
            var r = (0, match_layout_1.settingsRect)();
            (0, ui_1.drawWoodPanel)(ctx, r.x, r.y, r.w, r.h, { tone: 'bark', radius: layout_1.LAYOUT.PANEL_RADIUS });
            (0, theme_1.textOutlined)(ctx, '设置', r.x + r.w / 2, r.y + 54, layout_1.LAYOUT.FONT.h2, palette_1.PALETTE.creamMist, 'center');
            var labels = ['音效 / 音乐', '投降 · 重开本局', '返回营地'];
            for (var i = 0; i < 3; i++) {
                (0, ui_1.drawButton)(ctx, r.x + 40, r.y + 130 + i * 74, r.w - 80, 56, labels[i], {
                    time: renderTime, radius: layout_1.LAYOUT.BUTTON_RADIUS
                });
            }
            (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.badge, 'normal');
            ctx.textAlign = 'center';
            ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.75);
            ctx.fillText('点面板外任意处关闭', r.x + r.w / 2, r.y + r.h - 24);
            return;
        }
        if (b.phase === 'result')
            this.drawResult(ctx, renderTime);
    };
    MatchScene.prototype.drawDetail = function (ctx, u, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        var r = (0, match_layout_1.detailRect)();
        (0, ui_1.drawWoodPanel)(ctx, r.x, r.y, r.w, r.h, { tone: 'paper', radius: layout_1.LAYOUT.PANEL_RADIUS });
        var sp = species_1.SPECIES[u.species];
        (0, unit_1.drawUnit)(ctx, unitViewOf(u), {
            x: r.x + 120, y: r.y + 230, time: renderTime, scale: 1.9, showRing: false, showShadow: true
        });
        (0, theme_1.textOutlined)(ctx, sp.cn + ' Lv.' + u.level, r.x + 250, r.y + 70, layout_1.LAYOUT.FONT.h2, palette_1.PALETTE.inkSoft, 'left');
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.body, 'normal');
        ctx.fillStyle = palette_1.PALETTE.inkSoft;
        ctx.textAlign = 'left';
        // 矩形血条是允许的两处例外之一（详情页）
        var bx = r.x + 240;
        var by = r.y + 96;
        var bw = 240;
        var bh = 22;
        (0, ui_1.drawWoodPanel)(ctx, bx - 3, by - 3, bw + 6, bh + 6, { tone: 'soil', radius: 8 });
        var ratio = u.hp / Math.max(1, u.maxHp);
        ctx.fillStyle = ratio > 0.6 ? palette_1.PALETTE.leafLight : ratio > 0.3 ? palette_1.PALETTE.sunset : palette_1.PALETTE.berry;
        ctx.fillRect(bx, by, Math.round(bw * ratio), bh);
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'bold');
        ctx.fillStyle = palette_1.PALETTE.inkSoft;
        ctx.fillText('HP ' + Math.ceil(u.hp) + ' / ' + Math.round(u.maxHp), bx + bw + 14, by + 18);
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'normal');
        ctx.fillStyle = palette_1.PALETTE.inkSoft;
        var lines = [
            '攻击 ' + Math.round(u.atk) + '（' + (u.atkInterval / 1000).toFixed(2) + 's）',
            '移速 ' + u.moveSpeed.toFixed(2) + ' · 出场 ' + u.roundsPlayed + ' 回合',
            '特技：' + sp.traitName + ' —— ' + sp.traitDesc
        ];
        for (var i = 0; i < lines.length; i++) {
            ctx.fillText(fit(ctx, lines[i], r.w - 60), r.x + 240, r.y + 150 + i * 30);
        }
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'bold');
        ctx.fillStyle = palette_1.PALETTE.forestMid;
        ctx.fillText('加成牌（最多 2）', r.x + 30, r.y + 320);
        for (var i = 0; i < 2; i++) {
            var bid = i < u.buffs.length ? u.buffs[i] : null;
            var label = bid ? (0, cards_1.buffDef)(bid).cn : '空';
            ctx.fillStyle = bid ? palette_1.PALETTE.leafMid : (0, palette_1.rgba)(palette_1.PALETTE.bark, 0.35);
            ctx.fillRect(r.x + 30, r.y + 336 + i * 40, 300, 32);
            (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'normal');
            ctx.fillStyle = bid ? palette_1.PALETTE.creamMist : palette_1.PALETTE.inkSoft;
            ctx.fillText(label + (bid && i === u.buffs.length - 1 ? '（点「卸下」移除）' : ''), r.x + 42, r.y + 358 + i * 40);
        }
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'normal');
        ctx.fillStyle = palette_1.PALETTE.inkSoft;
        ctx.fillText('卖出可得 ' + (0, economy_1.sellValue)(u.invested) + ' ☀', r.x + 30, r.y + 470);
        var onlyRead = b.phase === 'battle' || b.phase === 'observe';
        var labels = ['卸下加成', '卖出 +' + (0, economy_1.sellValue)(u.invested) + '☀', '关闭'];
        for (var i = 0; i < 3; i++) {
            var br = (0, match_layout_1.detailButtonRect)(i);
            var disabled = onlyRead && i < 2;
            (0, ui_1.drawButton)(ctx, br.x, br.y, br.w, br.h, labels[i], {
                state: disabled ? 'disabled' : 'normal', time: renderTime, radius: layout_1.LAYOUT.BUTTON_RADIUS
            });
        }
    };
    MatchScene.prototype.resultPanel = function (ctx, x, y, w, h, title) {
        // 底板在同位置烘死了同名标题，水彩填充自带 0.97 透明度会让它轻微透出形成重影；
        // 先铺一层完全不透明的木色底把烘死内容压死，再画木框/纸面。
        var r = Math.max(8, Math.min(22, Math.min(w, h) / 2));
        (0, brush_1.fillWatercolor)(ctx, (0, brush_1.roundedRectPoints)(x, y, w, h, r), palette_1.PALETTE.barkLight, {
            alpha: 1, layers: 1, wetEdge: false, seedIndex: 9001,
        });
        (0, ui_1.drawWoodPanel)(ctx, x, y, w, h, { tone: 'bark', radius: 22 });
        (0, ui_1.drawWoodPanel)(ctx, x + 14, y + 48, w - 28, h - 62, { tone: 'paper', radius: 14 });
        // 标题按目标图用深棕字（奶油描边垫底），浅色字在木底上对比不足会发糊。
        (0, theme_1.textOutlined)(ctx, title, x + w / 2, y + 34, layout_1.LAYOUT.FONT.h2, palette_1.PALETTE.inkSoft, 'center', 0);
    };
    MatchScene.prototype.drawResult = function (ctx, renderTime) {
        var b = this.battle;
        if (!b)
            return;
        var pages = this.buildReport();
        var outcome = b.outcome || 'draw';
        // 结算底板（ui-result-victory）已烘死横幅/副标题/三块面板/三张木牌按钮：逐项按原坐标盖住并接管。
        (0, result_1.drawResultBanner)(ctx, layout_1.LAYOUT.SCREEN_W / 2 - 300, 20, 600, 96, outcome, renderTime);
        (0, ui_1.drawWoodPanel)(ctx, 430, 138, 420, 52, { tone: 'paper', radius: 16 });
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.body, 'normal');
        ctx.textAlign = 'center';
        ctx.fillStyle = palette_1.PALETTE.inkSoft;
        ctx.fillText('小屋 HP ' + b.player.houseHp + ' vs ' + b.enemy.houseHp + ' · 共 ' + b.round + ' 回合', layout_1.LAYOUT.SCREEN_W / 2, 172);
        // 面板一：伤害构成 / 高光（两页）
        var p1 = this.reportPage === 0 ? pages[0] : pages[2];
        this.resultPanel(ctx, 335, 228, 430, 372, p1.title);
        if (p1.kind === 'damage' && p1.segments) {
            (0, result_1.drawDamageStack)(ctx, DAMAGE_STACK.x, DAMAGE_STACK.y, DAMAGE_STACK.w, DAMAGE_STACK.h, p1.segments, renderTime, this.expandedSeg);
        }
        else if (p1.kind === 'highlight' && p1.highlights) {
            (0, result_1.drawHighlightStrip)(ctx, 355, 300, 390, 240, p1.highlights, renderTime);
        }
        (0, result_1.drawPageDots)(ctx, 550, 578, 2, this.reportPage, renderTime);
        // 面板二：MVP
        this.resultPanel(ctx, 775, 228, 240, 372, 'MVP');
        var mvp = pages[1].mvp;
        if (mvp) {
            // MVP 立绘直接用美术抠图（assets/pets/<species>.png，320x320 透明底），
            // 与卡面/棋盘同一套形象；缺图时才回落到程序化几何。
            var pet = (0, assets_1.getImage)('unit-' + mvp.species);
            ctx.save();
            if (pet) {
                ctx.drawImage(pet, 895 - 72, 356 - 74, 144, 144);
            }
            else {
                (0, unit_1.drawSpeciesCreature)(ctx, mvp.species, mvp.level, 895, 420, 48, renderTime, { seedIndex: 4101 });
            }
            ctx.restore();
            var rows = [
                { k: '总伤害', v: '' + Math.round(mvp.damage) },
                { k: '承伤', v: '' + Math.round(mvp.taken) },
                { k: '击杀', v: '' + mvp.kills },
            ];
            for (var i = 0; i < rows.length; i++) {
                var ry = 450 + i * 34;
                (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'normal');
                ctx.textAlign = 'left';
                ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.82);
                ctx.fillText(rows[i].k, 795, ry);
                (0, theme_1.textOutlined)(ctx, rows[i].v, 1000, ry, layout_1.LAYOUT.FONT.entry, palette_1.PALETTE.inkSoft, 'right', 0);
            }
        }
        else {
            (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.entry, 'normal');
            ctx.textAlign = 'center';
            ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.7);
            ctx.fillText('本局无出战单位', 895, 400);
        }
        // 面板三：本局奖励 + 阳光账本
        this.resultPanel(ctx, 1025, 228, 220, 372, '本局奖励');
        this.rewardProgress = Math.min(1, this.rewardProgress + 0.02);
        (0, result_1.drawRewardRow)(ctx, 1035, 292, 200, 108, rewardViews(this.coinGain, this.starGain), this.rewardProgress, renderTime);
        var ledger = ledgerRows(b);
        for (var i = 0; i < ledger.length; i++) {
            var ry = 432 + i * 32;
            (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.badge, 'normal');
            ctx.textAlign = 'left';
            ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.8);
            ctx.fillText(ledger[i].label, 1043, ry);
            (0, theme_1.textOutlined)(ctx, '' + ledger[i].value, 1235, ry, layout_1.LAYOUT.FONT.badge, palette_1.PALETTE.inkSoft, 'right', 0);
        }
        // 底部三张木牌（坐标与底板烘死的木牌一致）
        var labels = ['返回营地', '再来一局', '分享战绩'];
        for (var i = 0; i < 3; i++) {
            var r = (0, match_layout_1.resultButtonRect)(i);
            (0, ui_1.drawButton)(ctx, r.x, r.y, r.w, r.h, labels[i], {
                time: renderTime, radius: layout_1.LAYOUT.BUTTON_RADIUS, tone: i === 1 ? 'leaf' : 'bark'
            });
        }
        (0, ui_1.drawIconButton)(ctx, (0, match_layout_1.reportArrowRect)(-1).x, (0, match_layout_1.reportArrowRect)(-1).y, 30, 'back', false, renderTime);
        (0, ui_1.drawIconButton)(ctx, (0, match_layout_1.reportArrowRect)(1).x, (0, match_layout_1.reportArrowRect)(1).y, 30, 'back', false, renderTime);
    };
    MatchScene.prototype.drawToastLayer = function (ctx) {
        if (this.time < this.toastUntil && this.toast) {
            (0, ui_1.drawToast)(ctx, layout_1.LAYOUT.SCREEN_W / 2, 138, this.toast, 0.95);
        }
        if (this.rejectCard >= 0 && this.time - this.rejectAt < 500) {
            var r = (0, match_layout_1.shelfRect)(this.rejectCard);
            (0, ui_1.drawTipBubble)(ctx, r.x + r.w / 2, r.y - 20, 180, 44, '阳光不足', this.time, r.x + r.w / 2);
        }
    };
    MatchScene.prototype.buildReport = function () {
        var b = this.battle;
        var empty = { kind: 'damage', title: '伤害构成' };
        if (!b)
            return [empty, { kind: 'mvp', title: 'MVP' }, { kind: 'highlight', title: '高光时刻' }];
        var bySource = { basic: 0, trait: 0, counter: 0, weather: 0, buff: 0 };
        var mvp = null;
        var mineUnits = (0, setup_1.side)(b, 'player').units;
        var mineBench = (0, setup_1.side)(b, 'player').bench;
        var all = [];
        for (var i = 0; i < mineUnits.length; i++)
            all.push(mineUnits[i]);
        // 未出战的单位停在替补席上，战绩同样要计入结算。
        for (var i = 0; i < mineBench.length; i++) {
            var u = mineBench[i];
            if (u)
                all.push(u);
        }
        for (var i = 0; i < all.length; i++) {
            var s = all[i].stat.bySource;
            bySource.basic += s.basic;
            bySource.trait += s.trait;
            bySource.counter += s.counter;
            bySource.weather += s.weather;
            bySource.buff += s.buff;
            if (!mvp || all[i].stat.damageDealt > mvp.stat.damageDealt)
                mvp = all[i];
        }
        // 玩家全场没打出战绩（例如全程未出战）时，退回用敌方表现最好的单位充当 MVP，
        // 否则 MVP 面板会整块空白。
        if (!mvp || mvp.stat.damageDealt <= 0) {
            var foe = (0, setup_1.side)(b, 'enemy').units;
            for (var i = 0; i < foe.length; i++) {
                if (!mvp || foe[i].stat.damageDealt > mvp.stat.damageDealt)
                    mvp = foe[i];
            }
        }
        var segments = [
            { key: 'basic', label: '普攻', value: bySource.basic },
            { key: 'trait', label: '特性', value: bySource.trait },
            { key: 'counter', label: '克制', value: bySource.counter },
            { key: 'weather', label: '天气', value: bySource.weather },
            { key: 'buff', label: '加成', value: bySource.buff }
        ];
        var mvpView = mvp
            ? {
                species: mvp.species, level: mvp.level, name: species_1.SPECIES[mvp.species].cn,
                damage: Math.round(mvp.stat.damageDealt), taken: Math.round(mvp.stat.damageTaken),
                kills: mvp.stat.kills, aliveSec: Math.round(mvp.stat.aliveMs / 1000), rounds: mvp.roundsPlayed
            }
            : undefined;
        var highlights = [];
        for (var i = 0; i < b.highlights.length && i < 3; i++) {
            var hs = b.highlights[i];
            var sp = hs.units.length > 0 ? hs.units[0].species : 'tiger';
            highlights.push({ label: hs.label, round: hs.round, species: sp, value: 0, time: hs.at });
        }
        if (highlights.length === 0) {
            highlights.push({ label: '第 ' + b.round + ' 回合 · 关键胜负手', round: b.round, species: 'tiger', value: 0 });
        }
        return [
            { kind: 'damage', title: '伤害构成', segments: segments },
            { kind: 'mvp', title: 'MVP', mvp: mvpView },
            { kind: 'highlight', title: '高光时刻', highlights: highlights }
        ];
    };
    return MatchScene;
}());
/* ------------------------------------------------------------------ */
/* 小组件与转换函数                                                    */
/* ------------------------------------------------------------------ */
function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
function pushUnique(arr, v) {
    for (var i = 0; i < arr.length; i++)
        if (arr[i] === v)
            return;
    arr.push(v);
}
function fit(ctx, text, max) {
    var t = text;
    while (t.length > 4 && ctx.measureText(t).width > max)
        t = t.substring(0, t.length - 2) + '…';
    return t;
}
function unitViewOf(u) {
    return {
        id: u.id, species: u.species, level: u.level, hp: u.hp, maxHp: u.maxHp,
        shield: u.shield, alive: u.alive,
        fx: {
            hitFlash: u.fx.hitFlash, attackPulse: u.fx.attackPulse, deathFirefly: u.fx.deathFirefly,
            counterHit: u.fx.counterHit, shieldRipple: u.fx.shieldRipple, hitDir: u.fx.hitDir
        }
    };
}
function statusTags(u) {
    var out = [];
    if (u.shield > 0)
        out.push('shield');
    if (u.status.bleedStacks > 0)
        out.push('bleed');
    if (u.status.slowAtkUntil > 0)
        out.push('slow');
    if (u.status.guardUntil > 0)
        out.push('guard');
    if (u.status.tauntUntil > 0)
        out.push('taunt');
    if (u.status.regenUntil > 0)
        out.push('regen');
    if (u.isDecoy)
        out.push('decoy');
    return out;
}
function unitCardView(u) {
    var sp = species_1.SPECIES[u.species];
    return {
        kind: 'animal', cn: sp.cn, cost: sp.cost, species: u.species, level: u.level,
        quality: u.level, atk: Math.round(u.atk), atkInterval: u.atkInterval / 1000,
        hp: Math.round(u.maxHp), traitName: sp.traitName, traitDesc: sp.traitDesc
    };
}
function cardViewFromInstance(c) {
    if (c.kind === 'animal') {
        var sp = species_1.SPECIES[c.species];
        return {
            kind: 'animal', cn: sp.cn, cost: sp.cost, species: sp.id, quality: 1,
            atk: sp.atk, atkInterval: sp.atkInterval, hp: sp.hp, traitName: sp.traitName, traitDesc: sp.traitDesc
        };
    }
    if (c.kind === 'weather') {
        var wid = (c.weather || 'sunny');
        var wd = (0, weather_1.weatherDef)(wid);
        if (!wd)
            return { kind: 'weather', cn: '天气', cost: 0, weather: wid };
        return { kind: 'weather', cn: wd.cn, cost: wd.cost, weather: wd.id };
    }
    var bd = (0, cards_1.buffDef)(c.buff || 'sharpClaw');
    return { kind: 'buff', cn: bd.cn, cost: bd.cost, buff: bd.id, desc: bd.desc, tag: bd.tag };
}
function handCardById(b, id) {
    for (var i = 0; i < b.player.hand.length; i++) {
        if (b.player.hand[i].id === id)
            return b.player.hand[i];
    }
    return null;
}
function entryViews(b, faction, ghost, ghostEntries) {
    if (ghost && ghostEntries)
        return ghostEntries;
    var out = [];
    var units = (0, setup_1.side)(b, faction).units;
    for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (u.anchor < 0 && !u.alive)
            continue;
        out.push({
            species: u.species, level: u.level, hp: Math.max(0, u.hp), maxHp: u.maxHp,
            statuses: statusTags(u), empty: false,
            ghost: ghost,
            hitFlash: u.fx.hitFlash
        });
        if (out.length >= 6)
            break;
    }
    return out;
}
function emptyEntry() {
    return { species: 'mouse', level: 1, hp: 0, maxHp: 1, statuses: [], empty: true };
}
function entryUnits(b, faction, ghost) {
    if (faction === 'enemy' && ghost && ghost.length > 0)
        return [];
    var out = [];
    var units = (0, setup_1.side)(b, faction).units;
    for (var i = 0; i < units.length; i++) {
        if (units[i].alive || units[i].anchor >= 0)
            out.push(units[i].id);
        if (out.length >= 6)
            break;
    }
    return out;
}
function entryTip(id) {
    return '敌方单位 #' + id;
}
function roundLogViews(b) {
    var out = [];
    for (var i = 0; i < b.log.length; i++) {
        var l = b.log[i];
        out.push({
            round: l.round,
            winner: l.winner,
            houseDamage: l.winner === 'player' ? l.houseDamage.enemy : l.houseDamage.player,
            weather: l.weather,
            buffCount: 0,
            units: []
        });
    }
    return out;
}
function ledgerRows(b) {
    var e = b.player;
    var eco = b.economy.player;
    return [
        { label: '总收入（回合+胜利）', value: eco.income },
        { label: '利息', value: eco.interest },
        { label: '买卡支出', value: -eco.buySpent },
        { label: '刷新支出', value: -eco.refreshSpent }
    ];
    void e;
}
function rewardViews(coins, stars) {
    return [
        { kind: 'coin', label: '爪印币', value: coins },
        { kind: 'star', label: '星辉', value: stars }
    ];
}
function phaseText(p) {
    if (p === 'deploy')
        return '布阵';
    if (p === 'observe')
        return '观测';
    if (p === 'battle')
        return '战斗';
    if (p === 'settle')
        return '结算';
    if (p === 'market')
        return '集市';
    if (p === 'result')
        return '终局';
    return '准备';
}
function phaseTotal(p) {
    if (p === 'observe')
        return timing_1.TIMING.OBSERVE;
    if (p === 'battle')
        return timing_1.TIMING.BATTLE;
    if (p === 'settle')
        return timing_1.TIMING.SETTLE;
    if (p === 'market')
        return timing_1.TIMING.MARKET;
    return timing_1.TIMING.DEPLOY_RN;
}
function reasonText(reason) {
    if (!reason)
        return '操作无效';
    if (reason === 'not-enough-sunlight')
        return '阳光不足';
    if (reason === 'refresh-limit')
        return '本回合刷新次数已用完';
    if (reason === 'bench-full')
        return '替补席已满';
    if (reason === 'deploy-limit')
        return '出战数量已达上限';
    if (reason === 'command-cooldown')
        return '该单位指挥冷却中';
    if (reason === 'gift-used')
        return '本轮赠礼已使用';
    if (reason === 'buff-full')
        return '该动物加成牌已满（最多 2 张）';
    if (reason === 'not-same-level')
        return '只有同种同级才能合成';
    if (reason === 'level-cap')
        return '已经是 3 级';
    return reason;
}
/** 集市刷新圆牌（手绘木牌 + 藤蔓环）。 */
function drawWoodSignCircle(ctx, x, y, size, label, disabled, time) {
    ctx.save();
    ctx.globalAlpha = disabled ? 0.55 : 1;
    (0, ui_1.drawWoodPanel)(ctx, x, y, size, size, { tone: 'bark', radius: size / 2 });
    var labelSize = (0, theme_1.fitSize)(ctx, label, size - 34, 26, 14);
    (0, theme_1.setFont)(ctx, labelSize, 'bold');
    ctx.textAlign = 'center';
    ctx.fillStyle = disabled ? (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.6) : palette_1.PALETTE.inkSoft;
    ctx.fillText(label, x + size / 2, y + size / 2 + labelSize * 0.36);
    ctx.restore();
}
