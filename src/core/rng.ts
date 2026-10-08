/**
 * 确定性伪随机数（§1 硬约束：禁止裸 Math.random）。
 * mulberry32 变体：32 位整数状态，纯函数式推进，跨端一致。
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  // 保证非零、在 32 位内
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return { s };
}

/** 推进并返回 [0,1) 浮点。 */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** [min,max] 整数。 */
export function nextInt(rng: RngState, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

/** [min,max) 浮点。 */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

/** 按权重抽取下标；weights 之和不必须为 1。 */
export function pickWeighted(rng: RngState, weights: number[]): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return 0;
  let r = nextFloat(rng) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** 洗牌（返回新数组，Fisher–Yates）。 */
export function shuffled<T>(rng: RngState, arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** 克隆状态（用于回放/自检不污染主线）。 */
export function cloneRng(rng: RngState): RngState {
  return { s: rng.s };
}

/** 状态指纹（无头自检用：同种子同操作序列必须得到同一指纹）。 */
export function rngFingerprint(rng: RngState): number {
  return rng.s >>> 0;
}