/**
 * 商店页（§13.1 / §13.2 / §13.3）—— 横屏 1280×720，手绘水彩森林风。
 *
 * 三个页签（每类 6 件，共 18 件木牌行，行内展示立绘/图标、名字、一句话、价格与购买态）：
 *  - 「动物伙伴」爪印币：动物涂色解锁 + 装饰件（花环 / 草帽 / 蘑菇背包 …）
 *  - 「饲养员衣橱」爪印币：发型 / 服装 / 配饰（写 save.trainer 的对应槽位与染色）
 *  - 「星辉秘藏」星辉：限定配色 / 限定装饰 / 小恶魔皮肤（写 save.skills）
 *
 * 购买会真实扣款并立即 `saveNow()` 落盘（不改 storage.ts 的结构与字段）。
 * 余额不足：整行抖动 + 提示差值，绝不出现负数；已拥有：显示「已拥有」并置灰。
 */
import { Scene, pop } from './manager';
import { PALETTE, rgba, tint } from '../config/palette';
import { SpeciesId, SPECIES } from '../config/species';
import { loadSave, saveNow, PetSave } from '../platform/storage';
import { playSfx } from '../platform/audio';
import { GestureEvent } from '../platform/input';
import { arcPoints, strokeInk, paperGrain, dropShadow } from '../ui/brush';
import { textOutlined, textPlain, wrapText, fitSize, FONT } from '../ui/theme';
import { easeOutCubic, clamp01 } from '../ui/ease';
import { drawSparkle, woodGrain, drawGrassTuft } from '../render/paint';
import {
  SCREEN, drawScreenBase, drawBackButton, drawTitlePlate, drawCurrencyChips, drawWoodPlate,
  drawCreature, drawPawIcon, drawStarIcon, drawSunIcon, drawRevealVeil, drawToast, inRect, roundPts, fillPanel,
  drawPanelLeaf,
} from './deck';

/* ------------------------------------------------------------------ 布局 */
const BACK_X = 26;
const BACK_Y = 24;
const BACK_SIZE = 60;
const TAB_Y = 100;
const TAB_W = 250;
const TAB_H = 56;
const TAB_X = 56;
const TAB_GAP = 14;

const ROW_X = [56, 652];
const ROW_Y = [176, 326, 476];
const ROW_W = 572;
const ROW_H = 138;

const BAR = { x: 56, y: 628, w: 1168, h: 66 };

/* ------------------------------------------------------------------ 商品数据 */

type Currency = 'coins' | 'stars';
type ItemKind = 'petColor' | 'deco' | 'trainerSlot' | 'rare';

interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  currency: Currency;
  kind: ItemKind;
  /** petColor / deco 关联物种 */
  species?: SpeciesId;
  /** trainerSlot：写 save.trainer 的哪个槽位 */
  slot?: 'hair' | 'skin' | 'cloth' | 'acc';
  /** trainerSlot：槽位索引（>0 才是有偿商品） */
  slotIndex?: number;
  /** 染色（petColor 写 pets[].colors[0]，trainerSlot 写 trainer.colors） */
  color?: string;
  /** 装饰件图标类型 */
  glyph?: 'wreath' | 'hat' | 'necklace' | 'cloak' | 'mushroom' | 'firefly' | 'footprint';
}

interface ShopCategory {
  key: string;
  title: string;
  currency: Currency;
  hint: string;
  items: ShopItem[];
}

