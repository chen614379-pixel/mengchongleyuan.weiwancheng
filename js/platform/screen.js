"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOGICAL_H = exports.LOGICAL_W = void 0;
exports.initViewport = initViewport;
exports.refreshViewport = refreshViewport;
exports.getViewport = getViewport;
exports.sceneBox = sceneBox;
exports.sceneCorners = sceneCorners;
exports.drawPlateCover = drawPlateCover;
exports.beginFrame = beginFrame;
exports.endFrame = endFrame;
exports.toLogical = toLogical;
exports.toScreen = toScreen;
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
var wx_shim_1 = require("./wx-shim");
var layout_1 = require("../config/layout");
var palette_1 = require("../config/palette");
var viewport = {
    canvasW: layout_1.LAYOUT.SCREEN_W, canvasH: layout_1.LAYOUT.SCREEN_H,
    cssW: layout_1.LAYOUT.SCREEN_W, cssH: layout_1.LAYOUT.SCREEN_H,
    dpr: 1, scale: 1, offsetX: 0, offsetY: 0,
    logicalW: layout_1.LAYOUT.SCREEN_W, logicalH: layout_1.LAYOUT.SCREEN_H, padX: 0, padY: 0
};
var lastCanvas = null;
/** 依据当前屏幕尺寸重算适配（首帧与每次尺寸/方向变化时调用）。 */
function applyViewport(cv) {
    var cssW = layout_1.LAYOUT.SCREEN_W;
    var cssH = layout_1.LAYOUT.SCREEN_H;
    var dpr = 1;
    if (wx_shim_1.HAS_WX) {
        var info = wx_shim_1.WX.getSystemInfoSync();
        cssW = info.windowWidth || info.screenWidth || layout_1.LAYOUT.SCREEN_W;
        cssH = info.windowHeight || info.screenHeight || layout_1.LAYOUT.SCREEN_H;
        dpr = info.pixelRatio || 1;
        // 低端机（§performance：像素数 < 500k）降 dpr，保 60fps
        var pixels = cssW * cssH;
        if (pixels < 500000 && dpr > 1.5)
            dpr = 1.5;
        else if (pixels < 2000000 && dpr > 2)
            dpr = 2;
    }
    if (cssW <= 0 || cssH <= 0) {
        cssW = layout_1.LAYOUT.SCREEN_W;
        cssH = layout_1.LAYOUT.SCREEN_H;
    }
    // 等比外扩：屏幕比 16:9 宽就加宽逻辑区，比 16:9 窄就加高逻辑区
    var baseW = layout_1.LAYOUT.SCREEN_W;
    var baseH = layout_1.LAYOUT.SCREEN_H;
    var aspect = cssW / cssH;
    var baseAspect = baseW / baseH;
    var logicalW = aspect > baseAspect ? baseH * aspect : baseW;
    var logicalH = aspect > baseAspect ? baseH : baseW / aspect;
    var scale = cssW / logicalW;
    var padX = (logicalW - baseW) / 2;
    var padY = (logicalH - baseH) / 2;
    if (cv) {
        cv.width = Math.floor(cssW * dpr);
        cv.height = Math.floor(cssH * dpr);
    }
    viewport = {
        canvasW: Math.floor(cssW * dpr), canvasH: Math.floor(cssH * dpr),
        cssW: cssW,
        cssH: cssH,
        dpr: dpr,
        scale: scale,
        // offsetX/offsetY = 逻辑可视区左上角在屏幕（CSS 像素）里的位置，也是画布变换的平移量
        offsetX: padX * scale, offsetY: padY * scale,
        logicalW: logicalW,
        logicalH: logicalH,
        padX: padX,
        padY: padY
    };
    return viewport;
}
/** 初始化：优先横屏，创建画布并按 dpr 设置后备缓冲。 */
function initViewport(canvas) {
    if (wx_shim_1.HAS_WX && wx_shim_1.WX.setPreferredOrientation) {
        try {
            wx_shim_1.WX.setPreferredOrientation('landscape');
        }
        catch (e) { /* 开发者工具可能不支持 */ }
    }
    var cv = canvas || (wx_shim_1.HAS_WX ? wx_shim_1.WX.createCanvas() : null);
    lastCanvas = cv;
    applyViewport(cv);
    bindResize();
    var ctx = cv ? cv.getContext('2d') : null;
    return { canvas: cv, ctx: ctx, view: viewport };
}
/** 尺寸/方向变化时重新适配（真机横竖屏切换、折叠屏、分屏都要跟手）。 */
function refreshViewport() {
    return applyViewport(lastCanvas);
}
var resizeBound = false;
function bindResize() {
    if (resizeBound)
        return;
    resizeBound = true;
    if (wx_shim_1.HAS_WX && wx_shim_1.WX.onWindowResize) {
        var bind = wx_shim_1.WX.onWindowResize;
        try {
            bind(function () { refreshViewport(); });
        }
        catch (e) { /* 忽略 */ }
    }
}
function getViewport() {
    return viewport;
}
/** 逻辑可视区矩形（含外扩留边）：全屏底色 / 遮罩 / 渐变必须覆盖它。 */
function sceneBox() {
    var v = viewport;
    return { x: -v.padX, y: -v.padY, w: v.logicalW, h: v.logicalH };
}
/** 逻辑可视区的四角（给水彩多边形用）。 */
function sceneCorners() {
    var b = sceneBox();
    return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
}
/**
 * 全屏底板：中央 (x,y,w,h) 保持 1:1 原样绘制，只在留边处拉伸「边缘条」把画面补满。
 * 用边缘条而不是整体放大，是为了不让底板里烘焙的元素（木牌、卡槽、按钮）与命中区错位。
 */
