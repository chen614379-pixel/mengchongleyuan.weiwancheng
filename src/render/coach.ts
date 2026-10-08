/**
 * 饲养员 NPC：手绘水彩 + 描边，站在我方棋盘左下角（`drawCoach(ctx,306,596,...)`）。
 * (x, y) 是**脚底中心**锚点；角色朝右。
 */
import { PALETTE, rgba, tint } from '../config/palette';
import { blobPath, fillWatercolor, strokeInk, P } from '../ui/brush';
import { bob, breathe, easeOutCubic } from '../ui/ease';
import { STROKE } from '../ui/theme';
import { drawLeaf, paperBase } from './paint';

// 全部由 PALETTE 派生（禁止魔法颜色值，§16）
const SKIN = tint(PALETTE.sunset, 0.58, PALETTE.creamMist);
const SKIN_DEEP = tint(PALETTE.sunset, 0.32, PALETTE.soil);
const CLOTH = tint(PALETTE.stream, 0.3, PALETTE.creamMist);
const CLOTH_DEEP = tint(PALETTE.stream, 0.35, PALETTE.forestDeep);
const PANT = tint(PALETTE.leafMid, 0.45, PALETTE.forestMid);

function ellipsePts(cx: number, cy: number, rx: number, ry: number, n: number, seed: number, jag: number): P[] {
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(i * 12.9898 + seed) * 0.5 * jag;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

export function drawCoach(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: 'idle' | 'proud' | 'hurt' | 'win' | 'lose' | string,
  time: number,
): void {
  const proud = state === 'proud' || state === 'win';
  const hurt = state === 'hurt' || state === 'lose';
  const breatheY = bob(time, 0.5, 2.4);
  const lean = hurt ? -0.07 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.scale(1, 1);

  // 地面软影
  ctx.save();
  ctx.globalAlpha = 0.2;
  fillWatercolor(ctx, ellipsePts(0, 2, 34, 9, 14, 910, 0.06), PALETTE.forestDeep, { alpha: 0.5, layers: 1, seedIndex: 911 });
  ctx.restore();

  const baseY = breatheY;
  ctx.translate(0, baseY);

  // 腿 + 靴
  for (let i = -1; i <= 1; i += 2) {
    const lx = i * 11;
    const leg: P[] = [
      { x: lx - 8, y: 0 },
      { x: lx + 8, y: 0 },
      { x: lx + 7, y: -34 },
      { x: lx - 7, y: -34 },
    ];
    fillWatercolor(ctx, leg, PANT, { alpha: 0.97, layers: 1, seedIndex: 920 + i });
    const boot: P[] = [
      { x: lx - 11, y: 2 },
      { x: lx + 12, y: 2 },
      { x: lx + 12, y: -8 },
      { x: lx - 11, y: -8 },
    ];
    fillWatercolor(ctx, boot, PALETTE.bark, { alpha: 0.98, layers: 1, seedIndex: 930 + i });
    strokeInk(ctx, boot, { width: 2.2, close: true, seedIndex: 934 + i, jitter: 0.9 });
  }

  // 背带裤躯干
  const torso: P[] = [
    { x: -20, y: -34 },
    { x: 20, y: -34 },
    { x: 24, y: -78 },
    { x: -24, y: -78 },
  ];
  fillWatercolor(ctx, torso, PANT, { alpha: 0.97, layers: 1, seedIndex: 940 });
  strokeInk(ctx, torso, { width: 2.6, close: true, seedIndex: 941, jitter: 1.0 });
  // 衬衫
  const shirt: P[] = [
    { x: -22, y: -78 },
    { x: 22, y: -78 },
    { x: 26, y: -108 },
    { x: -26, y: -108 },
  ];
  fillWatercolor(ctx, shirt, CLOTH, { alpha: 0.97, layers: 1, wetEdge: true, seedIndex: 942 });
  strokeInk(ctx, shirt, { width: 2.6, close: true, seedIndex: 943, jitter: 1.0 });
  // 背带
  for (let i = -1; i <= 1; i += 2) {
    strokeInk(
      ctx,
      [
        { x: i * 12, y: -108 },
        { x: i * 14, y: -78 },
      ],
      { width: 4, color: PALETTE.barkLight, seedIndex: 944 + i, jitter: 1.0 },
    );
  }
  // 口袋 + 小铲子挂饰
  drawLeaf(ctx, 0, -60, 14, 1.4, PALETTE.leafLight, 946);

  // 手臂：proud 时右上举
  const armAng = proud ? -2.35 : hurt ? -1.15 : -0.32;
  const swing = Math.sin(time / 620) * 0.08;
  for (let i = -1; i <= 1; i += 2) {
    const a = i < 0 ? Math.PI - armAng : armAng + swing * i;
    const sx = i * 22;
    const ex = sx + Math.cos(a) * 34;
    const ey = -100 + Math.sin(a) * 30;
    const arm: P[] = [
      { x: sx - 7, y: -104 },
      { x: sx + 7, y: -100 },
      { x: ex + 6, y: ey },
      { x: ex - 6, y: ey },
    ];
    fillWatercolor(ctx, arm, CLOTH_DEEP, { alpha: 0.97, layers: 1, seedIndex: 950 + i });
    strokeInk(ctx, arm, { width: 2.4, close: true, seedIndex: 954 + i, jitter: 0.9 });
    // 手
    fillWatercolor(ctx, ellipsePts(ex, ey + 2, 6.5, 6.5, 10, 958 + i, 0.05), SKIN, { alpha: 1, layers: 1, seedIndex: 960 + i });
  }

  // 头
  const headY = -128;
  fillWatercolor(ctx, ellipsePts(0, headY, 21, 22, 16, 970, 0.04), SKIN, { alpha: 1, layers: 1, seedIndex: 971 });
  strokeInk(
    ctx,
    ellipsePts(0, headY, 21, 22, 16, 972, 0.04),
    { width: 2.4, close: true, seedIndex: 973, jitter: 0.8 },
  );
  // 眼睛
  for (let i = -1; i <= 1; i += 2) {
    const ex = i * 7.5;
    const ey = headY + 1;
    if (proud) {
      strokeInk(ctx, [{ x: ex - 3.4, y: ey }, { x: ex, y: ey + 3.2 }, { x: ex + 3.4, y: ey }], { width: 2, seedIndex: 976 + i, color: PALETTE.inkSoft });
    } else {
      ctx.save();
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.beginPath();
      ctx.arc(ex, ey, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(ex - 0.8, ey - 0.9, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.paper;
      ctx.fill();
      ctx.restore();
    }
  }
  // 腮红
  ctx.save();
  ctx.globalAlpha = 0.35;
  fillWatercolor(ctx, ellipsePts(-13, headY + 9, 4.6, 2.8, 10, 980, 0.06), PALETTE.blossom, { alpha: 0.6, layers: 1, seedIndex: 981 });
  fillWatercolor(ctx, ellipsePts(13, headY + 9, 4.6, 2.8, 10, 982, 0.06), PALETTE.blossom, { alpha: 0.6, layers: 1, seedIndex: 983 });
  ctx.restore();
  // 嘴
  if (hurt) {
    strokeInk(ctx, [{ x: -5, y: headY + 15 }, { x: 0, y: headY + 11 }, { x: 5, y: headY + 15 }], { width: 2, seedIndex: 985 });
  } else {
    strokeInk(ctx, [{ x: -6, y: headY + 10 }, { x: 0, y: headY + 17 }, { x: 6, y: headY + 10 }], { width: 2, seedIndex: 986 });
  }
  // 草帽
  const hatBrim: P[] = [
    { x: -34, y: headY + 2 },
    { x: 34, y: headY + 2 },
    { x: 36, y: headY - 6 },
    { x: -36, y: headY - 6 },
  ];
  fillWatercolor(ctx, hatBrim, PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: 990 });
  strokeInk(ctx, hatBrim, { width: 2.6, close: true, seedIndex: 991, jitter: 1.1 });
  const hatTop: P[] = [
    { x: -22, y: headY - 6 },
    { x: 22, y: headY - 6 },
    { x: 15, y: headY - 26 },
    { x: -15, y: headY - 26 },
  ];
  fillWatercolor(ctx, hatTop, PALETTE.sunbeam, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: 992 });
  strokeInk(ctx, hatTop, { width: 2.6, close: true, seedIndex: 993, jitter: 1.0 });
  // 帽上叶片
  const sway = Math.sin(time / 420) * 0.22;
  drawLeaf(ctx, -26, headY - 4, 20, Math.PI - 0.6 + sway, PALETTE.leafMid, 995);
  drawLeaf(ctx, 27, headY - 2, 16, -0.3 - sway, PALETTE.leafLight, 996);

  // 受伤：汗滴
  if (hurt) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    fillWatercolor(ctx, ellipsePts(22, headY - 14, 4, 6, 10, 997, 0.05), PALETTE.stream, { alpha: 0.9, layers: 1, seedIndex: 998 });
    ctx.restore();
  }
  ctx.restore();
}

export { paperBase, rgba, tint, easeOutCubic, breathe, blobPath, STROKE };