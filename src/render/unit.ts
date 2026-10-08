/**
 * 动物立绘（棋子本体）+ 血量环挂载（§2.6 / §2.7 / §2.8）。
 *
 * 两条硬约束：
 * 1. 棋盘上的动物**不带边框、不带底座、不带矩形血条**：只有本体 + 一圈环（附录 D）。
 * 2. 没有贴图时必须靠程序化手绘也能一眼分辨 8 个物种：体型 / 耳形 / 尾巴 / 花纹
 *    按 species 区分，主题色取 `SPECIES_THEME`。营地闲逛的动物也走这里（`showRing:false`）。
 *
 * 走路的上下起伏是程序化骨骼动画（2.5Hz、幅度为体高 6%、四肢滞后 0.12s），
 * 攻击/受击/死亡用姿态形变表达，不依赖序列帧。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE, tint } from '../config/palette';
import { SPECIES, SPECIES_THEME, SpeciesId, Level } from '../config/species';
import { TIMING } from '../config/timing';
import { blobPath, fillWatercolor, noiseAt, strokeInk, tracePath, P } from '../ui/brush';
import { clamp01, easeOutBack, easeOutCubic, smoothstep } from '../ui/ease';
import { drawFirefly, drawFlower, drawSoftGroundShadow, drawVine } from './paint';
import { getImage } from './assets';
import { drawHpRing, drawStatusIcons } from './hpring';

const TAU = Math.PI * 2;

export interface UnitView {
  id: number;
  species: SpeciesId;
  level: number;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
  fx?: {
    hitFlash?: number;
    attackPulse?: number;
    deathFirefly?: number;
    counterHit?: number;
    shieldRipple?: number;
    hitDir?: number;
  };
}

export interface UnitDrawOpts {
  x: number;
  y: number;
  time: number;
  scale?: number;
  facing?: 1 | -1;
  showRing?: boolean;
  selected?: boolean;
  dim?: boolean;
  dragging?: boolean;
  ghost?: boolean;
  alpha?: number;
  statuses?: string[];
  ghostHp?: number;
  hpSync?: number;
  pose?: 'idle' | 'attack' | 'hurt';
  commandTarget?: boolean;
  showShadow?: boolean;
}

function rnd(i: number, seed: number): number {
  return (noiseAt(i, seed) + 1) / 2;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, seed: number, wob?: number): P[] {
  const w = wob === undefined ? 0.07 : wob;
  const pts: P[] = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + noiseAt(i, seed) * w;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

function rectPts(x: number, y: number, w: number, h: number): P[] {
  return [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ];
}

/** 物种体型推荐半径（渲染像素，1 级）。 */
export function speciesBodyRadius(species: SpeciesId): number {
  return SPECIES[species].bodyRadius;
}

/** 物种立绘近似高度（供场景排版/命中测试用）。 */
export function speciesHeight(species: SpeciesId, scale: number): number {
  return SPECIES[species].bodyRadius * 2.5 * scale;
}

interface Paint {
  fill(pts: P[], color: string, alpha?: number): void;
  ink(pts: P[], width?: number, color?: string): void;
}

function makePaint(ctx: CanvasRenderingContext2D, tone: string | null, seedBase: number): Paint {
  let n = 0;
  return {
    fill: function (pts: P[], color: string, alpha?: number): void {
      fillWatercolor(ctx, pts, tone || color, {
        alpha: alpha === undefined ? 0.95 : alpha,
        layers: 2,
        wetEdge: true,
        seedIndex: seedBase + n++,
      });
    },
    ink: function (pts: P[], width?: number, color?: string): void {
      if (tone) return; // 剪影/闪白模式下不描边
      strokeInk(ctx, pts, {
        width: width === undefined ? 2.6 : width,
        close: true,
        color: color || PALETTE.inkSoft,
        jitter: 1.0,
        seedIndex: seedBase + n++,
      });
    },
  };
}

interface Figure {
  hx: number;
  hy: number;
  hr: number;
  frontLegX: number;
  frontLegY: number;
}

interface PoseCtx {
  ctx: CanvasRenderingContext2D;
  u: number;
  cx: number;
  groundY: number;
  time: number;
  pose: 'idle' | 'attack' | 'hurt';
  seed: number;
}

/** 四条腿（前后各两条，滞后摆动）。 */
function legs(p: Paint, c: PoseCtx, bodyY: number, bodyRy: number, color: string, thick: number): void {
  const phase = (c.time / 1000) * TIMING.RUN_BOB_HZ * TAU;
  const swing = Math.sin(phase) * 0.34;
  const lag = Math.sin(phase - TIMING.LIMB_LAG * TAU) * 0.34;
  const backX = -c.u * 0.62;
  const frontX = c.u * 0.62;
  const legLen = bodyRy * 0.95;
  // 后腿（先画，压在身体后面）
  legsOne(p, c, c.cx + backX, bodyY + bodyRy * 0.35, legLen, thick, swing, color, true);
  legsOne(p, c, c.cx + frontX, bodyY + bodyRy * 0.36, legLen, thick, lag, color, true);
}

function legsOne(
  p: Paint,
  c: PoseCtx,
  x: number,
  y: number,
  len: number,
  thick: number,
  swing: number,
  color: string,
  back: boolean,
): void {
  const pts: P[] = [
    { x: x - thick * 0.5, y: y },
    { x: x + swing * len * 0.4 - thick * 0.45, y: y + len * 0.55 },
    { x: x + swing * len * 0.8 - thick * 0.4, y: y + len },
    { x: x + swing * len * 0.8 + thick * 0.72, y: y + len },
    { x: x + swing * len * 0.4 + thick * 0.62, y: y + len * 0.55 },
    { x: x + thick * 0.62, y: y },
  ];
  p.fill(pts, color, back ? 0.9 : 0.98);
  if (!back) p.ink(pts, 2.2);
}

