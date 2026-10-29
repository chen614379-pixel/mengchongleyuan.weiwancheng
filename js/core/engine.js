"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setPhase = setPhase;
exports.submit = submit;
exports.applyCommand = applyCommand;
exports.tick = tick;
exports.isFinished = isFinished;
exports.phaseLeftOf = phaseLeftOf;
/**
 * 引擎：阶段机 + 指令仲裁 + 结算（§1 指令系统 / §3 核心循环 / §11.2 回合结算）。
 *
 * 每个逻辑帧调用一次 `tick()`：
 *   1. drain 指令队列并按顺序结算（玩家与 AI 完全同源）；
 *   2. 让 AI 按拟人节奏产生下一批指令；
 *   3. 推进恰好 TIMING.LOGIC_DT 毫秒的逻辑，必要时切阶段。
 * 阶段切换一律写 `state.phaseLeft`（对应 TIMING 值）并追加 PhaseChange 事件到 state.events。
 */
var economy_1 = require("../config/economy");
var species_1 = require("../config/species");
var traits_1 = require("../config/traits");
var timing_1 = require("../config/timing");
var weather_1 = require("../config/weather");
var ai_1 = require("./ai");
var battle_1 = require("./battle");
var equip_1 = require("./equip");
var setup_1 = require("./setup");
var shop_1 = require("./shop");
function reject(reason) {
    return { ok: false, reason: reason, fx: 'reject' };
}
function pushPhaseEvent(state, phase) {
    var ev = { type: 'PhaseChange', at: state.time, phase: phase };
    state.events.push(ev);
    if (state.events.length > 240)
        state.events.splice(0, state.events.length - 240);
}
/** 切阶段：写 phaseLeft 与事件（父代理契约：场景层只靠 phase + phaseLeft 驱动 UI）。 */
function setPhase(state, phase, left) {
    state.phase = phase;
    state.phaseLeft = left;
    pushPhaseEvent(state, phase);
}
/** 把指令放进队列（真正生效在下一逻辑帧的开头）。 */
function submit(state, queue, command, by) {
    void state;
    queue.push(command, queue.pending, by);
}
/* ------------------------------------------------------------------ *
 * 指令仲裁
 * ------------------------------------------------------------------ */
function anchorBelongsTo(faction, anchor) {
    if (anchor < 0 || anchor >= setup_1.ANCHOR_COUNT)
        return false;
    return (0, setup_1.isPlayerAnchor)(anchor) === (faction === 'player');
}
function applyDeploy(state, cmd) {
    if (state.phase !== 'deploy' && state.phase !== 'market')
        return reject('bad-phase');
    if (!anchorBelongsTo(cmd.faction, cmd.anchor))
        return reject('bad-anchor');
    var s = (0, setup_1.side)(state, cmd.faction);
    if (s.units.length >= (0, species_1.deployCapOfRound)(state.round))
        return reject('deploy-cap-full');
    if ((0, setup_1.anchorOccupied)(state, cmd.faction, cmd.anchor))
        return reject('anchor-taken');
    var u = (0, setup_1.takeFromBench)(s, cmd.unitId);
    if (u === null)
        return reject('no-such-unit');
    var c = (0, setup_1.anchorCenter)(cmd.anchor);
    u.anchor = cmd.anchor;
    u.pos.x = c.x;
    u.pos.y = c.y;
    s.units.push(u);
    // §9：装备的属性改写（借力模仿 / 共生血条 / 拟态伪装）在场上才真正生效
    if (u.equip !== null)
        (0, equip_1.applyEquipAttributes)(u);
    (0, setup_1.pushEvent)(state, 'UnitDeploy', cmd.faction, u.id, -1, 0, null, u.species);
    return { ok: true, fx: 'card-fly' };
}
function applyRetreat(state, cmd) {
    if (state.phase !== 'deploy' && state.phase !== 'market')
        return reject('bad-phase');
    var s = (0, setup_1.side)(state, cmd.faction);
    var onField = false;
    for (var i = 0; i < s.units.length; i++)
        if (s.units[i].id === cmd.unitId)
            onField = true;
    if (!onField)
        return reject('no-such-unit');
    var slot = (0, setup_1.findBenchSlot)(s);
    if (slot < 0)
        return reject('bench-full');
    var u = (0, setup_1.takeFromField)(s, cmd.unitId);
    if (u === null)
        return reject('no-such-unit');
    u.anchor = -1;
    s.bench[slot] = u;
    return { ok: true, fx: 'leaf-fall' };
}
function applySwap(state, cmd) {
    if (state.phase !== 'deploy' && state.phase !== 'market')
        return reject('bad-phase');
    var s = (0, setup_1.side)(state, cmd.faction);
    var a = null;
    var b = null;
    for (var i = 0; i < s.units.length; i++) {
        if (s.units[i].id === cmd.unitA)
            a = s.units[i];
        if (s.units[i].id === cmd.unitB)
            b = s.units[i];
    }
    if (a === null || b === null)
        return reject('no-such-unit');
    var aid = a.anchor;
    var bid = b.anchor;
    a.anchor = bid;
    b.anchor = aid;
    var ca = (0, setup_1.anchorCenter)(bid);
    a.pos.x = ca.x;
    a.pos.y = ca.y;
    var cb = (0, setup_1.anchorCenter)(aid);
    b.pos.x = cb.x;
    b.pos.y = cb.y;
    return { ok: true, fx: 'card-fly' };
}
function refreshStats(u) {
    var mult = (0, setup_1.levelMultiplier)(u.level);
    u.maxHp = Math.floor(u.baseMaxHp * mult);
    u.atk = Math.floor(u.baseAtk * mult);
}
/**
 * §9 装备式特技：布阵/集市阶段给单位装备（或换装/卸下）一条特技。
 * 属性改写（借力模仿 / 共生血条 / 拟态伪装）在 equip.ts 里立即生效；
 * 其余五条是纯被动，由 battle.ts / damage.ts 读取 `u.equip` 结算。
 */
