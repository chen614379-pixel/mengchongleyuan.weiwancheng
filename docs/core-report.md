# 萌宠乱斗 · 纯逻辑核心交付报告

范围：`D:\Users\CGQ\Documents\deepseek-harness\default-workspace\petbrawl\src\core\**` + `tools/headless.js`。
约束遵守：core 不 import `wx` / `canvas` / DOM / `src/render|ui|scene|platform`，不读 `tsconfig.json`/`package.json`/`game.js`/`src/config/*`；运行时只用 ES5 可见 API（不用 Map/Set/includes/Object.assign/Array.find/可选链），无头 node 可跑；固定 20Hz（`LOGIC_DT=50ms`）；`tick()` 处理恰好 50ms。

## 1. 模块清单

| 文件 | 职责 |
| --- | --- |
| `src/core/types.ts` | 全部结构类型（`BattleState`/`Unit`/`SideState`/`UnitStat`/`BattleEvent`/`Phase`/`EconomyLog`/`AiMemory`…），本轮为契约补了 `rng`、`weatherFx`、`weatherText`、`economy`、`ai`、`Unit` 的 base/统计/幻影/DOT 字段 |
| `src/core/rng.ts` | 局内唯一随机源（mulberry32 变体 + `Math.imul`），`createRng/nextFloat/nextInt/nextRange/pickWeighted/shuffled/cloneRng/rngFingerprint` |
| `src/core/command.ts` | 12 种 `Command` + `CommandQueue` + `CommandResult`（玩家与 AI 只能通过它改变状态） |
| `src/core/setup.ts` | 锚点几何（48 锚点 / 镜像 / 中心点）、单位工厂、抽卡与货架、`createBattle`、布阵→连续场的锚点转换、基础属性还原 |
| `src/core/shop.ts` | 集市：买卡/免费赠礼/刷新/卖卡/装牌/卸牌/轮次收入/胜利奖励/开市 |
| `src/core/damage.ts` | 伤害结算（§10 顺序）、护盾、治疗、反震、致死、死亡触发（幻影草）、伤害构成归因 |
| `src/core/battle.ts` | 战斗帧：计时/指挥落地/索敌、移动（转向避让 + 软分离 + 软边界）、同时结算攻击、8 种族特技与 12 加成牌效果、状态结算 |
| `src/core/engine.ts` | 指令仲裁 `applyCommand`、阶段机 `deploy→observe→battle→settle→market→下一轮`、回合判定、结算页数据与高光快照、barrel 入口配套 |
| `src/core/ai.ts` | 三档 AI（rookie/veteran/demon）：布阵/观测/战斗指挥/集市理财 + 拟人节奏与失误率 |
| `src/core/index.ts` | barrel：把所有 core 导出 + 配置里的枚举/常量/几何函数再导出（另含 `declare global { Math.imul }` 类型补丁，规避 tsconfig lib 无 ES2015 core，无运行时代码） |
| `tools/headless.js` | 无头自检脚手架（不进首包）：指纹确定性、稳健性、伤害归因、64 组平衡 |

core 运行时导出共 **136 个**（`node -e "console.log(Object.keys(require('./js/core/index.js')).length)"`）。

## 2. 公开 API（场景层契约，名字/签名按父代理要求）

