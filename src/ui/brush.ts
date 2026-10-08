/**
 * 手绘抖动路径生成器（§2.1 第一原则 / §2.4 / §2.8 环）。
 *
 * 所有轮廓线都必须经过这里：在完美路径上叠加 ±1.2px 的**确定性**噪声。
 * 噪声来自预生成的噪声表 + seed，绝不使用 `Math.random()`，因此同一形状
 * 每帧得到同一轮廓，不会闪烁。
 *
 * 同时提供水彩填充（两层：底色 + 冷色暗部）、湿边水痕、纸纹颗粒与弧线墨迹。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE, rgba, tint } from '../config/palette';

export interface P {
  x: number;
  y: number;
}

/** 噪声表长度（2 的幂，按位取模）。 */
const TABLE_SIZE = 512;
const TABLE_MASK = TABLE_SIZE - 1;
const NOISE_STRIDE = 37;
const NOISE_SALT = 1013;

let tableSeed = 0x9e3779b9;
let noiseTable: number[] = buildTable(tableSeed);

/** 用 LCG（不用 Math.imul，ES5 lib 无此声明）生成 [-1,1] 噪声表。 */
function buildTable(seed: number): number[] {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  const out: number[] = [];
  for (let i = 0; i < TABLE_SIZE; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const hi = s >>> 8;
    const f = ((hi ^ (s >>> 3)) >>> 0) / 4294967296;
    out.push(f * 2 - 1);
  }
  return out;
}

/** 设定全局抖动种子（同一局内固定，保证形状稳定）。 */
export function brushSeed(seed: number): void {
  const s = seed >>> 0;
  tableSeed = s === 0 ? 0x9e3779b9 : s;
  noiseTable = buildTable(tableSeed);
}

/** 当前种子（调试/自检用）。 */
export function currentBrushSeed(): number {
  return tableSeed;
}

/** 取一条确定性噪声，[-1,1]。 */
export function noiseAt(index: number, seedIndex: number): number {
  let idx = (index * NOISE_STRIDE + seedIndex * 101 + NOISE_SALT) % TABLE_SIZE;
  if (idx < 0) idx += TABLE_SIZE;
  return noiseTable[idx & TABLE_MASK];
}

/** 把折线按 step 像素加密，得到足够密的采样点。 */
function densify(pts: P[], step: number): P[] {
  if (pts.length < 2) return pts.slice();
  const out: P[] = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const n = d <= step ? 1 : Math.ceil(d / step);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  return out;
}

/**
 * 完美路径 → 手绘抖动路径。
 * 每个采样点沿法线偏移 amount*n，并沿切线轻微前后错动（模拟手抖的张力）。
 */
export function jitterPoints(pts: P[], amount: number, seedIndex: number, closed: boolean): P[] {
  if (pts.length === 0) return [];
  const base = closed && pts.length > 2 ? pts.concat([{ x: pts[0].x, y: pts[0].y }]) : pts;
  const dense = densify(base, 7);
  const out: P[] = [];
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    const a = dense[i > 0 ? i - 1 : i];
    const b = dense[i < dense.length - 1 ? i + 1 : i];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    const off = amount * noiseAt(i, seedIndex);
    const along = amount * 0.45 * noiseAt(i + 977, seedIndex);
    out.push({ x: p.x + nx * off + tx * along, y: p.y + ny * off + ty * along });
  }
  return out;
}

