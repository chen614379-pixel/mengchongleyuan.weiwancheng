/**
 * 棋盘：一整块苔藓草甸水彩空地 + 中间蜿蜒小溪 + 边缘藤蔓/卵石/花 + 敌半场雾（§2.5 / §2.6.4）。
 *
 * 绝对禁止：格子线、点位标记、坐标点、方框（附录 D）。
 * 唯一允许的落点反馈是苔藓光斑 + 草叶涟漪（拖拽时也一样）。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE, rgba, tint } from '../config/palette';
import { TIMING } from '../config/timing';
import { blobPath, fillWatercolor, jitterPoints, noiseAt, strokeInk, tracePath, P } from '../ui/brush';
import { breathe, cycle, decay } from '../ui/ease';
import { setFont, textOutlined, textPlain, FONT } from '../ui/theme';
import {
  drawBush,
  drawClover,
  drawFern,
  drawFlower,
  drawFogBand,
  drawMossLight,
  drawMushroom,
  drawPebble,
  drawRipple,
  drawStone,
  drawVine,
  woodGrain,
} from './paint';

function rnd(i: number, seed: number): number {
  return (noiseAt(i, seed) + 1) / 2;
}

/** 草甸空地（含边界起伏），供棋盘与营地共用。 */
export function clearingPath(x: number, y: number, w: number, h: number): P[] {
  const pts: P[] = [];
  const seg = 52;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const rx = w / 2;
    const ry = h / 2;
    const wob = 1 + noiseAt(i, 13) * 0.035 + Math.sin(a * 3 + 0.7) * 0.02;
    pts.push({ x: x + w / 2 + Math.cos(a) * rx * wob, y: y + h / 2 + Math.sin(a) * ry * wob * 0.98 });
  }
  return pts;
}

/** 小溪中心线上的 y（随时间轻微起伏，形成「流动」错觉）。 */
function streamY(x: number, time: number, board: { x: number; y: number; w: number; h: number }): number {
  const t = (x - board.x) / board.w;
  const base = board.y + board.h * (0.5 + Math.sin(t * 2.4 + 0.4) * 0.055 - t * 0.02);
  const flow = Math.sin(t * 5.2 + time / 900) * 5 + Math.sin(t * 2.1 - time / 1400) * 3;
  return base + flow;
}