/** 眼睛（Ghibli 幼态：大眼 + 高光点 + 腮红）。 */
function face(
  p: Paint,
  c: PoseCtx,
  hx: number,
  hy: number,
  hr: number,
  eyeGap: number,
  eyeY: number,
  eyeR: number,
  closed?: boolean,
): void {
  const ctx = c.ctx;
  // 腮红
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = PALETTE.blossom;
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath();
    ctx.arc(hx + i * (eyeGap + hr * 0.34), hy + eyeY + eyeR * 1.6, hr * 0.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  for (let i = -1; i <= 1; i += 2) {
    const ex = hx + i * eyeGap;
    const ey = hy + eyeY;
    if (closed) {
      p.ink(
        [
          { x: ex - eyeR * 0.9, y: ey },
          { x: ex, y: ey + eyeR * 0.55 },
          { x: ex + eyeR * 0.9, y: ey },
        ],
        2.0,
      );
      continue;
    }
    p.fill(ellipsePts(ex, ey, eyeR, eyeR * 1.15, c.seed + i * 3, 0.05), PALETTE.inkSoft, 1);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = PALETTE.paper;
    ctx.beginPath();
    ctx.arc(ex + eyeR * 0.3, ey - eyeR * 0.4, eyeR * 0.32, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** 象：灰皮、巨扇耳、长鼻、短牙、粗腿。 */
function elephant(p: Paint, c: PoseCtx, theme: string): Figure {
  const ctx = c.ctx;
  const u = c.u;
  const by = c.groundY - u * 1.28;
  const bodyRy = u * 0.98;
  legs(p, c, by + bodyRy * 0.4, bodyRy, tint(theme, 0.22, PALETTE.forestDeep), u * 0.42);
  // 身体
  p.fill(ellipsePts(c.cx, by, u * 1.42, bodyRy, c.seed, 0.06), theme, 0.98);
  p.ink(ellipsePts(c.cx, by, u * 1.42, bodyRy, c.seed + 1, 0.06), 2.8);
  // 耳朵：两片大扇形
  for (let i = -1; i <= 1; i += 2) {
    const ex = c.cx + i * u * 0.86;
    const ey = by - u * 0.34;
    const pts: P[] = [];
    for (let k = 0; k <= 12; k++) {
      const a = -0.9 + (k / 12) * 2.6;
      pts.push({ x: ex + i * Math.cos(a) * u * 0.72, y: ey + Math.sin(a) * u * 0.62 });
    }
    p.fill(pts, tint(theme, 0.18, PALETTE.creamMist), 0.96);
    p.ink(pts, 2.4, tint(theme, 0.5, PALETTE.inkSoft));
  }
  // 头
  const hx = c.cx;
  const hy = by - u * 0.55;
  const hr = u * 0.78;
  p.fill(ellipsePts(hx, hy, hr, hr * 0.92, c.seed + 5, 0.06), theme, 0.98);
  p.ink(ellipsePts(hx, hy, hr, hr * 0.92, c.seed + 6, 0.06), 2.8);
  // 鼻子：下垂的长钩
  const trunk: P[] = [
    { x: hx + u * 0.06, y: hy + hr * 0.5 },
    { x: hx + u * 0.3, y: hy + hr * 1.1 },
    { x: hx + u * 0.42, y: hy + hr * 1.8 },
    { x: hx + u * 0.2, y: hy + hr * 2.15 },
    { x: hx - u * 0.08, y: hy + hr * 1.95 },
    { x: hx - u * 0.1, y: hy + hr * 1.2 },
    { x: hx - u * 0.16, y: hy + hr * 0.5 },
  ];
  p.fill(trunk, tint(theme, 0.1, PALETTE.creamMist), 0.98);
  p.ink(trunk, 2.2);
  // 牙
  for (let i = -1; i <= 1; i += 2) {
    p.fill(
      [
        { x: hx + i * u * 0.26, y: hy + hr * 0.62 },
        { x: hx + i * u * 0.34, y: hy + hr * 1.05 },
        { x: hx + i * u * 0.2, y: hy + hr * 0.66 },
      ],
      PALETTE.creamMist,
      0.98,
    );
  }
  face(p, c, hx, hy, hr, hr * 0.42, -hr * 0.08, hr * 0.15);
  return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.62, frontLegY: by + bodyRy * 0.9 };
}

/** 狮：鬃毛环 + 棕黄身体 + 带穗尾。 */
function lion(p: Paint, c: PoseCtx, theme: string): Figure {
  const ctx = c.ctx;
  const u = c.u;
  const by = c.groundY - u * 1.18;
  const bodyRy = u * 0.85;
  legs(p, c, by + bodyRy * 0.36, bodyRy, tint(theme, 0.24, PALETTE.soil), u * 0.32);
  p.fill(ellipsePts(c.cx, by, u * 1.3, bodyRy, c.seed, 0.06), theme, 0.98);
  p.ink(ellipsePts(c.cx, by, u * 1.3, bodyRy, c.seed + 1, 0.06), 2.8);
  // 尾巴 + 穗
  const tailPhase = Math.sin((c.time / 1000) * 2.4) * 0.28;
  const tail: P[] = [
    { x: c.cx - u * 1.2, y: by - u * 0.2 },
    { x: c.cx - u * 1.8, y: by - u * 0.5 + tailPhase * u * 0.5 },
    { x: c.cx - u * 2.1, y: by - u * 0.9 + tailPhase * u },
  ];
  p.ink(tail, 3.2, tint(theme, 0.35, PALETTE.soil));
  p.fill(ellipsePts(c.cx - u * 2.15, by - u * 1.0 + tailPhase * u, u * 0.28, u * 0.32, c.seed + 9, 0.1), tint(theme, 0.1, PALETTE.soil), 0.98);
  // 头 + 鬃毛
  const hx = c.cx + u * 0.06;
  const hy = by - u * 0.62;
  const hr = u * 0.66;
  const mane: P[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const rr = hr * (1.42 + rnd(i, c.seed + 3) * 0.22);
    mane.push({ x: hx + Math.cos(a) * rr, y: hy + Math.sin(a) * rr * 0.95 });
  }
  p.fill(mane, PALETTE.sunset, 0.95);
  p.ink(mane, 2.4, tint(PALETTE.sunset, 0.45, PALETTE.inkSoft));
  p.fill(ellipsePts(hx, hy, hr, hr * 0.94, c.seed + 11, 0.06), tint(theme, 0.16, PALETTE.creamMist), 0.98);
  p.ink(ellipsePts(hx, hy, hr, hr * 0.94, c.seed + 12, 0.06), 2.6);
  // 口鼻
  p.fill(ellipsePts(hx + hr * 0.42, hy + hr * 0.28, hr * 0.34, hr * 0.26, c.seed + 13, 0.08), PALETTE.creamMist, 0.95);
  p.fill(ellipsePts(hx + hr * 0.62, hy + hr * 0.2, hr * 0.11, hr * 0.09, c.seed + 14, 0.05), PALETTE.inkSoft, 1);
  face(p, c, hx, hy, hr, hr * 0.34, -hr * 0.18, hr * 0.13);
  return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.62, frontLegY: by + bodyRy * 0.8 };
}

/** 虎：橙底黑纹、圆耳、环纹长尾。 */
function tiger(p: Paint, c: PoseCtx, theme: string): Figure {
  const ctx = c.ctx;
  const u = c.u;
  const by = c.groundY - u * 1.1;
  const bodyRy = u * 0.8;
  legs(p, c, by + bodyRy * 0.36, bodyRy, tint(theme, 0.2, PALETTE.soil), u * 0.3);
  p.fill(ellipsePts(c.cx, by, u * 1.24, bodyRy, c.seed, 0.06), theme, 0.98);
  // 虎纹：身体三道弧 + 额头纹
  for (let i = 0; i < 3; i++) {
    const bx = c.cx - u * 0.5 + i * u * 0.55;
    p.ink(
      [
        { x: bx, y: by - bodyRy * 0.86 },
        { x: bx + u * 0.06, y: by - bodyRy * 0.2 },
        { x: bx - u * 0.02, y: by + bodyRy * 0.5 },
      ],
      2.6,
      PALETTE.inkSoft,
    );
  }
  p.ink(ellipsePts(c.cx, by, u * 1.24, bodyRy, c.seed + 1, 0.06), 2.8);
  // 尾巴（带环）
  const tw = Math.sin((c.time / 1000) * 2.2) * 0.3;
  const tailPts: P[] = [
    { x: c.cx - u * 1.1, y: by - u * 0.1 },
    { x: c.cx - u * 1.7, y: by - u * 0.55 + tw * u * 0.6 },
    { x: c.cx - u * 2.0, y: by - u * 1.05 + tw * u },
  ];
  p.ink(tailPts, 3.4, theme);
  for (let i = 0; i < 3; i++) {
    const t = 0.35 + i * 0.22;
    p.ink(
      [
        { x: c.cx - u * (1.1 + t * 0.9), y: by - u * (0.1 + t * 0.95) + tw * u * t - u * 0.12 },
        { x: c.cx - u * (1.1 + t * 0.9), y: by - u * (0.1 + t * 0.95) + tw * u * t + u * 0.12 },
      ],
      2.4,
      PALETTE.inkSoft,
    );
  }
  const hx = c.cx + u * 0.08;
  const hy = by - u * 0.6;
  const hr = u * 0.62;
  // 耳朵
  for (let i = -1; i <= 1; i += 2) {
    const pts = ellipsePts(hx + i * hr * 0.72, hy - hr * 0.52, hr * 0.26, hr * 0.3, c.seed + i * 5, 0.08);
    p.fill(pts, theme, 0.98);
    p.ink(pts, 2.2);
    p.fill(ellipsePts(hx + i * hr * 0.72, hy - hr * 0.5, hr * 0.13, hr * 0.16, c.seed + i * 7, 0.06), PALETTE.blossom, 0.7);
  }
  p.fill(ellipsePts(hx, hy, hr, hr * 0.92, c.seed + 21, 0.06), theme, 0.98);
  p.ink(ellipsePts(hx, hy, hr, hr * 0.92, c.seed + 22, 0.06), 2.6);
  // 额头「王」字纹
  p.ink([{ x: hx - hr * 0.3, y: hy - hr * 0.5 }, { x: hx + hr * 0.3, y: hy - hr * 0.5 }], 2.2, PALETTE.inkSoft);
  p.ink([{ x: hx, y: hy - hr * 0.56 }, { x: hx, y: hy - hr * 0.2 }], 2.2, PALETTE.inkSoft);
  p.fill(ellipsePts(hx + hr * 0.44, hy + hr * 0.26, hr * 0.24, hr * 0.18, c.seed + 23, 0.08), PALETTE.creamMist, 0.95);
  p.fill(ellipsePts(hx + hr * 0.58, hy + hr * 0.16, hr * 0.1, hr * 0.08, c.seed + 24, 0.05), PALETTE.inkSoft, 1);
  face(p, c, hx, hy, hr, hr * 0.33, -hr * 0.14, hr * 0.13);
  return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.58, frontLegY: by + bodyRy * 0.8 };
}

/** 豹：细长身形 + 斑点 + 长尾。 */
function leopard(p: Paint, c: PoseCtx, theme: string): Figure {
  const ctx = c.ctx;
  const u = c.u;
  const by = c.groundY - u * 1.02;
  const bodyRy = u * 0.72;
  legs(p, c, by + bodyRy * 0.36, bodyRy, tint(theme, 0.24, PALETTE.soil), u * 0.26);
  p.fill(ellipsePts(c.cx, by, u * 1.3, bodyRy, c.seed, 0.06), theme, 0.98);
  // 斑点：两排玫瑰斑
  for (let i = 0; i < 7; i++) {
    const bx = c.cx - u * 0.9 + i * u * 0.3;
    const byy = by - bodyRy * 0.3 + (i % 2) * bodyRy * 0.5;
    p.ink(ellipsePts(bx, byy, u * 0.1, u * 0.08, c.seed + i * 3, 0.1), 2.0, tint(PALETTE.inkSoft, 0.2, theme));
  }
  p.ink(ellipsePts(c.cx, by, u * 1.3, bodyRy, c.seed + 1, 0.06), 2.8);
  const tw = Math.sin((c.time / 1000) * 2.6) * 0.34;
  p.ink(
    [
      { x: c.cx - u * 1.15, y: by - u * 0.1 },
      { x: c.cx - u * 1.9, y: by - u * 0.5 + tw * u * 0.7 },
      { x: c.cx - u * 2.2, y: by - u * 1.0 + tw * u * 1.2 },
    ],
    3.0,
    theme,
  );
  const hx = c.cx + u * 0.16;
  const hy = by - u * 0.56;
  const hr = u * 0.58;
  for (let i = -1; i <= 1; i += 2) {
    const pts = ellipsePts(hx + i * hr * 0.68, hy - hr * 0.5, hr * 0.22, hr * 0.26, c.seed + i * 5, 0.08);
    p.fill(pts, theme, 0.98);
    p.ink(pts, 2.0);
  }
  p.fill(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 31, 0.06), theme, 0.98);
  p.ink(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 32, 0.06), 2.6);
  for (let i = 0; i < 3; i++) {
    p.ink(ellipsePts(hx - hr * 0.2 + i * hr * 0.28, hy - hr * 0.5, hr * 0.08, hr * 0.07, c.seed + 33 + i, 0.1), 1.8, PALETTE.inkSoft);
  }
  p.fill(ellipsePts(hx + hr * 0.46, hy + hr * 0.24, hr * 0.22, hr * 0.16, c.seed + 37, 0.08), PALETTE.creamMist, 0.95);
  p.fill(ellipsePts(hx + hr * 0.6, hy + hr * 0.16, hr * 0.09, hr * 0.07, c.seed + 38, 0.05), PALETTE.inkSoft, 1);
  face(p, c, hx, hy, hr, hr * 0.32, -hr * 0.12, hr * 0.12);
  return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.6, frontLegY: by + bodyRy * 0.8 };
}

