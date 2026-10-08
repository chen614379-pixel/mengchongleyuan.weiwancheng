"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIEW_H = exports.VIEW_W = exports.ASSET_LIST = void 0;
exports.loadAssets = loadAssets;
exports.assetProgress = assetProgress;
exports.reloadAssets = reloadAssets;
exports.getImage = getImage;
exports.assetFailed = assetFailed;
exports.missingAssets = missingAssets;
exports.getSurface = getSurface;
exports.clearSurfaces = clearSurfaces;
/**
 * 资源加载与离屏缓存（§16：首包 ≤4MB，冷启动 ≤3s）。
 *
 * 硬规则：
 * - core / render 不得 import `platform/wx-shim`（只有 platform 目录可以触碰 wx），
 *   所以本文件自己声明 wx 并用 `typeof wx !== 'undefined'` 守卫。
 * - 任何图片缺失/加载失败都必须让调用方拿到 `undefined`，由调用方回落到程序化手绘，
 *   渲染层绝不因为缺图而画不出来（这也是美术风格统一的第一道保险）。
 */
var layout_1 = require("../config/layout");
var CARD_NAMES = ['tiger', 'lion', 'leopard', 'elephant', 'wolf', 'dog', 'cat', 'mouse'];
function cards() {
    var out = [];
    for (var i = 0; i < CARD_NAMES.length; i++) {
        var n = CARD_NAMES[i];
        out.push({ name: 'card-' + n, path: 'assets/cards/card-' + n + '.jpg', w: 168, h: 232, kind: 'card' });
    }
    // 天气牌美术：从用户集市目标图里裁出的烘死天气卡美术区（190×173），
    // 「阴 · 薄雾」共用晴的美术 + 渲染层雾色叠层（见 src/render/card.ts drawWeatherCardFace）。
    out.push({ name: 'weather-sunny', path: 'assets/cards/weather-sunny.jpg', w: 190, h: 173, kind: 'card' });
    out.push({ name: 'weather-rainy', path: 'assets/cards/weather-rainy.jpg', w: 190, h: 173, kind: 'card' });
    return out;
}
function units() {
    var out = [];
    for (var i = 0; i < CARD_NAMES.length; i++) {
        var n = CARD_NAMES[i];
        out.push({ name: 'unit-' + n, path: 'assets/pets/' + n + '.png', w: 320, h: 320, kind: 'unit' });
    }
    return out;
}
var SCENES = [
    { name: 'bg-camp', path: 'assets/bg/bg-camp.jpg', w: 1280, h: 720, kind: 'bg' },
    { name: 'bg-board-plain', path: 'assets/bg/bg-board-plain.jpg', w: 1280, h: 720, kind: 'bg' },
    { name: 'ui-market', path: 'assets/bg/ui-market.jpg', w: 1280, h: 720, kind: 'ui' },
    { name: 'ui-deploy-fog', path: 'assets/bg/ui-deploy-fog.jpg', w: 1280, h: 720, kind: 'ui' },
    { name: 'ui-result-victory', path: 'assets/bg/ui-result-victory.jpg', w: 1280, h: 720, kind: 'ui' }
];
/** 全部资源表。路径相对小游戏包根目录。 */
exports.ASSET_LIST = SCENES.concat(cards(), units());
var images = {};
var failed = {};
var surfaces = {};
var started = false;
var settled = 0;
var total = 0;
var finished = false;
var progressHook = null;
function hasHost() {
    return typeof wx !== 'undefined' && !!wx && typeof wx.createImage === 'function';
}
function hostDocument() {
    if (typeof document !== 'undefined' && document)
        return document;
    return null;
}
/** 能否真正加载图片（无宿主/无 DOM 时视为「无需加载」）。 */
function canLoad() {
    if (hasHost())
        return true;
    return !!hostDocument() && typeof Image !== 'undefined';
}
function createImage() {
    if (hasHost())
        return wx.createImage();
    if (typeof Image !== 'undefined')
        return new Image();
    return null;
}
function entryOf(name) {
    for (var i = 0; i < exports.ASSET_LIST.length; i++)
        if (exports.ASSET_LIST[i].name === name)
            return exports.ASSET_LIST[i];
    return null;
}
function loadOne(entry, done) {
    var img = createImage();
    if (!img) {
        failed[entry.name] = true;
        done();
        return;
    }
    var settledOnce = false;
    var finish = function (ok) {
        if (settledOnce)
            return;
        settledOnce = true;
        if (ok) {
            images[entry.name] = img;
            delete failed[entry.name];
        }
        else {
            failed[entry.name] = true;
            delete images[entry.name];
        }
        done();
    };
    img.onload = function () { return finish(true); };
    img.onerror = function () { return finish(false); };
    try {
        img.src = entry.path;
    }
    catch (e) {
        finish(false);
    }
}
function bump() {
    settled++;
    if (progressHook)
        progressHook(settled, total);
    if (settled >= total)
        finished = true;
}
/**
 * 开始加载全部资源。返回 thenable（宿主不支持加载时立即完成）。
 * `main.ts` 不 await 它，而是通过 `assetProgress()` 驱动 BootScene 的水彩进度条。
 */
