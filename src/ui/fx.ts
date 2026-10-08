/**
 * 粒子与瞬时特效系统（§2.7 动效 / §4.3 落点反馈 / §8.2 指令气泡）。
 *
 * 设计约束：
 * - 纯表现层：只被 render 调用，绝不影响 core 状态。
 * - 同屏动画预算 ≤ `TIMING.ANIM_BUDGET`（48），超出时丢弃优先级最低的粒子。
 * - 一切形状走 `ui/brush`（手绘抖动），颜色只来自 `PALETTE`。
 * - 固定种子噪声，保证同种子观感一致（不影响逻辑确定性）。
 */
import { PALETTE, rgba } from '../config/palette';
import { LAYOUT } from '../config/layout';
import { TIMING } from '../config/timing';
import { clamp01, ease, easeOutQuad, lerp } from './ease';
import { P, blobPath, strokeInk } from './brush';

const FX_FONT_SMALL = 'bold 18px ' + LAYOUT.FONT_FAMILY;

export type FxLayer = 'back' | 'front';

/** 粒子（叶、草屑、萤火虫、光尘、雨滴、spark……）。 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  alpha: number;
  rot: number;
  vrot: number;
  grav: number;
  drag: number;
  layer: FxLayer;
  kind: number; // 0 叶 1 草屑 2 萤火虫 3 光尘 4 花瓣 5 雨花 6 火花 7 墨花
  seed: number;
  priority: number;
}

/** 浮动文字（伤害/治疗/护盾/绕行时间）。 */
interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
  rise: number;
  emphasis: number;
}

/** 苔藓光斑（落点反馈，0.8s 呼吸 + 收束）。 */
interface MossPatch {
  x: number;
  y: number;
  life: number;
  max: number;
  r: number;
  strength: number;
}

/** 苔藓涟漪（0.25s 草叶涟漪）。 */
interface Ripple {
  x: number;
  y: number;
  life: number;
  max: number;
  r0: number;
  r1: number;
}

/** 指令气泡（0.4s 飞行，到达时触发回调 = 指令生效）。 */
interface Bubble {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  life: number;
  max: number;
  label: string;
  fired: boolean;
  onArrive: (() => void) | null;
}

interface Pending {
  at: number;
  fn: () => void;
}

export interface FxSystem {
  update(dtMs: number): void;
  draw(ctx: CanvasRenderingContext2D, time: number, layer: FxLayer): void;

  grassBits(x: number, y: number, n: number): void;
  hitLeaves(x: number, y: number, dirX: number, n: number): void;
  fireflyBurst(x: number, y: number, n: number): void;
  dust(x: number, y: number, n: number): void;
  petals(x: number, y: number, n: number): void;
  rainSplash(x: number, y: number, n: number): void;
  inkFlower(x: number, y: number, dirX: number): void;
  slashArc(x: number, y: number, dirX: number): void;

  moss(x: number, y: number, r: number, strength?: number): void;
  ripple(x: number, y: number, r0: number, r1: number): void;
  clearMoss(): void;

  floatText(x: number, y: number, text: string, color: string, size?: number, emphasis?: number): void;
  damage(x: number, y: number, amount: number, opts?: { counter?: boolean; crit?: boolean; source?: string }): void;
  heal(x: number, y: number, amount: number): void;
  shield(x: number, y: number, amount: number): void;

  bubble(fromX: number, fromY: number, toX: number, toY: number, label: string, onArrive?: () => void): void;
  after(ms: number, fn: () => void): void;

  shake(amount: number): void;
  shakeOffset(time: number): { x: number; y: number };
  count(): number;
  clear(): void;
}

/** 特效优先级：数值越小越先被丢弃。 */
const PRIO = {
  dust: 1,
  rain: 2,
  petal: 2,
  grass: 3,
  leaf: 4,
  ink: 5,
  firefly: 6,
  spark: 6,
};