function drawPlateCover(ctx, img, x, y, w, h) {
    if (!img)
        return;
    var box = sceneBox();
    var iw = img.width || w;
    var ih = img.height || h;
    // 1:1 居中：底板中央的 1280×720 与设计基准严格对齐（宽屏时多出来的正是 AI 阔图）
    var dx = x + w / 2 - iw / 2;
    var dy = y + h / 2 - ih / 2;
    var top = dy - box.y;
    var bottom = box.y + box.h - (dy + ih);
    var left = dx - box.x;
    var right = box.x + box.w - (dx + iw);
    if (top > 0 || bottom > 0 || left > 0 || right > 0) {
        // 极窄/极宽比例（如 4:3 平板）下阔图也不够铺时，用镜像边缘条补最外圈：
        // 取图内约 1.2% 的窄条翻转铺出去，接缝处像素连续，不会出现硬边或留白。
        var sx = Math.max(1, Math.round(iw * 0.012));
        var sy = Math.max(1, Math.round(ih * 0.012));
        var fullH = box.h;
        var fullW = box.w;
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
function beginFrame(ctx) {
    var v = viewport;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette_1.PALETTE.forestDeep;
    ctx.fillRect(0, 0, v.canvasW, v.canvasH);
    closePathSafely(ctx);
    var s = v.scale * v.dpr;
    ctx.setTransform(s, 0, 0, s, v.offsetX * v.dpr, v.offsetY * v.dpr);
}
function endFrame(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}
/** 屏幕（CSS 像素）坐标 → 逻辑坐标。 */
function toLogical(cssX, cssY) {
    var v = viewport;
    return { x: (cssX - v.offsetX) / v.scale, y: (cssY - v.offsetY) / v.scale };
}
/** 逻辑坐标 → 屏幕坐标（用于原生弹窗定位，暂少用）。 */
function toScreen(logicX, logicY) {
    var v = viewport;
    return { x: logicX * v.scale + v.offsetX, y: logicY * v.scale + v.offsetY };
}
function closePathSafely(ctx) {
    if (ctx.beginPath)
        ctx.beginPath();
}
exports.LOGICAL_W = layout_1.LAYOUT.SCREEN_W;
exports.LOGICAL_H = layout_1.LAYOUT.SCREEN_H;
