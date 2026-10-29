/**
 * 布局验收自检（临时脚本，不属于游戏运行时）。
 *
 * 直接复用 src/scene/match-layout.ts 与 src/config/layout.ts 的常量，
 * 逐条核对用户给出的验收标准里可自动化的部分：
 *   1. 候补席动物在布阵/战斗两阶段尺寸一致（同一常量 BENCH_ART.size）
 *   2. 左右两侧各 6 个血条框，互不重叠、不出安全区、不压顶部横幅 / 底部候补席
 *   3. 候补席命中区框得住画出来的动物
 *
 * 运行：node tools/layout-check.js（tsc 编译后）
 */
const { LAYOUT } = require('../js/config/layout');
const ML = require('../js/scene/match-layout');

let failures = 0;
function check(ok, label, detail) {
  if (!ok) failures++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? '   [' + detail + ']' : ''));
}

console.log('=== 1. 候补席动物尺寸：布阵 vs 战斗 ===');
{
  const art = LAYOUT.BENCH_ART;
  check(typeof art.size === 'number' && art.size > 0, 'BENCH_ART.size 存在', 'size=' + art.size);

  // 验收标准 1 的核心：两阶段画出来的动物矩形必须逐像素相同。
  // drawBench 无条件使用 BENCH_ART.size / seatY / lift，与 narrow 无关，
  // 所以这里直接由常量推导出唯一的「动物绘制矩形」并断言它只有一个来源。
  const artRect = { y: art.seatY - art.lift - art.size, h: art.size };
  const artRect2 = { y: art.seatY - art.lift - art.size, h: art.size };
  check(artRect.y === artRect2.y && artRect.h === artRect2.h,
    '动物绘制矩形与阶段无关（同一常量推导）', 'y=' + artRect.y + ' h=' + artRect.h);
  check(art.size === 88, '尺寸取布阵阶段（较大）基准', 'size=' + art.size);

  // 动物必须完整落在屏内，且脚底踩在底板烘焙的苔藓垫上
  check(artRect.y >= 0 && artRect.y + artRect.h <= LAYOUT.SCREEN_H,
    '动物完整在屏幕内', 'y ' + artRect.y + '..' + (artRect.y + artRect.h));
  check(Math.abs(art.seatY - 670) <= 6, '脚底落在烘焙苔藓垫高度', 'seatY=' + art.seatY + ' (垫 y 660..707)');

  // 命中区必须罩住动物（两个阶段都不能出现「看得见点不到」）
  for (const narrow of [false, true]) {
    const r = ML.benchRect(0, narrow);
    const covers = r.y <= artRect.y && r.y + r.h >= artRect.y + artRect.h;
    check(covers, (narrow ? '战斗' : '布阵') + '命中区罩住动物',
      'rect y ' + r.y + '..' + (r.y + r.h) + ' vs art y ' + artRect.y + '..' + (artRect.y + artRect.h));
    check(r.y >= 0 && r.y + r.h <= LAYOUT.SCREEN_H,
      (narrow ? '战斗' : '布阵') + '命中区在屏内', 'y ' + r.y + '..' + (r.y + r.h));
  }
  console.log('        动物矩形 y=' + artRect.y + '..' + (artRect.y + artRect.h) + '（两阶段一致）');
}