export function createFx(): FxSystem {
  const parts: Particle[] = [];
  const texts: FloatText[] = [];
  const mosses: MossPatch[] = [];
  const ripples: Ripple[] = [];
  const bubbles: Bubble[] = [];
  const pendings: Pending[] = [];

  let now = 0;
  let shakeAmp = 0;
  let shakeUntil = 0;

  function budgetRoom(): number {
    const used = parts.length + texts.length + mosses.length + ripples.length;
    return TIMING.ANIM_BUDGET - used;
  }

  function push(p: Particle): void {
    if (budgetRoom() <= 0) {
      // 丢弃优先级最低、且剩余寿命最短的粒子（保留视觉冲击大的）
      let worst = -1;
      let worstScore = p.priority;
      for (let i = 0; i < parts.length; i++) {
        const q = parts[i];
        const score = q.priority - (q.life / q.max) * 0.9;
        if (score <= worstScore) {
          worstScore = score;
          worst = i;
        }
      }
      if (worst < 0 || p.priority <= parts[worst].priority) return;
      parts.splice(worst, 1);
    }
    parts.push(p);
  }

  function seedOf(): number {
    return (now * 7.13 + parts.length * 3.77) % 97;
  }

  function spawn(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    opts?: { alpha?: number; grav?: number; drag?: number; layer?: FxLayer; priority?: number; vrot?: number },
  ): void {
    const o = opts || {};
    push({
      x,
      y,
      vx,
      vy,
      life,
      max: life,
      size,
      color,
      alpha: o.alpha === undefined ? 1 : o.alpha,
      rot: seedOf(),
      vrot: o.vrot === undefined ? (seedOf() - 48) * 0.0016 : o.vrot,
      grav: o.grav === undefined ? 0 : o.grav,
      drag: o.drag === undefined ? 0.0022 : o.drag,
      layer: o.layer === undefined ? 'front' : o.layer,
      kind,
      seed: seedOf(),
      priority: o.priority === undefined ? 3 : o.priority,
    });
  }

  const sys: FxSystem = {
    update(dtMs: number): void {
      now += dtMs;
      const d = dtMs;

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= d;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        p.vy += p.grav * d;
        const k = 1 - p.drag * d;
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * d;
        p.y += p.vy * d;
        p.rot += p.vrot * d;
      }

      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        t.life -= d;
        if (t.life <= 0) texts.splice(i, 1);
      }

      for (let i = mosses.length - 1; i >= 0; i--) {
        const m = mosses[i];
        m.life -= d;
        if (m.life <= 0) mosses.splice(i, 1);
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.life -= d;
        if (r.life <= 0) ripples.splice(i, 1);
      }

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.life -= d;
        if (!b.fired && b.life <= b.max * 0.28) {
          b.fired = true;
          if (b.onArrive) b.onArrive();
        }
        if (b.life <= 0) bubbles.splice(i, 1);
      }

      for (let i = pendings.length - 1; i >= 0; i--) {
        if (now >= pendings[i].at) {
          const fn = pendings[i].fn;
          pendings.splice(i, 1);
          fn();
        }
      }

      if (shakeAmp > 0 && now >= shakeUntil) shakeAmp = 0;
    },

    draw(ctx: CanvasRenderingContext2D, time: number, layer: FxLayer): void {
      // 光斑（在单位之下）→ 涟漪 → 叶/草屑 → 萤火虫 → 墨花
      if (layer === 'back') {
        for (let i = 0; i < mosses.length; i++) drawMoss(ctx, mosses[i], time);
        for (let i = 0; i < ripples.length; i++) drawRipple(ctx, ripples[i]);
      }

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p.layer !== layer) continue;
        const t = 1 - p.life / p.max;
        const a = p.alpha * (p.kind === 2 ? fadeInOut(t) : 1 - t * t);
        if (a <= 0.01) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * 0.02);
        switch (p.kind) {
          case 0: // 叶
            drawLeaf(ctx, p.size, p.color);
            break;
          case 1: // 草屑（小程序 canvas 不保证 ellipse，用线段代替，观感一致）
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size * 0.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-p.size * 0.7, 0);
            ctx.lineTo(p.size * 0.7, 0);
            ctx.stroke();
            break;
          case 2: // 萤火虫
            drawFirefly(ctx, p.size, p.color, time, p.seed);
            break;
          case 3: // 光尘
            ctx.fillStyle = rgba(PALETTE.sunbeam, 0.7 * (0.5 + 0.5 * Math.sin(time / 220 + p.seed)));
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 4: // 花瓣
            drawPetal(ctx, p.size, p.color);
            break;
          case 5: // 雨花
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(1.6, 1.6);
            ctx.moveTo(0, 1.8);
            ctx.lineTo(1.6, 0.2);
            ctx.stroke();
            break;
          case 6: // 火花
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(-p.size, 0);
            ctx.lineTo(p.size, 0);
            ctx.stroke();
            break;
          default: // 墨花
            drawInkFlower(ctx, p.size, p.color, p.seed);
            break;
        }
        ctx.restore();
      }

      if (layer === 'front') {
        for (let i = 0; i < bubbles.length; i++) drawBubble(ctx, bubbles[i]);
        for (let i = 0; i < texts.length; i++) drawFloat(ctx, texts[i]);
      }
    },

    grassBits(x: number, y: number, n: number): void {
      const c = Math.max(1, Math.min(n, 4));
      for (let i = 0; i < c; i++) {
        spawn(
          1,
          x + (seedOf() % 12) - 6,
          y + (seedOf() % 6) - 3,
          ((seedOf() % 100) - 50) * 0.0016,
          -0.045 - (seedOf() % 30) * 0.0008,
          520 + (seedOf() % 240),
          2.4 + (seedOf() % 6) * 0.3,
          i % 2 === 0 ? PALETTE.moss : PALETTE.leafLight,
          { grav: 0.00022, priority: PRIO.grass },
        );
      }
    },

    hitLeaves(x: number, y: number, dirX: number, n: number): void {
      const c = Math.max(1, Math.min(n, 3));
      for (let i = 0; i < c; i++) {
        spawn(
          0,
          x + ((seedOf() % 10) - 5),
          y - 6 - (seedOf() % 8),
          (dirX >= 0 ? 1 : -1) * (0.03 + (seedOf() % 40) * 0.0012),
          -0.05 - (seedOf() % 30) * 0.0012,
          700 + (seedOf() % 300),
          5 + (seedOf() % 3),
          seedOf() % 2 === 0 ? PALETTE.leafMid : PALETTE.leafLight,
          { grav: 0.00016, priority: PRIO.leaf, drag: 0.0014 },
        );
      }
    },

    fireflyBurst(x: number, y: number, n: number): void {
      const c = Math.max(1, Math.min(n, 6));
      for (let i = 0; i < c; i++) {
        const a = (seedOf() / 97) * Math.PI * 2;
        const sp = 0.02 + (seedOf() % 30) * 0.0012;
        spawn(2, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.02, 900 + (seedOf() % 400), 6 + (seedOf() % 5), PALETTE.sunbeam, {
          grav: -0.00003,
          priority: PRIO.firefly,
          drag: 0.0016,
        });
      }
    },

    dust(x: number, y: number, n: number): void {
      const c = Math.max(1, Math.min(n, 3));
      for (let i = 0; i < c; i++) {
        spawn(3, x, y, ((seedOf() % 40) - 20) * 0.0008, -0.008 - (seedOf() % 10) * 0.0006, 1400, 2 + (seedOf() % 3), PALETTE.sunbeam, {
          priority: PRIO.dust,
          drag: 0.0006,
        });
      }
    },

    petals(x: number, y: number, n: number): void {
      const c = Math.max(1, Math.min(n, 4));
      for (let i = 0; i < c; i++) {
        spawn(4, x + (seedOf() % 40) - 20, y - 20, ((seedOf() % 40) - 20) * 0.0009, 0.012 + (seedOf() % 20) * 0.0006, 2400, 4 + (seedOf() % 3), PALETTE.blossom, {
          priority: PRIO.petal,
          drag: 0.0004,
          layer: 'back',
        });
      }
    },

    rainSplash(x: number, y: number, n: number): void {
      const c = Math.max(1, Math.min(n, 3));
      for (let i = 0; i < c; i++) {
        spawn(5, x + (seedOf() % 16) - 8, y, 0, 0, 260, 3, PALETTE.stream, { priority: PRIO.rain, layer: 'back' });
      }
    },

    inkFlower(x: number, y: number, dirX: number): void {
      spawn(7, x + (dirX >= 0 ? 6 : -6), y - 4, 0, -0.004, 300, 12, PALETTE.inkSoft, { priority: PRIO.ink });
    },

    slashArc(x: number, y: number, dirX: number): void {
      spawn(6, x + (dirX >= 0 ? 10 : -10), y - 2, (dirX >= 0 ? 1 : -1) * 0.02, -0.008, 220, 12, PALETTE.paper, { priority: PRIO.spark });
    },

    moss(x: number, y: number, r: number, strength?: number): void {
      // 同一落点只保留最新一圈
      for (let i = mosses.length - 1; i >= 0; i--) {
        const m = mosses[i];
        const dx = m.x - x;
        const dy = m.y - y;
        if (dx * dx + dy * dy < 12 * 12) mosses.splice(i, 1);
      }
      mosses.push({ x, y, life: 800, max: 800, r, strength: strength === undefined ? 1 : strength });
      ripples.push({ x, y, life: 250, max: 250, r0: r * 0.5, r1: r * 1.7 });
    },

    ripple(x: number, y: number, r0: number, r1: number): void {
      ripples.push({ x, y, life: 250, max: 250, r0, r1 });
    },

    clearMoss(): void {
      mosses.length = 0;
      ripples.length = 0;
    },

    floatText(x: number, y: number, text: string, color: string, size?: number, emphasis?: number): void {
      texts.push({
        x,
        y,
        text,
        color,
        life: 900,
        max: 900,
        size: size === undefined ? 22 : size,
        rise: 34,
        emphasis: emphasis === undefined ? 1 : emphasis,
      });
    },

    damage(x: number, y: number, amount: number, opts?: { counter?: boolean; crit?: boolean; source?: string }): void {
      const o = opts || {};
      const n = Math.max(1, Math.round(amount));
      const label = o.counter ? n + '!' : '' + n;
      const color = o.counter ? PALETTE.sunbeam : PALETTE.berry;
      const size = (o.crit ? 30 : 24) * (o.counter ? 1.2 : 1);
      sys.floatText(x, y + 2, label, color, size, o.counter || o.crit ? 1.25 : 1);
      sys.inkFlower(x, y, 1);
    },

    heal(x: number, y: number, amount: number): void {
      sys.floatText(x, y, '+' + Math.max(1, Math.round(amount)), PALETTE.leafLight, 20, 0.9);
    },

    shield(x: number, y: number, amount: number): void {
      sys.floatText(x, y, '⛨' + Math.max(1, Math.round(amount)), PALETTE.stream, 20, 0.9);
      ripples.push({ x, y, life: 400, max: 400, r0: 10, r1: 30 });
    },

    bubble(fromX: number, fromY: number, toX: number, toY: number, label: string, onArrive?: () => void): void {
      bubbles.push({
        fromX,
        fromY,
        toX,
        toY,
        life: TIMING.COMMAND_FLIGHT,
        max: TIMING.COMMAND_FLIGHT,
        label,
        fired: false,
        onArrive: onArrive || null,
      });
    },

    after(ms: number, fn: () => void): void {
      pendings.push({ at: now + ms, fn });
    },

    shake(amount: number): void {
      shakeAmp = Math.max(shakeAmp, amount);
      shakeUntil = now + 180;
    },

    shakeOffset(time: number): { x: number; y: number } {
      if (shakeAmp <= 0) return { x: 0, y: 0 };
      const k = shakeAmp;
      return {
        x: Math.sin(time / 21) * k,
        y: Math.cos(time / 17) * k * 0.7,
      };
    },

    count(): number {
      return parts.length + texts.length + mosses.length + ripples.length;
    },

    clear(): void {
      parts.length = 0;
      texts.length = 0;
      mosses.length = 0;
      ripples.length = 0;
      bubbles.length = 0;
      pendings.length = 0;
      shakeAmp = 0;
    },
  };

  return sys;
}