function loadAssets(onProgress) {
    if (onProgress)
        progressHook = onProgress;
    if (!canLoad()) {
        finished = true;
        total = exports.ASSET_LIST.length;
        settled = total;
        return { then: function (res) { return (res ? res() : undefined); } };
    }
    if (started) {
        return { then: function (res) { return (res ? res() : undefined); } };
    }
    started = true;
    total = exports.ASSET_LIST.length;
    settled = 0;
    for (var i = 0; i < exports.ASSET_LIST.length; i++) {
        loadOne(exports.ASSET_LIST[i], bump);
    }
    return {
        then: function (res) {
            if (res)
                res();
            return undefined;
        }
    };
}
/** 0~1；无宿主 / 无资源表 / 已加载完成时立即返回 1（BootScene 就靠它收尾）。 */
function assetProgress() {
    if (finished)
        return 1;
    if (!canLoad())
        return 1;
    if (total <= 0)
        return 1;
    return Math.max(0, Math.min(1, settled / total));
}
/** 重新加载指定资源（例如热更后替换卡面）。 */
function reloadAssets(names) {
    if (!canLoad())
        return;
    for (var i = 0; i < names.length; i++) {
        var e = entryOf(names[i]);
        if (!e)
            continue;
        delete failed[e.name];
        loadOne(e, function () { return undefined; });
    }
}
/** 取图；缺失或失败返回 undefined（调用方必须回落程序化绘制）。 */
function getImage(name) {
    var img = images[name];
    if (!img)
        return undefined;
    return img;
}
/** 资源是否已被标记为失败（供 QA 报告缺图清单）。 */
function assetFailed(name) {
    return !!failed[name];
}
/** 缺图清单（供预览自检脚本用）。 */
function missingAssets() {
    var out = [];
    for (var i = 0; i < exports.ASSET_LIST.length; i++) {
        var n = exports.ASSET_LIST[i].name;
        if (!images[n])
            out.push(n);
    }
    return out;
}
/**
 * 离屏画布缓存（卡面、HUD、面板这类静态层预先画一次）。
 * 无离屏能力时返回 undefined，调用方直接走实时绘制。
 */
function getSurface(key, w, h, draw) {
    var cacheKey = key + '@' + w + 'x' + h;
    var hit = surfaces[cacheKey];
    if (hit)
        return hit;
    var cv = null;
    if (hasHost() && typeof wx.createCanvas === 'function')
        cv = wx.createCanvas();
    else {
        var doc = hostDocument();
        if (doc && typeof doc.createElement === 'function')
            cv = doc.createElement('canvas');
    }
    if (!cv || typeof cv.getContext !== 'function')
        return undefined;
    cv.width = w;
    cv.height = h;
    var c2d = cv.getContext('2d');
    if (!c2d)
        return undefined;
    draw(cv, c2d);
    surfaces[cacheKey] = cv;
    return cv;
}
function clearSurfaces() {
    for (var k in surfaces) {
        if (surfaces.hasOwnProperty(k))
            delete surfaces[k];
    }
}
/** 逻辑分辨率（渲染层统一用这套坐标，letterbox 由 platform/screen 处理）。 */
exports.VIEW_W = layout_1.LAYOUT.SCREEN_W;
exports.VIEW_H = layout_1.LAYOUT.SCREEN_H;
