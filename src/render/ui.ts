/**
 * 通用 UI 零件：木牌面板、手绘按钮、齿轮、阳光币、返回钮、页签、标题牌、提示气泡、
 * 图标按钮、叶片进度条、Toast。全部走手绘生成器，颜色只来自 theme/palette。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE, rgba, tint } from '../config/palette';
import { fillWatercolor, noiseAt, roundRectPath, roundedRectPoints, strokeInk, P } from '../ui/brush';
import { bob, clamp01, cycle, easeOutBack, easeOutCubic } from '../ui/ease';
import { FONT, RADIUS, STROKE, fitSize, setFont, textOutlined, textPlain } from '../ui/theme';
import { drawLeaf, drawMossLight, drawSparkle, drawVine, paperBase, woodGrain } from './paint';

const TAU = Math.PI * 2;

function rectPts(x: number, y: number, w: number, h: number): P[] {
  return [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ];
}

const TONES: { [k: string]: { face: string; edge: string; text: string } } = {
  bark: { face: PALETTE.barkLight, edge: PALETTE.bark, text: PALETTE.creamMist },
  paper: { face: PALETTE.paper, edge: PALETTE.creamMist, text: PALETTE.inkSoft },
  leaf: { face: PALETTE.leafMid, edge: PALETTE.forestMid, text: PALETTE.creamMist },
  soil: { face: PALETTE.soil, edge: PALETTE.bark, text: PALETTE.inkSoft },
};

export interface PanelOpts {
  tone?: 'bark' | 'paper' | 'leaf' | 'soil';
  radius?: number;
  seedIndex?: number;
  alpha?: number;
}

/** 木 / 纸面板。每个面板都带手绘描边，绝不出现硬边矩形。 */
export function drawWoodPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: PanelOpts,
): void {
  const tone = TONES[(opts && opts.tone) || 'bark'] || TONES.bark;
  const radius = (opts && opts.radius) || RADIUS.panel;
  const seed = (opts && opts.seedIndex) || Math.round(x * 7 + y * 13 + w);
  const alpha = opts && opts.alpha !== undefined ? opts.alpha : 0.98;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (tone.face === PALETTE.barkLight) woodGrain(ctx, x, y, w, h, seed + 1);
  const r = Math.max(8, Math.min(radius, Math.min(w, h) / 2));
  const pts: P[] = roundedRectPoints(x, y, w, h, r);
  fillWatercolor(ctx, pts, tone.face, { alpha: 0.97, layers: 1, wetEdge: true, seedIndex: seed });
  if (tone.face === PALETTE.barkLight) woodGrain(ctx, x, y, w, h, seed + 2);
  strokeInk(ctx, pts, { width: STROKE + 0.6, close: true, color: tone.edge, seedIndex: seed + 3, jitter: 1.4 });
  ctx.restore();
}

export interface ButtonOpts {
  state?: 'normal' | 'pressed' | 'disabled';
  time?: number;
  radius?: number;
  tone?: 'leaf' | 'bark' | 'berry' | 'sun';
}

