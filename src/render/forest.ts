/**
 * 森林背景三件套（§2.5）：天空 / 三层视差 / 叶隙光斑 / 天气 / 暗角。
 *
 * 视差系数：far 0.10 · mid 0.35 · near 1.00。
 * 近景草丛按 0.5Hz 摆动 ±3px；所有元素都走 `ui/brush` 的手绘路径 + 水彩填充，
 * 不允许出现直线贴图、硬边矩形或渐变按钮式色块。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE, tint } from '../config/palette';
import { TIMING } from '../config/timing';
import { WeatherId } from '../config/weather';
import { blobPath, fillWatercolor, noiseAt, paperGrain, tracePath, P } from '../ui/brush';
import { cycle } from '../ui/ease';
import {
  drawBroadleafTree,
  drawBush,
  drawCloud,
  drawClover,
  drawFern,
  drawFlower,
  drawFogBand,
  drawGrassTuft,
  drawMushroom,
  drawPineTree,
  drawRipple,
  drawStone,
  drawSunMote,
} from './paint';

/** -1~1 确定性噪声 → 0~1。 */
function rnd(i: number, seed: number): number {
  return (noiseAt(i, seed) + 1) / 2;
}

function softBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha: number,
  seedIndex: number,
): void {
  const pts: P[] = [
    { x: x - 20, y: y + h * 0.14 },
    { x: x + w * 0.5, y: y - h * 0.16 },
    { x: x + w + 20, y: y + h * 0.1 },
    { x: x + w + 20, y: y + h },
    { x: x - 20, y: y + h },
  ];
  fillWatercolor(ctx, pts, color, { alpha, layers: 2, wetEdge: true, seedIndex });
}

/** 天空：暖色水彩洗 + 云 + 地平线雾气 + 右上暖光。 */
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  ctx.save();
  softBand(ctx, 0, -6, w, h + 12, PALETTE.paper, 0.99, 7);

  // 天空底色：上冷下暖两段水彩洗，边缘都是有机曲线。
  softBand(ctx, 0, -h * 0.05, w, h * 0.52, tint(PALETTE.skyWarm, 0.18, PALETTE.paper), 0.72, 11);
  softBand(ctx, 0, h * 0.24, w, h * 0.3, tint(PALETTE.creamMist, 0.1, PALETTE.sunset), 0.5, 23);

  // 右上暖光（Ghibli 逆光）：两层水彩团，无发光滤镜。
  const sunX = w * 0.72;
  const sunY = h * 0.16;
  for (let i = 0; i < 3; i++) {
    const r = 190 - i * 46;
    ctx.save();
    ctx.globalAlpha = 0.1 + i * 0.06;
    ctx.fillStyle = PALETTE.sunbeam;
    blobPath(ctx, sunX - r, sunY - r * 0.8, r * 2, r * 1.6, 1.5, 31 + i);
    ctx.fill();
    ctx.restore();
  }

  // 云：三层，缓慢横移。
  const clouds = [
    { x: w * 0.14, y: h * 0.13, w: 300, h: 66, a: 0.5, sp: 42000 },
    { x: w * 0.46, y: h * 0.07, w: 240, h: 52, a: 0.42, sp: 61000 },
    { x: w * 0.86, y: h * 0.2, w: 260, h: 58, a: 0.36, sp: 52000 },
  ];
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    const drift = (cycle(time, c.sp, i * 900) - 0.5) * 70;
    drawCloud(ctx, c.x + drift, c.y, c.w, c.h, tint(PALETTE.creamMist, 0.12, PALETTE.paper), c.a, 40 + i * 9);
  }

  // 远山雾带：把天空与森林接上，避免出现硬地平线。
  drawFogBand(ctx, -30, h * 0.3, w + 60, h * 0.22, 0.55, 77);
  paperGrain(ctx, 0, 0, w, h * 0.5, 0.05, 5);
  ctx.restore();
}

