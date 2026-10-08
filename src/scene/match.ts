/**
 * 对局场景（§3 一局循环 / §4 棋盘 / §6 克制 / §7 卡牌 / §8 指挥 / §11 结算）。
 *
 * 职责边界：本文件只做「把可见状态画出来」+「把手势翻译成 Command」，
 * 绝不修改 core 状态（唯一写入口是 `CommandQueue`）。
 */
import { Scene, pop } from './manager';
import {
  BANNER_RECT, BOARD_RECT, Rect, benchAt, benchRect, coachRect, detailButtonRect, detailRect,
  entryAt, entryPanelRect, entryRect, gearRect, giftRect, handAt, handRect, houseRect, impRect, inRect,
  nearestPlayerAnchor, readyRect, refreshRect, reportArrowRect, resultButtonRect, scrollRect,
  settingsRect, shelfAt, shelfRect, sunCoinRect, warbookRect, MARKET
} from './match-layout';
import { LAYOUT, anchorToPixel } from '../config/layout';
import { PALETTE, rgba } from '../config/palette';
import { TIMING } from '../config/timing';
import { SPECIES, SpeciesId } from '../config/species';
import { buffDef } from '../config/cards';
import { ECONOMY, sellValue } from '../config/economy';
import { weatherDef, WeatherId } from '../config/weather';
import {
  AiDifficulty, BattleState, CardInstance, Faction, Phase, SideState, Unit
} from '../core/types';
import { Command, CommandQueue, CommandResult } from '../core/command';
import {
  ANCHOR_COUNT, anchorColRow, createBattle, deployCap, fieldUnits, side, unitById
} from '../core/setup';
import { tick as engineTick, submit as engineSubmit } from '../core/engine';
import { aiTick } from '../core/ai';
import { canBuy, refreshCost } from '../core/shop';
import { applyMatchResult } from '../platform/storage';
import { playSfx } from '../platform/audio';
import { GestureEvent } from '../platform/input';
import { drawPlateCover, sceneBox, sceneCorners } from '../platform/screen';
import { fitSize, setFont, textOutlined } from '../ui/theme';
import { createFx, FxSystem } from '../ui/fx';
import { drawSky, drawForestLayer, drawSunSpecks, drawVignette, drawWeather } from '../render/forest';
import { getImage } from '../render/assets';
import { drawBoard, drawEnemyFog, drawHouseHp, drawMossPatch } from '../render/board';
import { UnitView, drawUnit, speciesBodyRadius, drawSpeciesCreature } from '../render/unit';
import { drawHpRing } from '../render/hpring';
import { CardView, drawCard } from '../render/card';
import {
  SideEntryView, drawBench, drawScrollButton, drawSideEntry, drawCoachAvatar, drawDeployTimer,
  drawScoreboardPanel, RoundLogView
} from '../render/sidebar';
import { drawCoach } from '../render/coach';
import { drawImp } from '../render/imp';
import {
  DamageSegment, HighlightView, MvpView, ReportPage, RewardView, LedgerRow,
  drawDamageStack, drawHighlightStrip, drawMvpPanel, drawPageDots, drawReportCard,
  drawResultBanner, drawRewardRow, drawSunLedger
} from '../render/result';
import {
  drawButton, drawGear, drawIconButton, drawSunCoin, drawTipBubble, drawToast, drawWoodPanel
} from '../render/ui';
import { drawGrassTuft } from '../render/paint';
import { fillWatercolor, roundedRectPoints, strokeInk } from '../ui/brush';

/** 结算页伤害堆叠条的矩形（绘制与点击判定共用，改一处即同步）。 */
const DAMAGE_STACK = { x: 365, y: 344, w: 370, h: 190 };

export interface MatchOptions {
  seed?: number;
  difficulty?: AiDifficulty;
  /** 视觉自检用（发布前置 false）：自动布阵 + 压缩各阶段时长，方便连续截图核对。 */
  dev?: boolean;
}

export function createMatchScene(opts?: MatchOptions): Scene {
  return new MatchScene(opts || {});
}

interface DragState {
  unitId: number;
  fromAnchor: number;
  fromBench: number;
  x: number;
  y: number;
  hover: number;
  valid: boolean;
  overBench: number;
  startedAt: number;
}

class MatchScene implements Scene {
  readonly name = 'match';
  private opts: MatchOptions;
  private battle: BattleState | null = null;
  private queue = new CommandQueue();
  private results: CommandResult[] = [];
  private fx: FxSystem = createFx();

  private time = 0;
  private logicTime = 0;
  private drag: DragState | null = null;
  private handDrag: { cardId: number; x: number; y: number; hoverUnit: number } | null = null;
  private selectedUnit = -1;
  private detailUnit = -1;
  private showWarbook = false;
  private showSettings = false;
  private giftArmed = false;
  private pressed = '';
  private toast = '';
  private toastUntil = -1;
  private rejectAt = -9999;
  private rejectCard = -1;
  private prevHp: { [id: string]: number } = {};
  private prevAlive: { [id: string]: boolean } = {};
  private enemyGhost: SideEntryView[] | null = null;
  private resultApplied = false;
  /** dev 自检阶段位（正常游戏恒为 0，不会进入任何分支） */
  private devStage = 0;
  private devPhase = '';
  private devConfirmDone = false;
  private devMarketBuy = -1;
  private reportPage = 0;
  private expandedSeg = '';
  private rewardProgress = 0;
  private coinGain = 0;
  private starGain = 0;
  private housePrev = 30;

  constructor(opts: MatchOptions) {
    this.opts = opts;
  }

  /* ------------------------------------------------------------------ */
  /* 生命周期                                                            */
  /* ------------------------------------------------------------------ */

  enter(): void {
    const seed = this.opts.seed === undefined ? (Date.now() % 100000) : this.opts.seed;
    this.battle = createBattle(seed, this.opts.difficulty || 'veteran');
    this.queue = new CommandQueue();
    this.results = [];
    this.fx.clear();
    this.captureSnapshot();
    this.housePrev = this.battle.player.houseHp;
    this.showToast('第 1 回合 · 布阵阶段，长按动物拖到棋盘上', 3200);
  }

  exit(): void {
    this.fx.clear();
  }