/** 狼：灰毛、尖立耳、蓬松尾、长吻。 */
function wolf(p: Paint, c: PoseCtx, theme: string): Figure {
  const ctx = c.ctx;
  const u = c.u;
  const by = c.groundY - u * 1.02;
  const bodyRy = u * 0.72;
  legs(p, c, by + bodyRy * 0.36, bodyRy, tint(theme, 0.3, PALETTE.forestDeep), u * 0.26);
  p.fill(ellipsePts(c.cx, by, u * 1.26, bodyRy, c.seed, 0.06), theme, 0.98);
  // 背鬃
  p.fill(
    [
      { x: c.cx - u * 0.7, y: by - bodyRy * 0.92 },
      { x: c.cx - u * 0.2, y: by - bodyRy * 1.3 },
      { x: c.cx + u * 0.4, y: by - bodyRy * 0.86 },
    ],
    tint(theme, 0.32, PALETTE.forestDeep),
    0.95,
  );
  p.ink(ellipsePts(c.cx, by, u * 1.26, bodyRy, c.seed + 1, 0.06), 2.8);
  // 蓬松尾
  const tw = Math.sin((c.time / 1000) * 3.2) * 0.3;
  const tail = ellipsePts(c.cx - u * 1.5, by - u * 0.42 + tw * u * 0.4, u * 0.52, u * 0.28, c.seed + 3, 0.14);
  p.fill(tail, tint(theme, 0.22, PALETTE.creamMist), 0.98);
  p.ink(tail, 2.4);
  const hx = c.cx + u * 0.2;
  const hy = by - u * 0.58;
  const hr = u * 0.6;
  // 尖耳
  for (let i = -1; i <= 1; i += 2) {
    const ex = hx + i * hr * 0.58;
    const ear: P[] = [
      { x: ex - i * hr * 0.26, y: hy - hr * 0.5 },
      { x: ex + i * hr * 0.14, y: hy - hr * 1.32 },
      { x: ex + i * hr * 0.42, y: hy - hr * 0.42 },
    ];
    p.fill(ear, theme, 0.98);
    p.ink(ear, 2.2);
    p.fill(
      [
        { x: ex - i * hr * 0.14, y: hy - hr * 0.55 },
        { x: ex + i * hr * 0.1, y: hy - hr * 1.1 },
        { x: ex + i * hr * 0.28, y: hy - hr * 0.5 },
      ],
      PALETTE.blossom,
      0.55,
    );
  }
  p.fill(ellipsePts(hx, hy, hr, hr * 0.88, c.seed + 41, 0.06), theme, 0.98);
  p.ink(ellipsePts(hx, hy, hr, hr * 0.88, c.seed + 42, 0.06), 2.6);
  // 长吻
  p.fill(ellipsePts(hx + hr * 0.5, hy + hr * 0.3, hr * 0.4, hr * 0.24, c.seed + 43, 0.08), tint(theme, 0.2, PALETTE.creamMist), 0.96);
  p.fill(ellipsePts(hx + hr * 0.78, hy + hr * 0.24, hr * 0.12, hr * 0.1, c.seed + 44, 0.05), PALETTE.inkSoft, 1);
  face(p, c, hx, hy, hr, hr * 0.36, -hr * 0.16, hr * 0.13);
  return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.58, frontLegY: by + bodyRy * 0.8 };
}

