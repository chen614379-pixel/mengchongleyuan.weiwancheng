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
/**
 * 32 位有符号整数乘法，逐位等价 `Math.imul`。
 *
 * 自己实现而不调用 `Math.imul`：它是 ES2015 API，而 tsconfig 的 lib 只有 ES5 +
 * ES2015.Iterable，此前靠 `core/index.ts` 里的 `declare global` 打类型补丁；
 * 老版本 iOS JSCore 甚至可能没有这个函数。标准位运算版本与内置实现结果一致
 * （`.dev/rng-check.js` 用随机值对拍 + 序列比对验证）。
 */
function imul32(a, b) {
    var aHi = (a >>> 16) & 0xffff;
    var aLo = a & 0xffff;
    var bHi = (b >>> 16) & 0xffff;
    var bLo = b & 0xffff;
    return (aLo * bLo + (((aHi * bLo + aLo * bHi) << 16) >>> 0)) | 0;
}
/** 推进并返回 [0,1) 浮点。 */
function nextFloat(rng) {
    rng.s = (rng.s + 0x6d2b79f5) >>> 0;
    var t = rng.s;
    t = imul32(t ^ (t >>> 15), t | 1);
    t ^= t + imul32(t ^ (t >>> 7), t | 61);
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
