/* 合成天下 · 主程序
 * 渲染、输入、计分、图鉴、局内状态皆在此。
 */
(function () {
  'use strict';

  const SH = window.SH;
  const LEVELS = SH.LEVELS;
  const MAX_LEVEL = SH.MAX_LEVEL;

  // 逻辑画布尺寸（渲染时等比缩放到实际像素）
  const W = 460;
  const H = 640;
  const DANGER_Y = 112;       // 越线判负线
  const DROP_Y = 58;          // 出生高度
  const FLOOR_Y = H - 9;      // 地面（留出一线器底）
  const COOLDOWN = 0.3;       // 两次落子间隔
  const DANGER_LIMIT = 1.7;   // 越线多久判负
  const GLYPH_FONT = '"Songti SC","STSong","SimSun","Noto Serif SC",serif';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------- DOM
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const el = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    nextOrb: document.getElementById('nextOrb'),
    nextName: document.getElementById('nextName'),
    codex: document.getElementById('codexList'),
    overlay: document.getElementById('overlay'),
    ovEyebrow: document.getElementById('ovEyebrow'),
    ovTitle: document.getElementById('ovTitle'),
    ovDesc: document.getElementById('ovDesc'),
    ovResult: document.getElementById('ovResult'),
    ovBtn: document.getElementById('ovBtn'),
    soundBtn: document.getElementById('soundBtn'),
    restartBtn: document.getElementById('restartBtn'),
    banner: document.getElementById('banner'),
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

  const state = {
    phase: 'title',           // title | playing | over
    score: 0,
    best: Number(load('ht.best', 0)) || 0,
    codex: new Set(load('ht.codex', [0])),
    next: 0,
    aimX: W / 2,
    cooldown: 0,
    time: 0,
    shake: 0,
    danger: 0,
  };

  const particles = [];
  const rings = [];
  const popups = [];
  const stars = [];

  let world = null;
  let scaleX = 1;
  let scaleY = 1;
  let bannerTimer = 0;

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
    const pts = SH.mergePoints(level);
    const shown = result === null ? level : result;
    const def = LEVELS[shown];

    addScore(pts);
    burst(x, y, def, result === null ? 70 : 12 + shown * 2);
    rings.push({ x, y, r: def.r * 0.5, vr: 300, life: 0.5, max: 0.5, color: def.glow, width: 2.5 });
    popups.push({
      x, y: y - def.r * 0.25, text: '+' + pts,
      life: 0.95, max: 0.95, color: def.glow, size: 14 + Math.min(shown, 6) * 1.6,
    });

    state.shake = Math.min(15, 3 + shown * 1.3);
    SH.Audio.merge(level, result === null);

    if (result === null) {
      // 两枚「天下」相合 —— 天下大同
      addScore(5000);
      rings.push({ x, y, r: 8, vr: 1000, life: 0.9, max: 0.9, color: '#fff0b0', width: 6 });
      popups.push({ x: W / 2, y: H * 0.34, text: '天下大同 +5000', life: 1.8, max: 1.8, color: '#ffe9a8', size: 24 });
      state.shake = 24;
      showBanner('天下大同 · 万象归一', '#ffe9a8');
      return;
    }

    const isNew = discover(result);
    if (result > state.runHighest) state.runHighest = result;
    if (result === MAX_LEVEL) {
      showBanner('天下已成', '#ffe9a8');
    } else if (isNew && result >= 3) {
      showBanner('新境 · ' + LEVELS[result].name, def.glow);
    }
  }

  function discover(level) {
    if (state.codex.has(level)) return false;
    state.codex.add(level);
    save('ht.codex', [...state.codex].sort((a, b) => a - b));
    renderCodex();
    return true;
  }

  // ---------------------------------------------------------------- 分数
  function addScore(n) {
    state.score += n;
    if (state.score > state.best) {
      state.best = state.score;
      save('ht.best', state.best);
      el.best.textContent = state.best;
    }
    el.score.textContent = state.score;
    el.score.classList.remove('bump');
    void el.score.offsetWidth;
    el.score.classList.add('bump');
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

  // ---------------------------------------------------------------- 游戏流程
  function startGame() {
    world = createWorld();
    state.score = 0;
    state.next = SH.pickSpawn();
    state.cooldown = 0;
    state.time = 0;
    state.shake = 0;
    state.danger = 0;
    state.runHighest = 0;
    state.aimX = W / 2;
    state.phase = 'playing';
    particles.length = 0;
    rings.length = 0;
    popups.length = 0;

    discover(0);
    hideOverlay();
    updateHud();
    SH.Audio.unlock();
    el.overlay.classList.remove('show');
  }

  function gameOver() {
    if (state.phase !== 'playing') return;
    state.phase = 'over';
    SH.Audio.over();
    if (state.score > state.best) {
      state.best = state.score;
      save('ht.best', state.best);
    }
    el.best.textContent = state.best;
    const reached = state.runHighest || 0;
    showOverlay({
      eyebrow: '造化止于此',
      title: '乾坤已满',
      desc: '这一方天地，再也容不下一物。',
      result: '本局 <b>' + state.score + '</b> 分 · 最高造物 <b>' + LEVELS[reached].name + '</b>',
      btn: '再来一局',
    });
  }

  function drop() {
    if (state.phase !== 'playing' || !world || state.cooldown > 0) return;
    const lv = state.next;
    const r = LEVELS[lv].r;
    const x = clamp(state.aimX, r + 1, W - r - 1);

    world.add(x, DROP_Y, lv, { vy: 120 });
    state.cooldown = COOLDOWN;
    state.next = SH.pickSpawn();

    updateHud();
    SH.Audio.drop();
  }

  function update(dt) {
    state.time += dt;
    if (state.cooldown > 0) state.cooldown -= dt;

    if (world) {
      world.advance(dt);
      checkDanger(dt);
    }
    updateEffects(dt);
    if (state.cooldown <= 0) updateHudReady();
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
    if (worst >= DANGER_LIMIT) gameOver();
  }

  // ---------------------------------------------------------------- HUD
  function paintOrb(node, level) {
    const def = LEVELS[level];
    node.textContent = def.glyph;
    node.style.background =
      'radial-gradient(circle at 34% 28%, ' + def.c[0] + ' 0%, ' + def.c[1] + ' 52%, ' + def.c[2] + ' 100%)';
    node.style.color = def.fg;
    node.style.boxShadow = '0 0 26px -8px ' + def.glow + ', inset 0 -8px 16px rgba(0,0,0,.35)';
  }

  function updateHud() {
    el.score.textContent = state.score;
    el.best.textContent = state.best;
    paintOrb(el.nextOrb, state.next);
    el.nextName.textContent = LEVELS[state.next].name;
    updateHudReady();
  }

  function updateHudReady() {
    el.nextOrb.classList.toggle('ready', state.cooldown <= 0);
    el.nextOrb.classList.toggle('cooling', state.cooldown > 0);
  }

  function renderCodex() {
    if (!el.codex.children.length) {
      LEVELS.forEach(function (def) {
        const li = document.createElement('li');
        li.className = 'codex-item';
        li.style.setProperty('--c1', def.c[0]);
        li.style.setProperty('--c2', def.c[2]);
        li.title = def.name;
        li.innerHTML = '<i>' + def.glyph + '</i><span>' + def.name + '</span>';
        el.codex.appendChild(li);
      });
    }
    Array.prototype.forEach.call(el.codex.children, function (li, i) {
      li.classList.toggle('on', state.codex.has(i));
    });
  }

  function showBanner(text, color) {
    el.banner.textContent = text;
    el.banner.style.color = color;
    el.banner.style.textShadow = '0 0 24px ' + color;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { el.banner.classList.remove('show'); }, 1500);
  }

  // ---------------------------------------------------------------- 遮罩
  function showOverlay(o) {
    el.ovEyebrow.textContent = o.eyebrow;
    el.ovTitle.textContent = o.title;
    el.ovDesc.innerHTML = o.desc;
    el.ovResult.innerHTML = o.result || '';
    el.ovBtn.textContent = o.btn;
    el.overlay.classList.add('show');
  }

  function hideOverlay() {
    el.overlay.classList.remove('show');
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
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(0.35, 1.5),
        a: rand(0.05, 0.42),
        p: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b141b');
    g.addColorStop(0.55, '#0a1014');
    g.addColorStop(1, '#0c1013');
    ctx.fillStyle = g;
    ctx.fillRect(-4, -4, W + 8, H + 8);

    // 顶部一线天光
    const tg = ctx.createRadialGradient(W / 2, -80, 20, W / 2, -80, 420);
    tg.addColorStop(0, 'rgba(120,160,190,.16)');
    tg.addColorStop(1, 'rgba(120,160,190,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, 320);

    // 底部沉积
    const bg = ctx.createLinearGradient(0, H - 200, 0, H);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, H - 200, W, 200);

    const t = state.time;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const a = s.a * (0.55 + 0.45 * Math.sin(t * 1.2 + s.p));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dce8f0';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** 器底：一道极淡的金线，标出球停驻之处 */
  function drawFloor() {
    const g = ctx.createLinearGradient(0, FLOOR_Y - 24, 0, H);
    g.addColorStop(0, 'rgba(217,178,106,0)');
    g.addColorStop(0.72, 'rgba(217,178,106,.045)');
    g.addColorStop(1, 'rgba(217,178,106,.13)');
    ctx.fillStyle = g;
    ctx.fillRect(0, FLOOR_Y - 24, W, H - FLOOR_Y + 24);

    ctx.strokeStyle = 'rgba(217,178,106,.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y + 0.5);
    ctx.lineTo(W, FLOOR_Y + 0.5);
    ctx.stroke();
  }

  function drawDangerLine() {
    const t = state.danger;
    ctx.save();
    ctx.setLineDash([9, 9]);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(217,178,106,' + (0.2 + t * 0.55) + ')';
    ctx.beginPath();
    ctx.moveTo(0, DANGER_Y);
    ctx.lineTo(W, DANGER_Y);
    ctx.stroke();
    ctx.restore();

    if (t > 0.01) {
      const g = ctx.createLinearGradient(0, DANGER_Y - 46, 0, DANGER_Y + 8);
      g.addColorStop(0, 'rgba(200,80,55,0)');
      g.addColorStop(1, 'rgba(200,80,55,' + 0.2 * t + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, DANGER_Y - 46, W, 54);
    }
  }

  function drawBall(b) {
    const L = LEVELS[b.level];
    const r = b.r;

    // 球体
    ctx.save();
    if (b.level >= 6) {
      ctx.shadowColor = L.glow;
      ctx.shadowBlur = 8 + (b.level - 6) * 2.4;
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

    // 体积与高光
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.clip();

    const lg = ctx.createLinearGradient(b.x - r, b.y - r, b.x + r * 0.6, b.y + r * 0.85);
    lg.addColorStop(0, 'rgba(255,255,255,.16)');
    lg.addColorStop(0.45, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.fillStyle = lg;
    ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);

    const hx = b.x - r * 0.34;
    const hy = b.y - r * 0.42;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.52);
    hg.addColorStop(0, 'rgba(255,255,255,.4)');
    hg.addColorStop(0.55, 'rgba(255,255,255,.07)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    // 高阶加一道暗金细环，像器物上的纹
    if (b.level >= 6) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.09)';
      ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.stroke();
    }
    ctx.restore();

    // 边缘：内亮外暗
    ctx.beginPath();
    ctx.arc(b.x, b.y, r - 0.75, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(b.x, b.y, r - 2, Math.PI * 1.08, Math.PI * 1.92);
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.stroke();

    // 字符
    if (r > 9) {
      const size = r * (L.glyph.length > 1 ? 0.6 : 0.82);
      ctx.font = '600 ' + size.toFixed(1) + 'px ' + GLYPH_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = L.fg;
      ctx.globalAlpha = 0.95;
      ctx.shadowColor = 'rgba(255,255,255,.28)';
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
      ctx.font = '600 ' + p.size + 'px ' + GLYPH_FONT;
      ctx.fillStyle = p.color;
      ctx.shadowColor = 'rgba(0,0,0,.6)';
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
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(217,178,106,' + (ready ? 0.26 : 0.1) + ')';
    ctx.beginPath();
    ctx.moveTo(x, DROP_Y + r + 8);
    ctx.lineTo(x, FLOOR_Y - 2);
    ctx.stroke();
    ctx.restore();

    ctx.globalAlpha = ready ? 1 : 0.32;
    drawBall({ x: x, y: DROP_Y + Math.sin(state.time * 3.2) * 1.6, r: r, level: lv });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    const s = state.shake;
    if (s > 0.3) {
      ctx.translate(rand(-s, s) * 0.35, rand(-s, s) * 0.35);
    }

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
    if (e.key === 'ArrowLeft') {
      state.aimX -= 16;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      state.aimX += 16;
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (state.phase === 'playing') {
        drop();
        e.preventDefault();
      }
    } else if (e.key.toLowerCase() === 'r') {
      startGame();
    }
  });

  el.ovBtn.addEventListener('click', startGame);
  el.restartBtn.addEventListener('click', startGame);

  el.soundBtn.addEventListener('click', function () {
    const on = !SH.Audio.isEnabled();
    SH.Audio.setEnabled(on);
    el.soundBtn.textContent = '音效 · ' + (on ? '开' : '关');
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
    renderCodex();
    world = createWorld();
    state.next = SH.pickSpawn();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    updateHud();
    draw();

    showOverlay({
      eyebrow: '混沌初开',
      title: '合成天下',
      desc: '同物相触，化为更高之物。<br>从一粒微尘起，看看你能造到哪一步。',
      result: '',
      btn: '开始造物',
    });

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
      startGame: startGame,
      drop: drop,
      addBall: function (x, y, level) { return world.add(x, y, level); },
    };
  }
})();
