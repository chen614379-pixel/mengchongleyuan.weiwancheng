/**
 * 主界面：手绘森林营地（§13.5）。
 * 底图优先用美术图 `assets/bg/camp.jpg`（把图上烘死的右上角货币盖成真实 HUD），
 * 没有图时用程序化三层森林 + 营地物件兜底。入口全部是场景里的实体物件：
 * 树屋 → 对战、篝火 → 图鉴、小溪 → 商店、树梢旗 → 段位、齿轮 → 设置。
 */
import { Scene, push } from './manager';
import { PALETTE, rgba } from '../config/palette';
import { LAYOUT } from '../config/layout';
import { drawSky, drawForestLayer, drawSunSpecks, drawVignette } from '../render/forest';
import { getImage } from '../render/assets';
import { drawWoodPanel, drawButton, drawGear, drawSunCoin, drawScoreboardPanel } from '../render/ui';
import { drawCoach } from '../render/coach';
import { drawUnit } from '../render/unit';
import { fillWatercolor, roundRectPath, strokeInk, noiseAt } from '../ui/brush';
import { drawCurrencyChips } from './deck';
import { setFont, textOutlined } from '../ui/theme';
import { loadSave } from '../platform/storage';
import { playSfx } from '../platform/audio';
import { SpeciesId } from '../config/species';
import { GestureEvent } from '../platform/input';
import { drawPlateCover, sceneBox } from '../platform/screen';

export interface CampSceneOpts {
  onStartMatch: () => void;
  onOpenCollection: () => void;
  onOpenShop: () => void;
  onOpenRank: () => void;
  onOpenSettings: () => void;
  onOpenDeck: () => void;
}

interface Hotspot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** 用美术底图时，底图上这块招牌的字要由自绘木牌盖掉（美术图里没有对应入口时） */
  relabel: boolean;
}

export class CampScene implements Scene {
  readonly name = 'camp';
  private t = 0;
  private opts: CampSceneOpts;
  /** 热区一律对齐美术底图 `assets/bg/bg-camp.jpg` 里画好的木牌招牌（1280×720 逻辑坐标）。 */
  private spots: Hotspot[] = [
    { id: 'battle', x: 366, y: 292, w: 92, h: 50, label: '对战', relabel: false },
    { id: 'collection', x: 434, y: 412, w: 70, h: 56, label: '图鉴', relabel: false },
    { id: 'deck', x: 592, y: 402, w: 116, h: 60, label: '卡组', relabel: true },
    { id: 'rank', x: 914, y: 392, w: 100, h: 54, label: '段位', relabel: true },
    { id: 'shop', x: 1098, y: 368, w: 88, h: 56, label: '商店', relabel: false }
  ];
  private hover = -1;
  private pressFlash = 0;
  private pressSpot = -1;
  /** 营地里闲逛的三只动物（用美术立绘） */
  private wander: { species: SpeciesId; baseX: number; baseY: number; phase: number; scale: number }[] = [
    { species: 'tiger', baseX: 250, baseY: 520, phase: 0.0, scale: 0.62 },
    { species: 'dog', baseX: 640, baseY: 560, phase: 1.7, scale: 0.55 },
    { species: 'elephant', baseX: 900, baseY: 545, phase: 3.1, scale: 0.6 }
  ];

  constructor(opts: CampSceneOpts) {
    this.opts = opts;
  }

  enter(): void {
    this.t = 0;
  }

  tick(logicTime: number): void {
    this.t = logicTime;
    if (this.pressFlash > 0) this.pressFlash -= 20;
  }

  render(ctx: any, renderTime: number): void {
    const w = LAYOUT.SCREEN_W;
    const h = LAYOUT.SCREEN_H;
    const camp = getImage('bg-camp');
    if (camp) {
      this.renderArt(ctx, w, h, renderTime);
      return;
    }
    this.renderProceduralCamp(ctx, w, h, renderTime);
  }

  /**
   * 美术底图模式：底图里已经画好招牌、齿轮、动物与饲养员，
   * 所以这里只补「底图不可能画进去」的东西——真实货币 HUD、热区反馈。
   */
  private renderArt(ctx: any, w: number, h: number, renderTime: number): void {
    const camp = getImage('bg-camp');
    if (!camp) return;
    drawPlateCover(ctx, camp, 0, 0, w, h);

    // 真实货币（盖住底图上烘死的 ☀12 / 🐾1280 / ⭐3）
    const save = loadSave();
    drawCurrencyChips(ctx, 22, renderTime, { coins: save.coins, stars: save.stars }, 410);

    // 悬停/按下：招牌背后点一层暖色水彩（底图招牌本身不多抹一笔）
    for (let i = 0; i < this.spots.length; i++) {
      if (this.hover === i || (this.pressFlash > 0 && this.pressSpot === i)) {
        this.drawHotspotGlow(ctx, this.spots[i], renderTime);
      }
    }
    // 美术图里没有的入口：用同风格木牌盖掉底图上学错的招牌字
    for (let i = 0; i < this.spots.length; i++) {
      if (this.spots[i].relabel) this.drawRelabel(ctx, this.spots[i]);
    }
  }

