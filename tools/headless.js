/**
 * petbrawl 逻辑核心无头自检（node tools/headless.js）
 *
 * 四项验收（§16 / 委派要求）：
 *   [1] 确定性：同 seed 跑两遍 1000 局，全量指纹必须完全一致。
 *   [2] 平衡：8 动物两两对战 64 组（每组 N 局），胜率全部落在 35%~65%。
 *   [3] 稳健性：1000 局不崩、不卡死（两单位距离持续 < 0.05 超 2s）、不死循环、无 NaN。
 *   [4] 伤害归因：每局结算时每个单位 bySource 各项之和 vs 总伤害，误差 < 1%。
 *
 * 说明：本脚本是**测试脚手架**，不进入小游戏首包；它自带一个"对称自动玩家"，
 * 用于平衡测试时驱动双方（双方用完全相同的策略，只有倾向物种不同 → 公平对照）。
 * 确定性/稳健性测试里玩家侧用该自动玩家，敌方仍旧走 core/ai.ts（三档难度轮换）。
 */
'use strict';

var path = require('path');
var core = require(path.join(__dirname, '..', 'js', 'core', 'index.js'));

var LOGIC_DT = core.TIMING.LOGIC_DT;
var MAX_TICKS = 40000; // 40k × 50ms = 2000s 游戏时间，正常一局 < 800s

/* ------------------------------------------------------------------ *
 * 指纹哈希（32 位滚动混合）
 * ------------------------------------------------------------------ */
function mix(h, v) {
  h = (h ^ (v | 0)) | 0;
  h = Math.imul(h, 16777619);
  h = (h ^ (h >>> 13)) | 0;
  return h | 0;
}

var PHASE_IDX = {
  load: 0,
  menu: 1,
  deploy: 2,
  observe: 3,
  battle: 4,
  settle: 5,
  market: 6,
  result: 7
};

function digestUnit(h, u) {
  h = mix(h, u.id);
  h = mix(h, u.level * 13 + u.hp * 7 + u.shield);
  h = mix(h, Math.round(u.pos.x * 1000) + Math.round(u.pos.y * 1000) * 3);
  h = mix(h, (u.alive ? 1 : 0) * 3 + u.anchor * 5 + u.targetId * 11);
  h = mix(h, u.atkTimer + u.commandReadyAt + u.pendingCommandAt);
  h = mix(h, u.stat.damageDealt * 3 + u.stat.damageTaken + u.stat.healed * 7);
  h = mix(h, u.status.bleedStacks * 17 + Math.round(u.status.guardReduce * 1000));
  h = mix(h, u.buffs.length * 31 + (u.isDecoy ? 1 : 0));
  h = mix(h, Math.round(u.maxHp) + Math.round(u.atk) * 5);
  return h;
}

function digestCard(h, card) {
  if (card === null || card === undefined) return mix(h, 999999);
  var kind = card.kind === 'animal' ? 1 : card.kind === 'buff' ? 2 : 3;
  h = mix(h, kind * 1000003);
  if (card.species !== undefined) h = mix(h, card.species.length + card.species.charCodeAt(0));
  if (card.buff !== undefined) h = mix(h, card.buff.length + card.buff.charCodeAt(0));
  if (card.weather !== undefined) h = mix(h, card.weather.length + card.weather.charCodeAt(0));
  return h;
}

