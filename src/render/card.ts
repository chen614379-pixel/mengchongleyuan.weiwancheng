/**
 * 卡牌渲染（§7.5）：牛皮纸 + 手绘木框 + 四角叶藤，费用圆牌 / 品质花纹 / 半身动物 /
 * 木牌名称条 / 图标数字行 / 克制关系环 / 特性说明。
 *
 * 天气牌不走木框：按天气给角落染色并用云、光、雨丝做软边；
 * 加成牌左上带「指定」手绘标签；不可购买 = 灰雾 + 费用闪红；可购买 = 右下阳光点旋转。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE, rgba, tint } from '../config/palette';
import { SPECIES, SpeciesId, counteredBy } from '../config/species';
import { BuffId, CardKind } from '../config/cards';
import { WeatherId, WEATHER_COMBOS, weatherDef } from '../config/weather';
import { blobPath, fillWatercolor, noiseAt, roundRectPath, roundedRectPoints, strokeInk, tracePath, P } from '../ui/brush';
import { clamp01, cycle } from '../ui/ease';
import { RADIUS, STROKE, fitSize, setFont, textOutlined, textPlain } from '../ui/theme';
import {
  drawCloud, drawLeaf, drawSunMote, drawVine, paperBase, woodGrain
} from './paint';
import { getImage } from './assets';
import { drawSpeciesCreature, drawSpeciesSilhouette } from './unit';
import { weatherTint } from './forest';

const TAU = Math.PI * 2;

export interface CardView {
  kind: CardKind;
  cn: string;
  cost: number;
  species?: SpeciesId;
  level?: number;
  quality?: number;
  atk?: number;
  atkInterval?: number;
  hp?: number;
  traitName?: string;
  traitDesc?: string;
  weather?: WeatherId;
  buff?: BuffId;
  desc?: string[];
  tag?: 'atk' | 'def' | 'util';
}

export interface CardDrawOpts {
  time?: number;
  scale?: number;
  affordable?: boolean;
  pressed?: boolean;
  drag?: boolean;
  alpha?: number;
  selected?: boolean;
}

/** 卡牌基准尺寸（与 LAYOUT.CARD 同步）。 */
export function cardSize(): { w: number; h: number } {
  return { w: LAYOUT.CARD.w, h: LAYOUT.CARD.h };
}

function rectPts(x: number, y: number, w: number, h: number): P[] {
  return [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ];
}

function tagColor(tag?: 'atk' | 'def' | 'util'): string {
  if (tag === 'atk') return PALETTE.berry;
  if (tag === 'def') return PALETTE.forestMid;
  return PALETTE.stream;
}

/* ------------------------------------------------------------------ */
/* 零件                                                                */
/* ------------------------------------------------------------------ */

/** 费用圆牌：太阳圆盘 + 手绘数字（不可购买时闪红）。 */
export function drawCostCoin(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  cost: number,
  time?: number,
  flash?: boolean,
): void {
  const t = time === undefined ? 0 : time;
  const pulse = flash ? 0.5 + 0.5 * Math.sin(t / 60) : 0;
  ctx.save();
  // 太阳光刺
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + t / 2600;
    ctx.save();
    ctx.strokeStyle = rgba(PALETTE.sunbeam, 0.75);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r + 2), cy + Math.sin(a) * (r + 2));
    ctx.lineTo(cx + Math.cos(a) * (r + 8), cy + Math.sin(a) * (r + 8));
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // 圆盘
  ctx.save();
  const pts: P[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const k = 1 + noiseAt(i, 31) * 0.06;
    pts.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
  }
  fillWatercolor(ctx, pts, flash ? tint(PALETTE.berry, 0.3, PALETTE.sunbeam) : PALETTE.sunbeam, {
    alpha: 0.98, layers: 2, wetEdge: true, seedIndex: 32,
  });
  strokeInk(ctx, pts, { width: 2.6, close: true, seedIndex: 33, jitter: 0.9 });
  ctx.restore();
  if (pulse > 0.02) {
    ctx.save();
    ctx.globalAlpha = pulse * 0.5;
    strokeInk(ctx, pts, { width: 3, close: true, color: PALETTE.berry, seedIndex: 34, jitter: 1.4 });
    ctx.restore();
  }
  textOutlined(ctx, '' + cost, cx, cy + r * 0.42, r * 1.5, PALETTE.inkSoft, 'center', 0);
}

