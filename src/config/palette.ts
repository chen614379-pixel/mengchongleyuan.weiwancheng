/**
 * 全局色板（§2.2）—— 全项目唯一取色来源。
 * 硬规则：禁止在任何逻辑/渲染代码里写魔法颜色值；描边只能取 inkSoft。
 */
export const PALETTE = {
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

export type PaletteKey = keyof typeof PALETTE;

/** 阵营区分律（§2.2）：我方永远偏暖绿，敌方永远偏暮紫。 */
export const FACTION_COLOR = {
  player: PALETTE.leafMid,
  playerDeep: PALETTE.forestMid,
  enemy: PALETTE.twilight,
  enemyDeep: PALETTE.forestDeep
};

/** 血量环配色（§2.8）：>60% / 30~60% / <30%。 */
export const HP_RING_COLOR = {
  high: PALETTE.leafLight,
  mid: PALETTE.sunset,
  low: PALETTE.berry,
  track: PALETTE.forestDeep,
  ghost: PALETTE.blossom,
  shield: PALETTE.stream
};

/**
 * 把任意「本工程可能出现的颜色写法」归一成 [r,g,b]：
 * `#rgb` / `#rrggbb` / `rgb(r,g,b)` / `rgba(r,g,b,a)`。
 * 必须容错，因为 fillWatercolor() 会把 tint() 的结果再 tint 一次。
 */
export function colorChannels(color: string): number[] {
  const c = (color || '').trim();
  if (c.charAt(0) === '#') {
    let h = c.substring(1);
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    return [
      parseInt(h.substring(0, 2), 16) || 0,
      parseInt(h.substring(2, 4), 16) || 0,
      parseInt(h.substring(4, 6), 16) || 0
    ];
  }
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',');
    return [
      Math.max(0, Math.min(255, Math.round(parseFloat(p[0]) || 0))),
      Math.max(0, Math.min(255, Math.round(parseFloat(p[1]) || 0))),
      Math.max(0, Math.min(255, Math.round(parseFloat(p[2]) || 0)))
    ];
  }
  return [0, 0, 0];
}

function hex2(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return (v < 16 ? '0' : '') + v.toString(16);
}

/** [r,g,b] → '#rrggbb'（下游一律拿到 hex，避免 rgb() 反哺 tint 出 NaN）。 */
export function toHex(hex: string): string {
  const c = colorChannels(hex);
  return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
}

/** 数值调色工具（渲染层用；保持 8% 环境色的「不纯」原则）。 */
export function rgba(hex: string, alpha: number): string {
  const c = colorChannels(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
}

/** 与 paper 混合，得到「至少含 8% 环境色」的浅色。 */
export function tint(hex: string, amount: number, toward: string = PALETTE.paper): string {
  const a = colorChannels(hex);
  const b = colorChannels(toward);
  const r = Math.round(a[0] + (b[0] - a[0]) * amount);
  const g = Math.round(a[1] + (b[1] - a[1]) * amount);
  const bl = Math.round(a[2] + (b[2] - a[2]) * amount);
  return '#' + hex2(r) + hex2(g) + hex2(bl);
}