/** 全量状态指纹：时间/RNG/双方每单位每个数值/货架/手牌/日志计数。 */
function digestState(state, h) {
  h = mix(h, state.time);
  h = mix(h, state.round * 31 + PHASE_IDX[state.phase] + state.phaseLeft);
  h = mix(h, state.rng.s);
  h = mix(h, state.nextId);
  h = mix(h, state.refreshUsed * 7 + (state.giftUsed ? 1 : 0));
  h = mix(h, state.weather.player.active.length + state.weather.enemy.active.length * 3);

  var factions = ['player', 'enemy'];
  for (var f = 0; f < factions.length; f++) {
    var s = state[factions[f]];
    h = mix(h, s.sunlight * 131 + s.houseHp * 17 + (s.deployed ? 1 : 0) * 3);
    h = mix(h, state.economy[factions[f]].income + state.economy[factions[f]].buySpent * 3 +
      state.economy[factions[f]].refreshSpent * 7 + state.economy[factions[f]].sellGained * 11 +
      (state.economy[factions[f]].giftUsed ? 1 : 0));
    for (var i = 0; i < s.units.length; i++) h = digestUnit(h, s.units[i]);
    for (var b = 0; b < s.bench.length; b++) {
      if (s.bench[b] != null) h = digestUnit(h, s.bench[b]);
    }
    for (var c = 0; c < s.hand.length; c++) h = digestCard(h, s.hand[c]);
  }
  for (var k = 0; k < state.shelf.length; k++) {
    h = digestCard(h, state.shelf[k].card);
    h = mix(h, state.shelf[k].taken ? 1 : 0);
  }
  h = mix(h, state.log.length * 97 + state.highlights.length * 13 + state.events.length);
  return h;
}

/* ------------------------------------------------------------------ *
 * 对称自动玩家（测试脚手架：双方同一策略）
 * ------------------------------------------------------------------ */
var FORMATION = [
  [2, 3],
  [1, 3],
  [3, 3],
  [2, 2],
  [1, 2],
  [3, 2]
];

function formationAnchor(faction, index) {
  var c = FORMATION[index][0];
  var r = FORMATION[index][1];
  var anchor = core.anchorIndex(c, r);
  if (faction === 'enemy') anchor = core.mirrorAnchor(anchor);
  return anchor;
}

function makeAutoPlayer() {
  return { next: { player: 0, enemy: 0 }, cmdNext: { player: 0, enemy: 0 } };
}

function benchUnits(s) {
  var out = [];
  for (var i = 0; i < s.bench.length; i++) if (s.bench[i] != null) out.push(s.bench[i]);
  return out;
}

function fieldAlive(s) {
  var out = [];
  for (var i = 0; i < s.units.length; i++) if (s.units[i].alive) out.push(s.units[i]);
  return out;
}

function pickStrongestBench(s) {
  var list = benchUnits(s);
  var best = null;
  for (var i = 0; i < list.length; i++) {
    if (best === null || core.powerOf(list[i]) > core.powerOf(best)) best = list[i];
  }
  return best;
}

function freeFormationAnchor(state, faction, cap) {
  var s = core.side(state, faction);
  for (var i = 0; i < FORMATION.length && i < cap; i++) {
    var a = formationAnchor(faction, i);
    if (a < 0) continue;
    var taken = false;
    for (var k = 0; k < s.units.length; k++) if (s.units[k].anchor === a) taken = true;
    if (!taken) return a;
  }
  return -1;
}

function findCombinePair(s) {
  var all = fieldAlive(s).concat(benchUnits(s));
  for (var i = 0; i < all.length; i++) {
    for (var j = i + 1; j < all.length; j++) {
      if (all[i].species === all[j].species && all[i].level === all[j].level && all[i].level < 3) {
        return [all[i].id, all[j].id];
      }
    }
  }
  return null;
}

