"""
萌宠乱斗 · 美术二次加工流水线（Pillow + numpy，无 cv2/scipy 依赖）。

产出（只写 assets/，因为 project.config.json 只打包 assets/）：
  assets/cards/card-<species>.jpg   336x464  整张卡面（木框/名字/数值都在，直接当卡面用）
  assets/cards/art-<species>.jpg    336x336  木框内立绘区域（卡面美术区）
  assets/pets/<species>.png         320x320  透明底立绘（场上单位 / 替补席 / 详情页）
  assets/bg/<name>.jpg              场景底图（横版 1280x720 / 竖版 720x1280）

抠图思路（针对「深色墨线勾勒 + 水彩场景」这批图，比色键更稳）：
  1) 自动定位木框：褐色像素占比找左右/上边框，亮度最低的墨色横线找名字木牌上沿，
     于是得到「木框内的立绘区域」；
  2) 用「暗于周围大半径模糊 24 灰阶」判定墨线，得到 barrier（墨线）；
  3) 非墨线像素做连通域标记，**与裁剪边界相连的连通域才是背景**；
  4) 剩下的非墨线连通域里只保留最大的一块（= 动物本体），
     于是「尾巴卷住的那块草」「背景里的树/灌木」自动被丢弃；
  5) 把与本体相连的墨线吸收进来（轮廓、眼睛、花纹都在墨线里）；
  6) 掩码升回原分辨率 → 边缘去污染（用邻近透明像素估计背景色，按色差给 alpha，
     再按 (c-(1-a)bg)/a 反混合，去掉米白/天蓝毛边）→ alpha 轻微羽化；
  7) 按 alpha 取 bbox → 居中留 5% 边距 → 正方 → 320x320 PNG。

自检图输出到 work/qa/*.png（不打包）。
"""
import os
import json
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = r'D:\CGQ\AI\deeseek\萌宠乱斗'
SRC = os.path.join(ROOT, 'art-src')
OUT = os.path.join(ROOT, 'assets')
QA = os.path.join(ROOT, 'work', 'qa')

# 卡图文件名（tiger 的样张名字不同）
FILE_OF = {
    'tiger': 'card-tiger-sample-01.jpg',
    'lion': 'card-lion-01.jpg',
    'leopard': 'card-leopard-01.jpg',
    'elephant': 'card-elephant-01.jpg',
    'wolf': 'card-wolf-01.jpg',
    'dog': 'card-dog-01.jpg',
    'cat': 'card-cat-01.jpg',
    'mouse': 'card-mouse-01.jpg',
}
SPECIES = ['tiger', 'lion', 'leopard', 'elephant', 'wolf', 'dog', 'cat', 'mouse']

SCENES = [
    ('bg-camp', 'ui-camp-landscape-01.jpg', 1280),
    ('bg-board', 'ui-battle-river-board-01.jpg', 1280),
    ('ui-market', 'ui-market-v2-16x9-01.jpg', 1280),
    ('ui-deploy-fog', 'ui-deploy-fog-16x9-01.jpg', 1280),
    ('ui-result-victory', 'ui-result-victory-16x9-01.jpg', 1280),
    ('ui-collection', 'ui-collection-page-01.jpg', 720),
    ('ui-deck', 'ui-deck-page-01.jpg', 720),
]

MARK = os.path.join(QA, 'marks.json')


def ensure_dirs():
    for d in (OUT, QA, os.path.join(OUT, 'cards'), os.path.join(OUT, 'pets'), os.path.join(OUT, 'bg')):
        os.makedirs(d, exist_ok=True)


# ------------------------------------------------------------- geometry ------

def runs_of(mask):
    idx = np.where(mask)[0]
    if len(idx) == 0:
        return []
    out = []
    s = p = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i == p + 1:
            p = i
        else:
            out.append((s, p))
            s = p = i
    out.append((s, p))
    return out


