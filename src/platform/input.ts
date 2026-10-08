/**
 * 输入：触摸/鼠标 → 逻辑坐标；提供 tap / 长按起拖 / 拖动 / 松手 的归一化手势。
 * 布阵拖拽要求长按 200ms 起拖（§2.6），因此这里维护按住时长。
 */
import { WX, HAS_WX, TouchEventLike, MouseEventLike } from './wx-shim';
import { toLogical } from './screen';
import { TIMING } from '../config/timing';

export type GestureEvent =
  | { type: 'down'; x: number; y: number; t: number }
  | { type: 'dragStart'; x: number; y: number; t: number }
  | { type: 'move'; x: number; y: number; t: number }
  | { type: 'up'; x: number; y: number; t: number; wasDrag: boolean; duration: number }
  | { type: 'cancel'; x: number; y: number; t: number };

export interface InputState {
  down: boolean;
  dragging: boolean;
  x: number;
  y: number;
  downX: number;
  downY: number;
  downAt: number;
  /** 移动距离阈值：超过即视为滑动（用于滚动战绩面板） */
  moved: boolean;
  /** 长按延迟由 update 判定 */
  longPressFired: boolean;
}

const state: InputState = {
  down: false, dragging: false, x: 0, y: 0, downX: 0, downY: 0, downAt: 0,
  moved: false, longPressFired: false
};

const listeners: ((e: GestureEvent) => void)[] = [];
const MOVE_THRESHOLD = 8;

export function onGesture(cb: (e: GestureEvent) => void): void {
  listeners.push(cb);
}

function emit(e: GestureEvent): void {
  for (let i = 0; i < listeners.length; i++) listeners[i](e);
}

/** 每帧调用（传入逻辑时间 ms），负责把「按住不动」升级为 dragStart。 */
export function updateInput(now: number): void {
  if (state.down && !state.dragging && !state.longPressFired && now - state.downAt >= TIMING.LONG_PRESS) {
    state.longPressFired = true;
    state.dragging = true;
    emit({ type: 'dragStart', x: state.x, y: state.y, t: now });
  }
}

export function isDragging(): boolean {
  return state.dragging;
}

export function pointer(): { x: number; y: number } {
  return { x: state.x, y: state.y };
}

/** 绑定宿主触摸事件。 */
export function bindInput(): void {
  if (!HAS_WX) return;

  const down = (cssX: number, cssY: number, t: number): void => {
    const p = toLogical(cssX, cssY);
    state.down = true; state.moved = false; state.dragging = false; state.longPressFired = false;
    state.x = p.x; state.y = p.y; state.downX = p.x; state.downY = p.y; state.downAt = t;
    emit({ type: 'down', x: p.x, y: p.y, t });
  };
  const move = (cssX: number, cssY: number, t: number): void => {
    const p = toLogical(cssX, cssY);
    state.x = p.x; state.y = p.y;
    if (state.down) {
      const dx = p.x - state.downX;
      const dy = p.y - state.downY;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
        state.moved = true;
        // 已在拖动中则持续；未达长按阈值时先不升级（避免误触发起拖）
        if (state.dragging) emit({ type: 'move', x: p.x, y: p.y, t });
      }
    }
    if (state.dragging) emit({ type: 'move', x: p.x, y: p.y, t });
    else emit({ type: 'move', x: p.x, y: p.y, t });
  };
  const up = (cssX: number, cssY: number, t: number): void => {
    const p = toLogical(cssX, cssY);
    const duration = t - state.downAt;
    const wasDrag = state.dragging;
    emit({ type: 'up', x: p.x, y: p.y, t, wasDrag, duration });
    state.down = false; state.dragging = false; state.longPressFired = false;
  };

  WX.onTouchStart((res: TouchEventLike) => {
    if (!res.touches || res.touches.length === 0) return;
    down(res.touches[0].clientX, res.touches[0].clientY, res.timeStamp || nowMs());
  });
  WX.onTouchMove((res: TouchEventLike) => {
    if (!res.touches || res.touches.length === 0) return;
    move(res.touches[0].clientX, res.touches[0].clientY, res.timeStamp || nowMs());
  });
  WX.onTouchEnd((res: TouchEventLike) => {
    const list = res.changedTouches && res.changedTouches.length ? res.changedTouches : res.touches;
    if (!list || list.length === 0) return;
    up(list[0].clientX, list[0].clientY, res.timeStamp || nowMs());
  });
  if (WX.onTouchCancel) {
    WX.onTouchCancel((res: TouchEventLike) => {
      emit({ type: 'cancel', x: state.x, y: state.y, t: res.timeStamp || nowMs() });
      state.down = false; state.dragging = false;
    });
  }
  // 开发者工具里也可用鼠标调试
  if (WX.onMouseDown && WX.onMouseMove && WX.onMouseUp) {
    WX.onMouseDown((res: MouseEventLike) => down(res.clientX, res.clientY, res.timeStamp || nowMs()));
    WX.onMouseMove((res: MouseEventLike) => move(res.clientX, res.clientY, res.timeStamp || nowMs()));
    WX.onMouseUp((res: MouseEventLike) => up(res.clientX, res.clientY, res.timeStamp || nowMs()));
  }
}

export function nowMs(): number {
  return Date.now();
}