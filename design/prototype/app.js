/* 原型交互：切屏 / 缩放 / 标注 / 轻提示 */
(() => {
  const stage = document.getElementById('stage');
  const viewport = document.getElementById('viewport');
  const screens = Array.from(document.querySelectorAll('.screen'));
  const tabs = Array.from(document.querySelectorAll('#toolbar .tab[data-screen]'));
  const params = new URLSearchParams(location.search);
  const CLEAN = params.get('clean') === '1';
  const ORDER = ['camp', 'deploy', 'battle', 'market', 'result', 'collection', 'system'];

  // 布阵盘：按 6×4 生成双方各 24 个落点（原型里不手写 48 个 div）
  document.querySelectorAll('.anchors[data-pads]').forEach((zone) => {
    const n = parseInt(zone.dataset.pads, 10) || 24;
    const valid = (zone.dataset.valid || '').split(',').filter(Boolean).map(Number);
    for (let i = 0; i < n; i++) {
      const a = document.createElement('div');
      a.className = 'anchor' + (valid.indexOf(i) >= 0 ? ' valid' : '');
      zone.appendChild(a);
    }
  });

  let current = 'camp';

  function normalize(name) {
    return ORDER.includes(name) ? name : 'camp';
  }

  function setScreen(name, silent) {
    name = normalize(name);
    const el = document.getElementById('s-' + name);
    if (!el) return;
    current = name;
    screens.forEach((s) => s.classList.toggle('on', s === el));
    tabs.forEach((t) => t.classList.toggle('on', t.dataset.screen === name));
    if (!silent) {
      el.scrollTop = 0;
      if (!CLEAN) {
        if (history.replaceState) history.replaceState(null, '', '#' + name);
        else location.hash = name;
      }
    }
  }

  function fit() {
    if (CLEAN) {
      stage.style.transform = 'none';
      return;
    }
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const s = Math.min((vw - 32) / 1280, (vh - 32) / 720, 1.12);
    stage.style.transform = 'scale(' + Math.max(0.4, s) + ')';
  }

  /* 轻提示 */
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  function toast(msg) {
    if (CLEAN) return;
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translate(-50%, 0)';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translate(-50%, 12px)';
    }, 2100);
  }

  const SCENE_LABEL = {
    deck: '卡组',
    rank: '段位',
    shop: '商店',
    settings: '设置'
  };

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      setScreen(go.dataset.go);
      return;
    }

    const sc = e.target.closest('[data-scene]');
    if (sc) {
      const label = SCENE_LABEL[sc.dataset.scene] || '该页';
      toast('「' + label + '」会沿用图鉴页框架，等这一版确认后实现');
      return;
    }

    const tab = e.target.closest('#toolbar .tab[data-screen]');
    if (tab) {
      setScreen(tab.dataset.screen);
      return;
    }

    /* 选中棋盘上的动物 */
    const unit = e.target.closest('.unit');
    if (unit) {
      const board = unit.closest('.board');
      if (board) {
        board.querySelectorAll('.unit.sel').forEach((u) => u.classList.remove('sel'));
        unit.classList.add('sel');
      }
      return;
    }

    /* 选中替补 */
    const slot = e.target.closest('.slot:not(.empty)');
    if (slot) {
      const row = slot.parentElement;
      row.querySelectorAll('.slot.sel').forEach((s) => s.classList.remove('sel'));
      slot.classList.toggle('sel');
      return;
    }

    /* 集市买入 */
    const buy = e.target.closest('.petcard .buy');
    if (buy) {
      const card = buy.closest('.petcard');
      const name = card.querySelector('.name').childNodes[0].textContent.trim();
      card.classList.add('sold');
      buy.textContent = '已买入 · 飞向替补席';
      toast('买入「' + name + '」→ 替补席（原型演示）');
      return;
    }
  });

  /* 标注开关 */
  const annBtn = document.getElementById('btn-ann');
  function setAnn(on) {
    document.body.classList.toggle('ann', on);
    annBtn.classList.toggle('on', on);
  }
  annBtn.addEventListener('click', () => setAnn(!document.body.classList.contains('ann')));

  /* 键盘切屏 */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = ORDER.indexOf(current);
    const next = e.key === 'ArrowRight'
      ? (i + 1) % ORDER.length
      : (i - 1 + ORDER.length) % ORDER.length;
    setScreen(ORDER[next]);
  });

  window.addEventListener('resize', fit);

  /* 启动 */
  if (CLEAN) {
    document.body.classList.add('clean');
    setScreen(normalize(params.get('screen') || 'camp'), true);
    if (params.get('ann') === '1') setAnn(true);
  } else {
    setScreen(normalize(location.hash.replace('#', '') || 'camp'), true);
  }
  fit();
})();