/** 远景树影（三层视差的一层）。 */
function farTrees(ctx: CanvasRenderingContext2D, w: number, h: number, off: number, time: number): void {
  const baseY = h * 0.62;
  const count = 9;
  const step = (w + 260) / count;
  for (let i = 0; i < count; i++) {
    const raw = i * step - 130 + rnd(i, 3) * step * 0.5 - off * 1.0;
    const x = ((raw % (w + 300)) + (w + 300)) % (w + 300) - 150;
    const hh = h * (0.44 + rnd(i * 7, 9) * 0.26);
    const sway = Math.sin((time / 1000) * 0.32 + i) * 4;
    drawPineTree(ctx, x, baseY, hh, tint(PALETTE.forestMid, 0.3, PALETTE.skyWarm), 100 + i * 5, 0.5 + rnd(i, 11) * 0.2);
    drawBroadleafTree(ctx, x + step * 0.45, baseY, hh * 0.78, tint(PALETTE.forestDeep, 0.42, PALETTE.skyWarm), 200 + i * 5, sway);
  }
  // 林间暖色光带（远处的太阳光束）
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = PALETTE.sunbeam;
  const beam: P[] = [
    { x: w * 0.5 + off * 0.4, y: -10 },
    { x: w * 0.72 + off * 0.4, y: -10 },
    { x: w * 0.92 + off * 0.4, y: h * 0.72 },
    { x: w * 0.42 + off * 0.4, y: h * 0.72 },
  ];
  tracePath(ctx, beam, true);
  ctx.fill();
  ctx.restore();
}

/** 中景：草地坡面 + 树干 + 蕨类 + 蘑菇 + 灌木。 */
function midForest(ctx: CanvasRenderingContext2D, w: number, h: number, off: number, time: number): void {
  // 草地坡面：用两段水彩洗铺满下半屏，边界自然起伏。
  const groundPts: P[] = [{ x: -20, y: h * 0.56 }];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    groundPts.push({ x: -20 + (w + 40) * t, y: h * (0.5 + Math.sin(t * 5.2 + 1.1) * 0.03 + rnd(i, 13) * 0.03) });
  }
  groundPts.push({ x: w + 20, y: h + 20 });
  groundPts.push({ x: -20, y: h + 20 });
  fillWatercolor(ctx, groundPts, PALETTE.meadow, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: 61 });
  fillWatercolor(
    ctx,
    [
      { x: -20, y: h * 0.78 },
      { x: w * 0.5, y: h * 0.72 },
      { x: w + 20, y: h * 0.8 },
      { x: w + 20, y: h + 20 },
      { x: -20, y: h + 20 },
    ],
    tint(PALETTE.leafLight, 0.28, PALETTE.paper),
    { alpha: 0.5, layers: 2, wetEdge: true, seedIndex: 62 },
  );

  // 树干：沿左右两侧和画面中部几根，制造纵深。
  const trunks = [40, 210, 470, 760, 1010, 1230];
  for (let i = 0; i < trunks.length; i++) {
    const x = trunks[i] - off * 0.35;
    const hh = h * (0.5 + rnd(i * 3, 17) * 0.28);
    const sway = Math.sin((time / 1000) * 0.4 + i * 1.7) * 2.5;
    drawBroadleafTree(ctx, x, h * 0.78, hh, tint(PALETTE.forestMid, 0.1 + rnd(i, 19) * 0.18, PALETTE.paper), 300 + i * 11, sway);
  }

  // 灌木与蕨类（中景装饰，不挡棋盘中央）。
  const decor = [
    { x: 0.06, y: 0.66, k: 0 },
    { x: 0.16, y: 0.74, k: 1 },
    { x: 0.92, y: 0.68, k: 2 },
    { x: 0.84, y: 0.78, k: 3 },
    { x: 0.5, y: 0.63, k: 4 },
    { x: 0.66, y: 0.6, k: 5 },
  ];
  for (let i = 0; i < decor.length; i++) {
    const d = decor[i];
    const x = w * d.x - off * 0.35;
    const y = h * d.y;
    drawBush(ctx, x, y, 42 + rnd(i, 21) * 22, 26 + rnd(i, 23) * 12, i % 2 === 0 ? PALETTE.leafMid : PALETTE.forestMid, 400 + i * 13);
    if (i % 2 === 1) {
      drawFern(ctx, x + 46, y + 6, 34, -0.5 + rnd(i, 25) * 0.5, PALETTE.leafLight, 500 + i * 9);
      drawMushroom(ctx, x - 44, y + 12, 20, 600 + i * 7);
    }
  }
  paperGrain(ctx, 0, h * 0.4, w, h * 0.6, 0.06, 71);
}

