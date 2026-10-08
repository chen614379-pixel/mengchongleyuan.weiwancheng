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
  const seed = 401;
  // 木架
  const rack: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, rack, PALETTE.barkLight, { alpha: 0.96, layers: 1, wetEdge: true, seedIndex: seed });
  woodGrain(ctx, x, y, w, h, seed + 1);
  strokeInk(ctx, rack, { width: STROKE, close: true, seedIndex: seed + 2, jitter: 1.1 });
  // 两端藤
  drawLeaf(ctx, x + 8, y + h / 2, 16, 1.2, PALETTE.leafMid, seed + 3);
  drawLeaf(ctx, x + w - 8, y + h / 2, 16, Math.PI - 1.2, PALETTE.leafMid, seed + 4);

  const b = LAYOUT.BENCH;
  for (let i = 0; i < slots.length && i < b.slots; i++) {
    const sx = x + 8 + i * (b.cell + b.gap) - 4;
    const sy = y + (h - (narrow ? 38 : b.cell - 16)) / 2;
    const sw = narrow ? b.cell - 12 : b.cell - 16;
    const sh = narrow ? 38 : b.cell - 16;
    const hover = opts.dragHoverIndex === i;
    // 凹槽
    const hole: P[] = rectPts(sx, sy, sw, sh);
    fillWatercolor(ctx, hole, tint(PALETTE.bark, 0.35, PALETTE.soil), { alpha: 0.9, layers: 1, seedIndex: seed + 10 + i });
    strokeInk(ctx, hole, { width: 2, close: true, color: rgba(PALETTE.inkSoft, 0.7), seedIndex: seed + 20 + i, jitter: 0.9 });
    if (hover) {
      drawMossLight(ctx, sx + sw / 2, sy + sh / 2, sw * 0.6, 0.5, seed + 30 + i);
    }
    const card = slots[i];
    if (!card) {
      textPlain(ctx, '空', sx + sw / 2, sy + sh / 2, FONT.badge, rgba(PALETTE.inkSoft, 0.35), 'center');
      continue;
    }
    if (narrow) {
      // 战斗阶段：只留小头像 + 等级。整只生物按小格子缩放会顶出凹槽，
      // 改成把美术头像裁进凹槽（等比 cover），与图鉴/卡组里的宠物抠图同一套素材。
      const img = getImage('unit-' + (card.species || 'mouse'));
      ctx.save();
      roundRectPath(ctx, sx, sy, sw, sh, 9, 0);
      ctx.clip();
      if (img) {
        const sc = Math.max(sw / img.width, sh / img.height);
        const dw = img.width * sc;
        const dh = img.height * sc;
        ctx.drawImage(img, sx + (sw - dw) / 2, sy + (sh - dh) / 2, dw, dh);
      } else {
        const scale = (sh * 1.5) / (SPECIES[card.species || 'mouse'].bodyRadius * 3.1);
        drawSpeciesCreature(ctx, card.species || 'mouse', card.level || 1, sx + sw * 0.5, sy + sh * 0.95, scale, time, {
          seedIndex: seed + 40 + i,
        });
      }
      ctx.restore();
      if ((card.level || 1) >= 2) {
        textOutlined(ctx, 'Lv.' + card.level, sx + sw - 4, sy + 10, FONT.badge - 4, PALETTE.sunbeam, 'center', 1.2);
      }
    } else {
      // 宽态凹槽是方形（≈84×84），卡面 168×232 若按宽度缩放会上下各顶出约 16px；
      // 改按「能完整放进凹槽」的比例缩放（contain），不再裁掉卡面美术。
      const scale = Math.min(sw / LAYOUT.CARD.w, sh / LAYOUT.CARD.h);
      drawCard(ctx, card, sx + (sw - LAYOUT.CARD.w * scale) / 2, sy + (sh - LAYOUT.CARD.h * scale) / 2, {
        time: time, scale: scale,
      });
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