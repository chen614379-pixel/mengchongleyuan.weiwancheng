"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HP_RING_COLOR = exports.FACTION_COLOR = exports.PALETTE = void 0;
exports.colorChannels = colorChannels;
exports.toHex = toHex;
exports.rgba = rgba;
exports.tint = tint;
/**
 * 全局色板（§2.2）—— 全项目唯一取色来源。
 * 硬规则：禁止在任何逻辑/渲染代码里写魔法颜色值；描边只能取 inkSoft。
 */
exports.PALETTE = {
    forestDeep: '#2E4A3A',
    forestMid: '#46684E',
    leafMid: '#5C8A5E',
    leafLight: '#8FBF72',
    moss: '#A8C686',
    meadow: '#D9E7BC',
    bark: '#6B4F3A',
    barkLight: '#A67C52',
    soil: '#C9A87C',
    creamMist: '#F5EFE1',
    paper: '#FFFBF0',
    skyWarm: '#BFE0E8',
    sunset: '#F2B880',
    sunbeam: '#FFE9A8',
    blossom: '#E89AB0',
    berry: '#C75146',
    stream: '#7FB6C9',
    twilight: '#7A5C8A',
    inkSoft: '#3B3229'
};
/** 阵营区分律（§2.2）：我方永远偏暖绿，敌方永远偏暮紫。 */
exports.FACTION_COLOR = {
    player: exports.PALETTE.leafMid,
    playerDeep: exports.PALETTE.forestMid,
    enemy: exports.PALETTE.twilight,
    enemyDeep: exports.PALETTE.forestDeep
};
/** 血量环配色（§2.8）：>60% / 30~60% / <30%。 */
exports.HP_RING_COLOR = {
    high: exports.PALETTE.leafLight,
    mid: exports.PALETTE.sunset,
    low: exports.PALETTE.berry,
    track: exports.PALETTE.forestDeep,
    ghost: exports.PALETTE.blossom,
    shield: exports.PALETTE.stream
};
/**
 * 把任意「本工程可能出现的颜色写法」归一成 [r,g,b]：
 * `#rgb` / `#rrggbb` / `rgb(r,g,b)` / `rgba(r,g,b,a)`。
 * 必须容错，因为 fillWatercolor() 会把 tint() 的结果再 tint 一次。
 */
function colorChannels(color) {
    var c = (color || '').trim();
    if (c.charAt(0) === '#') {
        var h = c.substring(1);
        if (h.length === 3) {
            h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        }
        return [
            parseInt(h.substring(0, 2), 16) || 0,
            parseInt(h.substring(2, 4), 16) || 0,
            parseInt(h.substring(4, 6), 16) || 0
        ];
    }
    var m = c.match(/rgba?\(([^)]+)\)/i);
    if (m) {
        var p = m[1].split(',');
        return [
            Math.max(0, Math.min(255, Math.round(parseFloat(p[0]) || 0))),
            Math.max(0, Math.min(255, Math.round(parseFloat(p[1]) || 0))),
            Math.max(0, Math.min(255, Math.round(parseFloat(p[2]) || 0)))
        ];
    }
    return [0, 0, 0];
}
function hex2(n) {
    var v = Math.max(0, Math.min(255, Math.round(n)));
    return (v < 16 ? '0' : '') + v.toString(16);
}
/** [r,g,b] → '#rrggbb'（下游一律拿到 hex，避免 rgb() 反哺 tint 出 NaN）。 */
function toHex(hex) {
    var c = colorChannels(hex);
    return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
}
/** 数值调色工具（渲染层用；保持 8% 环境色的「不纯」原则）。 */
function rgba(hex, alpha) {
    var c = colorChannels(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
}
/** 与 paper 混合，得到「至少含 8% 环境色」的浅色。 */
function tint(hex, amount, toward) {
    if (toward === void 0) { toward = exports.PALETTE.paper; }
    var a = colorChannels(hex);
    var b = colorChannels(toward);
    var r = Math.round(a[0] + (b[0] - a[0]) * amount);
    var g = Math.round(a[1] + (b[1] - a[1]) * amount);
    var bl = Math.round(a[2] + (b[2] - a[2]) * amount);
    return '#' + hex2(r) + hex2(g) + hex2(bl);
}
