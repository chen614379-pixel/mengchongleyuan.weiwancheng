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

/** 侧栏条目在底板烘焙件上的落脚点（血环中心与半径）。 */
export interface PlateSlot {
  cx: number;
  cy: number;
  r: number;
  baked: boolean;
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

/**
 * 侧栏底衬覆盖矩形（把底板烘死的 4 格 / 3 格旧纸槽整块盖掉）。
 *
 * 底板（assets/bg/bg-board-wide.jpg）实测（逻辑坐标 = 图像 x − 192）：
 * - 左栏白纸槽 y 108..536（4 格，pitch ≈110，暗隔条 204 / 316 / 428），
 *   横向延伸到 x ≈ 200；**x ≤ 122 / y ≥ 459.6 是烘死的「戴草帽大男孩」**。
 * - 右栏白纸槽 x 1068..1260 / y 113..464；**x 902..1040 / y 20..200 是烘死的「小恶魔」**。
 *
 * 用户 2026-10-14 口径：侧栏**只用圆形头像框**，底板那版纸槽必须整块消失；
 * 同时**绝不压住大男孩与小恶魔**。所以覆盖区被切成「避让这两块美术」的形状：
 * - 我方：上段盖满（1~3 号槽都在大男孩之上），再补一条只到 y 460（大男孩头顶 459.6）的横带
 *   把 4 号槽露在他头顶上方的纸盖掉，最后盖 4 号槽在他右侧的部分。
 * - 敌方：左边界推到 x 1046（小恶魔右沿 1040 之外），正好仍在纸槽范围之内。
 *
 * 底衬本身**不画纸槽、不画木栏**：底板上那一栏是「深色底 + 米白纸槽」，
 * 再铺一块 bark 木栏去盖就变成两套 UI 叠在一起（用户反复报的「覆盖」）。
 * 具体画法见 render/sidebar.ts 的 drawSideStripBacking。
 */
export function sideBackingRects(faction: Faction): Rect[] {
  const out = sideOut();
  if (faction === 'player') {
    return [
      { x: 2 - out, y: 96, w: 214, h: 348 },      // y 96..444：盖住 1~3 号纸槽
      // 4 号槽顶部露在大男孩头顶（y 459.6）之上的那一整片纸：只补到 459，绝不碰到大男孩。
      { x: 2 - out, y: 440, w: 124, h: 19 },
      // 4 号槽在大男孩右肩上方还漏出一小片白纸（x 106..124 / y 460..470，底板实测纯白），
      // 补到 y 470 为止 —— 再往下就是他的草帽，不能碰。
      { x: 106 - out, y: 440, w: 20, h: 30 },
      // 4 号槽露在大男孩右侧的纸：底板实测 x124..216 的纸面只到 y484，
      // y492 起就是他的宽檐草帽（实测 rgb 222..236 暖白）——所以补丁到此为止，绝不压帽子。
      { x: 124 - out, y: 428, w: 92, h: 56 },
    ];
  }
  return [{ x: 1046 + out, y: 108, w: 234, h: 364 }];
}

export function entryAt(x: number, y: number): { faction: Faction; index: number } | null {
  for (let i = 0; i < 6; i++) {
    if (inRect(plateSlot('player', i), x, y)) return { faction: 'player', index: i };
  }
  for (let i = 0; i < 6; i++) {
    if (inRect(plateSlot('enemy', i), x, y)) return { faction: 'enemy', index: i };
  }
  return null;
}

/**
 * 侧栏条目槽位（底板烘焙版）。
 *
 * 6 格**一律均分**，不再区分「烘焙 4 格 + 底下窄条 2 格」：
 * 所有格子的 h、gap、ring 半径都来自 LAYOUT.MY_ENTRY / ENEMY_ENTRY / PLATE.ringR，
 * 所以左右两侧各能稳定竖排 6 个血条框，且尺寸、间距完全一致。
 *
 * `baked` 仅表示「这一格落在底板原本烘过的纸面上」（外观更贴底），
 * 交互与绘制**不再依赖它**——`drawSideEntryBaked` 对两种格子用同一套逻辑。
 */
export function plateSlot(faction: Faction, index: number): PlateSlot & Rect {
  const out = sideOut();
  const e = faction === 'player' ? LAYOUT.MY_ENTRY : LAYOUT.ENEMY_ENTRY;
  const dx = faction === 'player' ? -out : out;
  const cx = (faction === 'player' ? LAYOUT.PLATE.playerRingCx : LAYOUT.PLATE.enemyRingCx) + dx;
  const y = e.y + index * (e.h + e.gap);
  // 底板原本烘过的格数（左 4 / 右 3）只用于挑选更贴底的外观，不影响几何。
  const bakedCount = faction === 'player' ? 4 : 3;
  return {
    x: e.x + dx, y, w: e.w, h: e.h,
    cx, cy: y + e.h / 2,
    r: LAYOUT.PLATE.ringR,
    baked: index < bakedCount,
  };
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

/** 替补席 8 格（战斗阶段只换命中区基线，绘制尺寸恒定）。
 *
 * 尺寸规则（与 render/sidebar.ts 的 drawBench 严格对齐）：
 * 动物在任何阶段都按 LAYOUT.BENCH_ART.size 绘制、脚底恒落在 BENCH_ART.seatY，
 * 所以**动物画出来的矩形两个阶段完全一致**；`narrow` 只把命中区上移，
 * 让战斗阶段的点击范围避开上方的棋盘区。
 * 命中区始终**罩住**画出来的动物，不会出现「看得见点不到」。
 */
export function benchRect(index: number, narrow?: boolean): Rect {
  const b = LAYOUT.BENCH;
  const art = LAYOUT.BENCH_ART;
  const total = b.slots * b.cell + (b.slots - 1) * b.gap;
  const x0 = LAYOUT.BOARD.x + (LAYOUT.BOARD.w - total) / 2;
  // 动物实际占据的竖直范围（上沿 → 脚底），两阶段同值。
  //
  // 注意不能用 `seatY - lift - size` 当上沿：drawBench 现在按**宽度**归一化
  // （见 render/sidebar.ts），高度随物种比例伸缩，最高的 wolf 是
  // size * 241/146 ≈ 145，远高于 size 本身。所以这里取「所有物种里最高的那个」
  // 作为上沿，命中区才能真正罩住画出来的动物。
  const tallest = artTallestHeight();
  const artTop = art.seatY - art.lift - tallest;
  const artBottom = art.seatY;
  // 命中区：以动物实际矩形为准，再按需向下延伸到棋盘下沿（布阵阶段更好点）。
  const y = narrow ? artTop - 6 : Math.min(b.y, artTop - 6);
  const bottom = narrow ? artBottom + 6 : Math.max(b.y + b.cell, artBottom + 6);
  const h = Math.min(bottom, LAYOUT.SCREEN_H) - y;
  return { x: x0 + index * (b.cell + b.gap), y, w: b.cell, h };
}

/**
 * 候补席动物按宽度归一化后可能达到的最大绘制高度。
 *
 * `drawBench` 用 `k = size / boxW` 把可见内容宽度统一成 BENCH_ART.size，
 * 高度 = boxH * k，所以最"瘦高"的物种就是最高的那个（实测 wolf 145、
 * lion 118、cat 108）。命中区按这个高度取上沿即可覆盖全部物种。
 */
export function artTallestHeight(): number {
  const art = LAYOUT.BENCH_ART;
  const box = LAYOUT.SPECIES_ART_BOX;
  let tallest = art.size as number;
  for (const key in box) {
    const b = box[key];
    if (!b || b.length < 4) continue;
    const h = b[3] * (art.size / b[2]);
    if (h > tallest) tallest = h;
  }
  return tallest;
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

/**
 * 集市货架 5 张卡的位置（对齐集市底板 art-src/ui-market-v2 里烘死的 5 个木框）。
 *
 * 关键：底板的 5 个木框**不是等距的**。旧实现假设 `pitch = 231` 的均匀排布，
 * 但实测木框立板（竖直暗条）落在：
 *   [81,289] [321,519] [551,746] [777,974] [1005,1205]
 * 宽 208 / 198 / 195 / 197 / 200，第 2~5 个框的左边比均匀排布各偏 +10 / +9 / +4 / +1。
 * 这就是「卡牌与木板模板错位、像两张脱节的贴片」的根因——最多错 10px。
 *
 * 现在按实测逐框写死左右边界，`inset` 是卡牌相对木框外沿的内缩量：
 * 卡牌盖住木框的绝大部分，只留一圈窄木边（木框描边效果）。
 */
/**
 * 集市木架定位（2026-10-15 重定：**对齐底板烘死的样例卡**）。
 *
 * 历史：这里曾有一版「整体上移 + 等比缩小」的 MARKET_LIFT = -58，
 * 那是为了让面板避开候补席、把卡牌缩到 y 130..400。但用户要的是
 * 「把绘制的卡放到样例卡位置」——底板烘死的样例卡在 y 176..549，
 * 自估出来的 130..400 永远对不上，所以整块面板改为**按样例卡实测值写死**
 * （见 SHELF.y0 / SHELF.h），MARKET_LIFT 随之删除。
 *
 * 横向不缩放：5 个卡位的左右边界仍按底板实测逐框写死（见 SHELF.frames）。
 */

export const SHELF = {
  /**
   * 木框顶 = **底板烘焙样例卡的顶边往上 8px**。
   *
   * 用户 2026-10-15 的口径：「我要的就是底下那层烘死的样例样式，如果你能绘制
   * 几乎完全相似的就可以把底下那层抹除掉，然后把你绘制的放到样例卡位置，
   * 需要注意显示卡牌信息和底板尺寸的符合。」
   *
   * 实测量出底板烘死样例卡的真实外框是**逻辑 y 176..549（高 373）**，
   * 而之前 SHELF.y0 = 130 是我为了「在 108..576 里居中」硬凑的，
   * 结果木架比底板样例卡高出 46px、卡牌也画在 y 138..403 ——
   * 和底板那版的位置对不上，就是用户说的「不像样例那一版」。
   *
   * 现在直接把木架对齐到样例卡：y0 = 176 − inset(8) = 168，h = 373 + 8×2 = 389。
   * 木底 168..557，样例卡 176..549 完整落在里面，卡牌 = shelfRect() 正好压在样例位。
   */
  y0: 168,
  /**
   * 木框（木底）高 = 样例卡高 373 + 上下各留 `inset`(8) = 389，即木底 168..557。
   *
   * 底板 ui-market-wide.jpg 在 5 个卡位里**烘死了整套样例卡牌**（动物插画、费用、
   * 「×2 可合成」角标、木牌名「虎」、以及「攻104 速1.15s 血800」整行数值），
   * 实测纵向占逻辑 y 176..549。木底必须完整盖住它，所以 h 由样例卡高度反推，
   * 不再是我自己估的 412。
   *
   * 木底覆盖由 `drawShelf` 用**底板自身的木纹像素**铺出来（drawPlateWoodPatch，
   * 左右边缘条镜像平铺），不是另画一块 bark 木栏——那正是用户反复报的「覆盖」。
   */
  h: 389,
  /** 卡牌相对木框四周的内缩量：留出这一圈木边 */
  inset: 8,
  /** 逐框实测的左右外沿（logical x），顺序即卡位 0..4 */
  frames: [
    { x: 81, w: 208 },
    { x: 321, w: 198 },
    { x: 551, w: 195 },
    { x: 777, w: 197 },
    { x: 1005, w: 200 },
  ],
};

/**
 * 集市阶段的两列出战席（提示词 P0-⑧：「把出战页面的左侧栏出战的动物也在集市页面可见」）。
 *
 * 位置跟着卡牌改：卡牌现在是**底板样例卡的整位**（y 176..549），
 * 原来横排两行所在的 y 404..536 已经被卡牌占满，所以出战席改成
 * **左右最外侧边缘的竖排两列**——卡位区是 x 81..1205，两侧边距 x 0..79 / 1206..1280
 * 是底板自身的木质边条，竖排正好落在上面，且完全不出画布、不压卡牌。
 *
 * 单格 62×62、间距 0（连排），血环半径取 `min(ringR, 格/2 − 2)` = 24，
 * 直径 48 仍在格内；因为格宽放不下右侧的「HP」两行文字与 Lv 角标，
 * 这里用 `compact` 模式只画**圆形头像框 + 绿色血量弧 + 状态点**
 * （与用户 2026-10-15 要求的侧栏口径一致：围绕圆框的绿色弧线就是血量）。
 *
 * 竖向：我方 y 176..548（6×62=372），敌方 y 170..542 —— 都避开
 * 顶部齿轮/费用牌（底 98）、底部烘焙刷新圆牌（顶 545）与候补席。
 */
export const MARKET_SIDE = {
  /** 每列显示的格数（与战斗侧栏一致，便于左右对照） */
  slots: 6,
  /** 单格宽高：够放下 r=24 的头像圆框 */
  cell: { w: 62, h: 62 },
  gap: 0,
  /** 两列的首格位置：我方贴左边缘，敌方贴右边缘 */
  xPlayer: 2,
  xEnemy: 1216,
  yPlayer: 176,
  yEnemy: 170,
};

/** 集市阶段某一列的出战席（首格的 x/y 与格宽高、纵向间距）。 */
export function marketSideRow(faction: Faction): { x: number; y: number; w: number; h: number; gap: number } {
  return {
    x: faction === 'player' ? MARKET_SIDE.xPlayer : MARKET_SIDE.xEnemy,
    y: faction === 'player' ? MARKET_SIDE.yPlayer : MARKET_SIDE.yEnemy,
    w: MARKET_SIDE.cell.w,
    h: MARKET_SIDE.cell.h,
    gap: MARKET_SIDE.gap,
  };
}

/**
 * 集市卡位矩形（卡牌本体，用于绘制与命中）。
 *
 * **返回的就是卡牌本身的矩形，且完全等于底板烘焙样例卡的位置**：
 * 木框（shelfFrameRect）向内缩 `SHELF.inset`(8) 一整圈 → 卡牌 176..549（高 373）、
 * 四周各露 8px 木边。用户 2026-10-15 的口径是「把你绘制的放到样例卡位置」，
 * 所以卡牌不再按卡面纵横比（0.724）自己算高度，而是**撑满样例位**——
 * 卡面图会被纵向拉伸到样例卡的 0.53 比例，这是"用我们画的卡占住样例位"的唯一做法。
 *
 * 绘制与命中共用这一个矩形（`shelfAt` 直接用它），
 * 所以卡牌点击热区与画出来的卡面**逐像素一致**。
 */
export function shelfRect(index: number): Rect {
  const f = SHELF.frames[index] || SHELF.frames[SHELF.frames.length - 1];
  const i = SHELF.inset;
  return { x: f.x + i, y: SHELF.y0 + i, w: f.w - i * 2, h: SHELF.h - i * 2 };
}

/** 木框（木底）外沿矩形：**不是命中区**，只用来把盖住烘焙样例卡的木底铺出来。 */
export function shelfFrameRect(index: number): Rect {
  const f = SHELF.frames[index] || SHELF.frames[SHELF.frames.length - 1];
  return { x: f.x, y: SHELF.y0, w: f.w, h: SHELF.h };
}

export function shelfAt(x: number, y: number): number {
  for (let i = 0; i < 5; i++) {
    if (inRect(shelfRect(i), x, y)) return i;
  }
  return -1;
}

/**
 * 集市底板里烘死的木质元素位置，程序化 HUD 按这些坐标盖上去（已含上移量）。
 *
 * 全部按「安全区」约束反推：
 *  - `gear`：用户报「左上齿轮被屏幕边缘裁切」。底板把齿轮烘在贴边位置，
 *    我们重画时必须整体内移，距上边与左边各留 ≥12px。
 *  - `sunRect`：右侧阳光币条。底板位置偏右，会贴到微信胶囊；
 *    收窄并左移，保证费用数字与右边距之间留出胶囊安全区。
 *  - `banner`：回合横幅。倒计时原先画在横幅**下方**（y = banner 底 + 6），
 *    被下沿的木纹吃掉一半，现在改成画在横幅**内部**的底边，与标题分层。
 */
export const MARKET = {
  banner: { x: 456, y: 16, w: 374, h: 92 } as Rect,
  // 齿轮：size 100 → 84，位置 4,6 → 14,14（距上/左各 14px ≥ 12px）
  gear: { x: 14, y: 14, size: 84 },
  // 阳光币条：右沿 1236 → 1176，为微信胶囊（横屏通常在 x ≥ 1192）留出 ≥16px 安全区（P1-⑬）
  sunRect: { x: 962, y: 8, w: 214, h: 84 } as Rect,
  /**
   * 「结束集市」的圆形 ❌（提示词 P1-⑭ 改圆形，P2-⑳ 归入次要操作组）。
   *
   * 位置再次挪动：卡牌撑满样例位（y 176..549）后，右下角 y 430 一带被卡牌占满，
   * 而右侧边距（x 1216..1278）要留给集市的敌方出战席列，所以 ❌ 移到
   * **顶部横幅右侧、阳光币条左侧的空档**：横幅右沿 830、费用牌左沿 962，
   * 取 x 840..912 ✓ 两不相交；竖向 18..90 与费用牌（y 8..92）同层但横向隔开 50px。
   * 整个按钮在屏内、不在微信胶囊一侧，也不与任何卡牌/出战席/候补席相交。
   */
  exitRect: { x: 840, y: 18, w: 72, h: 72 } as Rect,
};

/**
 * 集市：刷新圆牌 + 本轮免费赠礼木牌。
 *
 * 按「遮挡处理优先级原则」：集市底板 ui-market-wide.jpg 已经**烘死了**一套
 * 「刷新」绿圆牌与「本轮免费赠礼 / 1 张」木牌，而底板的美术与卡槽是一体的
 * （同一张插画、同一套木纹与光影），程序化重画的那一套永远贴不出底板的质感，
 * 两套并存时玩家看到的必然是「重复 UI」。所以保留**底板那一版**（被木框面板
 * 压住的那一版），删掉程序化重画的那一套，只把**命中区与数值**接管过来。
 *
 * 实测底板烘焙位置（逻辑坐标 = 图像 x − 192），由逐行/逐列亮度 profile 扫出：
 *   刷新圆牌外框 = (1100, 545, 140, 136)，圆心约 (1170, 613)、直径约 140
 *   赠礼木牌牌面 = (868, 618, 178, 72)（牌上方 y 576..612 是细木柱，不算牌面）
 * 下面给出的矩形就是按实测值定的，绘制端只在圆牌中心叠一个「刷新 · N」数字。
 */
export function refreshRect(): Rect {
  // 底板烘焙圆牌的**外框**实测（浅绿圆盘 + 白描边的行列 profile）：
  // 逻辑 x 1100..1240 / y 545..681，即圆心 (1170, 613)、直径约 140。
  // 绘制端只在这个圆内叠「刷新」+ 费用数字，不画圆盘本身。
  return { x: 1100, y: 545, w: 140, h: 136 };
}

export function giftRect(): Rect {
  // 底板烘焙赠礼木牌的**牌body**实测（逐行扫描亮木色 plank）：
  // 逻辑 x 868..1046 / y 618..690（牌上方 y 576..612 是细木柱，不算牌面）。
  //
  // 候补席动物占据 x 304..976，所以木牌左半（x 868..976）与最右侧 1 只候补动物
  // 的竖直带有重叠——但那是**底板本身**的构图（木牌就画在草地上、与候补席同层）。
  // 按遮挡优先级原则，木牌是信息主体之一（玩家要看赠礼状态），候补席也是；
  // 两者在底板上本来就是并排的，程序化层不应该再额外画一块把任一方盖掉，
  // 所以这里只把**文字**贴着烘焙牌面排版，不再画任何木底。
  return { x: 868, y: 618, w: 178, h: 72 };
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