function applyEquipTrait(state, cmd) {
    if (state.phase !== 'deploy' && state.phase !== 'market')
        return reject('bad-phase');
    var u = (0, setup_1.unitById)(state, cmd.unitId);
    if (u === null || u.owner !== cmd.faction || !u.alive)
        return reject('no-such-unit');
    if (cmd.trait !== null && !(0, traits_1.isEquipTraitId)(cmd.trait))
        return reject('bad-trait');
    if (cmd.trait !== null && (0, traits_1.equipNeedsSpecies)(cmd.trait) && cmd.species === null)
        return reject('needs-species');
    (0, equip_1.equipTrait)(u, cmd.trait, cmd.species);
    return { ok: true, fx: 'buff-wrap' };
}
function applyCombine(state, cmd) {
    if (state.phase !== 'deploy' && state.phase !== 'market')
        return reject('bad-phase');
    var s = (0, setup_1.side)(state, cmd.faction);
    var A = (0, setup_1.unitById)(state, cmd.unitA);
    var B = (0, setup_1.unitById)(state, cmd.unitB);
    if (A === null || B === null || A.id === B.id)
        return reject('no-such-unit');
    if (A.owner !== cmd.faction || B.owner !== cmd.faction)
        return reject('no-such-unit');
    if (!A.alive || !B.alive)
        return reject('no-such-unit');
    if (A.species !== B.species || A.level !== B.level)
        return reject('combine-mismatch');
    // 两只 3 级相合：3 级封顶，多余的一只返还 60% 累计费用（§5.2）
    if (A.level === 3) {
        var refund = Math.floor(B.invested * 0.6);
        s.sunlight += refund;
        state.economy[cmd.faction].sellGained += refund;
        B.alive = false;
        (0, setup_1.takeFromBench)(s, B.id);
        (0, setup_1.takeFromField)(s, B.id);
        return { ok: true, fx: 'combine-bloom' };
    }
    var survivor = A;
    var eaten = B;
    survivor.level = (survivor.level + 1);
    survivor.invested = survivor.invested + eaten.invested;
    refreshStats(survivor);
    // §9：升级后重算装备改写（借力模仿的攻击力随等级倍率走，共生血条按新等级上限）
    if (survivor.equip !== null)
        (0, equip_1.applyEquipAttributes)(survivor);
    survivor.hp = survivor.maxHp;
    survivor.fx.combineBloom = 1;
    eaten.alive = false;
    if (eaten.anchor >= 0)
        (0, setup_1.takeFromField)(s, eaten.id);
    else
        (0, setup_1.takeFromBench)(s, eaten.id);
    (0, setup_1.pushEvent)(state, 'Combine', cmd.faction, survivor.id, -1, 0, null, survivor.species);
    return { ok: true, fx: 'combine-bloom' };
}
function applyCommandAttack(state, cmd) {
    if (state.phase !== 'battle')
        return reject('bad-phase');
    var u = (0, setup_1.unitById)(state, cmd.unitId);
    if (u === null || u.owner !== cmd.faction || !u.alive || u.anchor < 0)
        return reject('no-such-unit');
    var t = (0, setup_1.unitById)(state, cmd.targetId);
    if (t === null || t.owner === cmd.faction || !t.alive)
        return reject('no-such-target');
    if (state.time < u.commandReadyAt)
        return reject('command-cooldown');
    u.pendingCommandAt = state.time + timing_1.TIMING.COMMAND_FLIGHT;
    u.pendingTargetId = cmd.targetId;
    u.commandReadyAt = state.time + timing_1.TIMING.COMMAND_CD;
    (0, setup_1.pushEvent)(state, 'CommandIssued', cmd.faction, u.id, cmd.targetId, 0, null, u.species);
    return { ok: true, fx: 'command-fly' };
}
/** 结算一条指令（观测阶段只接受 ConfirmDeploy）。 */
function applyCommand(state, cmd, by) {
    void by;
    if (state.phase === 'result')
        return reject('match-over');
    if (state.phase === 'observe' && cmd.type !== 'ConfirmDeploy')
        return reject('observe-locked');
    if (state.phase === 'settle')
        return reject('bad-phase');
    switch (cmd.type) {
        case 'Deploy':
            return applyDeploy(state, cmd);
        case 'Retreat':
            return applyRetreat(state, cmd);
        case 'Swap':
            return applySwap(state, cmd);
        case 'Combine':
            return applyCombine(state, cmd);
        case 'CommandAttack':
            return applyCommandAttack(state, cmd);
        case 'Buy':
            return (0, shop_1.applyBuy)(state, cmd.faction, cmd.slot, false);
        case 'BuyGift':
            return (0, shop_1.applyBuy)(state, cmd.faction, cmd.slot, true);
        case 'Refresh':
            return (0, shop_1.applyRefresh)(state, cmd.faction);
        case 'Sell':
            return (0, shop_1.applySell)(state, cmd.faction, cmd.unitId);
        case 'EquipBuff':
            return (0, shop_1.applyEquipBuff)(state, cmd.faction, cmd.cardId, cmd.unitId);
        case 'RemoveBuff':
            return (0, shop_1.applyRemoveBuff)(state, cmd.faction, cmd.unitId, cmd.buffIndex);
        case 'EquipTrait':
            return applyEquipTrait(state, cmd);
        case 'ConfirmDeploy': {
            var s = (0, setup_1.side)(state, cmd.faction);
            s.deployed = true;
            return { ok: true };
        }
    }
    return reject('unknown-command');
}
/* ------------------------------------------------------------------ *
 * 阶段切换
 * ------------------------------------------------------------------ */
