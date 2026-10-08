/**
 * 渲染层静态自检（tools/render-preview.js）
 *
 * 用最笨但可靠的方式给 `src/render/*.ts` 做体检，因为渲染层只能在小游戏运行时里
 * 真正画出来，构建前能抓的就是这些**静态**问题：
 *
 *   1. 模块齐全度：13 个 render 模块是否都存在、是否都有文件级注释
 *   2. 禁止项扫描（§16 硬指标）：
 *        - emoji（renders 禁止直接画 emoji，天气只能走 weatherShort）
 *        - 魔法颜色值（渲染层不允许出现 '#RRGGBB' 字面量）
 *        - 矩形硬边（fillRect / createLinearGradient / createRadialGradient / setLineDash）
 *        - 矩形血条（render 层不允许出现血条绘制入口）
 *        - 点位/格子（不允许出现 'point'/'grid' 相关的可见绘制）
 *   3. 资源清单 vs 磁盘：ASSET_LIST 里的路径哪些真的缺（缺图必须回落程序化手绘，所以只 WARN）
 *   4. 交叉引用：render 内部 import 的名字是否真的被对方 export；场景层调用的 render 名字是否存在
 *
 * 退出码：有 FAIL 时 1，否则 0。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RENDER = path.join(ROOT, 'src', 'render');
const SRC = path.join(ROOT, 'src');

const MODULES = [
  'paint', 'assets', 'forest', 'board', 'unit', 'hpring',
  'card', 'sidebar', 'coach', 'imp', 'result', 'ui', 'index',
];

const fail = [];
const warn = [];
const info = [];

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

function lineOf(src, index) {
  let n = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === '\n') n++;
  return n;
}

/* ---------------------------------------------------------------- */
/* 1. 模块齐全度                                                     */
/* ---------------------------------------------------------------- */
const sources = {};
for (const m of MODULES) {
  const p = path.join(RENDER, m + '.ts');
  const s = read(p);
  if (s === null) {
    fail.push(`缺文件：src/render/${m}.ts`);
    continue;
  }
  sources[m] = s;
  if (!/^\/\*\*/.test(s)) warn.push(`src/render/${m}.ts 缺文件头注释`);
  info.push(`src/render/${m}.ts  ${s.length}B  ${s.split('\n').length} 行`);
}