function bestBuySlot(state, s) {
  var best = -1;
  var bestScore = -1;
  var benchFull = core.findBenchSlot(s) < 0;
  for (var i = 0; i < state.shelf.length; i++) {
    var item = state.shelf[i];
    if (item.taken || item.card == null) continue;
    var card = item.card;
    if (card.kind !== 'animal' || card.species === undefined) continue;
    if (benchFull) continue;
    var def = core.SPECIES[card.species];
    if (def.cost > s.sunlight) continue;
    // 性价比优先，倾向物种略加分（双方同策略）
    var score = def.power - def.cost * 0.5;
    if (card.species === s.biasSpecies) score += 1.5;
    for (var k = 0; k < s.units.length; k++) {
      if (s.units[k].species === card.species && s.units[k].level < 3) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function bestGiftSlot(state) {
  var best = -1;
  var bestCost = -1;
  for (var i = 0; i < state.shelf.length; i++) {
    var item = state.shelf[i];
    if (item.taken || item.card == null) continue;
    var cost = core.costOfCard(item.card);
    if (cost > bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  return best;
}

function firstBuffCard(s) {
  for (var i = 0; i < s.hand.length; i++) if (s.hand[i].kind === 'buff') return s.hand[i];
  return null;
}

function firstBufferTarget(s) {
  var all = fieldAlive(s).concat(benchUnits(s));
  for (var i = 0; i < all.length; i++) if (all[i].buffs.length < core.BUFF_SLOTS) return all[i];
  return null;
}

function nearestEnemy(state, faction, u) {
  var foe = core.side(state, core.otherFaction(faction));
  var best = null;
  var bestD = 0;
  for (var i = 0; i < foe.units.length; i++) {
    var t = foe.units[i];
    if (!t.alive) continue;
    var dx = t.pos.x - u.pos.x;
    var dy = t.pos.y - u.pos.y;
    var d = dx * dx + dy * dy;
    if (best === null || d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** 每逻辑帧、每个阵营调用一次：按阶段与节奏发出指令（双方同源）。 */
function autoAct(state, queue, mem, faction) {
  if (state.phase === 'result' || state.phase === 'settle') return;
  var s = core.side(state, faction);
  var cap = core.deployCap(state, faction);

  if (state.phase === 'deploy') {
    if (state.time < mem.next[faction]) return;
    mem.next[faction] = state.time + 400;
    if (s.units.length < cap) {
      var u = pickStrongestBench(s);
      var a = freeFormationAnchor(state, faction, cap);
      if (u !== null && a >= 0) {
        queue.push({ type: 'Deploy', faction: faction, unitId: u.id, anchor: a }, state.time, faction);
        return;
      }
    }
    if (!s.deployed) queue.push({ type: 'ConfirmDeploy', faction: faction }, state.time, faction);
    return;
  }

  if (state.phase === 'observe') {
    if (!s.deployed) queue.push({ type: 'ConfirmDeploy', faction: faction }, state.time, faction);
    return;
  }

  if (state.phase === 'battle') {
    if (NO_CMD) return;
    if (state.time < mem.cmdNext[faction]) return;
    mem.cmdNext[faction] = state.time + 2000;
    for (var i = 0; i < s.units.length; i++) {
      var own = s.units[i];
      if (!own.alive || own.commandReadyAt > state.time) continue;
      var t = nearestEnemy(state, faction, own);
      if (t === null) continue;
      queue.push(
        { type: 'CommandAttack', faction: faction, unitId: own.id, targetId: t.id },
        state.time,
        faction
      );
      return;
    }
    return;
  }

  if (state.phase === 'market') {
    if (NO_MARKET) {
      if (!s.deployed) queue.push({ type: 'ConfirmDeploy', faction: faction }, state.time, faction);
      return;
    }
    if (state.time < mem.next[faction]) return;
    mem.next[faction] = state.time + 400;

    var pair = findCombinePair(s);
    if (pair !== null) {
      queue.push({ type: 'Combine', faction: faction, unitA: pair[0], unitB: pair[1] }, state.time, faction);
      return;
    }
    var card = firstBuffCard(s);
    var target = firstBufferTarget(s);
    if (card !== null && target !== null) {
      queue.push({ type: 'EquipBuff', faction: faction, cardId: card.id, unitId: target.id }, state.time, faction);
      return;
    }
    var slot = bestBuySlot(state, s);
    if (slot >= 0) {
      queue.push({ type: 'Buy', faction: faction, slot: slot }, state.time, faction);
      return;
    }
    if (!state.economy[faction].giftUsed) {
      var g = bestGiftSlot(state);
      if (g >= 0) {
        queue.push({ type: 'BuyGift', faction: faction, slot: g }, state.time, faction);
        return;
      }
    }
    var rcost = core.refreshCost(state);
    if (state.refreshUsed < core.ECONOMY.REFRESH_LIMIT && s.sunlight >= rcost + 4) {
      queue.push({ type: 'Refresh', faction: faction }, state.time, faction);
      return;
    }
    if (s.units.length < cap) {
      var bu = pickStrongestBench(s);
      var ba = freeFormationAnchor(state, faction, cap);
      if (bu !== null && ba >= 0) {
        queue.push({ type: 'Deploy', faction: faction, unitId: bu.id, anchor: ba }, state.time, faction);
        return;
      }
    }
    if (!s.deployed) queue.push({ type: 'ConfirmDeploy', faction: faction }, state.time, faction);
    return;
  }
}

/* ------------------------------------------------------------------ *
 * 单局运行
 * ------------------------------------------------------------------ */
function runGame(opts) {
  var state = core.createBattle(opts.seed, opts.difficulty);
  if (opts.biasPlayer !== null) state.player.biasSpecies = opts.biasPlayer;
  if (opts.biasEnemy !== null) state.enemy.biasSpecies = opts.biasEnemy;

  if (opts.mirrorStarters) {
    // 公平对照：双方各 3 只自己倾向物种的 1 级起始动物（资源形状完全相同）
    var sideList = ['player', 'enemy'];
    for (var q = 0; q < sideList.length; q++) {
      var f = sideList[q];
      var sp = f === 'player' ? opts.biasPlayer : opts.biasEnemy;
      var ss = core.side(state, f);
      var nb = [];
      for (var z = 0; z < core.BENCH_SLOTS; z++) nb.push(null);
      ss.bench = nb;
      var spCost = core.SPECIES[sp].cost;
      var spCount = 3;
      if (ARMY_BUDGET > 0) {
        spCount = Math.round(ARMY_BUDGET / spCost);
        if (spCount < 1) spCount = 1;
        if (spCount > core.BENCH_SLOTS) spCount = core.BENCH_SLOTS;
      }
      for (var t = 0; t < spCount; t++) {
        ss.bench[t] = core.createUnit(state, f, sp, 1, core.SPECIES[sp].cost);
      }
    }
    state.shelf = core.rollShelf(state);
  }

  var queue = new core.CommandQueue();
  var out = [];
  var mem = makeAutoPlayer();
  var h = 2166136261;
  var ticks = 0;
  var lastPhase = state.phase;
  var res = {
    state: state,
    hash: 0,
    ticks: 0,
    crash: null,
    nan: false,
    stuck: false,
    tickCap: false,
    notFinished: false,
    unitsChecked: 0,
    badUnits: 0,
    maxErr: 0
  };
  var pairTimers = {};
  var settleScans = 0;

  try {
    while (!core.isFinished(state) && ticks < MAX_TICKS) {
      if (opts.disableCoreAi) state.ai.nextActionAt = 1e9;
      if (ENEMY_FIRST) {
        autoAct(state, queue, mem, 'enemy');
        autoAct(state, queue, mem, 'player');
      } else {
        autoAct(state, queue, mem, 'player');
        if (!opts.disableCoreAi) {
          /* 敌方由 core/ai.ts 驱动（tick 内部调用） */
        } else {
          autoAct(state, queue, mem, 'enemy');
        }
      }

      core.tick(state, queue, out);
      ticks++;

      h = digestState(state, h);

      // NaN / 无效坐标检查
      var facs = ['player', 'enemy'];
      for (var fi = 0; fi < 2; fi++) {
        var su = state[facs[fi]].units;
        for (var ui = 0; ui < su.length; ui++) {
          var un = su[ui];
          if (un.hp !== un.hp || un.pos.x !== un.pos.x || un.pos.y !== un.pos.y) res.nan = true;
        }
      }

      // 进入结算帧：检查伤害归因
      if (state.phase === 'settle' && lastPhase !== 'settle') {
        settleScans++;
        for (var f2 = 0; f2 < 2; f2++) {
          var side2 = state[facs[f2]];
          var all = side2.units.slice();
          for (var bi = 0; bi < side2.bench.length; bi++) if (side2.bench[bi] != null) all.push(side2.bench[bi]);
          for (var ai = 0; ai < all.length; ai++) {
            var u2 = all[ai];
            var bs = u2.stat.bySource;
            var sum = bs.basic + bs.trait + bs.counter + bs.weather + bs.buff;
            res.unitsChecked++;
            var err = Math.abs(sum - u2.stat.damageDealt) / Math.max(1, u2.stat.damageDealt);
            if (err > res.maxErr) res.maxErr = err;
            if (err >= 0.01) res.badUnits++;
          }
        }
      }
      lastPhase = state.phase;

      // 卡死检测：战斗阶段每 5 帧检查一次双方单位是否长期重叠（< 0.05 单位超 2s）
      if (state.phase === 'battle' && ticks % 5 === 0) {
        var P = fieldAlive(state.player);
        var E = fieldAlive(state.enemy);
        for (var pi = 0; pi < P.length; pi++) {
          for (var ei = 0; ei < E.length; ei++) {
            var dx = P[pi].pos.x - E[ei].pos.x;
            var dy = P[pi].pos.y - E[ei].pos.y;
            var d2 = dx * dx + dy * dy;
            var key = P[pi].id * 1000 + E[ei].id;
            if (d2 < 0.0025) {
              var timer = (pairTimers[key] || 0) + 5 * LOGIC_DT;
              pairTimers[key] = timer;
              if (timer > 2000) res.stuck = true;
            } else {
              pairTimers[key] = 0;
            }
          }
        }
      }
    }
  } catch (e) {
    res.crash = String(e && e.stack ? e.stack : e);
    if (BAD_REASON === null) {
      BAD_REASON = 'phase=' + state.phase + ' round=' + state.round + ' ticks=' + ticks + ' :: ' +
        String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join(' << ');
    }
  }

  res.hash = h;
  res.ticks = ticks;
  if (ticks >= MAX_TICKS && !core.isFinished(state)) res.tickCap = true;
  if (!core.isFinished(state)) res.notFinished = true;
  res.settleScans = settleScans;
  return res;
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
var FAILURES = [];

function report(label, pass, detail) {
  var tag = pass ? 'PASS' : 'FAIL';
  console.log('  ' + label + ': ' + tag + (detail ? '  ' + detail : ''));
  if (!pass) FAILURES.push(label);
}

function testDeterminism(games) {
  console.log('[1/4] 确定性（同 seed 两遍 ' + games + ' 局全量指纹）');
  var difficultyCycle = ['rookie', 'veteran', 'demon'];
  var overall1 = 0;
  var overall2 = 0;
  var ticks1 = 0;
  var ticks2 = 0;
  var mismatch = -1;
  var pass1 = { crash: 0, stuck: 0, nan: 0, tickCap: 0, bad: 0, units: 0, maxErr: 0 };

  var run1 = [];
  for (var i = 0; i < games; i++) {
    var seed = 1000 + i;
    var r = runGame({
      seed: seed,
      difficulty: difficultyCycle[i % 3],
      biasPlayer: null,
      biasEnemy: null,
      mirrorStarters: false,
      disableCoreAi: false
    });
    run1.push(r);
    overall1 = mix(overall1, r.hash);
    ticks1 += r.ticks;
    if (r.crash) pass1.crash++;
    if (r.stuck) pass1.stuck++;
    if (r.nan) pass1.nan++;
    if (r.tickCap || r.notFinished) pass1.tickCap++;
    pass1.bad += r.badUnits;
    pass1.units += r.unitsChecked;
    if (r.maxErr > pass1.maxErr) pass1.maxErr = r.maxErr;
  }
  for (var j = 0; j < games; j++) {
    var seed2 = 1000 + j;
    var r2 = runGame({
      seed: seed2,
      difficulty: difficultyCycle[j % 3],
      biasPlayer: null,
      biasEnemy: null,
      mirrorStarters: false,
      disableCoreAi: false
    });
    overall2 = mix(overall2, r2.hash);
    ticks2 += r2.ticks;
    if (mismatch < 0 && (r2.hash !== run1[j].hash || r2.ticks !== run1[j].ticks)) mismatch = seed2;
  }

  console.log(
    '  第一遍 hash=' + (overall1 >>> 0) + ' ticks=' + ticks1 +
    ' / 第二遍 hash=' + (overall2 >>> 0) + ' ticks=' + ticks2
  );
  if (mismatch >= 0) console.log('  首个不一致 seed=' + mismatch);
  report('determinism', mismatch < 0 && overall1 === overall2 && ticks1 === ticks2);
  return pass1;
}

function testBalance(pairs, gamesPerPair) {
  console.log('[2/4] 平衡（8 动物两两 ' + pairs + ' 组 × ' + gamesPerPair + ' 局；同 seed 交换座位取平均，双方同一策略）');
  var species = core.SPECIES_ORDER;
  var rates = [];
  var pooledWins = {};
  var pooledGames = {};
  for (var k = 0; k < species.length; k++) {
    pooledWins[species[k]] = 0;
    pooledGames[species[k]] = 0;
  }

  var rowHeader = '        ';
  for (var c = 0; c < species.length; c++) rowHeader += pad(species[c].slice(0, 3), 5);
  console.log('  ' + rowHeader + '  (行=玩家倾向, 列=敌方倾向, 数字=玩家胜率%)');

  var seatWins = 0;
  var seatGames = 0;
  for (var a = 0; a < species.length; a++) {
    var row = '  ' + pad(species[a].slice(0, 3), 6);
    for (var b = 0; b < species.length; b++) {
      var winsAB = 0;
      var games = 0;
      for (var g = 0; g < gamesPerPair; g++) {
        var seed = 40000 + g * 7919;
        var r = runGame({
          seed: seed,
          difficulty: 'veteran',
          biasPlayer: species[a],
          biasEnemy: species[b],
          mirrorStarters: MIRROR_ARMY,
          disableCoreAi: true
        });
        var r2 = runGame({
          seed: seed,
          difficulty: 'veteran',
          biasPlayer: species[b],
          biasEnemy: species[a],
          mirrorStarters: MIRROR_ARMY,
          disableCoreAi: true
        });
        if (r.crash || r.tickCap || r.notFinished || r2.crash || r2.tickCap || r2.notFinished) {
          if (BAD_REASON === null) {
            BAD_REASON =
              'phase=' + r.state.phase + ' round=' + r.state.round + ' ticks=' + r.ticks +
              ' crash=' + r.crash + ' | 互换座位 crash=' + r2.crash;
          }
          // 平衡测试里出现异常局：直接计为失败局，并单独上报
          FAILURES.push('balance-game-aborted-' + species[a] + '-' + species[b]);
          continue;
        }
        var w1 = outcomeShare(r.state.outcome, 'player');
        var w2 = outcomeShare(r2.state.outcome, 'player');
        seatWins += w1 + w2;
        seatGames += 2;
        // 同 seed 交换座位后取平均：抵消先手/座位优势，只留物种倾向差异
        var shareA = (w1 + (1 - w2)) / 2;
        winsAB += shareA;
        games++;
        pooledWins[species[a]] += shareA;
        pooledWins[species[b]] += 1 - shareA;
        pooledGames[species[a]] += 1;
        pooledGames[species[b]] += 1;
      }
      var rate = games > 0 ? winsAB / games : 0;
      rates.push({ a: species[a], b: species[b], rate: rate, games: games });
      row += pad((rate * 100).toFixed(0), 5);
    }
    console.log(row);
  }
  console.log(
    '  座位诊断（未交换座位时"玩家位"原始胜率，衡量先手/座位优势）: ' +
    (seatGames > 0 ? (seatWins / seatGames * 100).toFixed(1) : 'n/a') + '%  (' + seatGames + ' 局)'
  );

  console.log('  按物种汇总胜率（对战其余 7 种 + 同种，玩家/敌方两种视角合计）：');
  var pooledOk = true;
  for (var s2 = 0; s2 < species.length; s2++) {
    var rate2 = pooledGames[species[s2]] > 0 ? pooledWins[species[s2]] / pooledGames[species[s2]] : 0;
    var ok = rate2 >= 0.35 && rate2 <= 0.65;
    if (!ok) pooledOk = false;
    console.log(
      '    ' + pad(species[s2], 9) + (rate2 * 100).toFixed(1) + '%  (' + pooledGames[species[s2]] + ' 局)  ' +
      (ok ? 'ok' : 'OUT-OF-RANGE')
    );
  }

  var badPairs = [];
  for (var i = 0; i < rates.length; i++) {
    if (rates[i].rate < 0.35 || rates[i].rate > 0.65) badPairs.push(rates[i]);
  }
  console.log('  64 组中越界数量: ' + badPairs.length);
  for (var q = 0; q < badPairs.length && q < 12; q++) {
    console.log(
      '    ' + badPairs[q].a + ' vs ' + badPairs[q].b + ' = ' + (badPairs[q].rate * 100).toFixed(1) + '%'
    );
  }

  report('balance(all 64 matchups within 35%-65%)', badPairs.length === 0);
  report('balance(pooled per species within 35%-65%)', pooledOk);
  if (BAD_REASON !== null) console.log('  首个异常局原因: ' + BAD_REASON);
}

var BAD_REASON = null;
var ENEMY_FIRST = process.argv.indexOf('--enemy-first') >= 0;
var NO_MARKET = process.argv.indexOf('--no-market') >= 0;
var NO_CMD = process.argv.indexOf('--no-cmd') >= 0;
/* 平衡对照的"同等投入"口径：每方起始兵力 = ARMY_BUDGET / 该物种费用（0 = 旧口径：各 3 只）。 */
var ARMY_BUDGET = 0;
var MIRROR_ARMY = process.argv.indexOf('--mirror-army') >= 0;
for (var abi = 0; abi < process.argv.length; abi++) {
  if (process.argv[abi] === '--budget' && process.argv[abi + 1]) {
    ARMY_BUDGET = parseInt(process.argv[abi + 1], 10);
  }
}

/* 某座位视角的胜分：胜=1 平=0.5 负=0 */
function outcomeShare(outcome, seat) {
  if (outcome === 'draw') return 0.5;
  if (seat === 'player') return outcome === 'win' ? 1 : 0;
  return outcome === 'lose' ? 1 : 0;
}

function pad(s, n) {
  var out = String(s);
  while (out.length < n) out += ' ';
  return out;
}

function main() {
  var t0 = Date.now();
  var argv = process.argv.join(' ');
  var quick = argv.indexOf('--quick') >= 0;
  var games = quick ? 20 : 1000;
  var perPair = quick ? 3 : 20;
  for (var ai2 = 0; ai2 < process.argv.length; ai2++) {
    if (process.argv[ai2] === '--pairs-games' && process.argv[ai2 + 1]) {
      perPair = parseInt(process.argv[ai2 + 1], 10);
    }
  }
  var only = argv.indexOf('--pairs-only') >= 0;
  console.log('=== petbrawl 逻辑核心无头自检 ===');
  console.log(
    'node ' + process.version + '  LOGIC_DT=' + LOGIC_DT + 'ms  ROUNDS=' + core.ECONOMY.ROUNDS +
    (quick ? '  [quick]' : '')
  );

  var pass1 = { crash: 0, stuck: 0, nan: 0, tickCap: 0, bad: 0, units: 0, maxErr: 0 };
  if (!only) {
    pass1 = testDeterminism(games);

    console.log('[3/4] 稳健性（' + games + ' 局不崩/不卡死/不死循环/无 NaN）');
    report(
      'robustness',
      pass1.crash === 0 && pass1.stuck === 0 && pass1.nan === 0 && pass1.tickCap === 0,
      'crash=' + pass1.crash + ' stuck=' + pass1.stuck + ' nan=' + pass1.nan + ' tickCap/未结束=' + pass1.tickCap
    );

    console.log('[4/4] 伤害归因（bySource 各项之和 vs 总伤害，误差 < 1%）');
    report(
      'attribution',
      pass1.bad === 0,
      '检查单位=' + pass1.units + ' 越界=' + pass1.bad +
      ' 最大误差=' + (pass1.maxErr * 100).toFixed(4) + '%'
    );
  }

  testBalance(core.SPECIES_ORDER.length * core.SPECIES_ORDER.length, perPair);

  var dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('=== 用时 ' + dt + 's ===');
  if (FAILURES.length > 0) {
    console.log('FAILURES: ' + FAILURES.join(', '));
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
  process.exit(0);
}

main();
