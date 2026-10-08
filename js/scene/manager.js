"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.current = current;
exports.push = push;
exports.replace = replace;
exports.pop = pop;
exports.swapNow = swapNow;
exports.isTransitioning = isTransitioning;
exports.tickScene = tickScene;
exports.renderScene = renderScene;
exports.gestureScene = gestureScene;
exports.resetStack = resetStack;
var palette_1 = require("../config/palette");
var screen_1 = require("../platform/screen");
var stack = [];
var trans = null;
function current() {
    return stack.length ? stack[stack.length - 1] : null;
}
function push(scene, params) {
    beginTransition(scene, params, 'fog', false);
}
function replace(scene, params) {
    beginTransition(scene, params, 'fog', false);
}
function pop() {
    if (stack.length <= 1)
        return;
    beginTransition(null, undefined, 'fade', true);
}
function beginTransition(scene, params, kind, isPop) {
    var total = kind === 'none' ? 1 : (kind === 'fog' ? 800 : 500);
    trans = { kind: kind, t: 0, half: total / 2, total: total, pending: scene, params: params, swapped: false, pop: isPop };
}
/** 立即切换（无转场，用于异常兜底）。 */
function swapNow(scene, params) {
    var old = current();
    if (old && old.exit)
        old.exit();
    stack.pop();
    stack.push(scene);
    scene.enter(params);
}
function isTransitioning() {
    return trans !== null;
}
function tickScene(dtMs, logicTime) {
    if (trans) {
        trans.t += dtMs;
        if (!trans.swapped && trans.t >= trans.half) {
            var old = current();
            if (old && old.exit)
                old.exit();
            if (trans.pop) {
                if (stack.length > 1)
                    stack.pop();
            }
            else if (trans.pending) {
                stack.push(trans.pending);
            }
            var next = current();
            if (next)
                next.enter(trans.params);
            trans.swapped = true;
        }
        if (trans.t >= trans.total)
            trans = null;
    }
    var sc = current();
    if (sc)
        sc.tick(logicTime, dtMs);
}
function renderScene(ctx, renderTime, alpha) {
    var sc = current();
    if (sc)
        sc.render(ctx, renderTime, alpha);
    if (trans && trans.kind !== 'none') {
        var p = trans.t / trans.total;
        var cover = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
        drawCurtain(ctx, cover, trans.kind);
    }
}
function gestureScene(e) {
    if (trans)
        return;
    var sc = current();
    if (sc && sc.gesture)
        sc.gesture(e);
}
/** 雾气卷帘/纸页淡出：用水彩纸色 + 不透明雾气盖住整屏。 */
function drawCurtain(ctx, cover, kind) {
    if (cover <= 0.001)
        return;
    // 自适应全屏：卷帘要盖住整个逻辑可视区（含外扩留边）
    var box = (0, screen_1.sceneBox)();
    var w = box.w;
    var h = box.h;
    var ox = box.x;
    var oy = box.y;
    ctx.save();
    ctx.globalAlpha = Math.min(1, cover * 1.15);
    if (kind === 'fog') {
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.92);
        ctx.fillRect(ox - 40, oy - 40, w + 80, h + 80);
        // 几缕雾气边缘，避免看起来像纯色遮罩
        ctx.globalAlpha = Math.min(1, cover) * 0.5;
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.skyWarm, 0.35);
        var bands = 5;
        for (var i = 0; i < bands; i++) {
            var y = oy + ((i + 0.5) / bands) * h + Math.sin(i * 2.1) * 26;
            ctx.fillRect(ox - 40, y, w + 80, 26 + (i % 2) * 18);
        }
    }
    else {
        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.paper, 0.96);
        ctx.fillRect(ox - 40, oy - 40, w + 80, h + 80);
    }
    ctx.restore();
}
function resetStack(first, params) {
    while (stack.length) {
        var s = stack.pop();
        if (s && s.exit)
            s.exit();
    }
    stack.push(first);
    first.enter(params);
}