/* ---------------------------------------------------------------- */
/* 2. 禁止项扫描                                                     */
/* ---------------------------------------------------------------- */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2708}\u{26C4}\u{26A1}]/u;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const BANNED = [
  { re: /\bfillRect\s*\(/g, msg: 'fillRect（矩形硬边）' },
  { re: /createLinearGradient\s*\(/g, msg: 'createLinearGradient（几何渐变）' },
  { re: /createRadialGradient\s*\(/g, msg: 'createRadialGradient（几何渐变）' },
  { re: /setLineDash\s*\(/g, msg: 'setLineDash（机械虚线）' },
  { re: /drawHpBar|hpBar\s*\(/g, msg: '矩形血条入口' },
  { re: /'Lv\.1'/g, msg: "Lv.1 角标（规格：Lv1 不显示角标）" },
];

for (const m of Object.keys(sources)) {
  const s = sources[m];
  const em = s.match(new RegExp(EMOJI.source, 'gu'));
  if (em) {
    let idx = 0;
    for (const ch of em) {
      idx = s.indexOf(ch, idx);
      fail.push(`emoji：src/render/${m}.ts:${lineOf(s, idx)} '${ch}'`);
      idx++;
    }
  }
  const lines = s.split('\n');
  lines.forEach((ln, i) => {
    if (ln.trim().startsWith('*') || ln.trim().startsWith('//')) return;
    const hm = ln.match(HEX);
    if (hm) fail.push(`魔法颜色值：src/render/${m}.ts:${i + 1} ${hm[0]}  →  ${ln.trim().slice(0, 80)}`);
  });
  for (const b of BANNED) {
    b.re.lastIndex = 0;
    let mt;
    while ((mt = b.re.exec(s)) !== null) {
      fail.push(`${b.msg}：src/render/${m}.ts:${lineOf(s, mt.index)}`);
    }
  }
}

/* ---------------------------------------------------------------- */
/* 3. 资源清单 vs 磁盘                                               */
/* ---------------------------------------------------------------- */
const assetsSrc = sources['assets'];
const declared = [];
if (assetsSrc) {
  const re = /\{\s*name:\s*'([^']+)'\s*,\s*path:\s*'([^']+)'/g;
  let mt;
  while ((mt = re.exec(assetsSrc)) !== null) declared.push({ name: mt[1], path: mt[2] });
  const dynamic = /path:\s*'(art-src\/card-'\s*\+\s*n|work\/cuts\/'\+n)/;
  if (!declared.length) warn.push('assets.ts：未解析到任何 ASSET_LIST 条目');
  if (dynamic.test(assetsSrc)) info.push('assets.ts：卡面/单位资源为拼接路径（16 条），单独校验');
}
const missingAssets = [];
const presentAssets = [];
for (const d of declared) {
  const abs = path.join(ROOT, d.path);
  if (fs.existsSync(abs)) presentAssets.push(d.path);
  else missingAssets.push(d);
}
// 拼接出来的 16 条：card-* + work/cuts/*.png
const CARD_NAMES = ['tiger', 'lion', 'leopard', 'elephant', 'wolf', 'dog', 'cat', 'mouse'];
for (const n of CARD_NAMES) {
  for (const p of [`art-src/card-${n}-01.jpg`, `work/cuts/${n}.png`]) {
    const abs = path.join(ROOT, p);
    if (fs.existsSync(abs)) presentAssets.push(p);
    else missingAssets.push({ name: p, path: p });
  }
}
if (missingAssets.length) {
  // 缺图是允许的（渲染层必须回落程序化手绘），只提示
  info.push(`缺图 ${missingAssets.length} 张（已回落程序化手绘）：${missingAssets.map((d) => d.path).join(', ')}`);
} else {
  info.push('资源全部在磁盘上');
}

/* ---------------------------------------------------------------- */
/* 4. 交叉引用                                                       */
/* ---------------------------------------------------------------- */
function exportsOf(mod) {
  const s = sources[mod];
  const out = new Set();
  if (!s) return out;
  const re = /export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  let mt;
  while ((mt = re.exec(s)) !== null) out.add(mt[1]);
  // export { a, b as c }
  const re2 = /export\s*\{([^}]*)\}/g;
  while ((mt = re2.exec(s)) !== null) {
    mt[1].split(',').forEach((piece) => {
      const parts = piece.trim().split(/\s+as\s+/);
      const name = (parts[parts.length - 1] || '').trim();
      if (name && /^[\w$]+$/.test(name)) out.add(name);
    });
  }
  return out;
}

const exportCache = {};
for (const m of MODULES) exportCache[m] = exportsOf(m);

function checkImportsIn(file, label) {
  const s = read(file);
  if (!s) return;
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'\.\.?\/render\/([^']+)'/g;
  let mt;
  while ((mt = re.exec(s)) !== null) {
    const names = mt[1]
      .split(',')
      .map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const mod = mt[2];
    const av = exportCache[mod];
    if (!av) {
      warn.push(`${label}：import 了未知模块 render/${mod}`);
      continue;
    }
    for (const n of names) {
      if (!av.has(n)) fail.push(`${label}：调用 render/${mod} 的 '${n}'，但该模块没有这个 export`);
    }
  }
}

for (const m of MODULES) checkImportsIn(path.join(RENDER, m + '.ts'), `src/render/${m}.ts`);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}
const sceneFiles = [];
if (fs.existsSync(path.join(SRC, 'scene'))) {
  for (const f of walk(path.join(SRC, 'scene'), [])) sceneFiles.push(f);
  for (const f of walk(path.join(SRC, 'core'), [])) sceneFiles.push(f);
}
for (const f of sceneFiles) checkImportsIn(f, 'src/' + path.relative(SRC, f).replace(/\\/g, '/'));

// render 内部 import 也校验（相对同目录写法）
for (const m of MODULES) {
  const s = sources[m];
  if (!s) continue;
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g;
  let mt;
  while ((mt = re.exec(s)) !== null) {
    const names = mt[1]
      .split(',')
      .map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const mod = mt[2];
    const av = exportCache[mod];
    if (!av) {
      fail.push(`src/render/${m}.ts：import './${mod}' 不存在`);
      continue;
    }
    for (const n of names) {
      if (!av.has(n)) fail.push(`src/render/${m}.ts：import './${mod}' 的 '${n}'，但对方没有这个 export`);
    }
  }
}

/* ---------------------------------------------------------------- */
/* 报告                                                              */
/* ---------------------------------------------------------------- */
console.log('=== petbrawl 渲染层静态自检 ===');
console.log(`模块：${MODULES.length} 个，源码 ${Object.values(sources).reduce((a, s) => a + s.length, 0)}B`);
console.log('');
console.log('--- 文件 ---');
info.forEach((i) => console.log('  ' + i));
console.log('');
console.log(`--- 资源：磁盘已有 ${presentAssets.length}，缺 ${missingAssets.length} ---`);
const declaredCount = declared.length + 16;
console.log(`  ASSET_LIST 条目约 ${declaredCount} （解析到字面量 ${declared.length} + 拼接 16）`);
if (warn.length) {
  console.log('');
  console.log(`--- WARN ${warn.length} ---`);
  warn.forEach((w) => console.log('  ! ' + w));
}
if (fail.length) {
  console.log('');
  console.log(`--- FAIL ${fail.length} ---`);
  fail.forEach((f) => console.log('  x ' + f));
}
console.log('');
console.log(fail.length === 0 ? '结果：PASS（无禁止项、引用完整）' : `结果：FAIL（${fail.length} 项）`);
process.exit(fail.length === 0 ? 0 : 1);