/** 狗：棕毛、垂耳、卷尾、吐舌。 */
function dog(p: Paint, c: PoseCtx, theme: string): Figure {
  const ctx = c.ctx;
  const u = c.u;
  const by = c.groundY - u * 0.98;
  const bodyRy = u * 0.7;
  legs(p, c, by + bodyRy * 0.36, bodyRy, tint(theme, 0.24, PALETTE.soil), u * 0.26);
  p.fill(ellipsePts(c.cx, by, u * 1.2, bodyRy, c.seed, 0.06), theme, 0.98);
  // 胸前白毛
  p.fill(ellipsePts(c.cx + u * 0.6, by + bodyRy * 0.2, u * 0.42, bodyRy * 0.5, c.seed + 2, 0.1), PALETTE.creamMist, 0.9);
  p.ink(ellipsePts(c.cx, by, u * 1.2, bodyRy, c.seed + 1, 0.06), 2.8);
  // 卷尾（快摇）
  const wag = Math.sin((c.time / 1000) * 6.4) * 0.5;
  p.ink(
    [
      { x: c.cx - u * 1.05, y: by - u * 0.3 },
      { x: c.cx - u * 1.6, y: by - u * 0.7 + wag * u * 0.3 },
      { x: c.cx - u * 1.5, y: by - u * 1.25 + wag * u * 0.6 },
    ],
    3.4,
    tint(theme, 0.18, PALETTE.soil),
  );
  const hx = c.cx + u * 0.24;
  const hy = by - u * 0.56;
  const hr = u * 0.6;
  // 垂耳
  for (let i = -1; i <= 1; i += 2) {
    const ex = hx + i * hr * 0.7;
    const ear = ellipsePts(ex + i * hr * 0.16, hy - hr * 0.05 + Math.sin((c.time / 1000) * 2) * hr * 0.06, hr * 0.26, hr * 0.48, c.seed + i * 6, 0.1);
    p.fill(ear, tint(theme, 0.26, PALETTE.soil), 0.98);
    p.ink(ear, 2.2);
  }
  p.fill(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 51, 0.06), theme, 0.98);
  p.ink(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 52, 0.06), 2.6);
  p.fill(ellipsePts(hx + hr * 0.46, hy + hr * 0.3, hr * 0.34, hr * 0.24, c.seed + 53, 0.08), PALETTE.creamMist, 0.96);
  p.fill(ellipsePts(hx + hr * 0.66, hy + hr * 0.22, hr * 0.13, hr * 0.1, c.seed + 54, 0.05), PALETTE.inkSoft, 1);
  // 舌头
  p.fill(
    [
      { x: hx + hr * 0.42, y: hy + hr * 0.5 },
      { x: hx + hr * 0.66, y: hy + hr * 0.52 },
      { x: hx + hr * 0.6, y: hy + hr * 0.82 },
      { x: hx + hr * 0.44, y: hy + hr * 0.78 },
    ],
    PALETTE.blossom,
    0.95,
  );
  face(p, c, hx, hy, hr, hr * 0.34, -hr * 0.16, hr * 0.13);
  return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.56, frontLegY: by + bodyRy * 0.8 };
}