const CATEGORIES: ShopCategory[] = [
  {
    key: 'pets', title: '动物伙伴', currency: 'coins',
    hint: '给动物换一身大自然色，或加件小装饰。',
    items: [
      { id: 'pc_tiger_sunset', name: '虎 · 落日橘', desc: '只改色值，不给包体加字节。', price: 6, currency: 'coins',
        kind: 'petColor', species: 'tiger', color: '#E2763B' },
      { id: 'pc_elephant_rain', name: '象 · 雨后青', desc: '像刚下过雨的青苔色皮肤。', price: 8, currency: 'coins',
        kind: 'petColor', species: 'elephant', color: '#7D97A0' },
      { id: 'pc_cat_sakura', name: '猫 · 樱粉', desc: '把腮红调浓一点点。', price: 5, currency: 'coins',
        kind: 'petColor', species: 'cat', color: '#E28FA8' },
      { id: 'dc_wreath', name: '花环', desc: '戴在头上的圆环花饰，跑动时轻轻晃。', price: 10, currency: 'coins',
        kind: 'deco', species: 'lion', glyph: 'wreath' },
      { id: 'dc_hat', name: '草帽', desc: '林间午后的遮阳帽。', price: 8, currency: 'coins',
        kind: 'deco', species: 'dog', glyph: 'hat' },
      { id: 'dc_mushroom', name: '蘑菇背包', desc: '装着路上的小发现。', price: 15, currency: 'coins',
        kind: 'deco', species: 'mouse', glyph: 'mushroom' }
    ]
  },
  {
    key: 'trainer', title: '饲养员衣橱', currency: 'coins',
    hint: '发型 / 服装 / 配饰，每件都能染色。',
    items: [
      { id: 'tr_hair_moss', name: '发型 · 苔绿短发', desc: '森林里的清爽短发。', price: 12, currency: 'coins',
        kind: 'trainerSlot', slot: 'hair', slotIndex: 1, color: PALETTE.leafMid },
      { id: 'tr_hair_wheat', name: '发型 · 麦浪卷', desc: '风一吹就扬起卷发。', price: 15, currency: 'coins',
        kind: 'trainerSlot', slot: 'hair', slotIndex: 2, color: PALETTE.sunset },
      { id: 'tr_cloth_moss', name: '服装 · 苔绿披风', desc: '像一片会走路的叶子。', price: 18, currency: 'coins',
        kind: 'trainerSlot', slot: 'cloth', slotIndex: 1, color: PALETTE.leafMid },
      { id: 'tr_cloth_dusk', name: '服装 · 晚霞外衣', desc: '夕阳把布料染成了橘。', price: 20, currency: 'coins',
        kind: 'trainerSlot', slot: 'cloth', slotIndex: 2, color: PALETTE.sunset },
      { id: 'tr_acc_vine', name: '配饰 · 藤蔓发带', desc: '编进头发里的一小段藤。', price: 10, currency: 'coins',
        kind: 'trainerSlot', slot: 'acc', slotIndex: 1, color: PALETTE.leafLight },
      { id: 'tr_acc_shine', name: '配饰 · 星辉胸针', desc: '夜里会亮一下的小胸针。', price: 25, currency: 'coins',
        kind: 'trainerSlot', slot: 'acc', slotIndex: 2, color: PALETTE.sunbeam }
    ]
  },
  {
    key: 'stars', title: '星辉秘藏', currency: 'stars',
    hint: '星辉来自胜局与图鉴解锁，这里只卖限定的东西。',
    items: [
      { id: 'rs_wolf_moon', name: '限定配色 · 月光银', desc: '狼的毛色像被月光洗过。', price: 3, currency: 'stars',
        kind: 'petColor', species: 'wolf', color: '#B9C4CC' },
      { id: 'rs_mouse_dusk', name: '限定配色 · 暮紫', desc: '黄昏时分的小鼠。', price: 3, currency: 'stars',
        kind: 'petColor', species: 'mouse', color: '#8C7BA6' },
      { id: 'rs_firefly', name: '萤火虫瓶（限定）', desc: '瓶身上落着两点光。', price: 4, currency: 'stars',
        kind: 'deco', species: 'leopard', glyph: 'firefly' },
      { id: 'rs_footprint', name: '花瓣脚印（限定）', desc: '走过的地方开出一串花。', price: 4, currency: 'stars',
        kind: 'deco', species: 'cat', glyph: 'footprint' },
      { id: 'rs_wreath_gold', name: '稀有花环 · 金焰', desc: '镀了落日色的花环。', price: 5, currency: 'stars',
        kind: 'deco', species: 'tiger', glyph: 'wreath' },
      { id: 'rs_imp_skin', name: '小恶魔皮肤', desc: '随段位解锁的隐藏配色，这里可以提前拥有。', price: 6, currency: 'stars',
        kind: 'rare' }
    ]
  }
];

/* ------------------------------------------------------------------ 场景 */

