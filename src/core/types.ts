/**
 * 全局基础类型：坐标、单位、卡片实例、战斗事件。
 * 本文件与 core/ 其余文件都不得依赖 wx / canvas（可无头运行）。
 */
import { SpeciesId, TraitId } from '../config/species';
import { EquipTraitId } from '../config/traits';
import { BuffId } from '../config/cards';
import { EffectBundle, WeatherId } from '../config/weather';
import { RngState } from './rng';

/** 逻辑坐标：x 向右 0~12，y 向下 0~8（单位 = 格）。棋盘中心 (6, 4)。 */
export interface Vec2 {
  x: number;
  y: number;
}

export type Faction = 'player' | 'enemy';

/** 卡牌实例（集市 / 手牌 / 替补席流动）。 */
export interface CardInstance {
  /** 全局自增 id，确定性由 CreationCounter 保证 */
  id: number;
  kind: 'animal' | 'weather' | 'buff';
  /** 动物卡：物种；weather/buff 卡：对应 id */
  species?: SpeciesId;
  weather?: WeatherId;
  buff?: BuffId;
  /** 买入时点（回合数），用于 MVP/统计 */
  boughtRound: number;
}

/** 动物实例（替补席或场上）。 */
export interface Unit {
  id: number;
  owner: Faction;
  species: SpeciesId;
  level: 1 | 2 | 3;
  /** 已装备的加成牌（最多 BUFF_SLOTS） */
  buffs: BuffId[];
  /** 特技槽 */
  trait: TraitId | null;
  maxHp: number;
  hp: number;
  /** 护盾（上限 SHIELD_CAP_RATIO × maxHp） */
  shield: number;
  atk: number;
  /** 攻击间隔（ms），基础值 × 加成修正 */
  atkInterval: number;
  moveSpeed: number;
  atkRange: number;
  /** 本体半径（配置表里是渲染像素；核心按 PX_PER_UNIT 换算成逻辑单位） */
  bodyRadius: number;
  /** 未计入天气 HP 上限乘区的裸上限（等级缩放后的基础值） */
  baseMaxHp: number;
  /** 未计入加成牌/天气的裸攻击力（等级缩放后的基础值） */
  baseAtk: number;
  /** 该单位累计投入阳光（买入价 + 合成吃掉单位的投入），卖出按此返还 80% */
  invested: number;
  /** 开战前算好的正对（点对称）对手 id（-1 = 无；由 setup 计算，battle 只读） */
  mirrorId: number;
  /** 无目标时推进的连续坐标（= 正对锚点中心，开战时由 setup 预计算） */
  pushPos: Vec2;
  /** 流血归因来源（trait = 种族流血；buff = 毒牙）与施加者（统计归属） */
  bleedSource: keyof UnitStat['bySource'];
  bleedFromId: number;
  /** 流血/回血/天气流失的毫秒累加器（整数化结算 >1% 误差要求） */
  dotTimer: number;
  regenTimer: number;
  drainTimer: number;
  /** 替身草人是否已触发（每局一次） */
  decoyUsed: boolean;
  /** §9 装备式特技（布阵阶段装备，null = 未装备） */
  equip: EquipTraitId | null;
  /** §9 借力模仿 / 共生血条 / 拟态伪装 选定的目标物种（null = 未选定） */
  equipSpecies: SpeciesId | null;
  /** §9 不屈是否已用掉（每局一次） */
  unyieldUsed: boolean;
  /** 当前是否是「替身幻影」形态 */
  isDecoy: boolean;
  /** 当前位置（连续浮点，单位 = 格）。布阵阶段吸附在锚点（或替补席 -1） */
  pos: Vec2;
  /** 布阵锚点（-1 表示在替补席） */
  anchor: number;
  /** 场内朝向：1 = 向右，-1 = 向左 */
  facing: 1 | -1;
  alive: boolean;
  /** 出场回合数 */
  roundsPlayed: number;
  /** 本局累计统计（结算页用） */
  stat: UnitStat;
  /** 攻击计时器（ms 累加） */
  atkTimer: number;
  /** 当前索敌目标 id（-1 = 无） */
  targetId: number;
  /** 索敌重算计时器 */
  targetTimer: number;
  /** 下一次可接受指挥的时间戳（局内逻辑时间） */
  commandReadyAt: number;
  /** 玩家/ AI 指定的优先目标（指令覆盖索敌） */
  forcedTargetId: number;
  /** 指令生效时间戳（0 = 无待生效指令） */
  pendingCommandAt: number;
  pendingTargetId: number;
  /** 状态：流血层数与到期时间、减攻速、减伤、回血 */
  status: StatusSet;
  /** 死亡留下的幻影（替身草人） */
  decoyUntil: number;
  /** 演出用事件队列（渲染层只读） */
  fx: FxFlag;
}

