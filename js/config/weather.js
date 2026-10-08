"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEATHER_COMBOS = exports.WEATHER_CARDS = void 0;
exports.resolveWeather = resolveWeather;
exports.weatherDef = weatherDef;
exports.WEATHER_CARDS = [
    {
        id: 'sunny', cn: '晴 · 林间光', short: '晴', cost: 2, tintKey: 'sunbeam',
        self: { atkMul: 0.12, synergy: [{ family: 'cat', atkSpeedMul: 0.08 }] },
        enemy: { drainPct: 0.01, drainInterval: 3000 },
        selfLines: ['我方：攻击 +12%', '猫科攻速 +8%'],
        enemyLines: ['敌方：每 3s 流失 1% HP', '（脱水）']
    },
    {
        id: 'misty', cn: '阴 · 薄雾', short: '阴', cost: 2, tintKey: 'moss',
        self: { dmgReduce: 0.18, synergy: [{ family: 'dog', moveMul: 0.15 }] },
        enemy: { moveMul: -0.15, targetDelay: 500 },
        selfLines: ['我方：受伤 -18%', '犬科移速 +15%'],
        enemyLines: ['敌方：移速 -15%', '索敌延迟 +0.5s']
    },
    {
        id: 'rainy', cn: '雨 · 骤雨', short: '雨', cost: 2, tintKey: 'stream',
        self: { regenPct: 0.012, regenInterval: 2000, synergy: [{ family: 'elephant', hpMaxMul: 0.15 }] },
        enemy: { atkSpeedMul: -0.12, synergy: [] },
        selfLines: ['我方：每 2s 回 1.2% HP', '象 HP 上限 +15%'],
        enemyLines: ['敌方：攻速 -12%', '鼠移速 -20%']
    }
];
/** 中和表（§7.4）：键为两个基础天气 id 排序后拼接。 */
exports.WEATHER_COMBOS = {
    'rainy|sunny': {
        id: 'rainbow', cn: '🌈 彩虹',
        both: { atkSpeedMul: 0.10, regenPct: 0.005, regenInterval: 1000 },
        lines: ['双方攻速 +10%', '每秒回 0.5% HP']
    },
    'misty|sunny': {
        id: 'cloudy', cn: '⛅ 多云',
        both: { critBonus: 0.15 },
        lines: ['双方暴击率 +15%']
    },
    'misty|rainy': {
        id: 'thunder', cn: '⛈ 雷雨',
        both: { atkSpeedMul: 0.10, drainPct: 0.01, drainInterval: 2000, drainOnCurrent: true },
        lines: ['双方攻速 +10%', '每 2s 受 1% 当前 HP 电击']
    }
};
function resolveWeather(playerW, enemyW) {
    if (playerW === enemyW) {
        return { id: 'none', cn: '无天气', player: {}, enemy: {}, neutralized: true, lines: ['双方天气相同 → 抵消'] };
    }
    var ids = [playerW, enemyW];
    var basics = ['sunny', 'misty', 'rainy'];
    var pBasic = basics.indexOf(playerW) >= 0;
    var eBasic = basics.indexOf(enemyW) >= 0;
    if (pBasic && eBasic) {
        var key = ids.slice().sort().join('|');
        var combo = exports.WEATHER_COMBOS[key];
        if (combo) {
            return { id: combo.id, cn: combo.cn, player: combo.both, enemy: combo.both, neutralized: true, lines: combo.lines };
        }
    }
    var pDef = weatherDef(playerW);
    var eDef = weatherDef(enemyW);
    return {
        id: playerW !== 'none' ? playerW : enemyW,
        cn: (pDef ? pDef.cn : '') + (eDef && playerW !== 'none' ? ' / ' + eDef.cn : ''),
        player: pDef ? pDef.self : {},
        enemy: eDef ? eDef.enemy : {},
        neutralized: false,
        lines: []
    };
}
function weatherDef(id) {
    for (var i = 0; i < exports.WEATHER_CARDS.length; i++)
        if (exports.WEATHER_CARDS[i].id === id)
            return exports.WEATHER_CARDS[i];
    return null;
}
