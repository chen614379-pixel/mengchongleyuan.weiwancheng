/**
 * 图鉴与段位页（§13.4）—— 横屏 1280×720，手绘水彩森林风。
 *
 * 两个页签：
 *  - 「宠物图鉴」：8 物种 × 3 等级 = 24 格；未遇见的用灰剪影 + 迷雾，已遇见的展示
 *    统一尺寸的圆形木框立绘（立绘按框重绘、不做拉伸），并给出特技、性格与克制提示。
 *    全空时优雅降级为一张手绘空状态（篝火 + 「去冒险遇见它们」）。
 *  - 「段位」：青铜 → 白银 → 黄金 → 钻石 的手绘阶梯 + 战绩统计（读 save.rank / save.stats）。
 *
 * 数值与配色全部来自 `config/*` 与 `platform/storage`；通用手绘件复用同目录 deck.ts。
 */
import { Scene, push, pop } from './manager';
import { PALETTE, rgba, tint } from '../config/palette';
import { LAYOUT } from '../config/layout';
import { SPECIES, SPECIES_ORDER, COUNTER, counteredBy, SpeciesId } from '../config/species';
import { loadSave, saveNow } from '../platform/storage';
import { playSfx } from '../platform/audio';
import { GestureEvent } from '../platform/input';
import { arcPoints, strokeInk, blobPath, paperGrain, dropShadow, tracePath } from '../ui/brush';
import { setFont, textOutlined, textPlain, wrapText, fitSize, FONT } from '../ui/theme';
import { easeOutCubic, clamp01 } from '../ui/ease';
import {
  drawSoftGroundShadow, drawSparkle, drawWoodSign, drawFern, drawGrassTuft, woodGrain,
} from '../render/paint';
import { getImage } from '../render/assets';
import {
  SCREEN, drawScreenBase, drawBackButton, drawTitlePlate, drawCurrencyChips, drawWoodPlate,
  drawWoodButton, drawCreature, drawVineProgress, drawRevealVeil, drawToast, drawLock, inRect, roundPts,
  fillPanel, drawPanelLeaf,
} from './deck';

/* ---------------------------------------------------------------- 布局常量 */
const BACK_X = 26;
const BACK_Y = 24;
const BACK_SIZE = 60;
const TAB_Y = 30;
const TAB_W = 150;
const TAB_H = 54;
const TAB_X = 96;
const TAB_GAP = 10;

/** 图鉴网格：4 列 × 2 行 */
const GRID_X = 56;
const GRID_Y = 190;
const CARD_W = 268;
const CARD_H = 212;
const GRID_GAP_X = 18;
const GRID_GAP_Y = 16;

/** 段位阶梯的晋升步长（仅用于「晋升进度」这条展示条，不参与任何数值结算）。 */
const TIER_STEP = 100;
const TIER_NAMES = ['青铜', '白银', '黄金', '钻石'];
const TIER_NOTE = ['初始段位 · 小恶魔皮肤未解锁', 'AI 难度 +1 · 解锁铜角皮肤',
  'AI 难度 +2 · 解锁银翼皮肤', 'AI 难度 +3 · 解锁金焰皮肤'];
const TIER_THEME = [PALETTE.soil, PALETTE.skyWarm, PALETTE.sunbeam, PALETTE.sunset];

export interface CollectionOpts {
  tab?: 'pets' | 'rank';
}

export class CollectionScene implements Scene {
  readonly name = 'collection';
  private tab: 'pets' | 'rank';
  private t = 0;
  private t0 = -1;
  private enterMs = 0;
  private sel = 0;
  private press = '';
  private pressMs = 0;
  private toastText = '';
  private toastMs = 0;
  private scrollY = 0;

  constructor(opts?: CollectionOpts) {
    const o = opts || {};
    this.tab = o.tab === 'rank' ? 'rank' : 'pets';
  }

  enter(): void {
    this.t0 = -1;
    this.enterMs = 0;
    this.press = '';
    this.toastMs = 0;
  }

  tick(logicTime: number): void {
    this.t = logicTime;
    if (this.t0 < 0) this.t0 = logicTime;
    this.enterMs = logicTime - this.t0;
    if (this.pressMs > 0) this.pressMs -= 50;
    if (this.toastMs > 0) this.toastMs -= 50;
  }

