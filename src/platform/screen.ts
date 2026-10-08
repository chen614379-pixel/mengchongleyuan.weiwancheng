/**
 * 屏幕适配（§1：横屏基准 1280×720）。
 *
 * 自适应全屏策略（不用 letterbox 黑边、也不拉伸中央内容）：
 *   逻辑可视区 = 1280×720 按屏幕宽高比「等比外扩」得到（更宽的屏左右变宽、更窄的屏上下变高），
 *   缩放 scale = cssW / logicalW（等比，永远不变形，也永远不裁切）。
 *   场景代码仍然使用 0..1280 / 0..720 的坐标，画布变换里统一平移 padX / padY 使内容保持居中；
 *   留边区域由「全屏底色 + 底板边缘条拉伸」补满（见 sceneBox / drawPlateCover）。
 *   这样既没有黑边，又不会让烘焙在底板里的元素与命中区错位。
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
  /** 逻辑 → 屏幕的缩放；offsetX/offsetY 为逻辑可视区左上角在屏幕上的位置（CSS 像素） */
  scale: number;
  offsetX: number;
  offsetY: number;
  /** 逻辑可视区尺寸（≥ 1280×720，按屏幕比例外扩） */
  logicalW: number;
  logicalH: number;
  /** 逻辑可视区超出 1280×720 的单侧留边 */
  padX: number;
  padY: number;
}

let viewport: Viewport = {
  canvasW: LAYOUT.SCREEN_W, canvasH: LAYOUT.SCREEN_H,
  cssW: LAYOUT.SCREEN_W, cssH: LAYOUT.SCREEN_H,
  dpr: 1, scale: 1, offsetX: 0, offsetY: 0,
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

  // 等比外扩：屏幕比 16:9 宽就加宽逻辑区，比 16:9 窄就加高逻辑区
  const baseW = LAYOUT.SCREEN_W;
  const baseH = LAYOUT.SCREEN_H;
  const aspect = cssW / cssH;
  const baseAspect = baseW / baseH;
  const logicalW = aspect > baseAspect ? baseH * aspect : baseW;
  const logicalH = aspect > baseAspect ? baseH : baseW / aspect;
  const scale = cssW / logicalW;
  const padX = (logicalW - baseW) / 2;
  const padY = (logicalH - baseH) / 2;

  if (cv) {
    cv.width = Math.floor(cssW * dpr);
    cv.height = Math.floor(cssH * dpr);
  }
  viewport = {
    canvasW: Math.floor(cssW * dpr), canvasH: Math.floor(cssH * dpr),
    cssW, cssH, dpr, scale,
    // offsetX/offsetY = 逻辑可视区左上角在屏幕（CSS 像素）里的位置，也是画布变换的平移量
    offsetX: padX * scale, offsetY: padY * scale,
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
  const v = viewport;
  if (v.padX <= 0 && v.padY <= 0) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  const iw = img.width || w;
  const ih = img.height || h;
  // 边缘条尽量取窄（约 1.2%）：既能保证接缝连续，又不会把边缘处的木牌/齿轮等烘焙物件拉成怪影
  const sx = Math.max(1, Math.round(iw * 0.012));
  const sy = Math.max(1, Math.round(ih * 0.012));
  // 关键：每一条留边都用「镜像边缘条」补，并且让边缘条的第一列正好落在画面接缝上，
  // 这样接缝处的像素是连续的（不会出现一条硬边），只是往外略微拉伸。
  const ph = h + v.padY * 2;
  if (v.padY > 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1);
    ctx.drawImage(img, 0, 0, iw, sy, 0, 0, w, v.padY);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y + h);
    ctx.scale(1, -1);
    ctx.drawImage(img, 0, ih - sy, iw, sy, 0, -v.padY, w, v.padY);
    ctx.restore();
  }
  if (v.padX > 0) {
    ctx.save();
    ctx.translate(x, y - v.padY);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, sx, ih, 0, 0, v.padX, ph);
    ctx.restore();
    ctx.save();
    ctx.translate(x + w, y - v.padY);
    ctx.scale(-1, 1);
    ctx.drawImage(img, iw - sx, 0, sx, ih, -v.padX, 0, v.padX, ph);
    ctx.restore();
  }
  ctx.drawImage(img, x, y, w, h);
}

/** 每帧开头：铺满整屏底色，再把坐标系变换到逻辑可视区（0..1280 保持在屏幕中央）。 */
export function beginFrame(ctx: any): void {
  const v = viewport;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PALETTE.forestDeep;
  ctx.fillRect(0, 0, v.canvasW, v.canvasH);
  closePathSafely(ctx);
  const s = v.scale * v.dpr;
  ctx.setTransform(s, 0, 0, s, v.offsetX * v.dpr, v.offsetY * v.dpr);
}

export function endFrame(ctx: any): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** 屏幕（CSS 像素）坐标 → 逻辑坐标。 */
export function toLogical(cssX: number, cssY: number): { x: number; y: number } {
  const v = viewport;
  return { x: (cssX - v.offsetX) / v.scale, y: (cssY - v.offsetY) / v.scale };
}

/** 逻辑坐标 → 屏幕坐标（用于原生弹窗定位，暂少用）。 */
export function toScreen(logicX: number, logicY: number): { x: number; y: number } {
  const v = viewport;
  return { x: logicX * v.scale + v.offsetX, y: logicY * v.scale + v.offsetY };
}

function closePathSafely(ctx: any): void {
  if (ctx.beginPath) ctx.beginPath();
}

export const LOGICAL_W = LAYOUT.SCREEN_W;
export const LOGICAL_H = LAYOUT.SCREEN_H;