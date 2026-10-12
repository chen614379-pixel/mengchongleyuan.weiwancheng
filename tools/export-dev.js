/**
 * 导出「微信开发者工具可直接打开」的干净小游戏工程。
 *
 * 为什么要它：本仓库里还有 src/ work/ art-src/ tools/ docs/ node_modules/ .git/ 等
 * 开发期目录（打包时靠 packOptions.ignore 排除），但开发者工具的编译/文件监听会扫描
 * 整个工程目录，目录越杂越容易出现"编译不过 / 黑屏"这类环境问题。这里只把**运行必需**
 * 的文件（game.js / game.json / js / assets / project*.json）复制到工程目录之外，
 * 用那个目录在开发者工具里导入即可，和线上一模一样。
 *
 * usage: node tools/export-dev.js [目标目录]
 */
const fs = require('fs');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');
const DEST = process.argv[2] || path.resolve(PROJ, '..', '.petbrawl-dev');

const FILES = ['game.js', 'game.json', 'project.config.json', 'project.private.config.json'];
const DIRS = ['js', 'assets'];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const f of FILES) {
  const src = path.join(PROJ, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DEST, f));
  else console.log('  (skip missing ' + f + ')');
}
for (const d of DIRS) copyDir(path.join(PROJ, d), path.join(DEST, d));

// 校验：入口、资源表里引用的每个资源文件都必须存在
const assetsSrc = fs.readFileSync(path.join(DEST, 'js', 'render', 'assets.js'), 'utf8');
const referenced = [];
const re = /path:\s*'([^']+)'/g;
let m;
while ((m = re.exec(assetsSrc)) !== null) referenced.push(m[1]);
// 只校验真实文件名（资源表里有拼出来的路径，如 'assets/cards/card-' + n）
const real = referenced.filter((p) => /\.[a-z0-9]{2,4}$/i.test(p));
const missing = real.filter((p) => !fs.existsSync(path.join(DEST, p)));

let total = 0;
let count = 0;
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else { total += st.size; count++; }
  }
})(DEST);

console.log('exported to ' + DEST);
console.log('  files: ' + count);
console.log('  bytes: ' + total + ' (limit 4194304, headroom ' + (4194304 - total) + ')');
console.log('  game.js: ' + fs.existsSync(path.join(DEST, 'game.js')));
console.log('  game.json: ' + fs.existsSync(path.join(DEST, 'game.json')));
console.log('  assets referenced: ' + real.length + ', missing: ' + missing.length + (missing.length ? ' -> ' + missing.join(', ') : ''));

// 真机调试/上传前必须确认：这个导出目录是刚生成的，不是上次的陈旧副本。
// 曾发生过导入旧导出目录导致 80051（包里还留着 mp3 化之前的 wav）。
if (total > 4194304) {
  console.log('');
  console.log('  !! 超出主包上限 4MB：' + total + ' > 4194304，真机调试会报 80051');
}
const staleWav = [];
(function findWav(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) findWav(p);
    else if (/\.wav$/i.test(name)) staleWav.push(path.relative(DEST, p));
  }
})(DEST);
if (staleWav.length) {
  console.log('');
  console.log('  !! 资源里仍有未压缩 wav（' + staleWav.length + ' 个），请跑 tools/convert_audio.py');
  console.log('     ' + staleWav.slice(0, 3).join(', ') + (staleWav.length > 3 ? ' ...' : ''));
}
console.log('');
console.log('  提示：在微信开发者工具里导入的必须是上面这个 DEST 目录；');
console.log('        每次改完代码先重跑本脚本，再重新导入，避免用到陈旧副本。');

process.exit(missing.length || total > 4194304 ? 1 : 0);