```ts
// setup.ts
function createBattle(seed: number, difficulty: AiDifficulty): BattleState;
const ANCHOR_COUNT: number;                        // 48
const PLAYER_ANCHOR_COUNT: number;                 // 24
const PX_PER_UNIT: number;                         // 68（LAYOUT.GRID.cellW）
const BATTLE_BOUNDS: { minX; minY; maxX; maxY };   // 0,0,12,8（逻辑格）
function anchorIndex(col: number, row: number): number;            // 非我方/敌方半场返回 -1
function anchorColRow(anchor: number): { col: number; row: number };
function isPlayerAnchor(anchor: number): boolean;
function anchorCenter(anchor: number): { x: number; y: number };   // 单位=格，供渲染
function mirrorAnchor(anchor: number): number;                     // 正对点位 (11-c, 7-r)
function factionAnchorAt(faction: Faction, n: number): number;
function deployCap(state: BattleState, faction: Faction): number;  // min(6, 2+floor(round/2))
function createUnit(state, owner: Faction, species: SpeciesId, level: Level, invested: number): Unit;
function rollAnimalCard / rollAnyCard / rollShelf / createSide / syncFieldPositions / beginContinuous / restoreBaseStats;
function side(state, faction): SideState; function otherFaction(f): Faction;
function unitById(state, id): Unit | null; function fieldUnits(state, faction): Unit[];
function levelMultiplier(level): number; function powerOf(u): number; function investedOf(u): number;
function pushEvent(state, type, faction, unitId, targetId, amount, source, species): void; // events 上限 240

// engine.ts
function submit(state: BattleState, queue: CommandQueue, command: Command, by: 'player' | 'ai' | 'auto'): void;
function tick(state: BattleState, queue: CommandQueue, out: CommandResult[]): void; // 每帧：drain 指令 → time+=50 → aiTick → 阶段推进
function applyCommand(state, cmd, by): CommandResult;
function setPhase(state, phase, left): void;      // 写 phaseLeft + 追加 PhaseChange 事件
function phaseLeftOf(state): number; function isFinished(state): boolean;

// battle.ts
function prepareBattle(state): void;  function stepBattle(state): void;
function battleOver(state): boolean;  function fieldCount(state): number;
function unitDist(a, b): number; function reachOf(u, target): number;
function effectiveInterval(state, u): number; function effectiveSpeed(state, u): number;

// damage.ts
function dealDamage(state, attacker: Unit | null, target: Unit, opts: DamageOpts): number;
function damageOpts(base: number): DamageOpts;  function tickDamage(state, target, amount, source, attacker): void;
function killUnit(state, target, killer): void; function grantShield(state, u, amount): void; function healUnit(state, u, amount): number;

// shop.ts
function canBuy(state, faction, slot, useGift): { ok: boolean; reason?: string };
function refreshCost(state): number;             // ECONOMY.REFRESH_COST[min(refreshUsed, 2)]
function costOfCard(card): number;
function applyBuy / applyRefresh / applySell / applyEquipBuff / applyRemoveBuff / grantRoundIncome / grantWinBonus / beginMarket;
function shelfIntegrity(state): boolean;

// ai.ts
function aiTick(state: BattleState, queue: CommandQueue): void;  // 由 tick 内部按难度调用
```

阶段切换一律：`setPhase()` 写 `state.phaseLeft = TIMING.*` 并追加 `{ type:'PhaseChange', phase }` 到 `state.events`，场景层只需读 `phase` + `phaseLeft`。

## 3. 无头自检结果（全部 PASS，退出码 0）

编译（core 零错误）：
```
node <runtime>/pnpm.mjs exec tsc -p tsconfig.json     # src/core/** 0 error（剩余错误均在 render/scene/platform，非本任务文件）
node <runtime>/node.exe tools/headless.js
```

```
[1/4] 确定性（同 seed 两遍 1000 局全量指纹）
  第一遍 hash=2693346804 ticks=2120664 / 第二遍 hash=2693346804 ticks=2120664
  determinism: PASS
[3/4] 稳健性（1000 局不崩/不卡死/不死循环/无 NaN）
  robustness: PASS  crash=0 stuck=0 nan=0 tickCap/未结束=0
[4/4] 伤害归因（bySource 各项之和 vs 总伤害，误差 < 1%）
  attribution: PASS  检查单位=40114 越界=0 最大误差=0.0000%
[2/4] 平衡（64 组 × 20 局，同 seed 交换座位取平均）
  64 组中越界数量: 0 → balance(all 64): PASS ；balance(pooled per species): PASS
    elephant 50.5% lion 50.5% tiger 51.7% leopard 56.7% wolf 52.2% dog 49.7% cat 46.6% mouse 42.2%
（--pairs-games 40 复测同样 0 越界：象 51.0 / 狮 51.0 / 虎 51.6 / 豹 53.5 / 狼 54.0 / 狗 49.5 / 猫 48.1 / 鼠 41.3）
ALL CHECKS PASSED
```