/** 猫：粉调、三角耳、胡须、曲尾。 */
function cat(p: Paint, c: PoseCtx, theme: string): Figure {
  const ctx = c.ctx;
  const u = c.u;
  const by = c.groundY - u * 0.92;
  const bodyRy = u * 0.66;
  legs(p, c, by + bodyRy * 0.36, bodyRy, tint(theme, 0.3, PALETTE.twilight), u * 0.22);
  p.fill(ellipsePts(c.cx, by, u * 1.12, bodyRy, c.seed, 0.06), theme, 0.98);
  p.fill(ellipsePts(c.cx + u * 0.5, by + bodyRy * 0.24, u * 0.38, bodyRy * 0.44, c.seed + 2, 0.1), PALETTE.creamMist, 0.85);
  p.ink(ellipsePts(c.cx, by, u * 1.12, bodyRy, c.seed + 1, 0.06), 2.6);
  // 曲尾
  const sw = Math.sin((c.time / 1000) * 2.6) * 0.3;
  p.ink(
    [
      { x: c.cx - u * 1.0, y: by - u * 0.2 },
      { x: c.cx - u * 1.5, y: by - u * 0.7 + sw * u * 0.3 },
      { x: c.cx - u * 1.3, y: by - u * 1.2 + sw * u * 0.7 },
      { x: c.cx - u * 1.05, y: by - u * 1.3 + sw * u * 0.4 },
    ],
    3.0,
    tint(theme, 0.2, PALETTE.twilight),
  );
  const hx = c.cx + u * 0.28;
  const hy = by - u * 0.54;
  const hr = u * 0.58;
  for (let i = -1; i <= 1; i += 2) {
    const ex = hx + i * hr * 0.56;
    const ear: P[] = [
      { x: ex - i * hr * 0.3, y: hy - hr * 0.44 },
      { x: ex + i * hr * 0.06, y: hy - hr * 1.25 },
      { x: ex + i * hr * 0.44, y: hy - hr * 0.4 },
    ];
    p.fill(ear, theme, 0.98);
    p.ink(ear, 2.2);
    p.fill(
      [
        { x: ex - i * hr * 0.14, y: hy - hr * 0.5 },
        { x: ex + i * hr * 0.06, y: hy - hr * 1.0 },
        { x: ex + i * hr * 0.26, y: hy - hr * 0.48 },
      ],
      PALETTE.blossom,
      0.6,
    );
  }
  p.fill(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 61, 0.06), theme, 0.98);
  p.ink(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 62, 0.06), 2.6);
  // 胡须
  for (let i = -1; i <= 1; i += 2) {
    for (let k = 0; k < 3; k++) {
      p.ink(
        [
          { x: hx + i * hr * 0.3, y: hy + hr * (0.24 + k * 0.1) },
          { x: hx + i * hr * 1.05, y: hy + hr * (0.12 + k * 0.16) },
        ],
        1.4,
        PALETTE.inkSoft,
      );
    }
  }
  p.fill(ellipsePts(hx + hr * 0.1, hy + hr * 0.32, hr * 0.12, hr * 0.1, c.seed + 63, 0.05), PALETTE.blossom, 0.9);
  face(p, c, hx, hy, hr, hr * 0.32, -hr * 0.14, hr * 0.14);
  return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.54, frontLegY: by + bodyRy * 0.8 };
}