/** 画一条蜿蜒小溪（含岸线、水色、流动高光）。 */
export function drawStream(ctx: CanvasRenderingContext2D, x0: number, x1: number, time: number, hi?: number): void {
  const board = LAYOUT.BOARD;
  const step = 14;
  const top: P[] = [];
  const bot: P[] = [];
  const count = Math.ceil((x1 - x0) / step);
  for (let i = 0; i <= count; i++) {
    const x = x0 + (i / count) * (x1 - x0);
    const y = streamY(x, time, board);
    const half = 15 + Math.sin(x * 0.02 + 1.2) * 6 + noiseAt(i, 21) * 3;
    top.push({ x: x, y: y - half });
    bot.push({ x: x, y: y + half });
  }
  const outline: P[] = top.slice();
  for (let i = bot.length - 1; i >= 0; i--) outline.push(bot[i]);

  fillWatercolor(ctx, outline, tint(PALETTE.stream, 0.1, PALETTE.paper), {
    alpha: 0.9, layers: 2, wetEdge: true, seedIndex: 33,
  });
  // 岸边湿土
  strokeInk(ctx, top, { width: 2.2, jitter: 0.9, color: tint(PALETTE.soil, 0.35, PALETTE.stream), seedIndex: 34 });
  strokeInk(ctx, bot, { width: 2.2, jitter: 0.9, color: tint(PALETTE.soil, 0.35, PALETTE.stream), seedIndex: 35 });

  // 流动高光：三道断续白线（战斗时随 hi 增强）
  const boost = hi === undefined ? 0 : hi;
  ctx.save();
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const pts: P[] = [];
    for (let i = 0; i <= count; i++) {
      const x = x0 + (i / count) * (x1 - x0);
      const y = streamY(x, time + k * 260, board) - 4 + k * 5;
      const wobble = Math.sin(x * 0.08 + time / (520 - k * 90) + k) * 1.6;
      if (Math.sin(x * 0.05 + k * 2 + time / 700) > -0.35) pts.push({ x: x, y: y + wobble });
    }
    if (pts.length > 1) {
      ctx.globalAlpha = (0.2 + k * 0.08) * (1 + boost * 0.8);
      ctx.strokeStyle = PALETTE.creamMist;
      ctx.lineWidth = 2.4 - k * 0.4;
      tracePath(ctx, jitterPoints(pts, 0.8, 36 + k, false), false);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 空地边缘的收边装饰：藤蔓、卵石、三叶草、小花、蘑菇。 */
function edgeDecor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, time: number): void {
  const border = clearingPath(x, y, w, h);
  // 藤蔓沿边界的一段段（不画满，留呼吸感）
  for (let seg = 0; seg < 6; seg++) {
    const a0 = (seg / 6) * Math.PI * 2 + 0.2;
    const a1 = a0 + Math.PI * 2 / 6 - 0.45;
    const pts: P[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (a1 - a0) * (i / 10);
      pts.push({ x: x + w / 2 + Math.cos(a) * (w / 2), y: y + h / 2 + Math.sin(a) * (h / 2) });
    }
    drawVine(ctx, pts, 300 + seg * 11, { width: 2.2, leafEvery: 30, leafLen: 11 });
  }
  // 卵石与小花：沿边界外侧零散分布
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd(i, 25) * 0.2;
    const px = x + w / 2 + Math.cos(a) * (w / 2 + 10 + rnd(i, 27) * 16);
    const py = y + h / 2 + Math.sin(a) * (h / 2 + 8 + rnd(i, 29) * 12);
    if (i % 3 === 0) drawPebble(ctx, px, py, 12 + rnd(i, 31) * 8, 8 + rnd(i, 33) * 5, 400 + i * 7);
    else if (i % 3 === 1) drawClover(ctx, px, py, 9 + rnd(i, 35) * 4, 420 + i * 5);
    else drawFlower(ctx, px, py, 8 + rnd(i, 37) * 4, i % 2 === 0 ? PALETTE.blossom : PALETTE.sunbeam, 440 + i * 9);
  }
  // 内侧几处苔藓团与蘑菇，弱化「空地块」的边界感
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.5;
    const px = x + w / 2 + Math.cos(a) * (w / 2 - 26);
    const py = y + h / 2 + Math.sin(a) * (h / 2 - 22);
    drawBush(ctx, px, py, 20 + rnd(i, 41) * 12, 13 + rnd(i, 43) * 6, i % 2 === 0 ? PALETTE.moss : PALETTE.leafMid, 460 + i * 7);
    if (i % 4 === 2) drawMushroom(ctx, px + 26, py + 10, 16, 480 + i * 5);
    if (i % 5 === 3) drawFern(ctx, px - 24, py + 12, 26, -0.4, PALETTE.leafLight, 490 + i * 3);
  }
  // 随风轻摆的边缘草（可视化「这里是活的草地」）
  const sway = Math.sin((time / 1000) * Math.PI) * 2;
  for (let i = 0; i < 10; i++) {
    const x0 = x + 30 + (i / 9) * (w - 60);
    drawFern(ctx, x0, y + h - 2 + sway, 22, -1.3, PALETTE.leafLight, 520 + i * 3);
  }
}

/**
 * 棋盘主体（match.ts 调用：`drawBoard(ctx, renderTime)`）。
 * `opts.fog` > 0 时叠加敌半场雾（布阵/集市阶段 opacity 1，观测窗渐隐）。
 */
