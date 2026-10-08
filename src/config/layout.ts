/**
 * 横屏布局与排版常量（§2.6 / §2.8 / §7.5）。
 * 逻辑分辨率 1280×720，渲染层按 letterbox 映射到真实屏幕。
 */
export const LAYOUT = {
  SCREEN_W: 1280,
  SCREEN_H: 720,

  /** 左/右侧栏宽度 */
  SIDE_W: 210,
  /** 底部替补席高度 */
  BENCH_H: 104,
  /** 中央棋盘区（不含侧栏与底部） */
  BOARD: { x: 210, y: 0, w: 860, h: 616 },

  /** 棋盘逻辑网格 12×8，我方 6×4 左下、敌方 6×4 右上（§4.1） */
  GRID: { cols: 12, rows: 8, originX: 232, originY: 44, cellW: 68, cellH: 68, farSquash: 0.12 },

  /** 左侧栏控件 */
  GEAR: { x: 16, y: 14, size: 46 },
  MY_ENTRY: { x: 10, y: 74, w: 190, h: 64, gap: 8 },
  MY_COACH: { x: 12, y: 500, avatar: 56, house: { w: 150, h: 46 } },

  /** 右侧栏控件 */
  SCROLL: { x: 1280 - 16 - 46, y: 14, size: 46 },
  ENEMY_ENTRY: { x: 1280 - 10 - 190, y: 74, w: 190, h: 64, gap: 8 },
  SUN_COIN: { x: 1280 - 16 - 56, y: 520, size: 56 },
  ENEMY_IMP: { x: 1000, y: 40, w: 150, h: 150 },

  /** 底部替补席：8 格 84×84，居中 */
  BENCH: { slots: 8, cell: 84, gap: 10, y: 720 - 104 + 8 },
  /** 战斗阶段替补席收窄 */
  BENCH_NARROW_H: 46,

  /** 卡牌（§7.5） */
  CARD: { w: 168, h: 232, radius: 16, artRatio: 0.48, overflow: 12 },

  /** 血量环（§2.8） */
  RING: { gap: 8, width: 5, trackWidth: 2.5, ghostAlpha: 0.5, notchW: 1, sidebarRadius: 24, sidebarWidth: 3 },

  /** 牧场 → 渲染：远端透视压缩（仅渲染，逻辑层无透视） */
  PERSPECTIVE: 0.12,

  /** 列表与按钮 */
  ENTRY: { w: 190, h: 64, radius: 18 },
  PANEL_RADIUS: 24,
  BUTTON_RADIUS: 26,
  STROKE: 3,
  SHADOW: { dy: 4, alpha: 0.18 },

  /** 字号（§2.4） */
  FONT: { h1: 40, h2: 28, body: 24, entry: 20, badge: 18, coin: 32, cardName: 28 },

  /** 字体族（中文优先系统圆体） */
  FONT_FAMILY: '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif',

  /** 视差系数（§2.5） */
  PARALLAX: { far: 0.10, mid: 0.35, near: 1.00 },
  /** 叶隙光斑数量与透明度区间 */
  SUNSPECKS: { count: 10, alphaMin: 0.06, alphaMax: 0.12, cycleMin: 6000, cycleMax: 10000 }
} as const;

/** 逻辑点位 → 渲染像素（含 12% 远端透视压缩）。 */
export function anchorToPixel(col: number, row: number): { x: number; y: number } {
  const g = LAYOUT.GRID;
  const anchorX = g.originX + (col + 0.5) * g.cellW;
  const depthRow = (g.rows - 1 - row) / (g.rows - 1); // 0 = 最下方（近），1 = 最上方（远）
  const squash = 1 - LAYOUT.PERSPECTIVE * depthRow;
  const anchorY = g.originY + (row + 0.5) * g.cellH * squash + (1 - squash) * 40;
  return { x: anchorX, y: anchorY };
}