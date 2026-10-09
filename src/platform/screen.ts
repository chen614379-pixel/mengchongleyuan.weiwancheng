/**
 * 屏幕适配（§1：横屏基准 1280×720）。
 *
 * 自适应全屏策略（不用 letterbox 黑边、也不拉伸中央内容）：
 *   逻辑可视区 = 1280×720 按屏幕宽高比「等比外扩」得到（更宽的屏左右变宽、更窄的屏上下变高），
 *   缩放 scale = cssW / logicalW（等比，永远不变形，也永远不裁切）。
 *   场景代码仍然使用 0..1280 / 0..720 的坐标，画布变换里统一平移 padX / padY 使内容保持居中；
 *   留边区域由「阔图底板」补满：底板宽 1664×720，中央 1280×720 与设计基准逐像素对齐，
 *   左右多出的 192px 是 AI 续画的同一张风景（见 drawPlateCover）。
 *   渲染时底板**永远 1:1 居中**（scale 恒为 1），所以烘焙进底图的招牌/卡位/货币位
 *   与代码里的命中区始终重合；只有屏幕比阔图还宽/还高时，才用镜像边缘条补最外圈。
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
    // 极窄/极宽比例（如 4:3 平板）下阔图也不够铺时，用镜像边缘条补最外圈：
    // 取图内约 1.2% 的窄条翻转铺出去，接缝处像素连续，不会出现硬边或留白。
    const sx = Math.max(1, Math.round(iw * 0.012));
    const sy = Math.max(1, Math.round(ih * 0.012));
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