export function drawBoard(ctx: CanvasRenderingContext2D, time: number, opts?: { fog?: number }): void {
  const b = LAYOUT.BOARD;
  // 棋盘外的森林地面（避免侧栏两侧出现空白）
  ctx.save();
  ctx.globalAlpha = 0.5;
  const outer: P[] = [
    { x: b.x - 6, y: b.y - 6 },
    { x: b.x + b.w + 6, y: b.y - 6 },
    { x: b.x + b.w + 6, y: b.y + b.h + 6 },
    { x: b.x - 6, y: b.y + b.h + 6 },
  ];
  fillWatercolor(ctx, outer, tint(PALETTE.forestMid, 0.35, PALETTE.paper), { alpha: 0.5, layers: 1, seedIndex: 2 });
  ctx.restore();

  // 空地本体：一层苔藓底 + 一层受光草甸
  const clearing = clearingPath(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
  fillWatercolor(ctx, clearing, PALETTE.meadow, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: 3 });
  fillWatercolor(
    ctx,
    [
      { x: b.x + 40, y: b.y + b.h * 0.42 },
      { x: b.x + b.w - 60, y: b.y + b.h * 0.3 },
      { x: b.x + b.w - 30, y: b.y + b.h - 30 },
      { x: b.x + 60, y: b.y + b.h - 16 },
    ],
    tint(PALETTE.leafLight, 0.34, PALETTE.paper),
    { alpha: 0.45, layers: 2, wetEdge: true, seedIndex: 4 },
  );
  // 草地上的深浅斑块（水彩的自然不均）
  for (let i = 0; i < 9; i++) {
    const px = b.x + 60 + rnd(i, 51) * (b.w - 120);
    const py = b.y + 60 + rnd(i * 3, 53) * (b.h - 120);
    blobPath(ctx, px - 60, py - 26, 120, 52, 1.4, 55 + i);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = i % 2 === 0 ? PALETTE.moss : tint(PALETTE.leafMid, 0.2, PALETTE.paper);
    ctx.fill();
    ctx.restore();
  }

  // 小溪横穿中央 + 踏脚石
  drawStream(ctx, b.x + 6, b.x + b.w - 6, time, opts && opts.fog ? 0 : 0.2);
  const stones = [0.22, 0.5, 0.78];
  for (let i = 0; i < stones.length; i++) {
    const sx = b.x + b.w * stones[i];
    const sy = streamY(sx, time, b) + (i % 2 === 0 ? -3 : 4);
    drawStone(ctx, sx, sy, 15 + i * 3, 600 + i * 5, i === 1);
    drawRipple(ctx, sx, sy + 8, 14 + i * 3, 0.25);
  }

  edgeDecor(ctx, b.x + 8, b.y + 8, b.w - 16, b.h - 16, time);

  // 敌半场雾（布阵/集市：敌方棋盘绝对不可见）
  if (opts && opts.fog && opts.fog > 0) drawEnemyFog(ctx, time, opts.fog);
}

/** 敌半场雾 + 树影 + ？剪影（§2.6.4）。density 0~1。
 *  我方锚点占 rows 0..3（棋盘上半部），敌方占 rows 4..7（下半部），
 *  所以雾必须落在棋盘下缘那条 56% 高的带子上，不能遮住自己的落点苔藓光斑。 */