/** 品质花纹：花瓣数 = 等级（1~3）。 */
export function drawQualityMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  level: number,
  seedIndex?: number,
): void {
  const n = Math.max(1, Math.min(3, Math.round(level)));
  const seed = seedIndex === undefined ? 0 : seedIndex;
  ctx.save();
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU - Math.PI / 2;
    const px = cx + Math.cos(a) * r * 0.62;
    const py = cy + Math.sin(a) * r * 0.62;
    const p: P[] = [];
    for (let k = 0; k < 12; k++) {
      const b = (k / 12) * TAU;
      p.push({ x: px + Math.cos(b) * r * 0.44 * (1 + noiseAt(k, seed + i) * 0.08), y: py + Math.sin(b) * r * 0.34 });
    }
    fillWatercolor(ctx, p, n >= 3 ? PALETTE.berry : n === 2 ? PALETTE.forestMid : PALETTE.leafMid, {
      alpha: 0.92, layers: 1, seedIndex: seed + i * 3,
    });
    strokeInk(ctx, p, { width: 1.6, close: true, seedIndex: seed + i * 5, jitter: 0.7 });
  }
  // 花心
  const c: P[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    c.push({ x: cx + Math.cos(a) * r * 0.3, y: cy + Math.sin(a) * r * 0.3 });
  }
  fillWatercolor(ctx, c, PALETTE.sunbeam, { alpha: 0.95, layers: 1, seedIndex: seed + 9 });
  strokeInk(ctx, c, { width: 1.6, close: true, seedIndex: seed + 11, jitter: 0.6 });
  // 等级点
  ctx.restore();
}

/** 加成牌小图标（按 tag 分三种母题，全部手绘）。 */
export function drawBuffIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  buff: BuffId,
  tag?: 'atk' | 'def' | 'util',
  seedIndex?: number,
): void {
  const seed = seedIndex === undefined ? 0 : seedIndex;
  void buff;
  const color = tagColor(tag);
  ctx.save();
  // 圆底
  const disc: P[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    disc.push({ x: cx + Math.cos(a) * r * (1 + noiseAt(i, seed) * 0.07), y: cy + Math.sin(a) * r * (1 + noiseAt(i + 3, seed) * 0.07) });
  }
  fillWatercolor(ctx, disc, PALETTE.creamMist, { alpha: 0.95, layers: 1, seedIndex: seed + 1 });
  strokeInk(ctx, disc, { width: 1.8, close: true, color: color, seedIndex: seed + 2, jitter: 0.7 });
  if (tag === 'atk') {
    for (let i = -1; i <= 1; i++) {
      strokeInk(
        ctx,
        [
          { x: cx + i * r * 0.34, y: cy - r * 0.5 },
          { x: cx + i * r * 0.34 + r * 0.2, y: cy + r * 0.5 },
        ],
        { width: 2.2, color: color, seedIndex: seed + 5 + i },
      );
    }
  } else if (tag === 'def') {
    const shield: P[] = [
      { x: cx - r * 0.45, y: cy - r * 0.42 },
      { x: cx + r * 0.45, y: cy - r * 0.42 },
      { x: cx + r * 0.34, y: cy + r * 0.36 },
      { x: cx, y: cy + r * 0.58 },
      { x: cx - r * 0.34, y: cy + r * 0.36 },
    ];
    fillWatercolor(ctx, shield, tint(color, 0.35, PALETTE.leafLight), { alpha: 0.95, layers: 1, seedIndex: seed + 6 });
    strokeInk(ctx, shield, { width: 1.8, close: true, color: color, seedIndex: seed + 7 });
  } else {
    drawVine(
      ctx,
      [
        { x: cx - r * 0.4, y: cy + r * 0.3 },
        { x: cx, y: cy - r * 0.4 },
        { x: cx + r * 0.42, y: cy + r * 0.28 },
      ],
      seed + 8,
      { width: 2.2, leafEvery: 10, leafLen: r * 0.5, color: color },
    );
  }
  ctx.restore();
}

/** 克制关系环：左 = 被我克制的物种，右 = 克制我的物种（两端都要画，§7.5 强制）。 */
export function drawCounterRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  species: SpeciesId,
): void {
  ctx.save();
  // 木牌底
  const bar: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, bar, PALETTE.barkLight, { alpha: 0.95, layers: 1, wetEdge: true, seedIndex: 71 });
  woodGrain(ctx, x, y, w, h, 72);
  strokeInk(ctx, bar, { width: 2.2, close: true, seedIndex: 73, jitter: 0.8 });
  // 两端藤叶
  drawVine(ctx, [{ x: x + 3, y: y + h / 2 }, { x: x + 16, y: y + h / 2 }], 74, { width: 2, leafEvery: 8, leafLen: 7 });
  drawVine(ctx, [{ x: x + w - 3, y: y + h / 2 }, { x: x + w - 16, y: y + h / 2 }], 75, { width: 2, leafEvery: 8, leafLen: 7 });
  // 双向箭头
  const cy = y + h / 2;
  const ax = x + w * 0.5;
  const half = w * 0.17;
  strokeInk(
    ctx,
    [
      { x: ax - half, y: cy },
      { x: ax + half, y: cy },
    ],
    { width: 2.6, color: PALETTE.bark, seedIndex: 76 },
  );
  for (let i = -1; i <= 1; i += 2) {
    strokeInk(
      ctx,
      [
        { x: ax + i * half, y: cy },
        { x: ax + i * (half - 6), y: cy - 5 },
        { x: ax + i * (half - 6), y: cy + 5 },
      ],
      { width: 2.2, color: PALETTE.bark, seedIndex: 77 + i },
    );
  }
  // 两端物种小像
  const ox = x + w * 0.22;
  drawSpeciesSilhouette(ctx, preyOf(species), ox, cy, h * 0.62, PALETTE.forestMid, 0.9);
  const dx = x + w * 0.78;
  drawSpeciesSilhouette(ctx, counteredBy(species), dx, cy, h * 0.62, PALETTE.twilight, 0.9);
  ctx.restore();
}