function fadeInOut(t: number): number {
  return t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
}

function drawLeaf(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(0, -size * 0.75, size, 0);
  ctx.quadraticCurveTo(0, size * 0.75, -size, 0);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha *= 0.5;
  strokeInk(
    ctx,
    [
      { x: -size, y: 0 },
      { x: 0, y: 0 },
      { x: size, y: 0 },
    ] as P[],
    { width: 1.1, jitter: 0.7 },
  );
}

function drawPetal(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  ctx.fillStyle = color;
  blobPath(ctx, -size, -size * 0.7, size * 2, size * 1.4, 1.6, 3);
  ctx.fill();
}

function drawFirefly(ctx: CanvasRenderingContext2D, size: number, color: string, time: number, seed: number): void {
  const pulse = 0.6 + 0.4 * Math.sin(time / 180 + seed);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.4);
  g.addColorStop(0, rgba(color, 0.75 * pulse));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(PALETTE.creamMist, 0.9 * pulse);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

function drawInkFlower(ctx: CanvasRenderingContext2D, size: number, color: string, seed: number): void {
  ctx.strokeStyle = rgba(color, 0.7);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed * 0.02;
    const r = size * (0.55 + 0.45 * ((i % 3) / 2));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
}

function drawMoss(ctx: CanvasRenderingContext2D, m: MossPatch, time: number): void {
  const t = 1 - m.life / m.max;
  const breathe = 0.5 + 0.5 * Math.sin((time / 800) * Math.PI * 2);
  const scale = 1 + 0.06 * breathe;
  const a = (1 - t) * m.strength;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.scale(scale, scale * 0.62);
  ctx.globalAlpha = 0.35 * a;
  ctx.fillStyle = PALETTE.leafLight;
  blobPath(ctx, -m.r, -m.r, m.r * 2, m.r * 2, 3.2, 11);
  ctx.fill();
  ctx.globalAlpha = 0.28 * a;
  ctx.strokeStyle = PALETTE.moss;
  ctx.lineWidth = 2;
  blobPath(ctx, -m.r * 0.82, -m.r * 0.82, m.r * 1.64, m.r * 1.64, 2.4, 17);
  ctx.stroke();
  ctx.restore();
}

