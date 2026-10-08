"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INK = exports.SPECIES_THEME = exports.BENCH_SLOTS = exports.DEPLOY_LIMIT = exports.LEVEL_DECOS = exports.LEVEL_MULT = exports.COUNTER = exports.SPECIES_ORDER = exports.SPECIES = void 0;
exports.counteredBy = counteredBy;
exports.deployCapOfRound = deployCapOfRound;
/**
 * 动物数值表（§5.1）+ 克制闭环（§6）。
 * 数值一律以此表为准，逻辑层不得硬编码。
 */
var palette_1 = require("./palette");
exports.SPECIES = {
    elephant: {
        id: 'elephant', cn: '象', power: 8, cost: 6, hp: 1300, atk: 180, atkInterval: 1.60,
        moveSpeed: 1.00, atkRange: 1.2, bodyRadius: 26, ringRadius: 34, theme: '#8B9AA6',
        limb: 'trunk', family: 'elephant', trait: 'trample', traitName: '践踏',
        traitDesc: '范围 1.2 单位全体 100% 伤害 + 击退 0.5 单位并打断当前攻击'
    },
    lion: {
        id: 'lion', cn: '狮', power: 7, cost: 5, hp: 980, atk: 135, atkInterval: 1.30,
        moveSpeed: 1.35, atkRange: 1.1, bodyRadius: 24, ringRadius: 32, theme: '#D9A05B',
        limb: 'mane', family: 'cat', trait: 'roar', traitName: '咆哮',
        traitDesc: '命中使目标减伤 -20%（3s），溅射周围 1 单位 30% 伤害'
    },
    tiger: {
        id: 'tiger', cn: '虎', power: 6, cost: 4, hp: 800, atk: 104, atkInterval: 1.15,
        moveSpeed: 1.50, atkRange: 1.0, bodyRadius: 22, ringRadius: 30, theme: '#DE8A52',
        limb: 'tail', family: 'cat', trait: 'crit', traitName: '暴击',
        traitDesc: '30% 概率 ×2 伤害'
    },
    leopard: {
        id: 'leopard', cn: '豹', power: 5, cost: 3, hp: 640, atk: 78, atkInterval: 1.05,
        moveSpeed: 1.90, atkRange: 1.0, bodyRadius: 21, ringRadius: 29, theme: '#D9BE63',
        limb: 'tail', family: 'cat', trait: 'combo', traitName: '连击',
        traitDesc: '每次出手命中 2 下，每下 55% 攻击力'
    },
    wolf: {
        id: 'wolf', cn: '狼', power: 4, cost: 2, hp: 520, atk: 58, atkInterval: 0.95,
        moveSpeed: 1.70, atkRange: 1.0, bodyRadius: 20, ringRadius: 28, theme: '#7C8A93',
        limb: 'ears', family: 'dog', trait: 'bleed', traitName: '流血',
        traitDesc: '附加 30% 攻击力的持续伤害，3s 内每秒结算，最多叠 3 层'
    },
    dog: {
        id: 'dog', cn: '狗', power: 3, cost: 2, hp: 400, atk: 42, atkInterval: 0.80,
        moveSpeed: 1.80, atkRange: 1.0, bodyRadius: 19, ringRadius: 27, theme: '#C08E63',
        limb: 'tail', family: 'dog', trait: 'rend', traitName: '撕咬',
        traitDesc: '命中使目标攻速 -15%（2s），最多叠 2 层'
    },
    cat: {
        id: 'cat', cn: '猫', power: 2, cost: 1, hp: 320, atk: 30, atkInterval: 0.65,
        moveSpeed: 2.00, atkRange: 0.9, bodyRadius: 18, ringRadius: 26, theme: '#D98C8C',
        limb: 'tail', family: 'cat', trait: 'claw', traitName: '爪击',
        traitDesc: '对 HP < 30% 的目标伤害 ×2'
    },
    mouse: {
        id: 'mouse', cn: '鼠', power: 1, cost: 1, hp: 260, atk: 22, atkInterval: 0.55,
        moveSpeed: 2.20, atkRange: 0.9, bodyRadius: 14, ringRadius: 22, theme: '#A39BAA',
        limb: 'ears', family: 'other', trait: 'ambush', traitName: '偷袭',
        traitDesc: '优先锁定 HP 最低单位，无视目标 20% 减伤'
    }
};
/** 战力序（象 > 狮 > 虎 > 豹 > 狼 > 狗 > 猫 > 鼠），克制闭环沿此顺序。 */
exports.SPECIES_ORDER = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'mouse'];
/** 克制闭环 §6：COUNTER[a] = 被 a 克制的物种（伤害 ×1.5；反向 ×0.75）。 */
exports.COUNTER = {
    elephant: 'lion',
    lion: 'tiger',
    tiger: 'leopard',
    leopard: 'wolf',
    wolf: 'dog',
    dog: 'cat',
    cat: 'mouse',
    mouse: 'elephant'
};
/** 被谁克制（反查，用于 UI 的克制关系环）。 */
function counteredBy(id) {
    for (var i = 0; i < exports.SPECIES_ORDER.length; i++) {
        if (exports.COUNTER[exports.SPECIES_ORDER[i]] === id)
            return exports.SPECIES_ORDER[i];
    }
    return id;
}
/** 等级倍率（§5.2）：HP 与攻击力 ×1.8，攻速与移速不变。 */
exports.LEVEL_MULT = 1.8;
exports.LEVEL_DECOS = { '2': '藤蔓护腕', '3': '花冠' };
/** 每回合出战上限与人口成长（§4.1 / 附录 C）。 */
exports.DEPLOY_LIMIT = 6;
exports.BENCH_SLOTS = 8;
function deployCapOfRound(round) {
    return Math.min(exports.DEPLOY_LIMIT, 2 + Math.floor(round / 2));
}
/** 主题色（§2.3），供不 import SPECIES 的渲染模块快速取用。 */
exports.SPECIES_THEME = {
    elephant: '#8B9AA6', lion: '#D9A05B', tiger: '#DE8A52', leopard: '#D9BE63',
    wolf: '#7C8A93', dog: '#C08E63', cat: '#D98C8C', mouse: '#A39BAA'
};
exports.INK = palette_1.PALETTE.inkSoft;
