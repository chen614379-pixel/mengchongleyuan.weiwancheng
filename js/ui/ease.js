"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EASE_MS_MAX = exports.EASE_MS_MIN = exports.EASE_BEZIER = void 0;
exports.clamp01 = clamp01;
exports.clamp = clamp;
exports.lerp = lerp;
exports.invLerp = invLerp;
exports.smoothstep = smoothstep;
exports.bezier = bezier;
exports.ease = ease;
exports.easeOutQuad = easeOutQuad;
exports.easeOutCubic = easeOutCubic;
exports.easeInOutCubic = easeInOutCubic;
exports.easeOutBack = easeOutBack;
exports.easeOutElastic = easeOutElastic;
exports.breathe = breathe;
exports.bob = bob;
exports.sway = sway;
exports.phaseOf = phaseOf;
exports.cycle = cycle;
exports.decay = decay;
exports.stagger = stagger;
/**
 * 统一缓动（§2.7：全局缓动 cubic-bezier(.22,.9,.32,1)、200~320ms）。
 *
 * 规格禁止各模块手写缓动曲线，所有插值都必须从这里取。
 */
var timing_1 = require("../config/timing");
/** 全局主缓动控制点（来自 config，勿改）。 */
exports.EASE_BEZIER = timing_1.TIMING.EASE;
exports.EASE_MS_MIN = timing_1.TIMING.EASE_MS_MIN;
exports.EASE_MS_MAX = timing_1.TIMING.EASE_MS_MAX;
function clamp01(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t;
}
function clamp(t, min, max) {
    return t < min ? min : t > max ? max : t;
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function invLerp(a, b, v) {
    if (b === a)
        return 0;
    return clamp01((v - a) / (b - a));
}
function smoothstep(t) {
    var x = clamp01(t);
    return x * x * (3 - 2 * x);
}
/** 三次贝塞尔缓动求值（牛顿迭代 6 次，足够 60fps 精度）。 */
function bezier(t, p) {
    var c = p || exports.EASE_BEZIER;
    var x1 = c[0];
    var y1 = c[1];
    var x2 = c[2];
    var y2 = c[3];
    var x = clamp01(t);
    if (x === 0 || x === 1)
        return x;
    var cx = 3 * x1;
    var bx = 3 * (x2 - x1) - cx;
    var ax = 1 - cx - bx;
    var cy = 3 * y1;
    var by = 3 * (y2 - y1) - cy;
    var ay = 1 - cy - by;
    var u = x;
    for (var i = 0; i < 6; i++) {
        var fx = ((ax * u + bx) * u + cx) * u - x;
        var dfx = (3 * ax * u + 2 * bx) * u + cx;
        if (Math.abs(dfx) < 1e-6)
            break;
        u -= fx / dfx;
    }
    u = clamp01(u);
    return ((ay * u + by) * u + cy) * u;
}
/** 主缓动别名：默认取贝塞尔曲线。 */
function ease(t) {
    return bezier(t);
}
function easeOutQuad(t) {
    var x = clamp01(t);
    return 1 - (1 - x) * (1 - x);
}
function easeOutCubic(t) {
    var x = clamp01(t);
    var k = 1 - x;
    return 1 - k * k * k;
}
function easeInOutCubic(t) {
    var x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
/** 回弹（松手回位、落点吸附）。 */
function easeOutBack(t, overshoot) {
    var s = overshoot === undefined ? 1.34 : overshoot;
    var x = clamp01(t) - 1;
    return 1 + (s + 1) * x * x * x + s * x * x;
}
/** 弹性（卡片飞出、奖励数字）。 */
function easeOutElastic(t) {
    var x = clamp01(t);
    if (x === 0 || x === 1)
        return x;
    var c = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c) + 1;
}
/** 呼吸（危险态环缩放、苔藓光斑 0.8s 循环）。 */
function breathe(time, periodMs) {
    if (periodMs <= 0)
        return 0;
    return (Math.sin((time / periodMs) * Math.PI * 2) + 1) / 2;
}
/** 正弦起伏（2.5Hz 行走 bob）。 */
function bob(time, hz, amp) {
    return Math.sin((time / 1000) * hz * Math.PI * 2) * amp;
}
/** 草叶摆动（0.5Hz ±3px）。 */
function sway(time, phase) {
    return Math.sin((time / 1000) * Math.PI * 2 * 0.5 + phase) * 3;
}
/** 把基准时长夹到 200~320ms 并归一化进度。 */
function phaseOf(elapsed, baseMs) {
    var d = clamp(baseMs, exports.EASE_MS_MIN, exports.EASE_MS_MAX);
    return clamp01(elapsed / d);
}
/** 循环进度（0~1）。 */
function cycle(time, periodMs, offset) {
    if (periodMs <= 0)
        return 0;
    var o = offset || 0;
    var t = (time / periodMs + o) % 1;
    if (t < 0)
        t += 1;
    return t;
}
/** 线性衰减的比例（受击闪白、残影追平）。 */
function decay(elapsed, totalMs) {
    if (totalMs <= 0)
        return 0;
    return clamp01(1 - elapsed / totalMs);
}
/** 每单位错开的延迟（列表入场用）。 */
function stagger(index, stepMs, totalMs) {
    var t = index * stepMs;
    return totalMs === undefined ? t : Math.min(t, totalMs);
}
