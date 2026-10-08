"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BootScene = void 0;
/**
 * 加载页：水彩晕染的标题 + 手绘进度（叶片生长）。
 * 资源加载与首个场景初始化都在这里完成，最后自动转入营地。
 */
var manager_1 = require("./manager");
var palette_1 = require("../config/palette");
var forest_1 = require("../render/forest");
var brush_1 = require("../ui/brush");
var theme_1 = require("../ui/theme");
var layout_1 = require("../config/layout");
var screen_1 = require("../platform/screen");
var BootScene = /** @class */ (function () {
    function BootScene(opts) {
        this.name = 'boot';
        this.t = 0;
        this.minShowMs = 900;
        this.done = false;
        this.opts = opts;
    }
    BootScene.prototype.enter = function () {
        this.t = 0;
        this.done = false;
    };
    BootScene.prototype.tick = function (logicTime) {
        this.t = logicTime;
        var p = this.opts.progress();
        if (!this.done && p >= 1 && logicTime >= this.minShowMs) {
            this.done = true;
            var next = this.opts.next();
            (0, manager_1.swapNow)(next);
            (0, manager_1.push)(next); // 触发一次 800ms 雾气转场，让进入营地更柔和
        }
    };
    BootScene.prototype.render = function (ctx, renderTime) {
        var w = layout_1.LAYOUT.SCREEN_W;
        var h = layout_1.LAYOUT.SCREEN_H;
        // 自适应全屏：天空/森林/暗角铺满逻辑可视区，标题与进度仍居中
        var box = (0, screen_1.sceneBox)();
        ctx.save();
        ctx.translate(box.x, box.y);
        (0, forest_1.drawSky)(ctx, box.w, box.h, renderTime);
        (0, forest_1.drawForestLayer)(ctx, box.w, box.h, 0, 'far', renderTime);
        (0, forest_1.drawForestLayer)(ctx, box.w, box.h, 0, 'mid', renderTime);
        ctx.restore();
        (0, forest_1.drawSunSpecks)(ctx, w, h, renderTime, 0.7);
        // 中央水彩晕染圆（墨迹未干的标题底）
        var cx = w / 2;
        var cy = h / 2 - 30;
        var pts = [];
        var R = 190 + Math.sin(renderTime / 900) * 6;
        for (var i = 0; i <= 22; i++) {
            var a = (i / 22) * Math.PI * 2;
            var r = R * (0.86 + 0.14 * Math.sin(i * 1.7));
            pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.62 });
        }
        (0, brush_1.fillWatercolor)(ctx, pts, palette_1.PALETTE.moss, { alpha: 0.28, layers: 2, wetEdge: true, seedIndex: 3 });
        (0, theme_1.textOutlined)(ctx, '萌宠乱斗', cx, cy - 10, layout_1.LAYOUT.FONT.h1 * 1.6, palette_1.PALETTE.bark, 'center');
        (0, theme_1.setFont)(ctx, layout_1.LAYOUT.FONT.body, 500);
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.forestDeep, 0.85);
        ctx.textAlign = 'center';
        ctx.fillText('林间乱斗', cx, cy + 52);
        // 手绘进度条：一根藤蔓 + 一片生长的叶子
        var bw = 420;
        var bh = 18;
        var bx = cx - bw / 2;
        var by = cy + 140;
        (0, brush_1.roundRectPath)(ctx, bx, by, bw, bh, 9, 0.6, 11);
        (0, brush_1.fillWatercolor)(ctx, [
            { x: bx, y: by }, { x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, { x: bx, y: by + bh }
        ], palette_1.PALETTE.creamMist, { alpha: 0.75, layers: 1, seedIndex: 12 });
        (0, brush_1.strokeInk)(ctx, [
            { x: bx, y: by + bh / 2 }, { x: bx + bw * 0.5, y: by + bh / 2 }, { x: bx + bw, y: by + bh / 2 }
        ], { width: 2.5, jitter: 1.2, seedIndex: 13 });
        var p = Math.max(0, Math.min(1, this.opts.progress()));
        var leafX = bx + bw * p;
        var leaf = [];
        for (var i = 0; i <= 14; i++) {
            var a = (i / 14) * Math.PI * 2;
            leaf.push({ x: leafX + Math.cos(a) * 13, y: by + bh / 2 + Math.sin(a) * 9 });
        }
        (0, brush_1.fillWatercolor)(ctx, leaf, palette_1.PALETTE.leafLight, { alpha: 0.9, layers: 2, seedIndex: 14 });
        (0, brush_1.strokeInk)(ctx, leaf, { width: 2.6, close: true, seedIndex: 15 });
        (0, forest_1.drawForestLayer)(ctx, w, h, 0, 'near', renderTime);
        ctx.save();
        ctx.translate(box.x, box.y);
        (0, forest_1.drawVignette)(ctx, box.w, box.h);
        ctx.restore();
    };
    return BootScene;
}());
exports.BootScene = BootScene;