  tick(dtMs: number, logicTime: number): void {
    this.time += dtMs;
    this.logicTime = logicTime;
    this.fx.update(dtMs);
    const b = this.battle;
    if (!b) return;

    const before = b.phase;
    if (this.opts.dev) this.devStep(b);
    aiTick(b, this.queue);
    engineTick(b, this.queue, this.results);
    this.consumeResults();
    this.syncUnitFx();
    if (b.phase !== before) this.onPhaseChange(before, b.phase);

    if (b.phase === 'result' && !this.resultApplied) this.finishMatch();

    // 雾气散开时给一点光尘，保持场景“活”（确定性：不用 Math.random）
    if (b.phase === 'observe') {
      const beat = (this.time / 250) % 1;
      if (beat < 0.06) {
        const j = (this.time * 0.618) % 1;
        const k = (this.time * 0.37) % 1;
        this.fx.dust(LAYOUT.BOARD.x + 40 + j * (LAYOUT.BOARD.w - 80), 90 + k * 130, 1);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 指令与演出                                                          */
  /* ------------------------------------------------------------------ */

  /** 仅 dev 入口执行：自动布阵、自动确认、压缩阶段时长，两回合后直接进结算。 */
  private devStep(b: BattleState): void {
    if (this.devStage === 0 && b.time >= 400) {
      this.devStage = 1;
      const bench = b.player.bench;
      let placed = 0;
      for (let i = 0; i < bench.length && placed < 4; i++) {
        const u = bench[i];
        if (!u) continue;
        this.push({ type: 'Deploy', faction: 'player', unitId: u.id, anchor: placed * 2 });
        placed++;
      }
    }
    if (this.devPhase !== b.phase) {
      this.devPhase = b.phase;
      this.devConfirmDone = false;
    }
    if (b.phase === 'deploy') {
      if (b.phaseLeft > 6000) b.phaseLeft = 6000;
      if (b.phaseLeft < 1000 && !this.devConfirmDone) {
        this.devConfirmDone = true;
        this.push({ type: 'ConfirmDeploy', faction: 'player' });
      }
    }
    if (b.phase === 'observe' && b.phaseLeft > 2000) b.phaseLeft = 2000;
    if (b.phase === 'battle') {
      if (b.round >= 2) b.round = 8;
      if (b.phaseLeft > 6000) b.phaseLeft = 6000;
    }
    if (b.phase === 'settle') {
      const cap = b.round >= 8 ? 600 : 1000;
      if (b.phaseLeft > cap) b.phaseLeft = cap;
    }
    if (b.phase === 'market') {
      if (this.devMarketBuy !== b.round) {
        this.devMarketBuy = b.round;
        this.push({ type: 'Buy', faction: 'player', slot: 0 });
      }
      if (b.phaseLeft > 4000) b.phaseLeft = 4000;
      if (b.phaseLeft < 1200 && !this.devConfirmDone) {
        this.devConfirmDone = true;
        this.push({ type: 'ConfirmDeploy', faction: 'player' });
      }
    }
  }

  private push(cmd: Command): void {
    if (!this.battle) return;
    this.queue.push(cmd, this.battle.time, 'player');
  }

  private consumeResults(): void {
    for (let i = 0; i < this.results.length; i++) {
      const r = this.results[i];
      if (!r.ok) {
        playSfx('reject');
        this.rejectAt = this.time;
        this.showToast(reasonText(r.reason), 1600);
        continue;
      }
      const f = r.fx;
      if (f === 'card-fly') playSfx('cardPick');
      else if (f === 'buff-wrap') playSfx('combine');
      else if (f === 'combine-bloom') {
        playSfx('combine');
        this.fx.petals(640, 300, 4);
      } else if (f === 'command-fly') playSfx('command');
      else if (f === 'reject') playSfx('reject');
      else playSfx('tap');
    }
    this.results.length = 0;
  }

  /** 对比上一帧的 HP/存活，生成命中、治疗、死亡演出（渲染层只读事件）。 */
  private syncUnitFx(): void {
    const b = this.battle;
    if (!b) return;
    for (let f = 0; f < 2; f++) {
      const fac: Faction = f === 0 ? 'player' : 'enemy';
      const units = side(b, fac).units;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const key = '' + u.id;
        const prev = this.prevHp[key];
        const wasAlive = this.prevAlive[key];
        const p = this.unitPixel(u);
        if (prev !== undefined && u.hp < prev && wasAlive !== false) {
          const dmg = prev - u.hp;
          this.fx.damage(p.x, p.y - speciesBodyRadius(u.species) - 10, dmg, {
            counter: u.fx.counterHit > 0,
            crit: dmg > u.maxHp * 0.18,
            source: u.bleedSource
          });
          this.fx.hitLeaves(p.x, p.y, u.facing, 2);
          this.fx.slashArc(p.x, p.y, u.facing);
          if (b.phase === 'battle') {
            playSfx('hit');
            this.fx.shake(dmg > u.maxHp * 0.2 ? 5 : 3);
          }
        } else if (prev !== undefined && u.hp > prev) {
          this.fx.heal(p.x, p.y - speciesBodyRadius(u.species) - 12, u.hp - prev);
        }
        if (prev !== undefined && u.shield > 0 && u.fx.shieldRipple > 0) {
          this.fx.shield(p.x, p.y, u.shield);
        }
        if (wasAlive === true && !u.alive) {
          this.fx.fireflyBurst(p.x, p.y - speciesBodyRadius(u.species), 3);
          playSfx('death');
          this.fx.shake(4);
        }
        this.prevHp[key] = u.hp;
        this.prevAlive[key] = u.alive;
      }
    }
  }

  private captureSnapshot(): void {
    const b = this.battle;
    if (!b) return;
    this.prevHp = {};
    this.prevAlive = {};
    for (let f = 0; f < 2; f++) {
      const units = side(b, f === 0 ? 'player' : 'enemy').units;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        this.prevHp['' + u.id] = u.hp;
        this.prevAlive['' + u.id] = u.alive;
      }
    }
  }

  private onPhaseChange(from: Phase, to: Phase): void {
    const b = this.battle;
    if (!b) return;
    this.fx.clearMoss();
    this.selectedUnit = -1;
    this.drag = null;
    this.handDrag = null;
    if (to === 'deploy') {
      this.showToast('第 ' + b.round + ' 回合 · 布阵 ' + Math.round(TIMING.DEPLOY_RN / 1000) + 's', 2200);
    } else if (to === 'observe') {
      playSfx('tap');
      this.enemyGhost = null;
      this.showToast('观测 4s · 看清对手与克制关系（不可操作）', 2200);
    } else if (to === 'battle') {
      playSfx('land');
      this.showToast('战斗开始！点选我方动物 → 点敌方目标 下达集火', 2600);
    } else if (to === 'settle') {
      const win = b.player.houseHp < this.housePrev;
      playSfx(win ? 'roundLose' : 'roundWin');
      this.housePrev = b.player.houseHp;
      this.captureSnapshot();
    } else if (to === 'market') {
      this.enemyGhost = this.ghostFromLastRound();
      playSfx('tap');
      this.showToast('集市 ' + Math.round(TIMING.MARKET / 1000) + 's · 买卡 / 刷新 / 合成', 2200);
    } else if (to === 'result') {
      this.resultApplied = false;
    }
  }

  private finishMatch(): void {
    const b = this.battle;
    if (!b) return;
    this.resultApplied = true;
    const outcome = b.outcome || 'draw';
    const win = outcome === 'win';
    const draw = outcome === 'draw';
    this.coinGain = win ? ECONOMY.REWARD_WIN_COINS : draw ? ECONOMY.REWARD_DRAW_COINS : ECONOMY.REWARD_LOSE_COINS;
    this.starGain = win ? ECONOMY.REWARD_WIN_STARS : 0;
    const seen: string[] = [];
    for (let f = 0; f < 2; f++) {
      const s = side(b, f === 0 ? 'player' : 'enemy');
      for (let i = 0; i < s.units.length; i++) pushUnique(seen, s.units[i].species);
      for (let i = 0; i < s.bench.length; i++) {
        const u = s.bench[i];
        if (u) pushUnique(seen, u.species);
      }
    }
    applyMatchResult(outcome, this.coinGain, this.starGain, seen);
    playSfx(win ? 'victory' : draw ? 'tap' : 'defeat');
    this.showToast(win ? '胜利！' : draw ? '平局' : '惜败', 2000);
  }

  private showToast(text: string, ms: number): void {
    this.toast = text;
    this.toastUntil = this.time + ms;
  }

  /* ------------------------------------------------------------------ */
  /* 手势 → Command                                                      */
  /* ------------------------------------------------------------------ */

  gesture(e: GestureEvent): void {
    const b = this.battle;
    if (!b) return;
    if (this.showSettings && e.type === 'up' && !e.wasDrag) {
      this.gestureSettings(e.x, e.y);
      return;
    }
    if (b.phase === 'result') {
      if (e.type === 'up' && !e.wasDrag) this.gestureResult(e.x, e.y);
      return;
    }

    if (e.type === 'down') {
      this.pressed = this.hitButton(e.x, e.y);
      if (!this.pressed) this.prepareDrag(e.x, e.y);
      return;
    }
    if (e.type === 'dragStart') {
      this.beginDrag(e.x, e.y);
      return;
    }
    if (e.type === 'move') {
      if (this.drag) {
        this.drag.x = e.x;
        this.drag.y = e.y;
        this.updateDragTarget();
      } else if (this.handDrag) {
        this.handDrag.x = e.x;
        this.handDrag.y = e.y;
        this.handDrag.hoverUnit = this.unitAtPixel(e.x, e.y);
      }
      return;
    }
    if (e.type === 'up') {
      if (this.drag) {
        this.commitDrag(e.x, e.y, e.wasDrag);
        return;
      }
      if (this.handDrag) {
        this.commitHandDrag(e.x, e.y);
        return;
      }
      if (!e.wasDrag) this.onTap(e.x, e.y);
      else if (this.showWarbook) this.showWarbook = false;
      this.pressed = '';
      return;
    }
    if (e.type === 'cancel') {
      this.drag = null;
      this.handDrag = null;
      this.pressed = '';
    }
  }

  private hitButton(x: number, y: number): string {
    const b = this.battle;
    if (!b) return '';
    if (this.showWarbook) return inRect(warbookRect(), x, y) ? 'warbook' : '';
    if (this.detailUnit >= 0) {
      for (let i = 0; i < 3; i++) if (inRect(detailButtonRect(i), x, y)) return 'detailBtn' + i;
      return inRect(detailRect(), x, y) ? 'detail' : '';
    }
    if (inRect(gearRect(), x, y)) return 'gear';
    if (inRect(scrollRect(), x, y)) return 'scroll';
    if (b.phase === 'market') {
      if (inRect(refreshRect(), x, y)) return 'refresh';
      if (inRect(giftRect(), x, y)) return 'gift';
    }
    if (b.phase === 'deploy' || b.phase === 'market') {
      // 集市阶段的按钮画在 MARKET.ready（底板右上角），判定必须用同一个矩形，否则按钮点了没反应
      const rr = b.phase === 'market' ? MARKET.ready : readyRect();
      if (inRect(rr, x, y)) return 'ready';
    }
    return '';
  }

  private prepareDrag(x: number, y: number): void {
    // 手牌里的加成牌：按住即可拖（仍遵守长按起拖）
    const idx = handAt(x, y);
    if (idx >= 0 && this.battle && idx < this.battle.player.hand.length) {
      this.drag = null;
      return;
    }
    this.drag = null;
  }

  private beginDrag(x: number, y: number): void {
    const b = this.battle;
    if (!b) return;
    const hidx = handAt(x, y);
    if (hidx >= 0 && hidx < b.player.hand.length) {
      this.handDrag = { cardId: b.player.hand[hidx].id, x, y, hoverUnit: -1 };
      playSfx('cardPick');
      return;
    }
    if (b.phase !== 'deploy' && b.phase !== 'market') return;

    const anchor = nearestPlayerAnchor(x, y, LAYOUT.GRID.cellW * 0.8);
    if (anchor >= 0) {
      const u = this.unitAtAnchor('player', anchor);
      if (u && u.alive) {
        this.drag = {
          unitId: u.id, fromAnchor: anchor, fromBench: -1, x, y, hover: anchor,
          valid: true, overBench: -1, startedAt: this.time
        };
        playSfx('tap');
        return;
      }
    }
    const slot = benchAt(x, y);
    if (slot >= 0) {
      const u = b.player.bench[slot];
      if (u) {
        this.drag = {
          unitId: u.id, fromAnchor: -1, fromBench: slot, x, y, hover: -1,
          valid: false, overBench: -1, startedAt: this.time
        };
        playSfx('tap');
      }
    }
  }

  private updateDragTarget(): void {
    const d = this.drag;
    const b = this.battle;
    if (!d || !b) return;
    d.hover = nearestPlayerAnchor(d.x, d.y);
    d.overBench = benchAt(d.x, d.y);
    const source = unitById(b, d.unitId);
    d.valid = false;
    if (d.hover >= 0) {
      if (d.hover === d.fromAnchor) d.valid = true;
      else {
        const occupant = this.unitAtAnchor('player', d.hover);
        if (!occupant) {
          const cap = deployCap(b, 'player');
          const onField = fieldUnits(b, 'player').length;
          d.valid = d.fromAnchor >= 0 || onField < cap;
        } else {
          d.valid = true;
        }
      }
    }
    if (d.overBench >= 0 && d.fromAnchor >= 0) d.valid = true;
    void source;
  }

  private commitDrag(x: number, y: number, wasDrag: boolean): void {
    const b = this.battle;
    const d = this.drag;
    this.drag = null;
    if (!b || !d) return;

    if (d.overBench >= 0 && d.fromAnchor >= 0) {
      this.push({ type: 'Retreat', faction: 'player', unitId: d.unitId });
      playSfx('land');
      return;
    }
    const anchor = nearestPlayerAnchor(x, y);
    if (anchor < 0) {
      if (wasDrag) playSfx('reject');
      this.fx.clearMoss();
      return;
    }
    const occupant = this.unitAtAnchor('player', anchor);
    if (d.fromAnchor < 0) {
      // 替补席 → 点位
      this.push({ type: 'Deploy', faction: 'player', unitId: d.unitId, anchor });
      playSfx('land');
      this.fx.moss(this.anchorPixel(anchor).x, this.anchorPixel(anchor).y, speciesBodyRadius(this.unitSpecies(d.unitId)) + 10);
      return;
    }
    if (anchor === d.fromAnchor) {
      this.fx.moss(this.anchorPixel(anchor).x, this.anchorPixel(anchor).y, 40);
      return;
    }
    if (occupant) {
      const a = unitById(b, d.unitId);
      if (a && occupant.species === a.species && occupant.level === a.level && a.level < 3) {
        this.push({ type: 'Combine', faction: 'player', unitA: d.unitId, unitB: occupant.id });
        playSfx('combine');
      } else {
        this.push({ type: 'Swap', faction: 'player', unitA: d.unitId, unitB: occupant.id });
        playSfx('land');
      }
      return;
    }
    // 空点位：先收回再放下（core 只有 Deploy/Retreat 两种落位指令）
    this.push({ type: 'Retreat', faction: 'player', unitId: d.unitId });
    this.push({ type: 'Deploy', faction: 'player', unitId: d.unitId, anchor });
    playSfx('land');
    const p = this.anchorPixel(anchor);
    this.fx.moss(p.x, p.y, speciesBodyRadius(this.unitSpecies(d.unitId)) + 10);
  }

  private commitHandDrag(x: number, y: number): void {
    const h = this.handDrag;
    this.handDrag = null;
    if (!h) return;
    const target = this.unitAtPixel(x, y);
    if (target < 0) {
      playSfx('reject');
      return;
    }
    this.push({ type: 'EquipBuff', faction: 'player', cardId: h.cardId, unitId: target });
    const p = this.unitPixelById(target);
    this.fx.petals(p.x, p.y, 3);
  }

  private onTap(x: number, y: number): void {
    const b = this.battle;
    if (!b) return;

    if (this.showWarbook) {
      this.showWarbook = false;
      return;
    }
    if (this.detailUnit >= 0) {
      this.gestureDetail(x, y);
      return;
    }

    const btn = this.hitButton(x, y);
    if (btn) {
      this.pressButton(btn);
      return;
    }

    const ent = entryAt(x, y);
    if (ent) {
      const list = entryUnits(b, ent.faction, this.enemyGhost);
      if (ent.index < list.length) {
        if (ent.faction === 'player') {
          this.detailUnit = list[ent.index];
          playSfx('tap');
        } else {
          this.showToast(entryTip(list[ent.index]), 1500);
        }
      }
      return;
    }

    if (b.phase === 'market') {
      const slot = shelfAt(x, y);
      if (slot >= 0) {
        const check = canBuy(b, 'player', slot, false);
        if (check.ok) {
          this.push(this.giftArmed ? { type: 'BuyGift', faction: 'player', slot } : { type: 'Buy', faction: 'player', slot });
          this.giftArmed = false;
          playSfx('cardPick');
        } else {
          this.rejectAt = this.time;
          this.rejectCard = slot;
          playSfx('reject');
          this.showToast(reasonText(check.reason), 1500);
        }
        return;
      }
      if (inRect(BOARD_RECT, x, y)) this.showToast('拖动物调整阵型，或点右下刷新', 1200);
      return;
    }

    if (b.phase === 'battle') {
      const own = this.unitAtPixelFaction(x, y, 'player');
      if (own >= 0) {
        this.selectedUnit = this.selectedUnit === own ? -1 : own;
        playSfx('tap');
        const u = unitById(b, own);
        if (u && u.commandReadyAt > b.time) {
          this.showToast('指挥冷却中 ' + Math.ceil((u.commandReadyAt - b.time) / 1000) + 's', 1200);
        }
        return;
      }
      if (this.selectedUnit >= 0) {
        const target = this.unitAtPixelFaction(x, y, 'enemy');
        if (target >= 0) {
          const p = this.unitPixelById(this.selectedUnit);
          const t = this.unitPixelById(target);
          const label = '集火';
          this.fx.bubble(p.x, p.y - 40, t.x, t.y - 20, label);
          this.push({ type: 'CommandAttack', faction: 'player', unitId: this.selectedUnit, targetId: target });
          this.selectedUnit = -1;
          playSfx('command');
          return;
        }
        this.selectedUnit = -1;
      }
      return;
    }

    if (b.phase === 'deploy') {
      const own = this.unitAtPixelFaction(x, y, 'player');
      if (own >= 0) {
        this.detailUnit = own;
        playSfx('tap');
      }
    }
  }

  private pressButton(id: string): void {
    const b = this.battle;
    if (!b) return;
    if (id === 'gear') {
      this.showSettings = true;
      playSfx('tap');
    } else if (id === 'scroll') {
      this.showWarbook = true;
      playSfx('tap');
    } else if (id === 'gift') {
      this.giftArmed = !this.giftArmed;
      playSfx('tap');
      this.showToast(this.giftArmed ? '已选择免费赠礼：点一张卡免费拿走' : '取消免费赠礼', 1600);
    } else if (id === 'refresh') {
      this.push({ type: 'Refresh', faction: 'player' });
      playSfx('refresh');
    } else if (id === 'ready') {
      this.push({ type: 'ConfirmDeploy', faction: 'player' });
      playSfx('tap');
    }
  }

  private gestureDetail(x: number, y: number): void {
    const b = this.battle;
    if (!b) return;
    for (let i = 0; i < 3; i++) {
      if (inRect(detailButtonRect(i), x, y)) {
        if (i === 0) {
          // 卸下最后一张加成牌（详情页里逐个图标也能卸）
          const u = unitById(b, this.detailUnit);
          if (u && u.buffs.length > 0) {
            this.push({ type: 'RemoveBuff', faction: 'player', unitId: u.id, buffIndex: u.buffs.length - 1 });
            playSfx('tap');
          } else {
            this.showToast('没有可卸下的加成', 1200);
          }
        } else if (i === 1) {
          const u = unitById(b, this.detailUnit);
          if (u) {
            if (u.anchor >= 0) this.showToast('场上单位请先收回替补席再卖出', 1500);
            else {
              this.push({ type: 'Sell', faction: 'player', unitId: u.id });
              playSfx('cardPick');
              this.detailUnit = -1;
            }
          }
        } else {
          this.detailUnit = -1;
          playSfx('tap');
        }
        return;
      }
    }
    this.detailUnit = -1;
  }

  private gestureSettings(x: number, y: number): void {
    const r = settingsRect();
    if (!inRect(r, x, y)) {
      this.showSettings = false;
      return;
    }
    // 三行开关 + 关闭
    const w = r.w - 80;
    const x0 = r.x + 40;
    for (let i = 0; i < 3; i++) {
      const y0 = r.y + 130 + i * 74;
      if (y >= y0 && y <= y0 + 56 && x >= x0 && x <= x0 + w) {
        playSfx('tap');
        if (i === 0) this.showToast('音效开关：设置页可切换（存档写入中）', 1400);
        if (i === 1) this.showToast('返回营地', 900);
        if (i === 2) {
          this.showSettings = false;
          return;
        }
      }
    }
    if (y > r.y + r.h - 70) this.showSettings = false;
  }

  private gestureResult(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      if (inRect(resultButtonRect(i), x, y)) {
        playSfx('tap');
        if (i === 0) pop();
        else if (i === 1) {
          const seed = (this.opts.seed === undefined ? Date.now() : this.opts.seed + 1) % 100000;
          this.opts = { seed, difficulty: this.opts.difficulty };
          this.resultApplied = false;
          this.reportPage = 0;
          this.enter();
        } else {
          this.showToast('分享战绩（真机环境会唤起微信转发）', 1600);
        }
        return;
      }
    }
    if (inRect(reportArrowRect(-1), x, y)) {
      this.reportPage = (this.reportPage + 2) % 3;
      playSfx('tap');
    } else if (inRect(reportArrowRect(1), x, y)) {
      this.reportPage = (this.reportPage + 1) % 3;
      playSfx('tap');
    } else if (this.reportPage === 0) {
      const seg = this.segmentAt(x, y);
      if (seg) {
        this.expandedSeg = this.expandedSeg === seg ? '' : seg;
        playSfx('tap');
      }
    } else if (this.reportPage === 2) {
      const idx = this.highlightAt(x, y);
      if (idx >= 0) {
        playSfx('tap');
        this.showToast('高光回放 ' + (idx + 1) + ' · 1.5s（用确定性 state + 命令流重演）', 1800);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 命中测试小工具                                                      */
  /* ------------------------------------------------------------------ */

  private unitSpecies(id: number): SpeciesId {
    const b = this.battle;
    if (!b) return 'mouse';
    const u = unitById(b, id);
    return u ? u.species : 'mouse';
  }

  private unitAtAnchor(faction: Faction, anchor: number): Unit | null {
    const b = this.battle;
    if (!b) return null;
    const units = side(b, faction).units;
    for (let i = 0; i < units.length; i++) {
      if (units[i].anchor === anchor && units[i].alive && !units[i].isDecoy) return units[i];
    }
    return null;
  }

  private unitAtPixel(x: number, y: number): number {
    const b = this.battle;
    if (!b) return -1;
    const a = this.unitAtPixelFaction(x, y, 'player');
    if (a >= 0) return a;
    return this.unitAtPixelFaction(x, y, 'enemy');
  }

  private unitAtPixelFaction(x: number, y: number, faction: Faction): number {
    const b = this.battle;
    if (!b) return -1;
    const visible = this.enemyVisible();
    if (faction === 'enemy' && !visible) return -1;
    const units = side(b, faction).units;
    let best = -1;
    let bestD = 1e9;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.anchor < 0 || u.isDecoy) continue;
      const p = this.unitPixel(u);
      const r = speciesBodyRadius(u.species) + 10;
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d <= r * r && d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    return best;
  }

  private unitPixel(u: Unit): { x: number; y: number } {
    const g = LAYOUT.GRID;
    const depthRow = (g.rows - 1 - (u.pos.y - 0.5)) / (g.rows - 1);
    const squash = 1 - LAYOUT.PERSPECTIVE * clamp(depthRow, 0, 1);
    return {
      x: g.originX + u.pos.x * g.cellW,
      y: g.originY + u.pos.y * g.cellH * squash + (1 - squash) * 40
    };
  }

  private unitPixelById(id: number): { x: number; y: number } {
    const b = this.battle;
    if (!b) return { x: -999, y: -999 };
    const u = unitById(b, id);
    return u ? this.unitPixel(u) : { x: -999, y: -999 };
  }

  private anchorPixel(anchor: number): { x: number; y: number } {
    const cr = anchorColRow(anchor);
    if (cr.col < 0) return { x: -999, y: -999 };
    return anchorToPixel(cr.col, cr.row);
  }

  private enemyVisible(): boolean {
    const b = this.battle;
    if (!b) return false;
    return b.phase === 'observe' || b.phase === 'battle' || b.phase === 'settle' || b.phase === 'result';
  }

  private ghostFromLastRound(): SideEntryView[] | null {
    const b = this.battle;
    if (!b || b.log.length === 0) return null;
    const last = b.log[b.log.length - 1];
    const out: SideEntryView[] = [];
    for (let i = 0; i < last.enemyUnits.length && i < 6; i++) {
      const lu = last.enemyUnits[i];
      out.push({
        species: lu.species, level: lu.level, hp: lu.hpMax, maxHp: lu.hpMax,
        statuses: [], empty: false, ghost: true
      });
    }
    return out;
  }

  private segmentAt(x: number, y: number): string | null {
    const pages = this.buildReport();
    const segs = pages[0].segments || [];
    const r = DAMAGE_STACK;
    if (!inRect(r, x, y)) return null;
    let cx = r.x + 8;
    for (let i = 0; i < segs.length; i++) {
      const w = 60;
      if (x >= cx && x <= cx + w) return segs[i].key;
      cx += w + 6;
    }
    return null;
  }

  private highlightAt(x: number, y: number): number {
    const pages = this.buildReport();
    const items = pages[2].highlights || [];
    const r = { x: 380, y: 300, w: 520, h: 150 };
    if (!inRect(r, x, y)) return -1;
    const w = Math.min(160, r.w / Math.max(1, items.length));
    const idx = Math.floor((x - r.x) / (w + 12));
    return idx >= 0 && idx < items.length ? idx : -1;
  }

  /* ------------------------------------------------------------------ */
  /* 渲染                                                                */
  /* ------------------------------------------------------------------ */

  render(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    const w = LAYOUT.SCREEN_W;
    const h = LAYOUT.SCREEN_H;
    if (!b) return;

    const shake = this.fx.shakeOffset(renderTime);
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // 布阵阶段用带晨雾的底板（雾已烘在图里，敌半场不可见）；集市阶段用集市底板；结算用结算底板；其余用干净战场底板。
    const marketPlate = b.phase === 'market' ? getImage('ui-market') : null;
    const resultPlate = b.phase === 'result' ? getImage('ui-result-victory') : null;
    const plate = (b.phase === 'deploy' ? getImage('ui-deploy-fog') : null) || marketPlate || resultPlate || getImage('bg-board-plain');
    if (plate) {
      drawPlateCover(ctx, plate, 0, 0, w, h);
      // 结算底板只有胜利版一张（男孩举奖杯的庆祝插画）：败 / 平时压一层冷色水彩罩，
      // 让画面读起来是「惜败」而不是「夺冠」；我们自己的 HUD 随后画在罩子之上，不受影响。
      if (resultPlate && b.outcome !== 'win') {
        const veil = b.outcome === 'draw' ? 0.26 : 0.4;
        fillWatercolor(
          ctx,
          sceneCorners(),
          PALETTE.forestDeep,
          { alpha: veil, layers: 1, wetEdge: false, seedIndex: 41 },
        );
      }
    } else {
      // 自适应全屏：程序化底板也要铺满逻辑可视区
      const box = sceneBox();
      ctx.save();
      ctx.translate(box.x, box.y);
      drawSky(ctx, box.w, box.h, renderTime);
      drawForestLayer(ctx, box.w, box.h, 0, 'far', renderTime);
      drawForestLayer(ctx, box.w, box.h, 0, 'mid', renderTime);
      ctx.restore();
      drawBoard(ctx, renderTime, { fog: b.phase === 'deploy' || b.phase === 'market' ? 1 : 0.3 });
      ctx.save();
      ctx.translate(box.x, box.y);
      drawForestLayer(ctx, box.w, box.h, 0, 'near', renderTime);
      ctx.restore();
    }
    // 统一色grading：一层薄薄的深绿 + 顶部暖光，抵消水彩层的低饱和（不覆盖单位）
    if (!plate) {
      fillWatercolor(
        ctx,
        sceneCorners(),
        PALETTE.leafMid,
        { alpha: 0.11, layers: 1, wetEdge: false, seedIndex: 8 },
      );
      fillWatercolor(
        ctx,
        [
          { x: -20, y: -10 },
          { x: w + 20, y: -10 },
          { x: w + 20, y: h * 0.34 },
          { x: -20, y: h * 0.34 },
        ],
        PALETTE.sunbeam,
        { alpha: 0.07, layers: 1, wetEdge: false, seedIndex: 9 },
      );
    }

    this.fx.draw(ctx, renderTime, 'back');
    if (!resultPlate) {
      if (!marketPlate) this.drawCoaches(ctx, renderTime);
      this.drawField(ctx, renderTime);
      this.fx.draw(ctx, renderTime, 'front');
      this.drawForeground(ctx, renderTime, w);
      drawSunSpecks(ctx, w, h, renderTime, b.phase === 'battle' ? 1.4 : 1);
      if (b.weather.player.active !== 'none') {
        drawWeather(ctx, w, h, b.weather.player.active, renderTime, b.phase === 'battle' ? 1 : 0.7);
      }
    }
    {
      const vbox = sceneBox();
      ctx.save();
      ctx.translate(vbox.x, vbox.y);
      drawVignette(ctx, vbox.w, vbox.h);
      ctx.restore();
    }
    ctx.restore();

    const overlay = !!(marketPlate || resultPlate);
    if (!overlay) {
      this.drawSidebars(ctx, renderTime);
      this.drawBench(ctx, renderTime);
    }
    if (b.phase === 'market') this.drawShelf(ctx, renderTime);
    if (!resultPlate) {
      this.drawHand(ctx, renderTime);
      this.drawBanner(ctx, renderTime);
    }
    if (marketPlate) {
      // 集市底板已烘死齿轮、阳光币条、圆牌与本轮赠礼牌：用程序化件按原坐标盖住并接管数值。
      const sr = MARKET.sunRect;
      drawWoodPanel(ctx, sr.x, sr.y, sr.w, sr.h, { tone: 'bark', radius: LAYOUT.PANEL_RADIUS });
      drawSunCoin(ctx, sr.x + 14, sr.y + 12, 60, b.player.sunlight, renderTime);
      drawGear(ctx, MARKET.gear.x, MARKET.gear.y, MARKET.gear.size, this.pressed === 'gear');
    } else if (!resultPlate) {
      // 小屋血量牌放在 HUD 层绘制：场景层内部有未回收的画布变换，会把文字画倒。
      drawHouseHp(ctx, houseRect().x, houseRect().y, houseRect().w, houseRect().h, b.player.houseHp, b.player.houseHpMax);
    }
    this.drawDragLayer(ctx, renderTime);
    this.drawPanels(ctx, renderTime);
    this.drawToastLayer(ctx);
  }

  private drawCoaches(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    const coachState = b.phase === 'battle' ? 'idle' : b.phase === 'settle' ? 'proud' : 'idle';
    const cr = coachRect();
    drawCoachAvatar(ctx, cr.x, cr.y, cr.w, coachState, renderTime);
    const callout: { x: number; y: number } = { x: BOARD_RECT.x + 96, y: 596 };
    drawCoach(ctx, callout.x, callout.y, coachState, renderTime);

    const ir = impRect();
    const impState = b.phase === 'battle' ? 'idle' : b.phase === 'settle' ? 'hurt' : 'idle';
    drawImp(ctx, ir.x + ir.w / 2, ir.y + ir.h, impState, renderTime);
  }

  private drawField(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    const visible = this.enemyVisible();
    const list: Unit[] = [];
    const pu = fieldUnits(b, 'player');
    for (let i = 0; i < pu.length; i++) list.push(pu[i]);
    if (visible) {
      const eu = fieldUnits(b, 'enemy');
      for (let i = 0; i < eu.length; i++) list.push(eu[i]);
    }
    list.sort((a, c) => a.pos.y - c.pos.y);

    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u.alive) continue;
      if (this.drag && this.drag.unitId === u.id) continue;
      const p = this.unitPixel(u);
      const isSelected = this.selectedUnit === u.id;
      const dim = this.selectedUnit >= 0 && !isSelected && u.owner === 'player';
      const view: UnitView = {
        id: u.id, species: u.species, level: u.level, hp: u.hp, maxHp: u.maxHp,
        shield: u.shield, alive: u.alive,
        fx: {
          hitFlash: u.fx.hitFlash, attackPulse: u.fx.attackPulse, deathFirefly: u.fx.deathFirefly,
          counterHit: u.fx.counterHit, shieldRipple: u.fx.shieldRipple, hitDir: u.fx.hitDir
        }
      };
      drawUnit(ctx, view, {
        x: p.x, y: p.y, time: renderTime, facing: u.facing, showRing: true,
        selected: isSelected, dim,
        statuses: statusTags(u),
        commandTarget: u.forcedTargetId >= 0 || (this.selectedUnit >= 0 && this.selectedUnit === u.id)
      });
      // 核心写的一次性演出标记：渲染消费后清零（render 只读 state，但清标记是约定）
      u.fx.hitFlash = 0;
      u.fx.counterHit = 0;
      u.fx.shieldRipple = 0;
      u.fx.attackPulse = 0;
    }

    // 集火目标：血量环外 berry 断续虚线环
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u.alive || u.forcedTargetId < 0) continue;
      const t = unitById(b, u.forcedTargetId);
      if (!t || !t.alive) continue;
      const p = this.unitPixel(t);
      const r = speciesBodyRadius(t.species) + LAYOUT.RING.gap + 5;
      drawHpRing(ctx, p.x, p.y, r, t.hp / Math.max(1, t.maxHp), {
        time: renderTime, commandTarget: true, width: 3, notch: false, alpha: 0.9
      });
    }
  }

  private drawForeground(ctx: CanvasRenderingContext2D, renderTime: number, w: number): void {
    const y = LAYOUT.BOARD.y + LAYOUT.BOARD.h - 12;
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const x = LAYOUT.BOARD.x + (i / 25) * LAYOUT.BOARD.w;
      drawGrassTuft(ctx, x, y + ((i % 3) - 1) * 4, 16 + (i % 5) * 3, renderTime, i);
    }
    ctx.restore();
    void w;
  }

  private drawSidebars(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    const gearPressed = this.pressed === 'gear';
    const gr = gearRect();
    drawGear(ctx, gr.x, gr.y, gr.w, gearPressed);
    const sr = scrollRect();
    drawScrollButton(ctx, sr.x, sr.y, sr.w, this.pressed === 'scroll', renderTime);

    // 两侧木质挂条（对齐参考图：条目坐在木条上，而不是浮在森林里）
    const pl = entryPanelRect('player');
    const pe = entryPanelRect('enemy');
    drawWoodPanel(ctx, pl.x, pl.y, pl.w, pl.h, { tone: 'bark', radius: 18, alpha: 0.9, seedIndex: 501 });
    drawWoodPanel(ctx, pe.x, pe.y, pe.w, pe.h, { tone: 'bark', radius: 18, alpha: 0.9, seedIndex: 502 });

    const myEntries = entryViews(b, 'player', false);
    for (let i = 0; i < 6; i++) {
      const r: Rect = entryRect('player', i);
      const e = i < myEntries.length ? myEntries[i] : emptyEntry();
      drawSideEntry(ctx, r.x, r.y, r.w, r.h, e, { faction: 'player', time: renderTime, index: i });
    }

    const enemyEntries = entryViews(b, 'enemy', !this.enemyVisible(), this.enemyGhost);
    for (let i = 0; i < 6; i++) {
      const r: Rect = entryRect('enemy', i);
      const e = i < enemyEntries.length ? enemyEntries[i] : emptyEntry();
      drawSideEntry(ctx, r.x, r.y, r.w, r.h, e, { faction: 'enemy', time: renderTime, index: i });
    }

    const sc = sunCoinRect();
    drawSunCoin(ctx, sc.x, sc.y, sc.w, b.player.sunlight, renderTime);
    setFont(ctx, LAYOUT.FONT.coin, 'bold');
    ctx.fillStyle = PALETTE.creamMist;
    ctx.textAlign = 'left';
    ctx.fillText('' + b.player.sunlight, sc.x - 44, sc.y + 38);

    // 本回合天气（小溪上空两枚图标碰撞的静态版：显示已生效结果）
    if (b.weatherText) {
      setFont(ctx, LAYOUT.FONT.entry, 'normal');
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(PALETTE.creamMist, 0.9);
      ctx.fillText(b.weatherText, LAYOUT.SCREEN_W / 2, 96);
    }
  }

  private drawBench(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    const narrow = b.phase === 'battle' || b.phase === 'observe' || b.phase === 'settle';
    const r0 = benchRect(0, narrow);
    const total = LAYOUT.BENCH.slots * LAYOUT.BENCH.cell + (LAYOUT.BENCH.slots - 1) * LAYOUT.BENCH.gap;
    // 替补席木质底板
    drawWoodPanel(ctx, r0.x - 12, r0.y - 10, total + 24, r0.h + 20, {
      tone: 'bark', radius: 16, alpha: 0.92, seedIndex: 503
    });
    const slots: (CardView | null)[] = [];
    for (let i = 0; i < LAYOUT.BENCH.slots; i++) {
      const u = b.player.bench[i];
      slots.push(u ? unitCardView(u) : null);
    }
    drawBench(ctx, r0.x, r0.y, total, r0.h, slots, {
      time: renderTime, narrow,
      dragHoverIndex: this.drag && this.drag.overBench >= 0 ? this.drag.overBench : -1
    });
  }

  private drawHand(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    for (let i = 0; i < b.player.hand.length && i < 5; i++) {
      const c = b.player.hand[i];
      if (this.handDrag && this.handDrag.cardId === c.id) continue;
      const r = handRect(i);
      drawCard(ctx, cardViewFromInstance(c), r.x, r.y, { time: renderTime, scale: r.w / LAYOUT.CARD.w });
    }
  }

  private drawShelf(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    // 每格一块与底板同色的木底，盖掉烘死的样例卡；空位内嵌浅色纸面
    for (let i = 0; i < 5; i++) {
      const r = shelfRect(i);
      drawWoodPanel(ctx, r.x, r.y, r.w, r.h, { tone: 'bark', radius: 20 });
      const slot = b.shelf[i];
      if (!slot || !slot.card || slot.taken) {
        strokeInk(ctx, roundedRectPoints(r.x + 20, r.y + 20, r.w - 40, r.h - 40, 14), {
          width: 2, close: true, color: rgba(PALETTE.inkSoft, 0.22), seedIndex: 700 + i, jitter: 1.6
        });
        setFont(ctx, 22, 'normal');
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba(PALETTE.inkSoft, 0.42);
        ctx.fillText('空摊位', r.x + r.w / 2, r.y + r.h / 2 + 8);
        continue;
      }
      const check = canBuy(b, 'player', i, false);
      const cw = r.w - 10;
      const ch = cw * (LAYOUT.CARD.h / LAYOUT.CARD.w);
      drawCard(ctx, cardViewFromInstance(slot.card), r.x + 5, r.y + (r.h - ch) / 2, {
        time: renderTime, affordable: check.ok, scale: cw / LAYOUT.CARD.w,
        pressed: this.rejectCard === i && this.time - this.rejectAt < 400
      });
    }

    // 刷新圆牌（底板上烘死的绿圆牌先被一块木底盖住）
    const rr = refreshRect();
    const pad = 12;
    drawWoodPanel(ctx, rr.x - pad, rr.y - pad, rr.w + pad * 2, rr.h + pad * 2, {
      tone: 'bark', radius: (rr.w + pad * 2) / 2
    });
    drawWoodSignCircle(ctx, rr.x, rr.y, rr.w, '刷新 · ' + refreshCost(b), b.refreshUsed >= ECONOMY.REFRESH_LIMIT, renderTime);
    // 免费赠礼（对齐底板烘死的双行木牌）
    const gr = giftRect();
    ctx.save();
    if (this.giftArmed) ctx.translate(0, 3);
    drawWoodPanel(ctx, gr.x, gr.y, gr.w, gr.h, { tone: 'bark', radius: LAYOUT.BUTTON_RADIUS });
    if (b.giftUsed) {
      textOutlined(ctx, '本回合已领', gr.x + gr.w / 2, gr.y + gr.h * 0.57, 20,
        rgba(PALETTE.inkSoft, 0.6), 'center', 1.6);
    } else {
      textOutlined(ctx, '本轮免费赠礼', gr.x + gr.w / 2, gr.y + 32, 19, PALETTE.inkSoft, 'center', 1.8);
      textOutlined(ctx, '1 张', gr.x + gr.w / 2, gr.y + 68, 26, PALETTE.forestDeep, 'center', 2);
    }
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    const r = b.phase === 'market' ? MARKET.banner : BANNER_RECT;
    const phaseName = phaseText(b.phase);
    const secs = Math.max(0, Math.ceil(b.phaseLeft / 1000));
    drawWoodPanel(ctx, r.x, r.y, r.w, r.h, { tone: 'bark', radius: LAYOUT.PANEL_RADIUS });
    const title = '第 ' + b.round + ' 回合 · ' + phaseName;
    textOutlined(ctx, title, r.x + r.w / 2, r.y + r.h * 0.5 + 10,
      fitSize(ctx, title, r.w - 44, LAYOUT.FONT.h2, 20), PALETTE.inkSoft, 'center');
    if (b.phase === 'deploy' || b.phase === 'observe' || b.phase === 'battle' || b.phase === 'market') {
      drawDeployTimer(ctx, r.x + r.w / 2, r.y + r.h + 6, 1 - b.phaseLeft / phaseTotal(b.phase), secs, renderTime);
    }
    if (b.phase === 'deploy' || b.phase === 'market') {
      const rr = b.phase === 'market' ? MARKET.ready : readyRect();
      drawButton(ctx, rr.x, rr.y, rr.w, rr.h, b.phase === 'deploy' ? '准备就绪' : '结束集市', {
        state: 'normal', time: renderTime, radius: LAYOUT.BUTTON_RADIUS
      });
    }
    if (b.phase === 'deploy') {
      setFont(ctx, LAYOUT.FONT.entry, 'normal');
      ctx.fillStyle = rgba(PALETTE.creamMist, 0.85);
      ctx.textAlign = 'center';
      ctx.fillText('出战上限 ' + deployCap(b, 'player') + ' · 长按拖动 · 落点苔藓光斑为合法位置', LAYOUT.SCREEN_W / 2, r.y + r.h + 44);
    }
  }

  private drawDragLayer(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    const d = this.drag;
    if (d) {
      if (d.hover >= 0) {
        const p = this.anchorPixel(d.hover);
        const r = speciesBodyRadius(this.unitSpecies(d.unitId)) + 12;
        drawMossPatch(ctx, p.x, p.y, d.valid ? r : r * 0.7, renderTime, d.valid ? 1 : 0.35);
      }
      const u = unitById(b, d.unitId);
      if (u) {
        drawUnit(ctx, unitViewOf(u), {
          x: d.x, y: d.y, time: renderTime, scale: 1.12, facing: u.facing,
          showRing: false, dragging: true, showShadow: true
        });
        if (d.hover >= 0) {
          const gp = this.anchorPixel(d.hover);
          drawHpRing(ctx, gp.x, gp.y, speciesBodyRadius(u.species) + LAYOUT.RING.gap, 0.7, {
            time: renderTime, alpha: 0.35, width: 3
          });
        }
      }
      return;
    }
    const hd = this.handDrag;
    if (hd) {
      const c = handCardById(b, hd.cardId);
      if (c) drawCard(ctx, cardViewFromInstance(c), hd.x - 60, hd.y - 80, { time: renderTime, drag: true, alpha: 0.92, scale: 1.25 });
      if (hd.hoverUnit >= 0) {
        const p = this.unitPixelById(hd.hoverUnit);
        drawHpRing(ctx, p.x, p.y, speciesBodyRadius(this.unitSpecies(hd.hoverUnit)) + LAYOUT.RING.gap + 4, 1, {
          time: renderTime, width: 4, alpha: 0.85
        });
      }
    }
  }

  private drawPanels(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;

    if (this.showWarbook) {
      const r = warbookRect();
      drawWoodPanel(ctx, r.x, r.y, r.w, r.h, { tone: 'bark', radius: LAYOUT.PANEL_RADIUS });
      drawScoreboardPanel(ctx, r.x + 16, r.y + 16, r.w - 32, r.h - 32, roundLogViews(b), renderTime);
      return;
    }

    if (this.detailUnit >= 0) {
      const u = unitById(b, this.detailUnit);
      if (u) this.drawDetail(ctx, u, renderTime);
      return;
    }

    if (this.showSettings) {
      const r = settingsRect();
      drawWoodPanel(ctx, r.x, r.y, r.w, r.h, { tone: 'bark', radius: LAYOUT.PANEL_RADIUS });
      textOutlined(ctx, '设置', r.x + r.w / 2, r.y + 54, LAYOUT.FONT.h2, PALETTE.creamMist, 'center');
      const labels = ['音效 / 音乐', '投降 · 重开本局', '返回营地'];
      for (let i = 0; i < 3; i++) {
        drawButton(ctx, r.x + 40, r.y + 130 + i * 74, r.w - 80, 56, labels[i], {
          time: renderTime, radius: LAYOUT.BUTTON_RADIUS
        });
      }
      setFont(ctx, LAYOUT.FONT.badge, 'normal');
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(PALETTE.creamMist, 0.75);
      ctx.fillText('点面板外任意处关闭', r.x + r.w / 2, r.y + r.h - 24);
      return;
    }

    if (b.phase === 'result') this.drawResult(ctx, renderTime);
  }

  private drawDetail(ctx: CanvasRenderingContext2D, u: Unit, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    const r = detailRect();
    drawWoodPanel(ctx, r.x, r.y, r.w, r.h, { tone: 'paper', radius: LAYOUT.PANEL_RADIUS });
    const sp = SPECIES[u.species];
    drawUnit(ctx, unitViewOf(u), {
      x: r.x + 120, y: r.y + 230, time: renderTime, scale: 1.9, showRing: false, showShadow: true
    });
    textOutlined(ctx, sp.cn + ' Lv.' + u.level, r.x + 250, r.y + 70, LAYOUT.FONT.h2, PALETTE.inkSoft, 'left');
    setFont(ctx, LAYOUT.FONT.body, 'normal');
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.textAlign = 'left';

    // 矩形血条是允许的两处例外之一（详情页）
    const bx = r.x + 240;
    const by = r.y + 96;
    const bw = 240;
    const bh = 22;
    drawWoodPanel(ctx, bx - 3, by - 3, bw + 6, bh + 6, { tone: 'soil', radius: 8 });
    const ratio = u.hp / Math.max(1, u.maxHp);
    ctx.fillStyle = ratio > 0.6 ? PALETTE.leafLight : ratio > 0.3 ? PALETTE.sunset : PALETTE.berry;
    ctx.fillRect(bx, by, Math.round(bw * ratio), bh);
    setFont(ctx, LAYOUT.FONT.entry, 'bold');
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('HP ' + Math.ceil(u.hp) + ' / ' + Math.round(u.maxHp), bx + bw + 14, by + 18);

    setFont(ctx, LAYOUT.FONT.entry, 'normal');
    ctx.fillStyle = PALETTE.inkSoft;
    const lines = [
      '攻击 ' + Math.round(u.atk) + '（' + (u.atkInterval / 1000).toFixed(2) + 's）',
      '移速 ' + u.moveSpeed.toFixed(2) + ' · 出场 ' + u.roundsPlayed + ' 回合',
      '特技：' + sp.traitName + ' —— ' + sp.traitDesc
    ];
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(fit(ctx, lines[i], r.w - 60), r.x + 240, r.y + 150 + i * 30);
    }

    setFont(ctx, LAYOUT.FONT.entry, 'bold');
    ctx.fillStyle = PALETTE.forestMid;
    ctx.fillText('加成牌（最多 2）', r.x + 30, r.y + 320);
    for (let i = 0; i < 2; i++) {
      const bid = i < u.buffs.length ? u.buffs[i] : null;
      const label = bid ? buffDef(bid).cn : '空';
      ctx.fillStyle = bid ? PALETTE.leafMid : rgba(PALETTE.bark, 0.35);
      ctx.fillRect(r.x + 30, r.y + 336 + i * 40, 300, 32);
      setFont(ctx, LAYOUT.FONT.entry, 'normal');
      ctx.fillStyle = bid ? PALETTE.creamMist : PALETTE.inkSoft;
      ctx.fillText(label + (bid && i === u.buffs.length - 1 ? '（点「卸下」移除）' : ''), r.x + 42, r.y + 358 + i * 40);
    }
    setFont(ctx, LAYOUT.FONT.entry, 'normal');
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('卖出可得 ' + sellValue(u.invested) + ' ☀', r.x + 30, r.y + 470);

    const onlyRead = b.phase === 'battle' || b.phase === 'observe';
    const labels = ['卸下加成', '卖出 +' + sellValue(u.invested) + '☀', '关闭'];
    for (let i = 0; i < 3; i++) {
      const br = detailButtonRect(i);
      const disabled = onlyRead && i < 2;
      drawButton(ctx, br.x, br.y, br.w, br.h, labels[i], {
        state: disabled ? 'disabled' : 'normal', time: renderTime, radius: LAYOUT.BUTTON_RADIUS
      });
    }
  }

  private resultPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string): void {
    // 底板在同位置烘死了同名标题，水彩填充自带 0.97 透明度会让它轻微透出形成重影；
    // 先铺一层完全不透明的木色底把烘死内容压死，再画木框/纸面。
    const r = Math.max(8, Math.min(22, Math.min(w, h) / 2));
    fillWatercolor(ctx, roundedRectPoints(x, y, w, h, r), PALETTE.barkLight, {
      alpha: 1, layers: 1, wetEdge: false, seedIndex: 9001,
    });
    drawWoodPanel(ctx, x, y, w, h, { tone: 'bark', radius: 22 });
    drawWoodPanel(ctx, x + 14, y + 48, w - 28, h - 62, { tone: 'paper', radius: 14 });
    // 标题按目标图用深棕字（奶油描边垫底），浅色字在木底上对比不足会发糊。
    textOutlined(ctx, title, x + w / 2, y + 34, LAYOUT.FONT.h2, PALETTE.inkSoft, 'center', 0);
  }

  private drawResult(ctx: CanvasRenderingContext2D, renderTime: number): void {
    const b = this.battle;
    if (!b) return;
    const pages = this.buildReport();
    const outcome = b.outcome || 'draw';
    // 结算底板（ui-result-victory）已烘死横幅/副标题/三块面板/三张木牌按钮：逐项按原坐标盖住并接管。
    drawResultBanner(ctx, LAYOUT.SCREEN_W / 2 - 300, 20, 600, 96, outcome, renderTime);
    drawWoodPanel(ctx, 430, 138, 420, 52, { tone: 'paper', radius: 16 });
    setFont(ctx, LAYOUT.FONT.body, 'normal');
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('小屋 HP ' + b.player.houseHp + ' vs ' + b.enemy.houseHp + ' · 共 ' + b.round + ' 回合', LAYOUT.SCREEN_W / 2, 172);

    // 面板一：伤害构成 / 高光（两页）
    const p1: ReportPage = this.reportPage === 0 ? pages[0] : pages[2];
    this.resultPanel(ctx, 335, 228, 430, 372, p1.title);
    if (p1.kind === 'damage' && p1.segments) {
      drawDamageStack(ctx, DAMAGE_STACK.x, DAMAGE_STACK.y, DAMAGE_STACK.w, DAMAGE_STACK.h, p1.segments, renderTime, this.expandedSeg);
    } else if (p1.kind === 'highlight' && p1.highlights) {
      drawHighlightStrip(ctx, 355, 300, 390, 240, p1.highlights, renderTime);
    }
    drawPageDots(ctx, 550, 578, 2, this.reportPage, renderTime);

    // 面板二：MVP
    this.resultPanel(ctx, 775, 228, 240, 372, 'MVP');
    const mvp = pages[1].mvp;
    if (mvp) {
      // MVP 立绘直接用美术抠图（assets/pets/<species>.png，320x320 透明底），
      // 与卡面/棋盘同一套形象；缺图时才回落到程序化几何。
      const pet = getImage('unit-' + mvp.species);
      ctx.save();
      if (pet) {
        ctx.drawImage(pet, 895 - 72, 356 - 74, 144, 144);
      } else {
        drawSpeciesCreature(ctx, mvp.species, mvp.level, 895, 420, 48, renderTime, { seedIndex: 4101 });
      }
      ctx.restore();
      const rows: { k: string; v: string }[] = [
        { k: '总伤害', v: '' + Math.round(mvp.damage) },
        { k: '承伤', v: '' + Math.round(mvp.taken) },
        { k: '击杀', v: '' + mvp.kills },
      ];
      for (let i = 0; i < rows.length; i++) {
        const ry = 450 + i * 34;
        setFont(ctx, LAYOUT.FONT.entry, 'normal');
        ctx.textAlign = 'left';
        ctx.fillStyle = rgba(PALETTE.inkSoft, 0.82);
        ctx.fillText(rows[i].k, 795, ry);
        textOutlined(ctx, rows[i].v, 1000, ry, LAYOUT.FONT.entry, PALETTE.inkSoft, 'right', 0);
      }
    } else {
      setFont(ctx, LAYOUT.FONT.entry, 'normal');
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(PALETTE.inkSoft, 0.7);
      ctx.fillText('本局无出战单位', 895, 400);
    }

    // 面板三：本局奖励 + 阳光账本
    this.resultPanel(ctx, 1025, 228, 220, 372, '本局奖励');
    this.rewardProgress = Math.min(1, this.rewardProgress + 0.02);
    drawRewardRow(ctx, 1035, 292, 200, 108, rewardViews(this.coinGain, this.starGain), this.rewardProgress, renderTime);
    const ledger = ledgerRows(b);
    for (let i = 0; i < ledger.length; i++) {
      const ry = 432 + i * 32;
      setFont(ctx, LAYOUT.FONT.badge, 'normal');
      ctx.textAlign = 'left';
      ctx.fillStyle = rgba(PALETTE.inkSoft, 0.8);
      ctx.fillText(ledger[i].label, 1043, ry);
      textOutlined(ctx, '' + ledger[i].value, 1235, ry, LAYOUT.FONT.badge, PALETTE.inkSoft, 'right', 0);
    }

    // 底部三张木牌（坐标与底板烘死的木牌一致）
    const labels = ['返回营地', '再来一局', '分享战绩'];
    for (let i = 0; i < 3; i++) {
      const r = resultButtonRect(i);
      drawButton(ctx, r.x, r.y, r.w, r.h, labels[i], {
        time: renderTime, radius: LAYOUT.BUTTON_RADIUS, tone: i === 1 ? 'leaf' : 'bark'
      });
    }
    drawIconButton(ctx, reportArrowRect(-1).x, reportArrowRect(-1).y, 30, 'back', false, renderTime);
    drawIconButton(ctx, reportArrowRect(1).x, reportArrowRect(1).y, 30, 'back', false, renderTime);
  }

  private drawToastLayer(ctx: CanvasRenderingContext2D): void {
    if (this.time < this.toastUntil && this.toast) {
      drawToast(ctx, LAYOUT.SCREEN_W / 2, 138, this.toast, 0.95);
    }
    if (this.rejectCard >= 0 && this.time - this.rejectAt < 500) {
      const r = shelfRect(this.rejectCard);
      drawTipBubble(ctx, r.x + r.w / 2, r.y - 20, 180, 44, '阳光不足', this.time, r.x + r.w / 2);
    }
  }

  private buildReport(): ReportPage[] {
    const b = this.battle;
    const empty: ReportPage = { kind: 'damage', title: '伤害构成' };
    if (!b) return [empty, { kind: 'mvp', title: 'MVP' }, { kind: 'highlight', title: '高光时刻' }];

    const bySource = { basic: 0, trait: 0, counter: 0, weather: 0, buff: 0 };
    let mvp: Unit | null = null;
    const mineUnits = side(b, 'player').units;
    const mineBench = side(b, 'player').bench;
    const all: Unit[] = [];
    for (let i = 0; i < mineUnits.length; i++) all.push(mineUnits[i]);
    // 未出战的单位停在替补席上，战绩同样要计入结算。
    for (let i = 0; i < mineBench.length; i++) {
      const u = mineBench[i];
      if (u) all.push(u);
    }
    for (let i = 0; i < all.length; i++) {
      const s = all[i].stat.bySource;
      bySource.basic += s.basic;
      bySource.trait += s.trait;
      bySource.counter += s.counter;
      bySource.weather += s.weather;
      bySource.buff += s.buff;
      if (!mvp || all[i].stat.damageDealt > mvp.stat.damageDealt) mvp = all[i];
    }
    // 玩家全场没打出战绩（例如全程未出战）时，退回用敌方表现最好的单位充当 MVP，
    // 否则 MVP 面板会整块空白。
    if (!mvp || mvp.stat.damageDealt <= 0) {
      const foe = side(b, 'enemy').units;
      for (let i = 0; i < foe.length; i++) {
        if (!mvp || foe[i].stat.damageDealt > mvp.stat.damageDealt) mvp = foe[i];
      }
    }
    const segments: DamageSegment[] = [
      { key: 'basic', label: '普攻', value: bySource.basic },
      { key: 'trait', label: '特性', value: bySource.trait },
      { key: 'counter', label: '克制', value: bySource.counter },
      { key: 'weather', label: '天气', value: bySource.weather },
      { key: 'buff', label: '加成', value: bySource.buff }
    ];
    const mvpView: MvpView | undefined = mvp
      ? {
          species: mvp.species, level: mvp.level, name: SPECIES[mvp.species].cn,
          damage: Math.round(mvp.stat.damageDealt), taken: Math.round(mvp.stat.damageTaken),
          kills: mvp.stat.kills, aliveSec: Math.round(mvp.stat.aliveMs / 1000), rounds: mvp.roundsPlayed
        }
      : undefined;

    const highlights: HighlightView[] = [];
    for (let i = 0; i < b.highlights.length && i < 3; i++) {
      const hs = b.highlights[i];
      const sp = hs.units.length > 0 ? hs.units[0].species : ('tiger' as SpeciesId);
      highlights.push({ label: hs.label, round: hs.round, species: sp, value: 0, time: hs.at });
    }
    if (highlights.length === 0) {
      highlights.push({ label: '第 ' + b.round + ' 回合 · 关键胜负手', round: b.round, species: 'tiger', value: 0 });
    }

    return [
      { kind: 'damage', title: '伤害构成', segments },
      { kind: 'mvp', title: 'MVP', mvp: mvpView },
      { kind: 'highlight', title: '高光时刻', highlights }
    ];
  }
}