def bark_mask(a):
    r = a[:, :, 0].astype(np.int16)
    g = a[:, :, 1].astype(np.int16)
    b = a[:, :, 2].astype(np.int16)
    return ((r > 110) & (r < 208) & (g > 78) & (g < 158) & (b > 42) & (b < 124) &
            (r >= g + 16) & (g >= b + 6))


def luminance(a):
    return (0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]).astype(np.float32)


def crop_illustration(im):
    """木框内立绘区域：左右/上靠褐色边框，下靠名字木牌上沿的墨线。"""
    a = np.asarray(im.convert('RGB'))
    h, w, _ = a.shape
    bk = bark_mask(a)
    rr = runs_of(bk.mean(axis=1) > 0.55)
    cc = runs_of(bk.mean(axis=0) > 0.55)
    top = rr[0][1] if rr else int(h * 0.06)
    left = cc[0][1] if cc else int(w * 0.06)
    right = cc[-1][0] if cc else int(w * 0.94)

    # 名字木牌上沿：53%~64% 高度之间最暗的一行
    lum = luminance(a)
    y0, y1 = int(h * 0.53), int(h * 0.64)
    band = lum[y0:y1, left + 40:right - 40].mean(axis=1)
    rim = y0 + int(np.argmin(band))

    inset = max(6, int(min(w, h) * 0.008))
    return (left + inset, top + inset, right - inset, max(top + inset + 8, rim - inset))


# ---------------------------------------------------------- mask helpers -----

def dilate(m, it=1):
    for _ in range(it):
        o = m.copy()
        o[1:, :] |= m[:-1, :]
        o[:-1, :] |= m[1:, :]
        o[:, 1:] |= m[:, :-1]
        o[:, :-1] |= m[:, 1:]
        m = o
    return m


def erode(m, it=1):
    return ~dilate(~m, it)


def label_components(mask):
    """4 邻接连通域标记；返回 int32 标签图（0 = 背景）与各标签像素数字典。"""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = {}
    ys, xs = np.where(mask)
    cur = 0
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if lab[y0, x0]:
            continue
        cur += 1
        q = deque([(y0, x0)])
        lab[y0, x0] = cur
        n = 0
        while q:
            y, x = q.popleft()
            n += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = cur
                    q.append((ny, nx))
        sizes[cur] = n
    return lab, sizes


def largest_component(fg):
    lab, sizes = label_components(fg)
    if not sizes:
        return np.zeros_like(fg), 0
    best = max(sizes.items(), key=lambda kv: kv[1])
    return lab == best[0], int(best[1])


# ------------------------------------------------------- alpha refinement ----