  /** 招牌反馈：柔和暖光水彩（呼吸），只描在招牌外圈，不糊住字。 */
  private drawHotspotGlow(ctx: any, s: Hotspot, t: number): void {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const rx = s.w * 0.74;
    const ry = s.h * 0.92;
    const seed = 640 + Math.round(s.x);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const k = 1 + noiseAt(i, seed) * 0.09;
      pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    fillWatercolor(ctx, pts, PALETTE.sunbeam, {
      alpha: 0.30 + 0.07 * Math.sin(t / 220), layers: 2, wetEdge: true, seedIndex: seed
    });
  }

  /** 自绘木牌：盖掉底图上字不对的招牌。 */
  private drawRelabel(ctx: any, s: Hotspot): void {
    drawWoodPanel(ctx, s.x, s.y, s.w, s.h, { radius: 10, tone: 'bark', seedIndex: 500 + Math.round(s.x) });
    textOutlined(ctx, s.label, s.x + s.w / 2, s.y + s.h / 2 + 10, LAYOUT.FONT.h2, PALETTE.inkSoft, 'center');
  }

  gesture(e: GestureEvent): void {
    if (e.type === 'move') {
      this.hover = this.hitTest(e.x, e.y);
      return;
    }
    if (e.type !== 'up' || e.wasDrag) return;
    const idx = this.hitTest(e.x, e.y);
    if (idx < 0) {
      if (this.inGear(e.x, e.y)) {
        playSfx('tap');
        this.opts.onOpenSettings();
      }
      return;
    }
    playSfx('tap');
    this.pressFlash = 320;
    this.pressSpot = idx;
    const id = this.spots[idx].id;
    if (id === 'battle') this.opts.onStartMatch();
    else if (id === 'deck') this.opts.onOpenDeck();
    else if (id === 'collection') this.opts.onOpenCollection();
    else if (id === 'shop') this.opts.onOpenShop();
    else if (id === 'rank') this.opts.onOpenRank();
  }

  private inGear(x: number, y: number): boolean {
    // 美术底图上画好的齿轮在 (22,18)–(98,96)，热区放宽一点更好点
    if (getImage('bg-camp')) return x >= 8 && x <= 108 && y >= 2 && y <= 106;
    const g = LAYOUT.GEAR;
    return x >= g.x - 10 && x <= g.x + g.size + 10 && y >= g.y - 10 && y <= g.y + g.size + 10;
  }

  private hitTest(x: number, y: number): number {
    for (let i = this.spots.length - 1; i >= 0; i--) {
      const s = this.spots[i];
      if (x >= s.x - 14 && x <= s.x + s.w + 14 && y >= s.y - 14 && y <= s.y + s.h + 14) return i;
    }
    return -1;
  }

