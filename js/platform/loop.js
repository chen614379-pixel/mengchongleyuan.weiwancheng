"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLoop = startLoop;
exports.stopLoop = stopLoop;
exports.setPaused = setPaused;
exports.isPaused = isPaused;
exports.getLogicTime = getLogicTime;
exports.resetLogicTime = resetLogicTime;
/**
 * 主循环：渲染 60fps + 逻辑固定 20Hz（§1：dt=50ms 累加器）。
 * 追帧上限 5 帧，避免后台回来时的死亡螺旋；隐藏时暂停。
 */
var timing_1 = require("../config/timing");
var rafId = 0;
var running = false;
var last = 0;
var acc = 0;
var logicTime = 0;
var paused = false;
var MAX_CATCHUP = 5;
function startLoop(hooks) {
    if (running)
        return;
    running = true;
    last = 0;
    acc = 0;
    var frame = function (t) {
        if (!running)
            return;
        rafId = requestAnimationFrame(frame);
        if (paused) {
            last = t;
            return;
        }
        if (last === 0)
            last = t;
        var dt = t - last;
        last = t;
        if (dt < 0)
            dt = 0;
        if (dt > 250)
            dt = 250; // 切前台/卡顿
        acc += dt;
        var steps = 0;
        while (acc >= timing_1.TIMING.LOGIC_DT && steps < MAX_CATCHUP) {
            acc -= timing_1.TIMING.LOGIC_DT;
            logicTime += timing_1.TIMING.LOGIC_DT;
            hooks.tick(logicTime);
            steps++;
        }
        if (steps >= MAX_CATCHUP)
            acc = 0;
        hooks.render(dt, acc / timing_1.TIMING.LOGIC_DT);
    };
    rafId = requestAnimationFrame(frame);
}
function stopLoop() {
    running = false;
    if (rafId)
        cancelAnimationFrame(rafId);
    rafId = 0;
}
function setPaused(v) {
    paused = v;
}
function isPaused() {
    return paused;
}
/** 逻辑时间（ms），与 core 的 state.time 同源，供 UI 动画使用。 */
function getLogicTime() {
    return logicTime;
}
/** 重置逻辑时钟（新开一局时调用）。 */
function resetLogicTime() {
    logicTime = 0;
    acc = 0;
    last = 0;
}
