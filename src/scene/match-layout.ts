/**
 * 对局界面的几何与命中测试（§2.6 布局 / §4 棋盘 / §7.5 卡面）。
 *
 * 只做「逻辑坐标 ↔ 像素 ↔ 命中区」的换算，不画任何东西、不读任何状态，
 * 让场景层（渲染）与交互层共用同一份坐标定义，避免两处各写一套。
 */
import { LAYOUT, anchorToPixel } from '../config/layout';
import { TIMING } from '../config/timing';
import { Faction } from '../core/types';
import { ANCHOR_COUNT, anchorColRow, isPlayerAnchor } from '../core/setup';
import { getViewport } from '../platform/screen';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 两侧 HUD 的「贴边外移量」（逻辑单位）。
 *
 * 1280×720 是设计基准，但视口会按真实屏幕比例等比外扩（见 platform/screen.ts）：
 * 逻辑可视区是 `-padX .. 1280 + padX`。左右两列 HUD（双方条目、齿轮、卷轴、阳光币、
 * 饲养员/小屋、小恶魔）必须跟着外移 padX，才能贴住真实屏幕两边——否则宽屏上会在
 * 两侧各留一条空背景，这正是「内容没有主动填满可用宽度」的观感问题。
 * 棋盘/替补席/手牌/横幅保持居中不动，贴合底板烘焙元素。
 */
export function sideOut(): number {
  return getViewport().padX;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function rectCenter(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** 棋盘可交互区域（不含左右侧栏与底部替补席）。 */
export const BOARD_RECT: Rect = LAYOUT.BOARD;

/** 阶段横幅（回合·阶段名·倒计时）。 */
export const BANNER_RECT: Rect = { x: 210 + (860 - 320) / 2, y: 12, w: 320, h: 62 };

/** 左：我方条目 6 条；右：敌方条目 6 条（左右列按视口留边外移，贴住真实屏幕边）。 */
export function entryRect(faction: Faction, index: number): Rect {
  const e = faction === 'player' ? LAYOUT.MY_ENTRY : LAYOUT.ENEMY_ENTRY;
  const out = sideOut();
  const x = faction === 'player' ? e.x - out : e.x + out;
  return { x, y: e.y + index * (e.h + e.gap), w: e.w, h: e.h };
}

/** 两侧条目背后的木质挂条（与条目同宽同高，随条目一起外移）。 */
export function entryPanelRect(faction: Faction): Rect {
  const e = faction === 'player' ? LAYOUT.MY_ENTRY : LAYOUT.ENEMY_ENTRY;
  const out = sideOut();
  const colH = e.h * 6 + e.gap * 5 + 24;
  const x = faction === 'player' ? e.x - 6 - out : e.x - 6 + out;
  return { x, y: e.y - 12, w: e.w + 12, h: colH };
}

export function entryAt(x: number, y: number): { faction: Faction; index: number } | null {
  for (let i = 0; i < 6; i++) {
    if (inRect(entryRect('player', i), x, y)) return { faction: 'player', index: i };
  }
  for (let i = 0; i < 6; i++) {
    if (inRect(entryRect('enemy', i), x, y)) return { faction: 'enemy', index: i };
  }
  return null;
}

/** 齿轮（设置）/ 卷轴（战绩）/ 阳光币：均随两侧 HUD 外移贴边。 */
export function gearRect(): Rect {
  const out = sideOut();
  return { x: LAYOUT.GEAR.x - out, y: LAYOUT.GEAR.y, w: LAYOUT.GEAR.size, h: LAYOUT.GEAR.size };
}

export function scrollRect(): Rect {
  const out = sideOut();
  return { x: LAYOUT.SCROLL.x + out, y: LAYOUT.SCROLL.y, w: LAYOUT.SCROLL.size, h: LAYOUT.SCROLL.size };
}

export function sunCoinRect(): Rect {
  const out = sideOut();
  return { x: LAYOUT.SUN_COIN.x + out, y: LAYOUT.SUN_COIN.y, w: LAYOUT.SUN_COIN.size, h: LAYOUT.SUN_COIN.size };
}

/** 左下饲养员头像 + 小屋 HP。 */
export function coachRect(): Rect {
  const c = LAYOUT.MY_COACH;
  const out = sideOut();
  return { x: c.x - out, y: c.y, w: c.avatar, h: c.avatar };
}

export function houseRect(): Rect {
  const c = LAYOUT.MY_COACH;
  const cr = coachRect();
  return { x: cr.x + c.avatar + 8, y: c.y + 4, w: c.house.w, h: c.house.h };
}

/** 右下敌方小恶魔立绘区。 */
export function impRect(): Rect {
  const out = sideOut();
  return { x: LAYOUT.ENEMY_IMP.x + out, y: LAYOUT.ENEMY_IMP.y, w: LAYOUT.ENEMY_IMP.w, h: LAYOUT.ENEMY_IMP.h };
}

/** 替补席 8 格（战斗阶段收窄）。 */
export function benchRect(index: number, narrow?: boolean): Rect {
  const b = LAYOUT.BENCH;
  const total = b.slots * b.cell + (b.slots - 1) * b.gap;
  const x0 = LAYOUT.BOARD.x + (LAYOUT.BOARD.w - total) / 2;
  const h = narrow ? LAYOUT.BENCH_NARROW_H : b.cell;
  const y = narrow ? LAYOUT.SCREEN_H - LAYOUT.BENCH_NARROW_H - 6 : b.y;
  return { x: x0 + index * (b.cell + b.gap), y, w: b.cell, h };
}

export function benchAt(x: number, y: number, narrow?: boolean): number {
  for (let i = 0; i < LAYOUT.BENCH.slots; i++) {
    if (inRect(benchRect(i, narrow), x, y)) return i;
  }
  return -1;
}

/** 手牌区（买到的加成牌停在这里，等玩家拖到动物身上）。 */
export function handRect(index: number): Rect {
  const w = 96;
  const h = 132;
  const gap = 12;
  const total = 5 * w + 4 * gap;
  const x0 = LAYOUT.BOARD.x + (LAYOUT.BOARD.w - total) / 2;
  const y = LAYOUT.BENCH.y - h - 12;
  return { x: x0 + index * (w + gap), y, w, h };
}

export function handAt(x: number, y: number): number {
  for (let i = 0; i < 5; i++) {
    if (inRect(handRect(i), x, y)) return i;
  }
  return -1;
}

/** 集市货架 5 张卡：坐标对齐集市底板（art-src/ui-market-v2）里烘死的 5 个卡位。 */
export const SHELF = { x0: 80, y0: 170, w: 210, h: 390, pitch: 231 };

export function shelfRect(index: number): Rect {
  return { x: SHELF.x0 + index * SHELF.pitch, y: SHELF.y0, w: SHELF.w, h: SHELF.h };
}

export function shelfAt(x: number, y: number): number {
  for (let i = 0; i < 5; i++) {
    if (inRect(shelfRect(i), x, y)) return i;
  }
  return -1;
}

/** 集市底板里烘死的木质元素位置，程序化 HUD 按这些坐标盖上去。 */
export const MARKET = {
  banner: { x: 456, y: 16, w: 374, h: 92 } as Rect,
  gear: { x: 4, y: 6, size: 100 },
  sunRect: { x: 1002, y: 8, w: 234, h: 84 } as Rect,
  ready: { x: 1116, y: 100, w: 154, h: 56 } as Rect,
};

/** 集市：刷新圆牌 + 本轮免费赠礼木牌（对齐底板上烘死的圆牌与木牌）。 */
export function refreshRect(): Rect {
  return { x: 1100, y: 555, w: 150, h: 150 };
}

export function giftRect(): Rect {
  return { x: 862, y: 612, w: 188, h: 84 };
}

/** 布阵阶段「准备就绪」木牌。 */
export function readyRect(): Rect {
  return { x: LAYOUT.BOARD.x + LAYOUT.BOARD.w / 2 - 110, y: 500, w: 220, h: 66 };
}

/** 详情页 / 战绩卷轴 / 设置 面板。 */
export function detailRect(): Rect {
  return { x: LAYOUT.BOARD.x + 24, y: 54, w: 520, h: 540 };
}

export function warbookRect(): Rect {
  return { x: 748, y: 64, w: 500, h: 520 };
}

export function settingsRect(): Rect {
  return { x: 420, y: 110, w: 440, h: 440 };
}

/** 详情页按钮：卸下加成 / 卖出 / 关闭。 */
export function detailButtonRect(index: number): Rect {
  const d = detailRect();
  const w = 150;
  const gap = 16;
  const x0 = d.x + (d.w - (3 * w + 2 * gap)) / 2;
  return { x: x0 + index * (w + gap), y: d.y + d.h - 74, w, h: 56 };
}

/** 结算页底部三按钮：再来一局 / 返回营地 / 分享战绩。 */
export function resultButtonRect(index: number): Rect {
  const w = 268;
  const gap = 18;
  const x0 = 306;
  return { x: x0 + index * (w + gap), y: 632, w, h: 68 };
}

/** 结算页战报翻页箭头（贴在伤害构成面板左右木框上）。 */
export function reportArrowRect(dir: number): Rect {
  return { x: dir < 0 ? 334 : 736, y: 314, w: 30, h: 30 };
}

/**
 * 逻辑点位 → 棋盘像素。逻辑层点位号（0..47）与渲染网格不同：
 * setup 里 anchor 0..5 / row 0 起按行优先编号，这里统一走 `anchorColRow`。
 */
const ANCHOR_PIXELS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  for (let a = 0; a < ANCHOR_COUNT; a++) {
    const cr = anchorColRow(a);
    out.push(anchorToPixel(cr.col, cr.row));
  }
  return out;
})();

