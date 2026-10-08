"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRng = createRng;
exports.nextFloat = nextFloat;
exports.nextInt = nextInt;
exports.nextRange = nextRange;
exports.pickWeighted = pickWeighted;
exports.shuffled = shuffled;
exports.cloneRng = cloneRng;
exports.rngFingerprint = rngFingerprint;
function createRng(seed) {
    // 保证非零、在 32 位内
    var s = seed >>> 0;
    if (s === 0)
        s = 0x9e3779b9;
    return { s: s };
}
/** 推进并返回 [0,1) 浮点。 */
function nextFloat(rng) {
    rng.s = (rng.s + 0x6d2b79f5) >>> 0;
    var t = rng.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** [min,max] 整数。 */
function nextInt(rng, min, max) {
    if (max <= min)
        return min;
    return min + Math.floor(nextFloat(rng) * (max - min + 1));
}
/** [min,max) 浮点。 */
function nextRange(rng, min, max) {
    return min + nextFloat(rng) * (max - min);
}
/** 按权重抽取下标；weights 之和不必须为 1。 */
function pickWeighted(rng, weights) {
    var total = 0;
    for (var i = 0; i < weights.length; i++)
        total += weights[i];
    if (total <= 0)
        return 0;
    var r = nextFloat(rng) * total;
    for (var i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0)
            return i;
    }
    return weights.length - 1;
}
/** 洗牌（返回新数组，Fisher–Yates）。 */
function shuffled(rng, arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
        var j = nextInt(rng, 0, i);
        var tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}
/** 克隆状态（用于回放/自检不污染主线）。 */
function cloneRng(rng) {
    return { s: rng.s };
}
/** 状态指纹（无头自检用：同种子同操作序列必须得到同一指纹）。 */
function rngFingerprint(rng) {
    return rng.s >>> 0;
}