/** 被我克制的物种（COUNTER 表的正向前驱）。 */
function preyOf(species: SpeciesId): SpeciesId {
  const all: SpeciesId[] = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'mouse'];
  for (let i = 0; i < all.length; i++) {
    if (counteredBy(all[i]) === species) return all[i];
  }
  return 'mouse';
}

/** 卡背：牛皮纸 + 藤结 + 爪印（洗牌/未解锁用）。 */
export function drawCardBack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w?: number,
  h?: number,
  time?: number,
): void {
  const ww = w === undefined ? LAYOUT.CARD.w : w;
  const hh = h === undefined ? LAYOUT.CARD.h : h;
  const t = time === undefined ? 0 : time;
  ctx.save();
  paperBase(ctx, x, y, ww, hh, PALETTE.barkLight, 0.95, 81);
  const inner: P[] = rectPts(x + 8, y + 8, ww - 16, hh - 16);
  fillWatercolor(ctx, inner, PALETTE.creamMist, { alpha: 0.9, layers: 1, seedIndex: 82 });
  strokeInk(ctx, inner, { width: 2.2, close: true, seedIndex: 83, jitter: 0.9 });
  const cx = x + ww / 2;
  const cy = y + hh / 2;
  drawVine(
    ctx,
    [
      { x: cx - ww * 0.22, y: cy + hh * 0.16 },
      { x: cx, y: cy - hh * 0.06 + Math.sin(t / 900) * 2 },
      { x: cx + ww * 0.22, y: cy + hh * 0.16 },
    ],
    84,
    { width: 3, leafEvery: 14, leafLen: 12, color: PALETTE.forestMid },
  );
  // 爪印
  const pr = Math.min(ww, hh) * 0.09;
  fillWatercolor(
    ctx,
    [
      { x: cx - pr, y: cy + pr * 0.4 },
      { x: cx, y: cy + pr * 1.5 },
      { x: cx + pr, y: cy + pr * 0.4 },
      { x: cx + pr * 0.4, y: cy - pr * 0.2 },
      { x: cx - pr * 0.4, y: cy - pr * 0.2 },
    ],
    PALETTE.bark,
    { alpha: 0.85, layers: 1, seedIndex: 85 },
  );
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

function drawAnimalArt(ctx: CanvasRenderingContext2D, card: CardView, artX: number, artY: number, artW: number, artH: number, time: number, seed: number): void {
  const species = card.species || 'mouse';
  const level = card.level === undefined ? 1 : card.level;
  // 画框内的林间小景
  ctx.save();
  roundRectPath(ctx, artX, artY, artW, artH, 10, 1.2, seed + 3);
  ctx.clip();
  fillWatercolor(ctx, rectPts(artX, artY, artW, artH), PALETTE.skyWarm, { alpha: 0.85, layers: 1, seedIndex: seed + 4 });
  fillWatercolor(
    ctx,
    rectPts(artX, artY + artH * 0.55, artW, artH * 0.45),
    PALETTE.moss,
    { alpha: 0.8, layers: 1, wetEdge: true, seedIndex: seed + 5 },
  );
  // 光斑
  drawSunMote(ctx, artX + artW * 0.3, artY + artH * 0.3, artW * 0.09, 0.35);
  drawSunMote(ctx, artX + artW * 0.72, artY + artH * 0.22, artW * 0.06, 0.28);
  ctx.restore();
  // 半身动物：允许溢出画框 12px（§7.5）
  const size = artH * 0.78;
  const bodyR = SPECIES[species].bodyRadius;
  const scale = size / (bodyR * 2.4);
  drawSpeciesCreature(ctx, species, level, artX + artW * 0.5, artY + artH + LAYOUT.CARD.overflow * 0.4, scale, time, {
    seedIndex: seed + 9,
  });
  // 画框描边（压在动物之上，形成「溢出画框」的错觉）
  ctx.save();
  const fr: P[] = rectPts(artX, artY, artW, artH);
  strokeInk(ctx, fr, { width: 2.4, close: true, seedIndex: seed + 11, jitter: 0.9 });
  ctx.restore();
}

function drawStatsRow(ctx: CanvasRenderingContext2D, card: CardView, x: number, y: number, w: number, h: number, seed: number): void {
  const cells = 3;
  const cw = w / cells;
  const cx0 = x + cw * 0.5;
  const label = LAYOUT.FONT.badge;
  const value = LAYOUT.FONT.entry;
  // 剑 / 沙漏 / 心
  const iconY = y + h * 0.34;
  const numY = y + h * 0.82;
  for (let i = 0; i < cells; i++) {
    const cx = cx0 + i * cw;
    if (i === 0) {
      strokeInk(ctx, [{ x: cx - 8, y: iconY + 8 }, { x: cx + 6, y: iconY - 7 }], { width: 3.2, color: PALETTE.forestMid, seedIndex: seed + i * 4 });
      strokeInk(ctx, [{ x: cx - 10, y: iconY + 1 }, { x: cx - 3, y: iconY + 8 }], { width: 2.4, color: PALETTE.forestMid, seedIndex: seed + i * 4 + 1 });
    } else if (i === 1) {
      const g: P[] = [
        { x: cx - 8, y: iconY - 8 },
        { x: cx + 8, y: iconY - 8 },
        { x: cx, y: iconY + 10 },
      ];
      strokeInk(ctx, g, { width: 2.4, close: true, color: PALETTE.bark, seedIndex: seed + i * 4 + 2 });
    } else {
      const heart: P[] = [
        { x: cx - 9, y: iconY - 2 },
        { x: cx - 4, y: iconY - 8 },
        { x: cx, y: iconY - 2 },
        { x: cx + 4, y: iconY - 8 },
        { x: cx + 9, y: iconY - 2 },
        { x: cx, y: iconY + 10 },
      ];
      fillWatercolor(ctx, heart, PALETTE.blossom, { alpha: 0.9, layers: 1, seedIndex: seed + i * 4 + 3 });
    }
  }
  // 数字
  const atk = card.atk === undefined ? 0 : card.atk;
  const spd = card.atkInterval === undefined ? 0 : card.atkInterval;
  const hp = card.hp === undefined ? 0 : card.hp;
  textOutlined(ctx, '攻', cx0 - cw * 0.22, y + h * 0.42, label, PALETTE.inkSoft, 'center', 0);
  textOutlined(ctx, '' + Math.round(atk), cx0 + cw * 0.16, y + h * 0.46, value, PALETTE.inkSoft, 'center', 0);
  textOutlined(ctx, '速', cx0 + cw * 0.8, y + h * 0.42, label, PALETTE.inkSoft, 'center', 0);
  textOutlined(ctx, (spd >= 1 ? spd.toFixed(2) : spd.toFixed(2)) + 's', cx0 + cw * 1.16, y + h * 0.46, label, PALETTE.inkSoft, 'center', 0);
  textOutlined(ctx, '血', cx0 + cw * 1.78, y + h * 0.42, label, PALETTE.inkSoft, 'center', 0);
  textOutlined(ctx, '' + Math.round(hp), cx0 + cw * 2.16, y + h * 0.46, value, PALETTE.inkSoft, 'center', 0);
  void numY;
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  colors: string[],
  x: number,
  y: number,
  w: number,
  lineH: number,
): void {
  for (let i = 0; i < lines.length; i++) {
    const size = fitSize(ctx, lines[i], w, LAYOUT.FONT.badge, 12);
    textPlain(ctx, lines[i], x, y + i * lineH + size * 0.62, size, colors[i] || PALETTE.inkSoft, 'left');
  }
}

/**
 * 用户原图卡面：直接把 `assets/cards/card-<species>.jpg` 铺满卡位。
 * 源图 336×464 与卡位 168×232 严格同比例（0.7241），无变形、无拉伸，
 * 木框 / 费用太阳牌 / 品质花饰 / 名称木牌 / 攻速血图标 / 克制关系环 /
 * 特性说明全部来自原图，因此与用户目标图逐像素一致。
 * 本函数只叠加「原图里不可能预先烘死」的动态元素：等级角标、不可购买、选中。
 */
function drawArtCardFace(
  ctx: CanvasRenderingContext2D,
  card: CardView,
  x: number,
  y: number,
  w: number,
  h: number,
  img: any,
  o: CardDrawOpts,
  seed: number,
  time: number,
): void {
  const level = card.level === undefined ? 1 : card.level;
  const affordable = o.affordable === undefined ? true : o.affordable;
  const radius = LAYOUT.CARD.radius * (w / LAYOUT.CARD.w);

  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius, 1.0, seed + 90);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  if (!affordable) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = PALETTE.creamMist;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 等级角标（L2 藤蔓护腕 / L3 花冠）：压在原图右上品质花饰上
  if (level >= 2) {
    const bw = Math.round(w * 0.4);
    const bh = Math.round(22 * (w / LAYOUT.CARD.w));
    const bx = x + w - bw - Math.round(9 * (w / LAYOUT.CARD.w));
    const by = y + Math.round(8 * (w / LAYOUT.CARD.w));
    const pts: P[] = rectPts(bx, by, bw, bh);
    fillWatercolor(ctx, pts, level >= 3 ? PALETTE.sunbeam : PALETTE.leafLight, {
      alpha: 0.96, layers: 1, wetEdge: true, seedIndex: seed + 91,
    });
    strokeInk(ctx, pts, { width: 2.2, close: true, seedIndex: seed + 92, jitter: 0.8 });
    textOutlined(ctx, 'Lv.' + level, bx + bw / 2, by + bh * 0.72, bh * 0.66, PALETTE.inkSoft, 'center', 0);
  }

  // 不可购买：灰雾 + 费用红闪（原图费用不能改，所以用整卡红框闪烁提示）
  if (!affordable) {
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.22 * (0.5 + 0.5 * Math.sin(time / 120));
    strokeInk(ctx, rectPts(x, y, w, h), {
      width: 3.4, close: true, color: PALETTE.berry, seedIndex: seed + 93, jitter: 1.2,
    });
    ctx.restore();
  }

  if (o.selected) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    strokeInk(ctx, rectPts(x - 4, y - 4, w + 8, h + 8), {
      width: 3.4, close: true, color: PALETTE.sunbeam, seedIndex: seed + 94, jitter: 1.4,
    });
    ctx.restore();
  }
}