export class ShopScene implements Scene {
  readonly name = 'shop';
  private t = 0;
  private t0 = -1;
  private enterMs = 0;
  private cat = 0;
  private press = '';
  private pressMs = 0;
  private toastText = '';
  private toastMs = 0;
  private shakeIdx = -1;
  private shakeMs = 0;
  private flashIdx = -1;
  private flashMs = 0;

  enter(): void {
    this.t0 = -1;
    this.enterMs = 0;
    this.press = '';
    this.toastMs = 0;
    this.shakeIdx = -1;
    this.flashIdx = -1;
  }

  tick(logicTime: number): void {
    this.t = logicTime;
    if (this.t0 < 0) this.t0 = logicTime;
    this.enterMs = logicTime - this.t0;
    if (this.pressMs > 0) this.pressMs -= 50;
    if (this.toastMs > 0) this.toastMs -= 50;
    if (this.shakeMs > 0) this.shakeMs -= 50;
    if (this.flashMs > 0) this.flashMs -= 50;
  }

  render(ctx: any, renderTime: number): void {
    const t = renderTime;
    const save = loadSave();
    const p = clamp01(this.enterMs / 260);
    const s = 0.95 + 0.05 * easeOutCubic(p);
    const cx = SCREEN.W / 2;
    const cy = SCREEN.H / 2;

    drawScreenBase(ctx, t, 4100);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);

    drawBackButton(ctx, BACK_X, BACK_Y, BACK_SIZE, this.press === 'back', 4120);
    drawTitlePlate(ctx, 660, 20, 300, 72, '林间商店', 4140);
    drawCurrencyChips(ctx, 34, t, save, 4160);

    this.drawTabs(ctx, save);
    this.drawRows(ctx, t, save);
    this.drawBar(ctx, save);

    ctx.restore();