export function drawEnemyFog(ctx: CanvasRenderingContext2D, time: number, density?: number): void {
  const d = density === undefined ? 1 : Math.max(0, Math.min(1, density));
  if (d <= 0) return;
  const b = LAYOUT.BOARD;
  const x = b.x;
  const y = b.y + b.h * 0.44;
  const w = b.w;
  const h = b.h * 0.56;
  ctx.save();
  ctx.globalAlpha = d;
  // 雾后的树影
  for (let i = 0; i < 7; i++) {
    const tx = x + 60 + i * (w / 6.6) + Math.sin(time / 2600 + i) * 8;
    const th = 120 + rnd(i, 61) * 90;
    const cols: P[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      cols.push({ x: tx + Math.cos(a) * 46 * (1 + noiseAt(k, 63) * 0.2), y: y + h - 30 + Math.sin(a) * 26 });
    }
    fillWatercolor(ctx, cols, tint(PALETTE.forestDeep, 0.5, PALETTE.creamMist), {
      alpha: 0.5, layers: 2, wetEdge: false, seedIndex: 70 + i,
    });
    strokeInk(ctx, [{ x: tx - 7, y: y + h - 24 }, { x: tx - 4, y: y + h - th }, { x: tx + 6, y: y + h - th * 0.9 }, { x: tx + 7, y: y + h - 20 }], {
      width: 6, jitter: 1.4, color: tint(PALETTE.bark, 0.35, PALETTE.creamMist), seedIndex: 90 + i,
    });
  }
  // 雾层
  for (let i = 0; i < 4; i++) {
    const drift = (cycle(time, 18000 + i * 5200, i * 610) - 0.5) * 70;
    drawFogBand(ctx, x - 20 + drift, y + (i / 4) * h, w + 40, h / 3.4, 0.42, 130 + i * 11);
  }
  // ？剪影：提示「这里有敌人，但看不清」
  const qs = [0.2, 0.44, 0.68, 0.86];
  for (let i = 0; i < qs.length; i++) {
    const qx = x + w * qs[i];
    const qy = y + h * (0.62 + rnd(i, 65) * 0.22);
    const pulse = 0.5 + 0.2 * breathe(time, 2400 + i * 300);
    ctx.save();
    ctx.globalAlpha = 0.5 * pulse;
    ctx.fillStyle = PALETTE.twilight;
    blobPath(ctx, qx - 34, qy - 46, 68, 92, 1.2, 150 + i * 7);
    ctx.fill();
    ctx.restore();
    setFont(ctx, FONT.h1, 'bold');
    textOutlined(ctx, '?', qx, qy - 2, FONT.h1, PALETTE.creamMist, 'center');
  }
  ctx.restore();
}

/** 呼吸的苔藓光斑（唯一允许的落点反馈；MOSS_BREATH = 800ms）。 */
export function drawMossPatch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  time: number,
  alpha?: number,
): void {
  const breath = 0.72 + 0.28 * breathe(time, TIMING.MOSS_BREATH);
  const a = (alpha === undefined ? 0.5 : alpha) * breath;
  drawMossLight(ctx, cx, cy, r, a, 7);
}

/** 落位草叶涟漪（0.25s）：一圈散开的草叶 + 渐隐苔藓斑。 */
export function drawGrassRipple(ctx: CanvasRenderingContext2D, cx: number, cy: number, progress: number): void {
  const p = Math.max(0, Math.min(1, progress));
  const fade = decay(p * TIMING.MOSS_RIPPLE, TIMING.MOSS_RIPPLE);
  const r = 22 + p * 34;
  // 草叶：8 根向外倒伏
  ctx.save();
  ctx.globalAlpha = 0.7 * fade;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const len = r * (0.7 + noiseAt(i, 3) * 0.25);
    const pts: P[] = [
      { x: cx + Math.cos(a) * r * 0.28, y: cy + Math.sin(a) * r * 0.16 },
      { x: cx + Math.cos(a) * len * 0.7, y: cy + Math.sin(a) * len * 0.4 },
      { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len * 0.52 },
    ];
    strokeInk(ctx, pts, {
      width: 2.4, jitter: 0.9, color: tint(PALETTE.leafMid, 0.2, PALETTE.forestDeep), seedIndex: 21 + i,
    });
  }
  ctx.restore();
  drawMossLight(ctx, cx, cy, 16 + p * 20, 0.42 * fade, 31);
  drawRipple(ctx, cx, cy, r * 0.9, 0.3 * fade);
}