function clearFieldDead(state) {
    var factions = ['player', 'enemy'];
    for (var f = 0; f < factions.length; f++) {
        var s = (0, setup_1.side)(state, factions[f]);
        for (var i = s.units.length - 1; i >= 0; i--) {
            if (!s.units[i].alive)
                s.units.splice(i, 1);
        }
        for (var i = 0; i < s.bench.length; i++) {
            var u = s.bench[i];
            if (u !== null && !u.alive)
                s.bench[i] = null;
        }
    }
}
/** 回合之间的清点：还原天气 HP、补满血、清状态、卸掉幻影。 */
function refreshRoundUnits(state) {
    var factions = ['player', 'enemy'];
    for (var f = 0; f < factions.length; f++) {
        var s = (0, setup_1.side)(state, factions[f]);
        for (var i = 0; i < s.units.length; i++)
            resetUnit(s.units[i]);
        for (var i = 0; i < s.bench.length; i++) {
            var u = s.bench[i];
            if (u !== null)
                resetUnit(u);
        }
    }
    (0, setup_1.restoreBaseStats)(state);
}
function resetUnit(u) {
    u.alive = true;
    u.hp = u.maxHp;
    u.shield = 0;
    u.status.bleedStacks = 0;
    u.status.bleedPerSec = 0;
    u.status.bleedUntil = 0;
    u.status.slowAtkUntil = 0;
    u.status.slowAtkMul = 0;
    u.status.guardUntil = 0;
    u.status.guardReduce = 0;
    u.status.regenUntil = 0;
    u.status.tauntUntil = 0;
    u.isDecoy = false;
    u.decoyUntil = 0;
    u.decoyUsed = false;
    u.dotTimer = 0;
    u.regenTimer = 0;
    u.drainTimer = 0;
    u.atkTimer = 0;
    u.targetId = -1;
    u.targetTimer = 0;
    u.forcedTargetId = -1;
    u.pendingCommandAt = 0;
    u.pendingTargetId = -1;
    u.commandReadyAt = 0;
}
function enterDeploy(state) {
    state.player.deployed = false;
    state.enemy.deployed = false;
    state.ai.actionsThisPhase = 0;
    state.ai.planReady = false;
    state.ai.nextActionAt = state.time + 200;
    setPhase(state, 'deploy', state.round === 1 ? timing_1.TIMING.DEPLOY_R1 : timing_1.TIMING.DEPLOY_RN);
}
function enterObserve(state) {
    state.player.deployed = false;
    state.enemy.deployed = false;
    state.ai.actionsThisPhase = 0;
    state.ai.observeUntil = 0;
    state.ai.nextActionAt = state.time + 200;
    setPhase(state, 'observe', timing_1.TIMING.OBSERVE);
}
function enterBattle(state) {
    var factions = ['player', 'enemy'];
    for (var f = 0; f < factions.length; f++) {
        var slot = state.weather[factions[f]];
        if (slot.next !== 'none') {
            slot.active = slot.next;
            slot.next = 'none';
        }
    }
    var resolved = (0, weather_1.resolveWeather)(state.weather.player.active, state.weather.enemy.active);
    state.weatherFx.player = resolved.player;
    state.weatherFx.enemy = resolved.enemy;
    state.weatherText = resolved.cn;
    var neutral = '';
    if (resolved.neutralized)
        neutral = '（中和）';
    state.player.deployed = false;
    state.enemy.deployed = false;
    state.ai.actionsThisPhase = 0;
    state.ai.commandCount = 0;
    state.ai.marketDone = false;
    state.ai.nextActionAt = state.time + 800;
    (0, setup_1.pushEvent)(state, 'RoundStart', null, -1, -1, 0, null, null);
    void neutral;
    (0, battle_1.prepareBattle)(state);
    setPhase(state, 'battle', timing_1.TIMING.BATTLE);
}
function powerSum(units) {
    var sum = 0;
    for (var i = 0; i < units.length; i++)
        sum += (0, setup_1.powerOf)(units[i]);
    return sum;
}
function hpSum(units) {
    var sum = 0;
    for (var i = 0; i < units.length; i++)
        sum += units[i].hp;
    return sum;
}
/** 回合胜负：全灭判负；超时比存活战力，再比总 HP，全同则平局。 */
function judgeRound(state) {
    var p = (0, setup_1.fieldUnits)(state, 'player');
    var e = (0, setup_1.fieldUnits)(state, 'enemy');
    if (p.length === 0 && e.length === 0)
        return 'draw';
    if (e.length === 0)
        return 'player';
    if (p.length === 0)
        return 'enemy';
    var pp = powerSum(p);
    var ep = powerSum(e);
    if (pp > ep)
        return 'player';
    if (ep > pp)
        return 'enemy';
    var ph = hpSum(p);
    var eh = hpSum(e);
    if (ph > eh)
        return 'player';
    if (eh > ph)
        return 'enemy';
    return 'draw';
}
function logUnits(units) {
    var out = [];
    for (var i = 0; i < units.length; i++) {
        var u = units[i];
        out.push({
            species: u.species,
            level: u.level,
            hpMax: u.maxHp,
            survived: u.alive,
            buffs: u.buffs.slice()
        });
    }
    return out;
}
function captureHighlight(state) {
    var units = [];
    var factions = ['player', 'enemy'];
    for (var f = 0; f < factions.length; f++) {
        var s = (0, setup_1.side)(state, factions[f]);
        for (var i = 0; i < s.units.length; i++) {
            var u = s.units[i];
            units.push({
                id: u.id,
                species: u.species,
                hp: u.hp,
                maxHp: u.maxHp,
                level: u.level,
                pos: { x: u.pos.x, y: u.pos.y },
                alive: u.alive
            });
        }
    }
    state.highlights.push({
        round: state.round,
        at: state.time,
        label: '第 ' + state.round + ' 回合结束',
        units: units,
        commands: []
    });
    while (state.highlights.length > 12)
        state.highlights.shift();
}
function enterSettle(state) {
    var winner = judgeRound(state);
    var pAlive = (0, setup_1.fieldUnits)(state, 'player');
    var eAlive = (0, setup_1.fieldUnits)(state, 'enemy');
    var dmgPlayer = 0;
    var dmgEnemy = 0;
    if (winner === 'player') {
        dmgEnemy = (0, economy_1.roundDamage)(powerSum(pAlive));
        state.enemy.houseHp -= dmgEnemy;
        (0, shop_1.grantWinBonus)(state, 'player');
    }
    else if (winner === 'enemy') {
        dmgPlayer = (0, economy_1.roundDamage)(powerSum(eAlive));
        state.player.houseHp -= dmgPlayer;
        (0, shop_1.grantWinBonus)(state, 'enemy');
    }
    else {
        dmgPlayer = economy_1.ECONOMY.DRAW_DAMAGE;
        dmgEnemy = economy_1.ECONOMY.DRAW_DAMAGE;
        state.player.houseHp -= dmgPlayer;
        state.enemy.houseHp -= dmgEnemy;
    }
    if (state.player.houseHp < 0)
        state.player.houseHp = 0;
    if (state.enemy.houseHp < 0)
        state.enemy.houseHp = 0;
    var log = {
        round: state.round,
        winner: winner,
        houseDamage: { player: dmgPlayer, enemy: dmgEnemy },
        playerUnits: logUnits(state.player.units),
        enemyUnits: logUnits(state.enemy.units),
        weather: state.weatherText
    };
    state.log.push(log);
    (0, setup_1.pushEvent)(state, 'BattleEnd', winner === 'draw' ? null : winner, -1, -1, 0, null, null);
    if (winner === 'player')
        (0, setup_1.pushEvent)(state, 'ImpLoseRound', 'enemy', -1, -1, 0, null, null);
    else if (winner === 'enemy')
        (0, setup_1.pushEvent)(state, 'ImpWinRound', 'enemy', -1, -1, 0, null, null);
    captureHighlight(state);
    setPhase(state, 'settle', timing_1.TIMING.SETTLE);
}
function enterMarket(state) {
    clearFieldDead(state);
    (0, setup_1.restoreBaseStats)(state);
    refreshRoundUnits(state);
    (0, shop_1.beginMarket)(state);
    state.player.deployed = false;
    state.enemy.deployed = false;
    state.ai.actionsThisPhase = 0;
    state.ai.planReady = false;
    state.ai.marketDone = false;
    state.ai.nextActionAt = state.time + 300;
    setPhase(state, 'market', timing_1.TIMING.MARKET);
}
function enterNextRound(state) {
    clearFieldDead(state);
    refreshRoundUnits(state);
    state.round += 1;
    (0, setup_1.pushEvent)(state, 'RoundStart', null, -1, -1, 0, null, null);
    enterDeploy(state);
}
function enterResult(state) {
    if (state.player.houseHp > state.enemy.houseHp)
        state.outcome = 'win';
    else if (state.player.houseHp < state.enemy.houseHp)
        state.outcome = 'lose';
    else
        state.outcome = 'draw';
    clearFieldDead(state);
    (0, setup_1.restoreBaseStats)(state);
    state.player.deployed = false;
    state.enemy.deployed = false;
    setPhase(state, 'result', 0);
}
function advance(state, dt) {
    state.phaseLeft -= dt;
    switch (state.phase) {
        case 'deploy':
            if (state.phaseLeft <= 0 || (state.player.deployed && state.enemy.deployed))
                enterObserve(state);
            break;
        case 'observe':
            if (state.phaseLeft <= 0 || (state.player.deployed && state.enemy.deployed))
                enterBattle(state);
            break;
        case 'battle':
            (0, battle_1.stepBattle)(state);
            if ((0, battle_1.battleOver)(state) || state.phaseLeft <= 0)
                enterSettle(state);
            break;
        case 'settle':
            if (state.phaseLeft <= 0) {
                if (state.player.houseHp <= 0 || state.enemy.houseHp <= 0 || state.round >= economy_1.ECONOMY.ROUNDS) {
                    enterResult(state);
                }
                else {
                    enterMarket(state);
                }
            }
            break;
        case 'market':
            if (state.phaseLeft <= 0 || (state.player.deployed && state.enemy.deployed))
                enterNextRound(state);
            break;
        default:
            break;
    }
}
/** 推进一个逻辑帧（恰好 TIMING.LOGIC_DT 毫秒）。 */
function tick(state, queue, out) {
    var dt = timing_1.TIMING.LOGIC_DT;
    state.time += dt;
    var items = queue.drain();
    for (var i = 0; i < items.length; i++) {
        out.push(applyCommand(state, items[i].command, items[i].by));
    }
    if (state.phase !== 'result')
        (0, ai_1.aiTick)(state, queue);
    advance(state, dt);
}
/** 便捷工具：一局是否结束。 */
function isFinished(state) {
    return state.phase === 'result';
}
/** 当前阶段剩余毫秒（场景层只读）。 */
function phaseLeftOf(state) {
    return state.phaseLeft;
}
