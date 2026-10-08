/**
 * 小恶魔（敌方场边 NPC）：紫色圆身 + 蝙蝠翅 + 金铃项圈 + 带尖尾巴。
 * `drawImp(ctx, cx, baseY, state, time)`，(cx, baseY) 是脚底中心。
 */
import { PALETTE, rgba, tint } from '../config/palette';
import { fillWatercolor, strokeInk, P } from '../ui/brush';
import { bob, breathe, cycle, sway } from '../ui/ease';
import { drawFirefly, drawLeaf } from './paint';

const BODY = PALETTE.twilight;
const BODY_DEEP = tint(PALETTE.twilight, 0.34, PALETTE.forestDeep);
const BELLY = tint(PALETTE.blossom, 0.62, PALETTE.paper);

function blob(cx: number, cy: number, rx: number, ry: number, n: number, seed: number, jag: number): P[] {
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(i * 21.3 + seed) * 0.5 * jag;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

export function drawImp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  state: 'idle' | 'hurt' | 'laugh' | 'sad' | string,
  time: number,
): void {
  const hurt = state === 'hurt' || state === 'sad';
  const laugh = state === 'laugh';
  const hover = bob(time, 0.42, 5) + 4; // 恶魔是飘着的
  const flap = Math.sin(time / 180) * 0.5;

  ctx.save();
  ctx.translate(cx, baseY);
  // 地面影（飘起来所以更淡）
  ctx.save();
  ctx.globalAlpha = 0.16;
  fillWatercolor(ctx, blob(0, 2, 30, 8, 14, 1101, 0.06), PALETTE.forestDeep, { alpha: 0.6, layers: 1, seedIndex: 1102 });
  ctx.restore();

  const cy = -68 - hover;

  // 翅膀（在身后画）
  for (let i = -1; i <= 1; i += 2) {
    const wa = i < 0 ? Math.PI - 0.5 : 0.5;
    const wcx = i * 30;
    const wing: P[] = [
      { x: i * 14, y: cy - 6 },
      { x: wcx + i * 34, y: cy - 40 - flap * 12 },
      { x: wcx + i * 40, y: cy + 2 },
      { x: wcx + i * 22, y: cy + 16 },
      { x: i * 14, y: cy + 10 },
    ];
    fillWatercolor(ctx, wing, tint(BODY, 0.22, PALETTE.twilight), { alpha: 0.9, layers: 1, seedIndex: 1110 + i });
    strokeInk(ctx, wing, { width: 2.2, close: true, color: rgba(BODY_DEEP, 0.9), seedIndex: 1114 + i, jitter: 1.2 });
  }

  // 尾巴（带尖）
  const tailSway = sway(time, 0.0) * 8;
  const tail: P[] = [
    { x: 14, y: cy + 30 },
    { x: 40, y: cy + 40 + tailSway },
    { x: 54, y: cy + 22 + tailSway },
  ];
  strokeInk(ctx, tail, { width: 6, color: BODY, seedIndex: 1120, jitter: 1.4 });
  const tip: P[] = [
    { x: 54, y: cy + 22 + tailSway },
    { x: 62, y: cy + 10 + tailSway },
    { x: 50, y: cy + 14 + tailSway },
  ];
  fillWatercolor(ctx, tip, BODY_DEEP, { alpha: 1, layers: 1, seedIndex: 1121 });
  strokeInk(ctx, tip, { width: 2, close: true, seedIndex: 1122, jitter: 0.8 });

  // 身体（圆润的水滴形）
  const body: P[] = [
    { x: -26, y: cy + 34 },
    { x: -24, y: cy - 4 },
    { x: -12, y: cy - 24 },
    { x: 12, y: cy - 24 },
    { x: 24, y: cy - 4 },
    { x: 26, y: cy + 34 },
  ];
  fillWatercolor(ctx, body, BODY, { alpha: 0.98, layers: 1, wetEdge: true, seedIndex: 1130 });
  strokeInk(ctx, body, { width: 2.8, close: true, color: BODY_DEEP, seedIndex: 1131, jitter: 1.1 });
  // 亮肚皮
  const belly: P[] = [
    { x: -13, y: cy + 30 },
    { x: -12, y: cy + 2 },
    { x: 12, y: cy + 2 },
    { x: 13, y: cy + 30 },
  ];
  fillWatercolor(ctx, belly, BELLY, { alpha: 0.55, layers: 1, seedIndex: 1132 });

  // 角
  for (let i = -1; i <= 1; i += 2) {
    const horn: P[] = [
      { x: i * 8, y: cy - 22 },
      { x: i * 18, y: cy - 40 },
      { x: i * 20, y: cy - 20 },
    ];
    fillWatercolor(ctx, horn, PALETTE.sunbeam, { alpha: 0.98, layers: 1, seedIndex: 1140 + i });
    strokeInk(ctx, horn, { width: 2.2, close: true, seedIndex: 1144 + i, jitter: 0.8 });
  }
  // 尖耳
  for (let i = -1; i <= 1; i += 2) {
    const ear: P[] = [
      { x: i * 22, y: cy - 12 },
      { x: i * 38, y: cy - 24 },
      { x: i * 30, y: cy + 2 },
    ];
    fillWatercolor(ctx, ear, BODY, { alpha: 0.98, layers: 1, seedIndex: 1150 + i });
    strokeInk(ctx, ear, { width: 2.2, close: true, color: BODY_DEEP, seedIndex: 1154 + i, jitter: 0.9 });
  }

  // 眼睛
  for (let i = -1; i <= 1; i += 2) {
    const ex = i * 10;
    const ey = cy;
    if (hurt) {
      strokeInk(ctx, [{ x: ex - 4, y: ey - 4 }, { x: ex + 4, y: ey + 4 }], { width: 2.2, color: PALETTE.berry, seedIndex: 1160 + i });
      strokeInk(ctx, [{ x: ex + 4, y: ey - 4 }, { x: ex - 4, y: ey + 4 }], { width: 2.2, color: PALETTE.berry, seedIndex: 1164 + i });
    } else {
      ctx.save();
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 4.6, laugh ? 2.2 : 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.arc(ex - 1.6, ey - 1.8, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // 坏笑嘴
  const mouth: P[] = laugh
    ? [
        { x: -11, y: cy + 10 },
        { x: 0, y: cy + 20 },
        { x: 11, y: cy + 10 },
      ]
    : [
        { x: -10, y: cy + 13 },
        { x: 0, y: cy + 19 },
        { x: 10, y: cy + 11 },
      ];
  strokeInk(ctx, mouth, { width: 2.2, color: PALETTE.inkSoft, seedIndex: 1170 });
  // 小尖牙
  fillWatercolor(
    ctx,
    [
      { x: 2, y: cy + 17 },
      { x: 7, y: cy + 17 },
      { x: 4.5, y: cy + 22 },
    ],
    PALETTE.paper,
    { alpha: 1, layers: 1, seedIndex: 1171 },
  );

  // 金铃项圈
  strokeInk(
    ctx,
    [
      { x: -18, y: cy + 24 },
      { x: 0, y: cy + 30 },
      { x: 18, y: cy + 24 },
    ],
    { width: 5, color: PALETTE.sunbeam, seedIndex: 1180, jitter: 1.0 },
  );
  fillWatercolor(ctx, blob(0, cy + 30, 6.5, 6.5, 10, 1181, 0.05), PALETTE.sunset, { alpha: 1, layers: 1, seedIndex: 1182 });
  strokeInk(ctx, blob(0, cy + 30, 6.5, 6.5, 10, 1183, 0.05), { width: 1.8, close: true, seedIndex: 1184, jitter: 0.7 });

  // 手里的小叶片（嘲讽/挥动）
  const leafAng = -0.6 + Math.sin(time / 300) * 0.5;
  drawLeaf(ctx, -30, cy + 22, 16, leafAng, PALETTE.leafMid, 1190);

  // 受伤时冒星
  if (hurt && cycle(time, 900, 0) < 0.5) {
    drawFirefly(ctx, 26, cy - 30, 3.2, 0.85, PALETTE.sunbeam);
    drawFirefly(ctx, 34, cy - 20, 2.4, 0.6, PALETTE.sunbeam);
  }
  ctx.restore();
}