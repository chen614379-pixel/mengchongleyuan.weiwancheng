/**
 * 统一缓动（§2.7：全局缓动 cubic-bezier(.22,.9,.32,1)、200~320ms）。
 *
 * 规格禁止各模块手写缓动曲线，所有插值都必须从这里取。
 */
import { TIMING } from '../config/timing';

/** 全局主缓动控制点（来自 config，勿改）。 */
export const EASE_BEZIER: number[] = TIMING.EASE;
export const EASE_MS_MIN = TIMING.EASE_MS_MIN;
export const EASE_MS_MAX = TIMING.EASE_MS_MAX;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function clamp(t: number, min: number, max: number): number {
  return t < min ? min : t > max ? max : t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  if (b === a) return 0;
  return clamp01((v - a) / (b - a));
}

export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** 三次贝塞尔缓动求值（牛顿迭代 6 次，足够 60fps 精度）。 */
export function bezier(t: number, p?: number[]): number {
  const c = p || EASE_BEZIER;
  const x1 = c[0];
  const y1 = c[1];
  const x2 = c[2];
  const y2 = c[3];
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  let u = x;
  for (let i = 0; i < 6; i++) {
    const fx = ((ax * u + bx) * u + cx) * u - x;
    const dfx = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(dfx) < 1e-6) break;
    u -= fx / dfx;
  }
  u = clamp01(u);
  return ((ay * u + by) * u + cy) * u;
}

/** 主缓动别名：默认取贝塞尔曲线。 */
export function ease(t: number): number {
  return bezier(t);
}

export function easeOutQuad(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  const k = 1 - x;
  return 1 - k * k * k;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** 回弹（松手回位、落点吸附）。 */
export function easeOutBack(t: number, overshoot?: number): number {
  const s = overshoot === undefined ? 1.34 : overshoot;
  const x = clamp01(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
}

/** 弹性（卡片飞出、奖励数字）。 */
export function easeOutElastic(t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  const c = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c) + 1;
}

/** 呼吸（危险态环缩放、苔藓光斑 0.8s 循环）。 */
export function breathe(time: number, periodMs: number): number {
  if (periodMs <= 0) return 0;
  return (Math.sin((time / periodMs) * Math.PI * 2) + 1) / 2;
}

/** 正弦起伏（2.5Hz 行走 bob）。 */
export function bob(time: number, hz: number, amp: number): number {
  return Math.sin((time / 1000) * hz * Math.PI * 2) * amp;
}

/** 草叶摆动（0.5Hz ±3px）。 */
export function sway(time: number, phase: number): number {
  return Math.sin((time / 1000) * Math.PI * 2 * 0.5 + phase) * 3;
}

/** 把基准时长夹到 200~320ms 并归一化进度。 */
export function phaseOf(elapsed: number, baseMs: number): number {
  const d = clamp(baseMs, EASE_MS_MIN, EASE_MS_MAX);
  return clamp01(elapsed / d);
}

/** 循环进度（0~1）。 */
export function cycle(time: number, periodMs: number, offset?: number): number {
  if (periodMs <= 0) return 0;
  const o = offset || 0;
  let t = (time / periodMs + o) % 1;
  if (t < 0) t += 1;
  return t;
}

/** 线性衰减的比例（受击闪白、残影追平）。 */
export function decay(elapsed: number, totalMs: number): number {
  if (totalMs <= 0) return 0;
  return clamp01(1 - elapsed / totalMs);
}

/** 每单位错开的延迟（列表入场用）。 */
export function stagger(index: number, stepMs: number, totalMs?: number): number {
  const t = index * stepMs;
  return totalMs === undefined ? t : Math.min(t, totalMs);
}