/**
 * 营地 2.0（设计验证切片，不替换旧 CampScene）。
 *
 * 与旧营地的差别只在「界面骨架」：
 *   1. 顶栏只放身份/货币/天气，右侧 112×40 永久留给微信胶囊；
 *   2. 左侧是标题 + 两个主行动，右侧是宠物群像 —— 视线从「读」到「玩」一条直线；
 *   3. 底部一条木坞，四个入口 + 头像进度 + 设置，全部在拇指区，不再依赖背景里烘死的招牌；
 *   4. 背景是程序化水彩（渐变 + 树冠 + 光斑 + 萤火），不叠任何画死的文字。
 *
 * 本文件只读存档、只发导航回调；不改 core，也不碰旧场景。
 */
import { Scene } from './manager';
import { PALETTE, rgba, tint } from '../config/palette';
import { LAYOUT } from '../config/layout';
import { SpeciesId } from '../config/species';
import { getImage, getSurface } from '../render/assets';
import { drawButton } from '../render/ui';
import { fillWatercolor, roundedRectPoints, strokeInk, P, noiseAt, roundRectPath } from '../ui/brush';
import { setFont, textOutlined, textPlain } from '../ui/theme';
import { loadSave } from '../platform/storage';
import { playSfx } from '../platform/audio';
import { GestureEvent } from '../platform/input';
import { sceneBox } from '../platform/screen';

const W = LAYOUT.SCREEN_W;
const H = LAYOUT.SCREEN_H;

/** 底部木坞（拇指区）。 */
const DOCK = { x: 24, y: 604, w: 1232, h: 96 };
/** 主行动：开始对战 / 次行动：图鉴。 */
const CTA = { x: 64, y: 352, w: 212, h: 64 };
const CTA_2 = { x: 288, y: 352, w: 112, h: 64 };
/** 顶部天气卡：y=84 起，避开右上角微信胶囊（112×40）。 */
const WEATHER = { x: 896, y: 84, w: 360, h: 64 };
/** 底部四个入口。 */
const TILES = [
  { id: 'deck', label: '卡组', sub: 'DECK · 12', x: 250, badge: 2 },
  { id: 'collection', label: '图鉴', sub: 'DEX · 8', x: 394, badge: 0 },
  { id: 'shop', label: '商店', sub: 'SHOP · 3', x: 538, badge: 1 },
  { id: 'rank', label: '段位', sub: 'RANK · 青铜', x: 682, badge: 0 }
];
const TILE_W = 132;
const TILE_H = 64;
const SETTINGS = { x: 1176, y: 628, w: 48, h: 48 };

export interface Camp2Opts {
  onStartMatch: () => void;
  onOpenDeck: () => void;
  onOpenCollection: () => void;
  onOpenShop: () => void;
  onOpenRank: () => void;
  onOpenSettings: () => void;
}

interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function hitRect(id: string, r: { x: number; y: number; w: number; h: number }): Hit {
  return { id: id, x: r.x, y: r.y, w: r.w, h: r.h };
}

export class Camp2Scene implements Scene {
  readonly name = 'camp2';

  private t = 0;
  private opts: Camp2Opts;
  private hover = '';
  private pressed = '';
  private pressAt = -9999;
  private hits: Hit[];

  constructor(opts: Camp2Opts) {
    this.opts = opts;
    this.hits = [
      hitRect('battle', CTA),
      hitRect('collection2', CTA_2),
      hitRect('settings', SETTINGS)
    ];
    for (let i = 0; i < TILES.length; i++) {
      this.hits.push({ id: TILES[i].id, x: TILES[i].x, y: DOCK.y + 16, w: TILE_W, h: TILE_H });
    }
  }

  enter(): void {
    this.t = 0;
    this.hover = '';
  }

  tick(logicTime: number): void {
    this.t = logicTime;
    if (this.pressed && this.t - this.pressAt > 180) this.pressed = '';
  }

