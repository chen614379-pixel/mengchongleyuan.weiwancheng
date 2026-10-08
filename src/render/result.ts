/**
 * 结算页：结果横幅、复盘卡（伤害构成 / MVP / 高光）、阳光账本、奖励行。
 * 场景传入绝对坐标，内部自己排版；伤害构成只负责**堆叠条**（这里是唯一允许的矩形条场景）。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE, rgba, tint } from '../config/palette';
import { SPECIES, SpeciesId } from '../config/species';
import { WeatherId } from '../config/weather';
import { fillWatercolor, noiseAt, roundRectPath, strokeInk, P } from '../ui/brush';
import { clamp01, cycle, easeOutBack, easeOutCubic } from '../ui/ease';
import { FONT, RADIUS, STROKE, fitSize, setFont, textOutlined, textPlain } from '../ui/theme';
import { drawLeaf, drawMossLight, drawSparkle, paperBase, woodGrain } from './paint';
import { drawSpeciesCreature, drawSpeciesSilhouette } from './unit';

const TAU = Math.PI * 2;

export interface DamageSegment {
  key: string;
  label: string;
  value: number;
}

export interface MvpView {
  species: SpeciesId;
  level: number;
  name: string;
  damage: number;
  taken: number;
  kills: number;
  aliveSec: number;
  rounds: number;
}

export interface HighlightView {
  label: string;
  round: number;
  species: SpeciesId;
  value: number;
  time?: number;
}

export interface LedgerRow {
  label: string;
  value: number;
}

export interface RewardView {
  kind: 'coin' | 'star';
  label: string;
  value: number;
}

export interface ReportPage {
  kind: 'damage' | 'mvp' | 'highlight';
  title: string;
  segments?: DamageSegment[];
  mvp?: MvpView;
  highlights?: HighlightView[];
}

export interface MatchResult {
  outcome: 'win' | 'lose' | 'draw' | string;
  rounds: number;
  playerHouseHp: number;
  enemyHouseHp: number;
  weather: WeatherId;
  pages: ReportPage[];
}

const SEG_COLOR: { [k: string]: string } = {
  basic: PALETTE.leafMid,
  trait: PALETTE.sunset,
  counter: PALETTE.berry,
  weather: PALETTE.stream,
  buff: PALETTE.twilight,
};

function rectPts(x: number, y: number, w: number, h: number): P[] {
  return [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ];
}

/* ------------------------------------------------------------------ */
/* 顶部横幅                                                            */
/* ------------------------------------------------------------------ */

