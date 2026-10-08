"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onGesture = onGesture;
exports.updateInput = updateInput;
exports.isDragging = isDragging;
exports.pointer = pointer;
exports.bindInput = bindInput;
exports.nowMs = nowMs;
/**
 * 输入：触摸/鼠标 → 逻辑坐标；提供 tap / 长按起拖 / 拖动 / 松手 的归一化手势。
 * 布阵拖拽要求长按 200ms 起拖（§2.6），因此这里维护按住时长。
 */
var wx_shim_1 = require("./wx-shim");
var screen_1 = require("./screen");
var timing_1 = require("../config/timing");
var state = {
    down: false, dragging: false, x: 0, y: 0, downX: 0, downY: 0, downAt: 0,
    moved: false, longPressFired: false
};
var listeners = [];
var MOVE_THRESHOLD = 8;
function onGesture(cb) {
    listeners.push(cb);
}
function emit(e) {
    for (var i = 0; i < listeners.length; i++)
        listeners[i](e);
}
/** 每帧调用（传入逻辑时间 ms），负责把「按住不动」升级为 dragStart。 */
function updateInput(now) {
    if (state.down && !state.dragging && !state.longPressFired && now - state.downAt >= timing_1.TIMING.LONG_PRESS) {
        state.longPressFired = true;
        state.dragging = true;
        emit({ type: 'dragStart', x: state.x, y: state.y, t: now });
    }
}
function isDragging() {
    return state.dragging;
}
function pointer() {
    return { x: state.x, y: state.y };
}
/** 绑定宿主触摸事件。 */
function bindInput() {
    if (!wx_shim_1.HAS_WX)
        return;
    var down = function (cssX, cssY, t) {
        var p = (0, screen_1.toLogical)(cssX, cssY);
        state.down = true;
        state.moved = false;
        state.dragging = false;
        state.longPressFired = false;
        state.x = p.x;
        state.y = p.y;
        state.downX = p.x;
        state.downY = p.y;
        state.downAt = t;
        emit({ type: 'down', x: p.x, y: p.y, t: t });
    };
    var move = function (cssX, cssY, t) {
        var p = (0, screen_1.toLogical)(cssX, cssY);
        state.x = p.x;
        state.y = p.y;
        if (state.down) {
            var dx = p.x - state.downX;
            var dy = p.y - state.downY;
            if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
                state.moved = true;
                // 已在拖动中则持续；未达长按阈值时先不升级（避免误触发起拖）
                if (state.dragging)
                    emit({ type: 'move', x: p.x, y: p.y, t: t });
            }
        }
        if (state.dragging)
            emit({ type: 'move', x: p.x, y: p.y, t: t });
        else
            emit({ type: 'move', x: p.x, y: p.y, t: t });
    };
    var up = function (cssX, cssY, t) {
        var p = (0, screen_1.toLogical)(cssX, cssY);
        var duration = t - state.downAt;
        var wasDrag = state.dragging;
        emit({ type: 'up', x: p.x, y: p.y, t: t, wasDrag: wasDrag, duration: duration });
        state.down = false;
        state.dragging = false;
        state.longPressFired = false;
    };
    wx_shim_1.WX.onTouchStart(function (res) {
        if (!res.touches || res.touches.length === 0)
            return;
        down(res.touches[0].clientX, res.touches[0].clientY, res.timeStamp || nowMs());
    });
    wx_shim_1.WX.onTouchMove(function (res) {
        if (!res.touches || res.touches.length === 0)
            return;
        move(res.touches[0].clientX, res.touches[0].clientY, res.timeStamp || nowMs());
    });
    wx_shim_1.WX.onTouchEnd(function (res) {
        var list = res.changedTouches && res.changedTouches.length ? res.changedTouches : res.touches;
        if (!list || list.length === 0)
            return;
        up(list[0].clientX, list[0].clientY, res.timeStamp || nowMs());
    });
    if (wx_shim_1.WX.onTouchCancel) {
        wx_shim_1.WX.onTouchCancel(function (res) {
            emit({ type: 'cancel', x: state.x, y: state.y, t: res.timeStamp || nowMs() });
            state.down = false;
            state.dragging = false;
        });
    }
    // 开发者工具里也可用鼠标调试
    if (wx_shim_1.WX.onMouseDown && wx_shim_1.WX.onMouseMove && wx_shim_1.WX.onMouseUp) {
        wx_shim_1.WX.onMouseDown(function (res) { return down(res.clientX, res.clientY, res.timeStamp || nowMs()); });
        wx_shim_1.WX.onMouseMove(function (res) { return move(res.clientX, res.clientY, res.timeStamp || nowMs()); });
        wx_shim_1.WX.onMouseUp(function (res) { return up(res.clientX, res.clientY, res.timeStamp || nowMs()); });
    }
}
function nowMs() {
    return Date.now();
}
