# 渲染层交付报告（src/render/*）

> 交付人：渲染层 Agent ｜ 消费方：`src/scene/match.ts`（父代理）、`src/scene/camp.ts`、`src/scene/boot.ts`
> 状态：**13/13 模块完成**，`tsc` 在本层 **0 错误**，静态自检 **PASS**

## 1. 交付物

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `src/render/paint.ts` | 20.2KB | 共享画笔库：纸底、木纹、叶/藤/树/灌木/蕨/蘑菇/卵石/草簇/花/三叶草/涟漪/萤火虫/光斑/雾带/云/星辉/地面影/木牌/石头/苔藓光、`alphaOf`/`boundsOf` |
| `src/render/assets.ts` | 6.5KB | 资源表 + 加载/进度/离屏缓存；缺图回落程序化手绘 |
| `src/render/forest.ts` | 14.4KB | 天空、三层视差（far/mid/near）、阳光光斑、暗角、7 种天气、`weatherShort`（emoji 替代） |
| `src/render/board.ts` | 13.3KB | 水彩草甸空地（无格子）、蜿蜒小溪、敌半场雾、苔藓光斑、草叶涟漪、落点箭头、小屋 HP |
| `src/render/unit.ts` | 32.9KB | 8 个物种的手绘立绘（程序化矢量），idle/attack/hurt 姿态、受击白闪、死亡萤火、Lv2 藤蔓护腕/Lv3 花冠、拖拽态 |
| `src/render/hpring.ts` | 13.7KB | **环形血量**（含 ghost 弧、护盾环、危险呼吸、指挥目标脉冲）+ 状态图标 + HP 数字 |
| `src/render/card.ts` | 22.6KB | 三种卡面（animal/weather/buff）：费用太阳圆牌、品质花纹、克制环、加成图标、卡背 |
| `src/render/sidebar.ts` | 17.2KB | 侧栏条目（**环形血量，无矩形血条**）、上回合情报态、替补席木架、卷轴按钮、饲养员头像、倒计时藤蔓、战绩卷轴 |
| `src/render/coach.ts` | 6.8KB | 饲养员：草帽/围裙/铲子，idle/proud/hurt 表情与动作 |
| `src/render/imp.ts` | 6.1KB | 小恶魔：紫身、蝙蝠翅、金铃项圈、带尖尾，idle/laugh/hurt |
| `src/render/result.ts` | 19.3KB | 结果卷轴横幅、复盘卡（伤害构成/MVP/高光三页）、伤害堆叠条（唯一允许的条）、阳光账本、奖励行、翻页叶片 |
| `src/render/ui.ts` | 17.0KB | 木/纸面板、手绘按钮、齿轮、阳光币、返回、页签、标题牌、提示气泡、图标按钮、叶片进度条、Toast |
| `src/render/index.ts` | 2.1KB | 显式 re-export 出口（不用 `export *`，避免同名歧义） |
| `tools/render-preview.js` | 8.9KB | 静态自检脚本（见 §3） |

入口函数全部按 **m00372 冻结的签名** 实现，`src/scene/{match,camp,boot}.ts` 的现有调用**无需改动**。

## 2. 规格硬指标对照（§15 / §16 / 附录 D）

- **棋盘上看不到任何格子**：`board.ts` 只有 `clearingPath` 生成的有机边界 + 苔藓/草叶，全文件无 `fillRect`、无网格绘制；点位只以 `drawMossPatch` + `drawGrassRipple` 表达。
- **动物身上看不到任何条**：血量只由 `hpring.ts` 的环表达；`unit.ts` 不画血条；侧栏用 `drawSidebarRing` + 大字 HP。
- **所有描边过手绘生成器**：全部描边走 `ui/brush` 的 `strokeInk`（带 `jitter`）/`fillWatercolor`（水彩湿边）。
- **不允许魔法颜色值**：13 个模块内 **0** 个 `'#RRGGBB'` 字面量（教练/小恶魔的肤色、布料等也由 `PALETTE` 经 `tint()` 派生）。
- **不直接画 emoji**：天气只用 `forest.weatherShort()` 的文字标签（配置里的 🌈⛅⛈ 不进入渲染层）。
- **矩形条只有结算页伤害构成**：`drawDamageStack` 是唯一矩形条实现；`drawHouseHp`（棋盘小屋）按规格保留。
- **颜色/圆角/字号取自 theme**：`FONT/RADIUS/STROKE/SHADOW/METRIC` 全部来自 `config/layout.ts` 与 `ui/theme.ts`。

