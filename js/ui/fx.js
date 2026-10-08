"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FX = void 0;
exports.createFx = createFx;
/**
 * 粒子与瞬时特效系统（§2.7 动效 / §4.3 落点反馈 / §8.2 指令气泡）。
 *
 * 设计约束：
 * - 纯表现层：只被 render 调用，绝不影响 core 状态。
 * - 同屏动画预算 ≤ `TIMING.ANIM_BUDGET`（48），超出时丢弃优先级最低的粒子。
 * - 一切形状走 `ui/brush`（手绘抖动），颜色只来自 `PALETTE`。
 * - 固定种子噪声，保证同种子观感一致（不影响逻辑确定性）。
 */
var palette_1 = require("../config/palette");
var layout_1 = require("../config/layout");
var timing_1 = require("../config/timing");
var ease_1 = require("./ease");
var brush_1 = require("./brush");
var FX_FONT_SMALL = 'bold 18px ' + layout_1.LAYOUT.FONT_FAMILY;
/** 特效优先级：数值越小越先被丢弃。 */
var PRIO = {
    dust: 1,
    rain: 2,
    petal: 2,
    grass: 3,
    leaf: 4,
    ink: 5,
    firefly: 6,
    spark: 6,
};
function createFx() {
    var parts = [];
    var texts = [];
    var mosses = [];
    var ripples = [];
    var bubbles = [];
    var pendings = [];
    var now = 0;
    var shakeAmp = 0;
    var shakeUntil = 0;
    function budgetRoom() {
        var used = parts.length + texts.length + mosses.length + ripples.length;
        return timing_1.TIMING.ANIM_BUDGET - used;
    }
    function push(p) {
        if (budgetRoom() <= 0) {
            // 丢弃优先级最低、且剩余寿命最短的粒子（保留视觉冲击大的）
            var worst = -1;
            var worstScore = p.priority;
            for (var i = 0; i < parts.length; i++) {
                var q = parts[i];
                var score = q.priority - (q.life / q.max) * 0.9;
                if (score <= worstScore) {
                    worstScore = score;
                    worst = i;
                }
            }
            if (worst < 0 || p.priority <= parts[worst].priority)
                return;
            parts.splice(worst, 1);
        }
        parts.push(p);
    }
    function seedOf() {
        return (now * 7.13 + parts.length * 3.77) % 97;
    }
    function spawn(kind, x, y, vx, vy, life, size, color, opts) {
        var o = opts || {};
        push({
            x: x,
            y: y,
            vx: vx,
            vy: vy,
            life: life,
            max: life,
            size: size,
            color: color,
            alpha: o.alpha === undefined ? 1 : o.alpha,
            rot: seedOf(),
            vrot: o.vrot === undefined ? (seedOf() - 48) * 0.0016 : o.vrot,
            grav: o.grav === undefined ? 0 : o.grav,
            drag: o.drag === undefined ? 0.0022 : o.drag,
            layer: o.layer === undefined ? 'front' : o.layer,
            kind: kind,
            seed: seedOf(),
            priority: o.priority === undefined ? 3 : o.priority,
        });
    }
    var sys = {
        update: function (dtMs) {
            now += dtMs;
            var d = dtMs;
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i];
                p.life -= d;
                if (p.life <= 0) {
                    parts.splice(i, 1);
                    continue;
                }
                p.vy += p.grav * d;
                var k = 1 - p.drag * d;
                p.vx *= k;
                p.vy *= k;
                p.x += p.vx * d;
                p.y += p.vy * d;
                p.rot += p.vrot * d;
            }
            for (var i = texts.length - 1; i >= 0; i--) {
                var t = texts[i];
                t.life -= d;
                if (t.life <= 0)
                    texts.splice(i, 1);
            }
            for (var i = mosses.length - 1; i >= 0; i--) {
                var m = mosses[i];
                m.life -= d;
                if (m.life <= 0)
                    mosses.splice(i, 1);
            }
            for (var i = ripples.length - 1; i >= 0; i--) {
                var r = ripples[i];
                r.life -= d;
                if (r.life <= 0)
                    ripples.splice(i, 1);
            }
            for (var i = bubbles.length - 1; i >= 0; i--) {
                var b = bubbles[i];
                b.life -= d;
                if (!b.fired && b.life <= b.max * 0.28) {
                    b.fired = true;
                    if (b.onArrive)
                        b.onArrive();
                }
                if (b.life <= 0)
                    bubbles.splice(i, 1);
            }
            for (var i = pendings.length - 1; i >= 0; i--) {
                if (now >= pendings[i].at) {
                    var fn = pendings[i].fn;
                    pendings.splice(i, 1);
                    fn();
                }
            }
            if (shakeAmp > 0 && now >= shakeUntil)
                shakeAmp = 0;
        },
        draw: function (ctx, time, layer) {
            // 光斑（在单位之下）→ 涟漪 → 叶/草屑 → 萤火虫 → 墨花
            if (layer === 'back') {
                for (var i = 0; i < mosses.length; i++)
                    drawMoss(ctx, mosses[i], time);
                for (var i = 0; i < ripples.length; i++)
                    drawRipple(ctx, ripples[i]);
            }
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                if (p.layer !== layer)
                    continue;
                var t = 1 - p.life / p.max;
                var a = p.alpha * (p.kind === 2 ? fadeInOut(t) : 1 - t * t);
                if (a <= 0.01)
                    continue;
                ctx.save();
                ctx.globalAlpha = a;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot * 0.02);
                switch (p.kind) {
                    case 0: // 叶
                        drawLeaf(ctx, p.size, p.color);
                        break;
                    case 1: // 草屑（小程序 canvas 不保证 ellipse，用线段代替，观感一致）
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = p.size * 0.5;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(-p.size * 0.7, 0);
                        ctx.lineTo(p.size * 0.7, 0);
                        ctx.stroke();
                        break;
                    case 2: // 萤火虫
                        drawFirefly(ctx, p.size, p.color, time, p.seed);
                        break;
                    case 3: // 光尘
                        ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.sunbeam, 0.7 * (0.5 + 0.5 * Math.sin(time / 220 + p.seed)));
                        ctx.beginPath();
                        ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 4: // 花瓣
                        drawPetal(ctx, p.size, p.color);
                        break;
                    case 5: // 雨花
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.lineTo(1.6, 1.6);
                        ctx.moveTo(0, 1.8);
                        ctx.lineTo(1.6, 0.2);
                        ctx.stroke();
                        break;
                    case 6: // 火花
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = 1.4;
                        ctx.beginPath();
                        ctx.moveTo(-p.size, 0);
                        ctx.lineTo(p.size, 0);
                        ctx.stroke();
                        break;
                    default: // 墨花
                        drawInkFlower(ctx, p.size, p.color, p.seed);
                        break;
                }
                ctx.restore();
            }
            if (layer === 'front') {
                for (var i = 0; i < bubbles.length; i++)
                    drawBubble(ctx, bubbles[i]);
                for (var i = 0; i < texts.length; i++)
                    drawFloat(ctx, texts[i]);
            }
        },
        grassBits: function (x, y, n) {
            var c = Math.max(1, Math.min(n, 4));
            for (var i = 0; i < c; i++) {
                spawn(1, x + (seedOf() % 12) - 6, y + (seedOf() % 6) - 3, ((seedOf() % 100) - 50) * 0.0016, -0.045 - (seedOf() % 30) * 0.0008, 520 + (seedOf() % 240), 2.4 + (seedOf() % 6) * 0.3, i % 2 === 0 ? palette_1.PALETTE.moss : palette_1.PALETTE.leafLight, { grav: 0.00022, priority: PRIO.grass });
            }
        },
        hitLeaves: function (x, y, dirX, n) {
            var c = Math.max(1, Math.min(n, 3));
            for (var i = 0; i < c; i++) {
                spawn(0, x + ((seedOf() % 10) - 5), y - 6 - (seedOf() % 8), (dirX >= 0 ? 1 : -1) * (0.03 + (seedOf() % 40) * 0.0012), -0.05 - (seedOf() % 30) * 0.0012, 700 + (seedOf() % 300), 5 + (seedOf() % 3), seedOf() % 2 === 0 ? palette_1.PALETTE.leafMid : palette_1.PALETTE.leafLight, { grav: 0.00016, priority: PRIO.leaf, drag: 0.0014 });
            }
        },
        fireflyBurst: function (x, y, n) {
            var c = Math.max(1, Math.min(n, 6));
            for (var i = 0; i < c; i++) {
                var a = (seedOf() / 97) * Math.PI * 2;
                var sp = 0.02 + (seedOf() % 30) * 0.0012;
                spawn(2, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.02, 900 + (seedOf() % 400), 6 + (seedOf() % 5), palette_1.PALETTE.sunbeam, {
                    grav: -0.00003,
                    priority: PRIO.firefly,
                    drag: 0.0016,
                });
            }
        },
        dust: function (x, y, n) {
            var c = Math.max(1, Math.min(n, 3));
            for (var i = 0; i < c; i++) {
                spawn(3, x, y, ((seedOf() % 40) - 20) * 0.0008, -0.008 - (seedOf() % 10) * 0.0006, 1400, 2 + (seedOf() % 3), palette_1.PALETTE.sunbeam, {
                    priority: PRIO.dust,
                    drag: 0.0006,
                });
            }
        },
        petals: function (x, y, n) {
            var c = Math.max(1, Math.min(n, 4));
            for (var i = 0; i < c; i++) {
                spawn(4, x + (seedOf() % 40) - 20, y - 20, ((seedOf() % 40) - 20) * 0.0009, 0.012 + (seedOf() % 20) * 0.0006, 2400, 4 + (seedOf() % 3), palette_1.PALETTE.blossom, {
                    priority: PRIO.petal,
                    drag: 0.0004,
                    layer: 'back',
                });
            }
        },
        rainSplash: function (x, y, n) {
            var c = Math.max(1, Math.min(n, 3));
            for (var i = 0; i < c; i++) {
                spawn(5, x + (seedOf() % 16) - 8, y, 0, 0, 260, 3, palette_1.PALETTE.stream, { priority: PRIO.rain, layer: 'back' });
            }
        },
        inkFlower: function (x, y, dirX) {
            spawn(7, x + (dirX >= 0 ? 6 : -6), y - 4, 0, -0.004, 300, 12, palette_1.PALETTE.inkSoft, { priority: PRIO.ink });
        },
        slashArc: function (x, y, dirX) {
            spawn(6, x + (dirX >= 0 ? 10 : -10), y - 2, (dirX >= 0 ? 1 : -1) * 0.02, -0.008, 220, 12, palette_1.PALETTE.paper, { priority: PRIO.spark });
        },
        moss: function (x, y, r, strength) {
            // 同一落点只保留最新一圈
            for (var i = mosses.length - 1; i >= 0; i--) {
                var m = mosses[i];
                var dx = m.x - x;
                var dy = m.y - y;
                if (dx * dx + dy * dy < 12 * 12)
                    mosses.splice(i, 1);
            }
            mosses.push({ x: x, y: y, life: 800, max: 800, r: r, strength: strength === undefined ? 1 : strength });
            ripples.push({ x: x, y: y, life: 250, max: 250, r0: r * 0.5, r1: r * 1.7 });
        },
        ripple: function (x, y, r0, r1) {
            ripples.push({ x: x, y: y, life: 250, max: 250, r0: r0, r1: r1 });
        },
        clearMoss: function () {
            mosses.length = 0;
            ripples.length = 0;
        },
        floatText: function (x, y, text, color, size, emphasis) {
            texts.push({
                x: x,
                y: y,
                text: text,
                color: color,
                life: 900,
                max: 900,
                size: size === undefined ? 22 : size,
                rise: 34,
                emphasis: emphasis === undefined ? 1 : emphasis,
            });
        },
        damage: function (x, y, amount, opts) {
            var o = opts || {};
            var n = Math.max(1, Math.round(amount));
            var label = o.counter ? n + '!' : '' + n;
            var color = o.counter ? palette_1.PALETTE.sunbeam : palette_1.PALETTE.berry;
            var size = (o.crit ? 30 : 24) * (o.counter ? 1.2 : 1);
            sys.floatText(x, y + 2, label, color, size, o.counter || o.crit ? 1.25 : 1);
            sys.inkFlower(x, y, 1);
        },
        heal: function (x, y, amount) {
            sys.floatText(x, y, '+' + Math.max(1, Math.round(amount)), palette_1.PALETTE.leafLight, 20, 0.9);
        },
        shield: function (x, y, amount) {
            sys.floatText(x, y, '⛨' + Math.max(1, Math.round(amount)), palette_1.PALETTE.stream, 20, 0.9);
            ripples.push({ x: x, y: y, life: 400, max: 400, r0: 10, r1: 30 });
        },
        bubble: function (fromX, fromY, toX, toY, label, onArrive) {
            bubbles.push({
                fromX: fromX,
                fromY: fromY,
                toX: toX,
                toY: toY,
                life: timing_1.TIMING.COMMAND_FLIGHT,
                max: timing_1.TIMING.COMMAND_FLIGHT,
                label: label,
                fired: false,
                onArrive: onArrive || null,
            });
        },
        after: function (ms, fn) {
            pendings.push({ at: now + ms, fn: fn });
        },
        shake: function (amount) {
            shakeAmp = Math.max(shakeAmp, amount);
            shakeUntil = now + 180;
        },
        shakeOffset: function (time) {
            if (shakeAmp <= 0)
                return { x: 0, y: 0 };
            var k = shakeAmp;
            return {
                x: Math.sin(time / 21) * k,
                y: Math.cos(time / 17) * k * 0.7,
            };
        },
        count: function () {
            return parts.length + texts.length + mosses.length + ripples.length;
        },
        clear: function () {
            parts.length = 0;
            texts.length = 0;
            mosses.length = 0;
            ripples.length = 0;
            bubbles.length = 0;
            pendings.length = 0;
            shakeAmp = 0;
        },
    };
    return sys;
}
function fadeInOut(t) {
    return t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
}
function drawLeaf(ctx, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.quadraticCurveTo(0, -size * 0.75, size, 0);
    ctx.quadraticCurveTo(0, size * 0.75, -size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha *= 0.5;
    (0, brush_1.strokeInk)(ctx, [
        { x: -size, y: 0 },
        { x: 0, y: 0 },
        { x: size, y: 0 },
    ], { width: 1.1, jitter: 0.7 });
}
function drawPetal(ctx, size, color) {
    ctx.fillStyle = color;
    (0, brush_1.blobPath)(ctx, -size, -size * 0.7, size * 2, size * 1.4, 1.6, 3);
    ctx.fill();
}
function drawFirefly(ctx, size, color, time, seed) {
    var pulse = 0.6 + 0.4 * Math.sin(time / 180 + seed);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.4);
    g.addColorStop(0, (0, palette_1.rgba)(color, 0.75 * pulse));
    g.addColorStop(1, (0, palette_1.rgba)(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, size * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.9 * pulse);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
}
function drawInkFlower(ctx, size, color, seed) {
    ctx.strokeStyle = (0, palette_1.rgba)(color, 0.7);
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    for (var i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2 + seed * 0.02;
        var r = size * (0.55 + 0.45 * ((i % 3) / 2));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
    }
}
function drawMoss(ctx, m, time) {
    var t = 1 - m.life / m.max;
    var breathe = 0.5 + 0.5 * Math.sin((time / 800) * Math.PI * 2);
    var scale = 1 + 0.06 * breathe;
    var a = (1 - t) * m.strength;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(scale, scale * 0.62);
    ctx.globalAlpha = 0.35 * a;
    ctx.fillStyle = palette_1.PALETTE.leafLight;
    (0, brush_1.blobPath)(ctx, -m.r, -m.r, m.r * 2, m.r * 2, 3.2, 11);
    ctx.fill();
    ctx.globalAlpha = 0.28 * a;
    ctx.strokeStyle = palette_1.PALETTE.moss;
    ctx.lineWidth = 2;
    (0, brush_1.blobPath)(ctx, -m.r * 0.82, -m.r * 0.82, m.r * 1.64, m.r * 1.64, 2.4, 17);
    ctx.stroke();
    ctx.restore();
}
function drawRipple(ctx, r) {
    var t = 1 - r.life / r.max;
    var rr = (0, ease_1.lerp)(r.r0, r.r1, (0, ease_1.easeOutQuad)(t));
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(1, 0.55);
    ctx.globalAlpha = (1 - t) * 0.45;
    ctx.strokeStyle = palette_1.PALETTE.moss;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
function drawFloat(ctx, t) {
    var k = 1 - t.life / t.max;
    var y = t.y - (0, ease_1.ease)(k) * t.rise;
    var a = k < 0.72 ? 1 : 1 - (k - 0.72) / 0.28;
    ctx.save();
    ctx.globalAlpha = (0, ease_1.clamp01)(a);
    ctx.translate(t.x, y);
    var s = t.emphasis * (1 + 0.35 * (1 - (0, ease_1.easeOutQuad)(Math.min(1, k * 3))));
    ctx.scale(s, s);
    ctx.font = 'bold ' + Math.round(t.size) + 'px ' + layout_1.LAYOUT.FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = (0, palette_1.rgba)(palette_1.PALETTE.inkSoft, 0.75);
    ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
}
function drawBubble(ctx, b) {
    var k = 1 - b.life / b.max;
    var x = (0, ease_1.lerp)(b.fromX, b.toX, (0, ease_1.ease)(k));
    var y = (0, ease_1.lerp)(b.fromY, b.toY, (0, ease_1.ease)(k)) - Math.sin(k * Math.PI) * 26;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = (0, palette_1.rgba)(palette_1.PALETTE.creamMist, 0.95);
    (0, brush_1.blobPath)(ctx, -30, -16, 60, 32, 2.2, 5);
    ctx.fill();
    ctx.strokeStyle = palette_1.PALETTE.inkSoft;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = palette_1.PALETTE.inkSoft;
    ctx.font = FX_FONT_SMALL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, 0, 1);
    ctx.restore();
}
/** 供渲染层复用的常量（避免各处出现魔法数）。 */
exports.FX = {
    MOSS_MS: 800,
    RIPPLE_MS: 250,
    DEATH_FIREFLY: 3,
    HIT_FLASH_MS: 80,
    SHAKE_PX: 4,
};
