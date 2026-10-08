/**
 * 主循环：渲染 60fps + 逻辑固定 20Hz（§1：dt=50ms 累加器）。
 * 追帧上限 5 帧，避免后台回来时的死亡螺旋；隐藏时暂停。
 */
import { TIMING } from '../config/timing';

export interface LoopHooks {
  /** 逻辑帧：固定 50ms */
  tick(logicTime: number): void;
  /** 渲染帧：传入插值系数 alpha（0~1，用于位置插值） */
  render(dtMs: number, alpha: number): void;
}

let rafId = 0;
let running = false;
let last = 0;
let acc = 0;
let logicTime = 0;
let paused = false;
const MAX_CATCHUP = 5;

export function startLoop(hooks: LoopHooks): void {
  if (running) return;
  running = true;
  last = 0;
  acc = 0;
  const frame = (t: number): void => {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (paused) { last = t; return; }
    if (last === 0) last = t;
    let dt = t - last;
    last = t;
    if (dt < 0) dt = 0;
    if (dt > 250) dt = 250; // 切前台/卡顿
    acc += dt;
    let steps = 0;
    while (acc >= TIMING.LOGIC_DT && steps < MAX_CATCHUP) {
      acc -= TIMING.LOGIC_DT;
      logicTime += TIMING.LOGIC_DT;
      hooks.tick(logicTime);
      steps++;
    }
    if (steps >= MAX_CATCHUP) acc = 0;
    hooks.render(dt, acc / TIMING.LOGIC_DT);
  };
  rafId = requestAnimationFrame(frame);
}

export function stopLoop(): void {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

export function setPaused(v: boolean): void {
  paused = v;
}

export function isPaused(): boolean {
  return paused;
}

/** 逻辑时间（ms），与 core 的 state.time 同源，供 UI 动画使用。 */
export function getLogicTime(): number {
  return logicTime;
}

/** 重置逻辑时钟（新开一局时调用）。 */
export function resetLogicTime(): void {
  logicTime = 0;
  acc = 0;
  last = 0;
}