/**
 * 加载页：水彩晕染的标题 + 手绘进度（叶片生长）。
 * 资源加载与首个场景初始化都在这里完成，最后自动转入营地。
 */
import { Scene, push, swapNow } from './manager';
import { PALETTE, rgba } from '../config/palette';
import { drawSky, drawForestLayer, drawSunSpecks, drawVignette } from '../render/forest';
import { strokeInk, fillWatercolor, roundRectPath } from '../ui/brush';
import { setFont, textOutlined } from '../ui/theme';
import { LAYOUT } from '../config/layout';
import { sceneBox } from '../platform/screen';

export interface BootSceneOpts {
  /** 加载进度查询，返回 0~1 */
  progress: () => number;
  /** 全部就绪后要进入的场景工厂 */
  next: () => Scene;
}

export class BootScene implements Scene {
  readonly name = 'boot';
  private t = 0;
  private opts: BootSceneOpts;
  private minShowMs = 900;
  private done = false;

  constructor(opts: BootSceneOpts) {
    this.opts = opts;
  }

  enter(): void {
    this.t = 0;
    this.done = false;
  }

  tick(logicTime: number): void {
    this.t = logicTime;
    const p = this.opts.progress();
    if (!this.done && p >= 1 && logicTime >= this.minShowMs) {
      this.done = true;
      const next = this.opts.next();
      swapNow(next);
      push(next); // 触发一次 800ms 雾气转场，让进入营地更柔和
    }
  }

  render(ctx: any, renderTime: number): void {
    const w = LAYOUT.SCREEN_W;
    const h = LAYOUT.SCREEN_H;
    // 自适应全屏：天空/森林/暗角铺满逻辑可视区，标题与进度仍居中
    const box = sceneBox();
    ctx.save();
    ctx.translate(box.x, box.y);
    drawSky(ctx, box.w, box.h, renderTime);
    drawForestLayer(ctx, box.w, box.h, 0, 'far', renderTime);
    drawForestLayer(ctx, box.w, box.h, 0, 'mid', renderTime);
    ctx.restore();
    drawSunSpecks(ctx, w, h, renderTime, 0.7);

    // 中央水彩晕染圆（墨迹未干的标题底）
    const cx = w / 2;
    const cy = h / 2 - 30;
    const pts: { x: number; y: number }[] = [];
    const R = 190 + Math.sin(renderTime / 900) * 6;
    for (let i = 0; i <= 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const r = R * (0.86 + 0.14 * Math.sin(i * 1.7));
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.62 });
    }
    fillWatercolor(ctx, pts, PALETTE.moss, { alpha: 0.28, layers: 2, wetEdge: true, seedIndex: 3 });

    textOutlined(ctx, '萌宠乱斗', cx, cy - 10, LAYOUT.FONT.h1 * 1.6, PALETTE.bark, 'center');
    setFont(ctx, LAYOUT.FONT.body, 500);
    ctx.fillStyle = rgba(PALETTE.forestDeep, 0.85);
    ctx.textAlign = 'center';
    ctx.fillText('林间乱斗', cx, cy + 52);

    // 手绘进度条：一根藤蔓 + 一片生长的叶子
    const bw = 420;
    const bh = 18;
    const bx = cx - bw / 2;
    const by = cy + 140;
    roundRectPath(ctx, bx, by, bw, bh, 9, 0.6, 11);
    fillWatercolor(ctx, [
      { x: bx, y: by }, { x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, { x: bx, y: by + bh }
    ], PALETTE.creamMist, { alpha: 0.75, layers: 1, seedIndex: 12 });
    strokeInk(ctx, [
      { x: bx, y: by + bh / 2 }, { x: bx + bw * 0.5, y: by + bh / 2 }, { x: bx + bw, y: by + bh / 2 }
    ], { width: 2.5, jitter: 1.2, seedIndex: 13 });

    const p = Math.max(0, Math.min(1, this.opts.progress()));
    const leafX = bx + bw * p;
    const leaf: { x: number; y: number }[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      leaf.push({ x: leafX + Math.cos(a) * 13, y: by + bh / 2 + Math.sin(a) * 9 });
    }
    fillWatercolor(ctx, leaf, PALETTE.leafLight, { alpha: 0.9, layers: 2, seedIndex: 14 });
    strokeInk(ctx, leaf, { width: 2.6, close: true, seedIndex: 15 });

    drawForestLayer(ctx, w, h, 0, 'near', renderTime);
    ctx.save();
    ctx.translate(box.x, box.y);
    drawVignette(ctx, box.w, box.h);
    ctx.restore();
  }
}