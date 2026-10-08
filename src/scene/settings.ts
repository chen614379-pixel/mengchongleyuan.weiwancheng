/**
 * 设置页 —— 横屏 1280×720，手绘水彩森林风。
 *
 * 全部控件自绘（木牌行 + 手绘拨杆开关），不使用任何系统默认控件、不使用 strokeRect。
 *  - 声音：背景音乐 / 音效。音效开关会立即生效（开→播放反馈音，关→stopAllSfx）。
 *  - 玩法：重看教程 —— 打开 3 页手绘速览（集市 / 合成 / 克制），纯本页内自洽，不改存档结构。
 *  - 存档：重置存档走二次确认弹窗，确认后就地把存档字段复位并立即落盘。
 *  - 关于：版本、分辨率、操作方式、存档键。
 *
 * 通用手绘件复用同目录 deck.ts。
 */
import { Scene, pop } from './manager';
import { PALETTE, rgba, tint } from '../config/palette';
import { SPECIES, SPECIES_ORDER, COUNTER, SpeciesId } from '../config/species';
import { loadSave, saveNow, defaultSave, SAVE_KEY } from '../platform/storage';
import { playSfx, stopAllSfx, syncBgm } from '../platform/audio';
import { GestureEvent } from '../platform/input';
import { sceneBox } from '../platform/screen';
import { arcPoints, strokeInk, paperGrain, dropShadow } from '../ui/brush';
import { setFont, textOutlined, textPlain, wrapText, FONT } from '../ui/theme';
import { easeOutCubic, clamp01 } from '../ui/ease';
import { drawSparkle, drawWoodSign, woodGrain, drawGrassTuft } from '../render/paint';
import {
  SCREEN, drawScreenBase, drawBackButton, drawTitlePlate, drawWoodPlate, drawWoodButton,
  drawCreature, drawRevealVeil, drawToast, inRect, roundPts, fillPanel, drawPanelLeaf,
} from './deck';

const BACK_X = 26;
const BACK_Y = 24;
const BACK_SIZE = 60;

const L_X = 56;
const L_W = 576;
const R_X = 656;
const R_W = 568;

/** 声音行（放在标题带 y+72 的副标题之下，避免压字） */
const MUSIC_ROW_Y = 196;
const SFX_ROW_Y = 260;
const TOGGLE_W = 96;
const TOGGLE_H = 44;

/** 玩法行 */
const TUTORIAL_BTN = { x: 76, y: 436, w: 244, h: 58 };

/** 存档行 */
const RESET_BTN = { x: 676, y: 200, w: 228, h: 58 };

/** 弹窗按钮 */
const MODAL_BTN_W = 216;
const MODAL_BTN_H = 56;
const MODAL_OK_X = 640 - 120 - 12;
const MODAL_CANCEL_X = 640 + 120 + 12;

type Modal = '' | 'tutorial' | 'reset';

export class SettingsScene implements Scene {
  readonly name = 'settings';
  private t = 0;
  private t0 = -1;
  private enterMs = 0;
  private press = '';
  private pressMs = 0;
  private toastText = '';
  private toastMs = 0;
  private modal: Modal = '';
  private page = 0;

  enter(): void {
    this.t0 = -1;
    this.enterMs = 0;
    this.press = '';
    this.toastMs = 0;
    this.modal = '';
    this.page = 0;
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

    drawScreenBase(ctx, t, 3100);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);

    drawBackButton(ctx, BACK_X, BACK_Y, BACK_SIZE, this.press === 'back', 3120);
    drawTitlePlate(ctx, 660, 20, 260, 72, '设置', 3140);
    // 右上角版本木牌
    drawWoodPlate(ctx, 1006, 34, 248, 52, { radius: 18, base: PALETTE.barkLight, seedIndex: 3150 });
    textOutlined(ctx, '版本 1.0.0', 1028, 62, FONT.entry, PALETTE.inkSoft, 'left', 2);
    drawSparkle(ctx, 1226, 60, 10, PALETTE.sunbeam, 0.6);

    this.drawSoundPlate(ctx, save);
    this.drawGameplayPlate(ctx);
    this.drawAboutPlate(ctx);
    this.drawSavePlate(ctx, save);
    this.drawTipsPlate(ctx, t);

    ctx.restore();