/** 鼠：小体型、大圆耳、细长尾。 */
function mouse(p: Paint, c: PoseCtx, theme: string): Figure {
  const ctx = c.ctx;
  const u = c.u;
  const by = c.groundY - u * 0.76;
  const bodyRy = u * 0.56;
  legs(p, c, by + bodyRy * 0.34, bodyRy, tint(theme, 0.3, PALETTE.twilight), u * 0.18);
  p.fill(ellipsePts(c.cx, by, u * 0.98, bodyRy, c.seed, 0.06), theme, 0.98);
  p.ink(ellipsePts(c.cx, by, u * 0.98, bodyRy, c.seed + 1, 0.06), 2.4);
  // 细长尾
  const tw = Math.sin((c.time / 1000) * 3.6) * 0.4;
  p.ink(
    [
      { x: c.cx - u * 0.9, y: by + u * 0.1 },
      { x: c.cx - u * 1.7, y: by - u * 0.1 + tw * u * 0.3 },
      { x: c.cx - u * 2.3, y: by - u * 0.5 + tw * u * 0.8 },
    ],
    2.2,
    PALETTE.blossom,
  );
  const hx = c.cx + u * 0.52;
  const hy = by - u * 0.34;
  const hr = u * 0.5;
  // 大圆耳
  for (let i = -1; i <= 1; i += 2) {
    const ex = hx + i * hr * 0.56;
    const ey = hy - hr * 0.78;
    const ear = ellipsePts(ex, ey, hr * 0.48, hr * 0.44, c.seed + i * 4, 0.06);
    p.fill(ear, theme, 0.98);
    p.ink(ear, 2.2);
    p.fill(ellipsePts(ex, ey, hr * 0.28, hr * 0.26, c.seed + i * 5, 0.06), PALETTE.blossom, 0.7);
  }
  p.fill(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 71, 0.06), theme, 0.98);
  p.ink(ellipsePts(hx, hy, hr, hr * 0.9, c.seed + 72, 0.06), 2.4);
  // 尖吻 + 胡须
  p.fill(
    [
      { x: hx + hr * 0.5, y: hy + hr * 0.14 },
      { x: hx + hr * 1.15, y: hy + hr * 0.34 },
      { x: hx + hr * 0.5, y: hy + hr * 0.44 },
    ],
    tint(theme, 0.3, PALETTE.creamMist),
    0.95,
  );
  p.fill(ellipsePts(hx + hr * 0.98, hy + hr * 0.32, hr * 0.1, hr * 0.08, c.seed + 73, 0.05), PALETTE.blossom, 1);
  for (let i = -1; i <= 1; i += 2) {
    for (let k = 0; k < 2; k++) {
      p.ink(
        [
          { x: hx + hr * 0.6, y: hy + hr * (0.26 + k * 0.12) },
          { x: hx + i * hr * 1.3, y: hy + hr * (0.1 + k * 0.2) },
        ],
        1.2,
        PALETTE.inkSoft,
      );
    }
  }
  face(p, c, hx, hy, hr, hr * 0.3, -hr * 0.16, hr * 0.13);
  return { hx: hx, hy: hy, hr: hr, frontLegX: c.cx + u * 0.5, frontLegY: by + bodyRy * 0.8 };
}

/** 等级装饰：Lv2 藤蔓护腕 / Lv3 花冠（§5.2）。 */
function levelDecor(p: Paint, c: PoseCtx, fig: Figure, level: number): void {
  if (level <= 1) return;
  const ctx = c.ctx;
  if (level >= 2) {
    // 藤蔓护腕：前腿一圈
    const pts: P[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = -0.4 + (i / 8) * 2.4;
      pts.push({
        x: fig.frontLegX + Math.cos(a) * c.u * 0.24,
        y: fig.frontLegY + Math.sin(a) * c.u * 0.14,
      });
    }
    drawVine(ctx, pts, 501, { width: 2.4, leafEvery: 12, leafLen: 8 });
  }
  if (level >= 3) {
    // 花冠：头上三朵小花 + 藤
    const pts: P[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      pts.push({ x: fig.hx + Math.cos(a) * fig.hr * 0.95, y: fig.hy - fig.hr * 0.42 + Math.sin(a) * fig.hr * 0.5 });
    }
    drawVine(ctx, pts, 511, { width: 2.2, leafEvery: 22, leafLen: 9 });
    drawFlower(ctx, fig.hx - fig.hr * 0.62, fig.hy - fig.hr * 0.82, fig.hr * 0.3, PALETTE.blossom, 521);
    drawFlower(ctx, fig.hx, fig.hy - fig.hr * 1.0, fig.hr * 0.36, PALETTE.sunbeam, 523);
    drawFlower(ctx, fig.hx + fig.hr * 0.62, fig.hy - fig.hr * 0.82, fig.hr * 0.3, PALETTE.blossom, 525);
  }
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  species: SpeciesId,
  level: number,
  cx: number,
  groundY: number,
  scale: number,
  time: number,
  pose: 'idle' | 'attack' | 'hurt',
  seed: number,
  tone: string | null,
): Figure {
  const def = SPECIES[species];
  const theme = SPECIES_THEME[species];
  const u = def.bodyRadius * scale;
  const p = makePaint(ctx, tone, seed);
  const c: PoseCtx = { ctx: ctx, u: u, cx: cx, groundY: groundY, time: time, pose: pose, seed: seed };
  let fig: Figure;
  switch (species) {
    case 'elephant':
      fig = elephant(p, c, theme);
      break;
    case 'lion':
      fig = lion(p, c, theme);
      break;
    case 'tiger':
      fig = tiger(p, c, theme);
      break;
    case 'leopard':
      fig = leopard(p, c, theme);
      break;
    case 'wolf':
      fig = wolf(p, c, theme);
      break;
    case 'dog':
      fig = dog(p, c, theme);
      break;
    case 'cat':
      fig = cat(p, c, theme);
      break;
    default:
      fig = mouse(p, c, theme);
      break;
  }
  if (!tone) levelDecor(p, c, fig, level);
  return fig;
}

