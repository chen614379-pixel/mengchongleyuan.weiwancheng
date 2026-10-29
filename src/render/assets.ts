/**
 * 资源加载与离屏缓存（§16：首包 ≤4MB，冷启动 ≤3s）。
 *
 * 硬规则：
 * - core / render 不得 import `platform/wx-shim`（只有 platform 目录可以触碰 wx），
 *   所以本文件自己声明 wx 并用 `typeof wx !== 'undefined'` 守卫。
 * - 任何图片缺失/加载失败都必须让调用方拿到 `undefined`，由调用方回落到程序化手绘，
 *   渲染层绝不因为缺图而画不出来（这也是美术风格统一的第一道保险）。
 */
import { LAYOUT } from '../config/layout';

declare const wx: any;

export interface AssetEntry {
  name: string;
  path: string;
  w: number;
  h: number;
  kind: 'bg' | 'ui' | 'unit' | 'card';
}

const CARD_NAMES = ['tiger', 'lion', 'leopard', 'elephant', 'wolf', 'dog', 'cat', 'mouse'];

function cards(): AssetEntry[] {
  const out: AssetEntry[] = [];
  for (let i = 0; i < CARD_NAMES.length; i++) {
    const n = CARD_NAMES[i];
    out.push({ name: 'card-' + n, path: 'assets/cards/card-' + n + '.jpg', w: 168, h: 232, kind: 'card' });
  }
  // 天气牌美术：从用户集市目标图里裁出的烘死天气卡美术区（190×173），
  // 「阴 · 薄雾」共用晴的美术 + 渲染层雾色叠层（见 src/render/card.ts drawWeatherCardFace）。
  out.push({ name: 'weather-sunny', path: 'assets/cards/weather-sunny.jpg', w: 190, h: 173, kind: 'card' });
  out.push({ name: 'weather-rainy', path: 'assets/cards/weather-rainy.jpg', w: 190, h: 173, kind: 'card' });
  return out;
}

function units(): AssetEntry[] {
  const out: AssetEntry[] = [];
  for (let i = 0; i < CARD_NAMES.length; i++) {
    const n = CARD_NAMES[i];
    out.push({ name: 'unit-' + n, path: 'assets/pets/' + n + '.png', w: 256, h: 256, kind: 'unit' });
  }
  return out;
}

const SCENES: AssetEntry[] = [
  // 阔图底板（1664×720）：中央 1280×720 与旧底板逐像素一致，所以命中区、
  // 烘焙招牌、集市卡位都不用改；左右各 192px 是 AI 续画的森林，供宽屏铺满
  // （见 platform/screen.ts drawPlateCover 的 cover 铺法）。
  { name: 'bg-camp', path: 'assets/bg/bg-camp-wide.jpg', w: 1664, h: 720, kind: 'bg' },
  // 战斗底板（用户 2026-10-06 给的新「干净 UI 图」）：中央 1280×720 烘焙了左栏 4 槽 /
  // 右栏 3 槽 / 齿轮 / 卷轴标题 / 紫恶魔 / 狗屋 / 底部 8 个苔藓垫，左右各 192px 1:1 镜像森林。
  // 动态层按这些烘焙件的量测坐标贴上去（见 scene/match-layout.ts PLATE_HUD）。
  { name: 'bg-board-plain', path: 'assets/bg/bg-board-wide.jpg', w: 1664, h: 720, kind: 'bg' },
  { name: 'ui-market', path: 'assets/bg/ui-market-wide.jpg', w: 1664, h: 720, kind: 'ui' },
  { name: 'ui-result-victory', path: 'assets/bg/ui-result-victory-wide.jpg', w: 1664, h: 720, kind: 'ui' }
];

/**
 * HUD 贴图（从用户目标图里抠出来的手绘件）：
 * - `coach-boy`：左下角「我」的大男孩立绘（含草帽/油灯，透明底）；
 * - `doghouse`：狗屋（只有屋体与墙上的「HP」字，血量木牌由代码按数值绘制）。
 * 缺图时必须回落到程序化手绘，见 src/render/coach.ts。
 */
const HUD_ART: AssetEntry[] = [
  { name: 'coach-boy', path: 'assets/ui/coach-boy.png', w: 256, h: 512, kind: 'ui' },
  { name: 'doghouse', path: 'assets/ui/doghouse.png', w: 172, h: 113, kind: 'ui' },
];

/** 全部资源表。路径相对小游戏包根目录。 */
export const ASSET_LIST: AssetEntry[] = SCENES.concat(cards(), units(), HUD_ART);

const images: { [name: string]: any } = {};
const failed: { [name: string]: boolean } = {};
const surfaces: { [key: string]: any } = {};

let started = false;
let settled = 0;
let total = 0;
let finished = false;
let progressHook: ((loaded: number, total: number) => void) | null = null;

function hasHost(): boolean {
  return typeof wx !== 'undefined' && !!wx && typeof wx.createImage === 'function';
}

