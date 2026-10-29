"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 启动入口：平台初始化 → 资源 → 场景栈。
 * 由 game.js 直接 require（ES5 产物）。
 */
var screen_1 = require("./platform/screen");
var input_1 = require("./platform/input");
var loop_1 = require("./platform/loop");
var audio_1 = require("./platform/audio");
var assets_1 = require("./render/assets");
var storage_1 = require("./platform/storage");
var manager_1 = require("./scene/manager");
var boot_1 = require("./scene/boot");
var camp_1 = require("./scene/camp");
var camp2_1 = require("./scene/camp2");
var match_1 = require("./scene/match");
var deck_1 = require("./scene/deck");
var collection_1 = require("./scene/collection");
var settings_1 = require("./scene/settings");
var shop_1 = require("./scene/shop");
/**
 * 视觉自检入口（发布前保持 null）：
 *   null        → 正常流程（Boot → 营地）
 *   'match'     → 直接进对局，走 dev 脚本自动布阵/推进（核对布阵/战斗/集市/结算）
 *   'cycle'     → 每 4 秒换一个界面：卡组 → 图鉴 → 段位 → 商店 → 设置 → 营地
 */
var DEV_ENTRY = 'camp2';
var devStep = 0;
var devStepAt = 0;
var devStarted = false;
var renderedOnce = false;
var renderFailed = false;
var tickFailed = false;
var DEV_CYCLE = [
    { make: function () { return (0, deck_1.createDeckScene)(); } },
    { make: function () { return (0, collection_1.createCollectionScene)(); } },
    { make: function () { return (0, collection_1.createCollectionScene)({ tab: 'rank' }); } },
    { make: function () { return (0, shop_1.createShopScene)(); } },
    { make: function () { return (0, settings_1.createSettingsScene)(); } }
];
function makeCamp() {
    return new camp_1.CampScene({
        onStartMatch: function () { return (0, manager_1.push)((0, match_1.createMatchScene)()); },
        onOpenDeck: function () { return (0, manager_1.push)((0, deck_1.createDeckScene)()); },
        onOpenCollection: function () { return (0, manager_1.push)((0, collection_1.createCollectionScene)()); },
        onOpenShop: function () { return (0, manager_1.push)((0, shop_1.createShopScene)()); },
        onOpenRank: function () { return (0, manager_1.push)((0, collection_1.createCollectionScene)({ tab: 'rank' })); },
        onOpenSettings: function () { return (0, manager_1.push)((0, settings_1.createSettingsScene)()); }
    });
}
function makeCamp2() {
    return new camp2_1.Camp2Scene({
        onStartMatch: function () { return (0, manager_1.push)((0, match_1.createMatchScene)()); },
        onOpenDeck: function () { return (0, manager_1.push)((0, deck_1.createDeckScene)()); },
        onOpenCollection: function () { return (0, manager_1.push)((0, collection_1.createCollectionScene)()); },
        onOpenShop: function () { return (0, manager_1.push)((0, shop_1.createShopScene)()); },
        onOpenRank: function () { return (0, manager_1.push)((0, collection_1.createCollectionScene)({ tab: 'rank' })); },
        onOpenSettings: function () { return (0, manager_1.push)((0, settings_1.createSettingsScene)()); }
    });
}
function devCycleStep(t) {
    if (devStarted && t - devStepAt < 5000)
        return;
    devStarted = true;
    devStepAt = t;
    if (devStep >= DEV_CYCLE.length) {
        devStep = 0;
        (0, manager_1.swapNow)(makeCamp());
        return;
    }
    (0, manager_1.swapNow)(DEV_CYCLE[devStep].make());
    devStep++;
}
function boot() {
    console.log('[petbrawl] boot start dev=' + DEV_ENTRY);
    var _a = (0, screen_1.initViewport)(), canvas = _a.canvas, ctx = _a.ctx;
    console.log('[petbrawl] viewport ctx=' + (!!ctx) + ' canvas=' + (!!canvas));
    if (!ctx) {
        // 无宿主（自检环境）：直接返回，由 headless 脚本走 core
        return;
    }
    (0, audio_1.initAudio)();
    (0, audio_1.syncBgm)();
    (0, input_1.bindInput)();
    (0, assets_1.loadAssets)();
    // 视觉自检：让面板页带上真实存档数据（DEV_ENTRY=null 时不会执行）
    if (DEV_ENTRY)
        (0, storage_1.devSeedSave)();
    // 手势统一分发到当前场景
    (0, input_1.onGesture)(manager_1.gestureScene);
    // 启动画面
    if (DEV_ENTRY === 'camp2') {
        (0, manager_1.resetStack)(makeCamp2());
    }
    else if (DEV_ENTRY === 'match') {
        (0, manager_1.resetStack)((0, match_1.createMatchScene)({ seed: 20261005, difficulty: 'veteran', dev: true }));
    }
    else if (DEV_ENTRY === 'cycle') {
        (0, manager_1.resetStack)(makeCamp());
    }
    else {
        (0, manager_1.resetStack)(new boot_1.BootScene({
            progress: assets_1.assetProgress,
            next: function () { return makeCamp(); }
        }));
    }
    (0, loop_1.resetLogicTime)();
    console.log('[petbrawl] scene stack ready');
    (0, loop_1.startLoop)({
        tick: function (logicTime) {
            (0, input_1.updateInput)((0, input_1.nowMs)());
            if (DEV_ENTRY === 'cycle' && !(0, manager_1.isTransitioning)())
                devCycleStep(logicTime);
            try {
                (0, manager_1.tickScene)(16.6667, logicTime);
            }
            catch (err) {
                if (!tickFailed) {
                    tickFailed = true;
                    console.error('[petbrawl] tick error: ' + (err && err.stack ? err.stack : err));
                }
            }
        },
        render: function (_dt, alpha) {
            if (!renderedOnce) {
                renderedOnce = true;
                console.log('[petbrawl] first frame');
            }
            try {
                (0, screen_1.beginFrame)(ctx);
                (0, manager_1.renderScene)(ctx, (0, input_1.nowMs)(), alpha);
                (0, screen_1.endFrame)(ctx);
            }
            catch (err) {
                if (!renderFailed) {
                    renderFailed = true;
                    console.error('[petbrawl] render error: ' + (err && err.stack ? err.stack : err));
                }
            }
        }
    });
}
boot();