/** 近景：前景草丛 / 花 / 三叶草 / 卵石 / 几片垂落的叶。 */
function nearForest(ctx: CanvasRenderingContext2D, w: number, h: number, off: number, time: number): void {
  const swayAmp = 3;
  const tufts = 16;
  for (let i = 0; i < tufts; i++) {
    const x = (i / tufts) * (w + 80) - 40 - off;
    const baseY = h - 6 - rnd(i, 27) * 26;
    const hh = 34 + rnd(i * 5, 29) * 30;
    const sway = Math.sin((time / 1000) * 2 * 0.5 * 2 * Math.PI * 0.5 + i * 0.9) * swayAmp;
    drawGrassTuft(ctx, x, baseY, hh, i % 3 === 0 ? PALETTE.leafMid : PALETTE.leafLight, 700 + i * 5, sway);
  }
  const flowers = [0.08, 0.22, 0.41, 0.58, 0.73, 0.88];
  for (let i = 0; i < flowers.length; i++) {
    const x = w * flowers[i] - off;
    const y = h - 30 - rnd(i, 31) * 22;
    drawFlower(ctx, x, y, 9 + rnd(i, 33) * 4, i % 2 === 0 ? PALETTE.blossom : PALETTE.sunbeam, 800 + i * 6);
    if (i % 3 === 0) drawClover(ctx, x + 30, y + 16, 8, 820 + i * 4);
  }
  // 前景卵石（左右下角，压住画面边角）
  drawStone(ctx, 58 - off * 0.6, h - 22, 30, 900, true);
  drawStone(ctx, w - 70 - off * 0.6, h - 16, 36, 910, false);
  // 垂落的叶（画面上缘，制造「在森林里」的窥视感）
  for (let i = 0; i < 4; i++) {
    const x = w * (0.08 + i * 0.28) - off * 0.5;
    const y = -18 + rnd(i, 35) * 26;
    const ang = Math.PI / 2 + (rnd(i, 37) - 0.5) * 0.6;
    const pts: P[] = [
      { x: x, y: y - 40 },
      { x: x + Math.cos(ang) * 66, y: y + Math.sin(ang) * 66 },
    ];
    const leaf: P[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const lx = x + Math.cos(ang) * 66 * t;
      const ly = y + Math.sin(ang) * 66 * t;
      const half = Math.sin(t * Math.PI) * 26;
      leaf.push({ x: lx - Math.sin(ang) * half, y: ly + Math.cos(ang) * half });
    }
    for (let k = 10; k >= 0; k--) {
      const t = k / 10;
      const lx = x + Math.cos(ang) * 66 * t;
      const ly = y + Math.sin(ang) * 66 * t;
      const half = Math.sin(t * Math.PI) * 26;
      leaf.push({ x: lx + Math.sin(ang) * half, y: ly - Math.cos(ang) * half });
    }
    fillWatercolor(ctx, leaf, tint(PALETTE.leafMid, 0.12, PALETTE.forestDeep), {
      alpha: 0.95, layers: 2, wetEdge: true, seedIndex: 930 + i * 5,
    });
  }
}

/** 三层视差总入口：far / mid / near。 */
export function drawForestLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scroll: number,
  layer: 'far' | 'mid' | 'near',
  time: number,
): void {
  if (layer === 'far') farTrees(ctx, w, h, scroll * LAYOUT.PARALLAX.far, time);
  else if (layer === 'mid') midForest(ctx, w, h, scroll * LAYOUT.PARALLAX.mid, time);
  else nearForest(ctx, w, h, scroll * LAYOUT.PARALLAX.near, time);
}

