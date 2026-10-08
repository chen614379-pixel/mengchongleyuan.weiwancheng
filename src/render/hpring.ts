/**
 * 血量环（§2.8）—— 动物身上唯一允许的血量表达（附录 D）。
 *
 * 规则（逐条对应规格）：
 * - R = bodyRadius + 8；线宽 5；圆头；起点 12 点、顺时针。
 * - 轨道 forestDeep @0.45，宽 2.5；满血环整体淡到 alpha 0.45。
 * - 颜色：>60% leafLight / 30~60% sunset / <30% berry。
 * - 弧线与线宽都带 ±0.8px 手绘抖动，禁止 `ctx.arc()` 直接出环。
 * - 幽灵弧 blossom @0.5（0.25s 内追上）；护盾弧在环外 +2px，stream 色，长度 = 护盾/30% 最大 HP。
 * - 每 25% 一个 1px inkSoft 刻痕（不是分隔线）；<30% 环呼吸 1.0→1.06 且外圈有浆果色水汽。
 * - 被指定为指令目标时，外圈一圈浆果色断续细点。
 * 矩形血条只允许出现在结算页堆叠条与详情页/小屋面板，本文件永不画条。
 */
import { LAYOUT } from '../config/layout';
import { HP_RING_COLOR, PALETTE, rgba, tint } from '../config/palette';
import { TIMING } from '../config/timing';
import { blobPath, fillWatercolor, noiseAt, strokeArcInk, strokeInk, tracePath, P } from '../ui/brush';
import { breathe, clamp01, cycle } from '../ui/ease';
import { FONT, setFont, textOutlined } from '../ui/theme';

const TAU = Math.PI * 2;
const START = -Math.PI / 2;

function ringColor(ratio: number): string {
  if (ratio > 0.6) return HP_RING_COLOR.high;
  if (ratio >= 0.3) return HP_RING_COLOR.mid;
  return HP_RING_COLOR.low;
}

/** 按血量比例取色（侧栏/详情页共用，避免各处重复判断）。 */
export function ringColorFor(ratio: number): string {
  return ringColor(ratio);
}

/** 濒死呼吸系数（0.6s 一个来回，1.0→1.06）。 */
function dangerScale(time: number): number {
  const t = cycle(time, TIMING.CRIT_RING_BREATH * 1000, 0);
  return 1 + 0.03 * (1 + Math.sin(t * TAU - Math.PI / 2));
}