  render(ctx: any, renderTime: number): void {
    const t = renderTime;
    const save = loadSave();
    const p = clamp01(this.enterMs / 260);
    const s = 0.95 + 0.05 * easeOutCubic(p);
    const cx = SCREEN.W / 2;
    const cy = SCREEN.H / 2;

    drawScreenBase(ctx, t, 2100);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);

    drawBackButton(ctx, BACK_X, BACK_Y, BACK_SIZE, this.press === 'back', 2120);
    this.drawTabs(ctx, t);
    drawTitlePlate(ctx, 660, 20, 320, 72, this.tab === 'rank' ? '段位' : '萌宠图鉴', 2140);
    drawCurrencyChips(ctx, 34, t, save, 2160);

    if (this.tab === 'pets') this.drawPetsTab(ctx, t, save);
    else this.drawRankTab(ctx, t, save);

    ctx.restore();

    drawRevealVeil(ctx, p, 2400);
    if (this.toastMs > 0) drawToast(ctx, this.toastText, clamp01(this.toastMs / 300), 2420);
  }

  /** 顶部两个页签（木质木牌，选中态有 sunbeam 光晕）。 */
  private drawTabs(ctx: CanvasRenderingContext2D, t: number): void {
    const labels = ['宠物图鉴', '段位'];
    for (let i = 0; i < 2; i++) {
      const x = TAB_X + i * (TAB_W + TAB_GAP);
      const active = (i === 0 && this.tab === 'pets') || (i === 1 && this.tab === 'rank');
      const pressed = this.press === 'tab' + i;
      drawWoodPlate(ctx, x, TAB_Y + (pressed ? 2 : 0), TAB_W, TAB_H, {
        radius: 16, base: active ? PALETTE.barkLight : PALETTE.soil,
        active, seedIndex: 2200 + i * 9,
      });
      // 页签底是 barkLight / soil，两者都是浅木色，字必须用深色
      textOutlined(ctx, labels[i], x + TAB_W / 2, TAB_Y + TAB_H / 2 + 1, FONT.entry,
        PALETTE.inkSoft, 'center', 2);
    }
  }

  /* ============================================================ 页签一：图鉴 */

  private discoveredCount(): number {
    const save = loadSave();
    let n = 0;
    for (let i = 0; i < SPECIES_ORDER.length; i++) {
      if (this.isDiscovered(SPECIES_ORDER[i])) n++;
    }
    return n;
  }

  private isDiscovered(sp: SpeciesId): boolean {
    const save = loadSave();
    if (save.collection.indexOf(sp + '1') >= 0) return true;
    if (save.collection.indexOf(sp) >= 0) return true;
    for (let i = 0; i < save.pets.length; i++) {
      if (save.pets[i] && save.pets[i].species === sp) return true;
    }
    return false;
  }

  /** 已解锁到第几级（0 表示未遇见）。 */
  private levelOf(sp: SpeciesId): number {
    const save = loadSave();
    let lv = 0;
    for (let i = 1; i <= 3; i++) if (save.collection.indexOf(sp + i) >= 0) lv = i;
    if (lv === 0 && this.isDiscovered(sp)) lv = 1;
    return lv;
  }

  private drawPetsTab(ctx: CanvasRenderingContext2D, t: number, save: any): void {
    const found = this.discoveredCount();
    const gridSeen = save.collection.length;
    const cardsSeen = save.cardsSeen.length;

    // 顶部进度带
    drawWoodPlate(ctx, 56, 104, 760, 64, { radius: 18, base: PALETTE.paper, seedIndex: 2500 });
    textPlain(ctx, '图鉴收录 · 物种 × 等级 24 格', 76, 128, FONT.badge,
      rgba(PALETTE.forestDeep, 0.92), 'left', 'bold');
    drawVineProgress(ctx, 76, 134, 300, 20, gridSeen / 24, gridSeen + '/24', 2504);
    textPlain(ctx, '萌宠', 76, 162, FONT.badge - 3, rgba(PALETTE.inkSoft, 0.8), 'left', 'normal');
    drawVineProgress(ctx, 420, 134, 300, 20, cardsSeen > 0 ? Math.min(1, cardsSeen / 12) : 0,
      cardsSeen + ' 张', 2510);
    textPlain(ctx, '卡牌图鉴', 420, 162, FONT.badge - 3, rgba(PALETTE.inkSoft, 0.8), 'left', 'normal');

    // 星辉奖励说明
    drawWoodPlate(ctx, 846, 104, 392, 64, { radius: 18, base: PALETTE.barkLight, seedIndex: 2520 });
    drawSparkle(ctx, 880, 136, 12, PALETTE.sunbeam, 0.9);
    textOutlined(ctx, '首次收录 +2 星辉', 902, 130, FONT.badge, PALETTE.inkSoft, 'left', 1.8);
    textPlain(ctx, '已遇见 ' + found + ' / 8 物种', 902, 154, FONT.badge - 3,
      rgba(PALETTE.forestDeep, 0.88), 'left', 'normal');

    if (found === 0 && cardsSeen === 0) {
      // 一只未遇见时也照常铺满 8 格（灰剪影 + ？？？），不再整页替换成空状态
      this.drawHintStrip(ctx, t);
    }

    // 8 格网格
    for (let i = 0; i < SPECIES_ORDER.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = GRID_X + col * (CARD_W + GRID_GAP_X);
      const y = GRID_Y + row * (CARD_H + GRID_GAP_Y);
      this.drawPetEntry(ctx, x, y, SPECIES_ORDER[i], i, t);
    }

    // 底部详情条
    this.drawPetDetail(ctx, t);
  }

  /** 一张图鉴卡：圆形木框立绘 + 名字 + 特技 + 等级点。 */
  private drawPetEntry(
    ctx: CanvasRenderingContext2D, x: number, y: number, sp: SpeciesId, idx: number, t: number,
  ): void {
    const def = SPECIES[sp];
    const locked = !this.isDiscovered(sp);
    const selected = this.sel === idx;
    const pressed = this.press === 'card' + idx;
    const dy = pressed ? 3 : 0;

    drawWoodPlate(ctx, x, y + dy, CARD_W, CARD_H, {
      radius: 20, base: PALETTE.paper, active: selected, seedIndex: 2600 + idx * 11,
    });
    paperGrain(ctx, x + 8, y + 8 + dy, CARD_W - 16, CARD_H - 16, 0.035, 2602 + idx * 11);

    // 圆形木框 + 立绘（统一尺寸重绘，不做拉伸）
    const pcx = x + 74;
    const pcy = y + 84 + dy;
    const pr = 54;
    const ring = arcPoints(pcx, pcy, pr, 0, Math.PI * 2, 26);
    fillPanel(ctx, ring, tint(locked ? PALETTE.inkSoft : def.theme, 0.78, PALETTE.creamMist), {
      alpha: 0.7, layers: 2, wetEdge: true, seedIndex: 2604 + idx * 11,
    });
    strokeInk(ctx, ring, { width: 3, close: true, seedIndex: 2606 + idx * 11 });
    const ring2 = arcPoints(pcx, pcy, pr - 6, 0, Math.PI * 2, 24);
    strokeInk(ctx, ring2, { width: 1.6, jitter: 1.2, seedIndex: 2608 + idx * 11 });
    const petImg = locked ? undefined : getImage('unit-' + sp);
    if (petImg) {
      // 圆框内裁切贴美术抠图（100% 还原用户原画）
      ctx.save();
      const clipRing = arcPoints(pcx, pcy, pr - 4, 0, Math.PI * 2, 30);
      tracePath(ctx, clipRing, true);
      ctx.clip();
      const ph = 108;
      ctx.drawImage(petImg, pcx - ph / 2, pcy + 4 - ph / 2, ph, ph);
      ctx.restore();
    } else {
      drawCreature(ctx, sp, pcx, pcy + 8, 88, t, { silhouette: locked });
    }

    // 文本区
    const tx = x + 142;
    const name = locked ? '？？？' : def.cn;
    textOutlined(ctx, name, tx, y + 52 + dy, FONT.h2, PALETTE.forestDeep, 'left', 2.2);
    if (locked) {
      textPlain(ctx, '尚未遇见', tx, y + 84 + dy, FONT.badge, rgba(PALETTE.inkSoft, 0.75), 'left', 'normal');
      textPlain(ctx, '去战斗里遇见它', tx, y + 112 + dy, FONT.badge - 3, rgba(PALETTE.inkSoft, 0.6), 'left', 'normal');
      drawLock(ctx, x + CARD_W - 30, y + 34 + dy, 13, 2610 + idx * 11);
    } else {
      textOutlined(ctx, '特技 · ' + def.traitName, tx, y + 84 + dy, FONT.body - 2, PALETTE.leafMid, 'left', 1.8);
      wrapText(ctx, def.traitDesc, tx, y + 112 + dy, CARD_W - 160, FONT.badge - 2, 22,
        rgba(PALETTE.inkSoft, 0.88), 'left', 2);
      // 等级点（species × level）
      const lv = this.levelOf(sp);
      textPlain(ctx, '等级', tx, y + 168 + dy, FONT.badge - 3, rgba(PALETTE.forestDeep, 0.8), 'left', 'normal');
      for (let i = 0; i < 3; i++) {
        const dotX = tx + 52 + i * 26;
        const dot = arcPoints(dotX, y + 163 + dy, 8, 0, Math.PI * 2, 12);
        fillPanel(ctx, dot, i < lv ? PALETTE.sunbeam : tint(PALETTE.inkSoft, 0.7, PALETTE.paper), {
          alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 2620 + idx * 11 + i,
        });
        strokeInk(ctx, dot, { width: 2, close: true, seedIndex: 2624 + idx * 11 + i });
        if (i < lv) textPlain(ctx, '' + (i + 1), dotX, y + 164 + dy, 11, PALETTE.inkSoft, 'center', 'bold');
      }
    }

    if (selected) {
      const outline = roundPts(x - 4, y - 4 + dy, CARD_W + 8, CARD_H + 8, 23);
      strokeInk(ctx, outline, { width: 3, color: PALETTE.sunbeam, jitter: 1.6, seedIndex: 2630 + idx * 11 });
    }
  }

  /** 底部：选中动物的详情（克制闭环 + 性格 + 收集奖励）。 */
  private drawPetDetail(ctx: CanvasRenderingContext2D, t: number): void {
    const sp = SPECIES_ORDER[this.sel];
    const def = SPECIES[sp];
    const locked = !this.isDiscovered(sp);
    const y = 648;
    drawWoodPlate(ctx, 56, y, 1168, 58, { radius: 20, base: PALETTE.barkLight, seedIndex: 2700 });
    if (locked) {
      textOutlined(ctx, '这一格还是空的 —— 在对战里遇见它，图鉴就会亮起来。',
        640, y + 31, FONT.entry, PALETTE.inkSoft, 'center', 2.2);
      return;
    }
    const barPet = getImage('unit-' + sp);
    if (barPet) ctx.drawImage(barPet, 100 - 20, y + 32 - 20, 40, 40);
    else drawCreature(ctx, sp, 100, y + 32, 46, t);
    textOutlined(ctx, def.cn + ' · 性格', 138, y + 24, FONT.body - 2, PALETTE.inkSoft, 'left', 2);
    textPlain(ctx, this.personaOf(sp), 138, y + 46, FONT.badge,
      rgba(PALETTE.forestDeep, 0.9), 'left', 'normal');

    const beats = SPECIES[COUNTER[sp]];
    const loses = SPECIES[counteredBy(sp)];
    textPlain(ctx, '克制', 640, y + 22, FONT.badge, rgba(PALETTE.forestDeep, 0.9), 'center', 'normal');
    const beatsBar = getImage('unit-' + beats.id);
    if (beatsBar) ctx.drawImage(beatsBar, 700 - 18, y + 32 - 18, 36, 36);
    else drawCreature(ctx, beats.id, 700, y + 32, 40, t);
    textOutlined(ctx, beats.cn, 730, y + 34, FONT.body - 2, PALETTE.inkSoft, 'left', 2);
    textPlain(ctx, '被克制', 900, y + 22, FONT.badge, rgba(PALETTE.forestDeep, 0.9), 'center', 'normal');
    const losesBar = getImage('unit-' + loses.id);
    if (losesBar) ctx.drawImage(losesBar, 960 - 18, y + 32 - 18, 36, 36);
    else drawCreature(ctx, loses.id, 960, y + 32, 40, t);
    textOutlined(ctx, loses.cn, 990, y + 34, FONT.body - 2, PALETTE.inkSoft, 'left', 2);
    textPlain(ctx, '伤害 ×1.5 / ×0.75', 1160, y + 33, FONT.badge,
      rgba(PALETTE.forestDeep, 0.9), 'right', 'normal');
  }

  /** 一句性格文案（纯展示用，按物种给固定句子，不参与任何结算）。 */
  private personaOf(sp: SpeciesId): string {
    if (sp === 'elephant') return '温柔的大力士，走一步地面都会轻轻发抖';
    if (sp === 'lion') return '森林的骄傲，一开口连风都停下来听';
    if (sp === 'tiger') return '急性子的小探险家，尾巴比脑子先动';
    if (sp === 'leopard') return '悄无声息，等你发现时已经绕到背后';
    if (sp === 'wolf') return '安静的守望者，认得每一条回家的路';
    if (sp === 'dog') return '永远第一个冲出去，也第一个摇尾巴';
    if (sp === 'cat') return '趴在树影里打盹，爪子却一直醒着';
    return '小小的身影，藏着最机灵的一击';
  }

  /** 一只都没遇见时的顶部一行提示（网格照常铺满 8 格灰剪影）。 */
  private drawHintStrip(ctx: CanvasRenderingContext2D, t: number): void {
    const fx = 640;
    const fy = 182;
    const flick = Math.sin(t / 260) * 3;
    const flame = [
      { x: fx - 118, y: fy + 4 },
      { x: fx - 108, y: fy - 12 + flick },
      { x: fx - 99, y: fy + 4 },
    ];
    fillPanel(ctx, flame, PALETTE.sunset, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: 2820 });
    strokeInk(ctx, flame, { width: 2, close: true, seedIndex: 2821 });
    textPlain(ctx, '还没有遇见任何萌宠 —— 图鉴会在对战里慢慢亮起来',
      fx + 12, fy, FONT.badge, rgba(PALETTE.forestDeep, 0.9), 'center', 'bold');
  }

  /* ============================================================ 页签二：段位 */

  private drawRankTab(ctx: CanvasRenderingContext2D, t: number, save: any): void {
    const tier = Math.max(0, Math.min(3, save.rank.tier));
    const point = save.rank.point;

    // 段位阶梯：4 块木牌，当前段位亮起
    for (let i = 0; i < 4; i++) {
      const x = 56 + i * 300;
      const y = 132;
      const w = 284;
      const h = 250;
      const cur = i === tier;
      drawWoodPlate(ctx, x, y + (i % 2 === 0 ? 0 : 14), w, h, {
        radius: 24, base: cur ? PALETTE.barkLight : PALETTE.paper, active: cur, seedIndex: 2900 + i * 13,
      });
      const by = y + (i % 2 === 0 ? 0 : 14);
      // 段位纹章：叶片徽记 + 颜色随段位变化
      const emblemX = x + w / 2;
      const emblemY = by + 92;
      this.drawEmblem(ctx, emblemX, emblemY, 54, i, cur, t, 2910 + i * 13);
      textOutlined(ctx, TIER_NAMES[i], emblemX, by + 176, FONT.h2,
        cur ? PALETTE.forestDeep : rgba(PALETTE.forestDeep, 0.62), 'center', 2.2);
      wrapText(ctx, TIER_NOTE[i], emblemX, by + 204, w - 44, FONT.badge - 2, 22,
        rgba(PALETTE.inkSoft, cur ? 0.9 : 0.62), 'center', 2);
      if (cur) {
        const ribbon = roundPts(emblemX - 52, by + 16, 104, 34, 15);
        fillPanel(ctx, ribbon, PALETTE.sunbeam, { alpha: 0.96, layers: 2, wetEdge: false, seedIndex: 2930 + i });
        strokeInk(ctx, ribbon, { width: 2.2, close: true, seedIndex: 2931 + i });
        textPlain(ctx, '当前', emblemX, by + 34, FONT.badge, PALETTE.inkSoft, 'center', 'bold');
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + t / 1600;
          drawSparkle(ctx, emblemX + Math.cos(a) * 82, emblemY + Math.sin(a) * 62, 6, PALETTE.sunbeam, 0.5);
        }
      } else if (i < tier) {
        // 已通过的段位：一枚小叶片勾
        drawPanelLeaf(ctx, x + w - 34, by + 34, 30, Math.PI * 0.25, PALETTE.leafMid, 2940 + i, false);
      } else {
        drawLock(ctx, x + w - 32, by + 36, 13, 2944 + i);
      }
    }

    // 战绩木牌
    const sy = 452;
    drawWoodPlate(ctx, 56, sy, 700, 212, { radius: 24, base: PALETTE.paper, seedIndex: 2960 });
    textOutlined(ctx, '战绩', 92, sy + 46, FONT.h2, PALETTE.forestDeep, 'left', 2.2);
    const win = save.stats.win;
    const lose = save.stats.lose;
    const draw = save.stats.draw;
    const total = win + lose + draw;
    const rate = total > 0 ? Math.round((win / total) * 100) : 0;
    const cells: { label: string; value: string; color: string }[] = [
      { label: '胜', value: '' + win, color: PALETTE.leafMid },
      { label: '负', value: '' + lose, color: PALETTE.berry },
      { label: '平', value: '' + draw, color: PALETTE.soil },
      { label: '最高回合', value: '' + save.stats.bestRound, color: PALETTE.stream }
    ];
    for (let i = 0; i < 4; i++) {
      const bx = 92 + i * 164;
      const by2 = sy + 70;
      const plate = roundPts(bx, by2, 148, 76, 18);
      fillPanel(ctx, plate, tint(cells[i].color, 0.8, PALETTE.creamMist), {
        alpha: 0.85, layers: 1, wetEdge: false, seedIndex: 2970 + i,
      });
      strokeInk(ctx, plate, { width: 2.2, close: true, seedIndex: 2974 + i });
      textPlain(ctx, cells[i].value, bx + 74, by2 + 32, FONT.h2, PALETTE.forestDeep, 'center', 'bold');
      textPlain(ctx, cells[i].label, bx + 74, by2 + 58, FONT.badge - 2, rgba(PALETTE.inkSoft, 0.82), 'center', 'normal');
    }
    textPlain(ctx, '胜率 ' + rate + '%（共 ' + total + ' 局）', 92, sy + 178, FONT.body - 2,
      rgba(PALETTE.forestDeep, 0.9), 'left', 'bold');
    if (total === 0) {
      textPlain(ctx, '还没有战绩，去营地左侧的树屋开一局。', 92, sy + 202, FONT.badge - 2,
        rgba(PALETTE.inkSoft, 0.7), 'left', 'normal');
    }

    // 晋升进度木牌
    drawWoodPlate(ctx, 784, sy, 440, 212, { radius: 24, base: PALETTE.barkLight, seedIndex: 2990 });
    textOutlined(ctx, '晋升进度', 820, sy + 46, FONT.h2, PALETTE.inkSoft, 'left', 2.2);
    textPlain(ctx, TIER_NAMES[tier] + ' → ' + TIER_NAMES[Math.min(3, tier + 1)],
      820, sy + 82, FONT.body - 2, rgba(PALETTE.forestDeep, 0.95), 'left', 'normal');
    const ratio = tier >= 3 ? 1 : clamp01((point % TIER_STEP) / TIER_STEP);
    drawVineProgress(ctx, 820, sy + 106, 372, 26, ratio,
      (tier >= 3 ? '已达最高' : (point % TIER_STEP) + ' / ' + TIER_STEP), 2994);
    textPlain(ctx, '累计段位点 ' + point, 820, sy + 164, FONT.badge,
      rgba(PALETTE.forestDeep, 0.9), 'left', 'normal');
    textPlain(ctx, tier >= 3 ? '已达最高段位，继续保持。' : '每 100 点晋升一段，胜局累积。',
      820, sy + 190, FONT.badge - 3, rgba(PALETTE.inkSoft, 0.8), 'left', 'normal');
  }

  /** 段位纹章：叶片外圈 + 中心宝石，颜色随段位递增。 */
  private drawEmblem(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tier: number,
    cur: boolean, t: number, seedIndex: number,
  ): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + (cur ? t / 3000 : 0);
      drawPanelLeaf(ctx, cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, r * 0.62,
        a + Math.PI * 0.5, i % 2 === 0 ? PALETTE.leafMid : PALETTE.leafLight, seedIndex + i, false);
    }
    const gem = arcPoints(cx, cy, r * 0.62, 0, Math.PI * 2, 20);
    fillPanel(ctx, gem, TIER_THEME[tier], { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: seedIndex + 20 });
    strokeInk(ctx, gem, { width: 3, close: true, seedIndex: seedIndex + 21 });
    const shine = ellipsePtsLocal(cx - r * 0.2, cy - r * 0.24, r * 0.22, r * 0.14);
    fillPanel(ctx, shine, PALETTE.creamMist, { alpha: 0.6, layers: 1, wetEdge: false, seedIndex: seedIndex + 22 });
    // 段位数字刻度
    for (let i = 0; i < tier + 1; i++) {
      const dot = arcPoints(cx - r * 0.3 + i * r * 0.3, cy + r * 0.34, r * 0.08, 0, Math.PI * 2, 10);
      fillPanel(ctx, dot, PALETTE.creamMist, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seedIndex + 30 + i });
    }
  }

  /* ============================================================ 手势 */

  gesture(e: GestureEvent): void {
    const tabHit = (x: number, y: number): number => {
      for (let i = 0; i < 2; i++) {
        const bx = TAB_X + i * (TAB_W + TAB_GAP);
        if (inRect(x, y, bx, TAB_Y, TAB_W, TAB_H)) return i;
      }
      return -1;
    };
    const cardHit = (x: number, y: number): number => {
      for (let i = 0; i < SPECIES_ORDER.length; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const bx = GRID_X + col * (CARD_W + GRID_GAP_X);
        const by = GRID_Y + row * (CARD_H + GRID_GAP_Y);
        if (inRect(x, y, bx, by, CARD_W, CARD_H)) return i;
      }
      return -1;
    };

    if (e.type === 'move') return;
    if (e.type === 'down') {
      const ti = tabHit(e.x, e.y);
      if (ti >= 0) this.press = 'tab' + ti;
      else if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) this.press = 'back';
      else if (this.tab === 'pets' && this.discoveredCount() === 0 &&
        inRect(e.x, e.y, 240 + 400 - 150, 200 + 178, 300, 56)) this.press = 'adventure';
      else {
        const ci = cardHit(e.x, e.y);
        this.press = ci >= 0 ? 'card' + ci : '';
      }
      this.pressMs = 200;
      return;
    }
    if (e.type !== 'up' || e.wasDrag) return;
    const was = this.press;
    this.press = '';
    if (tabHit(e.x, e.y) >= 0) {
      const ti = tabHit(e.x, e.y);
      const next = ti === 0 ? 'pets' : 'rank';
      if (next !== this.tab) {
        this.tab = next;
        playSfx('tap');
      }
      return;
    }
    if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) {
      playSfx('tap');
      pop();
      return;
    }
    if (this.tab === 'pets' && this.discoveredCount() === 0 &&
      inRect(e.x, e.y, 240 + 400 - 150, 200 + 178, 300, 56)) {
      playSfx('cardPick');
      this.showToast('回到营地，点左侧树屋开一局');
      return;
    }
    const ci = cardHit(e.x, e.y);
    if (ci >= 0) {
      const sp = SPECIES_ORDER[ci];
      if (!this.isDiscovered(sp)) {
        playSfx('reject');
        this.showToast('这一格还没有遇见');
      } else {
        this.sel = ci;
        playSfx('tap');
      }
      return;
    }
    if (was !== '') this.pressMs = 0;
  }

  private showToast(text: string): void {
    this.toastText = text;
    this.toastMs = 320;
  }
}

/** 局部椭圆点集（避免额外依赖）。 */
function ellipsePtsLocal(cx: number, cy: number, rx: number, ry: number): any[] {
  const unit = arcPoints(0, 0, 1, 0, Math.PI * 2, 12);
  const out: any[] = [];
  for (let i = 0; i < unit.length; i++) out.push({ x: cx + unit[i].x * rx, y: cy + unit[i].y * ry });
  return out;
}

export function createCollectionScene(opts?: CollectionOpts): Scene {
  return new CollectionScene(opts);
}