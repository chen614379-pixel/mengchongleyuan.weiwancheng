# 面板场景实现报告（deck / collection / settings / shop）

范围：本报告只覆盖 `src/scene/deck.ts`、`collection.ts`、`settings.ts`、`shop.ts` 四个文件与本文档。
未改动任何其他文件（尤其 `src/config/*`、`src/core/*`、`src/render/*`、`src/ui/*`、`src/scene/manager.ts`、`camp.ts`、`boot.ts`、`main.ts`）。

## 1. 交付内容

| 文件 | 导出 | 行数 | 说明 |
| --- | --- | --- | --- |
| `src/scene/deck.ts` | `createDeckScene(): Scene` + 通用手绘件 | 1082 | 我的卡组：3×3 卡位、已选 3/5、费用、编辑卡组弹窗；并对外导出 `toHex` / `fillPanel` / `drawPanelLeaf` / `drawPanelTree` / `drawPanelBush` / `drawTitlePlate` / `drawWoodPlate` 等木牌与面板件 |
| `src/scene/collection.ts` | `createCollectionScene(opts?: { tab?: 'pets' \| 'rank' }): Scene` | 549 | 萌宠图鉴（4×2 网格，24 格 = 8 物种 × 3 级）+ 段位（青铜→白银→黄金→钻石、战绩、晋升进度），两枚自绘木牌页签 |
| `src/scene/settings.ts` | `createSettingsScene(): Scene` | 533 | 声音开关、玩法（3 页手绘教程）、存档与数据（重置二次确认）、关于、林间小抄 |
| `src/scene/shop.ts` | `createShopScene(): Scene` | 601 | 三页签商店：动物伙伴 / 饲养员衣橱 / 星辉秘藏，每类 6 件共 18 件 |

## 2. 视觉铁律的落实

- 轮廓：全部走 `src/ui/brush.ts` 的 `strokeInk` / `roundPts`(roundRectPath) / `arcPoints`(strokeArcInk)。**没有** `ctx.strokeRect`，**没有**直接用 `ctx.arc` 画环（圆环一律先用 `arcPoints` 取点再 `strokeInk`）。
- 描边色：全项目唯一 `PALETTE.inkSoft`（#3B3229）；无纯黑。
- 填充：水彩两层填充（`fillPanel` → `fillWatercolor` 的 `layers: 2`），底层主色 + twilight 方向冷色暗部；面板底衬统一木牌（`drawWoodPlate`）与叶片（`drawPanelLeaf`）。
- 圆角：面板 22–28、行板 18、卡片 16–20，均 ≥14；`strokeInk` 自带抖动，不完美。
- 颜色：只取 `src/config/palette.ts` 的 `PALETTE` 或经 `tint`/`rgba` 派生。自检脚本对每一帧的 `fillStyle`/`strokeStyle` 做校验：**非色板颜色 0 条**。
- 无 emoji；全部图标（爪印、星辉、返回箭头、锁、装饰件等）手工画点/多边形。

## 3. 关键设计决策（含理由）

1. **不依赖 `src/render/ui.ts`**：该文件在写作期间始终未产出。为不阻塞交付，`deck.ts` 自建了一套手绘通用件并被另外三个面板复用（`collection/settings/shop` 从 `./deck` 导入）。若后续 `render/ui.ts` 落地，替换点集中在 deck.ts。
2. **自绘 `drawPanelTree` / `drawPanelBush` 替代 `paint.ts` 的同名函数**：因为 `paint.ts` 的树/灌木走了「`tint()` 输出再喂回 `fillWatercolor`」的路径，会产出非法颜色（详见 §5.1）。自绘版把颜色先经 `toHex()` 归一化，保证水彩暗部真实生效。理由写入代码注释。
3. **音乐开关只落盘、不假装播放**：`src/platform/audio.ts` 只有 `initAudio` / `playSfx` / `stopAllSfx` / `shareResult`，没有音乐轨 API。开关写 `save.audio.music`，页面上诚实标注「本作暂无音乐轨」。
4. **「重看教程」不新增存档字段**：3 页速览（集市 5 摊 / 同名同星合成 ×1.8 / 克制闭环 8 环）完全页内自洽，避免为教学页扩存档结构。
5. **重置存档就地复位**：`applyReset()` 逐字段拷贝 `defaultSave()` 后 `saveNow()`，不改 `storage.ts`；二次确认弹窗（取消 / 确认）后才执行。
6. **购买失败绝不扣款**：余额不足时整行抖动（`shakeMs=320`）+ 提示差多少，`wallet` 不会变负；已拥有则拒绝并提示。
7. **图鉴空态优雅降级**：全未解锁时改画篝火 + 飘动 sparkle +「去冒险遇见它们」，而不是空网格。
8. **段位晋升进度为纯展示常量** `TIER_STEP = 100`：不引入新存档语义。