  render(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const box = sceneBox();
    const ox = (box.w - W) / 2;
    const oy = (box.h - H) / 2;

    // 极宽屏时先铺底，再把 1280×720 的设计框居中
    ctx.fillStyle = PALETTE.forestDeep;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.save();
    ctx.translate(ox, oy);

    this.drawBackdrop(ctx);
    this.drawLight(ctx);
    this.drawPets(ctx);
    this.drawFire(ctx);
    this.drawTop(ctx);
    this.drawHero(ctx);
    this.drawWeather(ctx);
    this.drawDock(ctx);
    this.drawFireflies(ctx);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* 背景（离屏缓存，不参与每帧重绘）                                    */
  /* ------------------------------------------------------------------ */

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    const bg = getSurface('camp2-bg-v1', W, H, (cv, c) => paintBackdrop(c));
    if (bg) {
      ctx.drawImage(bg, 0, 0, W, H);
      return;
    }
    paintBackdrop(ctx);
  }

  /** 暖光：静态底上再叠一层随呼吸变化的中心光，让画面不死。 */
  private drawLight(ctx: CanvasRenderingContext2D): void {
    const pulse = 0.82 + 0.18 * Math.sin(this.t / 2600);
    const g = ctx.createRadialGradient(910, 540, 30, 910, 540, 560);
    g.addColorStop(0, rgba(PALETTE.sunbeam, 0.18 * pulse));
    g.addColorStop(0.55, rgba(PALETTE.sunbeam, 0.05 * pulse));
    g.addColorStop(1, rgba(PALETTE.sunbeam, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  private drawPets(ctx: CanvasRenderingContext2D): void {
    const cast: { species: SpeciesId; x: number; y: number; scale: number; phase: number }[] = [
      { species: 'wolf', x: 664, y: 600, scale: 0.55, phase: 0.4 },
      { species: 'tiger', x: 792, y: 602, scale: 0.72, phase: 1.6 },
      { species: 'dog', x: 912, y: 600, scale: 0.56, phase: 2.7 },
      { species: 'elephant', x: 1022, y: 600, scale: 0.70, phase: 3.6 },
      { species: 'cat', x: 1118, y: 600, scale: 0.48, phase: 4.4 },
      { species: 'leopard', x: 1186, y: 598, scale: 0.44, phase: 5.1 }
    ];
    for (let i = 0; i < cast.length; i++) {
      const p = cast[i];
      const bob = Math.sin(this.t / 820 + p.phase) * 3.4;
      const sway = Math.sin(this.t / 5200 + p.phase) * 8;
      const img = getImage('unit-' + p.species);
      const size = 256 * p.scale;
      const x = p.x + sway;
      const y = p.y + bob;

      // 地面阴影
      ctx.save();
      ctx.globalAlpha = 0.22;
      const sh = blobPoints(x, y + 3, size * 0.3, size * 0.07, 10, 700 + i);
      fillWatercolor(ctx, sh, PALETTE.forestDeep, { alpha: 0.6, layers: 1, seedIndex: 701 + i });
      ctx.restore();

      if (img) {
        ctx.drawImage(img, x - size / 2, y - size, size, size);
      }
    }
  }

  /** 篝火：画在宠物前，压住脚边，给画面一个「营地」的锚点。 */
  private drawFire(ctx: CanvasRenderingContext2D): void {
    const x = 924;
    const y = 600;
    const flick = 1 + 0.1 * Math.sin(this.t / 130) + 0.05 * Math.sin(this.t / 51);

    // 火光：先铺一层暖色，让周围的草和动物边缘有点橙
    const glow = ctx.createRadialGradient(x, y - 44, 8, x, y - 44, 156);
    glow.addColorStop(0, rgba(PALETTE.sunset, 0.24));
    glow.addColorStop(0.55, rgba(PALETTE.sunset, 0.08));
    glow.addColorStop(1, rgba(PALETTE.sunset, 0));
    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(x - 160, y - 200, 320, 260);
    ctx.restore();

    // 石圈
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * 56;
      const py = y + Math.sin(a) * 15;
      const pts = blobPoints(px, py, 11, 9, 9, 720 + i);
      fillWatercolor(ctx, pts, PALETTE.soil, { alpha: 0.95, layers: 1, seedIndex: 721 + i });
      strokeInk(ctx, pts, { width: 2, close: true, seedIndex: 731 + i, jitter: 0.6 });
    }
    // 柴
    strokeInk(ctx, [{ x: x - 34, y: y }, { x: x + 34, y: y - 16 }], { width: 8, color: PALETTE.bark, seedIndex: 740 });
    strokeInk(ctx, [{ x: x - 30, y: y - 14 }, { x: x + 30, y: y + 3 }], { width: 8, color: PALETTE.barkLight, seedIndex: 741 });

    // 火焰三层（水彩）
    const flame = (s: number, color: string, alpha: number, seed: number): void => {
      const fh = 74 * s * flick;
      const pts: P[] = [
        { x: x - 27 * s, y: y - 10 },
        { x: x - 13 * s, y: y - 10 - fh * 0.55 },
        { x: x + 1 * s, y: y - 10 - fh },
        { x: x + 15 * s, y: y - 10 - fh * 0.5 },
        { x: x + 27 * s, y: y - 10 }
      ];
      fillWatercolor(ctx, pts, color, { alpha: alpha, layers: 2, wetEdge: true, seedIndex: seed });
    };
    flame(1.42, PALETTE.sunset, 0.6, 750);
    flame(1.08, PALETTE.sunbeam, 0.78, 751);
    flame(0.62, PALETTE.creamMist, 0.85, 752);
  }

  private drawFireflies(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < 14; i++) {
      const p = this.t / (2600 + i * 170) + i * 0.7;
      const x = 560 + ((i * 97) % 660) + Math.sin(p) * 16;
      const y = 250 + ((i * 61) % 320) + Math.cos(p * 0.8) * 14;
      const a = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(p * 2.2));
      const r = 1.3 + (i % 3) * 0.5;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = i % 4 === 0 ? PALETTE.creamMist : PALETTE.sunbeam;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a * 0.18;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 顶栏                                                               */
  /* ------------------------------------------------------------------ */

  private drawTop(ctx: CanvasRenderingContext2D): void {
    // 品牌：叶片圆牌 + 两行字
    const cx = 47;
    const cy = 40;
    const ring = blobPoints(cx, cy, 23, 23, 18, 800);
    fillWatercolor(ctx, ring, PALETTE.leafMid, { alpha: 0.96, layers: 1, seedIndex: 801 });
    strokeInk(ctx, ring, { width: 2.4, close: true, color: PALETTE.forestDeep, seedIndex: 802 });
    drawLeaf(ctx, cx + 1, cy - 2, 13, -0.7, PALETTE.creamMist, 803);

    textOutlined(ctx, '萌宠乱斗', 80, 33, 23, PALETTE.creamMist, 'left', 2.4, rgba(PALETTE.forestDeep, 0.7));
    textPlain(ctx, 'FOREST CAMP', 80, 53, 9, rgba(PALETTE.creamMist, 0.55), 'left', 'bold');

    // 货币：金阳 + 爪印币 + 星辉（左上，不碰右上胶囊）
    const save = loadSave();
    this.drawChip(ctx, 224, 20, 118, 40, 'sun', '' + save.coins);
    this.drawChip(ctx, 354, 20, 108, 40, 'star', '' + save.stars);
  }

  private drawChip(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
    icon: 'sun' | 'star' | 'paw', value: string,
  ): void {
    const pts = roundedRectPoints(x, y, w, h, h / 2);
    fillWatercolor(ctx, pts, PALETTE.inkSoft, { alpha: 0.42, layers: 1, wetEdge: true, seedIndex: 810 + x });
    strokeInk(ctx, pts, { width: 1.6, close: true, color: rgba(PALETTE.creamMist, 0.26), seedIndex: 811 + x });
    const ix = x + 22;
    const iy = y + h / 2;
    if (icon === 'sun') drawSun(ctx, ix, iy, 10, 812);
    else if (icon === 'star') drawStar(ctx, ix, iy, 10, 813);
    else drawPaw(ctx, ix, iy, 10, 814);
    setFont(ctx, 19, 'bold');
    ctx.fillStyle = PALETTE.creamMist;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, ix + 18, iy + 1);
    ctx.textBaseline = 'alphabetic';
  }

  /* ------------------------------------------------------------------ */
  /* 主视觉                                                             */
  /* ------------------------------------------------------------------ */

  private drawHero(ctx: CanvasRenderingContext2D): void {
    // eyebrow
    strokeInk(ctx, [{ x: 64, y: 128 }, { x: 100, y: 128 }], {
      width: 2, color: rgba(PALETTE.sunbeam, 0.65), seedIndex: 820, jitter: 0.4
    });
    textPlain(ctx, 'FOREST CAMP · 第 4 回合', 112, 128, 14, rgba(PALETTE.creamMist, 0.62), 'left', 'bold');

    // 标题：先压一层暗影再描边，浅色字在深林里也不糊
    textOutlined(ctx, '萌宠乱斗', 65, 218, 90, rgba(PALETTE.forestDeep, 0.35), 'left', 5, rgba(PALETTE.forestDeep, 0.35));
    textOutlined(ctx, '萌宠乱斗', 64, 214, 90, PALETTE.creamMist, 'left', 3, rgba(PALETTE.forestDeep, 0.9));

    textPlain(ctx, '带 6 只小动物 走上林间草地。', 66, 296, 21, rgba(PALETTE.creamMist, 0.9), 'left', 'bold');
    textPlain(ctx, '用克制、天气与站位，赢下 8 个回合。', 66, 326, 21, rgba(PALETTE.creamMist, 0.9), 'left', 'bold');

    const ctaDown = this.pressed === 'battle' ? 'pressed' : 'normal';
    if (this.hover === 'battle' || this.pressed === 'battle') {
      const glow = roundedRectPoints(CTA.x - 10, CTA.y - 8, CTA.w + 20, CTA.h + 18, 30);
      fillWatercolor(ctx, glow, PALETTE.sunbeam, { alpha: 0.18, layers: 1, seedIndex: 830 });
    }
    drawButton(ctx, CTA.x, CTA.y, CTA.w, CTA.h, '开始对战', {
      state: ctaDown, time: this.t, radius: 22, tone: 'berry'
    });

    // 次行动：纸牌，不做第二颗红按钮
    const paper = roundedRectPoints(CTA_2.x, CTA_2.y, CTA_2.w, CTA_2.h, 20);
    fillWatercolor(ctx, paper, PALETTE.paper, { alpha: 0.96, layers: 1, wetEdge: true, seedIndex: 840 });
    strokeInk(ctx, paper, { width: 2.4, close: true, color: PALETTE.bark, seedIndex: 841 });
    if (this.hover === 'collection2') {
      fillWatercolor(ctx, paper, PALETTE.sunbeam, { alpha: 0.18, layers: 1, seedIndex: 842 });
    }
    textOutlined(ctx, '图鉴', CTA_2.x + CTA_2.w / 2, CTA_2.y + CTA_2.h / 2 + 1, 21, PALETTE.inkSoft, 'center', 1.6, PALETTE.paper);

    // 上一局摘要
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = PALETTE.sunbeam;
    ctx.beginPath();
    ctx.arc(70, 440, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    textPlain(ctx, '上一局 · 第 8 回合胜利 · MVP 虎', 82, 440, 14, rgba(PALETTE.creamMist, 0.55), 'left');
  }

  private drawWeather(ctx: CanvasRenderingContext2D): void {
    const pts = roundedRectPoints(WEATHER.x, WEATHER.y, WEATHER.w, WEATHER.h, 18);
    fillWatercolor(ctx, pts, tint(PALETTE.inkSoft, 0.34, PALETTE.forestDeep), { alpha: 0.8, layers: 1, wetEdge: true, seedIndex: 850 });
    strokeInk(ctx, pts, { width: 1.6, close: true, color: rgba(PALETTE.creamMist, 0.3), seedIndex: 851 });
    drawSun(ctx, WEATHER.x + 32, WEATHER.y + 32, 13, 852);
    textPlain(ctx, '今日 · 林间晴', WEATHER.x + 56, WEATHER.y + 23, 17, PALETTE.creamMist, 'left', 'bold');
    textPlain(ctx, '我方攻击 +12% · 敌方每 3s 流失 1% 血', WEATHER.x + 56, WEATHER.y + 45, 12.5, rgba(PALETTE.creamMist, 0.72), 'left');
  }

  /* ------------------------------------------------------------------ */
  /* 底坞                                                               */
  /* ------------------------------------------------------------------ */

  private drawDock(ctx: CanvasRenderingContext2D): void {
    const pts = roundedRectPoints(DOCK.x, DOCK.y, DOCK.w, DOCK.h, 26);
    fillWatercolor(ctx, pts, tint(PALETTE.bark, 0.58, PALETTE.inkSoft), { alpha: 0.99, layers: 1, wetEdge: true, seedIndex: 860 });
    strokeInk(ctx, pts, { width: 2.6, close: true, color: rgba(PALETTE.creamMist, 0.26), seedIndex: 861 });
    strokeInk(ctx, [
      { x: DOCK.x + 40, y: DOCK.y + 4 }, { x: DOCK.x + DOCK.w - 40, y: DOCK.y + 4 }
    ], { width: 2, color: rgba(PALETTE.creamMist, 0.16), seedIndex: 862, jitter: 0.5 });

    // 头像：草帽男孩脸部
    const ax = 40;
    const ay = 620;
    const ar = 32;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + ar, ay + ar, ar - 2, 0, Math.PI * 2);
    ctx.clip();
    const coach = getImage('coach-boy');
    if (coach) ctx.drawImage(coach, 0, 0, 256, 300, ax, ay - 6, 64, 75);
    else {
      ctx.fillStyle = PALETTE.soil;
      ctx.fillRect(ax, ay, 64, 64);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = rgba(PALETTE.sunbeam, 0.75);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ax + ar, ay + ar, ar - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    textPlain(ctx, '小园丁', 118, 638, 19, PALETTE.creamMist, 'left', 'bold');
    textPlain(ctx, 'Lv.6', 190, 638, 11, rgba(PALETTE.sunbeam, 0.9), 'left', 'bold');
    // 段位进度
    const barW = 112;
    const barX = 118;
    const barY = 654;
    ctx.fillStyle = rgba(PALETTE.forestDeep, 0.9);
    roundRectPath(ctx, barX, barY, barW, 5, 2.5, 0, 863);
    ctx.fill();
    ctx.fillStyle = PALETTE.sunbeam;
    roundRectPath(ctx, barX, barY, 74, 5, 2.5, 0, 864);
    ctx.fill();
    textPlain(ctx, '青铜 III · 距白银 36', 118, 672, 10, rgba(PALETTE.creamMist, 0.5), 'left');

    // 分隔
    strokeInk(ctx, [{ x: 236, y: DOCK.y + 18 }, { x: 236, y: DOCK.y + DOCK.h - 18 }], {
      width: 1.6, color: rgba(PALETTE.creamMist, 0.18), seedIndex: 865, jitter: 0.4
    });

    for (let i = 0; i < TILES.length; i++) this.drawTile(ctx, TILES[i]);

    // 设置
    const s = SETTINGS;
    const sp = roundedRectPoints(s.x, s.y, s.w, s.h, 24);
    fillWatercolor(ctx, sp, this.hover === 'settings' ? PALETTE.sunbeam : PALETTE.paper, {
      alpha: 0.92, layers: 1, wetEdge: true, seedIndex: 866
    });
    strokeInk(ctx, sp, { width: 2, close: true, color: PALETTE.bark, seedIndex: 867 });
    drawSliders(ctx, s.x + 12, s.y + 12, 24, PALETTE.inkSoft, 868);
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    tile: { id: string; label: string; sub: string; x: number; badge: number },
  ): void {
    const y = DOCK.y + 16;
    const active = this.hover === tile.id;
    const down = this.pressed === tile.id ? 2 : 0;
    const pts = roundedRectPoints(tile.x, y + down, TILE_W, TILE_H, 16);
    fillWatercolor(ctx, pts, active ? PALETTE.sunbeam : PALETTE.paper, {
      alpha: 0.95, layers: 1, wetEdge: true, seedIndex: 870 + tile.x
    });
    strokeInk(ctx, pts, { width: 2, close: true, color: PALETTE.bark, seedIndex: 871 + tile.x });

    const ix = tile.x + 27;
    const iy = y + 32 + down;
    if (tile.id === 'deck') drawCardsIcon(ctx, ix, iy, 24, PALETTE.inkSoft, 872);
    else if (tile.id === 'collection') drawBookIcon(ctx, ix, iy, 24, PALETTE.inkSoft, 873);
    else if (tile.id === 'shop') drawBagIcon(ctx, ix, iy, 24, PALETTE.inkSoft, 874);
    else drawMedalIcon(ctx, ix, iy, 24, PALETTE.inkSoft, 875);

    textPlain(ctx, tile.label, tile.x + 48, y + 27 + down, 17, PALETTE.inkSoft, 'left', 'bold');
    textPlain(ctx, tile.sub, tile.x + 48, y + 46 + down, 9, rgba(PALETTE.inkSoft, 0.55), 'left', 'bold');

    if (tile.badge > 0) {
      ctx.save();
      ctx.fillStyle = PALETTE.berry;
      ctx.beginPath();
      ctx.arc(tile.x + TILE_W - 12, y + 10 + down, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      textPlain(ctx, '' + tile.badge, tile.x + TILE_W - 12, y + 10 + down, 10, PALETTE.creamMist, 'center', 'bold');
    }
  }

  /* ------------------------------------------------------------------ */
  /* 手势                                                               */
  /* ------------------------------------------------------------------ */

  gesture(e: GestureEvent): void {
    if (e.type === 'move') {
      this.hover = this.hit(e.x, e.y);
      return;
    }
    if (e.type !== 'up' || e.wasDrag) return;
    const id = this.hit(e.x, e.y);
    if (!id) return;
    playSfx('tap');
    this.pressed = id;
    this.pressAt = this.t;
    if (id === 'battle') this.opts.onStartMatch();
    else if (id === 'collection' || id === 'collection2') this.opts.onOpenCollection();
    else if (id === 'deck') this.opts.onOpenDeck();
    else if (id === 'shop') this.opts.onOpenShop();
    else if (id === 'rank') this.opts.onOpenRank();
    else if (id === 'settings') this.opts.onOpenSettings();
  }

  private hit(x: number, y: number): string {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x - 6 && x <= h.x + h.w + 6 && y >= h.y - 6 && y <= h.y + h.h + 8) return h.id;
    }
    return '';
  }
}

/* -------------------------------------------------------------------- */
/* 背景绘制（只在离屏画布跑一次）                                        */
/* -------------------------------------------------------------------- */

function paintBackdrop(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, tint(PALETTE.forestDeep, 0.04, PALETTE.inkSoft));
  g.addColorStop(0.44, PALETTE.forestDeep);
  g.addColorStop(0.76, tint(PALETTE.forestMid, 0.14, PALETTE.forestDeep));
  g.addColorStop(1, tint(PALETTE.forestDeep, 0.08, PALETTE.inkSoft));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 中央暖光：所有宠物站在光里，四周自然压暗
  const rg = ctx.createRadialGradient(900, 520, 20, 900, 520, 620);
  rg.addColorStop(0, rgba(PALETTE.sunbeam, 0.16));
  rg.addColorStop(0.55, rgba(PALETTE.sunbeam, 0.045));
  rg.addColorStop(1, rgba(PALETTE.sunbeam, 0));
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  // 地面：深苔色，不抢宠物
  fillWatercolor(ctx, blobPoints(640, 700, 760, 150, 26, 930), PALETTE.forestMid, {
    alpha: 0.45, layers: 2, wetEdge: true, seedIndex: 931
  });
  fillWatercolor(ctx, blobPoints(880, 650, 540, 110, 26, 932), PALETTE.leafMid, {
    alpha: 0.12, layers: 1, seedIndex: 933
  });