/* ------------------------------------------------------------------ */
/* 小组件与转换函数                                                    */
/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function pushUnique(arr: string[], v: string): void {
  for (let i = 0; i < arr.length; i++) if (arr[i] === v) return;
  arr.push(v);
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  let t = text;
  while (t.length > 4 && ctx.measureText(t).width > max) t = t.substring(0, t.length - 2) + '…';
  return t;
}

function unitViewOf(u: Unit): UnitView {
  return {
    id: u.id, species: u.species, level: u.level, hp: u.hp, maxHp: u.maxHp,
    shield: u.shield, alive: u.alive,
    fx: {
      hitFlash: u.fx.hitFlash, attackPulse: u.fx.attackPulse, deathFirefly: u.fx.deathFirefly,
      counterHit: u.fx.counterHit, shieldRipple: u.fx.shieldRipple, hitDir: u.fx.hitDir
    }
  };
}

function statusTags(u: Unit): string[] {
  const out: string[] = [];
  if (u.shield > 0) out.push('shield');
  if (u.status.bleedStacks > 0) out.push('bleed');
  if (u.status.slowAtkUntil > 0) out.push('slow');
  if (u.status.guardUntil > 0) out.push('guard');
  if (u.status.tauntUntil > 0) out.push('taunt');
  if (u.status.regenUntil > 0) out.push('regen');
  if (u.isDecoy) out.push('decoy');
  return out;
}

