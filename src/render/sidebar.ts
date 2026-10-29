/**
 * 左右侧栏 HUD + 替补席 + 卷轴/战绩面板（§2.6）。
 *
 * 硬规则：
 * - 侧栏条目**绝不出现矩形血条**，血量只用头像外的手绘环 + 数字（§2.8 / §16）。
 * - 回合间（布阵/集市）敌方侧栏只能显示「上回合情报」，用冷紫灰 + 标签区分。
 * - 全部颜色/描边/圆角来自 ui/theme 与手绘生成器。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE, rgba, tint } from '../config/palette';
import { SPECIES, SpeciesId } from '../config/species';
import { WeatherId } from '../config/weather';
import { blobPath, fillWatercolor, noiseAt, roundRectPath, strokeInk, P } from '../ui/brush';
import { clamp01, cycle, easeOutCubic } from '../ui/ease';
import { FONT, RADIUS, STROKE, fitSize, setFont, textOutlined, textPlain } from '../ui/theme';
import { drawLeaf, drawMossLight, paperBase, woodGrain } from './paint';
import { drawSidebarRing, drawStatusIcon, ringColorFor } from './hpring';
import { drawSpeciesCreature } from './unit';
import { drawCard, CardView } from './card';
import { getImage } from './assets';
import { weatherShort } from './forest';

const TAU = Math.PI * 2;

export interface SideEntryView {
  species: SpeciesId;
  level: number;
  hp: number;
  maxHp: number;
  statuses: string[];
  empty: boolean;
  ghost?: boolean;
  hitFlash?: number;
}

export interface RoundLogView {
  round: number;
  winner: 'player' | 'enemy' | 'draw' | string;
  houseDamage: number;
  weather: WeatherId;
  buffCount: number;
  units: { species: SpeciesId; level: number; damage: number }[];
}

function rectPts(x: number, y: number, w: number, h: number): P[] {
  return [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ];
}

/* ------------------------------------------------------------------ */
/* 侧栏条目                                                            */
/* ------------------------------------------------------------------ */

