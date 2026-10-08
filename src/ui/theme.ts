/**
 * 全局排版 token（§2.4）。
 *
 * 颜色一律从 `config/palette` 取，字号/圆角/描边宽度一律从 `config/layout` 取，
 * 渲染层不得再出现任何魔法色值与魔法字号。
 */
import { LAYOUT } from '../config/layout';
import { PALETTE } from '../config/palette';

export const FONT = LAYOUT.FONT;
export const FONT_FAMILY = LAYOUT.FONT_FAMILY;

/** 圆角（§2.4：UI 圆角 ≥14，且必须手绘不完美）。 */
export const RADIUS = {
  card: LAYOUT.CARD.radius,
  panel: LAYOUT.PANEL_RADIUS,
  button: LAYOUT.BUTTON_RADIUS,
  entry: LAYOUT.ENTRY.radius,
  badge: 18,
  small: 14,
};

export const STROKE = LAYOUT.STROKE;
export const SHADOW = LAYOUT.SHADOW;

/** 面板/卡面的内边距与行高统一定义，避免各模块各写一套。 */
export const METRIC = {
  pad: 10,
  gap: 8,
  lineGap: 6,
  iconSm: 18,
  iconMd: 24,
  iconLg: 32,
  badge: 22,
  ringGap: LAYOUT.RING.gap,
  ringWidth: LAYOUT.RING.width,
  ringTrack: LAYOUT.RING.trackWidth,
  sidebarRing: LAYOUT.RING.sidebarRadius,
  sidebarRingWidth: LAYOUT.RING.sidebarWidth,
};

export type FontWeight = 'normal' | 'bold' | number;
export type TextAlign = 'left' | 'center' | 'right';

export function setFont(ctx: CanvasRenderingContext2D, size: number, weight?: FontWeight): void {
  ctx.font = (weight || 'normal') + ' ' + size + 'px ' + FONT_FAMILY;
}

/** 文本宽度（会顺带设置字体）。 */
export function measure(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  weight?: FontWeight,
): number {
  setFont(ctx, size, weight);
  return ctx.measureText(text).width;
}

/**
 * 带 creamMist 描边的标题文字（§2.4：标题额外 2px creamMist 描边 + 轻微手绘抖动）。
 * 抖动只是 0.4px 级的两次微偏移描边，不改变可读性。
 *
 * 【为什么有第 8 个参数】浅色底（绿叶木牌 / 阳光色底）上「奶油字 + 奶油描边」是同色叠加，
 * 笔画糊成一团；这类底必须换成深色描边，所以描边色允许覆盖，默认仍是 creamMist。
 */
export function textOutlined(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align?: TextAlign,
  outlineWidth?: number,
  outlineColor?: string,
): void {
  ctx.save();
  setFont(ctx, size, 'bold');
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = outlineWidth === undefined ? 2 : outlineWidth;
  ctx.strokeStyle = outlineColor === undefined ? PALETTE.creamMist : outlineColor;
  ctx.strokeText(text, x, y);
  ctx.strokeText(text, x + 0.4, y + 0.3);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 普通正文文字（无描边）。 */
export function textPlain(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align?: TextAlign,
  weight?: FontWeight,
): void {
  ctx.save();
  setFont(ctx, size, weight || 'normal');
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 自动缩小字号直到塞进 maxWidth（卡面/条目标题用）。 */
export function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize?: number,
): number {
  const floor = minSize === undefined ? 12 : minSize;
  let size = startSize;
  while (size > floor && measure(ctx, text, size, 'bold') > maxWidth) size -= 1;
  return size;
}

/** 超宽截断（带省略号）。 */
export function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  weight?: FontWeight,
): string {
  if (measure(ctx, text, size, weight) <= maxWidth) return text;
  let out = text;
  while (out.length > 0 && measure(ctx, out + '…', size, weight) > maxWidth) {
    out = out.substring(0, out.length - 1);
  }
  return out + '…';
}

/**
 * 简易换行（按字符宽度折行，中文友好；返回实际绘制行数）。
 * 不依赖 Intl/ES2015 API，纯 ES5。
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  color: string,
  align?: TextAlign,
  maxLines?: number,
): number {
  const limit = maxLines === undefined ? 3 : maxLines;
  const chars = text.split('');
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < chars.length; i++) {
    const next = cur + chars[i];
    if (measure(ctx, next, size) > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = chars[i];
      if (lines.length >= limit) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < limit && cur.length > 0) lines.push(cur);
  let startY = y;
  if (align === 'center') startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    textPlain(ctx, lines[i], x, startY + i * lineHeight, size, color, align, 'normal');
  }
  return lines.length;
}