export interface UnitStat {
  damageDealt: number;
  damageTaken: number;
  kills: number;
  /** 存活时长（ms，局内逻辑时间） */
  aliveMs: number;
  /** 各来源伤害（结算页堆叠条） */
  bySource: { basic: number; trait: number; counter: number; weather: number; buff: number };
  healed: number;
}

export interface StatusSet {
  /** 流血：每层每秒伤害 = bleedPerSec，剩余时间 */
  bleedStacks: number;
  bleedPerSec: number;
  bleedUntil: number;
  /** 攻速 debuff：剩余时间与乘区 */
  slowAtkUntil: number;
  slowAtkMul: number;
  /** 减伤 buff（咆哮等）：剩余时间与比例 */
  guardUntil: number;
  guardReduce: number;
  /** 周期性回血剩余时间 */
  regenUntil: number;
  /** 嘲讽剩余时间 */
  tauntUntil: number;
  /** 拟态伪装为哪个物种（null = 无） */
  mimic: SpeciesId | null;
}

/** 渲染层只读的一次性演出标记（由 core 写入、render 消费后清除）。 */
export interface FxFlag {
  hitFlash: number;
  attackPulse: number;
  deathFirefly: number;
  combineBloom: number;
  shieldRipple: number;
  /** 上一次受击方向（-1/1），用于震屏 */
  hitDir: number;
  /** 是否命中克制（金色草环） */
  counterHit: number;
}

/** 天气槽（双方各 1，作用于下一轮战斗）。 */
export interface WeatherSlot {
  next: WeatherId;
  /** 本回合实际生效（由 resolveWeather 算出，只读） */
  active: WeatherId;
}

/** 战斗统计事件（供 AI 表演与结算页复用）。 */
export type BattleEventType =
  | 'UnitDeploy' | 'UnitDeath' | 'UnitDamage' | 'UnitHeal' | 'UnitShield'
  | 'RoundStart' | 'BattleEnd' | 'CommandIssued' | 'CommandApplied' | 'Combine' | 'PlayerUnitDeath'
  | 'ImpLoseRound' | 'ImpWinRound' | 'PhaseChange';

export interface BattleEvent {
  type: BattleEventType;
  /** 事件发生时的逻辑时间（ms） */
  at: number;
  unitId?: number;
  targetId?: number;
  faction?: Faction;
  species?: SpeciesId;
  amount?: number;
  source?: keyof UnitStat['bySource'];
  /** 阶段切换事件携带的新阶段（type = 'PhaseChange' 时写入，供场景层切 UI） */
  phase?: Phase;
}

/** 回合阶段（§3）。 */
export type Phase = 'load' | 'menu' | 'deploy' | 'observe' | 'battle' | 'settle' | 'market' | 'result';

/** 集市货架槽：空槽 = null。 */
export interface ShelfSlot {
  card: CardInstance | null;
  /** 是否已卖出/买入 */
  taken: boolean;
}

/** 局内经济流水（结算页「阳光流水」）。 */
export interface EconomyLog {
  /** 轮次基础收入 + 回合胜利（总进账） */
  income: number;
  /** 利息收入 */
  interest: number;
  /** 买卡支出 */
  buySpent: number;
  /** 刷新支出 */
  refreshSpent: number;
  /** 卖出返还 */
  sellGained: number;
  /** 本轮是否已用掉免费赠礼（每方各一次） */
  giftUsed: boolean;
}

