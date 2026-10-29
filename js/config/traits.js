"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EQUIP_SLOT_COUNT = exports.EQUIP_TRAIT_ORDER = exports.EQUIP_TRAITS = void 0;
exports.equipTraitDef = equipTraitDef;
exports.equipNeedsSpecies = equipNeedsSpecies;
exports.isEquipTraitId = isEquipTraitId;
exports.isEquipSpecies = isEquipSpecies;
exports.EQUIP_TRAITS = {
    mimicAtk: {
        id: 'mimicAtk', cn: '借力模仿', needsSpecies: true, source: 'card',
        desc: '本局攻击力 = 所选目标物种的攻击力',
    },
    symHp: {
        id: 'symHp', cn: '共生血条', needsSpecies: true, source: 'card',
        desc: '本局最大 HP = 所选目标物种的最大 HP（按比例继承当前血）',
    },
    disguise: {
        id: 'disguise', cn: '拟态伪装', needsSpecies: true, source: 'card',
        desc: '克制判定中伪装成指定物种，敌方索敌与克制加成按伪装后计算',
    },
    thorns: {
        id: 'thorns', cn: '荆棘反震', needsSpecies: false, source: 'card',
        desc: '受到伤害时反弹 30% 给攻击者',
    },
    swift: {
        id: 'swift', cn: '疾行', needsSpecies: false, source: 'card',
        desc: '移速 +50%',
    },
    drain: {
        id: 'drain', cn: '汲取', needsSpecies: false, source: 'card',
        desc: '造成伤害的 25% 回复自身',
    },
    unyield: {
        id: 'unyield', cn: '不屈', needsSpecies: false, source: 'unlock',
        desc: '首次死亡时以 30% HP 复活，每局一次',
    },
    taunt: {
        id: 'taunt', cn: '嘲讽', needsSpecies: false, source: 'unlock',
        desc: '强制吸引 1.5 单位内敌人优先攻击自己',
    },
};
/** 详情页/装备面板的固定顺序（§9 表格顺序）。 */
exports.EQUIP_TRAIT_ORDER = [
    'mimicAtk', 'symHp', 'disguise', 'thorns', 'swift', 'drain', 'unyield', 'taunt',
];
/** 每只动物的特技槽数量（§9：1 个）。 */
exports.EQUIP_SLOT_COUNT = 1;
var EQUIP_MAP = exports.EQUIP_TRAITS;
/** 按 id 取特技定义（未知 id 返回 null）。 */
function equipTraitDef(id) {
    if (id === null)
        return null;
    var def = EQUIP_MAP[id];
    return def === undefined ? null : def;
}
/** 该特技是否需要选定目标物种。 */
function equipNeedsSpecies(id) {
    var def = equipTraitDef(id);
    return def !== null && def.needsSpecies;
}
/** 运行时校验：id 是否合法（存档/指令都可能带脏数据）。 */
function isEquipTraitId(v) {
    return typeof v === 'string' && EQUIP_MAP[v] !== undefined;
}
/** 目标物种是否合法（可空）。 */
function isEquipSpecies(v) {
    return v === null || (typeof v === 'string' && v.length > 0);
}