export function drawResultBanner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  outcome: 'win' | 'lose' | 'draw' | string,
  time: number,
): void {
  const win = outcome === 'win';
  const draw = outcome === 'draw';
  const title = win ? '胜 利' : draw ? '平 局' : '惜 败';
  const sub = win ? '苔藓林地重归安宁' : draw ? '势均力敌' : '下次换个阵容试试';
  const accent = win ? PALETTE.sunbeam : draw ? PALETTE.moss : PALETTE.blossom;
  const seed = 1301;
  ctx.save();
  // 卷轴底
  const body = rectPts(x, y, w, h);
  fillWatercolor(ctx, body, win ? tint(PALETTE.barkLight, 0.12, PALETTE.sunbeam) : PALETTE.barkLight, {
    alpha: 0.98, layers: 1, wetEdge: true, seedIndex: seed,
  });
  woodGrain(ctx, x, y, w, h, seed + 1);
  strokeInk(ctx, body, { width: STROKE + 1, close: true, seedIndex: seed + 2, jitter: 1.2 });
  // 两端木轴
  for (let i = 0; i < 2; i++) {
    const rx = i === 0 ? x - 14 : x + w - 10;
    const rod: P[] = rectPts(rx, y - 6, 24, h + 12);
    fillWatercolor(ctx, rod, PALETTE.bark, { alpha: 0.98, layers: 1, seedIndex: seed + 10 + i });
    strokeInk(ctx, rod, { width: 2.4, close: true, seedIndex: seed + 12 + i, jitter: 0.9 });
  }
  // 文字
  const pop = easeOutBack(clamp01(cycle(time, 100000, 0) * 4 + 0.6), 1.4);
  ctx.save();
  ctx.translate(x + w / 2, y + h * 0.42);
  ctx.scale(0.92 + pop * 0.08, 0.92 + pop * 0.08);
  textOutlined(ctx, title, 0, 0, FONT.h1 + 14, win ? PALETTE.creamMist : PALETTE.paper, 'center', 3);
  ctx.restore();
  textPlain(ctx, sub, x + w / 2, y + h * 0.82, FONT.entry, rgba(PALETTE.inkSoft, 0.85), 'center');
  // 星辉 / 花瓣
  for (let i = 0; i < 5; i++) {
    const t = cycle(time, 4200, i * 800);
    if (t < 0.5) continue;
    const a = i * 1.2 + 0.4;
    drawSparkle(ctx, x + w / 2 + Math.cos(a) * (w * 0.42), y + h / 2 + Math.sin(a) * (h * 0.34), 4 + i, accent, (t - 0.5) * 2 * 0.9);
  }
  drawLeaf(ctx, x + 44, y + h / 2, 22, 1.3, PALETTE.leafMid, seed + 30);
  drawLeaf(ctx, x + w - 44, y + h / 2, 22, Math.PI - 1.3, PALETTE.leafMid, seed + 31);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 复盘卡                                                              */
/* ------------------------------------------------------------------ */

export function drawReportCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  page: ReportPage,
  time: number,
  index: number,
  total: number,
): void {
  const seed = 1401;
  ctx.save();
  // 木框
  const frame = rectPts(x, y, w, h);
  fillWatercolor(ctx, frame, PALETTE.barkLight, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: seed });
  woodGrain(ctx, x, y, w, h, seed + 1);
  strokeInk(ctx, frame, { width: STROKE, close: true, seedIndex: seed + 2, jitter: 1.3 });
  // 内纸
  const ip = rectPts(x + 14, y + 14, w - 28, h - 28);
  paperBase(ctx, x + 14, y + 14, w - 28, h - 28, PALETTE.paper, 0.97, seed + 3);
  fillWatercolor(ctx, ip, PALETTE.paper, { alpha: 0.95, layers: 1, seedIndex: seed + 4 });
  strokeInk(ctx, ip, { width: 2.2, close: true, color: rgba(PALETTE.inkSoft, 0.8), seedIndex: seed + 5, jitter: 1.0 });
  // 四角叶藤
  drawLeaf(ctx, x + 30, y + 30, 18, 1.1, PALETTE.leafMid, seed + 6);
  drawLeaf(ctx, x + w - 30, y + 30, 18, Math.PI - 1.1, PALETTE.leafLight, seed + 7);
  drawLeaf(ctx, x + 30, y + h - 30, 18, Math.PI + 1.1, PALETTE.leafMid, seed + 8);
  drawLeaf(ctx, x + w - 30, y + h - 30, 18, -1.1, PALETTE.leafLight, seed + 9);

  // 标题条
  const tw = Math.min(w - 200, 320);
  const tx = x + (w - tw) / 2;
  const tp: P[] = rectPts(tx, y + 20, tw, 40);
  fillWatercolor(ctx, tp, PALETTE.creamMist, { alpha: 0.96, layers: 1, seedIndex: seed + 10 });
  strokeInk(ctx, tp, { width: 2.2, close: true, seedIndex: seed + 11, jitter: 0.9 });
  textOutlined(ctx, page.title, x + w / 2, y + 42, FONT.h2, PALETTE.inkSoft, 'center', 0);
  textPlain(ctx, (index + 1) + ' / ' + total, x + w - 34, y + 42, FONT.badge, rgba(PALETTE.inkSoft, 0.7), 'center');

  const cx = x + w / 2;
  const cy = y + 66;
  const cw = w - 60;
  const ch = h - 100;
  if (page.kind === 'damage' && page.segments) {
    // 堆叠条由场景单独调用 drawDamageStack 绘制，这里只放图例占位与提示
    textPlain(ctx, '伤害构成 · 误差 <1%', cx, cy + 8, FONT.badge, rgba(PALETTE.inkSoft, 0.7), 'center');
    for (let i = 0; i < page.segments.length; i++) {
      const s = page.segments[i];
      const lx = x + 60 + (i % 3) * 200;
      const ly = cy + ch - 40 - Math.floor(i / 3) * 26;
      drawLeaf(ctx, lx, ly - 6, 12, 1.2, SEG_COLOR[s.key] || PALETTE.leafMid, seed + 20 + i);
      textPlain(ctx, s.label, lx + 14, ly - 6, FONT.badge, PALETTE.inkSoft, 'left');
    }
  } else if (page.kind === 'mvp' && page.mvp) {
    drawMvpPanel(ctx, x + 30, cy, cw, ch, page.mvp, time);
  } else if (page.kind === 'highlight' && page.highlights) {
    drawHighlightStrip(ctx, x + 30, cy, cw, ch, page.highlights, time);
  }
  ctx.restore();
}