自检口径说明（重要）：
- **平衡用「同 seed 交换座位取平均」**：每个有序对 (a,b) 各跑两局（a 在玩家位、b 在玩家位），胜分 `(w1 + 1 - w2)/2`。原因：脚手架里双方在同一 tick 上对称行动，同一帧指令的先后（玩家先 drain）会带来一次"先手"收益；该度量对 a/b 反对称，只保留物种差异。座位诊断原始值在 57.7%~74.3% 之间随种子集波动（`--enemy-first` 可翻到 38.9%），属脚手架同帧同步伪影，不是战斗机制问题——已用「严格点对称镜像」验证：
- **点对称对称性验证（临时工具，已删除）**：手工构造两侧完全点对称的 1~3 只同级象，逐帧记录：双方每次出手同帧、伤害逐分逐毫不差、最终同帧同归于尽。曾暴露的"玩家永远领先一次攻击"是 `knockback()` 无条件把目标 `atkTimer` 清零（践踏击退把同帧出手的对手打断）导致，已修（见 §5）。
- 脚手架开关：`--quick`、`--pairs-only`、`--pairs-games N`、`--enemy-first`、`--no-market`、`--no-cmd`、`--mirror-army`、`--budget N`（后两个是平衡口径实验，默认关闭）。

## 4. 关键实现决策

1. **战斗不碰网格**：`battle.ts` 不 import `GRID_COLS/GRID_ROWS/anchorToPixel/LAYOUT.GRID`；开战瞬间由 `prepareBattle → beginContinuous` 把每个单位的锁定目标点写在 `u.pushPos`（= `anchorCenter(mirrorAnchor(anchor))`，即"推进敌方半场"）与 `u.mirrorId`（正对），此后只按实时欧氏距离判定。
2. **攻击同时结算（本轮修）**：`stepAttacks` 两遍式——先对双方统一判定"本帧出手"（读攻击前状态），再统一结算；出手者本帧被打死也照样打出这一击。
3. **移动同时解算**：转向避让（60° 锥）、软分离互推（0.7 单位 / 0.35 推力）、软边界（2.4）都用 scratch 数组先累加、循环后统一落位，避免先后顺序造成不对称。
4. **索敌**每 200ms 重算、感知 6 单位；优先级 = 指挥目标 > 正对 > 最低 HP（偷袭/猎手本能）> 克制 > 最近 > 推进点；同分用严格 `>` 保留数组序，保证确定性。
5. **指令交易**：`CommandAttack` 0.4s 生效、6s CD、绕路系数 1.6 / 疾风足 1.3，无伤害加成与敌方反应。
6. **伤害顺序**（§10）：基础 → 加成牌/特技（加算）→ 天气 → 克制 → 目标减伤 → 护盾吸收 → 特性（暴击/连击/处决）→ 扣 HP → 反震/吸血；DOT 走 `tickDamage` 不触发二次反震。
7. **归因分解（本轮修）**：按乘法链瀑布计算，再按 `final/v4` 归一，使 bySource 五项之和**恒等于** `damageDealt`（浮点精确）。
8. **回合伤害**（§11.2）：`ceil(胜方存活战力之和 × 0.35)`，clamp [1,8]；双方同时清空 → 平局各扣 1；打满 8 回合比小屋 HP。
9. **商店是全桌共享货架/刷新计数**（types 冻结形状如此，双 AI 抢同一集市），免费赠礼按方独立（`economy[faction].giftUsed`），§11.1 允许任意卡（不仅动物）。
10. **天气**在 `enterBattle` 时把 `weather.next` 提交为 active，`resolveWeather` 结果写 `state.weatherFx.player/enemy` 与 `weatherText`；HP 上限乘区在开战时写入 `unit.maxHp`，战斗后用 `restoreBaseStats` 还原。
11. **二合一**：同种同级 ×2 → +1 级，`maxHp/atk = floor(base × 1.8^(level-1))`，3 级封顶，两个 3 级相合返还 `floor(invested × 0.6)`；卖出返还 `floor(invested × 0.8)`（含身上加成牌回手）。
12. **AI 只读可见信息**，同种 Command、同 6s CD/阳光规则、无数值加成；节奏走 `state.time`：布阵 3~6 次拖拽 + 0.3~1.2s 停顿、观测 1.5~3s、指挥延迟 0.8~2s、失误率 25%/10%/3%。

