/**
 * 渲染层共享画笔库（父级约定：ui/ 目录已冻结，新增绘图工具放这里）。
 *
 * 所有道具/背景元素都只用 `ui/brush` 的手绘路径 + 水彩填充来画：
 * 没有 `strokeRect`、没有完美圆弧、没有渐变按钮、没有发光。
 */
import { PALETTE, rgba, tint } from '../config/palette';
import { fillWatercolor, strokeInk, blobPath, roundRectPath, jitterPoints, tracePath, bounds, P } from '../ui/brush';
import { noiseAt } from '../ui/brush';

export { P };

/** 画面上的浅色水彩底（天空、面板、卡面通用）。 */
export function paperBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha?: number,
  seedIndex?: number,
): void {
  const si = seedIndex === undefined ? 0 : seedIndex;
  const pts: P[] = [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ];
  fillWatercolor(ctx, pts, color, {
    alpha: alpha === undefined ? 0.9 : alpha,
    layers: 2,
    wetEdge: false,
    seedIndex: si,
  });
}

/** 木纹（木牌、卡框、替补席木架都用它）。 */
export function woodGrain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seedIndex: number,
  vertical?: boolean,
): void {
  const lines = Math.max(3, Math.floor((vertical ? w : h) / 7));
  const span = vertical ? h : w;
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = tint(PALETTE.bark, 0.4, PALETTE.forestDeep);
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < lines; i++) {
    const off = ((i + 0.5) / lines) * (vertical ? w : h) + noiseAt(i * 3, seedIndex) * 2.2;
    const pts: P[] = [];
    const segs = Math.max(3, Math.floor(span / 26));
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const wob = noiseAt(i * 11 + k * 5, seedIndex) * 1.8;
      const a = vertical ? x + off + wob : x + t * span;
      const b = vertical ? y + t * span : y + off + wob;
      pts.push({ x: a, y: b });
    }
    tracePath(ctx, jitterPoints(pts, 0.7, seedIndex + i * 7, false), false);
    ctx.stroke();
  }
  ctx.restore();
}

/** 叶片路径（尖端朝向 angle）。 */
export function leafPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  angle: number,
  seedIndex: number,
  widthScale?: number,
): P[] {
  const wf = widthScale === undefined ? 0.46 : widthScale;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const nx = -sin;
  const ny = cos;
  const pts: P[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const along = (t - 0.5) * len;
    const half = Math.sin(t * Math.PI) * len * wf * (1 + noiseAt(i, seedIndex) * 0.1);
    pts.push({ x: cx + cos * along + nx * half, y: cy + sin * along + ny * half });
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const along = (t - 0.5) * len;
    const half = Math.sin(t * Math.PI) * len * wf * (1 + noiseAt(i + 31, seedIndex) * 0.1);
    pts.push({ x: cx + cos * along - nx * half, y: cy + sin * along - ny * half });
  }
  return pts;
}

/** 画一片叶子（含中脉与一侧高光，§2.4 每个图标带一个暖色高光点）。 */
export function drawLeaf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  angle: number,
  color: string,
  seedIndex: number,
  outline?: boolean,
): void {
  const pts = leafPath(ctx, cx, cy, len, angle, seedIndex);
  fillWatercolor(ctx, pts, color, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 3 });
  // 中脉
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  strokeInk(ctx, [
    { x: cx - cos * len * 0.44, y: cy - sin * len * 0.44 },
    { x: cx + cos * len * 0.46, y: cy + sin * len * 0.46 },
  ], { width: 1.6, jitter: 0.6, color: tint(color, 0.3, PALETTE.forestDeep), seedIndex: seedIndex + 5 });
  // 暖色高光
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = PALETTE.sunbeam;
  ctx.beginPath();
  ctx.arc(cx - sin * len * 0.1 + cos * len * 0.08, cy + cos * len * 0.1 + sin * len * 0.08, len * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (outline !== false) strokeInk(ctx, pts, { width: 2.2, close: true, seedIndex: seedIndex + 7 });
}

