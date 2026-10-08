/**
 * 卡组页（§13 局外 · 卡组展示）—— 横屏 1280×720，手绘水彩森林风。
 *
 * 【文件约定】本文件同时导出四块面板（deck / collection / settings / shop）共用的
 * 手绘通用件：纸底、顶部返回+标题+货币条、木牌背板、木牌按钮、手绘小动物、
 * 动物卡、雾气揭幕。这样四个场景文件不会各写一份重复的绘制代码。
 * 所有轮廓一律走 `ui/brush` 的 strokeInk / roundPts，颜色只取自 PALETTE 或 tint/rgba 派生。
 *
 * 卡面数值（费用 / 战力 / 特技名 / 特技说明）全部来自 `config/species` 的 SPECIES，
 * 不允许在场景里硬编码。
 */
import { Scene, pop } from './manager';
import { PALETTE, rgba, tint } from '../config/palette';
import { LAYOUT } from '../config/layout';
import { SPECIES, SPECIES_ORDER, COUNTER, counteredBy, SpeciesId } from '../config/species';
import { loadSave } from '../platform/storage';
import { playSfx } from '../platform/audio';
import { GestureEvent } from '../platform/input';
import {
  P, strokeInk, fillWatercolor, roundRectPath, blobPath, tracePath, arcPoints,
  paperGrain, dropShadow, noiseAt,
} from '../ui/brush';
import { setFont, textOutlined, textPlain, fitSize, wrapText, FONT } from '../ui/theme';
import { easeOutCubic, clamp01, bob, breathe } from '../ui/ease';
import {
  paperBase, woodGrain, drawLeaf, drawVine, drawSoftGroundShadow, drawSparkle,
  drawSunMote, drawWoodSign, drawFern, drawGrassTuft,
} from '../render/paint';
import { drawCard } from '../render/card';
import { getImage } from '../render/assets';
import { sceneBox } from '../platform/screen';

export const SCREEN = { W: LAYOUT.SCREEN_W, H: LAYOUT.SCREEN_H };

/* =========================================================================
 * 一、绘画小工具
 * ========================================================================= */

/**
 * 把 `tint()` / `rgba()` 产出的 `rgb(...)`／`rgba(...)` 字符串还原成 6 位 hex。
 *
 * 【为什么必须过这一层】`ui/brush` 的 `fillWatercolor()` 内部会再 `tint(color, …)` 一次来派生
 * 冷色暗部与湿边，而 `config/palette` 的 `tint()` 只认 6 位 hex：一旦收到 `rgb(...)` 字符串，
 * `parseInt('gb', 16)` 之类的解析就会得到 NaN，产出 `rgb(NaN,g,b)` 这种非法色。Canvas 对非法
 * 颜色字符串是**静默忽略**赋值并沿用上一个颜色，于是水彩暗部丢失、湿边还会串成上一个颜色。
 * 所以场景里凡是「派生色」再进水彩，统一先 `toHex()`。
 */
export function toHex(color: string): string {
  if (color.charAt(0) === '#') return color;
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return color;
  const parts = m[1].split(',');
  const ch = (i: number): string => {
    let v = Math.round(parseFloat(parts[i]));
    if (!isFinite(v)) v = 0;
    if (v < 0) v = 0;
    if (v > 255) v = 255;
    const s = v.toString(16);
    return s.length === 1 ? '0' + s : s;
  };
  return '#' + ch(0) + ch(1) + ch(2);
}

/**
 * 安全水彩填充：颜色先归一成 hex 再交给 `brush.fillWatercolor`。
 * 场景里所有水彩填充都走这里（直接调 fillWatercolor 传派生色会踩上面那个 NaN 坑）。
 */
export function fillPanel(
  ctx: CanvasRenderingContext2D,
  pts: P[],
  color: string,
  opts?: { alpha?: number; layers?: number; wetEdge?: boolean; seedIndex?: number },
): void {
  fillWatercolor(ctx, pts, toHex(color), opts);
}

/**
 * 手绘叶片（颜色先归一成 hex）。
 * `render/paint` 的 drawLeaf 内部同样是「颜色 → fillWatercolor → 再 tint」，直接喂派生色会踩 NaN 坑。
 */
export function drawPanelLeaf(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number, angle: number,
  color: string, seedIndex: number, outline?: boolean,
): void {
  drawLeaf(
    ctx, cx, cy, len, angle, toHex(color), seedIndex, outline,
  );
}

/** 追加点集（避免 concat 产生中间数组）。 */
function pushAll(dst: P[], src: P[]): void {
  for (let i = 0; i < src.length; i++) dst.push(src[i]);
}

/** 圆角矩形采样点（含四角弧），供 fillWatercolor / strokeInk 共用。 */
export function roundPts(x: number, y: number, w: number, h: number, r: number): P[] {
  const rr = Math.max(1, Math.min(r, Math.min(w, h) / 2));
  const pts: P[] = [];
  pushAll(pts, arcPoints(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, 4));
  pushAll(pts, arcPoints(x + w - rr, y + rr, rr, Math.PI * 1.5, Math.PI * 2, 4));
  pushAll(pts, arcPoints(x + w - rr, y + h - rr, rr, 0, Math.PI * 0.5, 4));
  pushAll(pts, arcPoints(x + rr, y + h - rr, rr, Math.PI * 0.5, Math.PI, 4));
  return pts;
}

/** 椭圆采样点。 */
function ellipsePts(cx: number, cy: number, rx: number, ry: number, steps: number): P[] {
  const unit = arcPoints(0, 0, 1, 0, Math.PI * 2, steps);
  const out: P[] = [];
  for (let i = 0; i < unit.length; i++) out.push({ x: cx + unit[i].x * rx, y: cy + unit[i].y * ry });
  return out;
}

/* =========================================================================
 * 二、面板通用件（四个场景共用）
 * ========================================================================= */

/** 一个点的命中判定（圆形）。 */
export function inCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** 矩形命中判定（含 6px 宽容）。 */
export function inRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const pad = 6;
  return x >= rx - pad && x <= rx + rw + pad && y >= ry - pad && y <= ry + rh + pad;
}

/**
 * 面板背景阔叶树（自绘版）。
 *
 * 【为什么不用 `render/paint` 的 drawBroadleafTree】该函数把 `tint()` 的 **rgb(...) 输出**
 * 又交回 `fillWatercolor()`，而 brush 内部还会再 `tint()` 一次（`palette.tint` 只认 6 位 hex，
 * 遇到 `rgb(...)` 会算出 `rgb(NaN,g,b)` 的非法色）。非法 fillStyle 会被 Canvas 静默忽略并沿用
 * 上一个颜色，树冠就会失去暗部、湿边还会串色。这里自己画：只把 **hex** 交给 fillWatercolor
 * （hex 进去时内部 tint 派生是正常的），暗部与湿边因此都成立。
 */