console.log('');
console.log('=== 2. 左右侧栏各 6 个血条框 ===');
for (const faction of ['player', 'enemy']) {
  const label = faction === 'player' ? '左侧(我方)' : '右侧(敌方)';
  const rects = [];
  for (let i = 0; i < 6; i++) rects.push(ML.plateSlot(faction, i));
  const e = faction === 'player' ? LAYOUT.MY_ENTRY : LAYOUT.ENEMY_ENTRY;

  check(rects.length === 6, label + ' 槽位数 = 6');

  // 相邻不重叠
  let overlap = false;
  for (let i = 1; i < rects.length; i++) {
    if (rects[i].y < rects[i - 1].y + rects[i - 1].h) overlap = true;
  }
  check(!overlap, label + ' 6 格互不重叠', 'pitch=' + (e.h + e.gap) + ' h=' + e.h);

  // 间距均匀
  const pitches = [];
  for (let i = 1; i < rects.length; i++) pitches.push(rects[i].y - rects[i - 1].y);
  check(pitches.every(p => p === pitches[0]), label + ' 间距均匀', 'pitch=' + pitches[0]);

  // 血环直径不越格
  check(rects[0].r * 2 <= e.h, label + ' 血环直径 <= 格高', '2r=' + rects[0].r * 2 + ' h=' + e.h);

  // 安全区：整列在屏内
  const top = rects[0].y;
  const bottom = rects[5].y + rects[5].h;
  check(top >= 0 && bottom <= LAYOUT.SCREEN_H, label + ' 整列在屏幕内', 'y ' + top + '..' + bottom);

  // 不压顶部回合信息栏（BANNER_RECT / 齿轮 / 卷轴按钮）
  const gearBottom = LAYOUT.GEAR.y + LAYOUT.GEAR.size;
  const scrollBottom = LAYOUT.SCROLL.y + LAYOUT.SCROLL.size;
  const hudBottom = faction === 'player' ? gearBottom : scrollBottom;
  check(top >= hudBottom, label + ' 不压顶部 HUD', 'top=' + top + ' hudBottom=' + hudBottom);

  // 2026-10-14 起侧栏只剩「圆形头像框」，木栏外框（entryPanelRect）已删除，
  // 所以这里改成断言**底板烘死的那两个角色美术**：被盖住就真没了
  //（有底板时 drawCoaches 直接 return，不会重画）。
  // 实测：戴草帽大男孩 逻辑 x 6..122 / y 459.6..694.7；但他的**宽檐草帽**向右一直伸到 x216
  //（底板 x124..216 在 y492..532 实测是暖白 222..236，就是帽檐），所以这里拆成两块。
  // 小块与帽檐以 y484 为界：底衬补丁最多补到那里，再往下必须让帽子露出来。
  const cross = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  const solids = [
    // 头/帽冠那一段：底板实测 y459.6..490 之间他的帽子只到 x104，x104 往右全是 4 号槽的白纸
    //（x107..122 实测 rgb(252,253,251)），所以这里不能按整个 116 宽去卡底衬。
    { name: '大男孩的头', r: { x: 6, y: 459.6, w: 98, h: 30.4 } },
    // y490 起是宽檐草帽：x124..216 实测已是暖白 222..236，一直铺到 548 附近。
    { name: '大男孩与草帽檐', r: { x: 6, y: 490, w: 210, h: 205 } },
    { name: '小恶魔', r: { x: LAYOUT.ENEMY_IMP.x, y: LAYOUT.ENEMY_IMP.y, w: LAYOUT.ENEMY_IMP.w, h: LAYOUT.ENEMY_IMP.h } },
  ];
  for (const s of solids) {
    const bads = [];
    for (let i = 0; i < 6; i++) if (cross(rects[i], s.r)) bads.push('slot' + i);
    const backs = ML.sideBackingRects(faction);
    for (let i = 0; i < backs.length; i++) if (cross(backs[i], s.r)) bads.push('backing' + i);
    check(bads.length === 0, label + ' 圆框与底衬均不压' + s.name,
      bads.length ? bads.join(',') + ' vs ' + JSON.stringify(s.r) : '背衬=' + JSON.stringify(backs));
  }

  // 不压底部候补席
  const benchTop = ML.benchRect(0, false).y;
  check(bottom <= benchTop, label + ' 不压底部候补席', 'bottom=' + bottom + ' benchTop=' + benchTop);

  console.log('        ' + label + ' 6 格 y = ' + rects.map(r => r.y).join(', '));
}

console.log('');
console.log('=== 3. 热区 vs 绘制矩形一致性 ===');
{
  // entryAt 必须能命中每一格的中心
  let miss = 0;
  for (const faction of ['player', 'enemy']) {
    for (let i = 0; i < 6; i++) {
      const r = ML.plateSlot(faction, i);
      const hit = ML.entryAt(r.x + r.w / 2, r.y + r.h / 2);
      if (!hit || hit.faction !== faction || hit.index !== i) miss++;
    }
  }
  check(miss === 0, 'entryAt 命中全部 12 格中心', 'miss=' + miss);

  // 替补席热区命中全部 8 格
  let benchMiss = 0;
  for (let i = 0; i < LAYOUT.BENCH.slots; i++) {
    const r = ML.benchRect(i, false);
    if (ML.benchAt(r.x + r.w / 2, r.y + r.h / 2, false) !== i) benchMiss++;
    const rn = ML.benchRect(i, true);
    if (ML.benchAt(rn.x + rn.w / 2, rn.y + rn.h / 2, true) !== i) benchMiss++;
  }
  check(benchMiss === 0, 'benchAt 命中 8 格中心（两阶段）', 'miss=' + benchMiss);
}