/**
 * 天气牌卡面：美术区取自用户集市目标图里烘死的天气卡（`assets/cards/weather-*.jpg`，
 * 190×173 与卡位美术区 156×142 同比例 1.098 → 无变形），木框 / 费用太阳牌 / 名称木牌 /
 * 两行效果文字由渲染层实时绘制，所以文案永远等于 `src/config/weather.ts`（含 我方/敌方 首行）。
 * 「阴 · 薄雾」没有独立烘死美术，用晴的美术叠一层雾色。
 */
function drawWeatherCardFace(
  ctx: CanvasRenderingContext2D,
  card: CardView,
  x: number,
  y: number,
  w: number,
  h: number,
  img: any,
  o: CardDrawOpts,
  seed: number,
  time: number,
): void {
  const u = w / LAYOUT.CARD.w;
  const affordable = o.affordable === undefined ? true : o.affordable;
  const radius = LAYOUT.CARD.radius * u;
  const artX = x + 8 * u;
  const artY = y + 8 * u;
  const artW = w - 16 * u;
  const artH = 142 * u;

  // 木框底
  paperBase(ctx, x, y, w, h, PALETTE.barkLight, 0.98, seed);
  woodGrain(ctx, x, y, w, h, seed + 1);
  strokeInk(ctx, rectPts(x, y, w, h), { width: STROKE, close: true, seedIndex: seed + 4, jitter: 1.1 });

  // 美术区
  const artPts: P[] = roundedRectPoints(artX, artY, artW, artH, Math.max(2, radius - 3 * u));
  ctx.save();
  tracePath(ctx, artPts, true);
  ctx.clip();
  ctx.drawImage(img, artX, artY, artW, artH);
  if (card.weather === 'misty') {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = PALETTE.moss;
    ctx.fillRect(artX, artY, artW, artH);
    ctx.restore();
  }
  ctx.restore();
  strokeInk(ctx, artPts, { width: 2.4 * u, close: true, seedIndex: seed + 3, jitter: 0.9 });

  // 费用太阳牌
  drawCostCoin(ctx, x + 26 * u, y + 28 * u, 21 * u, card.cost, time, o.pressed === true && !affordable);

  // 名称木牌
  const nameX = x + 14 * u;
  const nameY = y + 154 * u;
  const nameW = w - 28 * u;
  const nameH = 26 * u;
  const nameBar: P[] = rectPts(nameX, nameY, nameW, nameH);
  fillWatercolor(ctx, nameBar, PALETTE.barkLight, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: seed + 30 });
  woodGrain(ctx, nameX, nameY, nameW, nameH, seed + 31);
  strokeInk(ctx, nameBar, { width: 2.6 * u, close: true, seedIndex: seed + 32, jitter: 0.9 });
  const nameSize = fitSize(ctx, card.cn, nameW - 22 * u, LAYOUT.FONT.cardName, LAYOUT.FONT.badge);
  textPlain(ctx, card.cn, x + w / 2, nameY + nameH * 0.74, nameSize, PALETTE.inkSoft, 'center');

  // 两行效果（实时取自配置）——基线写死，保证无论缩放都不出卡
  const lines = weatherLines(card);
  const fsize = Math.max(11, Math.round(16.5 * u));
  const s1 = fitSize(ctx, lines[0], w - 30 * u, fsize, 10);
  textPlain(ctx, lines[0], x + 15 * u, y + 203 * u, s1, PALETTE.forestMid, 'left');
  const s2 = fitSize(ctx, lines[1], w - 30 * u, fsize, 10);
  textPlain(ctx, lines[1], x + 15 * u, y + 224 * u, s2, PALETTE.berry, 'left');

  // 不可购买：灰雾 + 红框闪
  if (!affordable) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = PALETTE.creamMist;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.3 + 0.22 * (0.5 + 0.5 * Math.sin(time / 120));
    strokeInk(ctx, rectPts(x, y, w, h), { width: 3.4, close: true, color: PALETTE.berry, seedIndex: seed + 93, jitter: 1.2 });
    ctx.restore();
  }
  if (o.selected) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    strokeInk(ctx, rectPts(x - 4, y - 4, w + 8, h + 8), { width: 3.4, close: true, color: PALETTE.sunbeam, seedIndex: seed + 94, jitter: 1.4 });
    ctx.restore();
  }
}

