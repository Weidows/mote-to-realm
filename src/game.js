/* 合成天下 · 主程序
 * 渲染、输入、计分、连锁、待用、图鉴、局内状态皆在此。
 */
(function () {
  'use strict';

  const SH = window.SH;

  // 主题可在局中切换：两套皮肤的造物半径完全一致，换皮不动物理状态
  let THEME = SH.findTheme(SH.DEFAULT_THEME_ID);
  let LEVELS = THEME.levels;
  let MAX_LEVEL = LEVELS.length - 1;
  let GLYPH_FONT = THEME.glyphFont;
  let PAL = THEME.palette;

  // 逻辑画布尺寸
  const W = 460;
  const H = 640;
  const DANGER_Y = 112;        // 越线判负
  const DROP_Y = 58;           // 出生高度
  const FLOOR_Y = H - 13;      // 落点地面（留出器底一线）
  const COOLDOWN = 0.22;       // 两次落子间隔
  const DANGER_LIMIT = 1.7;    // 越线多久判负
  const CHAIN_WINDOW = 1.6;    // 连锁窗口
  const CHAIN_MAX = 5;         // 连锁倍率上限

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  // ---------------------------------------------------------------- DOM
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const el = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    nextOrb: document.getElementById('nextOrb'),
    nextName: document.getElementById('nextName'),
    q0: document.getElementById('q0'),
    q1: document.getElementById('q1'),
    holdBtn: document.getElementById('holdBtn'),
    holdOrb: document.getElementById('holdOrb'),
    combo: document.getElementById('combo'),
    comboMult: document.getElementById('comboMult'),
    comboBar: document.getElementById('comboBar'),
    statChain: document.getElementById('statChain'),
    statMerges: document.getElementById('statMerges'),
    statTime: document.getElementById('statTime'),
    runstats: document.querySelector('.runstats'),
    ladder: document.getElementById('ladder'),
    tray: document.getElementById('tray'),
    overlay: document.getElementById('overlay'),
    ovEyebrow: document.getElementById('ovEyebrow'),
    ovTitle: document.getElementById('ovTitle'),
    ovDesc: document.getElementById('ovDesc'),
    ovStats: document.getElementById('ovStats'),
    ovBtn: document.getElementById('ovBtn'),
    soundBtn: document.getElementById('soundBtn'),
    soundState: document.getElementById('soundState'),
    themeBtn: document.getElementById('themeBtn'),
    themeTag: document.getElementById('themeTag'),
    restartBtn: document.getElementById('restartBtn'),
    banner: document.getElementById('banner'),
    title: document.getElementById('gameTitle'),
    tagline: document.getElementById('tagline'),
    hint: document.getElementById('hint'),
    fineprint: document.getElementById('fineprint'),
    seal: document.getElementById('seal'),
    favicon: document.querySelector('link[rel="icon"]'),
  };

  // ---------------------------------------------------------------- 存档
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
  }

  const bestKey = () => 'ht.best.' + THEME.id;
  const codexKey = () => 'ht.codex.' + THEME.id;

  const state = {
    phase: 'title',          // title | playing | over
    overlayKind: 'title',
    score: 0,
    shown: 0,                // 滚动中的显示分数
    lastShown: 0,
    best: 0,
    codex: new Set([0]),
    runHighest: 0,
    next: 0,
    queue: [0, 0],
    hold: -1,
    merges: 0,
    chain: 0,
    maxChain: 0,
    chainT: 0,
    startedAt: 0,
    elapsed: 0,
    aimX: W / 2,
    cooldown: 0,
    time: 0,
    shake: 0,
    danger: 0,
    alarm: false,
    statT: 0,
  };

  const particles = [];
  const rings = [];
  const popups = [];
  const stars = [];

  let world = null;
  let scaleX = 1;
  let scaleY = 1;
  let bannerTimer = 0;

  function loadThemeSave() {
    state.best = Number(load(bestKey(), 0)) || 0;
    const arr = load(codexKey(), [0]);
    state.codex = new Set(Array.isArray(arr) ? arr : [0]);
    state.codex.add(0);
  }

  // ---------------------------------------------------------------- 世界
  function createWorld() {
    return new SH.World({
      W: W,
      H: H,
      floorY: FLOOR_Y,
      levels: LEVELS,
      gravity: 2500,
      onMerge: handleMerge,
    });
  }

  function handleMerge(ev) {
    const x = ev.x;
    const y = ev.y;
    const level = ev.level;
    const result = ev.result;
    const shown = result === null ? level : result;
    const def = LEVELS[shown];

    // 连锁：窗口内连续合成为一串
    state.chain = state.chainT > 0 ? state.chain + 1 : 1;
    state.chainT = CHAIN_WINDOW;
    if (state.chain > state.maxChain) state.maxChain = state.chain;

    const mult = Math.min(CHAIN_MAX, 1 + (state.chain - 1) * 0.5);
    const pts = Math.round(SH.mergePoints(level) * mult);
    state.merges++;

    addScore(pts);
    burst(x, y, def, result === null ? 70 : 12 + shown * 2);
    rings.push({ x, y, r: def.r * 0.5, vr: 300, life: 0.5, max: 0.5, color: def.glow, width: 2.5 });
    popups.push({
      x, y: y - def.r * 0.3, text: '+' + pts,
      life: 0.95, max: 0.95, color: def.glow, size: 14 + Math.min(shown, 6) * 1.5,
    });

    if (state.chain >= 2) {
      popups.push({
        x, y: y - def.r * 0.3 - 22, text: '×' + mult.toFixed(mult % 1 ? 1 : 0),
        life: 0.85, max: 0.85, color: '#ffd77a', size: 15,
      });
    }

    state.shake = Math.min(15, 3 + shown * 1.2 + state.chain);
    SH.Audio.merge(level, result === null, state.chain);

    if (result === null) {
      const top = LEVELS[MAX_LEVEL].glow;
      addScore(5000);
      rings.push({ x, y, r: 8, vr: 1000, life: 0.9, max: 0.9, color: top, width: 6 });
      popups.push({ x: W / 2, y: H * 0.34, text: THEME.copy.allPopup, life: 1.8, max: 1.8, color: top, size: 24 });
      state.shake = 24;
      showBanner(THEME.copy.allBanner, top);
      return;
    }

    const isNew = discover(result);
    if (result > state.runHighest) state.runHighest = result;
    if (result === MAX_LEVEL) {
      showBanner(THEME.copy.maxBanner, LEVELS[MAX_LEVEL].glow);
    } else if (isNew && result >= 3) {
      showBanner(THEME.copy.newRealm + LEVELS[result].name, def.glow);
    }
  }

  function discover(level) {
    if (state.codex.has(level)) return false;
    state.codex.add(level);
    save(codexKey(), [...state.codex].sort((a, b) => a - b));
    paintLadder();
    return true;
  }

  // ---------------------------------------------------------------- 分数
  function addScore(n) {
    state.score += n;
    if (state.score > state.best) {
      state.best = state.score;
      save(bestKey(), state.best);
      el.best.textContent = fmt(state.best);
    }
  }

  // ---------------------------------------------------------------- 特效
  function burst(x, y, def, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(50, 250) * (def.r / 42 + 0.75);
      const life = rand(0.32, 0.85);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 45,
        life,
        max: life,
        r: rand(1.2, 3.4) * (def.r / 34 + 0.6),
        color: Math.random() < 0.55 ? def.c[0] : def.c[1],
      });
    }
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 980 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      r.r += r.vr * dt * (0.35 + r.life / r.max);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= dt;
      if (p.life <= 0) { popups.splice(i, 1); continue; }
      p.y -= 26 * dt;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 55);
  }

  // ---------------------------------------------------------------- 流程
  function startGame() {
    world = createWorld();
    state.score = 0;
    state.shown = 0;
    state.lastShown = 0;
    state.merges = 0;
    state.chain = 0;
    state.maxChain = 0;
    state.chainT = 0;
    state.hold = -1;
    state.queue = [SH.pickSpawn(), SH.pickSpawn()];
    state.next = SH.pickSpawn();
    state.cooldown = 0;
    state.time = 0;
    state.shake = 0;
    state.danger = 0;
    state.runHighest = 0;
    state.aimX = W / 2;
    state.phase = 'playing';
    state.startedAt = performance.now();
    state.elapsed = 0;
    particles.length = 0;
    rings.length = 0;
    popups.length = 0;

    discover(0);
    hideOverlay();
    el.nextOrb.classList.remove('cooling');
    renderHud();
    updateStats();
    SH.Audio.unlock();
  }

  function gameOver() {
    if (state.phase !== 'playing') return;
    state.phase = 'over';
    state.elapsed = (performance.now() - state.startedAt) / 1000;
    SH.Audio.over();
    if (state.score > state.best) {
      state.best = state.score;
      save(bestKey(), state.best);
    }
    el.best.textContent = fmt(state.best);
    renderHud();
    updateStats();
    showOver();
  }

  /** 结算 */
  function showOver() {
    const c = THEME.copy;
    const reached = state.runHighest || 0;
    showOverlay({
      kind: 'over',
      eyebrow: c.overEyebrow,
      title: c.overTitle,
      desc: c.overDesc,
      stats: [
        ['得分', fmt(state.score)],
        [c.highestLabel, LEVELS[reached].name],
        ['最大连锁', '×' + state.maxChain],
      ],
      btn: c.overBtn,
    });
  }

  /** 开场 */
  function showTitle() {
    const c = THEME.copy;
    showOverlay({
      kind: 'title',
      eyebrow: c.startEyebrow,
      title: c.startTitle,
      desc: c.startDesc,
      stats: [
        ['最高', fmt(state.best)],
        ['图鉴', state.codex.size + ' / ' + LEVELS.length],
      ],
      btn: c.startBtn,
    });
  }

  function drop() {
    if (state.phase !== 'playing' || !world || state.cooldown > 0) return;
    const lv = state.next;
    const r = LEVELS[lv].r;
    const x = clamp(state.aimX, r + 1, W - r - 1);

    world.add(x, DROP_Y, lv, { vy: 120 });
    state.cooldown = COOLDOWN;
    state.next = state.queue.shift();
    state.queue.push(SH.pickSpawn());

    el.nextOrb.classList.add('cooling');
    renderHud();
    SH.Audio.drop();
  }

  /** 待用：空则存入当前，满则与之交换 */
  function toggleHold() {
    if (state.phase !== 'playing') return;
    if (state.hold < 0) {
      state.hold = state.next;
      state.next = state.queue.shift();
      state.queue.push(SH.pickSpawn());
    } else {
      const t = state.hold;
      state.hold = state.next;
      state.next = t;
    }
    renderHud();
    SH.Audio.hold();
  }

  function update(dt) {
    state.time += dt;
    state.elapsed += dt;
    if (state.cooldown > 0) state.cooldown -= dt;

    // 连锁窗口
    if (state.chainT > 0) {
      state.chainT -= dt;
      if (state.chainT <= 0) { state.chainT = 0; state.chain = 0; }
    }

    // 分数滚动
    if (state.shown !== state.score) {
      state.shown += (state.score - state.shown) * Math.min(1, dt * 14);
      if (Math.abs(state.score - state.shown) < 0.6) state.shown = state.score;
      const ints = Math.round(state.shown);
      if (ints !== state.lastShown) {
        state.lastShown = ints;
        el.score.textContent = fmt(ints);
      }
    }

    if (world) {
      world.advance(dt);
      checkDanger(dt);
    }
    updateEffects(dt);
    updateCombo();

    state.statT += dt;
    if (state.statT > 0.2) {
      state.statT = 0;
      updateStats();
    }
    if (state.cooldown <= 0) el.nextOrb.classList.remove('cooling');
  }

  function updateCombo() {
    const on = state.chainT > 0 && state.chain >= 2;
    if (on !== el.combo.classList.contains('on')) el.combo.classList.toggle('on', on);
    if (!on) return;
    const mult = Math.min(CHAIN_MAX, 1 + (state.chain - 1) * 0.5);
    el.comboMult.textContent = '×' + (mult % 1 ? mult.toFixed(1) : mult);
    el.comboBar.style.transform = 'scaleX(' + (state.chainT / CHAIN_WINDOW).toFixed(3) + ')';
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function updateStats() {
    el.runstats.classList.toggle('idle', state.phase === 'title');
    el.statChain.textContent = '×' + Math.max(1, state.maxChain);
    el.statMerges.textContent = state.merges;
    const s = Math.floor(state.elapsed);
    el.statTime.textContent = pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  function checkDanger(dt) {
    let worst = 0;
    const balls = world.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dead || b.age < 0.9) continue;
      if (b.y - b.r < DANGER_Y) {
        b.dangerTime += dt;
        if (b.dangerTime > worst) worst = b.dangerTime;
      } else {
        b.dangerTime = 0;
      }
    }
    state.danger = Math.min(1, worst / DANGER_LIMIT);
    const alarm = state.danger > 0.28;
    if (alarm !== state.alarm) {
      state.alarm = alarm;
      el.tray.classList.toggle('alarm', alarm);
    }
    if (worst >= DANGER_LIMIT) gameOver();
  }

  // ---------------------------------------------------------------- HUD
  function paintOrb(node, level) {
    const def = LEVELS[level];
    node.textContent = def.glyph;
    node.style.background =
      'radial-gradient(circle at 34% 26%, ' + def.c[0] + ' 0%, ' + def.c[1] + ' 54%, ' + def.c[2] + ' 100%)';
    node.style.color = def.fg;
    node.style.boxShadow = '0 0 0 1px rgba(0,0,0,.18), 0 6px 14px -8px rgba(0,0,0,.55), inset 0 -8px 16px rgba(0,0,0,.28)';
  }

  function paintHold() {
    if (state.hold < 0) {
      el.holdOrb.textContent = '—';
      el.holdOrb.classList.remove('has');
      el.holdOrb.style.background = '';
      el.holdOrb.style.color = '';
    } else {
      el.holdOrb.classList.add('has');
      paintOrb(el.holdOrb, state.hold);
    }
  }

  function renderHud() {
    el.score.textContent = fmt(state.shown);
    el.best.textContent = fmt(state.best);
    paintOrb(el.nextOrb, state.next);
    el.nextName.textContent = LEVELS[state.next].name;
    paintOrb(el.q0, state.queue[0]);
    paintOrb(el.q1, state.queue[1]);
    paintHold();
    paintLadder();
  }

  function buildLadder() {
    el.ladder.innerHTML = '';
    LEVELS.forEach(function (def, i) {
      const li = document.createElement('li');
      li.className = 'step';
      li.style.setProperty('--c1', def.c[0]);
      li.style.setProperty('--c2', def.c[2]);
      li.innerHTML = '<i>' + def.glyph + '</i><span>' + def.name + '</span>';
      li.title = def.name;
      el.ladder.appendChild(li);
    });
  }

  function paintLadder() {
    let cur = 0;
    state.codex.forEach(function (lv) { if (lv > cur) cur = lv; });
    Array.prototype.forEach.call(el.ladder.children, function (li, i) {
      li.classList.toggle('on', state.codex.has(i));
      li.classList.toggle('cur', i === cur);
    });
  }

  function showBanner(text, color) {
    el.banner.textContent = text;
    el.banner.style.color = color;
    el.banner.style.textShadow = '0 0 22px ' + color;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { el.banner.classList.remove('show'); }, 1500);
  }

  // ---------------------------------------------------------------- 遮罩
  function showOverlay(o) {
    state.overlayKind = o.kind || null;
    el.ovEyebrow.textContent = o.eyebrow;
    el.ovTitle.textContent = o.title;
    el.ovDesc.innerHTML = o.desc;
    el.ovStats.innerHTML = (o.stats || []).map(function (row) {
      return '<div><span>' + row[0] + '</span><b>' + row[1] + '</b></div>';
    }).join('');
    el.ovBtn.textContent = o.btn;
    el.overlay.classList.add('show');
  }

  function hideOverlay() {
    state.overlayKind = null;
    el.overlay.classList.remove('show');
  }

  // ---------------------------------------------------------------- 主题
  function setFavicon(t) {
    if (!el.favicon) return;
    const glyph = t.levels[t.levels.length - 1].glyph;
    const bg = t.id === 'hecheng' ? '#b8231b' : '#1b2326';
    const fg = t.id === 'hecheng' ? '#fff2d0' : '#e8dcc2';
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
      "<rect width='64' height='64' rx='10' fill='" + bg + "'/>" +
      "<text x='32' y='45' font-size='38' text-anchor='middle' fill='" + fg + "' font-family='serif'>" + glyph + "</text>" +
      '</svg>';
    el.favicon.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function applyTheme(id, opts) {
    const t = SH.findTheme(id);
    THEME = t;
    LEVELS = t.levels;
    MAX_LEVEL = LEVELS.length - 1;
    GLYPH_FONT = t.glyphFont;
    PAL = t.palette;
    if (world) world.levels = LEVELS;

    document.documentElement.setAttribute('data-theme', t.id);
    document.title = t.title;
    el.title.textContent = t.title;
    el.tagline.textContent = t.tagline;
    el.seal.textContent = t.levels[t.levels.length - 1].glyph;
    el.hint.textContent = t.copy.hint;
    el.fineprint.textContent = t.copy.fineprint || '';
    el.themeTag.textContent = t.tag;
    el.themeBtn.title = '切换主题（T）· 当前「' + t.title + '」';
    el.themeBtn.setAttribute('aria-label', '切换主题，当前「' + t.title + '」');
    setFavicon(t);

    loadThemeSave();
    buildLadder();
    renderHud();
    if (state.overlayKind === 'title') showTitle();
    else if (state.overlayKind === 'over') showOver();

    if (!opts || opts.persist !== false) save(SH.THEME_KEY, t.id);
  }

  function toggleTheme() {
    applyTheme(THEME.id === 'tianxia' ? 'hecheng' : 'tianxia');
    const def = LEVELS[Math.min(3, MAX_LEVEL)];
    burst(W / 2, H * 0.42, def, 26);
    rings.push({ x: W / 2, y: H * 0.42, r: 10, vr: 520, life: 0.7, max: 0.7, color: def.glow, width: 2 });
    SH.Audio.unlock();
    SH.Audio.merge(2, false, 1);
  }

  // ---------------------------------------------------------------- 绘制
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scaleX = canvas.width / W;
    scaleY = canvas.height / H;
  }

  function seedStars() {
    for (let i = 0; i < 64; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(0.3, 1.3),
        a: rand(0.04, 0.3),
        p: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.bg[0]);
    g.addColorStop(0.55, PAL.bg[1]);
    g.addColorStop(1, PAL.bg[2]);
    ctx.fillStyle = g;
    ctx.fillRect(-4, -4, W + 8, H + 8);

    // 顶部一线天光
    const tg = ctx.createRadialGradient(W / 2, -90, 20, W / 2, -90, 430);
    tg.addColorStop(0, 'rgba(' + PAL.sky + ',.15)');
    tg.addColorStop(1, 'rgba(' + PAL.sky + ',0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, 330);

    // 底部沉积
    const bg = ctx.createLinearGradient(0, H - 210, 0, H);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, H - 210, W, 210);

    // 漆面：中心微亮、四角压暗，让它像一只盘子而不是一块黑布
    const vig = ctx.createRadialGradient(W / 2, H * 0.46, W * 0.15, W / 2, H * 0.46, W * 0.95);
    vig.addColorStop(0, 'rgba(255,255,255,.035)');
    vig.addColorStop(0.6, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.4)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    const t = state.time;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(t * 1.1 + s.p));
      ctx.fillStyle = PAL.star;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** 器底：一道极淡的金线，标出球停驻之处 */
  function drawFloor() {
    const g = ctx.createLinearGradient(0, FLOOR_Y - 24, 0, H);
    g.addColorStop(0, 'rgba(' + PAL.floor + ',0)');
    g.addColorStop(0.72, 'rgba(' + PAL.floor + ',.05)');
    g.addColorStop(1, 'rgba(' + PAL.floor + ',.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, FLOOR_Y - 24, W, H - FLOOR_Y + 24);

    ctx.strokeStyle = 'rgba(' + PAL.floor + ',.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y + 0.5);
    ctx.lineTo(W, FLOOR_Y + 0.5);
    ctx.stroke();
  }

  function drawDangerLine() {
    const t = state.danger;
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(' + PAL.floor + ',' + (0.16 + t * 0.5) + ')';
    ctx.beginPath();
    ctx.moveTo(0, DANGER_Y);
    ctx.lineTo(W, DANGER_Y);
    ctx.stroke();
    ctx.restore();

    if (t > 0.01) {
      const g = ctx.createLinearGradient(0, DANGER_Y - 48, 0, DANGER_Y + 6);
      g.addColorStop(0, 'rgba(' + PAL.danger + ',0)');
      g.addColorStop(1, 'rgba(' + PAL.danger + ',' + 0.22 * t + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, DANGER_Y - 48, W, 54);
    }
  }

  /** 顶部溢出条：越线越久，红条越长 */
  function drawDangerMeter() {
    const t = state.danger;
    if (t <= 0.01) return;
    ctx.save();
    ctx.fillStyle = 'rgba(' + PAL.danger + ',.18)';
    ctx.fillRect(0, 0, W, 3);
    ctx.fillStyle = 'rgba(' + PAL.danger + ',' + (0.5 + t * 0.5) + ')';
    ctx.fillRect(0, 0, W * t, 3);
    ctx.restore();
  }

  function drawBall(b) {
    const L = LEVELS[b.level];
    const r = b.r;

    // 下落残影
    if (b.age < 0.75 && b.vy > 520) {
      const g = ctx.createLinearGradient(0, b.y - r, 0, b.y - r - Math.min(90, b.vy * 0.08));
      g.addColorStop(0, 'rgba(' + PAL.floor + ',.16)');
      g.addColorStop(1, 'rgba(' + PAL.floor + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.x - r * 0.32, b.y - r - 90, r * 0.64, 90);
    }

    ctx.save();
    if (b.level >= 6) {
      ctx.shadowColor = L.glow;
      ctx.shadowBlur = 8 + (b.level - 6) * 2.2;
    }
    const g = ctx.createRadialGradient(b.x - r * 0.34, b.y - r * 0.4, r * 0.05, b.x, b.y, r * 1.03);
    g.addColorStop(0, L.c[0]);
    g.addColorStop(0.5, L.c[1]);
    g.addColorStop(1, L.c[2]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    // 体积、高光、刻记
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.clip();

    const lg = ctx.createLinearGradient(b.x - r, b.y - r, b.x + r * 0.6, b.y + r * 0.85);
    lg.addColorStop(0, 'rgba(255,255,255,.15)');
    lg.addColorStop(0.45, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,.36)');
    ctx.fillStyle = lg;
    ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);

    const hx = b.x - r * 0.34;
    const hy = b.y - r * 0.42;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.5);
    hg.addColorStop(0, 'rgba(255,255,255,.42)');
    hg.addColorStop(0.5, 'rgba(255,255,255,.08)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // 轮缘刻记：阶次越高，刻记越多（不靠颜色也能读数）
    const ticks = b.level + 1;
    if (r > 11) {
      const tr = r * 0.855;
      const len = Math.max(1.6, r * 0.06);
      ctx.strokeStyle = 'rgba(255,255,255,.24)';
      ctx.lineWidth = Math.max(1, r * 0.022);
      ctx.beginPath();
      for (let i = 0; i < ticks; i++) {
        const a = -Math.PI / 2 + (i / ticks) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(b.x + c * tr, b.y + s * tr);
        ctx.lineTo(b.x + c * (tr - len), b.y + s * (tr - len));
      }
      ctx.stroke();
    }
    ctx.restore();

    // 边缘：内亮外暗
    ctx.beginPath();
    ctx.arc(b.x, b.y, r - 0.75, 0, Math.PI * 2);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(b.x, b.y, r - 2, Math.PI * 1.08, Math.PI * 1.92);
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.stroke();

    // 字符
    if (r > 9) {
      const size = r * (L.glyph.length > 1 ? 0.6 : 0.8);
      ctx.font = '700 ' + size.toFixed(1) + 'px ' + GLYPH_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = L.fg;
      ctx.globalAlpha = 0.95;
      ctx.shadowColor = 'rgba(255,255,255,.26)';
      ctx.shadowBlur = r * 0.08;
      ctx.fillText(L.glyph, b.x, b.y + r * 0.04);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function drawEffects() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      ctx.globalAlpha = Math.max(0, r.life / r.max) * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPopups() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < popups.length; i++) {
      const p = popups[i];
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = '700 ' + p.size + 'px ' + GLYPH_FONT;
      ctx.fillStyle = p.color;
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 8;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  function drawAim() {
    const lv = state.next;
    const r = LEVELS[lv].r;
    const x = clamp(state.aimX, r + 1, W - r - 1);
    const ready = state.cooldown <= 0;

    ctx.save();
    ctx.setLineDash([5, 11]);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(' + PAL.floor + ',' + (ready ? 0.24 : 0.09) + ')';
    ctx.beginPath();
    ctx.moveTo(x, DROP_Y + r + 8);
    ctx.lineTo(x, FLOOR_Y - 3);
    ctx.stroke();
    ctx.restore();

    // 地面落点记号
    ctx.save();
    ctx.globalAlpha = ready ? 0.5 : 0.18;
    ctx.strokeStyle = 'rgba(' + PAL.floor + ',.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 7, FLOOR_Y + 1.5);
    ctx.lineTo(x + 7, FLOOR_Y + 1.5);
    ctx.stroke();
    ctx.restore();

    ctx.globalAlpha = ready ? 1 : 0.34;
    drawBall({ x: x, y: DROP_Y + Math.sin(state.time * 3.2) * 1.4, r: r, level: lv, age: 9, vy: 0 });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    const s = state.shake;
    if (s > 0.3) ctx.translate(rand(-s, s) * 0.32, rand(-s, s) * 0.32);

    drawBackground();
    drawFloor();
    drawDangerLine();

    if (world) {
      for (let i = 0; i < world.balls.length; i++) {
        const b = world.balls[i];
        if (!b.dead) drawBall(b);
      }
    }

    drawEffects();
    if (state.phase === 'playing') drawAim();
    drawPopups();
    drawDangerMeter();
  }

  // ---------------------------------------------------------------- 输入
  function pointerX(e) {
    const rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  canvas.addEventListener('pointermove', function (e) {
    state.aimX = pointerX(e);
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (state.phase !== 'playing') return;
    state.aimX = pointerX(e);
    drop();
  });

  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowLeft') {
      state.aimX -= 16;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      state.aimX += 16;
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (state.phase === 'playing') { drop(); e.preventDefault(); }
    } else if (k === 'h') {
      toggleHold();
    } else if (k === 'r') {
      startGame();
    } else if (k === 't') {
      toggleTheme();
    }
  });

  el.ovBtn.addEventListener('click', startGame);
  el.restartBtn.addEventListener('click', startGame);
  el.themeBtn.addEventListener('click', toggleTheme);
  el.holdBtn.addEventListener('click', toggleHold);

  el.soundBtn.addEventListener('click', function () {
    const on = !SH.Audio.isEnabled();
    SH.Audio.setEnabled(on);
    el.soundState.textContent = on ? '开' : '关';
    el.soundBtn.setAttribute('aria-pressed', String(on));
    if (on) { SH.Audio.unlock(); SH.Audio.drop(); }
  });

  // ---------------------------------------------------------------- 主循环
  let last = 0;

  function frame(now) {
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05);

    if (state.phase === 'playing') {
      update(dt);
    } else {
      state.time += dt;
      updateEffects(dt);
    }

    draw();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- 启动
  function boot() {
    seedStars();
    world = createWorld();
    state.queue = [SH.pickSpawn(), SH.pickSpawn()];
    state.next = SH.pickSpawn();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    applyTheme(load(SH.THEME_KEY, SH.DEFAULT_THEME_ID), { persist: false });
    showTitle();
    updateStats();

    requestAnimationFrame(function (t) {
      last = t;
      requestAnimationFrame(frame);
    });
  }

  boot();

  // 调试钩子：仅在 #debug 下暴露，便于自动化测试
  if (location.hash === '#debug') {
    window.__HT = {
      state: state,
      get world() { return world; },
      get theme() { return THEME.id; },
      startGame: startGame,
      drop: drop,
      toggleHold: toggleHold,
      applyTheme: applyTheme,
      toggleTheme: toggleTheme,
      addBall: function (x, y, level) { return world.add(x, y, level); },
    };
  }
})();