## 5. 本轮修掉的两个核心 bug

1. **镜像战斗存在"先手一次攻击"的系统性不对称**（59:41 级别的座位倾斜）。
   根因：`knockback()` 无条件 `target.atkTimer = 0`，践踏的击退会把同帧本该出手的对手打断；攻击按帧奇偶交替先手，导致某一侧长期白赚一次攻击。
   修法：① `knockback(..., interrupt)` 只有石拳（加成牌，§9 文案明确"击退并打断"）才打断，践踏不打断；② 攻击改为两遍式同时结算。
2. **伤害构成之和 ≠ 总伤害**（40114 个受检单位里 10216 个越界，最大误差正好 66.67%）。
   根因：旧的伸缩分解 `basic = final/common` 把目标减伤算进了分母，且被克制（×0.75）等**负分项被 `addStat` 的 `amount <= 0` 丢弃**——典型算式：`final=18, common=0.6 → basic=30`，五项和 30 vs `damageDealt` 18，误差恰为 12/18 = 66.67%。
   修法：乘法链瀑布 + 按 `final/v4` 归一 + 负分项记 0 并把差额并入普攻，五项之和恒等于总伤害（自检最大误差 0.0000%）。

## 6. 遗留问题 / TODO（需父代理决策或后续补齐）

1. **§9 装备式特技未实现**（借力模仿 / 共生血条 / 拟态伪装 / 荆棘反震 / 疾行 / 汲取 / 不屈 / 嘲讽）：`TraitId` 只有 8 个种族特技，config 无对应字段与装备槽，本轮按 8 种族特技实现，该表整体留空。
2. **几处 config 无常量、按 §9 文案取值的实现**（若父代理认为数值需要外置，请加进 config 后我改回读取）：
   - 践踏溅射半径用 `SPECIES.elephant.atkRange`（1.2 单位）；
   - 咆哮护体减伤 `ROAR_GUARD_REDUCE = 0.2`（§9 文案 20%）；
   - 边界保持 `BOUNDARY_BAND = 0.5`。
3. **§11.2「30s 到但双方都有存活」的胜负原文未写明**：当前解读为「先比存活战力之和，再比总 HP，全同平局」。如需改成"存活数优先"或"小屋血多者胜"，一行即可改（`judgeRound`）。
4. 集市为全桌共享：若产品希望双方各自独立货架，需要扩 `BattleState`（当前 types 是冻结形状）。
5. 平衡结论只对"同一套自动策略 + 随机起始 + 完整集市/指挥"这套口径成立；`--mirror-army`（双方同兵同级）口径下高费物种碾压低费物种（100% 级差距），说明**费用差就是本作的主要平衡杠杆**，若日后要按"同数量对比"调平衡，需要动 config 数值（属父代理决策范围，本轮未改）。
6. `src/core/index.ts` 里有一段 `declare global { interface Math { imul } }` 类型补丁：因为 tsconfig 的 lib 只有 ES5 + ES2015.Iterable，而 `rng.ts` 用 `Math.imul`。若后续允许改 tsconfig，可删掉该补丁。

## 7. 复现命令

```powershell
cd D:\Users\CGQ\Documents\deepseek-harness\default-workspace\petbrawl
# 编译（core 零错误；其余文件的报错属场景层/渲染层）
& 'C:\Users\CGQ\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' `
  'C:\Users\CGQ\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs' exec tsc -p tsconfig.json
# 全量自检（1000 局确定性 + 1000 局稳健 + 归因 + 64 组平衡）
& 'C:\Users\CGQ\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' tools\headless.js
```