def refine_alpha(rgb, fg, tol=46):
    h, w, _ = rgb.shape
    trans = ~fg
    bg_acc = np.zeros((h, w, 3), np.float32)
    cnt = np.zeros((h, w), np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        shifted = np.zeros_like(trans)
        sc = np.zeros_like(cnt)
        sy = slice(max(0, dy), h + min(0, dy))
        sx = slice(max(0, dx), w + min(0, dx))
        ty = slice(max(0, -dy), h + min(0, -dy))
        tx = slice(max(0, -dx), w + min(0, -dx))
        shifted[ty, tx] = trans[sy, sx]
        sc[ty, tx] = 1.0
        bg_acc += shifted[:, :, None] * rgb
        cnt += shifted
    bg_est = bg_acc / np.maximum(cnt, 1.0)[:, :, None]
    dist = np.abs(rgb - bg_est).max(axis=2)
    soft = np.clip(dist / tol, 0.0, 1.0)
    edge = (cnt > 0) & fg
    a = np.where(edge, np.minimum(1.0, 0.3 + 0.7 * soft), fg.astype(np.float32))
    a = np.where(a < 0.34, 0.0, a)
    a3 = a[:, :, None]
    unr = (rgb - (1.0 - a3) * bg_est) / np.maximum(a3, 0.06)
    rgb_out = np.where(edge[:, :, None], np.clip(unr, 0, 255), rgb)
    fa = Image.fromarray((a * 255).astype(np.uint8), 'L').filter(ImageFilter.BoxBlur(1))
    return np.asarray(fa).astype(np.float32) / 255.0, rgb_out


# --------------------------------------------------------------- cutout ------

def gradient(lum):
    gx = np.zeros_like(lum)
    gy = np.zeros_like(lum)
    gx[:, 1:-1] = np.abs(lum[:, 2:] - lum[:, :-2]) * 0.5
    gy[1:-1, :] = np.abs(lum[2:, :] - lum[:-2, :]) * 0.5
    return gx + gy


def build_fg_once(ill, ink_margin, ink_dark, grad_thresh, dilate_ink, absorb_iters=16,
                  work_scale=640):
    rgb = np.asarray(ill).astype(np.float32)
    h, w, _ = rgb.shape
    lum = luminance(rgb)
    blur = np.asarray(Image.fromarray(lum.astype(np.uint8), 'L')
                      .filter(ImageFilter.GaussianBlur(14))).astype(np.float32)
    ink = ((blur - lum) > ink_margin) | (lum < ink_dark) | (gradient(lum) > grad_thresh)
    ink = dilate(ink, dilate_ink)

    sc = min(1.0, work_scale / float(max(h, w)))
    sw, sh = max(16, int(round(w * sc))), max(16, int(round(h * sc)))

    def down(m):
        return np.asarray(Image.fromarray((m * 255).astype(np.uint8), 'L')
                          .resize((sw, sh), Image.BILINEAR)).astype(np.int16) > 60

    ink_s = down(ink)
    free_s = ~ink_s
    lab, sizes = label_components(free_s)
    border = np.zeros_like(free_s)
    border[0, :] = True
    border[:, 0] = True
    border[:, -1] = True
    border[-1, :] = True
    # 只把底部两侧（各 25% 宽）算作背景种子：动物站在画面中下方，
    # 底边中段可能直接贴着动物的脚/身体，不能被当成背景种子。
    q = max(4, sw // 4)
    border[-1, q:sw - q] = False
    bg_labels = set(lab[border & free_s].tolist())
    bg_labels.discard(0)
    bg_s = np.isin(lab, list(bg_labels)) if bg_labels else np.zeros_like(free_s)
    fg_free = free_s & ~bg_s
    keep_border, keep_border_n = largest_component(fg_free)

    # 立绘区是按动物居中裁出来的，所以「画面中心所在的连通域」才是本体。
    # 浅色毛贴在浅色天空上的卡（狼/狗）边缘对比太弱，动物内部会漏进背景，
    # 这时背景连通域反而成了画框；用中心连通域判断能救回来。
    syl, syn = sw // 2, sh // 2
    center_label = 0
    for r in range(0, 4):
        y0, y1 = max(0, syn - r), min(sh, syn + r + 1)
        x0, x1 = max(0, syl - r), min(sw, syl + r + 1)
        sub = lab[y0:y1, x0:x1]
        vals = [v for v in np.unique(sub) if v != 0]
        if vals:
            center_label = max(vals, key=lambda v: (sub == v).sum())
            break
    keep_center = lab == center_label if center_label else np.zeros_like(free_s)
    keep = keep_center if keep_center.mean() >= 0.05 else keep_border
    keep_n = int(keep.sum())

    fg_s = keep
    for _ in range(absorb_iters):
        fg_s = fg_s | (ink_s & dilate(fg_s))
    # 只留本体：吸收墨线后可能把旁边装饰性的光点粘连回来
    fg_s, _ = largest_component(fg_s)
    # 补掉勉内的细小孔洞（狮鬃里的小装饰、花纹间隙），大孔洞（耳内、腋下）保留
    hole_lab, hole_sizes = label_components(~fg_s)
    border_labels = set(hole_lab[0, :].tolist()) | set(hole_lab[-1, :].tolist()) | \
        set(hole_lab[:, 0].tolist()) | set(hole_lab[:, -1].tolist())
    fill_max = sw * sh * 0.004
    for lbl, area in hole_sizes.items():
        if lbl and lbl not in border_labels and area < fill_max:
            fg_s = fg_s | (hole_lab == lbl)

    m = Image.fromarray((fg_s * 255).astype(np.uint8), 'L').resize((w, h), Image.BILINEAR)
    fg_full = np.asarray(m).astype(np.int16) > 127

    cy, cx = h // 2, w // 2
    band = fg_full[max(0, cy - 8):cy + 8, max(0, cx - 8):cx + 8]
    covers = (float(fg_s[0, :].mean()), float(fg_s[:, 0].mean()),
              float(fg_s[:, -1].mean()), float(fg_s[-1, :].mean()))
    frame = max(covers[0], covers[1], covers[2])
    info = {
        'fg_ratio': round(float(fg_full.mean()), 4),
        'keep_ratio': round(float(fg_s.mean()), 4),
        'free_ratio': round(float(fg_free.mean()), 4),
        'ink_ratio': round(float(ink_s.mean()), 4),
        'components': len(sizes),
        'keep_px_small': keep_n,
        'center_hit': bool(band.any()),
        'frame_cover': round(frame, 3),
    }
    return fg_full, rgb, info


# 从「弱屏障」到「强屏障」逐个尝试；只要掩码含画面中心且占比合理就采纳。
VARIANTS = [
    (14.0, 96.0, 34.0, 2),
    (10.0, 108.0, 28.0, 3),
    (7.0, 118.0, 22.0, 3),
    (20.0, 88.0, 42.0, 2),
    (5.0, 128.0, 18.0, 4),
]


def build_fg(ill, debug_dir=None, species=None):
    best = None
    for i, (mgn, dark, grad, dil) in enumerate(VARIANTS):
        try:
            fg, rgb, info = build_fg_once(ill, mgn, dark, grad, dil)
        except Exception:  # noqa
            continue
        info['variant'] = i
        # 动物本体不会把左右/上边整条填满；若被选中的连通域是个「画框」，
        # 说明动物的内部漏进了背景，这一组参数不采纳。
        ok = (info['center_hit'] and 0.08 <= info['keep_ratio'] <= 0.62
              and info['frame_cover'] < 0.32)
        if debug_dir and species:
            tag = 'v%d-%s' % (i, 'ok' if ok else 'no')
            small = np.asarray(Image.fromarray((fg * 255).astype(np.uint8), 'L'))
            Image.fromarray(small).resize((small.shape[1] // 4, small.shape[0] // 4),
                                          Image.BILINEAR).save(
                os.path.join(debug_dir, 'mask-%s-%s.png' % (species, tag)))
        if ok:
            return fg, rgb, info
        key = (info['center_hit'], info['frame_cover'] < 0.32, info['keep_ratio'])
        if best is None or key > (best[2]['center_hit'],
                                  best[2]['frame_cover'] < 0.32,
                                  best[2]['keep_ratio']):
            best = (fg, rgb, info)
    return best


def cutout(species, src_path, debug_dir=None):
    im = Image.open(src_path).convert('RGB')
    box = crop_illustration(im)
    ill = im.crop(box)
    fg_full, rgb, info = build_fg(ill)
    alpha, rgb_out = refine_alpha(rgb, fg_full)
    h, w, _ = rgb.shape

    ys, xs = np.where(alpha > 0.16)
    if len(ys) == 0:
        raise RuntimeError('empty cutout')
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
    pad = int(max(x1 - x0, y1 - y0) * 0.05) + 2
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(h - 1, y1 + pad), min(w - 1, x1 + pad)
    side = max(x1 - x0, y1 - y0) + 1
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    top, left = max(0, cy - side // 2), max(0, cx - side // 2)
    bot, right = min(h, top + side), min(w, left + side)
    rgba = np.dstack([rgb_out[top:bot, left:right].astype(np.uint8),
                      (alpha[top:bot, left:right] * 255.0).astype(np.uint8)])
    out = Image.fromarray(rgba, 'RGBA').resize((320, 320), Image.LANCZOS)
    info['species'] = species
    info['crop'] = list(box)
    info['bbox'] = [left, top, right, bot]
    if debug_dir:
        y = np.asarray(Image.fromarray((fg_full * 255).astype(np.uint8), 'L')
                       .resize((w // 3, h // 3), Image.BILINEAR))
        Image.fromarray(y).save(os.path.join(debug_dir, 'mask-%s.png' % species))
    return out, info


# ------------------------------------------------------------------- main ----

def main():
    ensure_dirs()
    report = {'pets': [], 'cards': [], 'scenes': []}

    for sp in SPECIES:
        src = os.path.join(SRC, FILE_OF[sp])
        if not os.path.exists(src):
            print('MISSING', src)
            continue
        im = Image.open(src).convert('RGB')
        face = im.resize((336, 464), Image.LANCZOS)
        p = os.path.join(OUT, 'cards', 'card-%s.jpg' % sp)
        face.save(p, 'JPEG', quality=82, optimize=True, progressive=True)
        art = im.crop(crop_illustration(im)).resize((336, 336), Image.LANCZOS)
        p2 = os.path.join(OUT, 'cards', 'art-%s.jpg' % sp)
        art.save(p2, 'JPEG', quality=82, optimize=True, progressive=True)
        report['cards'].append({'species': sp, 'face_kb': round(os.path.getsize(p) / 1024.0, 1),
                                'art_kb': round(os.path.getsize(p2) / 1024.0, 1)})

    tiles = []
    for sp in SPECIES:
        src = os.path.join(SRC, FILE_OF[sp])
        try:
            out, info = cutout(sp, src, debug_dir=QA)
        except Exception as e:  # noqa
            print('CUTOUT FAILED %-9s %s' % (sp, e))
            continue
        p = os.path.join(OUT, 'pets', '%s.png' % sp)
        out.save(p, 'PNG', optimize=True)
        info['png_kb'] = round(os.path.getsize(p) / 1024.0, 1)
        report['pets'].append(info)
        tiles.append((sp, out))
        print('pet %-9s fg=%.3f keep=%.3f ink=%.3f  %.1fKB' %
              (sp, info['fg_ratio'], info['keep_ratio'], info['ink_ratio'], info['png_kb']))

    for name, fn, target_w in SCENES:
        src = os.path.join(SRC, fn)
        if not os.path.exists(src):
            print('MISSING', src)
            continue
        im = Image.open(src).convert('RGB')
        w, h = im.size
        s = target_w / float(w)
        im2 = im.resize((target_w, max(1, int(round(h * s)))), Image.LANCZOS)
        p = os.path.join(OUT, 'bg', '%s.jpg' % name)
        im2.save(p, 'JPEG', quality=78, optimize=True, progressive=True)
        report['scenes'].append({'name': name, 'size': list(im2.size),
                                 'kb': round(os.path.getsize(p) / 1024.0, 1)})

    if tiles:
        cell = 320
        cols = 4
        rows = (len(tiles) + cols - 1) // cols
        for variant in ('checker', 'dark'):
            if variant == 'checker':
                base = Image.new('RGB', (cols * cell, rows * cell))
                px = base.load()
                for y in range(rows * cell):
                    for x in range(cols * cell):
                        px[x, y] = (216, 216, 216) if ((x // 16 + y // 16) % 2 == 0) else (168, 168, 168)
            else:
                base = Image.new('RGB', (cols * cell, rows * cell), (22, 19, 16))
            for i, (sp, imx) in enumerate(tiles):
                base.paste(imx, ((i % cols) * cell, (i // cols) * cell), imx)
            base.save(os.path.join(QA, 'contact-%s.png' % variant))

    total = 0
    for d, _, fs in os.walk(OUT):
        for f in fs:
            total += os.path.getsize(os.path.join(d, f))
    report['total_kb'] = round(total / 1024.0, 1)
    with open(os.path.join(QA, 'assets-report.json'), 'w', encoding='utf-8') as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)
    print('assets total = %.1f KB' % report['total_kb'])


if __name__ == '__main__':
    main()