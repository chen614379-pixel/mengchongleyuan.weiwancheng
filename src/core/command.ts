/**
 * 指令系统（§1 硬约束：玩家与 AI 产出同一种 Command，经 CommandQueue 生效，AI 无特权通道）。
 */
import { Faction } from './types';
import { EquipTraitId } from '../config/traits';
import { SpeciesId } from '../config/species';

export type Command =
  /** 布阵阶段：把替补席 unitId 放到 anchor 锚点 */
  | { type: 'Deploy'; faction: Faction; unitId: number; anchor: number }
  /** 布阵阶段：把场上单位收回替补席 */
  | { type: 'Retreat'; faction: Faction; unitId: number }
  /** 布阵/集市：场内两单位交换锚点 */
  | { type: 'Swap'; faction: Faction; unitA: number; unitB: number }
  /** 同种同级二合一：unitA 吃掉 unitB（保留 A 的位置） */
  | { type: 'Combine'; faction: Faction; unitA: number; unitB: number }
  /** 战斗阶段：指定优先攻击目标（0.4s 后生效 + 6s CD） */
  | { type: 'CommandAttack'; faction: Faction; unitId: number; targetId: number }
  /** 集市：购买货架第 slot 张 */
  | { type: 'Buy'; faction: Faction; slot: number }
  /** 集市：免费赠礼购买货架第 slot 张 */
  | { type: 'BuyGift'; faction: Faction; slot: number }
  /** 集市：刷新货架 */
  | { type: 'Refresh'; faction: Faction }
  /** 集市：卖出替补席单位，按累计费用 80% 返还 */
  | { type: 'Sell'; faction: Faction; unitId: number }
  /** 加成牌指定目标动物 */
  | { type: 'EquipBuff'; faction: Faction; cardId: number; unitId: number }
  /** 详情页：卸下某张加成牌（不退款） */
  | { type: 'RemoveBuff'; faction: Faction; unitId: number; buffIndex: number }
  /**
   * §9 装备式特技：给 unitId 装上/换装（trait=null 表示卸下）。
   * species 只对「借力模仿 / 共生血条 / 拟态伪装」有意义，其余传 null。
   */
  | { type: 'EquipTrait'; faction: Faction; unitId: number; trait: EquipTraitId | null; species: SpeciesId | null }
  /** 布阵确认（到点自动确认也会下发一次） */
  | { type: 'ConfirmDeploy'; faction: Faction };

export interface QueuedCommand {
  command: Command;
  /** 入队时的逻辑时间（ms） */
  queuedAt: number;
  /** 指令来源（用于战绩/AI 表演） */
  by: 'player' | 'ai' | 'auto';
}

/** 指令队列：每个逻辑帧开头统一 drain，保证确定性顺序。 */
export class CommandQueue {
  private items: QueuedCommand[] = [];
  /** 指令流水（结算页高光回放用） */
  readonly history: QueuedCommand[] = [];

  push(command: Command, at: number, by: 'player' | 'ai' | 'auto' = 'player'): void {
    this.items.push({ command, queuedAt: at, by });
  }

  /** 按入队顺序取出本帧全部指令。 */
  drain(): QueuedCommand[] {
    if (this.items.length === 0) return [];
    const out = this.items;
    this.items = [];
    for (let i = 0; i < out.length; i++) this.history.push(out[i]);
    return out;
  }

  get pending(): number {
    return this.items.length;
  }

  /** 清空未处理指令（切阶段时调用）。 */
  clear(): void {
    this.items = [];
  }
}

/** 指令结果（core 返回给场景，用于提示与音效）。 */
export interface CommandResult {
  ok: boolean;
  /** 失败原因（用于提示，如 'not-enough-sunlight'） */
  reason?: string;
  /** 命令产生的动画/演出提示（渲染层选择播哪个） */
  fx?: 'card-fly' | 'buff-wrap' | 'combine-bloom' | 'reject' | 'command-fly' | 'leaf-fall';
}