/** 藤蔓：沿折线的细线 + 间隔小叶。 */
export function drawVine(
  ctx: CanvasRenderingContext2D,
  pts: P[],
  seedIndex: number,
  opts?: { width?: number; leafEvery?: number; leafLen?: number; color?: string },
): void {
  const o = opts || {};
  const width = o.width === undefined ? 2.4 : o.width;
  const every = o.leafEvery === undefined ? 34 : o.leafEvery;
  const leafLen = o.leafLen === undefined ? 12 : o.leafLen;
  strokeInk(ctx, pts, { width, jitter: 1.1, color: tint(PALETTE.bark, 0.25, PALETTE.forestDeep), seedIndex });
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    acc += d;
    if (acc >= every) {
      acc = 0;
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + (noiseAt(i, seedIndex + 9) > 0 ? 1.1 : -1.1);
      drawLeaf(ctx, b.x, b.y, leafLen, ang, o.color || PALETTE.leafMid, seedIndex + i * 3, false);
    }
  }
}

/** 阔叶树（树冠用几个叠加水彩团块，避免死板圆）。 */
export function drawBroadleafTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  canopy: string,
  seedIndex: number,
  sway?: number,
): void {
  const sw = sway === undefined ? 0 : sway;
  const trunkW = Math.max(6, height * 0.09);
  const trunk: P[] = [
    { x: x - trunkW / 2 - 2, y: baseY },
    { x: x - trunkW * 0.3 + sw * 0.3, y: baseY - height * 0.55 },
    { x: x - trunkW * 0.4 + sw, y: baseY - height * 0.78 },
    { x: x + trunkW * 0.4 + sw, y: baseY - height * 0.78 },
    { x: x + trunkW * 0.34 + sw * 0.4, y: baseY - height * 0.52 },
    { x: x + trunkW / 2 + 2, y: baseY },
  ];
  fillWatercolor(ctx, trunk, PALETTE.bark, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
  strokeInk(ctx, trunk, { width: 2.6, close: true, seedIndex: seedIndex + 2 });

  const cy = baseY - height * 0.92 + sw * 0.8;
  const r = height * 0.3;
  // 树冠：几个大团叠色，避免死板圆
  const blobs = 5;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2;
    const ox = Math.cos(a) * r * 0.62;
    const oy = Math.sin(a) * r * 0.4;
    const rx = r * (0.95 + noiseAt(i, seedIndex) * 0.12);
    const ry = r * 0.78;
    blobPath(ctx, x + ox - rx, cy + oy - ry, rx * 2, ry * 2, 1.1, seedIndex + 20 + i);
    fillWatercolor(ctx, [
      { x: x + ox - rx, y: cy + oy - ry },
      { x: x + ox + rx, y: cy + oy - ry },
      { x: x + ox + rx, y: cy + oy + ry },
      { x: x + ox - rx, y: cy + oy + ry },
    ], i % 2 === 0 ? canopy : tint(canopy, 0.3, PALETTE.forestDeep), {
      alpha: 0.9, layers: 2, wetEdge: true, seedIndex: seedIndex + 30 + i,
    });
  }
  strokeInk(ctx, [
    { x: x - r * 1.15, y: cy + r * 0.45 },
    { x: x - r * 0.4, y: cy - r * 0.75 },
    { x: x + r * 0.35, y: cy - r * 0.66 },
    { x: x + r * 1.18, y: cy + r * 0.4 },
  ], { width: 2.8, jitter: 1.5, color: tint(canopy, 0.45, PALETTE.forestDeep), seedIndex: seedIndex + 40 });
}

/** 针叶树（远景剪影）。 */
export function drawPineTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  color: string,
  seedIndex: number,
  alpha: number,
): void {
  const w = height * 0.42;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const y = baseY - height * (0.24 + t * 0.72);
    const ww = w * (1.05 - t * 0.72);
    const pts: P[] = [
      { x: x - ww, y: y + height * 0.2 },
      { x: x, y: y - height * 0.18 },
      { x: x + ww, y: y + height * 0.2 },
    ];
    fillWatercolor(ctx, pts, i % 2 === 0 ? color : tint(color, 0.22, PALETTE.forestDeep), {
      alpha: 0.92, layers: 2, wetEdge: false, seedIndex: seedIndex + i,
    });
    strokeInk(ctx, pts, { width: 2.2, close: true, color: tint(color, 0.5, PALETTE.forestDeep), seedIndex: seedIndex + 5 + i });
  }
  ctx.restore();
}