  // 两侧树干剪影，框住画面
  fillWatercolor(ctx, [
    { x: 0, y: 0 }, { x: 74, y: 0 }, { x: 58, y: 240 }, { x: 70, y: 520 }, { x: 30, y: 720 }, { x: 0, y: 720 }
  ], PALETTE.inkSoft, { alpha: 0.4, layers: 2, wetEdge: true, seedIndex: 940 });
  fillWatercolor(ctx, [
    { x: W, y: 0 }, { x: W - 70, y: 0 }, { x: W - 52, y: 260 }, { x: W - 64, y: 540 }, { x: W - 26, y: 720 }, { x: W, y: 720 }
  ], PALETTE.inkSoft, { alpha: 0.36, layers: 2, wetEdge: true, seedIndex: 941 });

  // 光柱：从右上斜插到草地
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = PALETTE.sunbeam;
  ctx.beginPath();
  ctx.moveTo(980, 0);
  ctx.lineTo(1110, 0);
  ctx.lineTo(760, 640);
  ctx.lineTo(610, 640);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.035;
  ctx.beginPath();
  ctx.moveTo(1140, 0);
  ctx.lineTo(1200, 0);
  ctx.lineTo(930, 600);
  ctx.lineTo(850, 600);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 四边压暗（比全局 vignette 更稳，不依赖中段透明度）
  const top = ctx.createLinearGradient(0, 0, 0, 250);
  top.addColorStop(0, rgba(PALETTE.inkSoft, 0.5));
  top.addColorStop(1, rgba(PALETTE.inkSoft, 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 250);

  const bottom = ctx.createLinearGradient(0, 430, 0, H);
  bottom.addColorStop(0, rgba(PALETTE.inkSoft, 0));
  bottom.addColorStop(1, rgba(PALETTE.inkSoft, 0.52));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 430, W, H - 430);