export function drawPanelTree(
  ctx: CanvasRenderingContext2D, x: number, baseY: number, height: number,
  canopy: string, seedIndex: number, sway?: number,
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
  fillPanel(ctx, trunk, PALETTE.bark, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
  strokeInk(ctx, trunk, { width: 2.6, close: true, seedIndex: seedIndex + 2 });

  const cy = baseY - height * 0.92 + sw * 0.8;
  const r = height * 0.3;
  const blobs = 5;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2;
    const ox = Math.cos(a) * r * 0.62;
    const oy = Math.sin(a) * r * 0.4;
    const rx = r * (0.95 + noiseAt(i, seedIndex) * 0.12);
    const ry = r * 0.78;
    const pts: P[] = [
      { x: x + ox - rx, y: cy + oy - ry },
      { x: x + ox + rx, y: cy + oy - ry },
      { x: x + ox + rx, y: cy + oy + ry },
      { x: x + ox - rx, y: cy + oy + ry },
    ];
    fillPanel(ctx, pts, i % 2 === 0 ? canopy : PALETTE.forestDeep, {
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

/** 面板背景灌木（自绘版，理由同上）。 */
export function drawPanelBush(
  ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number,
  color: string, seedIndex: number,
): void {
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * rx * 0.55;
    const oy = Math.abs(i - 1) * ry * 0.18;
    const pts: P[] = [
      { x: x + ox - rx * 0.7, y: y + oy - ry },
      { x: x + ox + rx * 0.7, y: y + oy - ry },
      { x: x + ox + rx * 0.7, y: y + oy + ry },
      { x: x + ox - rx * 0.7, y: y + oy + ry },
    ];
    fillPanel(ctx, pts, i === 1 ? PALETTE.leafLight : color, {
      alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 10 + i,
    });
  }
}

/** 面板纸底 + 两侧森林边缘（所有面板页的背景）。 */
export function drawScreenBase(ctx: CanvasRenderingContext2D, t: number, seedIndex: number): void {
  // 自适应全屏：纸底与边缘装饰铺满逻辑可视区，中央 1280×720 的排布完全不动
  const box = sceneBox();
  const bx = box.x;
  const by = box.y;
  const bw = box.w;
  const bh = box.h;
  ctx.save();
  ctx.fillStyle = PALETTE.creamMist;
  ctx.fillRect(bx, by, bw, bh);
  paperBase(ctx, bx - 24, by - 24, bw + 48, bh + 48, PALETTE.paper, 0.95, seedIndex);
  paperGrain(ctx, bx, by, bw, bh, 0.045, seedIndex + 1);

  // 远景树（左右各两株，只在边缘露出，不侵入中央内容区）
  const swayA = Math.sin(t / 2600) * 2.2;
  drawPanelTree(ctx, bx - 26, 640, 560, PALETTE.forestMid, seedIndex + 10, swayA);
  drawPanelTree(ctx, bx + 88, 600, 380, PALETTE.forestDeep, seedIndex + 14, -swayA);
  drawPanelTree(ctx, bx + bw + 20, 660, 600, PALETTE.forestMid, seedIndex + 18, -swayA);
  drawPanelTree(ctx, bx + bw - 92, 596, 360, PALETTE.forestDeep, seedIndex + 22, swayA);

  // 近景灌木 / 蕨叶 / 草
  drawPanelBush(ctx, bx + 26, 700, 116, 52, PALETTE.leafMid, seedIndex + 26);
  drawPanelBush(ctx, bx + bw - 30, 706, 124, 56, PALETTE.leafMid, seedIndex + 30);
  drawFern(ctx, bx + 34, 706, 66, -0.5, PALETTE.leafLight, seedIndex + 34);
  drawFern(ctx, bx + bw - 40, 710, 70, -2.6, PALETTE.leafLight, seedIndex + 38);
  const tufts = Math.ceil(bw / 158) + 1;
  for (let i = 0; i < tufts; i++) {
    const gx = bx + 8 + i * 158;
    drawGrassTuft(ctx, gx, 718, 22 + (i % 3) * 7, PALETTE.leafMid, seedIndex + 42 + i, Math.sin(t / 1500 + i));
  }

  // 叶隙光斑（§2.1 常驻闲笔）
  for (let i = 0; i < 6; i++) {
    const ph = (t / (6200 + i * 900) + i * 0.21) % 1;
    drawSunMote(ctx, bx + 40 + i * ((bw - 80) / 6), 96 + ph * 300, 10 + (i % 3) * 5, 0.09 * (1 - ph));
  }
  ctx.restore();
}

/** 顶部返回按钮（木质圆牌 + 手绘箭头）。 */
export function drawBackButton(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, active: boolean, seedIndex: number,
): void {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const s = active ? 1.05 : 1.0;
  const r = (size / 2) * s;
  ctx.save();
  dropShadow(ctx, cx - r, cy - r, r * 2, r * 2, r, seedIndex);
  const circle = arcPoints(cx, cy, r, 0, Math.PI * 2, 20);
  fillPanel(ctx, circle, active ? PALETTE.soil : PALETTE.barkLight, {
    alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seedIndex + 1,
  });
  woodGrain(ctx, cx - r + 6, cy - r + 6, r * 2 - 12, r * 2 - 12, seedIndex + 2);
  strokeInk(ctx, circle, { width: 3, close: true, seedIndex: seedIndex + 3 });
  // 箭头（手绘折线，不用字符）
  strokeInk(ctx, [
    { x: cx + r * 0.28, y: cy - r * 0.42 },
    { x: cx - r * 0.26, y: cy },
    { x: cx + r * 0.28, y: cy + r * 0.42 },
  ], { width: 3.4, jitter: 0.9, seedIndex: seedIndex + 4 });
  ctx.restore();
}

/** 标题木牌（顶部居中）。 */
export function drawTitlePlate(
  ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number, text: string, seedIndex: number,
): void {
  const x = cx - w / 2;
  // 顶部两枚挂钉
  strokeInk(ctx, [{ x: x + w * 0.16, y: y }, { x: x + w * 0.16, y: y - 10 }], { width: 3, seedIndex: seedIndex + 1 });
  strokeInk(ctx, [{ x: x + w * 0.84, y: y }, { x: x + w * 0.84, y: y - 10 }], { width: 3, seedIndex: seedIndex + 2 });
  const pts = roundPts(x, y, w, h, 16);
  dropShadow(ctx, x, y, w, h, 16, seedIndex + 3);
  fillPanel(ctx, pts, PALETTE.barkLight, { alpha: 0.97, layers: 2, wetEdge: true, seedIndex: seedIndex + 4 });
  woodGrain(ctx, x + 8, y + 7, w - 16, h - 14, seedIndex + 5);
  strokeInk(ctx, pts, { width: 3, close: true, seedIndex: seedIndex + 6 });
  // 两侧小叶
  drawPanelLeaf(ctx, x + 10, y + h / 2, 26, Math.PI * 0.9, PALETTE.leafMid, seedIndex + 7, false);
  drawPanelLeaf(ctx, x + w - 10, y + h / 2, 26, Math.PI * 0.1, PALETTE.leafMid, seedIndex + 8, false);
  // 木牌是浅木底：标题用深色字，奶油描边只做「压印」高光（奶油字在浅木上会糊成一团）
  textOutlined(ctx, text, cx, y + h / 2 + 1, FONT.h2, PALETTE.inkSoft, 'center', 2.4);
}

/** 手绘太阳图标（阳光下注 · 货币）。 */
export function drawSunIcon(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, seedIndex: number,
): void {
  const pulse = 1 + 0.04 * Math.sin(t / 620);
  const body = arcPoints(cx, cy, r * 0.62 * pulse, 0, Math.PI * 2, 16);
  fillPanel(ctx, body, PALETTE.sunbeam, { alpha: 0.96, layers: 2, wetEdge: false, seedIndex: seedIndex + 1 });
  strokeInk(ctx, body, { width: 2, close: true, seedIndex: seedIndex + 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.18;
    const r0 = r * 0.82;
    const r1 = r * (1.02 + 0.1 * Math.sin(t / 500 + i));
    strokeInk(ctx, [
      { x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 },
      { x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 },
    ], { width: 2, jitter: 0.5, seedIndex: seedIndex + 3 + i });
  }
}

/** 手绘爪印图标（爪印币）。 */
export function drawPawIcon(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seedIndex: number,
): void {
  const pad = ellipsePts(cx, cy + r * 0.30, r * 0.62, r * 0.52, 14);
  fillPanel(ctx, pad, PALETTE.soil, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
  strokeInk(ctx, pad, { width: 2.2, close: true, seedIndex: seedIndex + 2 });
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * (0.18 + i * 0.32) * -1;
    const tx = cx + Math.cos(a) * r * 0.72;
    const ty = cy - r * 0.34 + Math.sin(a) * r * 0.26;
    const toe = ellipsePts(tx, ty, r * 0.22, r * 0.26, 10);
    fillPanel(ctx, toe, PALETTE.soil, { alpha: 0.94, layers: 2, wetEdge: true, seedIndex: seedIndex + 3 + i });
    strokeInk(ctx, toe, { width: 2, close: true, seedIndex: seedIndex + 6 + i });
  }
}

/** 手绘五角星图标（星辉）。 */
export function drawStarIcon(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, seedIndex: number,
): void {
  const spin = 0.06 * Math.sin(t / 900);
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + spin;
    const rr = i % 2 === 0 ? r : r * 0.46;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  fillPanel(ctx, pts, PALETTE.sunbeam, { alpha: 0.97, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
  strokeInk(ctx, pts, { width: 2.2, close: true, seedIndex: seedIndex + 2 });
}

/** 顶部货币条（右上角两枚木牌 + 图标 + 数字）。 */
export function drawCurrencyChips(
  ctx: CanvasRenderingContext2D, y: number, t: number, save: { coins: number; stars: number }, seedIndex: number,
): void {
  const w = 196;
  const h = 52;
  const gap = 12;
  const coinsX = SCREEN.W - 26 - w;
  const starsX = coinsX - gap - w;
  drawWoodPlate(ctx, starsX, y, w, h, { radius: 18, base: PALETTE.barkLight, seedIndex: seedIndex });
  drawWoodPlate(ctx, coinsX, y, w, h, { radius: 18, base: PALETTE.barkLight, seedIndex: seedIndex + 20 });
  drawStarIcon(ctx, starsX + 28, y + h / 2, 15, t, seedIndex + 1);
  drawPawIcon(ctx, coinsX + 28, y + h / 2, 15, seedIndex + 21);
  setFont(ctx, FONT.entry + 2, 'bold');
  ctx.fillStyle = PALETTE.creamMist;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('' + save.stars, starsX + 52, y + h / 2 + 1);
  ctx.fillText('' + save.coins, coinsX + 52, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, FONT.badge - 3, 'normal');
  ctx.fillStyle = rgba(PALETTE.creamMist, 0.82);
  ctx.fillText('星辉', starsX + 132, y + h / 2 + 1);
  ctx.fillText('爪印币', coinsX + 132, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

/** 木牌背板（面板底衬）：木纹 + 手绘边框 + 水彩两层。 */
export function drawWoodPlate(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  opts?: { radius?: number; base?: string; active?: boolean; seedIndex?: number; grain?: boolean },
): void {
  const o = opts || {};
  const r = o.radius === undefined ? LAYOUT.PANEL_RADIUS : o.radius;
  const base = o.base === undefined ? PALETTE.barkLight : o.base;
  const si = o.seedIndex === undefined ? 0 : o.seedIndex;
  const pts = roundPts(x, y, w, h, r);
  dropShadow(ctx, x, y, w, h, r, si);
  fillPanel(ctx, pts, base, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: si + 1 });
  if (o.grain !== false) woodGrain(ctx, x + 8, y + 7, w - 16, h - 14, si + 2);
  if (o.active) {
    ctx.save();
    ctx.globalAlpha = 0.30;
    const glow = roundPts(x + 3, y + 3, w - 6, h - 6, r - 2);
    fillPanel(ctx, glow, PALETTE.sunbeam, { alpha: 0.5, layers: 1, wetEdge: false, seedIndex: si + 3 });
    ctx.restore();
  }
  strokeInk(ctx, pts, { width: 3, close: true, seedIndex: si + 4 });
}

/** 木牌按钮（按下有反馈、文字带 cream 描边）。 */
export function drawWoodButton(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  label: string, active: boolean, seedIndex: number,
): void {
  const grow = active ? 1.03 : 1.0;
  const bw = w * grow;
  const bh = h * grow;
  const bx = x - (bw - w) / 2;
  const by = y - (bh - h) / 2 + (active ? 2 : 0);
  drawWoodPlate(ctx, bx, by, bw, bh, {
    radius: Math.min(LAYOUT.BUTTON_RADIUS, bh / 2), base: PALETTE.leafMid, active, seedIndex,
  });
  // 两端小叶装饰
  drawPanelLeaf(ctx, bx + 6, by + bh / 2, 20, Math.PI * 0.95, PALETTE.leafLight, seedIndex + 9, false);
  drawPanelLeaf(ctx, bx + bw - 6, by + bh / 2, 20, Math.PI * 0.05, PALETTE.leafLight, seedIndex + 11, false);
  const size = fitSize(ctx, label, bw - 44, FONT.h2, 16);
  // 绿叶木牌是浅底：奶油字必须配深色描边，否则笔画和描边同色糊成一团
  textOutlined(ctx, label, bx + bw / 2, by + bh / 2 + 1, size, PALETTE.creamMist, 'center', 2.6, PALETTE.forestDeep);
}

/** 手绘小叶片进度条（图鉴收集度等）。 */
export function drawVineProgress(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  ratio: number, label: string, seedIndex: number,
): void {
  const r = clamp01(ratio);
  const track = roundPts(x, y, w, h, h / 2);
  fillPanel(ctx, track, PALETTE.forestDeep, { alpha: 0.35, layers: 1, wetEdge: false, seedIndex: seedIndex });
  strokeInk(ctx, track, { width: 2.4, close: true, seedIndex: seedIndex + 1 });
  if (r > 0.01) {
    const fill = roundPts(x + 2, y + 2, (w - 4) * r, h - 4, (h - 4) / 2);
    fillPanel(ctx, fill, PALETTE.leafLight, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seedIndex + 2 });
    strokeInk(ctx, fill, { width: 2, close: true, seedIndex: seedIndex + 3 });
  }
  // 藤蔓缠绕感：几片小叶沿进度条分布
  const leaves = 5;
  for (let i = 0; i < leaves; i++) {
    const lx = x + (w * (i + 0.5)) / leaves;
    const ang = i % 2 === 0 ? -1.1 : 1.1 + Math.PI;
    drawPanelLeaf(ctx, lx, y + h / 2, 14, ang, PALETTE.leafMid, seedIndex + 10 + i, false);
  }
  if (label.length > 0) {
    textPlain(ctx, label, x + w / 2, y + h / 2 + 1, FONT.badge, PALETTE.creamMist, 'center', 'bold');
  }
}

/** 雾气揭幕（面板入场 0.2~0.3s 的淡入 + 缩放由各场景自己控制缩放）。 */
export function drawRevealVeil(ctx: CanvasRenderingContext2D, progress: number, seedIndex: number): void {
  const inv = 1 - clamp01(progress);
  if (inv <= 0.001) return;
  const box = sceneBox();
  ctx.save();
  ctx.globalAlpha = inv * 0.55;
  ctx.fillStyle = rgba(PALETTE.creamMist, 0.9);
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.globalAlpha = inv * 0.4;
  for (let i = 0; i < 4; i++) {
    const y = 80 + i * 170 + Math.sin(i * 2.3 + progress * 3) * 18;
    ctx.fillStyle = rgba(PALETTE.skyWarm, 0.5);
    ctx.fillRect(box.x - 30, y, box.w + 60, 42 + (i % 2) * 22);
  }
  paperGrain(ctx, box.x, box.y, box.w, box.h, inv * 0.05, seedIndex);
  ctx.restore();
}

/** 底部小字提示（余额不足抖动提示等）。 */
export function drawToast(
  ctx: CanvasRenderingContext2D, text: string, alpha: number, seedIndex: number,
): void {
  if (alpha <= 0.02) return;
  const w = 460;
  const h = 52;
  const x = SCREEN.W / 2 - w / 2;
  const y = SCREEN.H - 86;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawWoodPlate(ctx, x, y, w, h, { radius: 20, base: PALETTE.berry, seedIndex, grain: false });
  textOutlined(ctx, text, SCREEN.W / 2, y + h / 2 + 1, FONT.entry, PALETTE.creamMist, 'center', 2);
  ctx.restore();
}

/* =========================================================================
 * 三、手绘小动物（8 物种共用一套骨架，按物种换耳朵/尾/斑纹）
 * ========================================================================= */

export interface CreatureOpts {
  /** 灰剪影（未解锁图鉴位） */
  silhouette?: boolean;
  /** 朝向：1 面向右，-1 面向左 */
  facing?: number;
}

/**
 * 画一只 Q 版小动物。`size` = 整体高度（像素，建议 72~170）。
 * 骨架固定（大头 + 小身体 + 短腿），物种差异只体现在耳朵、尾巴、斑纹与附属件。
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D, sp: SpeciesId, cx: number, cy: number, size: number,
  time: number, opts?: CreatureOpts,
): void {
  const o = opts || {};
  const u = size / 100;
  const face = o.facing === undefined ? 1 : o.facing;
  const def = SPECIES[sp];
  const sil = !!o.silhouette;
  const theme = sil ? tint(PALETTE.inkSoft, 0.52, PALETTE.forestDeep) : def.theme;
  const belly = sil ? theme : tint(def.theme, 0.60, PALETTE.paper);
  const deep = sil ? theme : tint(def.theme, 0.30, PALETTE.twilight);
  const ink = PALETTE.inkSoft;
  const groundY = cy + 44 * u + bob(time, 0.5, 2.4 * u);
  const bw = 30 * u;
  const bh = 24 * u;
  const bodyY = groundY - 26 * u;
  const headR = 29 * u;
  const headY = bodyY - bh * 0.92 - headR * 0.34;
  const seed = 300 + (sp.length * 7);

  ctx.save();
  drawSoftGroundShadow(ctx, cx, groundY + 2 * u, 30 * u, seed);

  // ---- 尾巴（在身体之后画） ----
  if (!sil) {
    if (sp === 'mouse') {
      strokeInk(ctx, [
        { x: cx - face * bw * 0.9, y: bodyY + 4 * u },
        { x: cx - face * (bw + 26) * u * 1.0, y: bodyY + 20 * u },
        { x: cx - face * (bw + 34) * u, y: bodyY - 6 * u },
      ], { width: 3.4 * u, color: tint(PALETTE.blossom, 0.2, PALETTE.bark), seedIndex: seed + 1 });
    } else if (sp === 'cat') {
      strokeInk(ctx, [
        { x: cx - face * bw * 0.86, y: bodyY + 6 * u },
        { x: cx - face * (bw + 20) * u, y: bodyY - 8 * u },
        { x: cx - face * (bw + 32) * u, y: bodyY - 26 * u },
      ], { width: 5 * u, color: deep, seedIndex: seed + 2 });
    } else if (sp === 'elephant' || sp === 'lion' || sp === 'tiger' || sp === 'leopard' || sp === 'wolf' || sp === 'dog') {
      strokeInk(ctx, [
        { x: cx - face * bw * 0.84, y: bodyY + 4 * u },
        { x: cx - face * (bw + 22) * u, y: bodyY - 2 * u },
        { x: cx - face * (bw + 28) * u, y: bodyY - 22 * u },
      ], { width: 5.4 * u, color: deep, seedIndex: seed + 3 });
    }
  }

  // ---- 四条短腿 ----
  for (let i = 0; i < 4; i++) {
    const lx = cx + (i < 2 ? -1 : 1) * bw * (i % 2 === 0 ? 0.62 : 0.28);
    const leg = roundPts(lx - 6.5 * u, bodyY + bh * 0.42, 13 * u, 17 * u, 5 * u);
    fillPanel(ctx, leg, deep, { alpha: 0.94, layers: 2, wetEdge: true, seedIndex: seed + 10 + i });
    strokeInk(ctx, leg, { width: 2.2 * u, close: true, seedIndex: seed + 14 + i });
  }

  // ---- 身体 ----
  const body = ellipsePts(cx, bodyY, bw, bh, 22);
  fillPanel(ctx, body, theme, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seed + 20 });
  const chest = ellipsePts(cx + face * 3 * u, bodyY + 4 * u, bw * 0.52, bh * 0.56, 18);
  fillPanel(ctx, chest, belly, { alpha: 0.85, layers: 1, wetEdge: false, seedIndex: seed + 21 });
  strokeInk(ctx, body, { width: 2.8 * u, close: true, seedIndex: seed + 22 });

  // 斑纹（虎：条纹；豹：环斑）
  if (!sil && (sp === 'tiger' || sp === 'leopard')) {
    for (let i = 0; i < 3; i++) {
      const sx = cx - face * bw * 0.62 + face * i * bw * 0.34;
      if (sp === 'tiger') {
        strokeInk(ctx, [
          { x: sx, y: bodyY - bh * 0.72 },
          { x: sx + face * 5 * u, y: bodyY - bh * 0.2 },
        ], { width: 3 * u, color: ink, jitter: 0.8, seedIndex: seed + 30 + i });
      } else {
        const ring = ellipsePts(sx, bodyY + (i % 2 === 0 ? -bh * 0.3 : bh * 0.2), 5 * u, 4 * u, 10);
        strokeInk(ctx, ring, { width: 1.8 * u, close: true, color: ink, seedIndex: seed + 34 + i });
      }
    }
  }

  // ---- 耳朵 / 鬃毛（在头部之后，头先画） ----
  const earY = headY - headR * 0.62;

  // 头部
  const head = ellipsePts(cx, headY, headR, headR * 0.94, 24);
  fillPanel(ctx, head, theme, { alpha: 0.97, layers: 2, wetEdge: true, seedIndex: seed + 40 });

  // 狮子鬃毛：一圈叶片
  if (!sil && sp === 'lion') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const len = 30 * u + (i % 3) * 3 * u;
      drawPanelLeaf(ctx, cx + Math.cos(a) * headR * 0.9, headY + Math.sin(a) * headR * 0.86,
        len, a, i % 2 === 0 ? PALETTE.sunset : PALETTE.barkLight, seed + 50 + i, false);
    }
  }

  if (!sil) {
    if (sp === 'elephant' || sp === 'mouse') {
      const ex = 26 * u;
      for (let i = 0; i < 2; i++) {
        const sgn = i === 0 ? -1 : 1;
        const ear = ellipsePts(cx + sgn * ex, earY + 4 * u, 17 * u, 17 * u, 16);
        fillPanel(ctx, ear, deep, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed + 60 + i });
        const inner = ellipsePts(cx + sgn * ex, earY + 4 * u, 10 * u, 10 * u, 14);
        fillPanel(ctx, inner, tint(PALETTE.blossom, 0.35, PALETTE.paper), {
          alpha: 0.55, layers: 1, wetEdge: false, seedIndex: seed + 62 + i,
        });
        strokeInk(ctx, ear, { width: 2.4 * u, close: true, seedIndex: seed + 64 + i });
      }
    } else if (sp === 'wolf') {
      for (let i = 0; i < 2; i++) {
        const sgn = i === 0 ? -1 : 1;
        const tri = [
          { x: cx + sgn * 14 * u, y: earY + 6 * u },
          { x: cx + sgn * 22 * u, y: earY - 16 * u },
          { x: cx + sgn * 30 * u, y: earY + 8 * u },
        ];
        fillPanel(ctx, tri, deep, { alpha: 0.95, layers: 2, wetEdge: false, seedIndex: seed + 66 + i });
        strokeInk(ctx, tri, { width: 2.2 * u, close: true, seedIndex: seed + 68 + i });
      }
    } else if (sp === 'dog') {
      for (let i = 0; i < 2; i++) {
        const sgn = i === 0 ? -1 : 1;
        drawPanelLeaf(ctx, cx + sgn * 24 * u, earY + 16 * u, 46 * u, sgn > 0 ? Math.PI * 0.62 : Math.PI * 0.38,
          deep, seed + 70 + i, true);
      }
    } else {
      // 猫科小三角耳
      for (let i = 0; i < 2; i++) {
        const sgn = i === 0 ? -1 : 1;
        const tri = [
          { x: cx + sgn * 10 * u, y: earY + 10 * u },
          { x: cx + sgn * 19 * u, y: earY - 14 * u },
          { x: cx + sgn * 27 * u, y: earY + 10 * u },
        ];
        fillPanel(ctx, tri, theme, { alpha: 0.96, layers: 2, wetEdge: false, seedIndex: seed + 72 + i });
        const inner = [
          { x: cx + sgn * 14 * u, y: earY + 7 * u },
          { x: cx + sgn * 19 * u, y: earY - 7 * u },
          { x: cx + sgn * 24 * u, y: earY + 7 * u },
        ];
        fillPanel(ctx, inner, tint(PALETTE.blossom, 0.3, PALETTE.paper), {
          alpha: 0.6, layers: 1, wetEdge: false, seedIndex: seed + 74 + i,
        });
        strokeInk(ctx, tri, { width: 2.2 * u, close: true, seedIndex: seed + 76 + i });
      }
    }
  }
  strokeInk(ctx, head, { width: 2.8 * u, close: true, seedIndex: seed + 80 });

  if (sil) {
    ctx.restore();
    return;
  }

  // ---- 五官 ----
  const eyeY = headY - 2 * u;
  const eyeX = 10.5 * u;
  for (let i = 0; i < 2; i++) {
    const sgn = i === 0 ? -1 : 1;
    const ex = cx + sgn * eyeX;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(ex, eyeY, 3.1 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(PALETTE.creamMist, 0.9);
    ctx.beginPath();
    ctx.arc(ex + 1.1 * u, eyeY - 1.2 * u, 1.1 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 腮红
    const blush = ellipsePts(cx + sgn * 20 * u, eyeY + 9 * u, 6.5 * u, 4.4 * u, 12);
    fillPanel(ctx, blush, PALETTE.blossom, { alpha: 0.42, layers: 1, wetEdge: false, seedIndex: seed + 90 + i });
  }

  // 口鼻
  const muzzle = ellipsePts(cx, headY + 12 * u, 13 * u, 10 * u, 16);
  fillPanel(ctx, muzzle, tint(theme, 0.72, PALETTE.paper), {
    alpha: 0.92, layers: 1, wetEdge: false, seedIndex: seed + 94,
  });
  strokeInk(ctx, muzzle, { width: 2 * u, close: true, seedIndex: seed + 95 });
  // 鼻 + 嘴
  const nose = [
    { x: cx - 3.4 * u, y: headY + 8.4 * u },
    { x: cx + 3.4 * u, y: headY + 8.4 * u },
    { x: cx, y: headY + 11.6 * u },
  ];
  fillPanel(ctx, nose, ink, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seed + 96 });
  strokeInk(ctx, nose, { width: 1.6 * u, close: true, seedIndex: seed + 97 });
  strokeInk(ctx, [
    { x: cx - 5 * u, y: headY + 13 * u },
    { x: cx - 1 * u, y: headY + 15 * u },
    { x: cx, y: headY + 13 * u },
    { x: cx + 1 * u, y: headY + 15 * u },
    { x: cx + 5 * u, y: headY + 13 * u },
  ], { width: 1.8 * u, jitter: 0.5, seedIndex: seed + 98 });

  // 物种专属件
  if (sp === 'elephant') {
    // 象鼻
    const trunk: P[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      trunk.push({ x: cx + Math.sin(t * 2.1) * 6 * u, y: headY + 16 * u + t * 26 * u });
    }
    strokeInk(ctx, trunk, { width: 9 * u, color: deep, jitter: 0.8, seedIndex: seed + 100 });
    strokeInk(ctx, trunk, { width: 2 * u, jitter: 1.0, seedIndex: seed + 101 });
    // 象牙
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? -1 : 1;
      const tusk = [
        { x: cx + sgn * 8 * u, y: headY + 15 * u },
        { x: cx + sgn * 13 * u, y: headY + 22 * u },
        { x: cx + sgn * 10 * u, y: headY + 25 * u },
      ];
      fillPanel(ctx, tusk, PALETTE.paper, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: seed + 102 + i });
      strokeInk(ctx, tusk, { width: 1.6 * u, close: true, seedIndex: seed + 104 + i });
    }
  } else if (sp === 'cat') {
    for (let i = 0; i < 3; i++) {
      const wy = headY + 10 * u + i * 3.4 * u;
      strokeInk(ctx, [{ x: cx + 14 * u, y: wy }, { x: cx + 30 * u, y: wy - 3 * u }], {
        width: 1.4 * u, jitter: 0.4, seedIndex: seed + 110 + i,
      });
      strokeInk(ctx, [{ x: cx - 14 * u, y: wy }, { x: cx - 30 * u, y: wy - 3 * u }], {
        width: 1.4 * u, jitter: 0.4, seedIndex: seed + 114 + i,
      });
    }
  } else if (sp === 'dog') {
    const tongue = ellipsePts(cx, headY + 17 * u, 4.6 * u, 6 * u, 12);
    fillPanel(ctx, tongue, PALETTE.blossom, { alpha: 0.88, layers: 1, wetEdge: false, seedIndex: seed + 120 });
    strokeInk(ctx, tongue, { width: 1.6 * u, close: true, seedIndex: seed + 121 });
  } else if (sp === 'wolf') {
    const fluff = ellipsePts(cx, bodyY + 8 * u, bw * 0.46, bh * 0.5, 16);
    fillPanel(ctx, fluff, tint(PALETTE.paper, 0.35, theme), {
      alpha: 0.6, layers: 1, wetEdge: false, seedIndex: seed + 124,
    });
  } else if (sp === 'tiger') {
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? -1 : 1;
      strokeInk(ctx, [
        { x: cx + sgn * 6 * u, y: headY - headR * 0.78 },
        { x: cx + sgn * 12 * u, y: headY - headR * 0.46 },
      ], { width: 2.6 * u, color: ink, jitter: 0.6, seedIndex: seed + 126 + i });
    }
  }
  ctx.restore();
}

/* =========================================================================
 * 四、动物卡（§7.5 骨架的横屏缩小版）
 * ========================================================================= */

export interface CardState {
  selected?: boolean;
  locked?: boolean;
  /** 0..1：按下反馈强度 */
  press?: number;
}

/** 画一张动物卡：牛皮纸底 + 木框 + 立绘 + 名称条 + 费用圆牌。 */
export function drawAnimalCard(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  sp: SpeciesId, state: CardState, t: number, seedIndex: number,
): void {
  const st = state || {};
  const press = st.press === undefined ? 0 : st.press;
  const def = SPECIES[sp];
  const grow = 1 + press * 0.05;
  const cw = w * grow;
  const ch = h * grow;
  const cx0 = x - (cw - w) / 2;
  const cy0 = y - (ch - h) / 2;
  const r = LAYOUT.CARD.radius;

  // 卡面纸底 + 木框
  const cardPts = roundPts(cx0, cy0, cw, ch, r);
  dropShadow(ctx, cx0, cy0, cw, ch, r, seedIndex);
  fillPanel(ctx, cardPts, PALETTE.paper, { alpha: 0.98, layers: 2, wetEdge: true, seedIndex: seedIndex + 1 });
  woodGrain(ctx, cx0 + 5, cy0 + 5, cw - 10, ch - 10, seedIndex + 2);
  strokeInk(ctx, cardPts, { width: 3, close: true, seedIndex: seedIndex + 3 });
  const frame = roundPts(cx0 + 5, cy0 + 5, cw - 10, ch - 10, r - 3);
  strokeInk(ctx, frame, { width: 1.8, jitter: 1.0, seedIndex: seedIndex + 4 });
  // 四角小叶
  drawPanelLeaf(ctx, cx0 + 8, cy0 + 8, 17, Math.PI * 0.75, PALETTE.leafMid, seedIndex + 5, false);
  drawPanelLeaf(ctx, cx0 + cw - 8, cy0 + 8, 17, Math.PI * 0.25, PALETTE.leafMid, seedIndex + 6, false);

  // 立绘
  drawCreature(ctx, sp, cx0 + cw / 2, cy0 + ch * 0.42, ch * 0.44, t, { silhouette: st.locked });

  // 名称条
  const nameH = Math.max(24, ch * 0.17);
  const nameY = cy0 + ch - nameH - 6;
  const namePts = roundPts(cx0 + 7, nameY, cw - 14, nameH, 11);
  fillPanel(ctx, namePts, PALETTE.barkLight, { alpha: 0.97, layers: 2, wetEdge: true, seedIndex: seedIndex + 10 });
  woodGrain(ctx, cx0 + 12, nameY + 3, cw - 24, nameH - 6, seedIndex + 11);
  strokeInk(ctx, namePts, { width: 2.4, close: true, seedIndex: seedIndex + 12 });
  const nameText = st.locked ? '？？？' : def.cn;
  const nameSize = fitSize(ctx, nameText, cw - 26, FONT.h2, 14);
  textOutlined(ctx, nameText, cx0 + cw / 2, nameY + nameH / 2 + 1, nameSize, PALETTE.inkSoft, 'center', 2);

  // 费用圆牌（左上，sunbeam 底）
  const cr = Math.max(11, cw * 0.10);
  const chipCx = cx0 + cr + 7;
  const chipCy = cy0 + cr + 7;
  const chip = arcPoints(chipCx, chipCy, cr, 0, Math.PI * 2, 16);
  fillPanel(ctx, chip, PALETTE.sunbeam, { alpha: 0.97, layers: 2, wetEdge: false, seedIndex: seedIndex + 20 });
  strokeInk(ctx, chip, { width: 2.2, close: true, seedIndex: seedIndex + 21 });
  textPlain(ctx, '' + def.cost, chipCx, chipCy + 1, cr * 1.25, PALETTE.inkSoft, 'center', 'bold');

  if (st.locked) {
    // 灰色剪影 + 手绘锁 + 迷雾
    ctx.save();
    ctx.globalAlpha = 0.5;
    const veil = roundPts(cx0 + 3, cy0 + 3, cw - 6, ch - 6, r - 2);
    fillPanel(ctx, veil, tint(PALETTE.inkSoft, 0.55, PALETTE.creamMist), {
      alpha: 0.7, layers: 1, wetEdge: false, seedIndex: seedIndex + 30,
    });
    ctx.restore();
    drawLock(ctx, cx0 + cw - 22, cy0 + 22, 13, seedIndex + 31);
  }

  if (st.selected) {
    // 选中：一圈 sunbeam 光点缓慢旋转（§7.5 可购买反馈的同款语言）
    const ringPts = roundPts(cx0 - 5, cy0 - 5, cw + 10, ch + 10, r + 4);
    strokeInk(ctx, ringPts, { width: 3.4, color: PALETTE.sunbeam, jitter: 1.6, seedIndex: seedIndex + 40 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t / 1400;
      drawSparkle(ctx, cx0 + cw / 2 + Math.cos(a) * (cw * 0.56), cy0 + ch / 2 + Math.sin(a) * (ch * 0.54),
        5 + (i % 3), PALETTE.sunbeam, 0.5);
    }
  }
}

/** 手绘小锁（未解锁格子）。 */
export function drawLock(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seedIndex: number): void {
  const body = roundPts(cx - r, cy - r * 0.2, r * 2, r * 1.5, r * 0.4);
  fillPanel(ctx, body, tint(PALETTE.soil, 0.25, PALETTE.bark), {
    alpha: 0.95, layers: 2, wetEdge: false, seedIndex: seedIndex,
  });
  strokeInk(ctx, body, { width: 2.4, close: true, seedIndex: seedIndex + 1 });
  strokeInk(ctx, [
    { x: cx - r * 0.55, y: cy - r * 0.24 },
    { x: cx - r * 0.55, y: cy - r * 0.72 },
    { x: cx, y: cy - r * 1.05 },
    { x: cx + r * 0.55, y: cy - r * 0.72 },
    { x: cx + r * 0.55, y: cy - r * 0.24 },
  ], { width: 2.4, jitter: 0.7, seedIndex: seedIndex + 2 });
  const hole = ellipsePts(cx, cy + r * 0.34, r * 0.22, r * 0.3, 10);
  fillPanel(ctx, hole, PALETTE.inkSoft, { alpha: 0.85, layers: 1, wetEdge: false, seedIndex: seedIndex + 3 });
}

/* =========================================================================
 * 五、卡组页场景
 * ========================================================================= */

const CARD_W = 124;
const CARD_H = 172;
const GRID_X = 110;
const GRID_Y = 106;
const GRID_GAP_X = 16;
const GRID_GAP_Y = 12;
const PANEL_X = 556;
const PANEL_Y = 106;
const PANEL_W = 664;
const PANEL_H = 540;
const BTN_X = 490;
const BTN_Y = 656;
const BTN_W = 300;
const BTN_H = 52;
const BACK_X = 26;
const BACK_Y = 24;
const BACK_SIZE = 60;

export class DeckScene implements Scene {
  readonly name = 'deck';
  private t = 0;
  private t0 = -1;
  private enterMs = 0;
  /** 当前选中的卡（0..7） */
  private sel = 2;
  private hover = -1;
  private press = '';
  private pressMs = 0;
  private modal = false;
  private modalOkActive = false;

  enter(): void {
    this.t0 = -1;
    this.enterMs = 0;
    this.press = '';
    this.modal = false;
  }

  tick(logicTime: number): void {
    this.t = logicTime;
    if (this.t0 < 0) this.t0 = logicTime;
    this.enterMs = logicTime - this.t0;
    if (this.press !== '' && this.pressMs > 0) this.pressMs -= 50;
  }

  render(ctx: any, renderTime: number): void {
    const t = renderTime;
    const save = loadSave();
    const p = clamp01(this.enterMs / 260);
    const s = 0.94 + 0.06 * easeOutCubic(p);
    const cx = SCREEN.W / 2;
    const cy = SCREEN.H / 2;

    drawScreenBase(ctx, t, 700);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);

    // 顶部
    drawBackButton(ctx, BACK_X, BACK_Y, BACK_SIZE, this.press === 'back', 730);
    drawTitlePlate(ctx, SCREEN.W / 2, 18, 360, 76, '我的卡组', 760);
    drawCurrencyChips(ctx, 34, t, save, 800);

    // 3×3 卡位（8 只动物 + 1 个未解锁位）——动物牌一律贴用户原图卡面（100% 还原）
    const cardScale = CARD_W / LAYOUT.CARD.w;
    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = GRID_X + col * (CARD_W + GRID_GAP_X);
      const y = GRID_Y + row * (CARD_H + GRID_GAP_Y);
      if (i < SPECIES_ORDER.length) {
        const sp = SPECIES_ORDER[i];
        const def = SPECIES[sp];
        const press = this.press === 'card' + i ? clamp01(this.pressMs / 200) : 0;
        drawCard(ctx, {
          kind: 'animal', cn: def.cn, cost: def.cost, species: sp,
          level: 1, quality: 1, atk: def.atk, atkInterval: def.atkInterval, hp: def.hp,
          traitName: def.traitName, traitDesc: def.traitDesc,
        }, x, y, {
          time: t, scale: cardScale, affordable: true,
          selected: this.sel === i, pressed: press > 0,
        });
      } else {
        drawAnimalCard(ctx, x, y, CARD_W, CARD_H, SPECIES_ORDER[0], { locked: true }, t, 860 + i * 7);
      }
    }

    // 右侧详情面板
    this.drawDetailPanel(ctx, t);

    // 底部按钮
    drawWoodButton(ctx, BTN_X, BTN_Y, BTN_W, BTN_H, '编辑卡组', this.press === 'edit', 1200);

    ctx.restore();

    drawRevealVeil(ctx, p, 1240);

    if (this.modal) this.drawModal(ctx);
  }

  /** 右侧：当前选中动物的立绘与完整数值（数值全部读 SPECIES）。 */
  private drawDetailPanel(ctx: CanvasRenderingContext2D, t: number): void {
    const sp = SPECIES_ORDER[this.sel];
    const def = SPECIES[sp];
    const x = PANEL_X;
    const y = PANEL_Y;
    const w = PANEL_W;
    const h = PANEL_H;

    drawWoodPlate(ctx, x, y, w, h, { radius: LAYOUT.PANEL_RADIUS, base: PALETTE.paper, seedIndex: 1300 });
    paperGrain(ctx, x + 8, y + 8, w - 16, h - 16, 0.04, 1302);

    // 立绘
    const artX = x + 132;
    const artY = y + 152;
    const ring = arcPoints(artX, artY + 6, 96, 0, Math.PI * 2, 26);
    fillPanel(ctx, ring, tint(def.theme, 0.72, PALETTE.creamMist), {
      alpha: 0.55, layers: 2, wetEdge: true, seedIndex: 1304,
    });
    strokeInk(ctx, ring, { width: 2.4, close: true, seedIndex: 1305 });
    const petImg = getImage('unit-' + sp);
    if (petImg) {
      const ph = 182;
      ctx.drawImage(petImg, artX - ph / 2, artY + 6 - ph / 2, ph, ph);
    } else {
      drawCreature(ctx, sp, artX, artY, 168, t);
    }

    // 名称 + 费用
    const nameX = x + 268;
    textOutlined(ctx, def.cn, nameX, y + 66, FONT.h1, PALETTE.forestDeep, 'left', 2.4);
    const chip = arcPoints(nameX + 116, y + 64, 26, 0, Math.PI * 2, 16);
    fillPanel(ctx, chip, PALETTE.sunbeam, { alpha: 0.97, layers: 2, wetEdge: false, seedIndex: 1306 });
    strokeInk(ctx, chip, { width: 2.4, close: true, seedIndex: 1307 });
    textPlain(ctx, '' + def.cost, nameX + 116, y + 65, FONT.h2, PALETTE.inkSoft, 'center', 'bold');
    textPlain(ctx, '费用', nameX + 152, y + 66, FONT.badge, rgba(PALETTE.forestDeep, 0.85), 'left', 'normal');

    // 数值行
    const statY = y + 118;
    const stats: { label: string; value: string }[] = [
      { label: '战力序', value: '' + def.power },
      { label: '生命', value: '' + def.hp },
      { label: '攻击', value: '' + def.atk },
      { label: '攻速', value: def.atkInterval.toFixed(2) + 's' },
    ];
    for (let i = 0; i < stats.length; i++) {
      const bx = nameX + i * 96;
      const badge = roundPts(bx, statY - 20, 88, 40, 16);
      fillPanel(ctx, badge, PALETTE.meadow, { alpha: 0.8, layers: 1, wetEdge: false, seedIndex: 1310 + i });
      strokeInk(ctx, badge, { width: 2, close: true, seedIndex: 1314 + i });
      textPlain(ctx, stats[i].value, bx + 44, statY - 6, FONT.entry, PALETTE.forestDeep, 'center', 'bold');
      textPlain(ctx, stats[i].label, bx + 44, statY + 12, FONT.badge - 3, rgba(PALETTE.forestDeep, 0.8), 'center', 'normal');
    }

    // 特技
    const trY = y + 194;
    const trPlate = roundPts(nameX - 14, trY, w - 268 - 40, 108, 18);
    fillPanel(ctx, trPlate, tint(PALETTE.leafMid, 0.86, PALETTE.creamMist), {
      alpha: 0.85, layers: 2, wetEdge: true, seedIndex: 1320,
    });
    strokeInk(ctx, trPlate, { width: 2.4, close: true, seedIndex: 1321 });
    drawPanelLeaf(ctx, nameX + 4, trY + 22, 22, Math.PI * 0.85, PALETTE.leafMid, 1322, false);
    textOutlined(ctx, '特技 · ' + def.traitName, nameX + 24, trY + 24, FONT.body, PALETTE.forestDeep, 'left', 2);
    wrapText(ctx, def.traitDesc, nameX + 4, trY + 60, w - 300, FONT.badge + 1, 24,
      rgba(PALETTE.inkSoft, 0.9), 'left', 3);

    // 克制关系（§6 闭环，学克制系统的入口）
    const cY = y + 318;
    const cw = w - 268 - 40;
    textPlain(ctx, '克制闭环', nameX, cY, FONT.badge + 2, PALETTE.forestDeep, 'left', 'bold');
    const beats = SPECIES[COUNTER[sp]];
    const loses = SPECIES[counteredBy(sp)];
    const box = roundPts(nameX, cY + 16, cw, 122, 18);
    fillPanel(ctx, box, tint(PALETTE.sunbeam, 0.72, PALETTE.paper), {
      alpha: 0.7, layers: 1, wetEdge: false, seedIndex: 1330,
    });
    strokeInk(ctx, box, { width: 2.2, close: true, seedIndex: 1331 });
    // 中间是当前宠物：左＝克制我的，右＝我克制的。箭头方向就是克制方向。
    const sY = cY + 56;
    const cX = nameX + 178;
    const lX = nameX + 46;
    const rX = nameX + 310;
    const spImg = getImage('unit-' + sp);
    const beatsImg = getImage('unit-' + beats.id);
    const losesImg = getImage('unit-' + loses.id);
    if (losesImg) ctx.drawImage(losesImg, lX - 24, sY - 24, 48, 48);
    else drawCreature(ctx, loses.id, lX, sY, 40, t);
    if (spImg) ctx.drawImage(spImg, cX - 32, sY - 32, 64, 64);
    else drawCreature(ctx, sp, cX, sY, 52, t);
    if (beatsImg) ctx.drawImage(beatsImg, rX - 24, sY - 24, 48, 48);
    else drawCreature(ctx, beats.id, rX, sY, 40, t);
    // 左箭头指向中间（谁克制我），右箭头由中间指出（我克制谁）
    strokeInk(ctx, [{ x: lX + 34, y: sY + 2 }, { x: lX + 62, y: sY - 8 }, { x: lX + 90, y: sY + 2 }],
      { width: 2.6, jitter: 0.8, color: PALETTE.berry, seedIndex: 1332 });
    strokeInk(ctx, [{ x: cX + 44, y: sY + 2 }, { x: cX + 70, y: sY - 8 }, { x: cX + 96, y: sY + 2 }],
      { width: 2.6, jitter: 0.8, color: PALETTE.forestDeep, seedIndex: 1333 });
    textPlain(ctx, loses.cn, lX, sY + 38, FONT.badge - 2, rgba(PALETTE.inkSoft, 0.85), 'center', 'bold');
    textPlain(ctx, def.cn, cX, sY + 46, FONT.badge - 2, PALETTE.inkSoft, 'center', 'bold');
    textPlain(ctx, beats.cn, rX, sY + 38, FONT.badge - 2, rgba(PALETTE.inkSoft, 0.85), 'center', 'bold');
    textPlain(ctx, '左：克制我的（伤害 ×0.75）　右：我克制的（伤害 ×1.5）', nameX + cw / 2, cY + 120,
      FONT.badge - 3, rgba(PALETTE.forestDeep, 0.85), 'center', 'normal');

    // 页脚说明
    textPlain(ctx, '本作 8 物种全解锁：卡组编辑用于装扮用途，暂仅展示。',
      x + w / 2, y + h - 26, FONT.badge, rgba(PALETTE.inkSoft, 0.8), 'center', 'normal');
  }

  /** 「编辑卡组」的手绘提示弹窗。 */
  private drawModal(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = rgba(PALETTE.forestDeep, 0.55);
    const mbox = sceneBox();
    ctx.fillRect(mbox.x, mbox.y, mbox.w, mbox.h);
    ctx.restore();

    const w = 560;
    const h = 268;
    const x = SCREEN.W / 2 - w / 2;
    const y = SCREEN.H / 2 - h / 2 - 14;
    drawWoodPlate(ctx, x, y, w, h, { radius: 28, base: PALETTE.paper, seedIndex: 1400 });
    drawPanelLeaf(ctx, x + 26, y + 28, 30, Math.PI * 0.8, PALETTE.leafMid, 1401, true);
    drawPanelLeaf(ctx, x + w - 26, y + 28, 30, Math.PI * 0.2, PALETTE.leafMid, 1402, true);
    textOutlined(ctx, '卡组编辑', SCREEN.W / 2, y + 52, FONT.h2, PALETTE.forestDeep, 'center', 2.4);
    wrapText(ctx, '本作采用 8 物种全解锁的设计：出战阵容在战斗内的集市阶段用阳光现场购买与合成。' +
      '这里的卡组编辑只用于装扮与展示，暂仅展示。',
      SCREEN.W / 2, y + 116, w - 80, FONT.body - 1, 30, rgba(PALETTE.inkSoft, 0.9), 'center', 4);
    drawWoodButton(ctx, SCREEN.W / 2 - 110, y + h - 76, 220, 54, '知道了', this.modalOkActive, 1410);
  }

  /** 卡位命中判定（返回 0..8，-1 未命中）。 */
  private hitCard(x: number, y: number): number {
    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cxp = GRID_X + col * (CARD_W + GRID_GAP_X);
      const cyp = GRID_Y + row * (CARD_H + GRID_GAP_Y);
      if (inRect(x, y, cxp, cyp, CARD_W, CARD_H)) return i;
    }
    return -1;
  }

  gesture(e: GestureEvent): void {
    if (e.type === 'move') {
      this.hover = this.hitCard(e.x, e.y);
      if (this.modal) this.modalOkActive = inRect(e.x, e.y, SCREEN.W / 2 - 110, SCREEN.H / 2 - 14 + 134 - 76, 220, 54);
      return;
    }
    if (e.type === 'down') {
      if (this.modal) {
        this.modalOkActive = inRect(e.x, e.y, SCREEN.W / 2 - 110, SCREEN.H / 2 - 14 + 134 - 76, 220, 54);
        return;
      }
      if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) this.press = 'back';
      else if (inRect(e.x, e.y, BTN_X, BTN_Y, BTN_W, BTN_H)) this.press = 'edit';
      else {
        const idx = this.hitCard(e.x, e.y);
        this.press = idx >= 0 ? 'card' + idx : '';
      }
      this.pressMs = 200;
      return;
    }
    if (e.type !== 'up' || e.wasDrag) return;
    const was = this.press;
    this.press = '';
    if (this.modal) {
      const ok = inRect(e.x, e.y, SCREEN.W / 2 - 110, SCREEN.H / 2 - 14 + 134 - 76, 220, 54);
      if (ok) {
        playSfx('tap');
        this.modal = false;
      }
      return;
    }
    if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) {
      playSfx('tap');
      popScene();
      return;
    }
    if (inRect(e.x, e.y, BTN_X, BTN_Y, BTN_W, BTN_H)) {
      playSfx('cardPick');
      this.modal = true;
      return;
    }
    const idx = this.hitCard(e.x, e.y);
    if (idx >= 0) {
      if (idx < SPECIES_ORDER.length) {
        this.sel = idx;
        playSfx('tap');
      } else {
        playSfx('reject');
      }
      return;
    }
    if (was !== '') this.pressMs = 0;
  }
}

/** 返回上一场景（走 manager 的 pop，带纸页淡出）。 */
function popScene(): void {
  pop();
}

/** 卡组页工厂。 */
export function createDeckScene(): Scene {
  return new DeckScene();
}