/** 主环。radius 传 SPECIES[x].ringRadius（= bodyRadius + 8）。 */
export function drawHpRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  ratio: number,
  opts?: {
    width?: number;
    time?: number;
    ghostRatio?: number;
    shieldRatio?: number;
    alpha?: number;
    seedIndex?: number;
    notch?: boolean;
    danger?: boolean;
    ghostInfo?: boolean;
    commandTarget?: boolean;
    shieldPulse?: number;
  },
): void {
  const o = opts || {};
  const time = o.time === undefined ? 0 : o.time;
  const width = o.width === undefined ? LAYOUT.RING.width : o.width;
  const baseAlpha = o.alpha === undefined ? 1 : o.alpha;
  const seed = o.seedIndex === undefined ? 0 : o.seedIndex;
  const r0 = clamp01(ratio);
  const danger = o.danger === undefined ? r0 < TIMING.TRAIT_CLAW_THRESHOLD : !!o.danger;
  if (baseAlpha <= 0.01 || radius <= 0) return;

  const r = danger ? radius * dangerScale(time) : radius;
  const idleFull = r0 >= 0.999;
  const alpha = baseAlpha * (idleFull ? 0.45 : 1);

  // 轨道
  ctx.save();
  ctx.globalAlpha = alpha * 0.45;
  strokeArcInk(ctx, cx, cy, r, START, START + TAU, HP_RING_COLOR.track, LAYOUT.RING.trackWidth, 0.5, seed + 1, 0);
  ctx.restore();

  // 幽灵弧（掉血后落在背后，0.25s 内追上）
  const ghost = o.ghostRatio === undefined ? r0 : clamp01(o.ghostRatio);
  if (ghost > r0 + 0.01) {
    ctx.save();
    ctx.globalAlpha = alpha * LAYOUT.RING.ghostAlpha;
    const color = o.ghostInfo ? tint(PALETTE.twilight, 0.2, PALETTE.creamMist) : HP_RING_COLOR.ghost;
    strokeArcInk(ctx, cx, cy, r, START + r0 * TAU, START + ghost * TAU, color, width * 0.9, 0.8, seed + 5, 0.5);
    ctx.restore();
  }

  // 主弧
  if (r0 > 0.004) {
    const color = o.ghostInfo ? tint(PALETTE.twilight, 0.1, PALETTE.creamMist) : ringColor(r0);
    ctx.save();
    ctx.globalAlpha = alpha * (o.ghostInfo ? 0.72 : 1);
    strokeArcInk(ctx, cx, cy, r, START, START + r0 * TAU, color, width, 0.8, seed + 9, 0.6);
    ctx.restore();
  }

  // 刻痕：每 25% 一格，1px inkSoft，不画分隔线
  if (o.notch !== false) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    for (let i = 1; i <= 3; i++) {
      const a = START + i * TIMING.RING_NOTCH_STEP * TAU;
      strokeInk(
        ctx,
        [
          { x: cx + Math.cos(a) * (r - width * 0.6), y: cy + Math.sin(a) * (r - width * 0.6) },
          { x: cx + Math.cos(a) * (r + width * 0.6), y: cy + Math.sin(a) * (r + width * 0.6) },
        ],
        { width: LAYOUT.RING.notchW, jitter: 0.2, color: PALETTE.inkSoft, seedIndex: seed + 13 + i },
      );
    }
    ctx.restore();
  }

  // 护盾弧：环外 +2px，长度 = 护盾 / 30% 最大 HP
  const shield = o.shieldRatio === undefined ? 0 : clamp01(o.shieldRatio);
  if (shield > 0.01) {
    const rs = r + width / 2 + 2;
    const span = shield * TAU;
    const pulse = o.shieldPulse === undefined ? 0 : o.shieldPulse;
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    const pts: P[] = [];
    const steps = Math.max(8, Math.ceil((span / TAU) * 40));
    for (let i = 0; i <= steps; i++) {
      const a = START + (i / steps) * span;
      const wob = Math.sin(a * 6 + time / 240) * 1.4 + noiseAt(i, seed + 17) * 0.8;
      pts.push({ x: cx + Math.cos(a) * (rs + wob + pulse * 3), y: cy + Math.sin(a) * (rs + wob + pulse * 3) });
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = HP_RING_COLOR.shield;
    ctx.lineWidth = width * 0.55;
    tracePath(ctx, pts, false);
    ctx.stroke();
    ctx.restore();
  }

  // 濒死水汽：环外一圈浆果色水彩雾
  if (danger) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.3 * breathe(time, 700);
    ctx.fillStyle = HP_RING_COLOR.low;
    blobPath(ctx, cx - r * 1.28, cy - r * 1.0, r * 2.56, r * 2.0, 1.5, seed + 21);
    ctx.fill();
    ctx.restore();
  }

  // 指令目标：外圈断续浆果色细点
  if (o.commandTarget) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    const rr = r + width + 4;
    for (let i = 0; i < 12; i++) {
      const a = START + (i / 12) * TAU + time / 2400;
      ctx.strokeStyle = HP_RING_COLOR.low;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      ctx.lineTo(cx + Math.cos(a + 0.13) * rr, cy + Math.sin(a + 0.13) * rr);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** 侧栏头像环：radius 24 / 线宽 3，规则与主环一致（ghost 用于「上回合情报」）。 */
export function drawSidebarRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ratio: number,
  time: number,
  seedIndex?: number,
  ghost?: boolean,
): void {
  const seed = seedIndex === undefined ? 0 : seedIndex;
  const rr = clamp01(ratio);
  ctx.save();
  ctx.globalAlpha = 0.45;
  strokeArcInk(ctx, cx, cy, r, START, START + TAU, HP_RING_COLOR.track, LAYOUT.RING.trackWidth, 0.4, seed + 1, 0);
  ctx.restore();
  if (rr > 0.004) {
    ctx.save();
    ctx.globalAlpha = ghost ? 0.6 : 0.95;
    const color = ghost ? tint(PALETTE.twilight, 0.15, PALETTE.creamMist) : ringColor(rr);
    strokeArcInk(ctx, cx, cy, r, START, START + rr * TAU, color, LAYOUT.RING.sidebarWidth, 0.6, seed + 3, 0.4);
    ctx.restore();
  }
  // 满血时也保留一点呼吸，让侧栏不是死图
  if (rr >= 0.999 && breathe(time, 2200) > 0.5) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    strokeArcInk(ctx, cx, cy, r + 1.5, START, START + TAU, PALETTE.creamMist, 1.6, 0.5, seed + 7, 0);
    ctx.restore();
  }
}