export function drawSideEntry(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  entry: SideEntryView,
  opts: { faction: 'player' | 'enemy'; time: number; index: number },
): void {
  const faction = opts.faction;
  const time = opts.time;
  const ghost = !!entry.ghost;
  const seed = 101 + opts.index * 13 + (faction === 'enemy' ? 7 : 0);
  const accent = faction === 'player' ? PALETTE.leafMid : PALETTE.twilight;
  const deep = faction === 'player' ? PALETTE.forestMid : PALETTE.forestDeep;

  ctx.save();
  if (entry.empty) {
    ctx.globalAlpha = 0.2;
    const pts: P[] = rectPts(x, y, w, h);
    fillWatercolor(ctx, pts, PALETTE.creamMist, { alpha: 0.34, layers: 1, seedIndex: seed });
    strokeInk(ctx, pts, { width: 2, close: true, color: rgba(PALETTE.bark, 0.45), seedIndex: seed + 1, jitter: 1.6 });
    ctx.restore();
    return;
  }

  // 纸白条目 + 手绘描边
  const pts2: P[] = rectPts(x, y, w, h);
  paperBase(ctx, x, y, w, h, ghost ? tint(PALETTE.creamMist, 0.22, PALETTE.twilight) : PALETTE.creamMist, 0.97, seed + 2);
  fillWatercolor(ctx, pts2, ghost ? tint(PALETTE.paper, 0.3, PALETTE.twilight) : PALETTE.paper, {
    alpha: 0.9, layers: 1, seedIndex: seed + 3,
  });
  strokeInk(ctx, pts2, { width: STROKE - 0.4, close: true, color: PALETTE.inkSoft, seedIndex: seed + 4, jitter: 1.1 });
  // 阵营色侧边叶
  drawLeaf(ctx, x + 10, y + h / 2, 14, Math.PI / 2, accent, seed + 5);

  // 头像 + 环
  const avR = LAYOUT.RING.sidebarRadius;
  const ax = x + 14 + avR;
  const ay = y + h / 2;
  ctx.save();
  const face: P[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const k = 1 + noiseAt(i, seed + 6) * 0.05;
    face.push({ x: ax + Math.cos(a) * avR * k, y: ay + Math.sin(a) * avR * k });
  }
  fillWatercolor(ctx, face, tint(SPECIES[entry.species].theme, 0.55, PALETTE.creamMist), { alpha: 0.9, layers: 1, seedIndex: seed + 7 });
  ctx.restore();
  ctx.save();
  roundRectPath(ctx, ax - avR, ay - avR, avR * 2, avR * 2, avR, 0.8, seed + 8);
  ctx.clip();
  const scale = (avR * 1.9) / (SPECIES[entry.species].bodyRadius * 2.5);
  drawSpeciesCreature(ctx, entry.species, entry.level, ax, ay + avR * 1.15, scale, time, {
    seedIndex: seed + 9, facing: faction === 'player' ? 1 : -1,
  });
  ctx.restore();
  const ratio = entry.maxHp > 0 ? clamp01(entry.hp / entry.maxHp) : 0;
  drawSidebarRing(ctx, ax, ay, avR, ratio, time, seed + 10, ghost);

  // HP 数字（绝不用矩形血条）
  const hpSize = FONT.body;
  setFont(ctx, FONT.badge, 'bold');
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(deep, 0.85);
  ctx.fillText('HP', x + 70, y + 22);
  const hpText = '' + Math.max(0, Math.round(entry.hp));
  textOutlined(ctx, hpText, x + 70, y + 48, hpSize, ghost ? PALETTE.twilight : PALETTE.inkSoft, 'left', 0);
  const dn = deltaMark(entry);
  if (dn > 0) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    setFont(ctx, FONT.badge, 'bold');
    ctx.fillStyle = PALETTE.berry;
    ctx.textAlign = 'left';
    ctx.fillText('▼' + dn, x + 72 + ctx.measureText(hpText).width + 6, y + 48);
    ctx.restore();
  }

  // 等级角标（Lv2 起才有装饰，Lv1 不显示）
  if (entry.level >= 2) {
    const bw = 46;
    const bh = 20;
    const bx = x + w - bw - 8;
    const by = y + h - bh - 8;
    const bp: P[] = rectPts(bx, by, bw, bh);
    fillWatercolor(ctx, bp, entry.level >= 3 ? PALETTE.berry : PALETTE.barkLight, { alpha: 0.95, layers: 1, seedIndex: seed + 11 });
    strokeInk(ctx, bp, { width: 1.8, close: true, seedIndex: seed + 12, jitter: 0.8 });
    textOutlined(ctx, 'Lv.' + entry.level, bx + bw / 2, by + bh * 0.62, FONT.badge, PALETTE.creamMist, 'center', 1.4);
  }

  // 状态图标（最多 3 个）
  for (let i = 0; i < entry.statuses.length && i < 3; i++) {
    drawStatusIcon(ctx, x + w - 22 - i * 22, y + 18, 9, entry.statuses[i], seed + 20 + i);
  }

  // 上回合情报标签
  if (ghost) {
    const tw = 96;
    const tx = x + w / 2 - tw / 2;
    const ty = y - 9;
    const tp: P[] = rectPts(tx, ty, tw, 18);
    fillWatercolor(ctx, tp, tint(PALETTE.twilight, 0.35, PALETTE.creamMist), { alpha: 0.95, layers: 1, seedIndex: seed + 30 });
    strokeInk(ctx, tp, { width: 1.6, close: true, color: PALETTE.twilight, seedIndex: seed + 31, jitter: 0.7 });
    textOutlined(ctx, '上回合情报', tx + tw / 2, ty + 11, FONT.badge - 2, PALETTE.forestDeep, 'center', 1.2);
  }

  // 受击白闪
  const flash = entry.hitFlash === undefined ? 0 : clamp01(entry.hitFlash);
  if (flash > 0.02) {
    ctx.save();
    ctx.globalAlpha = 0.5 * flash;
    fillWatercolor(ctx, pts2, PALETTE.creamMist, { alpha: 0.9, layers: 1, seedIndex: seed + 40 });
    ctx.restore();
  }
  ctx.restore();
}

function deltaMark(entry: SideEntryView): number {
  void entry;
  return 0;
}

/**
 * 侧栏底衬：把底板烘死的旧卡槽盖成 6 格，并且**沿用底板自身的样式**。
 *
 * 为什么不是铺木栏：战斗底板（art-src/ui-board-empty-16x9-01）的侧栏烘的是
 * 「深色底 + 米白纸槽 + 淡绿空环」，程序化铺一块 bark 木栏压上去，
 * 屏幕上就同时出现「木栏」和「从木栏下透出来的白纸槽」两套 UI——用户报的「覆盖」。
 *
 * 按提示词 0-①「冲突时保留被压着的那一版」改为**按底板原样重画**：
 * 底板色 + 6 个米白纸槽。纸槽矩形由调用方传 `plateSlot` 的结果进来，
 * 所以**绘制与命中判定天然同源**，点了必有反应。
 */