function drawRipple(ctx: CanvasRenderingContext2D, r: Ripple): void {
  const t = 1 - r.life / r.max;
  const rr = lerp(r.r0, r.r1, easeOutQuad(t));
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(1, 0.55);
  ctx.globalAlpha = (1 - t) * 0.45;
  ctx.strokeStyle = PALETTE.moss;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawFloat(ctx: CanvasRenderingContext2D, t: FloatText): void {
  const k = 1 - t.life / t.max;
  const y = t.y - ease(k) * t.rise;
  const a = k < 0.72 ? 1 : 1 - (k - 0.72) / 0.28;
  ctx.save();
  ctx.globalAlpha = clamp01(a);
  ctx.translate(t.x, y);
  const s = t.emphasis * (1 + 0.35 * (1 - easeOutQuad(Math.min(1, k * 3))));
  ctx.scale(s, s);
  ctx.font = 'bold ' + Math.round(t.size) + 'px ' + LAYOUT.FONT_FAMILY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = rgba(PALETTE.inkSoft, 0.75);
  ctx.strokeText(t.text, 0, 0);
  ctx.fillStyle = t.color;
  ctx.fillText(t.text, 0, 0);
  ctx.restore();
}

function drawBubble(ctx: CanvasRenderingContext2D, b: Bubble): void {
  const k = 1 - b.life / b.max;
  const x = lerp(b.fromX, b.toX, ease(k));
  const y = lerp(b.fromY, b.toY, ease(k)) - Math.sin(k * Math.PI) * 26;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = rgba(PALETTE.creamMist, 0.95);
  blobPath(ctx, -30, -16, 60, 32, 2.2, 5);
  ctx.fill();
  ctx.strokeStyle = PALETTE.inkSoft;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.font = FX_FONT_SMALL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.label, 0, 1);
  ctx.restore();
}

/** 供渲染层复用的常量（避免各处出现魔法数）。 */
export const FX = {
  MOSS_MS: 800,
  RIPPLE_MS: 250,
  DEATH_FIREFLY: 3,
  HIT_FLASH_MS: 80,
  SHAKE_PX: 4,
};