  const left = ctx.createLinearGradient(0, 0, 260, 0);
  left.addColorStop(0, rgba(PALETTE.inkSoft, 0.3));
  left.addColorStop(1, rgba(PALETTE.inkSoft, 0));
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, 260, H);

  const right = ctx.createLinearGradient(W - 240, 0, W, 0);
  right.addColorStop(0, rgba(PALETTE.inkSoft, 0));
  right.addColorStop(1, rgba(PALETTE.inkSoft, 0.3));
  ctx.fillStyle = right;
  ctx.fillRect(W - 240, 0, 240, H);

  // 地面细碎的点：草簇/小石
  for (let i = 0; i < 26; i++) {
    const x = 640 + ((i * 113) % 640);
    const y = 606 + ((i * 47) % 100);
    const r = 1.2 + (i % 3) * 0.7;
    ctx.save();
    ctx.globalAlpha = 0.12 + (i % 4) * 0.025;
    ctx.fillStyle = i % 3 === 0 ? PALETTE.sunbeam : PALETTE.moss;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* -------------------------------------------------------------------- */
/* 小工具                                                               */
/* -------------------------------------------------------------------- */

function blobPoints(cx: number, cy: number, rx: number, ry: number, n: number, seed: number): P[] {
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (noiseAt(i, seed) - 0.5) * 0.12;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

function drawLeaf(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, color: string, seed: number,
): void {
  const pts: P[] = [];
  for (let i = 0; i <= 12; i++) {
    const p = i / 12;
    const w = Math.sin(p * Math.PI) * size * 0.55;
    pts.push({ x: x + Math.cos(rot) * (p * size - size / 2) - Math.sin(rot) * w, y: y + Math.sin(rot) * (p * size - size / 2) + Math.cos(rot) * w });
  }
  for (let i = 12; i >= 0; i--) {
    const p = i / 12;
    const w = Math.sin(p * Math.PI) * size * 0.55;
    pts.push({ x: x + Math.cos(rot) * (p * size - size / 2) + Math.sin(rot) * w, y: y + Math.sin(rot) * (p * size - size / 2) - Math.cos(rot) * w });
  }
  fillWatercolor(ctx, pts, color, { alpha: 0.9, layers: 1, seedIndex: seed });
  strokeInk(ctx, pts, { width: 1.6, close: true, color: rgba(PALETTE.forestDeep, 0.55), seedIndex: seed + 1 });
}

function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void {
  ctx.save();
  ctx.strokeStyle = PALETTE.sunbeam;
  ctx.fillStyle = PALETTE.sunbeam;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
    ctx.lineTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void {
  ctx.save();
  ctx.fillStyle = PALETTE.sunbeam;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPaw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void {
  ctx.save();
  ctx.fillStyle = PALETTE.sunbeam;
  for (let i = 0; i < 4; i++) {
    const px = x - r * 0.7 + i * r * 0.47;
    const py = y - r * 0.55 + (i === 0 || i === 3 ? r * 0.15 : 0);
    ctx.beginPath();
    ctx.arc(px, py, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y + r * 0.25);
  ctx.scale(1, 0.8);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function iconInk(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawCardsIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, seed: number): void {
  iconInk(ctx, color);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.5;
  roundRectPath(ctx, -s * 0.42, -s * 0.5, s * 0.66, s * 0.9, 3, 0, seed);
  ctx.stroke();
  ctx.globalAlpha = 1;
  roundRectPath(ctx, -s * 0.3, -s * 0.56, s * 0.72, s * 0.96, 3, 0, seed + 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, -s * 0.18);
  ctx.lineTo(s * 0.18, -s * 0.18);
  ctx.moveTo(-s * 0.12, 0);
  ctx.lineTo(s * 0.18, 0);
  ctx.stroke();
  ctx.restore();
}

function drawBookIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, seed: number): void {
  iconInk(ctx, color);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.42);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.55, -s * 0.62, -s * 0.28);
  ctx.lineTo(-s * 0.62, s * 0.36);
  ctx.quadraticCurveTo(-s * 0.46, s * 0.18, 0, s * 0.4);
  ctx.quadraticCurveTo(s * 0.46, s * 0.18, s * 0.62, s * 0.36);
  ctx.lineTo(s * 0.62, -s * 0.28);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.55, 0, -s * 0.42);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.38);
  ctx.lineTo(0, s * 0.36);
  ctx.stroke();
  ctx.restore();
}

function drawBagIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, seed: number): void {
  iconInk(ctx, color);
  ctx.save();
  ctx.translate(x, y);
  roundRectPath(ctx, -s * 0.46, -s * 0.22, s * 0.92, s * 0.74, 5, 0, seed);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.22, s * 0.26, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMedalIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, seed: number): void {
  iconInk(ctx, color);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, s * 0.5);
  ctx.lineTo(-s * 0.1, s * 0.06);
  ctx.moveTo(s * 0.28, s * 0.5);
  ctx.lineTo(s * 0.1, s * 0.06);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.18, s * 0.34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 0.18, s * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSliders(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, seed: number): void {
  iconInk(ctx, color);
  const rows = [0, 0.33, 0.66];
  for (let i = 0; i < 3; i++) {
    const yy = y + rows[i] * s;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + s, yy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + s * (0.3 + i * 0.22), yy, 3, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.paper;
    ctx.fill();
    ctx.stroke();
  }
}