/**
 * 拖起时的淡箭头（§4.3：只有拖拽时出现，指向敌方半场；不画任何网格/连线到对位）。
 * `dirX` 为拖拽水平方向（-1/0/1），只影响箭头轻微倾斜。
 */
export function drawDeployArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  dirX: number,
  time: number,
  alpha?: number,
): void {
  const a = alpha === undefined ? 0.5 : alpha;
  const pulse = 0.75 + 0.25 * breathe(time, 900);
  const tilt = Math.max(-0.4, Math.min(0.4, dirX * 0.28));
  const len = 54;
  const tipX = fromX + tilt * len;
  const tipY = fromY - len;
  ctx.save();
  ctx.globalAlpha = a * pulse;
  strokeInk(ctx, [{ x: fromX, y: fromY - 6 }, { x: fromX + tilt * len * 0.5, y: fromY - len * 0.6 }, { x: tipX, y: tipY }], {
    width: 3, jitter: 1.1, color: PALETTE.creamMist, seedIndex: 41,
  });
  // 箭头头部：两笔手绘短划
  strokeInk(ctx, [{ x: tipX - 9, y: tipY + 12 }, { x: tipX, y: tipY }, { x: tipX + 9, y: tipY + 12 }], {
    width: 3, jitter: 0.9, color: PALETTE.creamMist, seedIndex: 42,
  });
  ctx.globalAlpha = a * pulse * 0.5;
  drawMossLight(ctx, fromX, fromY, 20, 0.5, 43);
  ctx.restore();
}

/** 圆角矩形的点集（水彩填充/描边都用它，保证和木牌形状一致）。 */
function roundedPts(x: number, y: number, w: number, h: number, r: number): P[] {
  const rr = Math.max(1, Math.min(r, h / 2, w / 2));
  const corners: [number, number, number, number][] = [
    [x + w - rr, y + rr, -Math.PI / 2, 0],
    [x + w - rr, y + h - rr, 0, Math.PI / 2],
    [x + rr, y + h - rr, Math.PI / 2, Math.PI],
    [x + rr, y + rr, Math.PI, Math.PI * 1.5],
  ];
  const out: P[] = [];
  for (let c = 0; c < corners.length; c++) {
    const cc = corners[c];
    for (let i = 0; i <= 4; i++) {
      const a = cc[2] + (cc[3] - cc[2]) * (i / 4);
      out.push({ x: cc[0] + Math.cos(a) * rr, y: cc[1] + Math.sin(a) * rr });
    }
  }
  return out;
}

/**
 * 小屋 HP 牌（目标图版式：浅木圆角牌 + 深绿「HP n/m」，没有血条）。
 * 血量越低字色越偏浆果红，仍然只靠文字传达数值。
 *
 * `opts.plate === false` 时只写数值、不画牌：新战斗底板上已经烘死了那块木牌
 * （art-src/ui-board-empty-16x9-01，x 136..250 / y 670..710），这时只需要把
 * 动态血量写在牌子正面。
 */
export function drawHouseHp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hp: number,
  maxHp: number,
  opts?: { plate?: boolean },
): void {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  if (opts === undefined || opts.plate !== false) {
    const pts = roundedPts(x, y, w, h, h * 0.34);
    fillWatercolor(ctx, pts, PALETTE.paper, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: 8 });
    woodGrain(ctx, x + 5, y + 4, w - 10, h - 8, 9);
    strokeInk(ctx, pts, { width: 2.4, close: true, color: PALETTE.bark, seedIndex: 10, jitter: 0.8 });
  }
  setFont(ctx, FONT.badge, 'bold');
  textOutlined(
    ctx,
    'HP ' + Math.round(hp) + '/' + Math.round(maxHp),
    x + w / 2,
    y + h * 0.52,
    FONT.badge,
    ratio < 0.3 ? PALETTE.berry : rgba(PALETTE.forestDeep, 0.95),
    'center',
    2,
    PALETTE.creamMist,
  );
}