/** 伤害堆叠条（唯一的矩形条场景之一）+ 点击展开明细。 */
export function drawDamageStack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  segments: DamageSegment[],
  time: number,
  expanded?: number | string,
): void {
  const seed = 1501;
  let total = 0;
  for (const s of segments) total += Math.max(0, s.value);
  const hasData = total > 0;
  const denom = hasData ? total : 1;
  const n = Math.max(1, segments.length);
  ctx.save();
  // 版式对齐目标图（ui-result-victory）：数值行在上、色块横条居中、标签行在下、总伤害居中最底。
  const barY = y + 32;
  const barH = Math.max(48, Math.min(72, h - 76));
  const track: P[] = rectPts(x, barY, w, barH);
  fillWatercolor(ctx, track, PALETTE.creamMist, { alpha: 0.95, layers: 1, seedIndex: seed });
  strokeInk(ctx, track, { width: 2.4, close: true, seedIndex: seed + 1, jitter: 1.0 });

  const innerW = w - 4;
  let cursor = x + 2;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    // 没有战报数据时按等分铺色（整条压暗），保证结算页版式与目标图一致。
    const frac = hasData ? Math.max(0, s.value) / denom : 1 / n;
    const sw = innerW * frac;
    const sp: P[] = rectPts(cursor, barY + 2, sw, barH - 4);
    fillWatercolor(ctx, sp, SEG_COLOR[s.key] || PALETTE.leafMid, {
      alpha: hasData ? 0.95 : 0.32, layers: 1, seedIndex: seed + 10 + i,
    });
    strokeInk(ctx, sp, { width: 1.8, close: true, color: rgba(PALETTE.paper, 0.85), seedIndex: seed + 30 + i, jitter: 0.9 });
    if (expanded === i || expanded === s.key) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      drawMossLight(ctx, cursor + sw / 2, barY + barH / 2, sw * 0.7, barH / 96, seed + 20 + i);
      ctx.restore();
    }
    const pct = Math.round(frac * 1000) / 10;
    if (sw > 44) {
      // 数值在条上方、百分比压在色块里，与目标图相同。
      textOutlined(ctx, '' + Math.round(s.value), cursor + sw / 2, barY - 16, FONT.entry, PALETTE.inkSoft, 'center', 0);
      textPlain(ctx, pct + '%', cursor + sw / 2, barY + barH / 2, FONT.badge, PALETTE.paper, 'center');
    } else if (sw > 20) {
      textPlain(ctx, pct + '%', cursor + sw / 2, barY + barH / 2, FONT.badge - 2, PALETTE.paper, 'center');
    }
    textPlain(ctx, s.label, cursor + sw / 2, barY + barH + 24, FONT.badge, rgba(PALETTE.inkSoft, 0.9), 'center');
    cursor += sw;
  }
  textOutlined(ctx, '总伤害 ' + Math.round(total), x + w / 2, y + h - 6, FONT.h2, PALETTE.inkSoft, 'center', 0);
  ctx.restore();
}

/** MVP 面板（画在复盘卡内）。 */
export function drawMvpPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  mvp: MvpView,
  time: number,
): void {
  const seed = 1601;
  ctx.save();
  const pad: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, pad, tint(PALETTE.moss, 0.66, PALETTE.paper), { alpha: 0.7, layers: 1, seedIndex: seed });
  strokeInk(ctx, pad, { width: 2, close: true, color: rgba(PALETTE.inkSoft, 0.6), seedIndex: seed + 1, jitter: 1.2 });

  // 左侧头像
  const ax = x + 96;
  const ay = y + h / 2;
  const r = 62;
  const disc: P[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const k = 1 + noiseAt(i, seed + 2) * 0.05;
    disc.push({ x: ax + Math.cos(a) * r * k, y: ay + Math.sin(a) * r * k });
  }
  fillWatercolor(ctx, disc, tint(SPECIES[mvp.species].theme, 0.6, PALETTE.creamMist), { alpha: 0.95, layers: 1, seedIndex: seed + 3 });
  ctx.save();
  roundRectPath(ctx, ax - r, ay - r, r * 2, r * 2, r, 0.8, seed + 4);
  ctx.clip();
  drawSpeciesCreature(ctx, mvp.species, mvp.level, ax, ay + r * 1.05, (r * 1.9) / (SPECIES[mvp.species].bodyRadius * 2.4), time, {
    seedIndex: seed + 5,
  });
  ctx.restore();
  strokeInk(
    ctx,
    disc,
    { width: 2.6, close: true, color: PALETTE.sunbeam, seedIndex: seed + 6, jitter: 1.0 },
  );
  // 冠冕小叶片
  const sway = Math.sin(time / 400) * 0.2;
  drawLeaf(ctx, ax - 8, ay - r - 6, 20, -0.5 + sway, PALETTE.sunbeam, seed + 7);
  drawLeaf(ctx, ax + 10, ay - r - 2, 16, 0.3 - sway, PALETTE.leafLight, seed + 8);

  // 右侧数据
  const lx = x + 200;
  textOutlined(ctx, '本场 MVP', lx, y + 26, FONT.badge, rgba(PALETTE.inkSoft, 0.8), 'left', 0);
  textOutlined(ctx, mvp.name + ' · Lv.' + mvp.level, lx, y + 54, FONT.h2, PALETTE.inkSoft, 'left', 0);
  const rows: { k: string; v: string }[] = [
    { k: '总伤害', v: '' + Math.round(mvp.damage) },
    { k: '承受伤害', v: '' + Math.round(mvp.taken) },
    { k: '击杀', v: '' + mvp.kills },
    { k: '存活', v: Math.round(mvp.aliveSec) + 's / ' + mvp.rounds + ' 回合' },
  ];
  for (let i = 0; i < rows.length; i++) {
    const ry = y + 86 + i * 30;
    drawLeaf(ctx, lx + 6, ry, 12, 1.2, PALETTE.leafMid, seed + 20 + i);
    textPlain(ctx, rows[i].k, lx + 22, ry, FONT.entry, rgba(PALETTE.inkSoft, 0.8), 'left');
    textOutlined(ctx, rows[i].v, x + w - 20, ry, FONT.entry, PALETTE.inkSoft, 'right', 0);
  }
  ctx.restore();
}

