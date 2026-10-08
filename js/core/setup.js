"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEPLOY_LIMIT = exports.BATTLE_BOUNDS = exports.PX_PER_UNIT = exports.PLAYER_ANCHOR_COUNT = exports.ANCHOR_COUNT = void 0;
exports.anchorIndex = anchorIndex;
exports.anchorColRow = anchorColRow;
exports.isPlayerAnchor = isPlayerAnchor;
exports.anchorCenter = anchorCenter;
exports.mirrorAnchor = mirrorAnchor;
exports.factionAnchorAt = factionAnchorAt;
exports.deployCap = deployCap;
exports.side = side;
exports.otherFaction = otherFaction;
exports.levelMultiplier = levelMultiplier;
exports.emptyStat = emptyStat;
exports.pushEvent = pushEvent;
exports.unitById = unitById;
exports.fieldUnits = fieldUnits;
exports.anchorOccupied = anchorOccupied;
exports.findBenchSlot = findBenchSlot;
exports.isBenched = isBenched;
exports.takeFromBench = takeFromBench;
exports.takeFromField = takeFromField;
exports.cardById = cardById;
exports.removeHandCard = removeHandCard;
exports.buffDefOf = buffDefOf;
exports.investedOf = investedOf;
exports.powerOf = powerOf;
exports.createUnit = createUnit;
exports.rollAnimalCard = rollAnimalCard;
exports.rollAnyCard = rollAnyCard;
exports.rollShelf = rollShelf;
exports.createBattle = createBattle;
exports.syncFieldPositions = syncFieldPositions;
exports.beginContinuous = beginContinuous;
exports.restoreBaseStats = restoreBaseStats;
exports.hasAlive = hasAlive;
/**
 * 开局构造、棋盘锚点几何与卡池工厂（纯逻辑，可无头运行）。
 *
 * 约定：
 * - 逻辑坐标单位 = 1 个点位间距；棋盘 12×8，我方 (col 0-5, row 0-3)、敌方 (col 6-11, row 4-7)。
 * - 锚点压缩编号 0..47（ANCHOR_COUNT）：0..23 = 我方半场，24..47 = 敌方半场。
 *   编号只是「布阵阶段的吸附位」标识，渲染层永不绘制；开战后 battle 只读连续坐标。
 * - 所有数值一律来自 src/config/*，本文件不硬编码任何平衡数值。
 */