function unitCardView(u: Unit): CardView {
  const sp = SPECIES[u.species];
  return {
    kind: 'animal', cn: sp.cn, cost: sp.cost, species: u.species, level: u.level,
    quality: u.level, atk: Math.round(u.atk), atkInterval: u.atkInterval / 1000,
    hp: Math.round(u.maxHp), traitName: sp.traitName, traitDesc: sp.traitDesc
  };
}

function cardViewFromInstance(c: CardInstance): CardView {
  if (c.kind === 'animal') {
    const sp = SPECIES[c.species as SpeciesId];
    return {
      kind: 'animal', cn: sp.cn, cost: sp.cost, species: sp.id, quality: 1,
      atk: sp.atk, atkInterval: sp.atkInterval, hp: sp.hp, traitName: sp.traitName, traitDesc: sp.traitDesc
    };
  }
  if (c.kind === 'weather') {
    const wid = (c.weather || 'sunny') as WeatherId;
    const wd = weatherDef(wid);
    if (!wd) return { kind: 'weather', cn: '天气', cost: 0, weather: wid };
    return { kind: 'weather', cn: wd.cn, cost: wd.cost, weather: wd.id };
  }
  const bd = buffDef(c.buff || 'sharpClaw');
  return { kind: 'buff', cn: bd.cn, cost: bd.cost, buff: bd.id, desc: bd.desc, tag: bd.tag };
}