export function drawSideStripBacking(
  ctx: CanvasRenderingContext2D,
  covers: { x: number; y: number; w: number; h: number }[],
  faction: 'player' | 'enemy',
): void {
  // 底色取底板实测色，**不铺纸槽、不铺木栏**：
  // - 左栏底板隔条实测 rgb(76,79,54)（暗橄榄），栏边 rgb(81,105,78)（苔绿）
  // - 右栏底板隔条实测 rgb(177,139,176)（暮紫粉）
  // 取同族色比硬编码更稳，仍走 PALETTE。左栏用 bark+forestDeep 混到 ≈(78,77,58)，
  // 叠上颗粒后正好落在底板隔条的暗橄榄上——面板与底板同色才不会看成"多盖了一层"。
  const back = faction === 'player'
    ? tint(PALETTE.bark, 0.48, PALETTE.forestDeep)
    : tint(PALETTE.twilight, 0.5, PALETTE.blossom);
  for (let k = 0; k < covers.length; k++) {
    const cover = covers[k];
    ctx.save();
    roundRectPath(ctx, cover.x, cover.y, cover.w, cover.h, 14, 1.6, 601);
    ctx.fillStyle = back;
    ctx.fill();
    ctx.restore();
  }
  // 颗粒只铺一遍：先把所有覆盖段并成一个裁剪区再一次性上水彩。
  // 之前是**每段各叠一层并带湿边**，于是段与段之间出现各自的深色描边，
  // 看起来像"好几块拼贴的矩形"（用户与视觉复核都点到过右下角那块）。
  // 同色实填本身没有缝，去掉逐段湿边后整栏就是一个连续的底衬。
  if (covers.length > 0) {
    let x0 = covers[0].x, y0 = covers[0].y;
    let x1 = covers[0].x + covers[0].w, y1 = covers[0].y + covers[0].h;
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k < covers.length; k++) {
      const cover = covers[k];
      ctx.rect(cover.x, cover.y, cover.w, cover.h);
      x0 = Math.min(x0, cover.x); y0 = Math.min(y0, cover.y);
      x1 = Math.max(x1, cover.x + cover.w); y1 = Math.max(y1, cover.y + cover.h);
    }
    ctx.clip();
    fillWatercolor(ctx, rectPts(x0, y0, x1 - x0, y1 - y0), tint(back, 0.22, PALETTE.forestMid), {
      alpha: 0.4, layers: 2, wetEdge: false, seedIndex: 602,
    });
    ctx.restore();
  }
}

/**
 * 侧栏条目（底板烘焙版）。
 *
 * 用户 2026-10-06 的新战斗底板上已经烘死了卡槽纸面、血环与木质挂条，
 * 所以这里**不再画纸面板/叶/底环**，只把动态内容贴进烘焙件：
 * 动物头像填进烘焙环、血环叠在环上、HP 数字写在环右侧纸面、等级角标与状态图标照旧。
 * 缺图时仍然回落到程序化手绘（风格统一的保险）。
 */