/** 灌木团块。 */
export function drawBush(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  seedIndex: number,
): void {
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * rx * 0.55;
    const oy = Math.abs(i - 1) * ry * 0.18;
    blobPath(ctx, x + ox - rx * 0.7, y + oy - ry, rx * 1.4, ry * 2, 1.05, seedIndex + i * 3);
    fillWatercolor(ctx, [
      { x: x + ox - rx * 0.7, y: y + oy - ry },
      { x: x + ox + rx * 0.7, y: y + oy - ry },
      { x: x + ox + rx * 0.7, y: y + oy + ry },
      { x: x + ox - rx * 0.7, y: y + oy + ry },
    ], i === 1 ? tint(color, 0.16, PALETTE.sunbeam) : color, {
      alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 10 + i,
    });
  }
}

/** 蕨类（中景细节）。 */
export function drawFern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  angle: number,
  color: string,
  seedIndex: number,
): void {
  const leaves = 5;
  for (let i = 0; i < leaves; i++) {
    const a = angle + (i - (leaves - 1) / 2) * 0.42;
    const l = len * (0.62 + noiseAt(i * 5, seedIndex) * 0.18);
    drawLeaf(ctx, x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5, l, a, color, seedIndex + i * 7, false);
  }
}

/** 蘑菇。 */
export function drawMushroom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seedIndex: number,
): void {
  const stem: P[] = [
    { x: x - size * 0.16, y: y },
    { x: x - size * 0.12, y: y - size * 0.6 },
    { x: x + size * 0.12, y: y - size * 0.6 },
    { x: x + size * 0.16, y: y },
  ];
  fillWatercolor(ctx, stem, PALETTE.creamMist, { alpha: 0.95, layers: 2, seedIndex: seedIndex + 1 });
  strokeInk(ctx, stem, { width: 1.8, close: true, seedIndex: seedIndex + 2 });
  const cap: P[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    cap.push({ x: x + (t - 0.5) * size, y: y - size * 0.58 - Math.sin(t * Math.PI) * size * 0.34 });
  }
  cap.push({ x: x + size * 0.5, y: y - size * 0.55 });
  cap.push({ x: x - size * 0.5, y: y - size * 0.55 });
  fillWatercolor(ctx, cap, PALETTE.berry, { alpha: 0.9, layers: 2, wetEdge: true, seedIndex: seedIndex + 3 });
  strokeInk(ctx, cap, { width: 2.2, close: true, seedIndex: seedIndex + 4 });
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = PALETTE.creamMist;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + (i - 1) * size * 0.19, y - size * 0.72 + (i % 2) * size * 0.06, size * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 卵石（水边、棋盘收边）。 */
export function drawPebble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  seedIndex: number,
  tone?: string,
): void {
  blobPath(ctx, x - rx, y - ry, rx * 2, ry * 2, 1.0, seedIndex);
  fillWatercolor(ctx, [
    { x: x - rx, y: y - ry },
    { x: x + rx, y: y - ry },
    { x: x + rx, y: y + ry },
    { x: x - rx, y: y + ry },
  ], tone || PALETTE.soil, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
  strokeInk(ctx, [
    { x: x - rx * 0.95, y: y + ry * 0.2 },
    { x: x - rx * 0.2, y: y - ry * 0.9 },
    { x: x + rx * 0.9, y: y - ry * 0.3 },
    { x: x + rx * 0.85, y: y + ry * 0.6 },
    { x: x - rx * 0.5, y: y + ry * 0.8 },
  ], { width: 2.2, close: true, seedIndex: seedIndex + 2 });
}

/** 草丛（会随风摆）。 */
export function drawGrassTuft(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  h: number,
  color?: string | number,
  seedIndex?: number,
  sway?: number,
): void {
  const blades = 5;
  let col = PALETTE.leafMid;
  let seed = seedIndex === undefined ? 0 : seedIndex;
  let sw = sway === undefined ? 0 : sway;
  // 兼容两种调用：drawGrassTuft(ctx,x,baseY,h,color,seed,sway) 与 (ctx,x,baseY,h,seed)
  if (typeof color === 'number') {
    seed = color;
  } else if (typeof color === 'string') {
    col = color;
  } else if (typeof seedIndex === 'number' && typeof color === 'undefined') {
    seed = seedIndex;
  }
  void sw;
  ctx.save();
  ctx.globalAlpha = 0.95;
  for (let i = 0; i < blades; i++) {
    const dir = (i % 2 === 0 ? 1 : -1) * (0.35 + i * 0.16);
    const hh = h * (0.7 + noiseAt(i * 3, seed) * 0.35);
    const pts: P[] = [
      { x: x, y: baseY },
      { x: x + dir * hh * 0.16 + sw * 0.4, y: baseY - hh * 0.5 },
      { x: x + dir * hh * 0.42 + sw, y: baseY - hh },
    ];
    strokeInk(ctx, pts, {
      width: 2.6, jitter: 0.8, color: tint(col, 0.2, i % 2 === 0 ? PALETTE.forestDeep : PALETTE.leafLight),
      seedIndex: seed + i,
    });
  }
  ctx.restore();
}

/** 小花。 */
export function drawFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  petalColor: string,
  seedIndex: number,
): void {
  strokeInk(ctx, [{ x: x, y: y + r * 2.2 }, { x: x, y: y }], { width: 1.8, jitter: 0.6, color: PALETTE.leafMid, seedIndex: seedIndex + 1 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + noiseAt(i, seedIndex) * 0.2;
    const px = x + Math.cos(a) * r * 0.7;
    const py = y + Math.sin(a) * r * 0.7;
    blobPath(ctx, px - r * 0.55, py - r * 0.55, r * 1.1, r * 1.1, 0.9, seedIndex + 5 + i);
    fillWatercolor(ctx, [
      { x: px - r * 0.55, y: py - r * 0.55 },
      { x: px + r * 0.55, y: py - r * 0.55 },
      { x: px + r * 0.55, y: py + r * 0.55 },
      { x: px - r * 0.55, y: py + r * 0.55 },
    ], petalColor, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seedIndex + 20 + i });
  }
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = PALETTE.sunbeam;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 三叶草。 */
export function drawClover(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  seedIndex: number,
): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    drawLeaf(ctx, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 1.5, a, PALETTE.leafMid, seedIndex + i * 6, false);
  }
}