/** 状态图标：环的右下起（30°）顺时针排布，间隔 24px，最多 max 个，多余显示 +N。 */
export function drawStatusIcons(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  statuses: string[],
  max?: number,
): void {
  if (!statuses || statuses.length === 0 || radius <= 0) return;
  const limit = max === undefined ? 3 : max;
  const gapAng = 24 / Math.max(24, radius + 10);
  let a = Math.PI / 6;
  const shown = Math.min(limit, statuses.length);
  for (let i = 0; i < shown; i++) {
    const px = cx + Math.cos(a) * (radius + 10);
    const py = cy + Math.sin(a) * (radius + 10);
    drawStatusIcon(ctx, px, py, 10, statuses[i], i);
    a += gapAng;
  }
  if (statuses.length > limit) {
    const px = cx + Math.cos(a) * (radius + 10);
    const py = cy + Math.sin(a) * (radius + 10);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = PALETTE.creamMist;
    blobPath(ctx, px - 11, py - 11, 22, 22, 0.8, 61);
    ctx.fill();
    strokeInk(ctx, circlePts(px, py, 11), { width: 1.8, close: true, seedIndex: 62 });
    textOutlined(ctx, '+' + (statuses.length - limit), px, py + 1, FONT.badge, PALETTE.inkSoft, 'center', 1.6);
    ctx.restore();
  }
}

function circlePts(cx: number, cy: number, r: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    out.push({ x: cx + Math.cos(a) * r * (1 + noiseAt(i, 3) * 0.06), y: cy + Math.sin(a) * r * (1 + noiseAt(i + 5, 3) * 0.06) });
  }
  return out;
}

/** 单个状态小图标（全部手绘，禁止 emoji）。 */
export function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  key: string,
  seedIndex?: number,
): void {
  const seed = seedIndex === undefined ? 0 : seedIndex;
  ctx.save();
  // 纸白底 + 墨边（放在环外时保证可读）
  ctx.globalAlpha = 0.94;
  fillWatercolor(ctx, circlePts(cx, cy, r), PALETTE.creamMist, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seed + 1 });
  strokeInk(ctx, circlePts(cx, cy, r), { width: 1.8, close: true, seedIndex: seed + 2 });

  const c = statusColor(key);
  if (key === 'bleed' || key === 'poisonFang') {
    // 血滴
    fillWatercolor(ctx, droplet(cx, cy, r * 0.62), c, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed + 3 });
    strokeInk(ctx, droplet(cx, cy, r * 0.62), { width: 1.4, close: true, seedIndex: seed + 4 });
  } else if (key === 'regen' || key === 'morningDew') {
    drawLeafGlyph(ctx, cx, cy, r * 1.2, -0.5, c, seed);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = PALETTE.stream;
    ctx.beginPath();
    ctx.arc(cx + r * 0.32, cy + r * 0.3, r * 0.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (key === 'shield') {
    strokeArcInk(ctx, cx, cy, r * 0.55, START, START + TAU, c, 2.6, 0.5, seed + 5, 0.3);
  } else if (key === 'crit' || key === 'sharpClaw' || key === 'clover') {
    // 三道爪痕
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * r * 0.34;
      strokeInk(ctx, [{ x: cx + ox - r * 0.12, y: cy - r * 0.5 }, { x: cx + ox + r * 0.16, y: cy + r * 0.5 }], {
        width: 1.8, jitter: 0.5, color: c, seedIndex: seed + 10 + i,
      });
    }
  } else if (key === 'mossArmor' || key === 'thornSpike') {
    fillWatercolor(ctx, circlePts(cx, cy, r * 0.5), c, { alpha: 0.9, layers: 2, wetEdge: true, seedIndex: seed + 6 });
    strokeInk(ctx, circlePts(cx, cy, r * 0.5), { width: 1.4, close: true, seedIndex: seed + 7 });
    if (key === 'thornSpike') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        strokeInk(ctx, [
          { x: cx + Math.cos(a) * r * 0.5, y: cy + Math.sin(a) * r * 0.5 },
          { x: cx + Math.cos(a) * r * 0.95, y: cy + Math.sin(a) * r * 0.95 },
        ], { width: 1.6, jitter: 0.3, color: PALETTE.inkSoft, seedIndex: seed + 20 + i });
      }
    }
  } else if (key === 'swiftFeet') {
    for (let i = 0; i < 3; i++) {
      const pts: P[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push({ x: cx - r * 0.5 + t * r * 1.0, y: cy - r * 0.3 + i * r * 0.3 + Math.sin(t * Math.PI) * r * 0.16 });
      }
      strokeInk(ctx, pts, { width: 1.6, jitter: 0.4, color: c, seedIndex: seed + 30 + i });
    }
  } else if (key === 'roar') {
    strokeArcInk(ctx, cx, cy, r * 0.34, START + 0.6, START + TAU - 0.6, c, 2.2, 0.5, seed + 8, 0.3);
    strokeArcInk(ctx, cx, cy, r * 0.62, START + 0.9, START + TAU - 0.9, c, 1.8, 0.5, seed + 9, 0.3);
  } else {
    // 兜底：一片叶
    drawLeafGlyph(ctx, cx, cy, r * 1.25, -0.9, c, seed + 11);
  }
  ctx.restore();
}

