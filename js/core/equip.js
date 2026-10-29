"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyEquipAttributes = applyEquipAttributes;
exports.clearEquip = clearEquip;
exports.equipTrait = equipTrait;
exports.hasEquip = hasEquip;
/**
 * §9 装备式特技：装备/卸下与「装备瞬间生效」的属性改写。
 *
 * 三条特技在装备那一刻就改变单位属性，其余五条是纯被动（在战斗结算里读 `u.equip`）：
 * - 借力模仿 `mimicAtk`：baseAtk 换成目标物种的攻击力（等级倍率照旧在 refreshStats 里乘）
 * - 共生血条 `symHp`：baseMaxHp 换成目标物种的最大 HP，当前血按原比例继承
 * - 拟态伪装 `disguise`：把 `status.mimic` 写成目标物种，克制判定与敌方索敌读有效物种
 *
 * 被动五条的实现落点：
 * - 荆棘反震 `thorns` / 汲取 `drain` → core/damage.ts（扣 HP 之后的反震与吸血段）
 * - 疾行 `swift` → core/battle.ts 的 effectiveSpeed
 * - 不屈 `unyield` → core/damage.ts 的 killUnit
 * - 嘲讽 `taunt` → core/battle.ts 的 recalcTarget
 */
var species_1 = require("../config/species");
var timing_1 = require("../config/timing");
var setup_1 = require("./setup");
/** 把单位上「装备瞬间生效」的三条特技写进属性（可在等级变化后重复调用）。 */
function applyEquipAttributes(u) {
    var t = u.equip;
    var sp = u.equipSpecies;
    // 先复位所有装备改写的字段，避免卸下/换装后残留
    u.baseAtk = Math.floor(species_1.SPECIES[u.species].atk);
    u.baseMaxHp = Math.floor(species_1.SPECIES[u.species].hp);
    u.status.mimic = null;
    if (t === null || sp === null) {
        u.atk = Math.floor(u.baseAtk * (0, setup_1.levelMultiplier)(u.level));
        u.maxHp = Math.floor(u.baseMaxHp * (0, setup_1.levelMultiplier)(u.level));
        if (u.hp > u.maxHp)
            u.hp = u.maxHp;
        return;
    }
    var target = species_1.SPECIES[sp];
    if (t === 'mimicAtk') {
        u.baseAtk = Math.floor(target.atk);
    }
    else if (t === 'symHp') {
        var ratio = u.maxHp > 0 ? u.hp / u.maxHp : 1;
        u.baseMaxHp = Math.floor(target.hp);
        var mult = (0, setup_1.levelMultiplier)(u.level);
        u.maxHp = Math.floor(u.baseMaxHp * mult);
        u.hp = Math.round(u.maxHp * ratio);
        if (u.hp < 1)
            u.hp = 1;
        if (u.hp > u.maxHp)
            u.hp = u.maxHp;
        var cap = Math.floor(u.maxHp * timing_1.TIMING.SHIELD_CAP_RATIO);
        if (u.shield > cap)
            u.shield = cap;
    }
    else if (t === 'disguise') {
        u.status.mimic = sp;
    }
    u.atk = Math.floor(u.baseAtk * (0, setup_1.levelMultiplier)(u.level));
}
/** 卸下特技（属性回到本色）。 */
function clearEquip(u) {
    u.equip = null;
    u.equipSpecies = null;
    applyEquipAttributes(u);
}
/**
 * 装备（或换装）一条装备式特技。
 * `species` 只对 needsSpecies 的三条生效；其余三条传 null。
 * 返回是否装备成功。
 */
function equipTrait(u, trait, species) {
    if (trait === null) {
        clearEquip(u);
        return true;
    }
    u.equip = trait;
    u.equipSpecies = species;
    applyEquipAttributes(u);
    return true;
}
/** 该单位是否装备了指定特技。 */
function hasEquip(u, trait) {
    return u.equip === trait;
}