/** 高光时刻条（画在复盘卡内）。 */
export function drawHighlightStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  highlights: HighlightView[],
  time: number,
): void {
  const seed = 1701;
  ctx.save();
  const rowH = Math.min(60, h / Math.max(1, highlights.length));
  for (let i = 0; i < highlights.length; i++) {
    const hl = highlights[i];
    const ry = y + i * rowH;
    const pad: P[] = rectPts(x, ry + 4, w, rowH - 10);
    fillWatercolor(ctx, pad, i % 2 === 0 ? tint(PALETTE.moss, 0.7, PALETTE.paper) : tint(PALETTE.creamMist, 0.5, PALETTE.paper), {
      alpha: 0.75, layers: 1, seedIndex: seed + i,
    });
    strokeInk(ctx, pad, { width: 1.8, close: true, color: rgba(PALETTE.inkSoft, 0.5), seedIndex: seed + 10 + i, jitter: 1.1 });
    // 头像
    const cx = x + 34;
    const cy = ry + rowH / 2 - 1;
    fillWatercolor(
      ctx,
      (() => {
        const pts: P[] = [];
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * TAU;
          pts.push({ x: cx + Math.cos(a) * 18, y: cy + Math.sin(a) * 18 });
        }
        return pts;
      })(),
      tint(SPECIES[hl.species].theme, 0.55, PALETTE.creamMist),
      { alpha: 0.95, layers: 1, seedIndex: seed + 20 + i },
    );
    ctx.save();
    roundRectPath(ctx, cx - 18, cy - 18, 36, 36, 18, 0.8, seed + 30 + i);
    ctx.clip();
    drawSpeciesCreature(ctx, hl.species, 1, cx, cy + 20, 1.15, time, { seedIndex: seed + 40 + i, facing: 1 });
    ctx.restore();
    textOutlined(ctx, '第 ' + hl.round + ' 回合', x + 62, ry + rowH / 2 - 10, FONT.badge, rgba(PALETTE.inkSoft, 0.8), 'left', 0);
    textOutlined(ctx, hl.label, x + 62, ry + rowH / 2 + 12, FONT.entry, PALETTE.inkSoft, 'left', 0);
    const vs = hl.value >= 100 ? '' + Math.round(hl.value) : (Math.round(hl.value * 10) / 10) + '';
    textOutlined(ctx, vs, x + w - 20, ry + rowH / 2 + 1, FONT.h2, PALETTE.berry, 'right', 0);
    if (cycle(time, 3000, i * 500) < 0.25) {
      drawSparkle(ctx, x + w - 70, ry + rowH / 2 - 14, 5, PALETTE.sunbeam, 0.6);
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 账本 / 奖励 / 翻页点                                                 */
/* ------------------------------------------------------------------ */

export function drawSunLedger(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rows: LedgerRow[],
  time: number,
): void {
  const seed = 1801;
  ctx.save();
  const pad: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, pad, PALETTE.barkLight, { alpha: 0.97, layers: 1, seedIndex: seed });
  woodGrain(ctx, x, y, w, h, seed + 1);
  strokeInk(ctx, pad, { width: STROKE, close: true, seedIndex: seed + 2, jitter: 1.1 });
  const colW = w / Math.max(1, rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cx = x + colW * (i + 0.5);
    if (i > 0) {
      strokeInk(ctx, [{ x: x + colW * i, y: y + 10 }, { x: x + colW * i, y: y + h - 10 }], { width: 1.4, color: rgba(PALETTE.inkSoft, 0.25), seedIndex: seed + 10 + i, jitter: 1.2 });
    }
    drawSunCoinMini(ctx, x + colW * i + 16, y + h * 0.5, time, seed + 20 + i);
    ctx.save();
    ctx.globalAlpha = 0.85;
    setFont(ctx, FONT.badge, 'normal');
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.creamMist;
    ctx.fillText(r.label, x + colW * i + 34, y + h * 0.5);
    ctx.restore();
    const v = (r.value > 0 ? '+' : '') + Math.round(r.value);
    textOutlined(ctx, v, x + colW * (i + 1) - 12, y + h * 0.5, FONT.entry, r.value >= 0 ? PALETTE.sunbeam : PALETTE.blossom, 'right', 1.6);
  }
  ctx.restore();
}

function drawSunCoinMini(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number, seed: number): void {
  ctx.save();
  const disc: P[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    disc.push({ x: cx + Math.cos(a) * 11, y: cy + Math.sin(a) * 11 });
  }
  fillWatercolor(ctx, disc, PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: seed });
  strokeInk(ctx, disc, { width: 1.8, close: true, color: PALETTE.sunset, seedIndex: seed + 1, jitter: 0.7 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + time / 3000;
    strokeInk(ctx, [{ x: cx + Math.cos(a) * 13, y: cy + Math.sin(a) * 13 }, { x: cx + Math.cos(a) * 16, y: cy + Math.sin(a) * 16 }], {
      width: 1.6, color: rgba(PALETTE.sunset, 0.7), seedIndex: seed + 2 + i, jitter: 0.5,
    });
  }
  ctx.restore();
}

export function drawRewardRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rewards: RewardView[],
  progress: number,
  time: number,
): void {
  const seed = 1901;
  const p = clamp01(progress);
  ctx.save();
  const pad: P[] = rectPts(x, y, w, h);
  fillWatercolor(ctx, pad, PALETTE.creamMist, { alpha: 0.96, layers: 1, seedIndex: seed });
  strokeInk(ctx, pad, { width: STROKE, close: true, seedIndex: seed + 1, jitter: 1.1 });
  const colW = w / Math.max(1, rewards.length);
  for (let i = 0; i < rewards.length; i++) {
    const r = rewards[i];
    const cx = x + colW * (i + 0.5);
    const pop = easeOutBack(clamp01((p - i * 0.25) * 4), 1.5);
    ctx.save();
    ctx.translate(cx, y + h * 0.42);
    ctx.scale(pop, pop);
    if (r.kind === 'coin') {
      drawSunCoinMini(ctx, 0, 0, time, seed + 10 + i);
    } else {
      drawStarBig(ctx, 0, 0, 12, seed + 20 + i);
    }
    ctx.restore();
    const shown = Math.round(r.value * clamp01((p - i * 0.25) * 4));
    textOutlined(ctx, '+' + shown, cx, y + h * 0.82, FONT.entry, PALETTE.inkSoft, 'center', 0);
    textPlain(ctx, r.label, cx, y + 12, FONT.badge - 2, rgba(PALETTE.inkSoft, 0.75), 'center');
  }
  ctx.restore();
}

function drawStarBig(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number): void {
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.46;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  fillWatercolor(ctx, pts, PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: seed });
  strokeInk(ctx, pts, { width: 1.8, close: true, color: PALETTE.sunset, seedIndex: seed + 1, jitter: 0.7 });
}

export function drawPageDots(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  count: number,
  active: number,
  time: number,
): void {
  ctx.save();
  const gap = 34;
  for (let i = 0; i < count; i++) {
    const x = cx - ((count - 1) * gap) / 2 + i * gap;
    const on = i === active;
    const r = on ? 11 : 7;
    const bounce = on ? 1 + Math.sin(time / 320) * 0.08 : 1;
    drawLeaf(ctx, x, y, r * 2 * bounce, on ? -0.4 : 1.1, on ? PALETTE.leafLight : PALETTE.moss, 2001 + i);
    if (on) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(time / 400) * 0.15;
      drawMossLight(ctx, x, y, 18, 0.5, 2010 + i);
      ctx.restore();
    }
  }
  ctx.restore();
}

export { fitSize, RADIUS, drawSpeciesSilhouette, easeOutCubic };