/** 水面涟漪（落点/雨滴）。 */
export function drawRipple(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PALETTE.creamMist;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const pts: P[] = [];
  for (let i = 0; i <= 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r * (1 + noiseAt(i, 5) * 0.05), y: cy + Math.sin(a) * r * 0.45 });
  }
  tracePath(ctx, pts, true);
  ctx.stroke();
  ctx.restore();
}

/** 萤火虫（死亡消散、森间点缀）。 */
export function drawFirefly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
  color?: string,
): void {
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = color || PALETTE.sunbeam;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 叶隙光斑（§2.5 sunbeam，alpha 0.06~0.12）。 */
export function drawSunMote(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.sunbeam;
  blobPath(ctx, x - r, y - r * 0.72, r * 2, r * 1.44, 1.2, 77);
  ctx.fill();
  ctx.restore();
}

/** 雾带（时机揭示、敌半场遮挡）。 */
export function drawFogBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
  seedIndex: number,
): void {
  const bands = 3;
  ctx.save();
  for (let i = 0; i < bands; i++) {
    const by = y + (i / bands) * h;
    const bh = h / bands * 1.5;
    ctx.globalAlpha = alpha * (0.55 + i * 0.14);
    ctx.fillStyle = i % 2 === 0 ? PALETTE.creamMist : tint(PALETTE.creamMist, 0.2, PALETTE.stream);
    ctx.beginPath();
    ctx.moveTo(x - 10, by + bh);
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      ctx.quadraticCurveTo(
        x + w * (t - 0.08),
        by + noiseAt(k + i * 7, seedIndex) * bh * 0.5,
        x + w * t,
        by + bh * (0.45 + noiseAt(k + i * 3, seedIndex) * 0.3),
      );
    }
    ctx.lineTo(x + w + 10, by + bh * 1.4);
    ctx.lineTo(x - 10, by + bh * 1.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 云团。 */
export function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha: number,
  seedIndex: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * w * 0.28;
    const rx = w * (0.42 - Math.abs(i - 1) * 0.08);
    blobPath(ctx, x + ox - rx, y - h * 0.5, rx * 2, h, 1.1, seedIndex + i * 4);
    ctx.fillStyle = i === 1 ? tint(color, 0.12, PALETTE.sunbeam) : color;
    ctx.fill();
  }
  ctx.restore();
}

