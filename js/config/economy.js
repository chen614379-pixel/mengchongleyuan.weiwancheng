"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_TABLE = exports.ECONOMY = void 0;
exports.tierTableForRound = tierTableForRound;
exports.roundDamage = roundDamage;
exports.sellValue = sellValue;
exports.interestOf = interestOf;
/**
 * 阳光经济、回合结算与卡池漂移（§11）。
 * 开局 5 阳光 + 3 张免费动物牌是「卡死设计」：改卡池权重必须重算此值。
 */
exports.ECONOMY = {
    /** 开局起始阳光（R1 不另发轮次基础收入） */
    START_SUNLIGHT: 5,
    /** R2 起每轮基础收入 */
    ROUND_INCOME: 5,
    /** 利息：每 10 阳光 +1，单轮上限 +5 */
    INTEREST_PER: 10,
    INTEREST_CAP: 5,
    /** 回合胜利奖励 */
    WIN_SUNLIGHT: 2,
    /** 卖出返还比例（累计费用 × 0.8 向下取整） */
    SELL_RATIO: 0.8,
    /** 刷新费用序列（每轮上限 3 次） */
    REFRESH_COST: [2, 3, 4],
    REFRESH_LIMIT: 3,
    /** 每轮可免费拿走 1 张（林间赠礼） */
    FREE_GIFT_PER_ROUND: 1,
    /** 开局免费动物牌 */
    FREE_START_CARDS: 3,
    /** 小屋初始 HP */
    HOUSE_HP: 30,
    /** 回合伤害 = ceil(胜方存活战力之和 × ROUND_DMG_RATIO)，下限 1、上限 8 */
    ROUND_DMG_RATIO: 0.35,
    ROUND_DMG_MIN: 1,
    ROUND_DMG_MAX: 8,
    /** 平局双方各扣 */
    DRAW_DAMAGE: 1,
    /** 总回合数 */
    ROUNDS: 8,
    /** 八回合打满后的终局奖励 */
    REWARD_WIN_COINS: 80,
    REWARD_LOSE_COINS: 30,
    REWARD_DRAW_COINS: 50,
    REWARD_WIN_STARS: 3,
    /** 一天首胜额外爪印币 */
    DAILY_FIRST_WIN_COINS: 50
};
exports.TIER_TABLE = [
    { rounds: 'R1-R2', tiers: [{ cost: 1, weight: 55 }, { cost: 2, weight: 30 }, { cost: 3, weight: 15 }] },
    { rounds: 'R3-R4', tiers: [{ cost: 1, weight: 35 }, { cost: 2, weight: 35 }, { cost: 3, weight: 20 }, { cost: 4, weight: 10 }] },
    { rounds: 'R5-R6', tiers: [{ cost: 1, weight: 20 }, { cost: 2, weight: 30 }, { cost: 3, weight: 30 }, { cost: 4, weight: 15 }, { cost: 5, weight: 5 }] },
    { rounds: 'R7-R8', tiers: [{ cost: 1, weight: 10 }, { cost: 2, weight: 20 }, { cost: 3, weight: 30 }, { cost: 4, weight: 25 }, { cost: 5, weight: 12 }, { cost: 6, weight: 3 }] }
];
function tierTableForRound(round) {
    if (round <= 2)
        return exports.TIER_TABLE[0].tiers;
    if (round <= 4)
        return exports.TIER_TABLE[1].tiers;
    if (round <= 6)
        return exports.TIER_TABLE[2].tiers;
    return exports.TIER_TABLE[3].tiers;
}
/** 回合伤害结算（§11.2）。 */
function roundDamage(powerSum) {
    var dmg = Math.ceil(powerSum * exports.ECONOMY.ROUND_DMG_RATIO);
    if (dmg < exports.ECONOMY.ROUND_DMG_MIN)
        return exports.ECONOMY.ROUND_DMG_MIN;
    if (dmg > exports.ECONOMY.ROUND_DMG_MAX)
        return exports.ECONOMY.ROUND_DMG_MAX;
    return dmg;
}
/** 卖出返还（§11.1）。 */
function sellValue(totalCost) {
    return Math.floor(totalCost * exports.ECONOMY.SELL_RATIO);
}
/** 利息（§11.1）。 */
function interestOf(sunlight) {
    var v = Math.floor(sunlight / exports.ECONOMY.INTEREST_PER);
    return v > exports.ECONOMY.INTEREST_CAP ? exports.ECONOMY.INTEREST_CAP : v;
}
