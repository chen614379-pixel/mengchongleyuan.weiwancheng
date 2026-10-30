# 萌宠乱斗 · 林间乱斗

微信小游戏，横屏 1280×720，Canvas 2D 手写渲染（无 Cocos / Unity / Phaser 等引擎）。

> 状态：**开发中存档**。营地、布阵、对局、商店、图鉴等场景已跑通，数值与玩法仍在调整。

## 运行

1. 打开微信开发者工具 → 「导入项目」→ 选择仓库根目录（含 `game.json` 的那一层）。
2. AppID 已写在 `project.config.json` 里；本地调试可不填，用测试号即可。
3. 入口链路：`game.js` → `js/main`（`boot()` 在模块顶层执行）。

`js/` 是 `src/` 的 TypeScript 编译产物，**已随仓库提交**，所以只想预览时不必安装依赖、不必构建。

## 构建（改了 TypeScript 才需要）

```bash
pnpm install
pnpm run build    # tsc -p tsconfig.json，src/**/*.ts → js/**/*.js
pnpm run watch    # 增量编译
pnpm run check    # 只做类型检查，不产出
```

约定：`src/**` 与 `js/**` 一一对应，两边一起提交，避免源码和产物打架。

## 目录

| 路径 | 说明 |
| --- | --- |
| `game.js` / `game.json` | 小游戏入口与运行时配置 |
| `src/` | TypeScript 源码（`config` 数值、`core` 战斗逻辑、`render` 渲染、`scene` 场景、`platform` 平台适配） |
| `js/` | 上述源码的编译产物，运行时真正执行的代码 |
| `assets/` | 运行时资源：`pets` 宠物贴图、`cards` 卡面、`bg` 背景、`ui` 界面件、`bgm` / `sfx` 音频 |
| `art-src/` | 原始宽图（未压缩的底稿，供重新切图用） |
| `design/` | 设计稿、原型与验证截图 |
| `docs/` | 战斗核心、渲染、面板、屏幕适配等实现记录 |
| `tools/` | 本地脚本（无头冒烟测试、布局检查） |
| `project.config.json` | 开发者工具项目配置（含包体忽略规则） |

## 说明

- `src/main.ts` 里的 `DEV_ENTRY` 是视觉自检开关（可直接进入某个场景），**发布前置回 `null`**。
- `work/`、`node_modules/`、`.weixin-minigame-helper/` 不入库，见 `.gitignore`。
- 本仓库用于存档：源码、资源、设计稿和历史提交一并保留。