export function drawSideEntryBaked(
  ctx: CanvasRenderingContext2D,
  slot: { x: number; y: number; w: number; h: number; cx: number; cy: number; r: number },
  entry: SideEntryView,
  opts: { faction: 'player' | 'enemy'; time: number; index: number; compact?: boolean },
): void {
  const faction = opts.faction;
  const time = opts.time;
  /**
   * `compact`：集市两侧边缘的窄列（格宽 62）专用。
   * 那里放不下圆框右侧的「HP / 数值」两行文字（需要 ~44px）与右下角 46×20 的 Lv 角标，
   * 硬画就会压到头像上，所以紧凑模式只保留**圆形头像框 + 绿色血量弧 + 状态点**——
   * 与用户 2026-10-15 的口径一致（围绕圆框的绿色弧线本身就是血量）。
   */
  const compact = opts.compact === true;

  // 空槽也要画出来：用户要求"一眼能看出每侧有 6 个位置"，
  // 但 2026-10-14 起口径改成**只用圆形头像框**——空槽就是一个空圆框，
  // 不再铺长方形纸面（那块又宽又大的纸面正是底板上被嫌弃的那一版 UI）。
  if (entry.empty) {
    const pcx = slot.cx;
    const pcy = slot.cy;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(pcx, pcy, Math.max(6, slot.r - 2), 0, TAU);
    ctx.fillStyle = PALETTE.creamMist;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.4;
    drawSidebarRing(ctx, pcx, pcy, Math.max(6, slot.r - 1.5), 0, time, 143 + opts.index * 17, true);
    ctx.restore();
    return;
  }

  const ghost = !!entry.ghost;
  const seed = 141 + opts.index * 17 + (faction === 'enemy' ? 9 : 0);
  const deep = faction === 'player' ? PALETTE.forestMid : PALETTE.forestDeep;
  const cx = slot.cx;
  const cy = slot.cy;
  const r = slot.r;
  const small = r < 34;

  ctx.save();
  // 头像：裁进烘焙环里（底部对齐环的下沿，读起来像坐在环里）
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(6, r - 2), 0, TAU);
  ctx.clip();
  const img = getImage('unit-' + entry.species);
  if (img) {
    const h2 = r * 2.2;
    const w2 = img.width * (h2 / Math.max(1, img.height));
    ctx.drawImage(img, cx - w2 / 2, cy + r * 0.95 - h2, w2, h2);
  } else {
    const scale = (r * 1.9) / (SPECIES[entry.species].bodyRadius * 2.5);
    drawSpeciesCreature(ctx, entry.species, entry.level, cx, cy + r * 0.5, scale, time, {
      seedIndex: seed + 9, facing: faction === 'player' ? 1 : -1,
    });
  }
  ctx.restore();

  const ratio = entry.maxHp > 0 ? clamp01(entry.hp / entry.maxHp) : 0;
  drawSidebarRing(ctx, cx, cy, Math.max(6, r - 1.5), ratio, time, seed + 10, ghost);

  // HP 数字（环右侧，绝不画矩形血条）
  // 2026-10-14 起侧栏只有「圆形头像框」，格子高度压到 50px，所以紧凑版把
  // 「HP」与数值拆成右侧两行（上标签 / 下数值），纵向正好落在圆框的上下半区。
  // `compact`（集市两侧窄列）连这两行也放不下，整块跳过——血量由绿色弧线表达。
  if (!compact) {
    const hpX = cx + r + (small ? 6 : 12);
    const labelY = small ? slot.y + 18 : cy - 6;
    const numY = small ? slot.y + 39 : cy + 20;
    setFont(ctx, small ? FONT.badge - 6 : FONT.badge, 'bold');
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(deep, 0.85);
    ctx.fillText('HP', hpX, labelY);
    const hpText = '' + Math.max(0, Math.round(entry.hp));
    textOutlined(
      ctx, hpText, hpX, numY,
      small ? FONT.badge - 3 : FONT.body,
      ghost ? PALETTE.twilight : PALETTE.inkSoft, 'left', 0,
    );
    const dn = deltaMark(entry);
    if (dn > 0) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      setFont(ctx, FONT.badge, 'bold');
      ctx.fillStyle = PALETTE.berry;
      ctx.textAlign = 'left';
      ctx.fillText('▼' + dn, hpX + 2 + ctx.measureText(hpText).width + 6, numY);
      ctx.restore();
    }
  }

  // 等级角标：卡槽右下角（紧凑版仍用同一条公式，x 落在 HP 数字右侧的空档里）
  // `compact` 时角标会整个压在 62px 的头像圆框上，所以只在非紧凑模式画。
  if (!compact && entry.level >= 2) {
    const bw = 46;
    const bh = 20;
    const bx = slot.x + slot.w - bw - 8;
    const by = slot.y + slot.h - bh - 8;
    const bp: P[] = rectPts(bx, by, bw, bh);
    fillWatercolor(ctx, bp, entry.level >= 3 ? PALETTE.berry : PALETTE.barkLight, { alpha: 0.95, layers: 1, seedIndex: seed + 11 });
    strokeInk(ctx, bp, { width: 1.8, close: true, seedIndex: seed + 12, jitter: 0.8 });
    textOutlined(ctx, 'Lv.' + entry.level, bx + bw / 2, by + bh * 0.62, FONT.badge, PALETTE.creamMist, 'center', 1.4);
  }

  // 状态图标（最多 3 个）：挂在圆框下沿，做成"头像上的状态点"，
  // 这样不会和右侧的 HP 两行、Lv 角标抢同一块横向空间。
  const pipY = small ? cy + r - 8 : slot.y + 18;
  for (let i = 0; i < entry.statuses.length && i < 3; i++) {
    const px = small ? cx - 20 + i * 20 : slot.x + slot.w - 22 - i * 22;
    drawStatusIcon(ctx, px, pipY, 9, entry.statuses[i], seed + 20 + i);
  }

  // 上回合情报标签（敌方信息被雾遮住时用）
  if (ghost) {
    // `compact`：格子只有 62px 宽，96px 的标签会横跨到相邻格/卡牌上，
    // 缩成 52px 的小胶囊，仍居中挂在圆框上方。
    const tw = compact ? 52 : 96;
    const tx = slot.x + slot.w / 2 - tw / 2;
    const ty = slot.y - (compact ? 4 : 9);
    const tp: P[] = rectPts(tx, ty, tw, compact ? 15 : 18);
    fillWatercolor(ctx, tp, tint(PALETTE.twilight, 0.35, PALETTE.creamMist), { alpha: 0.95, layers: 1, seedIndex: seed + 30 });
    strokeInk(ctx, tp, { width: 1.6, close: true, color: PALETTE.twilight, seedIndex: seed + 31, jitter: 0.7 });
    textOutlined(ctx, compact ? '情报' : '上回合情报', tx + tw / 2, ty + (compact ? 11 : 11), compact ? FONT.badge - 6 : FONT.badge - 2, PALETTE.forestDeep, 'center', 1.2);
  }

  // 受击白闪：环上一圈亮罩
  const flash = entry.hitFlash === undefined ? 0 : clamp01(entry.hitFlash);
  if (flash > 0.02) {
    ctx.save();
    ctx.globalAlpha = 0.5 * flash;
    const fp: P[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      fp.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    fillWatercolor(ctx, fp, PALETTE.creamMist, { alpha: 0.9, layers: 1, seedIndex: seed + 40 });
    ctx.restore();
  }
  ctx.restore();
}