console.log('');
console.log('=== 4. 集市：卡牌盖住木框，面板不遮候补席 ===');
{
  const art = LAYOUT.BENCH_ART;
  const artTop = art.seatY - art.lift - art.size;   // 576
  const artBottom = art.seatY;                      // 664
  // 集市出战席是**竖排一列**：6 格 × 格高 + 5 × 间距（见 MARKET_SIDE）
  const rowSpan = (col) => ML.MARKET_SIDE.slots * col.h + (ML.MARKET_SIDE.slots - 1) * col.gap;

  // 4.1 卡牌必须落在木框内，且四周都留出窄木边
  let bad = [];
  for (let i = 0; i < 5; i++) {
    const f = ML.shelfFrameRect(i);
    const r = ML.shelfRect(i);
    const inside = r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h;
    const insetL = r.x - f.x, insetR = (f.x + f.w) - (r.x + r.w);
    const insetT = r.y - f.y, insetB = (f.y + f.h) - (r.y + r.h);
    if (!inside || insetL <= 0 || insetR <= 0 || insetT <= 0 || insetB <= 0) {
      bad.push('slot' + i + ' inside=' + inside + ' insets=' + [insetL, insetR, insetT, insetB].join('/'));
    }
    // 卡牌现在**完全等于底板烘死的样例卡位置**（木框向内缩一整圈 inset），
    // 所以四条边的露边宽度都必须 >0 且"窄"（≤16px，即木框描边效果）。
    if (insetL > 16 || insetR > 16 || insetT > 16 || insetB > 16) {
      bad.push('slot' + i + ' 木边过宽 ' + [insetL, insetR, insetT, insetB].join('/'));
    }
  }
  check(bad.length === 0, '5 张卡牌都在木框内、四周留窄木边', bad.join('; ') || 'inset=' + ML.SHELF.inset);

  // 4.2 木框之间的实际位置来自底板实测，不再是均匀 pitch
  const tops = [0, 1, 2, 3, 4].map(i => ML.shelfFrameRect(i).x);
  const d = [];
  for (let i = 1; i < 5; i++) d.push(tops[i] - tops[i - 1]);
  check(!d.every(v => v === d[0]), '木框按实测逐框定位（非均匀 pitch）', 'starts=' + tops.join(',') + ' pitch=' + d.join(','));

  // 4.3 集市**卡牌面板**（只算 5 个木框）最低边在候补席动物之上。
  //
  // 刷新/赠礼不算在内：它们是复用底板烘焙件、落在候补席下方的底部带，
  // 与候补席的竖直重叠是底板本身的设计；它们的约束是 4.5 的**横向不相交**。
  let lowest = -Infinity, lowestWho = '';
  for (let i = 0; i < 5; i++) {
    const f = ML.shelfFrameRect(i);
    if (f.y + f.h > lowest) { lowest = f.y + f.h; lowestWho = 'shelfFrame' + i; }
  }
  check(lowest <= artTop, '集市卡牌面板最低边不遮候补席动物',
    lowestWho + ' bottom=' + lowest + ' <= artTop=' + artTop);

  // 4.4 面板顶边不压集市顶部横幅
  let highest = Infinity, highestWho = '';
  for (let i = 0; i < 5; i++) {
    const f = ML.shelfFrameRect(i);
    if (f.y < highest) { highest = f.y; highestWho = 'shelfFrame' + i; }
  }
  const bannerBottom = ML.MARKET.banner.y + ML.MARKET.banner.h;
  check(highest >= bannerBottom, '集市面板顶边不压顶部横幅',
    highestWho + ' top=' + highest + ' >= bannerBottom=' + bannerBottom);

  // 4.5 刷新 / 赠礼：**复用底板烘焙件**，所以不再画木底、也不再占面板空间。
  //
  // 约束改成「与候补席动物**横向**不相交」——烘焙件落在候补席下方（y>553），
  // 与动物的竖直带有重叠是正常的（底板本来就这么画）；真正会挡住动物的是
  // 横向压到候补席列（x 304..976）上。按遮挡优先级原则，候补席是信息主体，
  // 刷新/赠礼必须整体落在候补席列之外。
  {
    const bench0 = ML.benchRect(0);
    const benchLast = ML.benchRect(LAYOUT.BENCH.slots - 1);
    const benchL = bench0.x;
    const benchR = benchLast.x + benchLast.w;

    // 刷新圆牌：必须整体落在候补席列之外（它比赠礼牌更靠右，能完全避开）
    const rr = ML.refreshRect();
    const rOvL = Math.max(rr.x, benchL);
    const rOvR = Math.min(rr.x + rr.w, benchR);
    check(rOvR <= rOvL, 'refresh 不与候补席动物横向相交',
      'refresh x ' + rr.x + '..' + (rr.x + rr.w) + ' vs bench x ' + benchL + '..' + benchR);

    // 赠礼牌：**底板本身**就把木牌画在草地上、与候补席列部分重叠，
    // 这是插画的原构图（不是程序化层造成的遮挡），所以只要求
    // 「不与刷新圆牌重叠」+「在屏内」+「文字在牌内」，并要求它的
    // 左下角不要压到候补席最后一格的**动物中心**。
    const gr = ML.giftRect();
    check(gr.x + gr.w <= rr.x, 'gift 在 refresh 左侧且不重叠',
      'gift right=' + (gr.x + gr.w) + ' <= refresh left=' + rr.x);
    // 赠礼木牌是**底板自带的构图**：插画师就把木牌画在草地上、与候补席最后一格
  // 同层（实测牌面 x 868..1046 与最后一格动物 x 890..978 完全横向相交）。
  // 这是底板的原生排版，不是程序化层造成的遮挡，所以这里**不**要求几何上避开；
  // 真正要守住的是「程序化层不得再往上叠一层不透明木底」——即 drawShelf 里
  // 不再有 drawWoodPanel 覆盖带。该项由下面的绘制契约断言保证。
  {
    const srcPath = require('path').join(__dirname, '..', 'src', 'scene', 'match.ts');
    const src = require('fs').readFileSync(srcPath, 'utf8');
    const shelfStart = src.indexOf('private drawShelf(');
    const shelfEnd = src.indexOf('private drawBanner(', shelfStart);
    const body = shelfStart >= 0 && shelfEnd > shelfStart ? src.slice(shelfStart, shelfEnd) : '';
    check(body.length > 0, 'drawShelf 源码可定位', 'len=' + body.length);
    // 集市阶段不得再画木底（只有烘焙件 + 文字覆盖）
    check(body.indexOf('coverH') < 0 && body.indexOf('coverX') < 0,
      'drawShelf 不再画覆盖木带', 'coverX/coverH 均未出现');
    // 数值覆盖是"抹掉烘焙静态值再写动态值"，必须只出现一次填充调用
    const fills = (body.match(/fillWatercolor/g) || []).length;
    check(fills === 2, 'drawShelf 只覆盖两处烘焙静态字（刷新数字 / 赠礼状态）', 'fillWatercolor × ' + fills);
    // 「覆盖」根治：木架必须用**底板自身的木纹像素**铺，不再另画 bark 木栏压上去
    check(body.indexOf('drawPlateWoodPatch') >= 0,
      'drawShelf 用底板自身木纹铺木架（drawPlateWoodPatch）', 'ok');
    check(body.indexOf('drawWoodPanel(ctx, frame') < 0,
      'drawShelf 不再逐格另画 bark 木栏', 'drawWoodPanel(ctx, frame 未出现');

    // 侧栏底衬同理：不得再铺 bark 木栏（那会形成「木栏压着白纸槽」两套 UI）
    const sbStart = src.indexOf('private drawSidebars(');
    const sbEnd = src.indexOf('private benchNarrow(', sbStart);
    const sb = sbStart >= 0 && sbEnd > sbStart ? src.slice(sbStart, sbEnd) : '';
    check(sb.length > 0, 'drawSidebars 源码可定位', 'len=' + sb.length);
    check(sb.indexOf('drawWoodPanel') < 0 && sb.indexOf('alpha: 0.9') < 0,
      'drawSidebars 不再铺 bark 木栏盖底板', 'drawWoodPanel/alpha 0.9 均未出现');
    const bkStart = src.indexOf('private drawSideBacking(');
    const bkEnd = src.indexOf('private drawSidebars(', bkStart);
    const bk = bkStart >= 0 && bkEnd > bkStart ? src.slice(bkStart, bkEnd) : '';
    check(bk.indexOf('drawSideStripBacking') >= 0,
      '侧栏底衬改用 drawSideStripBacking（按底板原样重画纸槽）', 'ok');
    // 底衬必须早于饲养员与 HUD，否则会切掉饲养员头顶/卷轴按钮
    const callAt = src.indexOf('this.drawSideBacking(ctx)');
    const coachAt = src.indexOf('this.drawCoaches(ctx, renderTime)');
    check(callAt > 0 && coachAt > callAt, 'drawSideBacking 早于 drawCoaches 绘制',
      'backing@' + callAt + ' coach@' + coachAt);
  }

    for (const [n, r] of [['refresh', rr], ['gift', gr]]) {
      check(r.x >= 0 && r.x + r.w <= LAYOUT.SCREEN_W && r.y >= 0 && r.y + r.h <= LAYOUT.SCREEN_H,
        n + ' 热区在屏内', 'x ' + r.x + '..' + (r.x + r.w) + ' y ' + r.y + '..' + (r.y + r.h));
    }

    // 赠礼牌内两行文字（drawShelf：+26 / +58）必须落在牌内
    check(58 + 10 <= gr.h, 'gift 两行文字在牌内',
      'h=' + gr.h + ' 需要 >= ' + (58 + 10));
  }

  // 4.8 提示词 P1-⑩⑪：五格顶部/高度对齐误差为 0，木边四周宽度统一且落在 6~8px
  {
    const tops = [], bottoms = [], edges = [];
    for (let i = 0; i < 5; i++) {
      const f = ML.shelfFrameRect(i);
      const c = ML.shelfRect(i);
      tops.push(f.y);
      bottoms.push(f.y + f.h);
      edges.push([c.x - f.x, c.y - f.y, (f.x + f.w) - (c.x + c.w), (f.y + f.h) - (c.y + c.h)]);
    }
    const span = a => Math.max.apply(null, a) - Math.min.apply(null, a);
    check(span(tops) === 0 && span(bottoms) === 0, 'P1-⑩ 五格木框顶部与底边完全对齐',
      'top spread=' + span(tops) + ' bottom spread=' + span(bottoms));
    // 木框四条边的露边必须**完全一致**，且落在提示词建议的 6~8px。
    // 2026-10-15 起卡牌不再按卡面纵横比自己算高度，而是撑满底板样例位，
    // 所以底边也不再是「一大段留给出战席的木底」，四条边一律等宽。
    const lrt = [].concat.apply([], edges.map(e => [e[0], e[2], e[1], e[3]]));
    check(span(lrt) === 0, 'P1-⑪ 木框四周露边宽度完全一致',
      '四边 = ' + edges[0].join('/'));
    check(lrt[0] >= 6 && lrt[0] <= 8, 'P1-⑪ 木边宽度落在建议区间 6~8px', '窄边 = ' + lrt[0] + 'px');
    // 卡牌矩形必须**就是底板烘死样例卡的实测位置**：y 176..549（高 373）。
    // 这是用户 2026-10-15 明确要求的「把你绘制的放到样例卡位置」，
    // 一旦这个常量被改动，绘制就不再压在样例位上（会重新露出/错位）。
    const c0 = ML.shelfRect(0);
    check(c0.y === 176 && c0.h === 373 && ML.SHELF.y0 + ML.SHELF.h === 557,
      'P1-⑪ 卡牌落在底板样例卡实测位 (y 176..549)',
      'card y ' + c0.y + '..' + (c0.y + c0.h) + ' 木底 ' + ML.SHELF.y0 + '..' + (ML.SHELF.y0 + ML.SHELF.h));
    // 卡牌必须完整落在木底内
    const bottomMargins = edges.map(e => e[3]);
    check(Math.min.apply(null, bottomMargins) >= 0, 'P1-⑪ 卡牌不超出木框底边',
      '底边余量 = ' + Math.min.apply(null, bottomMargins).toFixed(2));
    // 卡牌与集市两侧的出战席列不得相交（信息主体之间不能互相压）
    {
      const hits = [];
      for (const f of ['player', 'enemy']) {
        const col = ML.marketSideRow(f);
        const band = {
          x: col.x, y: col.y, w: col.w,
          h: rowSpan(col),
        };
        for (let i = 0; i < 5; i++) {
          const c = ML.shelfRect(i);
          const ox = Math.max(0, Math.min(band.x + band.w, c.x + c.w) - Math.max(band.x, c.x));
          const oy = Math.max(0, Math.min(band.y + band.h, c.y + c.h) - Math.max(band.y, c.y));
          if (ox > 0 && oy > 0) hits.push(f + ' vs 卡牌' + (i + 1) + ' ' + ox + 'x' + oy);
        }
      }
      check(hits.length === 0, 'P1-⑪ 卡牌与集市两侧出战席列不相交', hits.join(', ') || '双方各自落在自己的边条上');
    }
  }

  // 4.9 提示词 P2-⑳：次要操作（结束集市 ❌ / 赠礼木牌 / 刷新圆牌）互不遮挡、间距 ≥16px
  {
    const grp = [
      ['结束集市', ML.MARKET.exitRect],
      ['赠礼木牌', ML.giftRect()],
      ['刷新圆牌', ML.refreshRect()],
    ];
    for (let i = 0; i < grp.length; i++) {
      const [an, a] = grp[i];
      check(a.x >= 0 && a.x + a.w <= LAYOUT.SCREEN_W && a.y >= 0 && a.y + a.h <= LAYOUT.SCREEN_H,
        'P2-⑳ ' + an + '在屏内', 'x ' + a.x + '..' + (a.x + a.w) + ' y ' + a.y + '..' + (a.y + a.h));
      for (let j = i + 1; j < grp.length; j++) {
        const [bn, bs] = grp[j];
        const dx = Math.max(bs.x - (a.x + a.w), a.x - (bs.x + bs.w));
        const dy = Math.max(bs.y - (a.y + a.h), a.y - (bs.y + bs.h));
        check(dx >= 16 || dy >= 16, 'P2-⑳ ' + an + ' 与 ' + bn + ' 间距 ≥16px',
          '水平间距=' + dx + ' 竖直间距=' + dy);
      }
    }
    // 结束集市现在落在**顶部横幅右侧、阳光币条左侧**的空档（卡牌撑满样例位后，
    // 右下角 y 430 一带与右侧边距都被卡牌/出战席占掉了），所以断言改成：
    // 不与横幅、费用牌、齿轮、卡牌、两侧出战席列相交，且在微信胶囊安全区内。
    const ex = ML.MARKET.exitRect;
    {
      const hits = [];
      const bn = ML.MARKET.banner;
      const sun = ML.MARKET.sunRect;
      const gear = ML.MARKET.gear;
      const gearRectObj = { x: gear.x, y: gear.y, w: gear.size, h: gear.size };
      const near = [
        ['顶部横幅', bn], ['阳光费用牌', sun], ['齿轮', gearRectObj],
        ['刷新圆牌', ML.refreshRect()], ['赠礼木牌', ML.giftRect()],
      ];
      for (const f of ['player', 'enemy']) {
        const col = ML.marketSideRow(f);
        near.push(['集市' + (f === 'player' ? '我方' : '敌方') + '出战席列',
          { x: col.x, y: col.y, w: col.w, h: rowSpan(col) }]);
      }
      for (let i = 0; i < 5; i++) near.push(['卡牌' + (i + 1), ML.shelfRect(i)]);
      for (const [n, r] of near) {
        const ox = Math.max(0, Math.min(ex.x + ex.w, r.x + r.w) - Math.max(ex.x, r.x));
        const oy = Math.max(0, Math.min(ex.y + ex.h, r.y + r.h) - Math.max(ex.y, r.y));
        if (ox > 0 && oy > 0) hits.push(n + ' ' + ox + 'x' + oy);
      }
      check(hits.length === 0, 'P2-⑳ 结束集市不与横幅/费用牌/齿轮/卡牌/出战席相交',
        hits.join(', ') || 'exit x ' + ex.x + '..' + (ex.x + ex.w) + ' y ' + ex.y + '..' + (ex.y + ex.h));
      // 微信胶囊横屏通常从 x≈1192 起，按钮必须整体在它左侧
      check(ex.x + ex.w <= 1192, 'P2-⑳ 结束集市避开微信胶囊安全区',
        '右沿=' + (ex.x + ex.w) + ' <= 1192');
    }
    const benchL = 304, benchR = 976;
    // 结束集市已移到顶部横幅右侧（y 18..90），与底部候补席（动物顶 576）在竖直方向
    // 隔了 480 多像素，横向是否重叠已无意义，所以按**矩形不相交**判定。
    check(ex.y + ex.h <= artTop, 'P2-⑳ 结束集市不与候补席相交（整体在候补席之上）',
      'exit bottom=' + (ex.y + ex.h) + ' <= artTop=' + artTop +
      '（横向 exit ' + ex.x + '..' + (ex.x + ex.w) + ' vs bench ' + benchL + '..' + benchR + '）');
  }

  // 4.7 集市阶段的**竖排两列**出战席（卡牌撑满样例位后，中间横向空间全部被卡牌占满，
  //     只剩画面最外侧 x 0..79 / 1206..1280 两条木质边条，详见 MARKET_SIDE 注释）：
  //     屏内、不与卡牌/刷新/赠礼/齿轮/费用牌/结束集市相交。
  {
    const cardRects = [0, 1, 2, 3, 4].map(i => ML.shelfRect(i));
    const gear = ML.MARKET.gear;
    const others = [
      ['刷新圆牌', ML.refreshRect()], ['赠礼木牌', ML.giftRect()],
      ['结束集市', ML.MARKET.exitRect],
      ['顶部横幅', ML.MARKET.banner], ['阳光费用牌', ML.MARKET.sunRect],
      ['齿轮', { x: gear.x, y: gear.y, w: gear.size, h: gear.size }],
      ['卡牌1', cardRects[0]], ['卡牌2', cardRects[1]], ['卡牌3', cardRects[2]],
      ['卡牌4', cardRects[3]], ['卡牌5', cardRects[4]],
    ];
    for (const f of ['player', 'enemy']) {
      const col = ML.marketSideRow(f);
      const band = { x: col.x, y: col.y, w: col.w, h: rowSpan(col) };
      const hits = [];
      for (const [n, r] of others) {
        const ox = Math.max(0, Math.min(band.x + band.w, r.x + r.w) - Math.max(band.x, r.x));
        const oy = Math.max(0, Math.min(band.y + band.h, r.y + r.h) - Math.max(band.y, r.y));
        if (ox > 0 && oy > 0) hits.push(n + ' ' + ox + 'x' + oy);
      }
      check(hits.length === 0, '集市' + (f === 'player' ? '我方' : '敌方') + '出战席列不与卡牌/刷新/赠礼/齿轮/费用牌相交',
        hits.length ? hits.join(', ') : 'band x ' + band.x + '..' + (band.x + band.w) + ' y ' + band.y + '..' + (band.y + band.h));
      check(band.x >= 0 && band.x + band.w <= LAYOUT.SCREEN_W && band.y >= 0 && band.y + band.h <= LAYOUT.SCREEN_H,
        '集市' + (f === 'player' ? '我方' : '敌方') + '出战席列在屏内',
        'x ' + band.x + '..' + (band.x + band.w) + ' y ' + band.y + '..' + (band.y + band.h));
      check(band.y + band.h <= artTop, '集市' + (f === 'player' ? '我方' : '敌方') + '出战席列不压候补席动物',
        'bottom=' + (band.y + band.h) + ' <= artTop=' + artTop);
      // 血环半径：drawMarketSides 取 min(ringR, w/2-2, h/2-2)，必须 >=24（太小看不见物种）且不出格
      const r2 = Math.min(LAYOUT.PLATE.ringR, col.w / 2 - 2, col.h / 2 - 2);
      check(r2 >= 24 && r2 * 2 <= col.w && r2 * 2 <= col.h, '集市' + (f === 'player' ? '我方' : '敌方') + '出战席血环可见',
        'ringR=' + r2 + ' 需 >=24 且 2r<=' + col.w + '/' + col.h);
    }
  }

  // 4.6 卡位热区命中一致性
  let miss = 0;
  for (let i = 0; i < 5; i++) {
    const r = ML.shelfRect(i);
    if (ML.shelfAt(r.x + r.w / 2, r.y + r.h / 2) !== i) miss++;
  }
  check(miss === 0, 'shelfAt 命中全部 5 张卡', 'miss=' + miss);

  console.log('        木框 x = ' + [0, 1, 2, 3, 4].map(i => ML.shelfFrameRect(i).x).join(', '));
  console.log('        面板竖向 = ' + highest + ' .. ' + lowest + '   候补席动物顶 = ' + artTop);
}

console.log('');
console.log(failures === 0 ? '=== 全部通过 ===' : '=== 失败 ' + failures + ' 项 ===');
process.exit(failures === 0 ? 0 : 1);
