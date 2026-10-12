/**
 * 音频：优先使用小程序音频接口，浏览器/预览环境回落到 <audio> 元素。
 * 音频文件缺失时静默降级（不抛错、不阻塞）；音效名 → 路径表集中在此。
 * 资源：assets/sfx/*.mp3（15 个音效）、assets/bgm/forest-loop.mp3（6 秒无缝循环）。
 * 注意：必须用 MP3 而非 WAV。WAV 未压缩，16 个文件占 6.6MB，主包上限仅 4MB
 * （真机调试曾报 80051）。转 MP3 后合计 505KB，约 13 倍压缩。
 * 重新生成见 tools/convert_audio.py。
 */
import { WX, HAS_WX } from './wx-shim';
import { loadSave } from './storage';

const SFX_TABLE: { name: string; path: string }[] = [
  { name: 'tap', path: 'assets/sfx/tap.mp3' },
  { name: 'cardPick', path: 'assets/sfx/card-buy.mp3' },
  { name: 'cardFly', path: 'assets/sfx/card-fly.mp3' },
  { name: 'land', path: 'assets/sfx/land.mp3' },
  { name: 'reject', path: 'assets/sfx/reject.mp3' },
  { name: 'combine', path: 'assets/sfx/combine.mp3' },
  { name: 'attack', path: 'assets/sfx/attack.mp3' },
  { name: 'hit', path: 'assets/sfx/hit.mp3' },
  { name: 'death', path: 'assets/sfx/death.mp3' },
  { name: 'command', path: 'assets/sfx/command.mp3' },
  { name: 'roundWin', path: 'assets/sfx/round-win.mp3' },
  { name: 'roundLose', path: 'assets/sfx/round-lose.mp3' },
  { name: 'victory', path: 'assets/sfx/victory.mp3' },
  { name: 'defeat', path: 'assets/sfx/defeat.mp3' },
  { name: 'refresh', path: 'assets/sfx/refresh.mp3' }
];

const BGM_PATH = 'assets/bgm/forest-loop.mp3';

const pool: { [name: string]: any[] } = {};
let inited = false;
const lastPlayed: { [name: string]: number } = {};

/** 宿主是否具备可用的音频输出（微信小游戏，或浏览器/预览环境）。 */
function hasAudioHost(): boolean {
  if (HAS_WX && typeof WX.createInnerAudioContext === 'function') return true;
  return typeof document !== 'undefined' && !!document.createElement;
}

/** 建一个音频实例：优先 wx.createInnerAudioContext，否则回落到 <audio>。 */
function createAudio(): any {
  if (HAS_WX && typeof WX.createInnerAudioContext === 'function') {
    try { return WX.createInnerAudioContext(); } catch (e) { /* 继续尝试 DOM 回落 */ }
  }
  if (typeof document !== 'undefined' && document.createElement) {
    try {
      const a: any = document.createElement('audio');
      a.preload = 'auto';
      return a;
    } catch (e) { /* ignore */ }
  }
  return null;
}

function stopAudio(a: any): void {
  if (!a) return;
  try {
    if (typeof a.stop === 'function') a.stop();
    else { a.pause(); a.currentTime = 0; }
  } catch (e) { /* ignore */ }
}

export function initAudio(): void {
  if (inited || !hasAudioHost()) return;
  inited = true;
  for (let i = 0; i < SFX_TABLE.length; i++) {
    const def = SFX_TABLE[i];
    const arr: any[] = [];
    // 每个音效 2 个实例，避免连击时被截断
    for (let k = 0; k < 2; k++) {
      const a = createAudio();
      if (!a) continue;
      try {
        a.src = def.path;
        a.volume = 0.7;
        arr.push(a);
      } catch (e) { /* 资源缺失时忽略 */ }
    }
    pool[def.name] = arr;
  }
}

let cursor = 0;

/** 播放音效（同名 60ms 内不重复触发）。 */
export function playSfx(name: string): void {
  if (!inited) initAudio();
  if (!hasAudioHost()) return;
  const save = loadSave();
  if (!save.audio.sfx) return;
  resumeBgm();
  const arr = pool[name];
  if (!arr || arr.length === 0) return;
  const now = Date.now();
  if (lastPlayed[name] && now - lastPlayed[name] < 60) return;
  lastPlayed[name] = now;
  const a = arr[cursor % arr.length];
  cursor++;
  try { a.seek(0); a.play(); } catch (e) { try { a.play(); } catch (e2) { /* ignore */ } }
}

export function stopAllSfx(): void {
  const keys = Object.keys(pool);
  for (let i = 0; i < keys.length; i++) {
    const arr = pool[keys[i]];
    for (let k = 0; k < arr.length; k++) stopAudio(arr[k]);
  }
}

/** 背景音乐：单个循环实例，按存档里的开关播放/暂停。 */
let bgm: any = null;
let bgmPlaying = false;

function ensureBgm(): any {
  if (bgm) return bgm;
  const a = createAudio();
  if (!a) return null;
  try {
    a.src = BGM_PATH;
    a.loop = true;
    a.volume = 0.32;
  } catch (e) {
    return null;
  }
  bgm = a;
  return bgm;
}

function startBgm(): void {
  const a = ensureBgm();
  if (!a || bgmPlaying) return;
  bgmPlaying = true;
  try {
    const p = a.play();
    // 浏览器在用户手势前会拒绝自动播放：被拒绝时回退状态，等下一次点按再起
    if (p && typeof p.catch === 'function') p.catch(() => { bgmPlaying = false; });
  } catch (e) {
    bgmPlaying = false;
  }
}

/** 首次点按后补起背景音乐（浏览器自动播放策略）。 */
function resumeBgm(): void {
  if (bgmPlaying) return;
  if (!loadSave().audio.music) return;
  startBgm();
}

/** 让背景音乐的播放状态与存档一致（启动、开关变化时调用）。 */
export function syncBgm(): void {
  if (!hasAudioHost()) return;
  if (loadSave().audio.music) {
    startBgm();
  } else {
    bgmPlaying = false;
    stopAudio(bgm !== null ? bgm : null);
  }
}

/** 分享（结算页「分享战绩」）。 */
export function shareResult(outcome: string, coins: number): void {
  if (!HAS_WX || !WX.shareAppMessage) return;
  try {
    WX.shareAppMessage({
      title: '我在《萌宠乱斗》林间乱斗里拿了 ' + outcome + '，赚了 ' + coins + ' 爪印币！'
    });
  } catch (e) { /* ignore */ }
}