/** 小恶魔决策记忆（必须放进 state：保证同种子同指令序列可复现）。 */
export interface AiMemory {
  difficulty: AiDifficulty;
  /** 下一次可行动的逻辑时间（拟人节奏用） */
  nextActionAt: number;
  /** 本阶段已执行的动作次数 */
  actionsThisPhase: number;
  /** 布阵点对是否已就绪 */
  planReady: boolean;
  /** 布阵计划：与 planUnits 一一对应的目标锚点 */
  planUnits: number[];
  planAnchors: number[];
  /** 观测阶段「思考」结束时间 */
  observeUntil: number;
  /** 本局战斗指挥次数 */
  commandCount: number;
  /** 本阶段集市决策是否已完成 */
  marketDone: boolean;
}

/** 一局对战的完整逻辑状态（core 独占写权限）。 */
export interface BattleState {
  /** 注入的种子 */
  seed: number;
  /** 局内唯一随机源（确定性来源） */
  rng: RngState;
  /** 确定性自增 id */
  nextId: number;
  /** 局内逻辑时间（ms），每逻辑帧 + LOGIC_DT */
  time: number;
  phase: Phase;
  round: number;
  /** 阶段剩余时间（ms） */
  phaseLeft: number;
  player: SideState;
  enemy: SideState;
  /** 本回合天气（下一轮生效） */
  weather: { player: WeatherSlot; enemy: WeatherSlot };
  /** 本回合实际生效的天气效果包（battle 只读；由 engine 在开战时注入） */
  weatherFx: { player: EffectBundle; enemy: EffectBundle };
  /** 本回合天气文案（RoundLog / 侧栏用） */
  weatherText: string;
  /** 集市货架 */
  shelf: ShelfSlot[];
  /** 本回合刷新次数 */
  refreshUsed: number;
  /** 本回合免费赠礼是否已用 */
  giftUsed: boolean;
  /** 局内经济流水 */
  economy: { player: EconomyLog; enemy: EconomyLog };
  /** 小恶魔 AI 记忆 */
  ai: AiMemory;
  /** 结果 */
  outcome: 'win' | 'lose' | 'draw' | null;
  /** 回合战绩流水（战绩面板） */
  log: RoundLog[];
  /** 事件流（AI 表演 + 结算页） */
  events: BattleEvent[];
  /** 高光回放快照 */
  highlights: HighlightSnapshot[];
}

export interface SideState {
  faction: Faction;
  sunlight: number;
  houseHp: number;
  houseHpMax: number;
  /** 场上单位（最多 DEPLOY_LIMIT 出战） */
  units: Unit[];
  /** 替补席（8 格，null = 空） */
  bench: (Unit | null)[];
  /** 手牌区（加成牌待指定） */
  hand: CardInstance[];
  /** 本局倾向物种（权重保底） */
  biasSpecies: SpeciesId;
  /** 段位/难度：player 恒 'player'，enemy 为 AI 难度 */
  ai?: AiDifficulty;
  /** 本回合是否已确认布阵 */
  deployed: boolean;
}

export type AiDifficulty = 'rookie' | 'veteran' | 'demon';

export interface RoundLog {
  round: number;
  winner: Faction | 'draw';
  houseDamage: { player: number; enemy: number };
  playerUnits: LogUnit[];
  enemyUnits: LogUnit[];
  weather: string;
}

export interface LogUnit {
  species: SpeciesId;
  level: 1 | 2 | 3;
  hpMax: number;
  survived: boolean;
  buffs: BuffId[];
}

export interface HighlightSnapshot {
  round: number;
  /** 快照时刻（ms） */
  at: number;
  label: string;
  /** 序列化后的核心 state（仅存活单位的位置与 HP，用于 1.5s 回放） */
  units: { id: number; species: SpeciesId; hp: number; maxHp: number; level: 1 | 2 | 3; pos: Vec2; alive: boolean }[];
  /** 前 1.5s 的命令流 */
  commands: { at: number; unitId: number; targetId: number }[];
}