/** 叶隙光斑：8~12 个，alpha 0.06~0.12，周期 6~10s 缓慢漂移。 */
export function drawSunSpecks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  intensity?: number,
): void {
  const k = intensity === undefined ? 1 : intensity;
  const n = LAYOUT.SUNSPECKS.count;
  for (let i = 0; i < n; i++) {
    const period = LAYOUT.SUNSPECKS.cycleMin + rnd(i * 3, 41) * (LAYOUT.SUNSPECKS.cycleMax - LAYOUT.SUNSPECKS.cycleMin);
    const t = cycle(time, period, i * 640);
    const x = w * (0.06 + rnd(i, 43) * 0.88) + Math.sin(t * Math.PI * 2 + i) * 34;
    const y = h * (0.04 + rnd(i * 5, 45) * 0.9) + t * 46;
    const r = 16 + rnd(i * 7, 47) * 30;
    const aBase = LAYOUT.SUNSPECKS.alphaMin + rnd(i * 11, 49) * (LAYOUT.SUNSPECKS.alphaMax - LAYOUT.SUNSPECKS.alphaMin);
    const breathe = 0.6 + 0.4 * Math.sin(t * Math.PI * 2);
    drawSunMote(ctx, x, y, r, aBase * breathe * k);
  }
}

/** 暗角：四边冷色水彩压暗（不用径向渐变，避免「发光」感）。 */
export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bands = [
    { x: 0, y: 0, w: 90, h: h, sx: 0 },
    { x: w - 90, y: 0, w: 90, h: h, sx: 1 },
    { x: 0, y: 0, w: w, h: 74, sx: 2 },
    { x: 0, y: h - 86, w: w, h: 86, sx: 3 },
  ];
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    drawFogBand(ctx, b.x - (b.sx < 2 ? 40 : 0), b.y - (b.sx >= 2 ? 40 : 0), b.w + (b.sx < 2 ? 40 : 0), b.h + (b.sx >= 2 ? 40 : 0), 0.22, 950 + i * 7);
  }
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = PALETTE.forestDeep;
  ctx.lineWidth = 18;
  ctx.lineJoin = 'round';
  tracePath(
    ctx,
    [
      { x: 6, y: 6 },
      { x: w - 6, y: 6 },
      { x: w - 6, y: h - 6 },
      { x: 6, y: h - 6 },
    ],
    true,
  );
  ctx.stroke();
  ctx.restore();
}

