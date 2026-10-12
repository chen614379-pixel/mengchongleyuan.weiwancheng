# -*- coding: utf-8 -*-
"""
把 assets/ 下的未压缩 WAV 转成 MP3，压缩主包体积。

背景：真机调试报 80051（source size 9712KB exceed max limit 4MB）。
assets/ 下 16 个 WAV 合计 6.6MB，占包体 68%，其中 forest-loop.wav 一个就 4.6MB。
WAV 是 40000Hz/16bit/双声道 未压缩 PCM，转 MP3 可压到约 1/15。

用法：
  python tools/convert_audio.py            # 转换
  python tools/convert_audio.py --dry-run  # 只报告，不写文件

依赖 lameenc（本机 pip 装不上，走手工解包到 work/pylibs）。
"""
import os
import sys
import wave
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'work', 'pylibs'))

import lameenc  # noqa: E402

# BGM 是 6 秒无缝循环，单声道 96kbps 足够；
# SFX 短促、对高频敏感，给双声道立体声 + 更高码率，但整体体积仍很小。
BGM_OPTS = dict(bit_rate=96, out_channels=1)
SFX_OPTS = dict(bit_rate=96, out_channels=2)


def convert(src, dst, bit_rate, out_channels, dry_run=False):
    with wave.open(src, 'rb') as w:
        nch = w.getnchannels()
        rate = w.getframerate()
        width = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width != 2:
        raise SystemExit('只支持 16bit PCM：%s (%dbit)' % (src, width * 8))

    # 单声道输出时，把双声道 PCM 就地降混（取左右平均）
    if out_channels == 1 and nch == 2:
        import array
        a = array.array('h')
        a.frombytes(raw)
        mono = array.array('h')
        for i in range(0, len(a) - 1, 2):
            mono.append((a[i] + a[i + 1]) // 2)
        raw = mono.tobytes()
        nch = 1
    if out_channels == 2 and nch == 1:
        import array
        a = array.array('h')
        a.frombytes(raw)
        st = array.array('h')
        for s in a:
            st.append(s)
            st.append(s)
        raw = st.tobytes()
        nch = 2

    enc = lameenc.Encoder()
    enc.set_bit_rate(bit_rate)
    enc.set_in_sample_rate(rate)
    enc.set_channels(nch)
    enc.set_quality(2)
    data = bytes(enc.encode(raw))
    data += bytes(enc.flush())

    before = os.path.getsize(src)
    after = len(data)
    if not dry_run:
        with open(dst, 'wb') as f:
            f.write(data)
    ratio = before / after if after else 0
    print('  %-26s %8.1fKB -> %7.1fKB  (%.1fx)  %dHz/%dch/%dkbps'
          % (os.path.basename(src), before / 1024, after / 1024, ratio,
             rate, nch, bit_rate))
    return before, after


def main():
    dry = '--dry-run' in sys.argv
    total_before = total_after = 0

    print('BGM:')
    for src in glob.glob(os.path.join(ROOT, 'assets', 'bgm', '*.wav')):
        dst = src[:-4] + '.mp3'
        b, a = convert(src, dst, dry_run=dry, **BGM_OPTS)
        total_before += b
        total_after += a

    print('SFX:')
    for src in sorted(glob.glob(os.path.join(ROOT, 'assets', 'sfx', '*.wav'))):
        dst = src[:-4] + '.mp3'
        b, a = convert(src, dst, dry_run=dry, **SFX_OPTS)
        total_before += b
        total_after += a

    print('')
    print('合计 %8.1fKB -> %7.1fKB  (%.1fx, 省 %.1fKB)'
          % (total_before / 1024, total_after / 1024,
             (total_before / total_after if total_after else 0),
             (total_before - total_after) / 1024))
    if dry:
        print('(dry-run，未写文件)')


if __name__ == '__main__':
    main()