function handCardById(b: BattleState, id: number): CardInstance | null {
  for (let i = 0; i < b.player.hand.length; i++) {
    if (b.player.hand[i].id === id) return b.player.hand[i];
  }
  return null;
}

function entryViews(b: BattleState, faction: Faction, ghost: boolean, ghostEntries?: SideEntryView[] | null): SideEntryView[] {
  if (ghost && ghostEntries) return ghostEntries;
  const out: SideEntryView[] = [];
  const units = side(b, faction).units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.anchor < 0 && !u.alive) continue;
    out.push({
      species: u.species, level: u.level, hp: Math.max(0, u.hp), maxHp: u.maxHp,
      statuses: statusTags(u), empty: false, ghost,
      hitFlash: u.fx.hitFlash
    });
    if (out.length >= 6) break;
  }
  return out;
}

function emptyEntry(): SideEntryView {
  return { species: 'mouse', level: 1, hp: 0, maxHp: 1, statuses: [], empty: true };
}

function entryUnits(b: BattleState, faction: Faction, ghost?: SideEntryView[] | null): number[] {
  if (faction === 'enemy' && ghost && ghost.length > 0) return [];
  const out: number[] = [];
  const units = side(b, faction).units;
  for (let i = 0; i < units.length; i++) {
    if (units[i].alive || units[i].anchor >= 0) out.push(units[i].id);
    if (out.length >= 6) break;
  }
  return out;
}