export function anchorPixel(anchor: number): { x: number; y: number } {
  if (anchor < 0 || anchor >= ANCHOR_PIXELS.length) return { x: -999, y: -999 };
  return ANCHOR_PIXELS[anchor];
}

/** 落点判定半径：格子边长的一半（拖拽吸附距离 = 0.5 单位，§4.3）。 */
export function snapRadiusPx(): number {
  return LAYOUT.GRID.cellW * TIMING.SNAP_DISTANCE;
}

/** 最近的**我方**点位（敌方点位任何阶段都不可交互）。点不到返回 -1。 */
export function nearestPlayerAnchor(x: number, y: number, maxPx?: number): number {
  const lim = maxPx === undefined ? snapRadiusPx() : maxPx;
  let best = -1;
  let bestD = lim * lim;
  for (let a = 0; a < ANCHOR_PIXELS.length; a++) {
    if (!isPlayerAnchor(a)) continue;
    const p = ANCHOR_PIXELS[a];
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** 像素落在哪个点位判定圈里（含敌方，用于日志/演出，不用于交互）。 */
export function nearestAnchor(x: number, y: number, maxPx?: number): number {
  const lim = maxPx === undefined ? snapRadiusPx() : maxPx;
  let best = -1;
  let bestD = lim * lim;
  for (let a = 0; a < ANCHOR_PIXELS.length; a++) {
    const p = ANCHOR_PIXELS[a];
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** 点位是否在棋盘可视范围内（用于裁剪与视差）。 */
export function anchorVisible(anchor: number): boolean {
  const p = anchorPixel(anchor);
  return inRect(BOARD_RECT, p.x, p.y);
}