function hostDocument(): any {
  if (typeof document !== 'undefined' && document) return document;
  return null;
}

/** 能否真正加载图片（无宿主/无 DOM 时视为「无需加载」）。 */
function canLoad(): boolean {
  if (hasHost()) return true;
  return !!hostDocument() && typeof Image !== 'undefined';
}

function createImage(): any {
  if (hasHost()) return wx.createImage();
  if (typeof Image !== 'undefined') return new Image();
  return null;
}

function entryOf(name: string): AssetEntry | null {
  for (let i = 0; i < ASSET_LIST.length; i++) if (ASSET_LIST[i].name === name) return ASSET_LIST[i];
  return null;
}

function loadOne(entry: AssetEntry, done: () => void): void {
  const img = createImage();
  if (!img) {
    failed[entry.name] = true;
    done();
    return;
  }
  let settledOnce = false;
  const finish = (ok: boolean): void => {
    if (settledOnce) return;
    settledOnce = true;
    if (ok) {
      images[entry.name] = img;
      delete failed[entry.name];
    } else {
      failed[entry.name] = true;
      delete images[entry.name];
    }
    done();
  };
  img.onload = (): void => finish(true);
  img.onerror = (): void => finish(false);
  try {
    img.src = entry.path;
  } catch (e) {
    finish(false);
  }
}

function bump(): void {
  settled++;
  if (progressHook) progressHook(settled, total);
  if (settled >= total) finished = true;
}

/**
 * 开始加载全部资源。返回 thenable（宿主不支持加载时立即完成）。
 * `main.ts` 不 await 它，而是通过 `assetProgress()` 驱动 BootScene 的水彩进度条。
 */
export function loadAssets(onProgress?: (loaded: number, total: number) => void): any {
  if (onProgress) progressHook = onProgress;
  if (!canLoad()) {
    finished = true;
    total = ASSET_LIST.length;
    settled = total;
    return { then: (res: any): any => (res ? res() : undefined) };
  }
  if (started) {
    return { then: (res: any): any => (res ? res() : undefined) };
  }
  started = true;
  total = ASSET_LIST.length;
  settled = 0;
  for (let i = 0; i < ASSET_LIST.length; i++) {
    loadOne(ASSET_LIST[i], bump);
  }
  return {
    then: (res: any): any => {
      if (res) res();
      return undefined;
    }
  };
}

/** 0~1；无宿主 / 无资源表 / 已加载完成时立即返回 1（BootScene 就靠它收尾）。 */
export function assetProgress(): number {
  if (finished) return 1;
  if (!canLoad()) return 1;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, settled / total));
}

/** 重新加载指定资源（例如热更后替换卡面）。 */
export function reloadAssets(names: string[]): void {
  if (!canLoad()) return;
  for (let i = 0; i < names.length; i++) {
    const e = entryOf(names[i]);
    if (!e) continue;
    delete failed[e.name];
    loadOne(e, (): void => undefined);
  }
}

/** 取图；缺失或失败返回 undefined（调用方必须回落程序化绘制）。 */
export function getImage(name: string): any {
  const img = images[name];
  if (!img) return undefined;
  return img;
}

/** 资源是否已被标记为失败（供 QA 报告缺图清单）。 */
export function assetFailed(name: string): boolean {
  return !!failed[name];
}

/** 缺图清单（供预览自检脚本用）。 */
export function missingAssets(): string[] {
  const out: string[] = [];
  for (let i = 0; i < ASSET_LIST.length; i++) {
    const n = ASSET_LIST[i].name;
    if (!images[n]) out.push(n);
  }
  return out;
}

/**
 * 离屏画布缓存（卡面、HUD、面板这类静态层预先画一次）。
 * 无离屏能力时返回 undefined，调用方直接走实时绘制。
 */
export function getSurface(
  key: string,
  w: number,
  h: number,
  draw: (cv: any, ctx: CanvasRenderingContext2D) => void,
): any {
  const cacheKey = key + '@' + w + 'x' + h;
  const hit = surfaces[cacheKey];
  if (hit) return hit;
  let cv: any = null;
  if (hasHost() && typeof wx.createCanvas === 'function') cv = wx.createCanvas();
  else {
    const doc = hostDocument();
    if (doc && typeof doc.createElement === 'function') cv = doc.createElement('canvas');
  }
  if (!cv || typeof cv.getContext !== 'function') return undefined;
  cv.width = w;
  cv.height = h;
  const c2d = cv.getContext('2d');
  if (!c2d) return undefined;
  draw(cv, c2d);
  surfaces[cacheKey] = cv;
  return cv;
}

export function clearSurfaces(): void {
  for (const k in surfaces) {
    if (surfaces.hasOwnProperty(k)) delete surfaces[k];
  }
}

/** 逻辑分辨率（渲染层统一用这套坐标，letterbox 由 platform/screen 处理）。 */
export const VIEW_W = LAYOUT.SCREEN_W;
export const VIEW_H = LAYOUT.SCREEN_H;