/** 状态主题色（不新增色板，全部取自 PALETTE）。 */
function statusColor(key: string): string {
  if (key === 'bleed' || key === 'poisonFang') return PALETTE.berry;
  if (key === 'regen' || key === 'morningDew') return PALETTE.leafLight;
  if (key === 'shield') return PALETTE.stream;
  if (key === 'mossArmor' || key === 'thornSpike') return PALETTE.leafMid;
  if (key === 'swiftFeet') return PALETTE.skyWarm;
  if (key === 'roar') return PALETTE.sunset;
  return PALETTE.sunbeam;
}

function droplet(cx: number, cy: number, r: number): P[] {
  const pts: P[] = [];
  pts.push({ x: cx, y: cy - r });
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + Math.PI + (i / 12) * TAU * 0.75;
    pts.push({ x: cx + Math.cos(a) * r * 0.86, y: cy + Math.sin(a) * r * 0.86 + r * 0.2 });
  }
  return pts;
}

function drawLeafGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  angle: number,
  color: string,
  seed: number,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pts: P[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const half = Math.sin(t * Math.PI) * len * 0.32;
    pts.push({ x: cx + cos * (t - 0.5) * len - sin * half, y: cy + sin * (t - 0.5) * len + cos * half });
  }
  for (let i = 10; i >= 0; i--) {
    const t = i / 10;
    const half = Math.sin(t * Math.PI) * len * 0.32;
    pts.push({ x: cx + cos * (t - 0.5) * len + sin * half, y: cy + sin * (t - 0.5) * len - cos * half });
  }
  fillWatercolor(ctx, pts, color, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed + 12 });
  strokeInk(ctx, pts, { width: 1.4, close: true, seedIndex: seed + 13 });
}

/** 侧栏/详情页血量数字（20px 起，右对齐给侧栏用；这不是血条）。 */
export function drawHpNumber(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hp: number,
  size: number,
  color?: string,
): void {
  textOutlined(ctx, String(Math.max(0, Math.round(hp))), x, y, size, color || PALETTE.inkSoft, 'right', 2);
}

/** 详情页/提示用：把 HP 变化量润色成「-128」这类文本色。 */
export function deltaColor(delta: number): string {
  return delta >= 0 ? PALETTE.leafLight : PALETTE.berry;
}

/** 侧栏 20px 数字的推荐字号（避免调用方写魔法值）。 */
export const SIDEBAR_HP_SIZE = 20;
export const HP_TEXT_COLOR = PALETTE.inkSoft;

/** 环上加一层薄纸纹，避免数字化纯色弧（调用方在 HUD 层可选调用）。 */
export function ringPaperHint(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = rgba(PALETTE.creamMist, 0.6);
  blobPath(ctx, cx - r * 0.6, cy - r * 0.75, r * 1.2, r * 0.5, 1.2, 5);
  ctx.fill();
  ctx.restore();
  setFont(ctx, FONT.badge, 'normal');
}