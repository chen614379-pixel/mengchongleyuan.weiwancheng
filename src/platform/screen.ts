/**
 * 屏幕适配（§1：横屏基准 1280×720）。
 *
 * 自适应全屏策略（没有 letterbox 黑边、没有裁切、四周不留白边）：
 *   竖向严格按屏幕高度铺满（scaleY = cssH / 720），横向把设计基准 1280 按屏宽**拉伸**铺满
 *   （scaleX = scaleY × 拉伸系数，拉伸系数 = 屏幕宽高比 / 16:9，上限 MAX_STRETCH）。
 *   这样 1280×720 的设计框正好覆盖整块屏幕：烘焙在底板里的招牌、卡位、按钮、
 *   饲养员、狗屋、替补席苔藓垫都贴着真实屏幕边缘，代码里的动态层按同一坐标系绘制，
 *   与烘焙元素天然重合（padX/padY 在常见比例下恒为 0，`sideOut()` 也就恒为 0）。
 *   横向拉伸在 16:9 上为 1.00、在 19.5:9 手机上约 1.22 —— 手绘水彩画面里几乎看不出，
 *   换来的是「内容主动填满可用宽度」而不是两侧各留一条空背景。
 *   超过上限的极宽屏（>21:9）才把多出来的几像素交给阔图底板自带的 ±192px 续画覆盖，
 *   实在还不够时 drawPlateCover 会用镜像边缘条补最外圈（1:1 取图内窄条，接缝像素连续）。
 *   底板中央 1280×720 与设计基准逐像素对齐，所以烘焙元素永远不会和命中区错位。
 */
import { WX, HAS_WX } from './wx-shim';
import { LAYOUT } from '../config/layout';
import { PALETTE } from '../config/palette';

export interface Viewport {
  /** 物理像素（canvas.width/height） */
  canvasW: number;
  canvasH: number;
  /** 逻辑像素（CSS 像素） */
  cssW: number;
  cssH: number;
  dpr: number;
  /** 逻辑 → 屏幕的竖向缩放；offsetX/offsetY 为逻辑可视区左上角在屏幕上的位置（CSS 像素） */
  scale: number;
  /** 逻辑 → 屏幕的横向缩放（= scale × 横向拉伸系数，见 applyViewport） */
  scaleX: number;
  offsetX: number;
  offsetY: number;
  /** 逻辑可视区尺寸（横向拉伸后恒为 1280×720，被 clamp 时才略大） */
  logicalW: number;
  logicalH: number;
  /** 逻辑可视区超出 1280×720 的单侧留边（常见比例下为 0） */
  padX: number;
  padY: number;
}

/** 横向拉伸上限：超过它的极宽屏才用阔图/镜像补边。 */
const MAX_STRETCH = 1.3;

let viewport: Viewport = {
  canvasW: LAYOUT.SCREEN_W, canvasH: LAYOUT.SCREEN_H,
  cssW: LAYOUT.SCREEN_W, cssH: LAYOUT.SCREEN_H,
  dpr: 1, scale: 1, scaleX: 1, offsetX: 0, offsetY: 0,
  logicalW: LAYOUT.SCREEN_W, logicalH: LAYOUT.SCREEN_H, padX: 0, padY: 0
};

let lastCanvas: any = null;

/** 依据当前屏幕尺寸重算适配（首帧与每次尺寸/方向变化时调用）。 */
function applyViewport(cv: any): Viewport {
  let cssW: number = LAYOUT.SCREEN_W;
  let cssH: number = LAYOUT.SCREEN_H;
  let dpr = 1;
  if (HAS_WX) {
    const info = WX.getSystemInfoSync();
    cssW = info.windowWidth || info.screenWidth || LAYOUT.SCREEN_W;
    cssH = info.windowHeight || info.screenHeight || LAYOUT.SCREEN_H;
    dpr = info.pixelRatio || 1;
    // 低端机（§performance：像素数 < 500k）降 dpr，保 60fps
    const pixels = cssW * cssH;
    if (pixels < 500000 && dpr > 1.5) dpr = 1.5;
    else if (pixels < 2000000 && dpr > 2) dpr = 2;
  }
  if (cssW <= 0 || cssH <= 0) { cssW = LAYOUT.SCREEN_W; cssH = LAYOUT.SCREEN_H; }

  // 铺满屏幕：竖向按高度，横向把设计基准 1280 拉伸到屏宽（上限 MAX_STRETCH）
  const baseW = LAYOUT.SCREEN_W;
  const baseH = LAYOUT.SCREEN_H;
  const aspect = cssW / cssH;
  const need = aspect / (baseW / baseH);
  const stretch = need > MAX_STRETCH ? MAX_STRETCH : need;
  const scaleY = cssH / baseH;
  const scaleX = scaleY * stretch;
  const logicalW = cssW / scaleX;
  const logicalH = cssH / scaleY;
  const padX = Math.max(0, (logicalW - baseW) / 2);
  const padY = Math.max(0, (logicalH - baseH) / 2);

  if (cv) {
    cv.width = Math.floor(cssW * dpr);
    cv.height = Math.floor(cssH * dpr);
  }
  viewport = {
    canvasW: Math.floor(cssW * dpr), canvasH: Math.floor(cssH * dpr),
    cssW, cssH, dpr, scale: scaleY, scaleX,
    // offsetX/offsetY = 逻辑可视区左上角在屏幕（CSS 像素）里的位置，也是画布变换的平移量
    offsetX: padX * scaleX, offsetY: padY * scaleY,
    logicalW, logicalH, padX, padY
  };
  return viewport;
}