  private drawPlate(ctx: any, s: Hotspot, active: boolean, t: number): void {
    const grow = active ? 1.06 : 1.0;
    const w = s.w * grow;
    const h = s.h * grow;
    const x = s.x - (w - s.w) / 2;
    const y = s.y - (h - s.h) / 2;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push({ x: x + w / 2 + Math.cos(a) * (w / 2), y: y + h / 2 + Math.sin(a) * (h / 2) });
    }
    fillWatercolor(ctx, pts, active ? PALETTE.sunbeam : PALETTE.soil, { alpha: active ? 0.5 : 0.28, layers: 2, seedIndex: 40 + s.x });
    strokeInk(ctx, pts, { width: 3, close: true, seedIndex: 41 + s.x });
    setFont(ctx, LAYOUT.FONT.h2, 700);
    ctx.fillStyle = PALETTE.creamMist;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.label, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  private renderProceduralCamp(ctx: any, w: number, h: number, t: number): void {
    // 自适应全屏：天空与远景森林铺满逻辑可视区，营地陈设仍按 1280×720 居中
    const box = sceneBox();
    const ox = (box.w - w) / 2;
    const oy = (box.h - h) / 2;
    ctx.save();
    ctx.translate(box.x - ox, box.y - oy);
    drawSky(ctx, box.w, box.h, t);
    drawForestLayer(ctx, box.w, box.h, 0, 'far', t);
    ctx.translate(ox, oy);
    // 树屋（对战入口）
    this.drawTreeHouse(ctx, 300, 400, t);
    drawForestLayer(ctx, w, h, 0, 'mid', t);
    // 篝火
    this.drawCampfire(ctx, 560, 610, t);
    // 小溪
    this.drawStream(ctx, 950, 720, t);
    drawForestLayer(ctx, w, h, 0, 'near', t);
    drawSunSpecks(ctx, w, h, t, 1.0);

    // 营地里的动物（轻微呼吸 + 左右踱步）
    for (let i = 0; i < this.wander.length; i++) {
      const wd = this.wander[i];
      const bob = Math.sin(t / 900 + wd.phase) * 5;
      const dx = Math.sin(t / 5200 + wd.phase) * 22;
      drawUnit(ctx, {
        id: -1 - i, species: wd.species, level: 1, hp: 100, maxHp: 100, shield: 0, alive: true,
        fx: { hitFlash: 0, attackPulse: 0, deathFirefly: 0, counterHit: 0, shieldRipple: 0 }
      }, {
        x: wd.baseX + dx, y: wd.baseY + bob, scale: wd.scale, time: t,
        showRing: false, selected: false, dim: false, facing: dx > 0 ? 1 : -1
      });
    }

    // 饲养员站在篝火旁
    drawCoach(ctx, 470, 560, this.pressFlash > 0 ? 'proud' : 'idle', t);

    // 招牌热区
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const active = this.hover === i || (this.pressFlash > 0 && this.pressSpot === i);
      this.drawPlate(ctx, s, active, t);
    }

    // 标题木牌
    drawWoodPanel(ctx, w / 2 - 220, 28, 440, 84, { radius: LAYOUT.PANEL_RADIUS, tone: 'bark' });
    textOutlined(ctx, '萌宠乱斗', w / 2, 82, LAYOUT.FONT.h1 * 1.15, PALETTE.creamMist, 'center');
    setFont(ctx, LAYOUT.FONT.badge, 500);
    ctx.fillStyle = rgba(PALETTE.creamMist, 0.9);
    ctx.textAlign = 'center';
    ctx.fillText('林间营地', w / 2, 122);
    ctx.textAlign = 'start';