    drawRevealVeil(ctx, p, 3200);
    if (this.toastMs > 0) drawToast(ctx, this.toastText, clamp01(this.toastMs / 300), 3220);
    if (this.modal !== '') this.drawModal(ctx, t, save);
  }

  /* ------------------------------------------------------------ 左列 */

  private drawSoundPlate(ctx: CanvasRenderingContext2D, save: any): void {
    drawWoodPlate(ctx, L_X, 104, L_W, 228, { radius: 24, base: PALETTE.paper, seedIndex: 3300 });
    this.rowTitle(ctx, L_X, 104, '声音', '木牌上的拨杆，点了会立刻响', 3302);
    this.drawToggleRow(ctx, L_X, MUSIC_ROW_Y, '背景音乐', save.audio.music, 'music', 3310);
    this.drawToggleRow(ctx, L_X, SFX_ROW_Y, '音效', save.audio.sfx, 'sfx', 3330);
  }

  private drawGameplayPlate(ctx: CanvasRenderingContext2D): void {
    drawWoodPlate(ctx, L_X, 348, L_W, 170, { radius: 24, base: PALETTE.paper, seedIndex: 3360 });
    this.rowTitle(ctx, L_X, 348, '玩法', '随时可以再看一遍', 3362);
    drawWoodButton(ctx, TUTORIAL_BTN.x, TUTORIAL_BTN.y, TUTORIAL_BTN.w, TUTORIAL_BTN.h,
      '重看教程', this.press === 'tutorial', 3370);
    wrapText(ctx, '3 页速览：集市怎么挑 · 两只合成 · 克制闭环。看完返回营地就能上手。',
      TUTORIAL_BTN.x + TUTORIAL_BTN.w + 20, TUTORIAL_BTN.y + 16, L_W - TUTORIAL_BTN.w - 60,
      FONT.badge, 24, rgba(PALETTE.inkSoft, 0.85), 'left', 3);
  }

  private drawAboutPlate(ctx: CanvasRenderingContext2D): void {
    drawWoodPlate(ctx, L_X, 534, L_W, 176, { radius: 24, base: PALETTE.paper, seedIndex: 3400 });
    this.rowTitle(ctx, L_X, 534, '关于', '《萌宠乱斗 · 林间乱斗》', 3402);
    const lines = [
      '画面 1280×720 横屏 · Canvas 2D 手绘',
      '操作：点按选择；集市阶段拖动卡牌上场',
      '存档键：' + SAVE_KEY,
      '引擎：自研回合制，无第三方依赖'
    ];
    for (let i = 0; i < lines.length; i++) {
      const y = 622 + i * 24;
      const dot = arcPoints(L_X + 34, y - 5, 5, 0, Math.PI * 2, 10);
      fillPanel(ctx, dot, PALETTE.leafMid, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: 3410 + i });
      strokeInk(ctx, dot, { width: 1.6, close: true, seedIndex: 3420 + i });
      textPlain(ctx, lines[i], L_X + 50, y, FONT.badge, rgba(PALETTE.inkSoft, 0.9), 'left', 'normal');
    }
  }

  /* ------------------------------------------------------------ 右列 */

  private drawSavePlate(ctx: CanvasRenderingContext2D, save: any): void {
    drawWoodPlate(ctx, R_X, 104, R_W, 232, { radius: 24, base: PALETTE.paper, seedIndex: 3500 });
    this.rowTitle(ctx, R_X, 104, '存档与数据', '本地存档，随时可复位', 3502);
    drawWoodButton(ctx, RESET_BTN.x, RESET_BTN.y, RESET_BTN.w, RESET_BTN.h,
      '重置存档', this.press === 'reset', 3510);
    textPlain(ctx, '爪印币 ' + save.coins + ' · 星辉 ' + save.stars, RESET_BTN.x + RESET_BTN.w + 24,
      RESET_BTN.y + 26, FONT.badge, rgba(PALETTE.forestDeep, 0.9), 'left', 'bold');
    textPlain(ctx, '对局 ' + (save.stats.win + save.stats.lose + save.stats.draw) + ' 局',
      RESET_BTN.x + RESET_BTN.w + 24, RESET_BTN.y + 50, FONT.badge - 2,
      rgba(PALETTE.inkSoft, 0.75), 'left', 'normal');
    wrapText(ctx, '重置会清空货币、图鉴、穿搭与战绩；按二次确认后才执行，无法撤销。',
      R_X + 24, RESET_BTN.y + 76, R_W - 48, FONT.badge - 1, 24, rgba(PALETTE.inkSoft, 0.82), 'left', 2);
    // 底部一枚小木牌提示
    const tip = roundPts(R_X + 24, 292, R_W - 48, 34, 14);
    fillPanel(ctx, tip, tint(PALETTE.sunbeam, 0.72, PALETTE.paper), {
      alpha: 0.75, layers: 1, wetEdge: false, seedIndex: 3520,
    });
    strokeInk(ctx, tip, { width: 2, close: true, seedIndex: 3521 });
    textPlain(ctx, '存档只在微信环境落盘，自检环境不写入。', R_X + R_W / 2, 309, FONT.badge - 2,
      rgba(PALETTE.inkSoft, 0.85), 'center', 'normal');
  }

  private drawTipsPlate(ctx: CanvasRenderingContext2D, t: number): void {
    drawWoodPlate(ctx, R_X, 356, R_W, 328, { radius: 24, base: PALETTE.paper, seedIndex: 3540 });
    this.rowTitle(ctx, R_X, 356, '林间小抄', '三条最容易被忘掉的规则', 3542);
    const tips: { title: string; body: string }[] = [
      { title: '集市 5 张', body: '每轮 5 个摊位 + 1 张免费赠礼' },
      { title: '两只合成 ×2', body: '同名同星上场即合成，升 1 级' },
      { title: '克制闭环', body: '沿战力序打一圈，克制 ×1.5' }
    ];
    for (let i = 0; i < 3; i++) {
      const y = 412 + i * 88;
      const plate = roundPts(R_X + 22, y, R_W - 44, 76, 18);
      fillPanel(ctx, plate, tint(PALETTE.meadow, 0.55, PALETTE.paper), {
        alpha: 0.85, layers: 1, wetEdge: false, seedIndex: 3550 + i,
      });
      strokeInk(ctx, plate, { width: 2.2, close: true, seedIndex: 3554 + i });
      // 左侧小图
      if (i === 0) {
        for (let k = 0; k < 5; k++) {
          const cw = 16;
          const cxp = R_X + 40 + k * 20;
          const cp = roundPts(cxp, y + 30, cw, 24, 6);
          fillPanel(ctx, cp, PALETTE.paper, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 3560 + k });
          strokeInk(ctx, cp, { width: 1.6, close: true, seedIndex: 3566 + k });
        }
      } else if (i === 1) {
        drawCreature(ctx, 'dog', R_X + 52, y + 46, 34, t);
        drawCreature(ctx, 'dog', R_X + 88, y + 46, 34, t);
        strokeInk(ctx, [
          { x: R_X + 108, y: y + 38 },
          { x: R_X + 126, y: y + 30 },
          { x: R_X + 144, y: y + 38 },
        ], { width: 2.2, jitter: 0.6, color: PALETTE.forestDeep, seedIndex: 3570 });
        textPlain(ctx, '×2', R_X + 140, y + 58, FONT.badge, PALETTE.leafMid, 'center', 'bold');
      } else {
        const ring = arcPoints(R_X + 76, y + 38, 26, 0, Math.PI * 2, 20);
        strokeInk(ctx, ring, { width: 2.2, color: PALETTE.forestDeep, jitter: 1.0, seedIndex: 3574 });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 - Math.PI / 2;
          drawCreature(ctx, SPECIES_ORDER[k], R_X + 76 + Math.cos(a) * 30, y + 60 + Math.sin(a) * 26, 26, t);
        }
      }
      textOutlined(ctx, tips[i].title, R_X + 176, y + 30, FONT.body - 1, PALETTE.forestDeep, 'left', 2);
      textPlain(ctx, tips[i].body, R_X + 176, y + 56, FONT.badge, rgba(PALETTE.inkSoft, 0.85), 'left', 'normal');
    }
    drawGrassTuft(ctx, R_X + R_W - 44, 676, 20, PALETTE.leafMid, 3580, Math.sin(t / 1500));
    drawPanelLeaf(ctx, R_X + 20, 668, 26, Math.PI * 0.8, PALETTE.leafMid, 3582, false);
  }

  /* ------------------------------------------------------------ 通用件 */

  private rowTitle(
    ctx: CanvasRenderingContext2D, x: number, y: number, title: string, sub: string, seedIndex: number,
  ): void {
    textOutlined(ctx, title, x + 26, y + 46, FONT.h2, PALETTE.forestDeep, 'left', 2.2);
    textPlain(ctx, sub, x + 24 + 26 + (title.length > 1 ? 0 : 0) + 6, y + 72, FONT.badge - 2,
      rgba(PALETTE.inkSoft, 0.7), 'left', 'normal');
    drawPanelLeaf(ctx, x + 8, y + 40, 22, Math.PI * 0.85, PALETTE.leafMid, seedIndex, false);
  }

  /** 一行自绘拨杆开关。 */
  private drawToggleRow(
    ctx: CanvasRenderingContext2D, x: number, y: number, label: string, on: boolean,
    key: string, seedIndex: number,
  ): void {
    const pressed = this.press === key;
    const rowPts = roundPts(x + 22, y, L_W - 44, 56, 18);
    fillPanel(ctx, rowPts, tint(on ? PALETTE.meadow : PALETTE.soil, 0.62, PALETTE.paper), {
      alpha: 0.8, layers: 1, wetEdge: false, seedIndex: seedIndex,
    });
    strokeInk(ctx, rowPts, { width: 2.2, close: true, seedIndex: seedIndex + 1 });
    textOutlined(ctx, label, x + 48, y + 36, FONT.body - 1, PALETTE.forestDeep, 'left', 2);
    this.drawToggle(ctx, x + L_W - 44 - TOGGLE_W - 18, y + (56 - TOGGLE_H) / 2, on, pressed, seedIndex + 10);
  }

  /** 手绘拨杆：木槽 + 圆木钮（开=苔绿 + 阳光光晕）。 */
  private drawToggle(
    ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean, pressed: boolean, seedIndex: number,
  ): void {
    const track = roundPts(x, y, TOGGLE_W, TOGGLE_H, TOGGLE_H / 2);
    dropShadow(ctx, x, y, TOGGLE_W, TOGGLE_H, TOGGLE_H / 2, seedIndex);
    fillPanel(ctx, track, on ? PALETTE.leafMid : tint(PALETTE.soil, 0.35, PALETTE.bark), {
      alpha: 0.95, layers: 2, wetEdge: true, seedIndex: seedIndex + 1,
    });
    woodGrain(ctx, x + 6, y + 5, TOGGLE_W - 12, TOGGLE_H - 10, seedIndex + 2);
    strokeInk(ctx, track, { width: 2.6, close: true, seedIndex: seedIndex + 3 });
    // 钮
    const kr = TOGGLE_H / 2 - 5;
    const kx = on ? x + TOGGLE_W - kr - 5 : x + kr + 5;
    const ky = y + TOGGLE_H / 2 + (pressed ? 1 : 0);
    if (on) {
      const glow = arcPoints(kx, ky, kr + 7, 0, Math.PI * 2, 16);
      fillPanel(ctx, glow, PALETTE.sunbeam, { alpha: 0.45, layers: 1, wetEdge: false, seedIndex: seedIndex + 5 });
    }
    const knob = arcPoints(kx, ky, kr, 0, Math.PI * 2, 18);
    fillPanel(ctx, knob, PALETTE.creamMist, { alpha: 0.98, layers: 2, wetEdge: true, seedIndex: seedIndex + 6 });
    strokeInk(ctx, knob, { width: 2.4, close: true, seedIndex: seedIndex + 7 });
    const hi = arcPoints(kx - kr * 0.28, ky - kr * 0.3, kr * 0.26, 0, Math.PI * 2, 10);
    fillPanel(ctx, hi, PALETTE.paper, { alpha: 0.9, layers: 1, wetEdge: false, seedIndex: seedIndex + 8 });
  }

  /* ------------------------------------------------------------ 弹窗 */

  private drawModal(ctx: CanvasRenderingContext2D, t: number, save: any): void {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = rgba(PALETTE.forestDeep, 0.6);
    const sbox = sceneBox();
    ctx.fillRect(sbox.x, sbox.y, sbox.w, sbox.h);
    ctx.restore();

    if (this.modal === 'tutorial') this.drawTutorialModal(ctx, t);
    else this.drawResetModal(ctx);
  }

  private modalPlate(ctx: CanvasRenderingContext2D, w: number, h: number): { x: number; y: number } {
    const x = SCREEN.W / 2 - w / 2;
    const y = SCREEN.H / 2 - h / 2 - 10;
    drawWoodPlate(ctx, x, y, w, h, { radius: 28, base: PALETTE.paper, seedIndex: 3600 });
    return { x: x, y: y };
  }

  private drawTutorialModal(ctx: CanvasRenderingContext2D, t: number): void {
    const w = 860;
    const h = 470;
    const o = this.modalPlate(ctx, w, h);
    const page = this.page;
    const titles = ['集市怎么挑', '两只合成', '克制闭环'];
    const bodies = [
      '每轮集市摆 5 个摊位，标价就是费用（左上角圆牌）。另有 1 张免费赠礼可以先拿。刷新每次 2/3/4 阳光，每轮最多 3 次。',
      '两只同名同星的动物上场会合成 1 只，等级 +1：生命与攻击 ×1.8，攻速与移速不变。所以「留一对」比「买一只大的」更划算。',
      '8 物种沿战力序首尾相接：象→狮→虎→豹→狼→狗→猫→鼠→象。克制方伤害 ×1.5，被克制方 ×0.75。'
    ];
    // 页眉
    drawPanelLeaf(ctx, o.x + 30, o.y + 30, 30, Math.PI * 0.8, PALETTE.leafMid, 3610, true);
    drawPanelLeaf(ctx, o.x + w - 30, o.y + 30, 30, Math.PI * 0.2, PALETTE.leafMid, 3612, true);
    textOutlined(ctx, '第 ' + (page + 1) + ' / 3 页 · ' + titles[page], SCREEN.W / 2, o.y + 52,
      FONT.h2, PALETTE.forestDeep, 'center', 2.4);

    // 插图区
    const iy = o.y + 96;
    const plate = roundPts(o.x + 40, iy, w - 80, 176, 22);
    fillPanel(ctx, plate, tint(PALETTE.meadow, 0.5, PALETTE.paper), {
      alpha: 0.8, layers: 1, wetEdge: false, seedIndex: 3620,
    });
    strokeInk(ctx, plate, { width: 2.4, close: true, seedIndex: 3621 });
    if (page === 0) {
      for (let k = 0; k < 5; k++) {
        const cw = 108;
        const ch = 136;
        const cxp = o.x + 74 + k * (cw + 16);
        const cyp = iy + 20;
        const cp = roundPts(cxp, cyp, cw, ch, 16);
        fillPanel(ctx, cp, PALETTE.paper, { alpha: 0.96, layers: 2, wetEdge: true, seedIndex: 3630 + k });
        strokeInk(ctx, cp, { width: 2.4, close: true, seedIndex: 3636 + k });
        const sp = SPECIES_ORDER[k];
        drawCreature(ctx, sp, cxp + cw / 2, cyp + 62, 74, t);
        const chip = arcPoints(cxp + 22, cyp + 22, 16, 0, Math.PI * 2, 14);
        fillPanel(ctx, chip, PALETTE.sunbeam, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 3642 + k });
        strokeInk(ctx, chip, { width: 2, close: true, seedIndex: 3646 + k });
        textPlain(ctx, '' + SPECIES[sp].cost, cxp + 22, cyp + 23, 16, PALETTE.inkSoft, 'center', 'bold');
        textOutlined(ctx, SPECIES[sp].cn, cxp + cw / 2, cyp + ch - 22, FONT.body - 2, PALETTE.forestDeep, 'center', 2);
      }
    } else if (page === 1) {
      const base = o.x + 200;
      for (let k = 0; k < 2; k++) {
        drawCreature(ctx, 'tiger', base + k * 96, iy + 96, 88, t);
      }
      strokeInk(ctx, [
        { x: o.x + 400, y: iy + 92 },
        { x: o.x + 470, y: iy + 76 },
        { x: o.x + 540, y: iy + 92 },
      ], { width: 3, jitter: 0.8, color: PALETTE.forestDeep, seedIndex: 3660 });
      textPlain(ctx, '同名同星合成', o.x + 470, iy + 116, FONT.badge, PALETTE.forestDeep, 'center', 'bold');
      drawCreature(ctx, 'tiger', o.x + 660, iy + 92, 110, t);
      const chip = arcPoints(o.x + 700, iy + 34, 20, 0, Math.PI * 2, 14);
      fillPanel(ctx, chip, PALETTE.leafLight, { alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 3662 });
      strokeInk(ctx, chip, { width: 2, close: true, seedIndex: 3663 });
      textPlain(ctx, '2', o.x + 700, iy + 35, 18, PALETTE.inkSoft, 'center', 'bold');
      textPlain(ctx, '生命 / 攻击 ×1.8', o.x + 660, iy + 156, FONT.badge, rgba(PALETTE.inkSoft, 0.9), 'center', 'normal');
    } else {
      const cx0 = o.x + w / 2;
      const cy0 = iy + 88;
      const ring = arcPoints(cx0, cy0, 62, 0, Math.PI * 2, 26);
      strokeInk(ctx, ring, { width: 2.6, color: PALETTE.forestDeep, jitter: 1.2, seedIndex: 3670 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
        const sp = SPECIES_ORDER[k];
        drawCreature(ctx, sp, cx0 + Math.cos(a) * 92, cy0 + Math.sin(a) * 74, 56, t);
        textOutlined(ctx, SPECIES[sp].cn, cx0 + Math.cos(a) * 92, cy0 + Math.sin(a) * 74 + 42,
          FONT.badge, PALETTE.forestDeep, 'center', 1.8);
      }
      textOutlined(ctx, '克制 ×1.5', cx0, cy0 + 6, FONT.body, PALETTE.berry, 'center', 2);
    }

    // 正文
    wrapText(ctx, bodies[page], o.x + 60, iy + 208, w - 120, FONT.body - 2, 30,
      rgba(PALETTE.inkSoft, 0.9), 'left', 3);

    // 页码点
    for (let k = 0; k < 3; k++) {
      const dot = arcPoints(SCREEN.W / 2 - 30 + k * 30, o.y + h - 96, 8, 0, Math.PI * 2, 12);
      fillPanel(ctx, dot, k === page ? PALETTE.leafMid : tint(PALETTE.inkSoft, 0.7, PALETTE.paper), {
        alpha: 0.95, layers: 1, wetEdge: false, seedIndex: 3680 + k,
      });
      strokeInk(ctx, dot, { width: 2, close: true, seedIndex: 3684 + k });
    }

    // 按钮：上一步 / 下一步（最后一页为「完成」）
    const by = o.y + h - 84;
    if (page > 0) {
      drawWoodButton(ctx, MODAL_CANCEL_X, by, MODAL_BTN_W, MODAL_BTN_H, '上一步', this.press === 'prev', 3690);
    }
    drawWoodButton(ctx, MODAL_OK_X, by, MODAL_BTN_W, MODAL_BTN_H,
      page >= 2 ? '完成' : '下一步', this.press === 'next', 3692);
  }

  private drawResetModal(ctx: CanvasRenderingContext2D): void {
    const w = 640;
    const h = 300;
    const o = this.modalPlate(ctx, w, h);
    textOutlined(ctx, '确认重置存档？', SCREEN.W / 2, o.y + 56, FONT.h2, PALETTE.berry, 'center', 2.4);
    wrapText(ctx, '会清空爪印币、星辉、图鉴、穿搭与战绩，并立即写入本地存档。这一步无法撤销。',
      SCREEN.W / 2, o.y + 108, w - 90, FONT.body - 2, 30, rgba(PALETTE.inkSoft, 0.9), 'center', 3);
    const by = o.y + h - 88;
    drawWoodButton(ctx, MODAL_CANCEL_X, by, MODAL_BTN_W, MODAL_BTN_H, '取消', this.press === 'cancel', 3700);
    drawWoodButton(ctx, MODAL_OK_X, by, MODAL_BTN_W, MODAL_BTN_H, '确认重置', this.press === 'confirm', 3702);
  }

  /* ------------------------------------------------------------ 手势 */

  gesture(e: GestureEvent): void {
    if (e.type === 'move') return;

    if (this.modal !== '') {
      const my = SCREEN.H / 2 - (this.modal === 'tutorial' ? 470 : 300) / 2 - 10 +
        (this.modal === 'tutorial' ? 470 - 84 : 300 - 88);
      if (e.type === 'down') {
        if (this.modal === 'tutorial' && this.page > 0 &&
          inRect(e.x, e.y, MODAL_CANCEL_X, my, MODAL_BTN_W, MODAL_BTN_H)) this.press = 'prev';
        else if (inRect(e.x, e.y, MODAL_OK_X, my, MODAL_BTN_W, MODAL_BTN_H)) {
          this.press = this.modal === 'reset' ? 'confirm' : 'next';
        } else this.press = '';
        this.pressMs = 200;
        return;
      }
      if (e.type !== 'up' || e.wasDrag) return;
      const was = this.press;
      this.press = '';
      if (was === 'prev') {
        playSfx('tap');
        this.page--;
        return;
      }
      if (was === 'confirm') {
        playSfx('reject');
        this.applyReset();
        this.modal = '';
        this.showToast('存档已重置');
        return;
      }
      if (was === 'next') {
        if (this.modal === 'reset') {
          playSfx('tap');
          this.modal = '';
          return;
        }
        if (this.page < 2) {
          playSfx('tap');
          this.page++;
        } else {
          playSfx('cardPick');
          this.modal = '';
        }
        return;
      }
      return;
    }

    if (e.type === 'down') {
      if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) this.press = 'back';
      else if (this.musicToggleHit(e.x, e.y)) this.press = 'music';
      else if (this.sfxToggleHit(e.x, e.y)) this.press = 'sfx';
      else if (inRect(e.x, e.y, TUTORIAL_BTN.x, TUTORIAL_BTN.y, TUTORIAL_BTN.w, TUTORIAL_BTN.h)) this.press = 'tutorial';
      else if (inRect(e.x, e.y, RESET_BTN.x, RESET_BTN.y, RESET_BTN.w, RESET_BTN.h)) this.press = 'reset';
      else this.press = '';
      this.pressMs = 200;
      return;
    }
    if (e.type !== 'up' || e.wasDrag) return;
    const was = this.press;
    this.press = '';

    if (inRect(e.x, e.y, BACK_X, BACK_Y, BACK_SIZE, BACK_SIZE)) {
      playSfx('tap');
      pop();
      return;
    }
    if (this.musicToggleHit(e.x, e.y)) {
      const save = loadSave();
      save.audio.music = !save.audio.music;
      saveNow();
      syncBgm();
      playSfx('tap');
      this.showToast(save.audio.music ? '背景音乐已开启' : '背景音乐已关闭');
      return;
    }
    if (this.sfxToggleHit(e.x, e.y)) {
      const save = loadSave();
      save.audio.sfx = !save.audio.sfx;
      saveNow();
      if (save.audio.sfx) playSfx('cardPick');
      else stopAllSfx();
      this.showToast(save.audio.sfx ? '音效已开启' : '音效已关闭');
      return;
    }
    if (inRect(e.x, e.y, TUTORIAL_BTN.x, TUTORIAL_BTN.y, TUTORIAL_BTN.w, TUTORIAL_BTN.h)) {
      playSfx('cardPick');
      this.page = 0;
      this.modal = 'tutorial';
      return;
    }
    if (inRect(e.x, e.y, RESET_BTN.x, RESET_BTN.y, RESET_BTN.w, RESET_BTN.h)) {
      playSfx('tap');
      this.modal = 'reset';
      return;
    }
    if (was !== '') this.pressMs = 0;
  }

  private musicToggleHit(x: number, y: number): boolean {
    return inRect(x, y, L_X + L_W - 44 - TOGGLE_W - 18, MUSIC_ROW_Y + (56 - TOGGLE_H) / 2, TOGGLE_W, TOGGLE_H);
  }

  private sfxToggleHit(x: number, y: number): boolean {
    return inRect(x, y, L_X + L_W - 44 - TOGGLE_W - 18, SFX_ROW_Y + (56 - TOGGLE_H) / 2, TOGGLE_W, TOGGLE_H);
  }

  /** 就地把存档字段复位 + 立即落盘（不改 storage.ts 的结构）。 */
  private applyReset(): void {
    const d = defaultSave();
    const s = loadSave();
    s.version = d.version;
    s.coins = d.coins;
    s.stars = d.stars;
    s.trainer = d.trainer;
    s.pets = d.pets;
    s.skills = d.skills;
    s.cardsSeen = d.cardsSeen;
    s.collection = d.collection;
    s.impSkin = d.impSkin;
    s.rank = d.rank;
    s.stats = d.stats;
    s.lastDailyWin = d.lastDailyWin;
    s.audio = d.audio;
    saveNow();
  }

  private showToast(text: string): void {
    this.toastText = text;
    this.toastMs = 320;
  }
}

export function createSettingsScene(): Scene {
  return new SettingsScene();
}