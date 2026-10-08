/**
 * 启动入口：平台初始化 → 资源 → 场景栈。
 * 由 game.js 直接 require（ES5 产物）。
 */
import { initViewport, beginFrame, endFrame } from './platform/screen';
import { bindInput, updateInput, onGesture, nowMs } from './platform/input';
import { startLoop, resetLogicTime } from './platform/loop';
import { initAudio, syncBgm } from './platform/audio';
import { loadAssets, assetProgress } from './render/assets';
import { devSeedSave } from './platform/storage';
import { resetStack, tickScene, renderScene, gestureScene, push, swapNow, isTransitioning, Scene } from './scene/manager';
import { BootScene } from './scene/boot';
import { CampScene } from './scene/camp';
import { createMatchScene } from './scene/match';
import { createDeckScene } from './scene/deck';
import { createCollectionScene } from './scene/collection';
import { createSettingsScene } from './scene/settings';
import { createShopScene } from './scene/shop';

/**
 * 视觉自检入口（发布前保持 null）：
 *   null        → 正常流程（Boot → 营地）
 *   'match'     → 直接进对局，走 dev 脚本自动布阵/推进（核对布阵/战斗/集市/结算）
 *   'cycle'     → 每 4 秒换一个界面：卡组 → 图鉴 → 段位 → 商店 → 设置 → 营地
 */
const DEV_ENTRY: string | null = null;

let devStep = 0;
let devStepAt = 0;
let devStarted = false;
let renderedOnce = false;
let renderFailed = false;
let tickFailed = false;
let probedOnce = false;
const DEV_CYCLE: { make: () => Scene }[] = [
  { make: () => createDeckScene() },
  { make: () => createCollectionScene() },
  { make: () => createCollectionScene({ tab: 'rank' }) },
  { make: () => createShopScene() },
  { make: () => createSettingsScene() }
];

function makeCamp(): CampScene {
  return new CampScene({
    onStartMatch: () => push(createMatchScene()),
    onOpenDeck: () => push(createDeckScene()),
    onOpenCollection: () => push(createCollectionScene()),
    onOpenShop: () => push(createShopScene()),
    onOpenRank: () => push(createCollectionScene({ tab: 'rank' })),
    onOpenSettings: () => push(createSettingsScene())
  });
}

function devCycleStep(t: number): void {
  if (devStarted && t - devStepAt < 5000) return;
  devStarted = true;
  devStepAt = t;
  if (devStep >= DEV_CYCLE.length) {
    devStep = 0;
    swapNow(makeCamp());
    return;
  }
  swapNow(DEV_CYCLE[devStep].make());
  devStep++;
}

function boot(): void {
  console.log('[petbrawl] boot start dev=' + DEV_ENTRY);
  const { canvas, ctx } = initViewport();
  console.log('[petbrawl] viewport ctx=' + (!!ctx) + ' canvas=' + (!!canvas));
  if (!ctx) {
    // 无宿主（自检环境）：直接返回，由 headless 脚本走 core
    return;
  }
  initAudio();
  syncBgm();
  bindInput();
  loadAssets();

  // 视觉自检：让面板页带上真实存档数据（DEV_ENTRY=null 时不会执行）
  if (DEV_ENTRY) devSeedSave();

  // 手势统一分发到当前场景
  onGesture(gestureScene);

  // 启动画面
  if (DEV_ENTRY === 'match') {
    resetStack(createMatchScene({ seed: 20261005, difficulty: 'veteran', dev: true }));
  } else if (DEV_ENTRY === 'cycle') {
    resetStack(makeCamp());
  } else {
    resetStack(new BootScene({
      progress: assetProgress,
      next: () => makeCamp()
    }));
  }

  resetLogicTime();
  console.log('[petbrawl] scene stack ready');
  startLoop({
    tick(logicTime: number): void {
      updateInput(nowMs());
      if (DEV_ENTRY === 'cycle' && !isTransitioning()) devCycleStep(logicTime);
      try {
        tickScene(16.6667, logicTime);
      } catch (err) {
        if (!tickFailed) {
          tickFailed = true;
          console.error('[petbrawl] tick error: ' + (err && (err as Error).stack ? (err as Error).stack : err));
        }
      }
    },
    render(_dt: number, alpha: number): void {
      if (!renderedOnce) {
        renderedOnce = true;
        console.log('[petbrawl] first frame');
      }
      try {
        beginFrame(ctx);
        renderScene(ctx, nowMs(), alpha);
        endFrame(ctx);
        if (!probedOnce) {
          probedOnce = true;
          try {
            const d = ctx.getImageData(Math.floor(ctx.canvas.width / 2), Math.floor(ctx.canvas.height / 2), 1, 1).data;
            const d2 = ctx.getImageData(40, 40, 1, 1).data;
            console.log('[petbrawl] probe center=' + d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3] +
              ' corner=' + d2[0] + ',' + d2[1] + ',' + d2[2] + ',' + d2[3] +
              ' canvas=' + ctx.canvas.width + 'x' + ctx.canvas.height);
          } catch (e2) {
            console.log('[petbrawl] probe failed: ' + e2);
          }
        }
      } catch (err) {
        if (!renderFailed) {
          renderFailed = true;
          console.error('[petbrawl] render error: ' + (err && (err as Error).stack ? (err as Error).stack : err));
        }
      }
    }
  });
}

boot();