/**
 * 时序与战斗常数（§2.7 / §3 / §4.2 / §8 / §10）。
 * 所有「时间」单位为毫秒，所有「距离」单位为逻辑单位（1 单位 = 1 点位间距）。
 */
export const TIMING = {
  /** 渲染帧率目标 */
  RENDER_FPS: 60,
  /** 逻辑固定步长 20Hz */
  LOGIC_DT: 50,

  /** 回合阶段时长（ms） */
  DEPLOY_R1: 25000,
  DEPLOY_RN: 15000,
  OBSERVE: 4000,
  BATTLE: 30000,
  SETTLE: 3000,
  MARKET: 40000,

  /** 长按开始拖拽 */
  LONG_PRESS: 200,
  /** 拖拽吸附距离（逻辑单位） */
  SNAP_DISTANCE: 0.5,
  /** 落位涟漪时长 */
  MOSS_RIPPLE: 250,
  /** 苔藓光斑呼吸周期 */
  MOSS_BREATH: 800,

  /** 昼夜/动画 */
  RUN_BOB_HZ: 2.5,
  LIMB_LAG: 0.12,
  ATTACK_LUNGE: 14,
  HIT_FLASH: 0.08,
  DEATH_ANIM: 550,
  REVEAL_ANIM: 800,
  GHOST_ARC: 250,
  HP_SYNC_MAX: 100,
  ANIM_BUDGET: 48,

  /** 全局缓动（§2.7） */
  EASE: [0.22, 0.9, 0.32, 1] as number[],
  EASE_MS_MIN: 200,
  EASE_MS_MAX: 320,

  /** 战斗 · 索敌与指挥 */
  TARGET_RECALC: 200,
  PERCEIVE_RANGE: 6,
  COMMAND_FLIGHT: 400,
  COMMAND_CD: 6000,
  DETOUR_FACTOR: 1.6,
  DETOUR_FACTOR_SWIFT: 1.3,
  /** 转向避让：前方探测锥角（弧度）与偏转角范围 */
  STEER_CONE: Math.PI / 3,
  STEER_MIN: Math.PI / 6,
  STEER_MAX: Math.PI / 3,
  SEPARATION_RADIUS: 0.7,
  SEPARATION_PUSH: 0.35,
  /** 软边界：越界回调的推力系数 */
  BOUNDARY_PUSH: 2.4,

  /** 施法/派生动作 */
  TRAIT_TRAMPLE_KNOCKBACK: 0.5,
  TRAIT_ROAR_RADIUS: 1.0,
  TRAIT_ROAR_SPLASH: 0.30,
  TRAIT_ROAR_DURATION: 3000,
  TRAIT_COMBO_HITS: 2,
  TRAIT_COMBO_SCALE: 0.55,
  TRAIT_CRIT_CHANCE: 0.30,
  TRAIT_CRIT_MULT: 2.0,
  TRAIT_BLEED_SCALE: 0.30,
  TRAIT_BLEED_DURATION: 3000,
  TRAIT_BLEED_MAX_STACK: 3,
  TRAIT_REND_ASPD: 0.15,
  TRAIT_REND_DURATION: 2000,
  TRAIT_REND_MAX_STACK: 2,
  TRAIT_CLAW_THRESHOLD: 0.30,
  TRAIT_CLAW_MULT: 2.0,
  TRAIT_AMBUSH_IGNORE_REDUCE: 0.20,

  /** §9 装备式特技（布阵阶段装备，每只动物 1 槽） */
  EQUIP_THORNS_PCT: 0.30,
  EQUIP_SWIFT_MOVE: 0.50,
  EQUIP_DRAIN_PCT: 0.25,
  EQUIP_UNYIELD_HP: 0.30,
  EQUIP_TAUNT_RANGE: 1.5,

  /** 结算/机制常数 */
  COUNTER_BONUS: 1.5,
  COUNTERED_PENALTY: 0.75,
  SHIELD_CAP_RATIO: 0.30,
  CRIT_RING_BREATH: 0.6,

  /** 回合内每 25% 刻痕 */
  RING_NOTCH_STEP: 0.25
} as const;

/** 逻辑距离换算：棋盘 12×8 点位，1 单位 = 1 点位间距。 */
export const GRID_COLS = 12;
export const GRID_ROWS = 8;
/** 我方逻辑半场：col 0-5 / row 0-3（屏幕左下）；敌方 col 6-11 / row 4-7（屏幕右上）。 */
export const PLAYER_COLS = 6;
export const PLAYER_ROWS = 4;