/** 天气粒子层（§2.5）：晴金尘上升 / 雾白絮横移 / 雨斜线+涟漪 / 彩虹 / 多云 / 雷闪。 */
export function drawWeather(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  weather: WeatherId,
  time: number,
  intensity?: number,
): void {
  const k = intensity === undefined ? 1 : intensity;
  if (weather === 'none' || k <= 0) return;

  if (weather === 'sunny') {
    for (let i = 0; i < 16; i++) {
      const period = 4200 + rnd(i, 53) * 2600;
      const t = cycle(time, period, i * 320);
      const x = w * rnd(i * 3, 55) + Math.sin(t * Math.PI * 2) * 18;
      const y = h * (0.95 - t * 0.9);
      drawSunMote(ctx, x, y, 7 + rnd(i, 57) * 9, (0.1 + rnd(i * 5, 59) * 0.14) * k);
    }
    return;
  }

  if (weather === 'misty' || weather === 'cloudy') {
    const bands = weather === 'cloudy' ? 3 : 5;
    for (let i = 0; i < bands; i++) {
      const drift = (cycle(time, 26000 + i * 7000, i * 500) - 0.5) * 120;
      drawFogBand(ctx, -60 + drift, h * (0.16 + i * 0.13), w + 120, h * 0.14, (weather === 'cloudy' ? 0.24 : 0.2) * k, 960 + i * 9);
    }
    if (weather === 'cloudy') {
      drawCloud(ctx, w * 0.3, h * 0.16, 340, 70, tint(PALETTE.creamMist, 0.2, PALETTE.stream), 0.5 * k, 990);
      drawCloud(ctx, w * 0.72, h * 0.1, 300, 62, tint(PALETTE.creamMist, 0.2, PALETTE.stream), 0.45 * k, 991);
    }
    return;
  }

  if (weather === 'rainy' || weather === 'thunder') {
    if (weather === 'thunder') {
      // 每 2s 一次全屏白闪 0.08s（用 creamMist 提亮，纯白会超出纸感）
      const phase = (time % 2000) / 2000;
      if (phase < 0.04) {
        ctx.save();
        ctx.globalAlpha = 0.32 * (1 - phase / 0.04) * k;
        softBand(ctx, 0, -6, w, h + 12, PALETTE.creamMist, 0.95, 71);
        ctx.restore();
      }
    }
    const drops = 90;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < drops; i++) {
      const speed = 620 + rnd(i, 61) * 380;
      const x = ((w * rnd(i * 3, 63) + time * 0.08) % (w + 120)) - 60;
      const y = ((rnd(i * 5, 65) * h + (time * speed) / 1000) % (h + 80)) - 40;
      const len = 18 + rnd(i * 7, 67) * 22;
      ctx.globalAlpha = (0.16 + rnd(i, 69) * 0.2) * k;
      ctx.strokeStyle = PALETTE.stream;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + len);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 4; i++) {
      const t = cycle(time, 1600, i * 420);
      const cx = w * (0.24 + i * 0.18);
      const cy = h * (0.72 + rnd(i, 71) * 0.16);
      if (t < 0.62) drawRipple(ctx, cx, cy, 8 + t * 26, (0.4 - t * 0.5) * k);
    }
    return;
  }

  if (weather === 'rainbow') {
    ctx.save();
    ctx.globalAlpha = 0.22 * k;
    const colors = [PALETTE.blossom, PALETTE.sunset, PALETTE.sunbeam, PALETTE.leafLight, PALETTE.stream, PALETTE.twilight];
    for (let i = 0; i < colors.length; i++) {
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      const r = h * 0.46 - i * 9;
      const pts: P[] = [];
      for (let k2 = 0; k2 <= 28; k2++) {
        const a = Math.PI + (k2 / 28) * Math.PI;
        pts.push({ x: w * 0.62 + Math.cos(a) * r, y: h * 0.78 + Math.sin(a) * r });
      }
      tracePath(ctx, pts, false);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
}

/** 天气 tint 提示色（供 HUD/卡面共用，禁止在别处再写魔法色）。 */
export function weatherTint(id: WeatherId): string {
  if (id === 'sunny' || id === 'rainbow') return PALETTE.sunbeam;
  if (id === 'misty' || id === 'cloudy') return PALETTE.moss;
  if (id === 'rainy' || id === 'thunder') return PALETTE.stream;
  return PALETTE.creamMist;
}

/** 天气中文短名（不带 emoji；配置里的 cn 含 emoji，禁止直接画）。 */
export function weatherShort(id: WeatherId): string {
  if (id === 'sunny') return '晴';
  if (id === 'misty') return '阴';
  if (id === 'rainy') return '雨';
  if (id === 'rainbow') return '彩虹';
  if (id === 'cloudy') return '多云';
  if (id === 'thunder') return '雷雨';
  return '无';
}

/** 战斗开始时的光斑增强包络（0~1，前 0.35s 冲到 0.2 以上再回落）。 */
export function battleLightBoost(elapsedMs: number): number {
  if (elapsedMs < 0) return 0;
  const rise = TIMING.EASE_MS_MAX;
  if (elapsedMs < rise) return 1.6 * (elapsedMs / rise);
  const decay = 1 - (elapsedMs - rise) / 2200;
  return Math.max(0, decay) * 1.6;
}