function entryTip(id: number): string {
  return '敌方单位 #' + id;
}

function roundLogViews(b: BattleState): RoundLogView[] {
  const out: RoundLogView[] = [];
  for (let i = 0; i < b.log.length; i++) {
    const l = b.log[i];
    out.push({
      round: l.round,
      winner: l.winner,
      houseDamage: l.winner === 'player' ? l.houseDamage.enemy : l.houseDamage.player,
      weather: l.weather as WeatherId,
      buffCount: 0,
      units: []
    });
  }
  return out;
}

function ledgerRows(b: BattleState): LedgerRow[] {
  const e = b.player;
  const eco = b.economy.player;
  return [
    { label: '总收入（回合+胜利）', value: eco.income },
    { label: '利息', value: eco.interest },
    { label: '买卡支出', value: -eco.buySpent },
    { label: '刷新支出', value: -eco.refreshSpent }
  ];
  void e;
}

function rewardViews(coins: number, stars: number): RewardView[] {
  return [
    { kind: 'coin', label: '爪印币', value: coins },
    { kind: 'star', label: '星辉', value: stars }
  ];
}

function phaseText(p: Phase): string {
  if (p === 'deploy') return '布阵';
  if (p === 'observe') return '观测';
  if (p === 'battle') return '战斗';
  if (p === 'settle') return '结算';
  if (p === 'market') return '集市';
  if (p === 'result') return '终局';
  return '准备';
}

