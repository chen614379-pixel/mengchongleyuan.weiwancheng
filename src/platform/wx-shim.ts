/**
 * 微信小游戏宿主 API 的最小声明（只声明用到的部分）。
 * 仅本目录可以触碰 wx，core 与 render 不得 import 本文件。
 */
declare const wx: {
  createCanvas(): any;
  getSystemInfoSync(): {
    screenWidth: number;
    screenHeight: number;
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    platform: string;
    system: string;
    safeArea?: { top: number; bottom: number; left: number; right: number };
  };
  setPreferredOrientation?(orientation: 'landscape' | 'portrait'): void;
  onWindowResize?(cb: () => void): void;
  onTouchStart(cb: (res: TouchEventLike) => void): void;
  onTouchMove(cb: (res: TouchEventLike) => void): void;
  onTouchEnd(cb: (res: TouchEventLike) => void): void;
  onTouchCancel(cb: (res: TouchEventLike) => void): void;
  onMouseDown?(cb: (res: MouseEventLike) => void): void;
  onMouseMove?(cb: (res: MouseEventLike) => void): void;
  onMouseUp?(cb: (res: MouseEventLike) => void): void;
  onHide(cb: () => void): void;
  onShow(cb: () => void): void;
  createImage(): any;
  createInnerAudioContext(): any;
  setStorageSync(key: string, data: any): void;
  getStorageSync(key: string): any;
  removeStorageSync(key: string): void;
  getFileSystemManager(): any;
  setKeepScreenOn?(opts: { keepScreenOn: boolean }): void;
  triggerGC?(): void;
  onMemoryWarning?(cb: (res: { level: number }) => void): void;
  showToast?(opts: { title: string; icon?: string; duration?: number }): void;
  shareAppMessage?(opts: { title?: string; imageUrl?: string }): void;
};

export interface TouchEventLike {
  touches: { identifier: number; clientX: number; clientY: number }[];
  changedTouches: { identifier: number; clientX: number; clientY: number }[];
  timeStamp: number;
}

export interface MouseEventLike {
  clientX: number;
  clientY: number;
  timeStamp: number;
}

declare function requestAnimationFrame(cb: (t: number) => void): number;
declare function cancelAnimationFrame(id: number): void;

export const WX: typeof wx = typeof wx !== 'undefined' ? wx : (null as any);
/** 宿主是否为微信小游戏（无头/自检环境下为 false）。 */
export const HAS_WX: boolean = typeof wx !== 'undefined' && !!wx && typeof wx.createCanvas === 'function';