/** 手绘按钮：皮革/叶片底 + 描边 + 上下浮动的字。 */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts?: ButtonOpts,
): void {
  const state = (opts && opts.state) || 'normal';
  const time = (opts && opts.time) || 0;
  const radius = (opts && opts.radius) || LAYOUT.BUTTON_RADIUS;
  const disabled = state === 'disabled';
  const pressed = state === 'pressed';
  const toneKey = (opts && opts.tone) || 'leaf';
  const green = toneKey === 'leaf' || toneKey === 'berry';
  const face = disabled
    ? toneKey === 'bark'
      ? tint(PALETTE.barkLight, 0.42, PALETTE.inkSoft)
      : PALETTE.moss
    : toneKey === 'bark'
      ? PALETTE.barkLight
      : toneKey === 'berry'
        ? PALETTE.berry
        : toneKey === 'sun'
          ? PALETTE.sunset
          : PALETTE.leafMid;
  const edge = disabled
    ? toneKey === 'bark'
      ? PALETTE.bark
      : PALETTE.forestMid
    : toneKey === 'bark'
      ? PALETTE.bark
      : toneKey === 'berry'
        ? tint(PALETTE.berry, 0.3, PALETTE.inkSoft)
        : PALETTE.forestDeep;
  const seed = Math.round(x * 3 + y * 5 + w);
  const dy = pressed ? 3 : 0;
  const r = Math.max(10, Math.min(radius, h / 2));
  ctx.save();
  ctx.translate(0, dy);
  // 底影
  ctx.save();
  ctx.globalAlpha = disabled ? 0.1 : 0.24;
  fillWatercolor(ctx, roundedRectPoints(x + 2, y + 6, w, h, r), PALETTE.forestDeep, { alpha: 0.6, layers: 1, seedIndex: seed });
  ctx.restore();
  // 木/叶面板
  const pts: P[] = roundedRectPoints(x, y, w, h, r);
  fillWatercolor(ctx, pts, face, { alpha: disabled ? 0.75 : 0.98, layers: 1, wetEdge: true, seedIndex: seed + 1 });
  if (toneKey === 'bark' && !disabled) woodGrain(ctx, x, y, w, h, seed + 2);
  // 顶缘高光 + 底缘暗线：做出木牌的厚度
  strokeInk(ctx, [{ x: x + r, y: y + 3 }, { x: x + w - r, y: y + 3 }], {
    width: 3, color: rgba(tint(face, 0.5, PALETTE.creamMist), 0.5), seedIndex: seed + 6, jitter: 0.6,
  });
  strokeInk(ctx, [{ x: x + r, y: y + h - 3 }, { x: x + w - r, y: y + h - 3 }], {
    width: 3, color: rgba(tint(face, 0.4, PALETTE.inkSoft), 0.45), seedIndex: seed + 7, jitter: 0.6,
  });
  strokeInk(ctx, pts, { width: STROKE + 0.9, close: true, color: edge, seedIndex: seed + 3, jitter: 1.2 });
  // 绿叶端饰（只给叶片底色的按钮，木牌按钮不加）
  if (green && !disabled && h >= 34) {
    drawLeaf(ctx, x + 16, y + h / 2, Math.min(15, h * 0.34), 1.2, PALETTE.leafLight, seed + 4);
    drawLeaf(ctx, x + w - 16, y + h / 2, Math.min(15, h * 0.34), Math.PI - 1.2, PALETTE.leafLight, seed + 5);
  }
  // 文字
  const size = fitSize(ctx, label, w - 34, Math.min(FONT.body, h * 0.46));
  const txtColor = disabled ? rgba(PALETTE.creamMist, 0.7) : green ? PALETTE.creamMist : PALETTE.inkSoft;
  // 浅色底（绿叶 / 阳光）上奶油字必须配深色描边；深色底（木牌 / 莓红）沿用奶油描边
  const edgeColor = green ? PALETTE.forestDeep : PALETTE.creamMist;
  textOutlined(ctx, label, x + w / 2, y + h * 0.53, size, txtColor, 'center', green ? 2.6 : 2.2, edgeColor);
  ctx.restore();
}

/** 齿轮（设置）：木齿轮 + 叶片装饰。 */
export function drawGear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  pressed: boolean,
): void {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.36;
  const seed = 2101;
  ctx.save();
  ctx.translate(0, pressed ? 2 : 0);
  // 齿
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const tx = cx + Math.cos(a) * r * 1.42;
    const ty = cy + Math.sin(a) * r * 1.42;
    const tooth: P[] = [
      { x: tx + Math.cos(a + Math.PI / 2) * 6, y: ty + Math.sin(a + Math.PI / 2) * 6 },
      { x: tx + Math.cos(a - Math.PI / 2) * 6, y: ty + Math.sin(a - Math.PI / 2) * 6 },
      { x: cx + Math.cos(a - 0.24) * r * 1.05, y: cy + Math.sin(a - 0.24) * r * 1.05 },
      { x: cx + Math.cos(a + 0.24) * r * 1.05, y: cy + Math.sin(a + 0.24) * r * 1.05 },
    ];
    fillWatercolor(ctx, tooth, PALETTE.barkLight, { alpha: 0.98, layers: 1, seedIndex: seed + i });
    strokeInk(ctx, tooth, { width: 2, close: true, seedIndex: seed + 10 + i, jitter: 0.7 });
  }
  // 圆盘
  const disc: P[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const k = 1 + noiseAt(i, seed + 20) * 0.05;
    disc.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
  }
  fillWatercolor(ctx, disc, PALETTE.barkLight, { alpha: 0.98, layers: 1, seedIndex: seed + 21 });
  woodGrain(ctx, cx - r, cy - r, r * 2, r * 2, seed + 22);
  strokeInk(ctx, disc, { width: 2.6, close: true, seedIndex: seed + 23, jitter: 1.0 });
  // 中心孔
  fillWatercolor(ctx, disc.map((p) => ({ x: cx + (p.x - cx) * 0.3, y: cy + (p.y - cy) * 0.3 })), PALETTE.forestDeep, {
    alpha: 0.9, layers: 1, seedIndex: seed + 24,
  });
  drawLeaf(ctx, cx + r * 0.9, cy - r * 0.9, 12, -0.5, PALETTE.leafMid, seed + 25);
  ctx.restore();
}