var species_1 = require("../config/species");
Object.defineProperty(exports, "DEPLOY_LIMIT", { enumerable: true, get: function () { return species_1.DEPLOY_LIMIT; } });
var cards_1 = require("../config/cards");
var weather_1 = require("../config/weather");
var economy_1 = require("../config/economy");
var timing_1 = require("../config/timing");
var layout_1 = require("../config/layout");
var rng_1 = require("./rng");
/** 棋盘半场列数 / 行数（6 / 4）。 */
var HALF_COLS = timing_1.GRID_COLS / 2;
var HALF_ROWS = timing_1.GRID_ROWS / 2;
/** 每方锚点数（24）。 */
var HALF_ANCHORS = HALF_COLS * HALF_ROWS;
/** 全场锚点数（48）。 */
exports.ANCHOR_COUNT = HALF_ANCHORS * 2;
/** 我方锚点区间 [0, PLAYER_ANCHOR_COUNT)。 */
exports.PLAYER_ANCHOR_COUNT = HALF_ANCHORS;
/** 渲染像素 → 逻辑单位 的换算基准（与 LAYOUT.GRID.cellW 同源）。 */
exports.PX_PER_UNIT = layout_1.LAYOUT.GRID.cellW;
/** 战斗阶段的连续坐标软边界（battle 只用它做软性回归，不做任何格子判定）。 */
exports.BATTLE_BOUNDS = { minX: 0, minY: 0, maxX: timing_1.GRID_COLS, maxY: timing_1.GRID_ROWS };
/* ------------------------------------------------------------------ */
/* 锚点几何                                                            */
/* ------------------------------------------------------------------ */
/** (col,row) → 紧凑锚点编号 0..47。非法组合返回 -1。 */
function anchorIndex(col, row) {
    if (col < 0 || col >= timing_1.GRID_COLS || row < 0 || row >= timing_1.GRID_ROWS)
        return -1;
    if (col < HALF_COLS) {
        if (row >= HALF_ROWS)
            return -1;
        return row * HALF_COLS + col;
    }
    if (row < HALF_ROWS)
        return -1;
    return exports.PLAYER_ANCHOR_COUNT + (row - HALF_ROWS) * HALF_COLS + (col - HALF_COLS);
}
/** 紧凑锚点编号 → (col,row)。越界返回 { col:-1, row:-1 }。 */
function anchorColRow(anchor) {
    if (anchor < 0 || anchor >= exports.ANCHOR_COUNT)
        return { col: -1, row: -1 };
    if (anchor < exports.PLAYER_ANCHOR_COUNT) {
        return { col: anchor % HALF_COLS, row: Math.floor(anchor / HALF_COLS) };
    }
    var a = anchor - exports.PLAYER_ANCHOR_COUNT;
    return { col: HALF_COLS + (a % HALF_COLS), row: HALF_ROWS + Math.floor(a / HALF_COLS) };
}
/** 是否我方半场锚点。 */
function isPlayerAnchor(anchor) {
    return anchor >= 0 && anchor < exports.PLAYER_ANCHOR_COUNT;
}
/** 锚点中心连续坐标（单位 = 格），供渲染换算像素（render 自己乘 cellW）。 */
function anchorCenter(anchor) {
    var cr = anchorColRow(anchor);
    return { x: cr.col + 0.5, y: cr.row + 0.5 };
}
/** 正对点位（点对称 11-c, 7-r）。 */
function mirrorAnchor(anchor) {
    var cr = anchorColRow(anchor);
    if (cr.col < 0)
        return -1;
    return anchorIndex(timing_1.GRID_COLS - 1 - cr.col, timing_1.GRID_ROWS - 1 - cr.row);
}
/** 该方第 n 个合法锚点（n 从 0 起，越界返回 -1）。 */
function factionAnchorAt(faction, n) {
    var base = faction === 'player' ? 0 : exports.PLAYER_ANCHOR_COUNT;
    if (n < 0 || n >= HALF_ANCHORS)
        return -1;
    return base + n;
}
/** 本回合出战上限（§5.2：min(6, 2+floor(round/2))）。 */
function deployCap(state, faction) {
    void faction;
    return (0, species_1.deployCapOfRound)(state.round);
}
/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */
function side(state, faction) {
    return faction === 'player' ? state.player : state.enemy;
}
function otherFaction(faction) {
    return faction === 'player' ? 'enemy' : 'player';
}
/** 等级倍率：HP/攻击力 ×1.8^(level-1)。 */
function levelMultiplier(level) {
    var m = 1;
    for (var i = 1; i < level; i++)
        m *= species_1.LEVEL_MULT;
    return m;
}
function emptyStat() {
    return {
        damageDealt: 0,
        damageTaken: 0,
        kills: 0,
        aliveMs: 0,
        bySource: { basic: 0, trait: 0, counter: 0, weather: 0, buff: 0 },
        healed: 0
    };
}
function emptyEconomy() {
    return { income: 0, interest: 0, buySpent: 0, refreshSpent: 0, sellGained: 0, giftUsed: false };
}
function pushEvent(state, type, faction, unitId, targetId, amount, source, species) {
    var ev = { type: type, at: state.time };
    if (faction !== null)
        ev.faction = faction;
    if (unitId >= 0)
        ev.unitId = unitId;
    if (targetId >= 0)
        ev.targetId = targetId;
    if (amount !== 0)
        ev.amount = amount;
    if (source !== null)
        ev.source = source;
    if (species !== null)
        ev.species = species;
    state.events.push(ev);
    // 事件流只服务演出，长跑自检里不能无限增长
    if (state.events.length > 240)
        state.events.splice(0, state.events.length - 240);
}
function unitById(state, id) {
    if (id < 0)
        return null;
    for (var i = 0; i < state.player.units.length; i++) {
        if (state.player.units[i].id === id)
            return state.player.units[i];
    }
    for (var i = 0; i < state.enemy.units.length; i++) {
        if (state.enemy.units[i].id === id)
            return state.enemy.units[i];
    }
    for (var i = 0; i < state.player.bench.length; i++) {
        var u = state.player.bench[i];
        if (u !== null && u.id === id)
            return u;
    }
    for (var i = 0; i < state.enemy.bench.length; i++) {
        var u = state.enemy.bench[i];
        if (u !== null && u.id === id)
            return u;
    }
    return null;
}
/** 场上单位（替补席不算）。 */
function fieldUnits(state, faction) {
    var out = [];
    var units = side(state, faction).units;
    for (var i = 0; i < units.length; i++)
        if (units[i].alive)
            out.push(units[i]);
    return out;
}
/** 场上锚点是否已被占用。 */
function anchorOccupied(state, faction, anchor) {
    var units = side(state, faction).units;
    for (var i = 0; i < units.length; i++)
        if (units[i].anchor === anchor)
            return true;
    return false;
}
function findBenchSlot(s) {
    for (var i = 0; i < s.bench.length; i++)
        if (s.bench[i] === null)
            return i;
    return -1;
}
/** 单位是否在替补席上（anchor === -1）。 */
function isBenched(s, unitId) {
    for (var i = 0; i < s.bench.length; i++) {
        var u = s.bench[i];
        if (u !== null && u.id === unitId)
            return true;
    }
    return false;
}
/** 从替补席移除（返回被移除的单位或 null）。 */
function takeFromBench(s, unitId) {
    for (var i = 0; i < s.bench.length; i++) {
        var u = s.bench[i];
        if (u !== null && u.id === unitId) {
            s.bench[i] = null;
            return u;
        }
    }
    return null;
}
/** 从场上移除。 */
function takeFromField(s, unitId) {
    for (var i = 0; i < s.units.length; i++) {
        if (s.units[i].id === unitId) {
            var u = s.units[i];
            s.units.splice(i, 1);
            return u;
        }
    }
    return null;
}
function cardById(s, cardId) {
    for (var i = 0; i < s.hand.length; i++)
        if (s.hand[i].id === cardId)
            return s.hand[i];
    return null;
}
function removeHandCard(s, cardId) {
    for (var i = 0; i < s.hand.length; i++) {
        if (s.hand[i].id === cardId) {
            var c = s.hand[i];
            s.hand.splice(i, 1);
            return c;
        }
    }
    return null;
}
function buffDefOf(id) {
    for (var i = 0; i < cards_1.BUFF_CARDS.length; i++)
        if (cards_1.BUFF_CARDS[i].id === id)
            return cards_1.BUFF_CARDS[i];
    return cards_1.BUFF_CARDS[0];
}
/** 单位累计投入（卖出返还用）。 */
function investedOf(u) {
    return u.invested;
}
/** 单位战力（结算伤害与 AI 估值）。 */
function powerOf(u) {
    return species_1.SPECIES[u.species].power * u.level;
}
/* ------------------------------------------------------------------ */
/* 单位与卡牌工厂                                                      */
/* ------------------------------------------------------------------ */
function createUnit(state, owner, species, level, invested) {
    var def = species_1.SPECIES[species];
    var mult = levelMultiplier(level);
    var maxHp = Math.floor(def.hp * mult);
    var atk = Math.floor(def.atk * mult);
    var trait = def.trait;
    return {
        id: state.nextId++,
        owner: owner,
        species: species,
        level: level,
        buffs: [],
        trait: trait,
        maxHp: maxHp,
        hp: maxHp,
        shield: 0,
        atk: atk,
        atkInterval: Math.round(def.atkInterval * 1000),
        moveSpeed: def.moveSpeed,
        atkRange: def.atkRange,
        bodyRadius: def.bodyRadius,
        baseMaxHp: maxHp,
        baseAtk: atk,
        invested: invested,
        pos: { x: -1, y: -1 },
        anchor: -1,
        facing: owner === 'player' ? 1 : -1,
        alive: true,
        roundsPlayed: 0,
        stat: emptyStat(),
        atkTimer: 0,
        targetId: -1,
        targetTimer: 0,
        commandReadyAt: 0,
        forcedTargetId: -1,
        pendingCommandAt: 0,
        pendingTargetId: -1,
        status: {
            bleedStacks: 0,
            bleedPerSec: 0,
            bleedUntil: 0,
            slowAtkUntil: 0,
            slowAtkMul: 0,
            guardUntil: 0,
            guardReduce: 0,
            regenUntil: 0,
            tauntUntil: 0,
            mimic: null
        },
        decoyUntil: 0,
        decoyUsed: false,
        isDecoy: false,
        mirrorId: -1,
        pushPos: { x: 0, y: 0 },
        bleedSource: 'trait',
        bleedFromId: -1,
        dotTimer: 0,
        regenTimer: 0,
        drainTimer: 0,
        fx: {
            hitFlash: 0,
            attackPulse: 0,
            deathFirefly: 0,
            combineBloom: 0,
            shieldRipple: 0,
            hitDir: 1,
            counterHit: 0
        }
    };
}
function makeAnimalCard(state, species, round) {
    return { id: state.nextId++, kind: 'animal', species: species, boughtRound: round };
}
function makeWeatherCard(state, weather, round) {
    return { id: state.nextId++, kind: 'weather', weather: weather, boughtRound: round };
}
function makeBuffCard(state, buff, round) {
    return { id: state.nextId++, kind: 'buff', buff: buff, boughtRound: round };
}
/** 按当前回合 tier 表 + 物种保底抽一张动物牌。 */
function rollAnimalCard(state) {
    var tiers = (0, economy_1.tierTableForRound)(state.round);
    var weights = [];
    for (var i = 0; i < tiers.length; i++)
        weights.push(tiers[i].weight);
    var tier = tiers[(0, rng_1.pickWeighted)(state.rng, weights)];
    var pool = [];
    var poolWeights = [];
    for (var i = 0; i < species_1.SPECIES_ORDER.length; i++) {
        var sp = species_1.SPECIES_ORDER[i];
        if (species_1.SPECIES[sp].cost !== tier.cost)
            continue;
        pool.push(sp);
        poolWeights.push(1 + (sp === state.player.biasSpecies ? cards_1.SPECIES_BIAS : 0));
    }
    if (pool.length === 0) {
        // 该费用档无对应物种（配置极端情况）→ 退化为全池等权
        for (var i = 0; i < species_1.SPECIES_ORDER.length; i++)
            pool.push(species_1.SPECIES_ORDER[i]);
        for (var i = 0; i < species_1.SPECIES_ORDER.length; i++)
            poolWeights.push(1);
    }
    var picked = pool[(0, rng_1.pickWeighted)(state.rng, poolWeights)];
    return makeAnimalCard(state, picked, state.round);
}
/** 按卡池占比（动物 78% / 天气 12% / 加成 10%）抽一张任意牌。 */
function rollAnyCard(state) {
    var idx = (0, rng_1.pickWeighted)(state.rng, [cards_1.POOL_SHARE.animal, cards_1.POOL_SHARE.weather, cards_1.POOL_SHARE.buff]);
    var kind = idx === 0 ? 'animal' : idx === 1 ? 'weather' : 'buff';
    if (kind === 'animal')
        return rollAnimalCard(state);
    if (kind === 'weather') {
        var w = weather_1.WEATHER_CARDS[(0, rng_1.pickWeighted)(state.rng, [1, 1, 1])];
        return makeWeatherCard(state, w.id, state.round);
    }
    var weights = [];
    for (var i = 0; i < cards_1.BUFF_CARDS.length; i++)
        weights.push(1);
    var b = cards_1.BUFF_CARDS[(0, rng_1.pickWeighted)(state.rng, weights)];
    return makeBuffCard(state, b.id, state.round);
}
/** 重掷货架（SHELF_SLOTS 槽）。 */
function rollShelf(state) {
    var out = [];
    for (var i = 0; i < cards_1.SHELF_SLOTS; i++)
        out.push({ card: rollAnyCard(state), taken: false });
    return out;
}
/** 开局免费动物牌 → 直接进替补席（§3：双方各发 3 张随机动物牌）。 */
function dealStarters(state, faction) {
    var s = side(state, faction);
    for (var i = 0; i < economy_1.ECONOMY.FREE_START_CARDS; i++) {
        var slot = findBenchSlot(s);
        if (slot < 0)
            break;
        var card = rollAnimalCard(state);
        var species = card.species;
        var unit = createUnit(state, faction, species, 1, species_1.SPECIES[species].cost);
        unit.anchor = -1;
        s.bench[slot] = unit;
        pushEvent(state, 'UnitDeploy', faction, unit.id, -1, 0, null, species);
    }
}
function createSide(state, faction, difficulty) {
    var bench = [];
    for (var i = 0; i < species_1.BENCH_SLOTS; i++)
        bench.push(null);
    var bias = species_1.SPECIES_ORDER[(0, rng_1.nextInt)(state.rng, 0, species_1.SPECIES_ORDER.length - 1)];
    var s = {
        faction: faction,
        sunlight: economy_1.ECONOMY.START_SUNLIGHT,
        houseHp: economy_1.ECONOMY.HOUSE_HP,
        houseHpMax: economy_1.ECONOMY.HOUSE_HP,
        units: [],
        bench: bench,
        hand: [],
        biasSpecies: bias,
        deployed: false
    };
    if (faction === 'enemy')
        s.ai = difficulty;
    return s;
}
function createAiMemory(difficulty) {
    return {
        difficulty: difficulty,
        nextActionAt: 0,
        actionsThisPhase: 0,
        planReady: false,
        planUnits: [],
        planAnchors: [],
        observeUntil: 0,
        commandCount: 0,
        marketDone: false
    };
}
/**
 * 开局构造：双方各 3 张免费随机动物牌（进替补席）、5 阳光、小屋 30 HP、各自随机倾向物种。
 * R1 不额外发放轮次基础收入（ECONOMY.START_SUNLIGHT 即全部开局资源）。
 */
