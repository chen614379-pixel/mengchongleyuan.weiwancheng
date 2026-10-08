/**
 * 场景管理：栈式场景 + 手绘雾气/纸页转场（§2.7 揭示雾气卷帘的复用）。
 */
import { GestureEvent } from '../platform/input';
import { PALETTE, rgba } from '../config/palette';
import { sceneBox } from '../platform/screen';

export interface Scene {
  readonly name: string;
  enter(params?: any): void;
  exit?(): void;
  tick(logicTime: number, dtMs?: number): void;
  render(ctx: any, renderTime: number, alpha: number): void;
  gesture?(e: GestureEvent): void;
}

export type TransitionKind = 'fog' | 'fade' | 'none';

interface Transition {
  kind: TransitionKind;
  /** 0 → 半程（旧场景隐去）→ 1（新场景出现） */
  t: number;
  half: number;
  total: number;
  pending: Scene | null;
  params?: any;
  swapped: boolean;
  pop: boolean;
}

const stack: Scene[] = [];
let trans: Transition | null = null;

export function current(): Scene | null {
  return stack.length ? stack[stack.length - 1] : null;
}

export function push(scene: Scene, params?: any): void {
  beginTransition(scene, params, 'fog', false);
}

export function replace(scene: Scene, params?: any): void {
  beginTransition(scene, params, 'fog', false);
}

export function pop(): void {
  if (stack.length <= 1) return;
  beginTransition(null, undefined, 'fade', true);
}

function beginTransition(scene: Scene | null, params: any, kind: TransitionKind, isPop: boolean): void {
  const total = kind === 'none' ? 1 : (kind === 'fog' ? 800 : 500);
  trans = { kind, t: 0, half: total / 2, total, pending: scene, params, swapped: false, pop: isPop };
}

/** 立即切换（无转场，用于异常兜底）。 */
export function swapNow(scene: Scene, params?: any): void {
  const old = current();
  if (old && old.exit) old.exit();
  stack.pop();
  stack.push(scene);
  scene.enter(params);
}

export function isTransitioning(): boolean {
  return trans !== null;
}

export function tickScene(dtMs: number, logicTime: number): void {
  if (trans) {
    trans.t += dtMs;
    if (!trans.swapped && trans.t >= trans.half) {
      const old = current();
      if (old && old.exit) old.exit();
      if (trans.pop) {
        if (stack.length > 1) stack.pop();
      } else if (trans.pending) {
        stack.push(trans.pending);
      }
      const next = current();
      if (next) next.enter(trans.params);
      trans.swapped = true;
    }
    if (trans.t >= trans.total) trans = null;
  }
  const sc = current();
  if (sc) sc.tick(logicTime, dtMs);
}

export function renderScene(ctx: any, renderTime: number, alpha: number): void {
  const sc = current();
  if (sc) sc.render(ctx, renderTime, alpha);
  if (trans && trans.kind !== 'none') {
    const p = trans.t / trans.total;
    const cover = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
    drawCurtain(ctx, cover, trans.kind);
  }
}

export function gestureScene(e: GestureEvent): void {
  if (trans) return;
  const sc = current();
  if (sc && sc.gesture) sc.gesture(e);
}

/** 雾气卷帘/纸页淡出：用水彩纸色 + 不透明雾气盖住整屏。 */
function drawCurtain(ctx: any, cover: number, kind: TransitionKind): void {
  if (cover <= 0.001) return;
  // 自适应全屏：卷帘要盖住整个逻辑可视区（含外扩留边）
  const box = sceneBox();
  const w = box.w;
  const h = box.h;
  const ox = box.x;
  const oy = box.y;
  ctx.save();
  ctx.globalAlpha = Math.min(1, cover * 1.15);
  if (kind === 'fog') {
    ctx.fillStyle = rgba(PALETTE.creamMist, 0.92);
    ctx.fillRect(ox - 40, oy - 40, w + 80, h + 80);
    // 几缕雾气边缘，避免看起来像纯色遮罩
    ctx.globalAlpha = Math.min(1, cover) * 0.5;
    ctx.fillStyle = rgba(PALETTE.skyWarm, 0.35);
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const y = oy + ((i + 0.5) / bands) * h + Math.sin(i * 2.1) * 26;
      ctx.fillRect(ox - 40, y, w + 80, 26 + (i % 2) * 18);
    }
  } else {
    ctx.fillStyle = rgba(PALETTE.paper, 0.96);
    ctx.fillRect(ox - 40, oy - 40, w + 80, h + 80);
  }
  ctx.restore();
}

export function resetStack(first: Scene, params?: any): void {
  while (stack.length) {
    const s = stack.pop();
    if (s && s.exit) s.exit();
  }
  stack.push(first);
  first.enter(params);
}