/** 一整条侧栏（纸白长条 + 6 条目）。 */
export function drawSidebar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  entries: SideEntryView[],
  opts: { faction: 'player' | 'enemy'; time: number },
): void {
  ctx.save();
  const pts: P[] = rectPts(x, y, w, h);
  paperBase(ctx, x, y, w, h, PALETTE.creamMist, 0.94, 301);
  fillWatercolor(ctx, pts, PALETTE.paper, { alpha: 0.75, layers: 1, seedIndex: 302 });
  strokeInk(ctx, pts, { width: STROKE, close: true, seedIndex: 303, jitter: 1.2 });
  ctx.restore();
  const rowH = LAYOUT.ENTRY.h;
  const gap = LAYOUT.MY_ENTRY.gap;
  for (let i = 0; i < entries.length && i < 6; i++) {
    drawSideEntry(ctx, x + 10, y + 10 + i * (rowH + gap), LAYOUT.ENTRY.w, rowH, entries[i], {
      faction: opts.faction, time: opts.time, index: i,
    });
  }
}

/* ------------------------------------------------------------------ */
/* 替补席                                                              */
/* ------------------------------------------------------------------ */

/**
 * 草地上的小草堆：替补席/落点的底座。
 * 目标图里动物不是摆在木槽里，而是直接坐在草地的小草堆上，所以这里用
 * 半椭圆苔藓 + 顶部亮苔 + 两丛草叶拼出同一套语汇（与棋盘上的苔藓斑同源）。
 */
function drawGrassMound(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  w: number,
  h: number,
  seed: number,
  alpha: number,
): void {
  const half = w / 2;
  const N = 12;
  const pts: P[] = [];
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (i / N);
    pts.push({ x: cx - Math.cos(a) * half, y: baseY - Math.sin(a) * h });
  }
  pts.push({ x: cx + half, y: baseY + h * 0.22 });
  pts.push({ x: cx - half, y: baseY + h * 0.22 });
  fillWatercolor(ctx, pts, PALETTE.leafMid, { alpha: 0.9 * alpha, layers: 1, wetEdge: true, seedIndex: seed });
  const top: P[] = [];
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (0.16 + 0.68 * (i / N));
    top.push({ x: cx - Math.cos(a) * half * 0.8, y: baseY - Math.sin(a) * h * 0.82 });
  }
  top.push({ x: cx + half * 0.42, y: baseY - h * 0.1 });
  top.push({ x: cx - half * 0.42, y: baseY - h * 0.1 });
  fillWatercolor(ctx, top, PALETTE.leafLight, { alpha: 0.36 * alpha, layers: 1, wetEdge: false, seedIndex: seed + 1 });
  strokeInk(ctx, pts, {
    width: 1.8, close: true, color: rgba(PALETTE.forestDeep, 0.5 * alpha), seedIndex: seed + 2, jitter: 0.7,
  });
  for (let i = 0; i < 3; i++) {
    const gx = cx + (i - 1) * half * 0.6;
    strokeInk(ctx, [
      { x: gx, y: baseY - h * 0.18 },
      { x: gx + 1.5, y: baseY - h - 5 - i * 2 },
    ], {
      width: 1.6, color: tint(PALETTE.leafMid, 0.25, PALETTE.forestDeep), seedIndex: seed + 5 + i, jitter: 0.6,
    });
  }
}