/** 描出折线路径（已足够密，lineTo 即为手绘观感）。 */
export function tracePath(ctx: CanvasRenderingContext2D, pts: P[], close: boolean): void {
  ctx.beginPath();
  if (pts.length === 0) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

/** 点集包围盒。 */
export function bounds(pts: P[]): { x: number; y: number; w: number; h: number } {
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = pts[0].x;
  let maxX = pts[0].x;
  let minY = pts[0].y;
  let maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * 手绘墨线描边（2.5~3px ink-soft）。默认走抖动，禁止用 strokeRect。
 */
export function strokeInk(
  ctx: CanvasRenderingContext2D,
  pts: P[],
  opts?: { color?: string; width?: number; jitter?: number; close?: boolean; seedIndex?: number },
): void {
  const o = opts || {};
  const color = o.color || PALETTE.inkSoft;
  const width = o.width === undefined ? LAYOUT.STROKE : o.width;
  const jitter = o.jitter === undefined ? 1.2 : o.jitter;
  const seedIndex = o.seedIndex === undefined ? 0 : o.seedIndex;
  const closed = !!o.close;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const main = jitterPoints(pts, jitter, seedIndex, closed);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  tracePath(ctx, main, closed);
  ctx.stroke();

  // 第二遍轻描：模拟毛笔的复笔与飞白，降低不透明度。
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = width * 0.72;
  tracePath(ctx, jitterPoints(pts, jitter * 1.7, seedIndex + 7, closed), closed);
  ctx.stroke();
  ctx.restore();
}

/**
 * 水彩填充：底层主色 + 第二层冷色暗部（§2.1 禁止纯黑暗部）+ 湿边水痕。
 */
export function fillWatercolor(
  ctx: CanvasRenderingContext2D,
  pts: P[],
  color: string,
  opts?: { alpha?: number; layers?: number; wetEdge?: boolean; seedIndex?: number },
): void {
  const o = opts || {};
  const alpha = o.alpha === undefined ? 0.5 : o.alpha;
  const layers = o.layers === undefined ? 2 : o.layers;
  const wetEdge = o.wetEdge === undefined ? true : o.wetEdge;
  const seedIndex = o.seedIndex === undefined ? 0 : o.seedIndex;

  const path = jitterPoints(pts, 1.35, seedIndex, true);
  const bb = bounds(path);
  ctx.save();
  tracePath(ctx, path, true);
  ctx.clip();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(bb.x - 6, bb.y - 6, bb.w + 12, bb.h + 12);

  // 暗部：冷色偏紫灰（twilight / ink-soft 方向），不是纯黑。
  for (let i = 1; i < layers; i++) {
    const dark = tint(color, 0.30 + i * 0.06, PALETTE.twilight);
    const ox = noiseAt(i * 13, seedIndex) * bb.w * 0.16;
    const oy = bb.h * (0.16 + i * 0.1) + noiseAt(i * 29, seedIndex) * bb.h * 0.1;
    ctx.globalAlpha = alpha * 0.42;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(bb.x - 4, bb.y + oy + bb.h * 0.06);
    ctx.quadraticCurveTo(bb.x + bb.w * 0.5 + ox, bb.y + oy - bb.h * 0.14, bb.x + bb.w + 4, bb.y + oy + bb.h * 0.14);
    ctx.lineTo(bb.x + bb.w + 4, bb.y + bb.h + 4);
    ctx.lineTo(bb.x - 4, bb.y + bb.h + 4);
    ctx.closePath();
    ctx.fill();
  }

  // 湿边：内缘更深的一道水痕，是水彩最关键的特征。
  if (wetEdge) {
    ctx.globalAlpha = Math.min(1, alpha + 0.2);
    ctx.strokeStyle = tint(color, 0.24, PALETTE.inkSoft);
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    tracePath(ctx, path, true);
    ctx.stroke();
  }
  ctx.restore();
}

/** 圆角矩形采样点（顺时针，闭合）。 */
export function roundedRectPoints(x: number, y: number, w: number, h: number, r: number): P[] {
  const rr = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
  const seg = 5;
  const corners = [
    { cx: x + w - rr, cy: y + rr, a0: -Math.PI / 2, a1: 0 },
    { cx: x + w - rr, cy: y + h - rr, a0: 0, a1: Math.PI / 2 },
    { cx: x + rr, cy: y + h - rr, a0: Math.PI / 2, a1: Math.PI },
    { cx: x + rr, cy: y + rr, a0: Math.PI, a1: Math.PI * 1.5 },
  ];
  const pts: P[] = [{ x: x + rr, y: y }, { x: x + w - rr, y: y }];
  for (let c = 0; c < corners.length; c++) {
    const k = corners[c];
    for (let i = 0; i <= seg; i++) {
      const a = k.a0 + (k.a1 - k.a0) * (i / seg);
      pts.push({ x: k.cx + Math.cos(a) * rr, y: k.cy + Math.sin(a) * rr });
    }
  }
  return pts;
}

/**
 * 圆角矩形手绘路径（半径 ≥14，且必须带手绘不完美）。
 * `roundRect` API 在小程序里不稳定，一律用本函数。
 */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  jitter?: number,
  seedIndex?: number,
): void {
  const pts = roundedRectPoints(x, y, w, h, r);
  const j = jitter === undefined ? 0.9 : jitter;
  const si = seedIndex === undefined ? 0 : seedIndex;
  tracePath(ctx, j > 0 ? jitterPoints(pts, j, si, false) : pts, true);
}

/** 有机团块路径（苔藓光斑、水彩晕染、云、灌木都用它）。 */
export function blobPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  jitter: number,
  seedIndex?: number,
): void {
  const si = seedIndex === undefined ? 0 : seedIndex;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const n = 28;
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + jitter * 0.08 * noiseAt(i, si);
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  tracePath(ctx, pts, true);
}