/**
 * 程序化动物立绘（无贴图时的唯一依靠，也是营地/图鉴/结算页的共用画法）。
 * `(cx, baseY)` 为脚下中心点；朝向由 `opts.facing` 控制。
 */
export function drawSpeciesCreature(
  ctx: CanvasRenderingContext2D,
  species: SpeciesId,
  level: number,
  cx: number,
  baseY: number,
  scale: number,
  time: number,
  opts?: {
    facing?: 1 | -1;
    pose?: 'idle' | 'attack' | 'hurt';
    seedIndex?: number;
    alpha?: number;
    tone?: string;
  },
): void {
  const o = opts || {};
  const pose = o.pose || 'idle';
  const facing = o.facing === undefined ? 1 : o.facing;
  const seed = o.seedIndex === undefined ? 0 : o.seedIndex;
  ctx.save();
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  if (facing < 0) {
    ctx.translate(cx * 2, 0);
    ctx.scale(-1, 1);
  }
  drawBody(ctx, species, level, cx, baseY, scale, time, pose, seed, o.tone || null);
  ctx.restore();
}

/** 单色剪影（敌半场「？剪影」、图鉴未解锁态都用它）。 */
export function drawSpeciesSilhouette(
  ctx: CanvasRenderingContext2D,
  species: SpeciesId,
  cx: number,
  cy: number,
  size: number,
  color: string,
  alpha?: number,
): void {
  const def = SPECIES[species];
  const scale = size / (def.bodyRadius * 2.6);
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 0.6 : alpha;
  drawBody(ctx, species, 1, cx, cy + size * 0.5, scale, 0, 'idle', 7, color);
  ctx.restore();
}