/** 阳光币：太阳圆牌 + 光线；`delta < 0` 时不显示数字（例如营地纯装饰）。 */
export function drawSunCoin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  delta: number,
  time: number,
): void {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.36;
  const seed = 2201;
  ctx.save();
  // 光线
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.sin(time / 2600) * 0.06;
    const len = r * (1.5 + 0.08 * Math.sin(time / 700 + i));
    strokeInk(ctx, [{ x: cx + Math.cos(a) * r * 1.1, y: cy + Math.sin(a) * r * 1.1 }, { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len }], {
      width: 3, color: rgba(PALETTE.sunset, 0.8), seedIndex: seed + i, jitter: 0.8,
    });
  }
  const disc: P[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const k = 1 + noiseAt(i, seed + 30) * 0.05;
    disc.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
  }
  fillWatercolor(ctx, disc, PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: seed + 31 });
  fillWatercolor(ctx, disc.map((p) => ({ x: cx + (p.x - cx) * 0.72, y: cy + (p.y - cy) * 0.72 })), tint(PALETTE.sunbeam, 0.18, PALETTE.paper), {
    alpha: 0.9, layers: 1, seedIndex: seed + 32,
  });
  strokeInk(ctx, disc, { width: 2.6, close: true, color: PALETTE.sunset, seedIndex: seed + 33, jitter: 1.0 });
  if (delta >= 0) {
    const t = '' + Math.round(delta);
    const fs = fitSize(ctx, t, r * 1.7, FONT.coin);
    textOutlined(ctx, t, cx, cy + 1, fs, PALETTE.inkSoft, 'center', 0);
  }
  ctx.restore();
}

/** 左上返回：卷叶箭头。 */
export function drawBackButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  pressed: boolean,
  time?: number,
): void {
  const t = time || 0;
  ctx.save();
  ctx.translate(0, pressed ? 2 : 0);
  const pts: P[] = rectPts(x, y, size, size);
  fillWatercolor(ctx, pts, PALETTE.creamMist, { alpha: 0.97, layers: 1, seedIndex: 2301 });
  strokeInk(ctx, pts, { width: STROKE, close: true, seedIndex: 2302, jitter: 1.2 });
  const cx = x + size / 2;
  const cy = y + size / 2;
  const w = size * 0.3;
  const head: P[] = [
    { x: cx - w, y: cy },
    { x: cx + w * 0.2, y: cy - w * 0.8 },
    { x: cx + w * 0.2, y: cy + w * 0.8 },
  ];
  fillWatercolor(ctx, head, PALETTE.forestMid, { alpha: 0.98, layers: 1, seedIndex: 2303 });
  strokeInk(ctx, head, { width: 2.4, close: true, seedIndex: 2304, jitter: 0.8 });
  strokeInk(ctx, [{ x: cx - w * 0.1, y: cy }, { x: cx + w, y: cy }], { width: 3.4, color: PALETTE.forestMid, seedIndex: 2305, jitter: 0.6 });
  drawLeaf(ctx, x + size * 0.18, y + size * 0.2, 12, -0.6 + Math.sin(t / 500) * 0.15, PALETTE.leafMid, 2306);
  ctx.restore();
}

/** 顶部页签条：木牌 + 选中叶片。 */
export function drawTabBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tabs: string[],
  active: number,
  time: number,
): void {
  ctx.save();
  const pad: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, pad, PALETTE.barkLight, { alpha: 0.96, layers: 1, seedIndex: 2401 });
  woodGrain(ctx, x, y, w, h, 2402);
  strokeInk(ctx, pad, { width: STROKE, close: true, seedIndex: 2403, jitter: 1.3 });
  const colW = w / Math.max(1, tabs.length);
  for (let i = 0; i < tabs.length; i++) {
    const tx = x + colW * i;
    const on = i === active;
    if (on) {
      ctx.save();
      const tab: P[] = rectPts(tx + 6, y + 6, colW - 12, h - 12);
      fillWatercolor(ctx, tab, PALETTE.creamMist, { alpha: 0.96, layers: 1, seedIndex: 2410 + i });
      strokeInk(ctx, tab, { width: 2.4, close: true, seedIndex: 2420 + i, jitter: 1.0 });
      ctx.restore();
    }
    const size = fitSize(ctx, tabs[i], colW - 26, FONT.entry);
    textOutlined(ctx, tabs[i], tx + colW / 2, y + h * 0.53, size, on ? PALETTE.inkSoft : rgba(PALETTE.creamMist, 0.85), 'center', 0);
    if (on) {
      drawLeaf(ctx, tx + colW / 2, y + h - 8, 14, -0.4 + Math.sin(time / 500 + i) * 0.15, PALETTE.leafLight, 2430 + i);
    }
  }
  ctx.restore();
}