## 4. 自检证据

工具：`D:\Users\CGQ\Documents\deepseek-harness\default-workspace\.panel-smoke\smoke.js`（在交付目录之外，用 Proxy 假 ctx 驱动四个场景，逐帧检查异常/NaN/非色板色/文字越界/同帧文字重叠，并真实执行「买光三页签」「重置存档」后复读 `loadSave()`）。

- `tsc -p tsconfig.json`：本报告四个文件 **0 错误**。
- runtime errors 0；NaN geometry 0；non-palette colors 0；text overflow 0。
- 落盘验证：购买后 `coins 500→348`、`stars 50→25`，`pets[].colors`、`decos`、`trainer.hair/cloth/acc=2` 与 `trainer.colors`、`skills=[rs_imp_skin]` 均写入；重置后 `coins=0 / stars=0 / pets=[] / skills=[] / rank=0 / stats 全 0`。
- 排版：已修掉三处背景文字互相压字（settings 左列「声音/玩法/关于」木牌——原本副标题 y+72 压住了首行内容，现已把木牌加高、内容整体下移到标题带以下）。剩余报告项全部是「弹窗盖住背景文字」的假阳性（弹窗有不透明纸底，背景不可见）。

## 5. 跨代理发现（未改他人文件，供决策）

### 5.1 `tint()` 输出回灌 `fillWatercolor` 会产出非法颜色（真 bug）
- `src/config/palette.ts:48 rgba()` / `:57 tint()` 只接受 6 位 hex。`tint()` 的结果是 `rgb(...)`，再次传入 `tint()` 时 `parseInt(h.substring(0,2),16)` 得到 NaN → 返回 `rgb(NaN,g,b)`。
- 而 `src/ui/brush.ts:168 fillWatercolor()` 内部必定再 tint 两次（`:192 dark = tint(color, 0.30+i*0.06, PALETTE.twilight)`、`:209 wetEdge tint(color, 0.24, PALETTE.inkSoft)`）⇒ 任何 `tint()` 输出喂进 `fillWatercolor` 都会产生非法色；Canvas 对非法 `fillStyle` **静默忽略**并沿用上一个颜色，表现为水彩暗部丢失 + 湿边串色。
- 受影响：`src/render/paint.ts` 的 `drawBroadleafTree(:201)`、`drawPineTree(:235)`、`drawBush(:262)`、`drawLeaf(:117)`；`src/render/forest.ts:106,153` 也这样调用 ⇒ 营地/森林的树同样受影响。`strokeInk` 不 tint，安全。
- 建议修法（任选）：给 `tint()` 入口加 hex 归一化（把 `rgb(...)` 解析回 hex），或让 `fillWatercolor` 在内部先归一化。我在自己文件里用的是 `toHex()`（见 `deck.ts`）。

### 5.2 预览沙箱加载报错（与四个面板无关）
- `run_game` 能起服务（`http://localhost:3847`），但 `get_logs` 只有一条
  `[Game load] SyntaxError: Invalid or unexpected token at new Function (<anonymous>) at sandboxExec (about:srcdoc:18918)`，截图全黑。
- 已排除我方文件：`js/` 下 60 个产物文件 `node --check` 全部通过；无 BOM/UTF-16；`game.json`、`project.config.json` 正常。
- 因此本面板的视觉结论来自静态+数值自检（§4），未取得真像素截图。

## 6. 已知限制与后续可改点

- 卡组编辑弹窗是「只用于装扮与展示，暂仅展示」的说明页（真实出战阵容在战斗内集市阶段现场购买）。
- 商店/图鉴/段位的布局常量都在文件顶部（`ROW_X` / `ROW_Y` / `GRID_X` / `TAB_X` 等），未来增删条目只需改常量与数据数组。
- settings 三块木牌的位置常量：`MUSIC_ROW_Y=196`、`SFX_ROW_Y=260`、`TUTORIAL_BTN.y=436`、`RESET_BTN.y=200`；木牌本体在 `draw*Plate()` 内（声音 104/228、玩法 348/170、关于 534/176、存档 104/232）。改动其一时请同步对应的命中判定（命中判定已直接引用这些常量，无需分别改）。