/** 圆弧采样点。 */
export function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): P[] {
  const n = Math.max(2, Math.floor(steps));
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/**
 * 手绘圆弧墨迹（血量环专用，§2.8）：半径与线宽都带确定性噪声，
 * 不允许直接 `ctx.arc()` 出图。
 */
export function strokeArcInk(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  color: string,
  width: number,
  jitter: number,
  seedIndex: number,
  widthJitter?: number,
): void {
  const span = Math.abs(a1 - a0);
  const steps = Math.max(6, Math.ceil((span / (Math.PI * 2)) * 46));
  const raw = arcPoints(cx, cy, r, a0, a1, steps);
  const pts: P[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const off = jitter * noiseAt(i, seedIndex);
    pts.push({ x: cx + (dx / len) * (len + off), y: cy + (dy / len) * (len + off) });
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;

  if (!widthJitter) {
    ctx.lineWidth = width;
    tracePath(ctx, pts, false);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 线宽也带噪声：逐段描，模拟笔压变化。
  for (let i = 1; i < pts.length; i++) {
    ctx.lineWidth = Math.max(0.6, width + widthJitter * noiseAt(i + 313, seedIndex));
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

/** 纸纹颗粒：低频斑点 + 细小噪点，给天空/面板/卡面加水彩纸质感。 */
export function paperGrain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
  seedIndex: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.inkSoft;
  const count = Math.min(120, Math.floor((w * h) / 5200));
  for (let i = 0; i < count; i++) {
    const nx = x + ((noiseAt(i * 3, seedIndex) + 1) / 2) * w;
    const ny = y + ((noiseAt(i * 5 + 41, seedIndex) + 1) / 2) * h;
    const s = 0.6 + ((noiseAt(i * 7 + 13, seedIndex) + 1) / 2) * 1.5;
    ctx.fillRect(nx, ny, s, s);
  }
  // 大颗粒的冷色水渍（让平涂区域不呆板）
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = tint(PALETTE.creamMist, 0.25, PALETTE.stream);
  const bigs = Math.min(18, Math.floor(w / 60) + 3);
  for (let i = 0; i < bigs; i++) {
    const nx = x + ((noiseAt(i * 11 + 71, seedIndex) + 1) / 2) * w;
    const ny = y + ((noiseAt(i * 17 + 91, seedIndex) + 1) / 2) * h;
    ctx.beginPath();
    ctx.arc(nx, ny, 3 + ((noiseAt(i * 19 + 7, seedIndex) + 1) / 2) * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 手绘水彩暗部投影（§2.4：偏移 (0,4)、alpha 0.18，不用硬阴影）。 */
export function dropShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  seedIndex?: number,
): void {
  ctx.save();
  ctx.globalAlpha = LAYOUT.SHADOW.alpha;
  ctx.fillStyle = tint(PALETTE.soil, 0.55, PALETTE.forestDeep);
  roundRectPath(ctx, x, y + LAYOUT.SHADOW.dy, w, h, r, 1.4, (seedIndex === undefined ? 0 : seedIndex) + 5);
  ctx.fill();
  ctx.restore();
}

/** 便捷：用 rgba(PALETTE.x, a)，避免 render 层出现魔法色值。 */
export function withAlpha(keyOrHex: string, alpha: number): string {
  return rgba(keyOrHex, alpha);
}