/** 大标题木牌。 */
export function drawTitlePlate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  w: number,
  h: number,
  title: string,
  sub?: string,
): void {
  ctx.save();
  const x = cx - w / 2;
  const pts: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, pts, PALETTE.barkLight, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: 2501 });
  woodGrain(ctx, x, y, w, h, 2502);
  strokeInk(ctx, pts, { width: STROKE + 1, close: true, seedIndex: 2503, jitter: 1.4 });
  const size = fitSize(ctx, title, w - 60, FONT.h1);
  textOutlined(ctx, title, cx, y + h * (sub ? 0.36 : 0.52), size, PALETTE.inkSoft, 'center', 0);
  if (sub) textPlain(ctx, sub, cx, y + h * 0.74, FONT.badge, rgba(PALETTE.inkSoft, 0.75), 'center');
  drawLeaf(ctx, x + 20, y + h / 2, 20, 1.2, PALETTE.leafMid, 2504);
  drawLeaf(ctx, x + w - 20, y + h / 2, 20, Math.PI - 1.2, PALETTE.leafMid, 2505);
  ctx.restore();
}

/** 提示气泡（叶子尾巴指向 tailX）。 */
export function drawTipBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  w: number,
  h: number,
  text: string,
  time: number,
  tailX?: number,
): void {
  ctx.save();
  const x = cx - w / 2;
  const pop = 1 + Math.sin(time / 400) * 0.015;
  ctx.translate(cx, y + h / 2);
  ctx.scale(pop, pop);
  ctx.translate(-cx, -(y + h / 2));
  const pts: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, pts, PALETTE.creamMist, { alpha: 0.98, layers: 1, seedIndex: 2601 });
  strokeInk(ctx, pts, { width: 2.6, close: true, seedIndex: 2602, jitter: 1.1 });
  const tx = tailX === undefined ? cx : tailX;
  const tail: P[] = [
    { x: tx - 10, y: y + h - 2 },
    { x: tx + 10, y: y + h - 2 },
    { x: tx, y: y + h + 12 },
  ];
  fillWatercolor(ctx, tail, PALETTE.creamMist, { alpha: 0.98, layers: 1, seedIndex: 2603 });
  strokeInk(ctx, tail, { width: 2.2, close: true, seedIndex: 2604, jitter: 0.8 });
  const size = fitSize(ctx, text, w - 26, FONT.entry);
  textOutlined(ctx, text, cx, y + h * 0.55, size, PALETTE.berry, 'center', 0);
  ctx.restore();
}