    drawRevealVeil(ctx, p, 4400);
    if (this.toastMs > 0) drawToast(ctx, this.toastText, clamp01(this.toastMs / 300), 4420);
  }

  /* ---------------------------------------------------------- 页签 */

  private drawTabs(ctx: CanvasRenderingContext2D, save: any): void {
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      const x = TAB_X + i * (TAB_W + TAB_GAP);
      const active = this.cat === i;
      const pressed = this.press === 'tab' + i;
      drawWoodPlate(ctx, x, TAB_Y + (pressed ? 2 : 0), TAB_W, TAB_H, {
        radius: 16, base: active ? PALETTE.barkLight : PALETTE.soil, active, seedIndex: 4500 + i * 11,
      });
      // 页签底是 barkLight / soil，两者都是浅木色，字必须用深色
      const tabTxt = PALETTE.inkSoft;
      textOutlined(ctx, c.title, x + TAB_W / 2, TAB_Y + 30, FONT.entry, tabTxt, 'center', 2);
      // 已拥有 / 总数
      const owned = this.ownedCount(c, save);
      textPlain(ctx, owned + ' / ' + c.items.length, x + TAB_W / 2, TAB_Y + 50, FONT.badge - 3,
        rgba(PALETTE.forestDeep, 0.88), 'center', 'normal');
      // 货币标记
      if (c.currency === 'stars') drawStarIcon(ctx, x + TAB_W - 26, TAB_Y + 24, 11, this.t, 4600 + i);
      else drawPawIcon(ctx, x + TAB_W - 26, TAB_Y + 24, 11, 4620 + i);
    }
    // 提示句右端不许越过面板安全边（否则会盖到屏幕外的森林边缘上）。
    // 这一带底板从浅纸渐入深色林冠，深绿字直接铺上去会被后半句吞掉，故先垫一条与页签同语言的浅纸牌。
    const hintX = TAB_X + 3 * (TAB_W + TAB_GAP) + 16;
    const hint = CATEGORIES[this.cat].hint;
    const hintW = SCREEN.W - 56 - hintX;
    drawWoodPlate(ctx, hintX - 16, TAB_Y + 12, hintW + 32, TAB_H - 8, {
      radius: 14, base: PALETTE.paper, seedIndex: 4700 + this.cat, grain: false,
    });
    const hintSize = fitSize(ctx, hint, hintW, FONT.badge, 13);
    textPlain(ctx, hint, hintX, TAB_Y + 40, hintSize, rgba(PALETTE.forestDeep, 0.92), 'left', 'normal');
  }

  /* ---------------------------------------------------------- 商品行 */

  private drawRows(ctx: CanvasRenderingContext2D, t: number, save: any): void {
    const cat = CATEGORIES[this.cat];
    for (let i = 0; i < cat.items.length; i++) {
      const item = cat.items[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = ROW_X[col];
      const y = ROW_Y[row];
      this.drawRow(ctx, x, y, item, i, t, save);
    }
  }

  private drawRow(
    ctx: CanvasRenderingContext2D, x: number, y: number, item: ShopItem, idx: number,
    t: number, save: any,
  ): void {
    const owned = this.isOwned(item, save);
    const wallet = item.currency === 'coins' ? save.coins : save.stars;
    const short = !owned && wallet < item.price;
    const pressed = this.press === 'row' + idx;
    const flashing = this.flashIdx === idx && this.flashMs > 0;
    const shake = this.shakeIdx === idx && this.shakeMs > 0
      ? Math.sin(this.shakeMs / 26) * 7 * clamp01(this.shakeMs / 320) : 0;
    const grow = pressed || flashing ? 1.02 : 1;
    const w = ROW_W * grow;
    const h = ROW_H * grow;
    const bx = x - (w - ROW_W) / 2 + shake;
    const by = y - (h - ROW_H) / 2 + (pressed ? 2 : 0);

    const base = owned ? tint(PALETTE.meadow, 0.5, PALETTE.paper)
      : (short ? tint(PALETTE.soil, 0.55, PALETTE.paper) : PALETTE.paper);
    drawWoodPlate(ctx, bx, by, w, h, { radius: 20, base, active: flashing, seedIndex: 4700 + idx * 13 });
    paperGrain(ctx, bx + 8, by + 8, w - 16, h - 16, 0.03, 4702 + idx * 13);

    // 左侧图标（圆形木框）
    const icx = bx + 68;
    const icy = by + h / 2;
    const ring = arcPoints(icx, icy, 46, 0, Math.PI * 2, 22);
    fillPanel(ctx, ring, tint(item.color === undefined ? PALETTE.leafMid : item.color, 0.76, PALETTE.creamMist), {
      alpha: 0.72, layers: 2, wetEdge: true, seedIndex: 4704 + idx * 13,
    });
    strokeInk(ctx, ring, { width: 2.8, close: true, seedIndex: 4706 + idx * 13 });
    this.drawItemIcon(ctx, item, icx, icy, t, idx);

    // 名字 / 说明
    const tx = bx + 130;
    textOutlined(ctx, item.name, tx, by + 46, FONT.body, PALETTE.forestDeep, 'left', 2.2);
    wrapText(ctx, item.desc, tx, by + 78, w - 340, FONT.badge - 2, 22,
      rgba(PALETTE.inkSoft, 0.82), 'left', 2);

    // 价格 / 状态
    const chipX = bx + w - 186;
    const chipY = by + 40;
    if (owned) {
      const ribbon = roundPts(chipX + 20, chipY + 4, 146, 46, 18);
      fillPanel(ctx, ribbon, PALETTE.leafMid, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: 4710 + idx * 13 });
      strokeInk(ctx, ribbon, { width: 2.4, close: true, seedIndex: 4712 + idx * 13 });
      textOutlined(ctx, '已拥有', chipX + 93, chipY + 34, FONT.entry, PALETTE.creamMist, 'center', 2.4,
        PALETTE.forestDeep);
      drawSparkle(ctx, chipX + 182, chipY + 20, 7, PALETTE.leafLight, 0.45);
    } else {
      const chip = roundPts(chipX, chipY, 186, 56, 20);
      fillPanel(ctx, chip, short ? tint(PALETTE.berry, 0.72, PALETTE.paper) : PALETTE.sunbeam, {
        alpha: 0.95, layers: 2, wetEdge: true, seedIndex: 4720 + idx * 13,
      });
      strokeInk(ctx, chip, { width: 2.4, close: true, seedIndex: 4722 + idx * 13 });
      if (item.currency === 'stars') drawStarIcon(ctx, chipX + 30, chipY + 28, 14, t, 4724 + idx * 13);
      else drawSunIcon(ctx, chipX + 30, chipY + 28, 14, t, 4726 + idx * 13);
      textPlain(ctx, '' + item.price, chipX + 72, chipY + 30, FONT.h2, PALETTE.inkSoft, 'left', 'bold');
      textPlain(ctx, item.currency === 'stars' ? '星辉' : '爪印币', chipX + 128, chipY + 32, FONT.badge - 2,
        rgba(PALETTE.inkSoft, 0.8), 'left', 'normal');
      if (short) {
        textPlain(ctx, '还差 ' + (item.price - wallet), chipX + 93, chipY + 82, FONT.badge - 2,
          PALETTE.berry, 'center', 'bold');
      }
    }

    if (flashing) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + this.flashMs / 120;
        drawSparkle(ctx, icx + Math.cos(a) * 70, icy + Math.sin(a) * 48, 8, PALETTE.sunbeam,
          0.7 * clamp01(this.flashMs / 520));
      }
    }
  }

  /** 商品图标：动物立绘 / 装饰件手绘图形 / 饲养员配色圆点 / 星辉秘藏光点。 */
  private drawItemIcon(
    ctx: CanvasRenderingContext2D, item: ShopItem, cx: number, cy: number, t: number, idx: number,
  ): void {
    const seed = 4800 + idx * 9;
    if (item.kind === 'petColor') {
      const sp: SpeciesId = item.species === undefined ? 'dog' : item.species;
      drawCreature(ctx, sp, cx, cy + 6, 74, t);
      const col = item.color === undefined ? PALETTE.leafMid : item.color;
      const dot = arcPoints(cx + 30, cy + 30, 12, 0, Math.PI * 2, 14);
      fillPanel(ctx, dot, col, { alpha: 0.98, layers: 2, wetEdge: true, seedIndex: seed });
      strokeInk(ctx, dot, { width: 2.2, close: true, seedIndex: seed + 1 });
      return;
    }
    if (item.kind === 'deco') {
      const col = item.color === undefined ? PALETTE.blossom : item.color;
      const glyph = item.glyph === undefined ? 'wreath' : item.glyph;
      if (glyph === 'hat') {
        const brim = [
          { x: cx - 34, y: cy + 10 }, { x: cx - 12, y: cy + 2 }, { x: cx + 12, y: cy + 2 }, { x: cx + 34, y: cy + 10 },
          { x: cx + 12, y: cy + 20 }, { x: cx - 12, y: cy + 20 }
        ];
        fillPanel(ctx, brim, PALETTE.soil, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed });
        strokeInk(ctx, brim, { width: 2.4, close: true, seedIndex: seed + 1 });
        const crown = [
          { x: cx - 18, y: cy + 4 }, { x: cx - 12, y: cy - 22 }, { x: cx + 12, y: cy - 22 }, { x: cx + 18, y: cy + 4 }
        ];
        fillPanel(ctx, crown, PALETTE.sunset, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed + 2 });
        strokeInk(ctx, crown, { width: 2.4, close: true, seedIndex: seed + 3 });
      } else if (glyph === 'mushroom') {
        const cap = [
          { x: cx - 26, y: cy + 4 }, { x: cx - 18, y: cy - 22 }, { x: cx, y: cy - 30 },
          { x: cx + 18, y: cy - 22 }, { x: cx + 26, y: cy + 4 }
        ];
        fillPanel(ctx, cap, PALETTE.berry, { alpha: 0.92, layers: 2, wetEdge: true, seedIndex: seed });
        strokeInk(ctx, cap, { width: 2.4, close: true, seedIndex: seed + 1 });
        const stem = roundPts(cx - 9, cy + 4, 18, 26, 8);
        fillPanel(ctx, stem, PALETTE.paper, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: seed + 2 });
        strokeInk(ctx, stem, { width: 2.2, close: true, seedIndex: seed + 3 });
        for (let k = 0; k < 3; k++) {
          const spot = arcPoints(cx - 14 + k * 14, cy - 12 + (k % 2) * 8, 4, 0, Math.PI * 2, 10);
          fillPanel(ctx, spot, PALETTE.creamMist, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seed + 4 + k });
        }
      } else if (glyph === 'firefly') {
        const bottle = roundPts(cx - 18, cy - 8, 36, 40, 12);
        fillPanel(ctx, bottle, tint(PALETTE.stream, 0.55, PALETTE.paper), {
          alpha: 0.7, layers: 2, wetEdge: true, seedIndex: seed,
        });
        strokeInk(ctx, bottle, { width: 2.4, close: true, seedIndex: seed + 1 });
        const neck = roundPts(cx - 8, cy - 20, 16, 14, 5);
        fillPanel(ctx, neck, PALETTE.soil, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seed + 2 });
        strokeInk(ctx, neck, { width: 2.2, close: true, seedIndex: seed + 3 });
        drawSparkle(ctx, cx - 6, cy + 10, 8, PALETTE.sunbeam, 0.9);
        drawSparkle(ctx, cx + 8, cy + 18, 6, PALETTE.sunbeam, 0.7);
      } else if (glyph === 'footprint') {
        for (let k = 0; k < 3; k++) {
          const px = cx - 26 + k * 26;
          const py = cy + (k % 2 === 0 ? 8 : -6);
          const pad = arcPoints(px, py, 9, 0, Math.PI * 2, 12);
          fillPanel(ctx, pad, col, { alpha: 0.92, layers: 1, wetEdge: false, seedIndex: seed + k });
          strokeInk(ctx, pad, { width: 2, close: true, seedIndex: seed + 4 + k });
          for (let m = 0; m < 3; m++) {
            const toe = arcPoints(px - 7 + m * 7, py - 12, 3.4, 0, Math.PI * 2, 8);
            fillPanel(ctx, toe, col, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seed + 8 + k * 3 + m });
          }
        }
      } else if (glyph === 'necklace') {
        for (let k = 0; k < 9; k++) {
          const a = Math.PI * 0.15 + (k / 8) * Math.PI * 0.7;
          const bead = arcPoints(cx + Math.cos(a) * 0 - 26 + k * 6.5, cy - 6 + Math.sin(a) * 26, 5, 0, Math.PI * 2, 10);
          fillPanel(ctx, bead, k % 3 === 0 ? col : PALETTE.soil, {
            alpha: 0.95, layers: 1, wetEdge: false, seedIndex: seed + k,
          });
          strokeInk(ctx, bead, { width: 1.8, close: true, seedIndex: seed + 10 + k });
        }
      } else if (glyph === 'cloak') {
        drawPanelLeaf(ctx, cx, cy, 74, -Math.PI * 0.5, PALETTE.leafMid, seed, true);
        drawPanelLeaf(ctx, cx - 16, cy + 6, 46, -Math.PI * 0.62, PALETTE.leafLight, seed + 2, false);
      } else {
        // wreath：一圈花的圆环
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          drawPanelLeaf(ctx, cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 30, a + Math.PI * 0.5,
            k % 3 === 0 ? col : PALETTE.leafMid, seed + k, false);
        }
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          const bud = arcPoints(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 7, 0, Math.PI * 2, 12);
          fillPanel(ctx, bud, k % 2 === 0 ? PALETTE.blossom : PALETTE.sunbeam, {
            alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed + 20 + k,
          });
          strokeInk(ctx, bud, { width: 2, close: true, seedIndex: seed + 24 + k });
        }
      }
      return;
    }
    if (item.kind === 'trainerSlot') {
      // 饲养员半身剪影 + 部位高亮
      const col = item.color === undefined ? PALETTE.leafMid : item.color;
      const head = arcPoints(cx, cy - 6, 18, 0, Math.PI * 2, 18);
      fillPanel(ctx, head, PALETTE.creamMist, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed });
      strokeInk(ctx, head, { width: 2.4, close: true, seedIndex: seed + 1 });
      const body = roundPts(cx - 24, cy + 10, 48, 26, 12);
      fillPanel(ctx, body, item.slot === 'cloth' ? col : PALETTE.paper,
        { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed + 2 });
      strokeInk(ctx, body, { width: 2.4, close: true, seedIndex: seed + 3 });
      if (item.slot === 'hair') {
        const hair = [
          { x: cx - 20, y: cy - 8 }, { x: cx - 14, y: cy - 28 }, { x: cx + 14, y: cy - 28 }, { x: cx + 20, y: cy - 8 },
          { x: cx + 10, y: cy - 16 }, { x: cx - 10, y: cy - 16 }
        ];
        fillPanel(ctx, hair, col, { alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seed + 4 });
        strokeInk(ctx, hair, { width: 2.2, close: true, seedIndex: seed + 5 });
      } else if (item.slot === 'acc') {
        const band = roundPts(cx - 22, cy - 22, 44, 12, 6);
        fillPanel(ctx, band, col, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: seed + 6 });
        strokeInk(ctx, band, { width: 2.2, close: true, seedIndex: seed + 7 });
        drawSparkle(ctx, cx + 18, cy - 12, 6, PALETTE.sunbeam, 0.8);
      } else if (item.slot === 'skin') {
        const face = arcPoints(cx, cy - 6, 12, 0, Math.PI * 2, 14);
        fillPanel(ctx, face, col, { alpha: 0.85, layers: 1, wetEdge: false, seedIndex: seed + 8 });
      }
      return;
    }
    // rare：光点 + 星
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + t / 2000;
      drawSparkle(ctx, cx + Math.cos(a) * 22, cy + Math.sin(a) * 22, 9, PALETTE.sunbeam, 0.8);
    }
    drawStarIcon(ctx, cx, cy, 24, t, seed + 30);
  }

  /* ---------------------------------------------------------- 底部信息条 */

  private drawBar(ctx: CanvasRenderingContext2D, save: any): void {
    drawWoodPlate(ctx, BAR.x, BAR.y, BAR.w, BAR.h, { radius: 20, base: PALETTE.barkLight, seedIndex: 4900 });
    drawSunIcon(ctx, BAR.x + 34, BAR.y + BAR.h / 2, 15, this.t, 4902);
    textOutlined(ctx, '对局奖励：胜 +80 / 平 +50 / 败 +30 爪印币，胜局另 +3 星辉',
      BAR.x + 60, BAR.y + 28, FONT.entry, PALETTE.inkSoft, 'left', 2);
    textPlain(ctx, '每日首胜额外 +50 爪印币 · 图鉴收录与段位晋升也给星辉',
      BAR.x + 60, BAR.y + 50, FONT.badge - 2, rgba(PALETTE.forestDeep, 0.9), 'left', 'normal');
    const empty = save.coins <= 0 && save.stars <= 0;
    if (empty) {
      textOutlined(ctx, '两样都还空着 —— 回营地开一局就有啦', BAR.x + BAR.w - 30, BAR.y + 34,
        FONT.badge, PALETTE.forestDeep, 'right', 2);
    } else {
      textPlain(ctx, '当前：爪印币 ' + save.coins + ' · 星辉 ' + save.stars,
        BAR.x + BAR.w - 30, BAR.y + 36, FONT.badge, rgba(PALETTE.forestDeep, 0.95), 'right', 'normal');
    }
    drawGrassTuft(ctx, BAR.x + BAR.w - 8, BAR.y + 4, 18, PALETTE.leafMid, 4910, Math.sin(this.t / 1500));
  }

  /* ---------------------------------------------------------- 拥有 / 购买 */

  private isOwned(item: ShopItem, save: any): boolean {
    if (item.kind === 'rare') return save.skills.indexOf(item.id) >= 0;
    if (item.kind === 'trainerSlot') {
      const slot = item.slot === undefined ? 'hair' : item.slot;
      const idx = item.slotIndex === undefined ? 0 : item.slotIndex;
      return save.trainer[slot] === idx && idx > 0;
    }
    const sp = item.species === undefined ? 'dog' : item.species;
    const pet = this.findPet(save, sp);
    if (!pet) return false;
    if (item.kind === 'petColor') {
      const col = item.color === undefined ? '' : item.color;
      return pet.colors[0] === col && col !== '';
    }
    return pet.decos.indexOf(item.id) >= 0;
  }

  private findPet(save: any, sp: SpeciesId): PetSave | null {
    for (let i = 0; i < save.pets.length; i++) {
      if (save.pets[i] && save.pets[i].species === sp) return save.pets[i];
    }
    return null;
  }

  private ensurePet(save: any, sp: SpeciesId): PetSave {
    let pet = this.findPet(save, sp);
    if (!pet) {
      pet = { species: sp, colors: ['', '', '', ''], decos: [], owned: true };
      save.pets.push(pet);
    }
    pet.owned = true;
    return pet;
  }

  private ownedCount(cat: ShopCategory, save: any): number {
    let n = 0;
    for (let i = 0; i < cat.items.length; i++) if (this.isOwned(cat.items[i], save)) n++;
    return n;
  }

  private buy(idx: number): void {
    const cat = CATEGORIES[this.cat];
    if (idx < 0 || idx >= cat.items.length) return;
    const item = cat.items[idx];
    const save = loadSave();
    if (this.isOwned(item, save)) {
      playSfx('reject');
      this.showToast('已经拥有「' + item.name + '」');
      return;
    }
    const wallet = item.currency === 'coins' ? save.coins : save.stars;
    if (wallet < item.price) {
      playSfx('reject');
      this.shakeIdx = idx;
      this.shakeMs = 320;
      this.showToast((item.currency === 'coins' ? '爪印币' : '星辉') + '不足，还差 ' + (item.price - wallet));
      return;
    }
    // 扣款
    if (item.currency === 'coins') save.coins -= item.price;
    else save.stars -= item.price;

    // 写入存档（穿搭改造 / 装饰件 / 限定解锁）
    if (item.kind === 'petColor') {
      const pet = this.ensurePet(save, item.species === undefined ? 'dog' : item.species);
      pet.colors[0] = item.color === undefined ? '' : item.color;
    } else if (item.kind === 'deco') {
      const pet = this.ensurePet(save, item.species === undefined ? 'dog' : item.species);
      if (pet.decos.indexOf(item.id) < 0) pet.decos.push(item.id);
    } else if (item.kind === 'trainerSlot') {
      const slot = item.slot === undefined ? 'hair' : item.slot;
      save.trainer[slot] = item.slotIndex === undefined ? 1 : item.slotIndex;
      if (item.color !== undefined && slot !== 'skin') save.trainer.colors[slot] = item.color;
    } else {
      if (save.skills.indexOf(item.id) < 0) save.skills.push(item.id);
    }
    saveNow();
    playSfx('cardPick');
    this.flashIdx = idx;
    this.flashMs = 520;
    this.showToast('已购买 · ' + item.name);
  }

  /* ---------------------------------------------------------- 手势 */

  private tabHit(x: number, y: number): number {
    for (let i = 0; i < CATEGORIES.length; i++) {
      const bx = TAB_X + i * (TAB_W + TAB_GAP);
      if (inRect(x, y, bx, TAB_Y, TAB_W, TAB_H)) return i;
    }
    return -1;
  }

  private rowHit(x: number, y: number): number {
    for (let i = 0; i < 6; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      if (inRect(x, y, ROW_X[col], ROW_Y[row], ROW_W, ROW_H)) return i;
    }
    return -1;
  }

  gesture(e: GestureEvent): void {
    if (e.type === 'move') return;
    if (e.type === 'down') {
      const ti = this.tabHit(e.x, e.y);
      const ri = this.rowHit(e.x, e.y);
      if (ti >= 0) this.press = 'tab' + ti;
      else if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) this.press = 'back';
      else if (ri >= 0) this.press = 'row' + ri;
      else this.press = '';
      this.pressMs = 200;
      return;
    }
    if (e.type !== 'up' || e.wasDrag) return;
    this.press = '';
    const ti = this.tabHit(e.x, e.y);
    if (ti >= 0) {
      if (ti !== this.cat) {
        this.cat = ti;
        playSfx('tap');
      }
      return;
    }
    if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) {
      playSfx('tap');
      pop();
      return;
    }
    const ri = this.rowHit(e.x, e.y);
    if (ri >= 0) {
      this.buy(ri);
      return;
    }
  }

  private showToast(text: string): void {
    this.toastText = text;
    this.toastMs = 320;
  }
}

export function createShopScene(): Scene {
  return new ShopScene();
}