export function drawCard(
  ctx: CanvasRenderingContext2D,
  card: CardView,
  x: number,
  y: number,
  opts?: CardDrawOpts,
): void {
  const o = opts || {};
  const time = o.time === undefined ? 0 : o.time;
  const scale = o.scale === undefined ? 1 : o.scale;
  const alpha = o.alpha === undefined ? 1 : o.alpha;
  const w = LAYOUT.CARD.w;
  const h = LAYOUT.CARD.h;
  const r = LAYOUT.CARD.radius;
  const affordable = o.affordable === undefined ? true : o.affordable;
  const seed = (card.species ? card.species.length : 1) * 17 + (card.cost * 7) + (card.cn.length * 3);
  const shake = o.pressed ? Math.sin(time / 42) * 4 : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (o.drag) {
    ctx.translate(x + w / 2 + shake, y + h / 2);
    ctx.rotate(Math.sin(time / 260) * 0.035);
    ctx.scale(scale, scale);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  } else if (scale !== 1) {
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.translate(-x, -y);
  } else {
    ctx.translate(shake, 0);
  }

  // 动物牌：优先贴用户原图卡面（100% 还原），缺图时回落到下面的程序化手绘。
  const artImg = card.kind === 'animal' ? getImage('card-' + (card.species || 'mouse')) : undefined;
  if (artImg) {
    drawArtCardFace(ctx, card, x, y, w, h, artImg, o, seed, time);
    ctx.restore();
    return;
  }
  // 天气牌：美术取自用户集市目标图裁出的天气卡美术区，木框/名牌/效果行由渲染层实时绘制。
  if (card.kind === 'weather') {
    const wImg = getImage(card.weather === 'rainy' ? 'weather-rainy' : 'weather-sunny');
    if (wImg) {
      drawWeatherCardFace(ctx, card, x, y, w, h, wImg, o, seed, time);
      ctx.restore();
      return;
    }
  }

  const isWeather = card.kind === 'weather';

  // 底 + 框
  if (isWeather) {
    paperBase(ctx, x, y, w, h, PALETTE.paper, 0.98, seed);
    const tintKey = weatherTint(card.weather || 'sunny');
    // 角落染色 + 软边
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r, 1.2, seed + 2);
    ctx.clip();
    fillWatercolor(ctx, rectPts(x - 10, y - 10, w + 20, h * 0.42), tintKey, { alpha: 0.5, layers: 2, wetEdge: true, seedIndex: seed + 3 });
    if (card.weather === 'rainy') {
      for (let i = 0; i < 5; i++) {
        const rx = x + 12 + i * (w - 24) / 4;
        strokeInk(ctx, [{ x: rx, y: y + 8 }, { x: rx - 6, y: y + 40 }], { width: 1.8, color: PALETTE.stream, seedIndex: seed + 40 + i });
      }
    } else if (card.weather === 'misty') {
      drawCloud(ctx, x + w * 0.5, y + 30, w * 0.8, 30, PALETTE.creamMist, 0.55, seed + 44);
    } else if (card.weather === 'thunder') {
      strokeInk(ctx, [{ x: x + w * 0.6, y: y + 8 }, { x: x + w * 0.48, y: y + 34 }, { x: x + w * 0.62, y: y + 30 }, { x: x + w * 0.5, y: y + 56 }], { width: 2.4, color: PALETTE.sunbeam, seedIndex: seed + 45 });
    } else {
      drawSunMote(ctx, x + w * 0.7, y + 34, 13, 0.5);
    }
    ctx.restore();
    const fr: P[] = rectPts(x, y, w, h);
    strokeInk(ctx, fr, { width: 3, close: true, seedIndex: seed + 4, jitter: 1.0 });
  } else {
    paperBase(ctx, x, y, w, h, PALETTE.barkLight, 0.98, seed);
    woodGrain(ctx, x, y, w, h, seed + 1);
    // 内层牛皮纸
    const inner: P[] = rectPts(x + 9, y + 9, w - 18, h - 18);
    fillWatercolor(ctx, inner, PALETTE.paper, { alpha: 0.97, layers: 1, seedIndex: seed + 2 });
    ctx.save();
    roundRectPath(ctx, x + 9, y + 9, w - 18, h - 18, r - 6, 1.0, seed + 5);
    ctx.clip();
    strokeInk(ctx, inner, { width: 2.2, close: true, seedIndex: seed + 6, jitter: 0.9 });
    ctx.restore();
    const fr: P[] = rectPts(x, y, w, h);
    strokeInk(ctx, fr, { width: STROKE, close: true, seedIndex: seed + 7, jitter: 1.1 });
    // 四角叶片藤蔓
    drawLeaf(ctx, x + 16, y + 16, 16, -0.7, PALETTE.leafMid, seed + 8);
    drawLeaf(ctx, x + w - 16, y + 16, 16, 0.7, PALETTE.leafMid, seed + 9);
    drawLeaf(ctx, x + 16, y + h - 16, 16, 0.9, PALETTE.leafMid, seed + 10);
    drawLeaf(ctx, x + w - 16, y + h - 16, 16, -0.9, PALETTE.leafMid, seed + 11);
  }

  const artX = x + 12;
  const artY = y + 12;
  const artW = w - 24;
  const artH = Math.round(h * LAYOUT.CARD.artRatio) - 6;

  if (card.kind === 'animal') {
    drawAnimalArt(ctx, card, artX, artY, artW, artH, time, seed);
  } else if (card.kind === 'buff') {
    // 加成牌：中央大图标
    const tag = card.tag || 'atk';
    drawBuffIcon(ctx, artX + artW * 0.5, artY + artH * 0.48, artH * 0.30, card.buff || 'sharpClaw', tag, seed + 20);
    // 左上「指定」手绘标签
    const lx = x + 10;
    const ly = y + 74;
    const pointed: P[] = [
      { x: lx, y: ly },
      { x: lx + 62, y: ly - 4 },
      { x: lx + 62, y: ly + 20 },
      { x: lx, y: ly + 24 },
    ];
    fillWatercolor(ctx, pointed, PALETTE.sunbeam, { alpha: 0.95, layers: 1, seedIndex: seed + 21 });
    strokeInk(ctx, pointed, { width: 2, close: true, seedIndex: seed + 22, jitter: 0.8 });
    strokeInk(ctx, [{ x: lx + 66, y: ly + 10 }, { x: lx + 82, y: ly + 10 }], { width: 2.2, color: PALETTE.inkSoft, seedIndex: seed + 23 });
    textOutlined(ctx, '指定', lx + 31, ly + 17, LAYOUT.FONT.badge, PALETTE.inkSoft, 'center', 0);
  } else {
    drawSunMote(ctx, artX + artW * 0.5, artY + artH * 0.5, artH * 0.3, 0.4);
  }

  // 名称木条（加成牌的美术区只是一个中央图标，名条位置上移，给两行效果留足空间）
  const isBuff = card.kind === 'buff';
  const nameY = isBuff ? y + 140 : y + 9 + Math.round(h * LAYOUT.CARD.artRatio);
  const nameW = isBuff ? w - 34 : w - 28;
  const nameH = isBuff ? 28 : 32;
  const nameBar: P[] = rectPts(x + (w - nameW) / 2, nameY, nameW, nameH);
  fillWatercolor(ctx, nameBar, PALETTE.barkLight, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: seed + 30 });
  woodGrain(ctx, x + (w - nameW) / 2, nameY, nameW, nameH, seed + 31);
  strokeInk(ctx, nameBar, { width: 2.6, close: true, seedIndex: seed + 32, jitter: 0.9 });
  drawLeaf(ctx, x + 20, nameY + nameH / 2, 12, -0.6, PALETTE.leafMid, seed + 33);
  drawLeaf(ctx, x + w - 20, nameY + nameH / 2, 12, Math.PI + 0.6, PALETTE.leafMid, seed + 34);
  const nameSize = fitSize(ctx, card.cn, nameW - 30, LAYOUT.FONT.cardName, LAYOUT.FONT.badge);
  // 浅木名牌必须用深字（奶油填充 + 奶油描边会在浅底上糊成一团）
  textOutlined(ctx, card.cn, x + w / 2, nameY + nameH * 0.72, nameSize, PALETTE.inkSoft, 'center', 2, PALETTE.creamMist);

  // 费用圆牌 + 品质纹
  drawCostCoin(ctx, x + 26, y + 28, 21, card.cost, time, o.pressed && !affordable);
  if (card.kind === 'animal') {
    drawQualityMark(ctx, x + w - 26, y + 26, 15, card.quality === undefined ? card.level || 1 : card.quality, seed + 36);
  }

  // 说明区
  const infoY = nameY + nameH + 6;
  if (card.kind === 'animal') {
    drawStatsRow(ctx, card, x + 16, infoY, w - 32, 42, seed + 50);
    const counterY = infoY + 44;
    drawCounterRing(ctx, x + 20, counterY, w - 40, 26, card.species || 'mouse');
    const trait = card.traitName && card.traitDesc ? card.traitName + '：' + card.traitDesc : card.traitName || '';
    if (trait) {
      const ts = fitSize(ctx, trait, w - 40, LAYOUT.FONT.badge, 12);
      textPlain(ctx, trait, x + w / 2, y + h - 10, ts, PALETTE.inkSoft, 'center');
    }
  } else if (card.kind === 'weather') {
    const lines = weatherLines(card);
    const colors = [PALETTE.forestMid, PALETTE.forestMid, PALETTE.berry, PALETTE.berry];
    drawTextBlock(ctx, lines, colors, x + 20, infoY + 2, w - 40, 24);
  } else {
    const d = card.desc || ['——', '——'];
    // 两行效果写死基线 + 最小字号 10，保证再长的文案也不出卡
    const bw = w - 26;
    const f1 = fitSize(ctx, d[0] || '', bw, LAYOUT.FONT.badge, 10);
    textPlain(ctx, d[0] || '', x + 13, infoY + f1 * 0.66, f1, PALETTE.inkSoft, 'left');
    const f2 = fitSize(ctx, d[1] || '', bw, LAYOUT.FONT.badge, 10);
    textPlain(ctx, d[1] || '', x + 13, infoY + 19 + f2 * 0.66, f2, PALETTE.inkSoft, 'left');
    // 槽位提示：可装备到动物（手绘箭头，落在图标与名牌之间的空档里）
    strokeInk(
      ctx,
      [
        { x: x + w * 0.5 - 18, y: y + 132 },
        { x: x + w * 0.5, y: y + 122 },
        { x: x + w * 0.5 + 18, y: y + 132 },
      ],
      { width: 2.4, color: tagColor(card.tag), seedIndex: seed + 60 },
    );
  }

  // 可购买：右下阳光点旋转；不可购买：灰雾 + 费用闪红
  if (card.kind === 'animal' || card.kind === 'weather' || card.kind === 'buff') {
    if (affordable) {
      const t = cycle(time, 2600, 0);
      for (let i = 0; i < 3; i++) {
        const a = t * TAU + (i / 3) * TAU;
        drawSunMote(ctx, x + w - 22 + Math.cos(a) * 3, y + h - 22 + Math.sin(a) * 3, 2.6, 0.55);
      }
    } else {
      ctx.save();
      ctx.globalAlpha = 0.4;
      fillWatercolor(ctx, rectPts(x, y, w, h), PALETTE.creamMist, { alpha: 0.85, layers: 1, seedIndex: seed + 70 });
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(time / 120));
      const fr2: P[] = rectPts(x, y, w, h);
      strokeInk(ctx, fr2, { width: 3.4, close: true, color: PALETTE.berry, seedIndex: seed + 71, jitter: 1.2 });
      ctx.restore();
    }
  }

  if (o.selected) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const fr3: P[] = rectPts(x - 4, y - 4, w + 8, h + 8);
    strokeInk(ctx, fr3, { width: 3, close: true, color: PALETTE.sunbeam, seedIndex: seed + 80, jitter: 1.4 });
    ctx.restore();
  }

  ctx.restore();
}

/** 天气牌两行文案：直接读 `src/config/weather.ts`（渲染层不再自带一份会过期的副本）。 */
function weatherLines(card: CardView): string[] {
  const id = card.weather || 'sunny';
  const def = weatherDef(id);
  if (def) return [def.selfLines[0], def.enemyLines[0]];
  const combo = WEATHER_COMBOS[id];
  if (combo) return [combo.lines[0], combo.lines[1] || combo.lines[0]];
  return ['我方：—', '敌方：—'];
}