/** 圆形图标按钮：kind 决定图形（back / close / info / share / refresh）。 */
export function drawIconButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  kind: 'back' | 'close' | 'info' | 'share' | 'refresh' | string,
  pressed: boolean,
  time: number,
): void {
  ctx.save();
  ctx.translate(0, pressed ? 2 : 0);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 2;
  const disc: P[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const k = 1 + noiseAt(i, 2700) * 0.05;
    disc.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
  }
  fillWatercolor(ctx, disc, PALETTE.creamMist, { alpha: 0.96, layers: 1, seedIndex: 2701 });
  strokeInk(ctx, disc, { width: 2.6, close: true, seedIndex: 2702, jitter: 1.0 });
  const w = size * 0.22;
  if (kind === 'back') {
    const head: P[] = [
      { x: cx - w, y: cy },
      { x: cx + w * 0.2, y: cy - w * 0.8 },
      { x: cx + w * 0.2, y: cy + w * 0.8 },
    ];
    fillWatercolor(ctx, head, PALETTE.forestMid, { alpha: 0.98, layers: 1, seedIndex: 2703 });
    strokeInk(ctx, head, { width: 2, close: true, seedIndex: 2704, jitter: 0.7 });
  } else if (kind === 'close') {
    for (let i = -1; i <= 1; i += 2) {
      strokeInk(ctx, [{ x: cx - w, y: cy - w * i }, { x: cx + w, y: cy + w * i }], { width: 3, color: PALETTE.berry, seedIndex: 2705 + i, jitter: 0.6 });
    }
  } else if (kind === 'refresh') {
    strokeInk(
      ctx,
      [
        { x: cx + w, y: cy - w * 0.4 },
        { x: cx + w * 0.4, y: cy - w },
        { x: cx - w * 0.6, y: cy - w * 0.2 },
        { x: cx - w * 0.2, y: cy + w },
        { x: cx + w * 0.8, y: cy + w * 0.6 },
      ],
      { width: 3, color: PALETTE.forestMid, seedIndex: 2707, jitter: 0.8 },
    );
  } else if (kind === 'share') {
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * TAU;
      fillWatercolor(
        ctx,
        [
          { x: cx + Math.cos(a) * w * 1.2 - 4, y: cy + Math.sin(a) * w * 1.2 - 4 },
          { x: cx + Math.cos(a) * w * 1.2 + 4, y: cy + Math.sin(a) * w * 1.2 - 4 },
          { x: cx + Math.cos(a) * w * 1.2 + 4, y: cy + Math.sin(a) * w * 1.2 + 4 },
          { x: cx + Math.cos(a) * w * 1.2 - 4, y: cy + Math.sin(a) * w * 1.2 + 4 },
        ],
        PALETTE.leafMid,
        { alpha: 0.98, layers: 1, seedIndex: 2708 + i },
      );
    }
  } else {
    // info
    textOutlined(ctx, '?', cx, cy + 1, size * 0.5, PALETTE.inkSoft, 'center', 0);
    drawLeaf(ctx, cx, cy - r * 0.5, 10, -0.5, PALETTE.leafMid, 2709);
  }
  if (cycle(time, 3600, 0) < 0.05) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    drawSparkle(ctx, cx + r * 0.7, cy - r * 0.7, 5, PALETTE.sunbeam, 0.6);
    ctx.restore();
  }
  ctx.restore();
}

/** 叶片进度条（加载用）：藤 + 叶 + 光晕。 */
export function drawProgressLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  progress: number,
  time: number,
): void {
  const p = clamp01(progress);
  ctx.save();
  const y0 = y + h / 2;
  strokeInk(ctx, [{ x: x, y: y0 }, { x: x + w, y: y0 }], { width: 5, color: rgba(PALETTE.creamMist, 0.7), seedIndex: 2801, jitter: 1.0 });
  strokeInk(ctx, [{ x: x, y: y0 }, { x: x + w * p, y: y0 }], { width: 5.4, color: PALETTE.leafLight, seedIndex: 2802, jitter: 1.2 });
  // 未走完的藤叶
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    if (t > p) break;
    drawLeaf(ctx, x + w * t, y0 + Math.sin(time / 500 + i) * 2, 14, -0.5 + i, PALETTE.leafMid, 2810 + i);
  }
  drawMossLight(ctx, x + w * p, y0, 18, 0.6 + Math.sin(time / 300) * 0.15, 2820);
  ctx.restore();
}

/** 顶部 Toast（半透明叶脉纸）。 */
export function drawToast(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  text: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  const size = fitSize(ctx, text, 560, FONT.body);
  setFont(ctx, size, 'normal');
  const tw = ctx.measureText(text).width + 56;
  const h = 46;
  const x = cx - tw / 2;
  const pts: P[] = rectPts(x, y, tw, h);
  fillWatercolor(ctx, pts, tint(PALETTE.forestDeep, 0.5, PALETTE.inkSoft), { alpha: 0.92, layers: 1, seedIndex: 2901 });
  strokeInk(ctx, pts, { width: 2.4, close: true, color: PALETTE.leafMid, seedIndex: 2902, jitter: 1.1 });
  textOutlined(ctx, text, cx, y + h * 0.55, size, PALETTE.creamMist, 'center', 0);
  drawLeaf(ctx, x + 18, y + h / 2, 14, 1.2, PALETTE.leafLight, 2903);
  drawLeaf(ctx, x + tw - 18, y + h / 2, 14, Math.PI - 1.2, PALETTE.leafLight, 2904);
  ctx.restore();
}

export { paperBase, drawVine, roundRectPath, bob, easeOutCubic, easeOutBack };
export { drawScoreboardPanel, type RoundLogView } from './sidebar';