    // 真实货币 + 齿轮设置 + 暗角
    const save = loadSave();
    drawCurrencyChips(ctx, 22, t, { coins: save.coins, stars: save.stars }, 410);
    drawGear(ctx, LAYOUT.GEAR.x, LAYOUT.GEAR.y, LAYOUT.GEAR.size, this.pressSpot === 99);
    ctx.translate(-ox, -oy);
    drawVignette(ctx, box.w, box.h);
    ctx.restore();
  }

  private drawTreeHouse(ctx: any, x: number, y: number, t: number): void {
    // 树干
    strokeInk(ctx, [{ x: x, y: y }, { x: x + 10, y: y - 160 }, { x: x + 40, y: y - 300 }], { width: 3, seedIndex: 60 });
    fillWatercolor(ctx, [
      { x: x - 34, y: y + 40 }, { x: x + 74, y: y + 40 }, { x: x + 54, y: y - 300 }, { x: x - 14, y: y - 300 }
    ], PALETTE.bark, { alpha: 0.95, layers: 2, seedIndex: 61 });
    // 屋身
    const hx = x - 10;
    const hy = y - 400;
    roundRectPath(ctx, hx, hy, 150, 110, 14, 1.0, 62);
    fillWatercolor(ctx, [
      { x: hx, y: hy }, { x: hx + 150, y: hy }, { x: hx + 150, y: hy + 110 }, { x: hx, y: hy + 110 }
    ], PALETTE.barkLight, { alpha: 0.96, layers: 2, seedIndex: 63 });
    strokeInk(ctx, [
      { x: hx, y: hy }, { x: hx + 150, y: hy }, { x: hx + 150, y: hy + 110 }, { x: hx, y: hy + 110 }
    ], { width: 3, close: true, seedIndex: 64 });
    // 屋顶
    fillWatercolor(ctx, [
      { x: hx - 26, y: hy }, { x: hx + 75, y: hy - 62 }, { x: hx + 176, y: hy }
    ], PALETTE.berry, { alpha: 0.82, layers: 2, seedIndex: 65 });
    strokeInk(ctx, [
      { x: hx - 26, y: hy }, { x: hx + 75, y: hy - 62 }, { x: hx + 176, y: hy }, { x: hx - 26, y: hy }
    ], { width: 3, close: true, seedIndex: 66 });
    // 窗（暖光呼吸）
    const glow = 0.55 + 0.12 * Math.sin(t / 700);
    fillWatercolor(ctx, [
      { x: hx + 22, y: hy + 34 }, { x: hx + 62, y: hy + 34 }, { x: hx + 62, y: hy + 74 }, { x: hx + 22, y: hy + 74 }
    ], PALETTE.sunbeam, { alpha: glow, layers: 2, seedIndex: 67 });
    strokeInk(ctx, [
      { x: hx + 22, y: hy + 34 }, { x: hx + 62, y: hy + 34 }, { x: hx + 62, y: hy + 74 }, { x: hx + 22, y: hy + 74 }
    ], { width: 2.6, close: true, seedIndex: 68 });
    // 梯子
    for (let i = 0; i < 6; i++) {
      const ly = y - 280 + i * 26;
      strokeInk(ctx, [{ x: x + 40, y: ly }, { x: x + 96, y: ly }], { width: 2.6, seedIndex: 70 + i });
    }
    strokeInk(ctx, [{ x: x + 40, y: y - 280 }, { x: x + 46, y: y - 60 }], { width: 2.8, seedIndex: 80 });
    strokeInk(ctx, [{ x: x + 96, y: y - 280 }, { x: x + 92, y: y - 60 }], { width: 2.8, seedIndex: 81 });
  }

  private drawCampfire(ctx: any, x: number, y: number, t: number): void {
    // 石圈
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const px = x + Math.cos(a) * 52;
      const py = y + Math.sin(a) * 16;
      const r = 11 + (i % 3);
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k <= 10; k++) {
        const b = (k / 10) * Math.PI * 2;
        pts.push({ x: px + Math.cos(b) * r, y: py + Math.sin(b) * r * 0.8 });
      }
      fillWatercolor(ctx, pts, PALETTE.soil, { alpha: 0.9, layers: 1, seedIndex: 90 + i });
      strokeInk(ctx, pts, { width: 2.4, close: true, seedIndex: 91 + i });
    }
    // 柴火
    strokeInk(ctx, [{ x: x - 30, y: y }, { x: x + 30, y: y - 16 }], { width: 4, seedIndex: 100 });
    strokeInk(ctx, [{ x: x - 26, y: y - 14 }, { x: x + 26, y: y + 2 }], { width: 4, seedIndex: 101 });
    // 火焰（三层水彩）
    const flick = 1 + 0.12 * Math.sin(t / 120) + 0.06 * Math.sin(t / 47);
    const flame = (scale: number, color: string, alpha: number, seed: number): void => {
      const fh = 58 * scale * flick;
      const pts: { x: number; y: number }[] = [];
      pts.push({ x: x - 22 * scale, y: y - 16 });
      pts.push({ x: x - 12 * scale, y: y - 16 - fh * 0.55 });
      pts.push({ x: x - 2 * scale, y: y - 16 - fh });
      pts.push({ x: x + 10 * scale, y: y - 16 - fh * 0.5 });
      pts.push({ x: x + 20 * scale, y: y - 16 });
      fillWatercolor(ctx, pts, color, { alpha, layers: 2, wetEdge: true, seedIndex: seed });
    };
    flame(1.15, PALETTE.sunset, 0.5, 110);
    flame(0.85, PALETTE.sunbeam, 0.7, 111);
    flame(0.5, PALETTE.creamMist, 0.75, 112);
  }

  private drawStream(ctx: any, x: number, y: number, t: number): void {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = i / 12;
      pts.push({ x: x + Math.sin(p * 3) * 40 - 60, y: y - p * 420 });
    }
    for (let i = 12; i >= 0; i--) {
      const p = i / 12;
      pts.push({ x: x + Math.sin(p * 3) * 40 + 60, y: y - p * 420 });
    }
    fillWatercolor(ctx, pts, PALETTE.stream, { alpha: 0.55, layers: 2, wetEdge: true, seedIndex: 120 });
    // 水波
    for (let i = 0; i < 5; i++) {
      const p = ((t / 2200 + i * 0.2) % 1);
      const wy = y - p * 400;
      const wx = x + Math.sin(p * 3) * 40 + Math.sin(t / 600 + i) * 6;
      strokeInk(ctx, [{ x: wx - 22, y: wy }, { x: wx + 22, y: wy }], { width: 2, jitter: 1.0, seedIndex: 130 + i });
    }
  }
}