## 3. 静态自检

```bash
cd petbrawl && node tools/render-preview.js
```

脚本做四件事：

1. **模块齐全度**：13 个模块是否存在、是否有文件头注释
2. **禁止项扫描**：emoji、`'#RRGGBB'` 魔法色、`fillRect`/渐变色/`setLineDash`、矩形血条入口、`Lv.1` 角标
3. **资源清单 vs 磁盘**：解析 `ASSET_LIST`（含拼接的 16 条卡面/单位），列出缺图
4. **交叉引用**：`render` 内互引 + `scene/*`、`core/*` 调用的 render 符号是否真实存在

当前输出：

```text
模块：13 个，源码 191942B
--- 资源：磁盘已有 22，缺 1 ---
  ASSET_LIST 条目约 23 （解析到字面量 7 + 拼接 16）
  缺图 1 张（已回落程序化手绘）：art-src/card-tiger-01.jpg
结果：PASS（无禁止项、引用完整）
```

## 4. 类型检查

```bash
cd petbrawl && pnpm.cmd exec tsc -p tsconfig.json --noEmit
```

- `src/render/**`：**0 错误**（修复记录：`assets.ts` 的 `.concat()` 丢上下文类型 → 改为 `const SCENES: AssetEntry[]`；`sidebar.ts` 的 `LAYOUT.ENTRY.gap` → `LAYOUT.MY_ENTRY.gap`；`paint.drawGrassTuft` 放宽为同时接受 `(color, seed)` 与 `(seed)` 两种调用；`result.drawDamageStack` 的 `expanded` 放宽为 `number | string`）
- 剩余 29 行错误全部在**其他 Agent 的文件**里，与渲染层无关：
  - `src/platform/input.ts`：`TouchEventLike` / `MouseEventLike` 未定义（9 处）
  - `src/platform/screen.ts:38-39`：字面量类型收窄（`1280`/`720`）
  - `src/scene/boot.ts:67`、`src/scene/camp.ts:117,178,199`：向 `setFont` 传数字字重（`500`/`700`），而 `ui/theme.ts` 的 `FontWeight = 'normal' | 'bold'`
  - `src/scene/match.ts`：`tick` 签名与 `Scene` 基类不一致、`canBuy` 参数个数、`fx.bubble(..., null)`、`wd` 可能为 null、`WeatherId` 赋值
  - `src/main.ts:17`：`./scene/shop` 不存在

## 5. 已知不足 / 交给父代理的决定

1. **`theme.FontWeight` 只有 `'normal' | 'bold'`**，但 `boot.ts`/`camp.ts` 传了数字字重。`theme.ts` 是冻结文件，我未擅自修改；建议 theme 负责人把类型放宽为 `'normal' | 'bold' | number`（或把四处调用改成字符串）。
2. **`art-src/card-tiger-01.jpg` 缺图**（其余 22 张都在）。渲染层会回落到程序化手绘卡面，但美术通道补上后卡面风格才与其它 7 张统一。
3. **`render` 层的真实观感只能在运行时验证**：静态自检抓的是规则与引用，抓不到构图比例。建议父代理跑一次 `minigame` 预览，按 §15 的「主界面与棋盘截图达到风格目标」逐张对比参考图。
4. `drawScoreboardPanel` 在 `sidebar.ts` 实现，`ui.ts` 按父代理要求做了同名 re-export（`match.ts` 从 sidebar 引，`camp.ts` 从 ui 引，两处都能编过）。
5. `paint.drawGrassTuft` 现兼容两种调用形式，若后续统一口径建议收敛为 `(ctx,x,baseY,h,color,seed,sway?)`。