function createBattle(seed, difficulty) {
    var rng = (0, rng_1.createRng)(seed);
    var state = {
        seed: seed,
        rng: rng,
        nextId: 1,
        time: 0,
        phase: 'deploy',
        round: 1,
        phaseLeft: timing_1.TIMING.DEPLOY_R1,
        player: null,
        enemy: null,
        weather: { player: { next: 'none', active: 'none' }, enemy: { next: 'none', active: 'none' } },
        weatherFx: { player: {}, enemy: {} },
        weatherText: '无天气',
        shelf: [],
        refreshUsed: 0,
        giftUsed: false,
        economy: { player: emptyEconomy(), enemy: emptyEconomy() },
        ai: createAiMemory(difficulty),
        outcome: null,
        log: [],
        events: [],
        highlights: []
    };
    state.player = createSide(state, 'player', 'veteran');
    state.enemy = createSide(state, 'enemy', difficulty);
    dealStarters(state, 'player');
    dealStarters(state, 'enemy');
    state.shelf = rollShelf(state);
    pushEvent(state, 'RoundStart', null, -1, -1, 0, null, null);
    return state;
}
/** 场上单位按锚点落位（布阵阶段每次变更后调用）。 */
function syncFieldPositions(state, faction) {
    var units = side(state, faction).units;
    for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (u.anchor < 0)
            continue;
        var c = anchorCenter(u.anchor);
        u.pos.x = c.x;
        u.pos.y = c.y;
    }
}
/** 开战瞬间：把锚点吸附坐标声明为连续坐标，并算好正对对位。 */
function beginContinuous(state) {
    syncFieldPositions(state, 'player');
    syncFieldPositions(state, 'enemy');
    for (var i = 0; i < state.player.units.length; i++) {
        var u = state.player.units[i];
        u.mirrorId = -1;
        if (u.anchor < 0)
            continue;
        var m = mirrorAnchor(u.anchor);
        for (var j = 0; j < state.enemy.units.length; j++) {
            if (state.enemy.units[j].anchor === m)
                u.mirrorId = state.enemy.units[j].id;
        }
    }
    for (var i = 0; i < state.enemy.units.length; i++) {
        var u = state.enemy.units[i];
        u.mirrorId = -1;
        if (u.anchor < 0)
            continue;
        var m = mirrorAnchor(u.anchor);
        for (var j = 0; j < state.player.units.length; j++) {
            if (state.player.units[j].anchor === m)
                u.mirrorId = state.player.units[j].id;
        }
    }
    // 无目标时的推进点 = 自身锚点的正对点（在敌方半场），开战前一次性算好，
    // 这样 battle.ts 永远不需要读网格常量。
    var pf = ['player', 'enemy'];
    for (var f = 0; f < pf.length; f++) {
        var units = side(state, pf[f]).units;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (u.anchor < 0) {
                u.pushPos.x = u.pos.x;
                u.pushPos.y = u.pos.y;
                continue;
            }
            var c = anchorCenter(mirrorAnchor(u.anchor));
            u.pushPos.x = c.x;
            u.pushPos.y = c.y;
        }
    }
}
/** 战斗结束后把天气 HP 上限乘区还原为裸值。 */
function restoreBaseStats(state) {
    var factions = ['player', 'enemy'];
    for (var f = 0; f < factions.length; f++) {
        var units = side(state, factions[f]).units;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            u.maxHp = u.baseMaxHp;
            if (u.hp > u.maxHp)
                u.hp = u.maxHp;
            u.atk = u.baseAtk;
        }
    }
}
/** 场上是否还有存活单位。 */
function hasAlive(state, faction) {
    var units = side(state, faction).units;
    for (var i = 0; i < units.length; i++)
        if (units[i].alive)
            return true;
    return false;
}