function phaseTotal(p: Phase): number {
  if (p === 'observe') return TIMING.OBSERVE;
  if (p === 'battle') return TIMING.BATTLE;
  if (p === 'settle') return TIMING.SETTLE;
  if (p === 'market') return TIMING.MARKET;
  return TIMING.DEPLOY_RN;
}

function reasonText(reason?: string): string {
  if (!reason) return '操作无效';
  if (reason === 'not-enough-sunlight') return '阳光不足';
  if (reason === 'refresh-limit') return '本回合刷新次数已用完';
  if (reason === 'bench-full') return '替补席已满';
  if (reason === 'deploy-limit') return '出战数量已达上限';
  if (reason === 'command-cooldown') return '该单位指挥冷却中';
  if (reason === 'gift-used') return '本轮赠礼已使用';
  if (reason === 'buff-full') return '该动物加成牌已满（最多 2 张）';
  if (reason === 'not-same-level') return '只有同种同级才能合成';
  if (reason === 'level-cap') return '已经是 3 级';
  return reason;
}

/** 集市刷新圆牌（手绘木牌 + 藤蔓环）。 */
function drawWoodSignCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  label: string,
  disabled: boolean,
  time: number,
): void {
  ctx.save();
  ctx.globalAlpha = disabled ? 0.55 : 1;
  drawWoodPanel(ctx, x, y, size, size, { tone: 'bark', radius: size / 2 });
  const labelSize = fitSize(ctx, label, size - 34, 26, 14);
  setFont(ctx, labelSize, 'bold');
  ctx.textAlign = 'center';
  ctx.fillStyle = disabled ? rgba(PALETTE.inkSoft, 0.6) : PALETTE.inkSoft;
  ctx.fillText(label, x + size / 2, y + size / 2 + labelSize * 0.36);
  ctx.restore();
}