export function drawBench(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  slots: (CardView | null)[],
  opts: { time: number; narrow?: boolean; dragHoverIndex?: number },
): void {
  const time = opts.time;
  const narrow = !!opts.narrow;
  const b = LAYOUT.BENCH;
  const art = LAYOUT.BENCH_ART;
  const seed = 401;
  // 目标图版式：没有木架也没有凹槽，8 只动物直接坐在底板的草地上。
  // 新底板（art-src/ui-board-empty-16x9-01）已经把 8 个苔藓垫烘死在
  // x = 350.4 + i*83.63、y 660..707，所以这里**只在拖拽悬停时**叠一层亮苔提示，
  // 命中区仍是 benchRect(index)，点选/拖拽逻辑不变。
  //
  // 尺寸：动物大小只由 BENCH_ART.size 决定，**不区分阶段**——
  // 布阵点「准备就绪」进战斗后，替补席收窄的只是容器（benchRect 的 h），
  // 动物与草垫保持同一常量，两阶段渲染尺寸逐像素一致。
  // 尺寸与落脚线都与阶段无关：动物只由 BENCH_ART.size 决定大小，
  // 脚底一律落在底板烘焙的苔藓垫高度 BENCH_ART.seatY 上。
  // 布阵点「准备就绪」进战斗后，变化的只是命中区（benchRect 的基线），
  // 画出来的动物逐像素相同——不缩放、不位移。
  const baseY = art.seatY;
  for (let i = 0; i < slots.length && i < b.slots; i++) {
    const sx = x + 8 + i * (b.cell + b.gap) - 4;
    const cx = sx + (b.cell - 16) / 2 + 4;
    const hover = opts.dragHoverIndex === i;
    const card = slots[i];
    if (hover) drawGrassMound(ctx, cx, baseY, art.hover.w, art.hover.h, seed + i * 9, 0.55);
    if (!card) continue;
    const species = card.species || 'mouse';
    const img = getImage('unit-' + species);
    const uh = art.size;
    const uw = art.size;
    const uy = baseY - art.lift - uh;
    ctx.save();
    if (hover) ctx.globalAlpha = 0.85;
    if (img) {
      // 贴图 256×256 四周有透明留白，且各物种留白不同（wolf 左右各 55px、
      // elephant 只有 7px）。直接 drawImage(img, x, y, 88, 88) 等于把**画布**
      // 映射到 88×88，可见内容实际只有 50~83px 宽，既比底座草垫(78)小，
      // 又让不同物种体型差 1.65 倍。
      //
      // 这里改用 9 参数 drawImage，只取不透明包围盒那一块，
      // 让**可见内容**严格填满 uw×uh；右/下边留 1px 余量避免浮点截断吃到边缘。
      const boxTable = LAYOUT.SPECIES_ART_BOX;
      const box = boxTable[species] || boxTable.mouse;
      const bx = box[0];
      const by = box[1];
      const bw = box[2];
      const bh = box[3];
      // 等比缩放到目标框内。
      //
      // 这里有个反直觉点：不能按「较大边贴合」取 min(uw/bw, uh/bh)。
      // 八个物种的不透明包围盒高度几乎一样（bh = 232~241），但目标框只有 88，
      // 于是 k 永远被高度卡死在 88/241 ≈ 0.365；宽度再宽的物种也只能画到
      // 72~88px，反而比底座草垫(78)还窄，看起来「动物悬在垫子上、比垫子小」。
      //
      // 改成按**宽度**贴合：可见内容宽度严格等于 BENCH_ART.size，高度按物种
      // 自身比例自然伸缩（cat 约 88*241/197 ≈ 108）。然后底边对齐脚底线，
      // 于是「站在草垫上」的落脚关系不变，而每个物种都占满自己的格位。
      const k = uw / bw;
      const dw = bw * k;
      const dh = bh * k;
      // 水平居中；底边贴脚底线（dy 由底边反推，而非从 uy 往下排）
      const dx = cx - dw / 2;
      const dy = baseY - art.lift - dh;
      ctx.drawImage(img, bx, by, bw, bh, dx, dy, dw, dh);
    } else {
      const scale = (uh * 0.6) / (SPECIES[species].bodyRadius * 3.1);
      drawSpeciesCreature(ctx, species, card.level || 1, cx, baseY, scale, time, { seedIndex: seed + 40 + i });
    }
    ctx.restore();
    if ((card.level || 1) >= 2) {
      textOutlined(ctx, 'Lv.' + card.level, cx + uw / 2 - 10, uy + 12, FONT.badge - 5, PALETTE.sunbeam, 'center', 1.2);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 角落小件                                                            */
/* ------------------------------------------------------------------ */

/** 战绩卷轴按钮（46×46）。 */
export function drawScrollButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  pressed: boolean,
  time: number,
): void {
  ctx.save();
  ctx.translate(0, pressed ? 2 : 0);
  // 两端的卷轴木轴
  for (let i = 0; i < 2; i++) {
    const ry = y + (i === 0 ? size * 0.18 : size * 0.82);
    const rod: P[] = rectPts(x + 4, ry - 5, size - 8, 10);
    fillWatercolor(ctx, rod, PALETTE.bark, { alpha: 0.98, layers: 1, seedIndex: 501 + i });
    strokeInk(ctx, rod, { width: 2, close: true, seedIndex: 503 + i, jitter: 0.7 });
  }
  // 纸面
  const paper: P[] = rectPts(x + 8, y + size * 0.18, size - 16, size * 0.64);
  fillWatercolor(ctx, paper, PALETTE.creamMist, { alpha: 0.97, layers: 1, seedIndex: 505 });
  strokeInk(ctx, paper, { width: 2, close: true, seedIndex: 506, jitter: 0.9 });
  // 字痕（三道横线）
  for (let i = 0; i < 3; i++) {
    const ly = y + size * (0.32 + i * 0.16);
    strokeInk(ctx, [{ x: x + 14, y: ly }, { x: x + size - 14, y: ly }], { width: 1.6, color: rgba(PALETTE.inkSoft, 0.75), seedIndex: 510 + i, jitter: 1.2 });
  }
  if (cycle(time, 3000, 0) < 0.06) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    strokeInk(ctx, rectPts(x + 4, y + 4, size - 8, size - 8), { width: 2.4, close: true, color: PALETTE.sunbeam, seedIndex: 515, jitter: 1.4 });
    ctx.restore();
  }
  ctx.restore();
}

/** 左下饲养员小头像（56×56）+ 状态表情。 */
export function drawCoachAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  state: 'idle' | 'proud' | 'hurt' | 'win' | 'lose' | string,
  time: number,
): void {
  const cx = x + w / 2;
  const cy = y + w / 2;
  const r = w / 2 - 2;
  const seed = 601;
  ctx.save();
  // 圆形纸底
  const disc: P[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    disc.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  fillWatercolor(ctx, disc, PALETTE.creamMist, { alpha: 0.97, layers: 1, seedIndex: seed });
  ctx.save();
  roundRectPath(ctx, x, y, w, w, r, 0.8, seed + 1);
  ctx.clip();
  // 脸
  const face: P[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    face.push({ x: cx + Math.cos(a) * r * 0.66, y: cy + Math.sin(a) * r * 0.68 + r * 0.06 });
  }
  fillWatercolor(ctx, face, tint(PALETTE.sunset, 0.5, PALETTE.creamMist), { alpha: 0.98, layers: 1, seedIndex: seed + 2 });
  // 草帽
  const brim: P[] = [
    { x: cx - r * 0.86, y: cy - r * 0.2 },
    { x: cx + r * 0.86, y: cy - r * 0.2 },
    { x: cx + r * 0.4, y: cy - r * 0.56 },
    { x: cx - r * 0.4, y: cy - r * 0.56 },
  ];
  fillWatercolor(ctx, brim, PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: seed + 3 });
  strokeInk(ctx, brim, { width: 2, close: true, seedIndex: seed + 4, jitter: 0.8 });
  // 眼睛 + 嘴（状态）
  const happy = state === 'proud' || state === 'win';
  const sad = state === 'hurt' || state === 'lose';
  for (let i = -1; i <= 1; i += 2) {
    const ex = cx + i * r * 0.26;
    const ey = cy + r * 0.12;
    if (happy) {
      strokeInk(ctx, [{ x: ex - 3, y: ey }, { x: ex, y: ey + 3 }, { x: ex + 3, y: ey }], { width: 1.8, seedIndex: seed + 10 + i });
    } else {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.beginPath();
      ctx.arc(ex, ey, 2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  const mouth: P[] = sad
    ? [{ x: cx - r * 0.22, y: cy + r * 0.42 }, { x: cx, y: cy + r * 0.28 }, { x: cx + r * 0.22, y: cy + r * 0.42 }]
    : [{ x: cx - r * 0.24, y: cy + r * 0.3 }, { x: cx, y: cy + r * 0.48 }, { x: cx + r * 0.24, y: cy + r * 0.3 }];
  strokeInk(ctx, mouth, { width: 2, seedIndex: seed + 20 });
  ctx.restore();
  strokeInk(ctx, disc, { width: 2.6, close: true, color: PALETTE.forestMid, seedIndex: seed + 30, jitter: 0.9 });
  // 满状态时头顶小叶片抖动
  if (happy) {
    const sw = Math.sin(time / 300) * 0.2;
    drawLeaf(ctx, cx + r * 0.1, cy - r * 1.02, 12, -0.4 + sw, PALETTE.leafMid, seed + 40);
  }
  ctx.restore();
}

/** 阶段倒计时：藤蔓轨道 + 光点 + 秒数（不是几何进度条）。 */
export function drawDeployTimer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  progress: number,
  secs: number,
  time: number,
): void {
  const w = 240;
  const x0 = cx - w / 2;
  const p = clamp01(progress);
  ctx.save();
  strokeInk(ctx, [{ x: x0, y: y }, { x: x0 + w, y: y }], { width: 4, color: rgba(PALETTE.creamMist, 0.75), seedIndex: 701, jitter: 0.8 });
  // 已走部分：叶绿色水彩
  strokeInk(ctx, [{ x: x0, y: y }, { x: x0 + w * p, y: y }], { width: 4.6, color: PALETTE.leafLight, seedIndex: 702, jitter: 1.0 });
  // 光点
  const gx = x0 + w * p;
  ctx.globalAlpha = 0.9;
  fillWatercolor(
    ctx,
    [
      { x: gx - 6, y: y - 6 },
      { x: gx + 6, y: y - 6 },
      { x: gx + 6, y: y + 6 },
      { x: gx - 6, y: y + 6 },
    ],
    PALETTE.sunbeam,
    { alpha: 0.9, layers: 1, seedIndex: 703 },
  );
  ctx.restore();
  textOutlined(ctx, Math.max(0, Math.round(secs)) + 's', cx, y - 16, FONT.entry, PALETTE.creamMist, 'center', 1.6);
}

/** 战绩卷轴面板：每回合一行。 */
export function drawScoreboardPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  logs: RoundLogView[],
  time: number,
): void {
  ctx.save();
  const pts: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, pts, PALETTE.paper, { alpha: 0.96, layers: 1, seedIndex: 801 });
  strokeInk(ctx, pts, { width: 2.4, close: true, seedIndex: 802, jitter: 1.0 });
  textOutlined(ctx, '战绩卷轴', x + w / 2, y + 30, FONT.h2, PALETTE.inkSoft, 'center', 0);
  strokeInk(ctx, [{ x: x + 40, y: y + 52 }, { x: x + w - 40, y: y + 52 }], { width: 2, color: rgba(PALETTE.inkSoft, 0.6), seedIndex: 803, jitter: 1.4 });
  if (logs.length === 0) {
    textPlain(ctx, '还没有打完一回合', x + w / 2, y + h / 2, FONT.body, rgba(PALETTE.inkSoft, 0.6), 'center');
    ctx.restore();
    return;
  }
  const rowH = 54;
  for (let i = 0; i < logs.length && i < 7; i++) {
    const l = logs[i];
    const ry = y + 72 + i * rowH;
    if (ry + rowH > y + h - 12) break;
    if (i % 2 === 0) {
      fillWatercolor(ctx, rectPts(x + 24, ry - 4, w - 48, rowH - 8), tint(PALETTE.moss, 0.5, PALETTE.paper), {
        alpha: 0.5, layers: 1, seedIndex: 810 + i,
      });
    }
    const win = l.winner === 'player';
    const drone = l.winner === 'enemy';
    textOutlined(ctx, '第 ' + l.round + ' 回合', x + 40, ry + 14, FONT.entry, PALETTE.inkSoft, 'left', 0);
    textPlain(
      ctx,
      win ? '我方占优' : drone ? '敌方占优' : '平手',
      x + 172,
      ry + 14,
      FONT.entry,
      win ? PALETTE.forestMid : drone ? PALETTE.berry : PALETTE.bark,
      'left',
      'bold',
    );
    const dmg = Math.abs(Math.round(l.houseDamage));
    textPlain(ctx, '小屋伤害 ' + dmg, x + 172, ry + 38, FONT.badge, PALETTE.inkSoft, 'left');
    textPlain(ctx, '天气 ' + weatherShort(l.weather), x + 320, ry + 38, FONT.badge, PALETTE.stream, 'left');
    // 回合小叶子标记
    for (let k = 0; k < Math.min(3, l.buffCount); k++) {
      drawLeaf(ctx, x + w - 60 - k * 16, ry + 20, 12, 1.1, PALETTE.leafMid, 820 + i * 3 + k);
    }
  }
  if (logs.length > 7) {
    textPlain(ctx, '……共 ' + logs.length + ' 回合', x + w / 2, y + h - 22, FONT.badge, rgba(PALETTE.inkSoft, 0.7), 'center');
  }
  ctx.restore();
}

export { ringColorFor, easeOutCubic, blobPath };