/** 星辉/奖励闪光。 */
export function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 地面柔和投影（棋子/物件脚下，不用硬阴影）。 */
export function drawSoftGroundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  seedIndex: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = tint(PALETTE.forestDeep, 0.3, PALETTE.soil);
  blobPath(ctx, cx - rx, cy - rx * 0.26, rx * 2, rx * 0.55, 1.2, seedIndex);
  ctx.fill();
  ctx.restore();
}

/** 木牌路标（营地入口）。 */
export function drawWoodSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seedIndex: number,
): void {
  strokeInk(ctx, [{ x: x + w / 2, y: y + h }, { x: x + w / 2, y: y + h + h * 0.75 }], {
    width: 5, jitter: 1.0, color: PALETTE.bark, seedIndex: seedIndex + 1,
  });
  roundRectPath(ctx, x, y, w, h, 12, 1.1, seedIndex + 2);
  fillWatercolor(ctx, [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ], PALETTE.barkLight, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seedIndex + 3 });
  woodGrain(ctx, x + 6, y + 4, w - 12, h - 8, seedIndex + 4);
  strokeInk(ctx, [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ], { width: 3, close: true, seedIndex: seedIndex + 5 });
}

/** 一块石头（可带苔）。 */
export function drawStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  seedIndex: number,
  mossy?: boolean,
): void {
  const pts: P[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rr = r * (1 + noiseAt(i, seedIndex) * 0.22);
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.72 });
  }
  fillWatercolor(ctx, pts, PALETTE.soil, { alpha: 0.94, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
  strokeInk(ctx, pts, { width: 2.4, close: true, seedIndex: seedIndex + 2 });
  if (mossy) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = PALETTE.moss;
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.42, r * 0.34, Math.PI, Math.PI * 1.9);
    ctx.fill();
    ctx.restore();
  }
}

/** 苔藓光斑（§2.6.4 唯一允许的落点反馈）。 */
export function drawMossLight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  alpha: number,
  seedIndex: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.leafLight;
  blobPath(ctx, cx - r, cy - r * 0.55, r * 2, r * 1.1, 1.3, seedIndex);
  ctx.fill();
  ctx.globalAlpha = alpha * 1.5;
  ctx.strokeStyle = tint(PALETTE.leafLight, 0.25, PALETTE.creamMist);
  ctx.lineWidth = 2.4;
  const ring: P[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push({
      x: cx + Math.cos(a) * r * (1 + noiseAt(i, seedIndex + 4) * 0.08),
      y: cy + Math.sin(a) * r * 0.56 * (1 + noiseAt(i + 9, seedIndex + 4) * 0.08),
    });
  }
  tracePath(ctx, ring, true);
  ctx.stroke();
  ctx.restore();
}

/** 便捷：从 rgba 取色，避免渲染层写魔法色。 */
export function alphaOf(color: string, a: number): string {
  return rgba(color, a);
}

/** 便捷：包围盒（转出给其他模块用）。 */
export function boundsOf(pts: P[]): { x: number; y: number; w: number; h: number } {
  return bounds(pts);
}