/** 初始化：优先横屏，创建画布并按 dpr 设置后备缓冲。 */
export function initViewport(canvas?: any): { canvas: any; ctx: any; view: Viewport } {
  if (HAS_WX && WX.setPreferredOrientation) {
    try { WX.setPreferredOrientation('landscape'); } catch (e) { /* 开发者工具可能不支持 */ }
  }
  const cv = canvas || (HAS_WX ? WX.createCanvas() : null);
  lastCanvas = cv;
  applyViewport(cv);
  bindResize();
  const ctx = cv ? cv.getContext('2d') : null;
  return { canvas: cv, ctx, view: viewport };
}

/** 尺寸/方向变化时重新适配（真机横竖屏切换、折叠屏、分屏都要跟手）。 */
export function refreshViewport(): Viewport {
  return applyViewport(lastCanvas);
}

let resizeBound = false;
function bindResize(): void {
  if (resizeBound) return;
  resizeBound = true;
  if (HAS_WX && WX.onWindowResize) {
    const bind = WX.onWindowResize;
    try { bind(() => { refreshViewport(); }); } catch (e) { /* 忽略 */ }
  }
}

export function getViewport(): Viewport {
  return viewport;
}

/** 逻辑可视区矩形（含外扩留边）：全屏底色 / 遮罩 / 渐变必须覆盖它。 */
export function sceneBox(): { x: number; y: number; w: number; h: number } {
  const v = viewport;
  return { x: -v.padX, y: -v.padY, w: v.logicalW, h: v.logicalH };
}

/** 逻辑可视区的四角（给水彩多边形用）。 */
export function sceneCorners(): { x: number; y: number }[] {
  const b = sceneBox();
  return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
}

/**
 * 全屏底板：中央 (x,y,w,h) 保持 1:1 原样绘制，只在留边处拉伸「边缘条」把画面补满。
 * 用边缘条而不是整体放大，是为了不让底板里烘焙的元素（木牌、卡槽、按钮）与命中区错位。
 */
export function drawPlateCover(ctx: any, img: any, x: number, y: number, w: number, h: number): void {
  if (!img) return;
  const box = sceneBox();
  const iw = img.width || w;
  const ih = img.height || h;
  // 1:1 居中：底板中央的 1280×720 与设计基准严格对齐（宽屏时多出来的正是 AI 阔图）
  const dx = x + w / 2 - iw / 2;
  const dy = y + h / 2 - ih / 2;
  const top = dy - box.y;
  const bottom = box.y + box.h - (dy + ih);
  const left = dx - box.x;
  const right = box.x + box.w - (dx + iw);
  if (top > 0 || bottom > 0 || left > 0 || right > 0) {
    // 只有极宽/极窄比例下阔图也不够铺时才走到这里：取图内与留边**等宽**的窄条 1:1 翻转铺出去，
    // 接缝处像素连续，既不会出现硬边，也不会把画边缘的奶雾色拉成一片发白。
    const sx = Math.max(1, Math.min(iw, Math.round(left > 0 ? left : iw * 0.012)));
    const sy = Math.max(1, Math.min(ih, Math.round(top > 0 ? top : ih * 0.012)));
    const fullH = box.h;
    const fullW = box.w;
    ctx.save();
    if (top > 0) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0, iw, sy, 0, 0, iw, top);
      ctx.restore();
    }
    if (bottom > 0) {
      ctx.save();
      ctx.translate(dx, dy + ih);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, ih - sy, iw, sy, 0, -bottom, iw, bottom);
      ctx.restore();
    }
    if (left > 0) {
      ctx.save();
      ctx.translate(box.x, dy - Math.max(0, top));
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, sx, ih, 0, 0, left, fullH);
      ctx.restore();
    }
    if (right > 0) {
      ctx.save();
      ctx.translate(dx + iw, dy - Math.max(0, top));
      ctx.scale(-1, 1);
      ctx.drawImage(img, iw - sx, 0, sx, ih, -right, 0, right, fullH);
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.drawImage(img, dx, dy, iw, ih);
}

/** 每帧开头：铺满整屏底色，再把坐标系变换到逻辑可视区（0..1280 铺满整块屏幕）。 */
export function beginFrame(ctx: any): void {
  const v = viewport;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PALETTE.forestDeep;
  ctx.fillRect(0, 0, v.canvasW, v.canvasH);
  closePathSafely(ctx);
  ctx.setTransform(
    v.scaleX * v.dpr, 0, 0, v.scale * v.dpr,
    v.offsetX * v.dpr, v.offsetY * v.dpr
  );
}

export function endFrame(ctx: any): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** 屏幕（CSS 像素）坐标 → 逻辑坐标。 */
export function toLogical(cssX: number, cssY: number): { x: number; y: number } {
  const v = viewport;
  return { x: (cssX - v.offsetX) / v.scaleX, y: (cssY - v.offsetY) / v.scale };
}

/** 逻辑坐标 → 屏幕坐标（用于原生弹窗定位，暂少用）。 */
export function toScreen(logicX: number, logicY: number): { x: number; y: number } {
  const v = viewport;
  return { x: logicX * v.scaleX + v.offsetX, y: logicY * v.scale + v.offsetY };
}

function closePathSafely(ctx: any): void {
  if (ctx.beginPath) ctx.beginPath();
}

export const LOGICAL_W = LAYOUT.SCREEN_W;
export const LOGICAL_H = LAYOUT.SCREEN_H;