/** 有贴图用贴图，没有就程序化（贴图缺失时绝不画空白）。 */
function drawUnitImage(
  ctx: CanvasRenderingContext2D,
  species: SpeciesId,
  cx: number,
  baseY: number,
  scale: number,
  facing: 1 | -1,
  alpha: number,
): boolean {
  const img = getImage('unit-' + species);
  if (!img) return false;
  const def = SPECIES[species];
  const size = def.bodyRadius * 3.1 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (facing < 0) {
    ctx.translate(cx * 2, 0);
    ctx.scale(-1, 1);
  }
  try {
    ctx.drawImage(img, cx - size / 2, baseY - size * 0.92, size, size);
  } catch (e) {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}

/**
 * 画一个棋子（战场单位 / 营地闲逛动物共用）。
 * `showRing:false` 时只画本体（营地与拖拽态）。
 */
export function drawUnit(ctx: CanvasRenderingContext2D, unit: UnitView, opts: UnitDrawOpts): void {
  const time = opts.time;
  const scale = opts.scale === undefined ? 1 : opts.scale;
  const facing = opts.facing === undefined ? 1 : opts.facing;
  const fxx = unit.fx || {};
  const def = SPECIES[unit.species];
  let alpha = opts.alpha === undefined ? 1 : opts.alpha;
  if (opts.dim) alpha *= 0.55;
  if (opts.ghost) alpha *= 0.6;

  // 死亡：550ms 内缩小旋转上升 + 3 只萤火虫
  const death = fxx.deathFirefly === undefined ? 0 : clamp01(fxx.deathFirefly);
  if (!unit.alive) {
    if (death <= 0.001) return;
    const t = clamp01(death);
    const rise = easeOutCubic(t) * 46;
    const s = scale * (1 - 0.55 * t);
    ctx.save();
    ctx.globalAlpha = alpha * (1 - easeOutCubic(t));
    ctx.translate(opts.x, opts.y - rise);
    drawSpeciesCreature(ctx, unit.species, unit.level, 0, 0, s, time, { facing: facing, seedIndex: unit.id * 7 });
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const a = t * TAU + i * (TAU / 3);
      const rr = 16 + t * 34;
      drawFirefly(ctx, opts.x + Math.cos(a) * rr, opts.y - rise + Math.sin(a) * rr * 0.6, 3.2 - i * 0.6, 1 - t, i === 1 ? PALETTE.sunbeam : PALETTE.leafLight);
    }
    return;
  }

  // 姿态形变
  const attack = fxx.attackPulse === undefined ? 0 : clamp01(fxx.attackPulse);
  const hurt = fxx.counterHit === undefined ? 0 : clamp01(fxx.counterHit);
  const pose: 'idle' | 'attack' | 'hurt' = attack > 0.35 ? 'attack' : hurt > 0.35 ? 'hurt' : opts.pose || 'idle';
  const bobAmp = def.bodyRadius * scale * 0.06;
  const bobY = pose === 'idle' ? -Math.sin((time / 1000) * TIMING.RUN_BOB_HZ * TAU) * bobAmp : 0;
  const lunge = pose === 'attack' ? TIMING.ATTACK_LUNGE * attack * scale : 0;
  const recoil = pose === 'hurt' ? -8 * hurt : 0;
  const dragging = !!opts.dragging;
  const drawScale = dragging ? scale * 1.12 : scale;
  const x = opts.x + (lunge + recoil) * facing;

  // 地面投影（拖拽时是更淡的草影，不带底座）
  if (opts.showShadow !== false) {
    ctx.save();
    ctx.globalAlpha = dragging ? 0.14 : 0.2;
    drawSoftGroundShadow(ctx, x, opts.y + 2, def.bodyRadius * scale * (dragging ? 0.9 : 1.15), unit.id * 3 + 5);
    ctx.restore();
  }

  const baseY = opts.y + bobY;
  const usedImage = drawUnitImage(ctx, unit.species, x, baseY, drawScale, facing, alpha);

  if (!usedImage) {
    // 受击白闪：同一套几何用纸白再画一遍（0.08s），不做滤镜发光
    const flash = fxx.hitFlash === undefined ? 0 : clamp01(fxx.hitFlash);
    ctx.save();
    ctx.globalAlpha = alpha;
    drawSpeciesCreature(ctx, unit.species, unit.level, x, baseY, drawScale, time, {
      facing: facing,
      pose: pose,
      seedIndex: unit.id * 7 + 3,
    });
    if (flash > 0.02) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.75 * flash;
      drawSpeciesCreature(ctx, unit.species, unit.level, x, baseY, drawScale, time, {
        facing: facing,
        pose: pose,
        seedIndex: unit.id * 7 + 3,
        tone: PALETTE.creamMist,
      });
      ctx.restore();
    }
    ctx.restore();
  }

  // 受击抖动 ±4px（命中方向）
  if (hurt > 0.35) {
    const dir = fxx.hitDir === undefined ? 1 : fxx.hitDir >= 0 ? 1 : -1;
    ctx.save();
    ctx.globalAlpha = 0.4 * hurt;
    ctx.fillStyle = PALETTE.creamMist;
    blobPath(ctx, x + dir * 14 - 10, baseY - def.bodyRadius * scale * 1.6 - 10, 20, 20, 1.4, unit.id * 5);
    ctx.fill();
    ctx.restore();
  }

  // 血量环（拖拽态与 ghost 不画环；只允许环形表达血量）
  if (opts.showRing !== false && !dragging && !opts.ghost) {
    const ratio = unit.maxHp > 0 ? clamp01(unit.hp / unit.maxHp) : 0;
    const shieldRatio = unit.maxHp > 0 ? clamp01(unit.shield / (unit.maxHp * TIMING.SHIELD_CAP_RATIO)) : 0;
    const ghostRatio = opts.ghostHp === undefined || unit.maxHp <= 0 ? ratio : clamp01(opts.ghostHp / unit.maxHp);
    drawHpRing(ctx, x, baseY - def.bodyRadius * scale * 1.05, def.ringRadius * drawScale, ratio, {
      time: time,
      seedIndex: unit.id * 11,
      ghostRatio: ghostRatio,
      shieldRatio: shieldRatio,
      shieldPulse: fxx.shieldRipple,
      commandTarget: !!opts.commandTarget,
      alpha: alpha,
    });
    if (opts.statuses && opts.statuses.length > 0) {
      drawStatusIcons(ctx, x, baseY - def.bodyRadius * scale * 1.05, def.ringRadius * drawScale, opts.statuses, 3);
    }
    // 选中：环外一层暖色薄光（不是高亮框）
    if (opts.selected) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      drawSoftGroundShadow(ctx, x, baseY + 2, def.bodyRadius * scale * 1.5, unit.id * 13);
      ctx.restore();
    }
  }

  // 合并/进化开花（combineBloom 由场景用 scale 表达，这里给一点花瓣）
  if (death === 0 && unit.level >= 3 && pose === 'idle') {
    const t = (time % 3200) / 3200;
    if (t < 0.2) {
      ctx.save();
      ctx.globalAlpha = 0.5 * easeOutBack(t / 0.2);
      drawFlower(ctx, x + def.bodyRadius * scale * 0.9, baseY - def.bodyRadius * scale * 2.1, 7, PALETTE.blossom, unit.id * 17);
      ctx.restore();
    }
  }
}

/** 血量环半径的公开取值（拖拽/命中测试用）。 */
export function unitRingRadius(species: SpeciesId, scale?: number): number {
  const s = scale === undefined ? 1 : scale;
  return SPECIES[species].ringRadius * s;
}

/** 一级到三级的倍率（渲染层换算 HP 环/体型用，来源同 config）。 */
export function levelOf(level: number): Level {
  if (level >= 3) return 3;
  if (level === 2) return 2;
  return 1;
}

/** 让营地/图鉴可以拿到一个稳定相位（同一只动物每次画的抖动一致）。 */
export function stableSeed(id: number): number {
  return Math.abs(Math.round(id)) % 977;
}

/** 供绘制骨架调试：把关键锚点画出来（默认不调用，tools 预览脚本会用）。 */
export function debugAnchors(ctx: CanvasRenderingContext2D, species: SpeciesId, cx: number, baseY: number, scale: number): void {
  const def = SPECIES[species];
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = PALETTE.berry;
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx, baseY - def.bodyRadius * 2.4 * scale);
  ctx.stroke();
  tracePath(ctx, ellipsePts(cx, baseY - def.bodyRadius * scale * 1.5, def.ringRadius * scale, def.ringRadius * scale, 1, 0.02), true);
  ctx.restore();
}