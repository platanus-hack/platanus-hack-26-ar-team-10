// yieldOS pentest dashboard — frontend logic (animated edition).
//
// New in this revision:
//   • Audio veil: explicit click-to-enable so WebAudio actually unlocks,
//     plus a test-sound button.
//   • Castles + HP bars: red/blue HP shifts each event, with hit-shake
//     and HP-bar flash.
//   • Scoreboard with score-bump animation.
//   • Continuous particle drift in <canvas id="particles"> + bursts on
//     events (red sparks on attack, gold sparks on defended).
//   • Smooth area-fill chart with glowing dots.
//   • History list with slide-in animation per item.
//   • Full-screen colored flash on every major event.

(function () {
  // ── state ─────────────────────────────────────────────────────────────
  const state = {
    findings: 0,
    fixes: 0,
    streak: 0,
    convergeTarget: 5,
    rope: 0,                // -100 (red wins rope) … +100 (blue wins rope)
    redHp: 100,             // shrinks when blue defends
    blueHp: 100,            // shrinks when red attacks
    lastRound: 0,
    lastStrategy: null,
    iterPoints: [],         // { round, findings, fixes }
    soundOn: true,
    audioUnlocked: false,
    consecutiveDefenses: 0, // for combo
  };

  // ── DOM helpers ───────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const tFindings = $('t-findings');
  const tFixes = $('t-fixes');
  const tRounds = $('t-rounds');
  const tStreak = $('t-streak');
  const roundPill = $('round-pill');
  const strategyPill = $('strategy-pill');
  const connPill = $('connection-pill');
  const tugRope = $('tug-rope');
  const overlay = $('overlay');
  const overlayCard = $('overlay-card');
  const overlayEmoji = $('overlay-emoji');
  const overlayTitle = $('overlay-title');
  const overlaySub = $('overlay-sub');
  const historyEl = $('history');
  const soundBtn = $('sound-toggle');
  const soundTestBtn = $('sound-test');
  const canvas = $('chart-iter');
  const audioVeil = $('audio-veil');
  const audioVeilBtn = $('audio-veil-btn');
  const screenFlash = $('screen-flash');
  const scoreRedEl = $('score-red');
  const scoreBlueEl = $('score-blue');
  const hpRedEl = $('hp-red');
  const hpBlueEl = $('hp-blue');
  const castleRed = $('castle-red');
  const castleBlue = $('castle-blue');
  const clashEl = $('clash');
  const comboEl = $('combo');
  const particleCanvas = $('particles');

  function setConn(state, label) {
    connPill.textContent = label;
    connPill.className = 'pill ' + (state === 'ok' ? 'pill-ok' : state === 'fail' ? 'pill-fail' : 'pill-warn');
  }

  // ── Audio veil + unlock ───────────────────────────────────────────────
  function unlockAudio() {
    if (state.audioUnlocked) return;
    state.audioUnlocked = true;
    // Force-hide via inline style too (belt + suspenders if a stale CSS or
    // cached classlist would otherwise leave the veil sitting on top).
    audioVeil.classList.add('hidden');
    audioVeil.style.opacity = '0';
    audioVeil.style.pointerEvents = 'none';
    setTimeout(() => { audioVeil.style.display = 'none'; }, 420);
    if (window.YieldosSounds) {
      try { window.YieldosSounds.unlock(); } catch (_) {}
      setTimeout(() => { try { window.YieldosSounds.activate(); } catch (_) {} }, 120);
    }
    try { console.log('[yieldOS] audio unlocked'); } catch (_) {}
  }
  // Three independent paths so the veil cannot get stuck:
  //   - the dedicated button
  //   - clicking anywhere on the veil
  //   - any click anywhere in the document (capture phase, runs first)
  audioVeilBtn.addEventListener('click', unlockAudio);
  audioVeil.addEventListener('click', unlockAudio);
  document.addEventListener('click', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, { once: false, capture: true });
  document.addEventListener('touchstart', unlockAudio, { once: false, capture: true });

  // ── tug of war ────────────────────────────────────────────────────────
  function setRope(balance) {
    state.rope = Math.max(-100, Math.min(100, balance));
    const pct = 50 + state.rope / 2;
    tugRope.style.left = pct + '%';
  }
  function pushRope(delta) { setRope(state.rope + delta); }

  // ── HP system ─────────────────────────────────────────────────────────
  function setHp(side, value) {
    const v = Math.max(0, Math.min(100, value));
    if (side === 'red') {
      state.redHp = v; hpRedEl.style.width = v + '%';
    } else {
      state.blueHp = v; hpBlueEl.style.width = v + '%';
    }
  }
  function damage(side, amount) {
    setHp(side, (side === 'red' ? state.redHp : state.blueHp) - amount);
    const castle = side === 'red' ? castleRed : castleBlue;
    const hpBar = side === 'red' ? hpRedEl.parentElement : hpBlueEl.parentElement;
    castle.classList.remove('hit-red', 'hit-blue');
    void castle.offsetHeight;
    castle.classList.add(side === 'red' ? 'hit-red' : 'hit-blue');
    hpBar.classList.remove('flash');
    void hpBar.offsetHeight;
    hpBar.classList.add('flash');
  }
  function heal(side, amount) {
    setHp(side, (side === 'red' ? state.redHp : state.blueHp) + amount);
  }

  // ── Score bump ────────────────────────────────────────────────────────
  function bumpScore(el, value) {
    el.textContent = value;
    el.classList.remove('bump');
    void el.offsetHeight;
    el.classList.add('bump');
  }

  // ── Combo indicator ───────────────────────────────────────────────────
  let comboTimer = null;
  function flashCombo(text) {
    comboEl.textContent = text;
    comboEl.classList.add('show');
    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => comboEl.classList.remove('show'), 2200);
  }

  // ── Clash sparks ──────────────────────────────────────────────────────
  function fireClash() {
    clashEl.classList.remove('fire');
    void clashEl.offsetHeight;
    clashEl.classList.add('fire');
  }

  // ── Screen flash ──────────────────────────────────────────────────────
  let flashTimer = null;
  function flashScreen(tone) {
    screenFlash.className = 'screen-flash';
    void screenFlash.offsetHeight;
    screenFlash.classList.add('flash-' + tone);
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { screenFlash.className = 'screen-flash'; }, 180);
  }

  // ── overlay flash ─────────────────────────────────────────────────────
  let overlayTimeout = null;
  function flashOverlay({ emoji, title, sub, tone, durationMs = 1700 }) {
    overlayEmoji.textContent = emoji;
    overlayTitle.textContent = title;
    overlaySub.textContent = sub || '';
    overlayCard.classList.remove('tone-red', 'tone-blue', 'tone-green', 'tone-yellow');
    overlayCard.classList.add('tone-' + tone);
    overlay.classList.add('show');
    if (overlayTimeout) clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => overlay.classList.remove('show'), durationMs);
  }

  // ── history list ──────────────────────────────────────────────────────
  function pushHistoryItem({ kind, title, meta }) {
    const li = document.createElement('li');
    li.className = 'h-' + kind;
    const t = document.createElement('div'); t.className = 'h-title'; t.textContent = title;
    const m = document.createElement('div'); m.className = 'h-meta'; m.textContent = meta || '';
    li.appendChild(t); li.appendChild(m);
    historyEl.insertBefore(li, historyEl.firstChild);
    while (historyEl.children.length > 80) historyEl.removeChild(historyEl.lastChild);
  }

  // ── confetti ──────────────────────────────────────────────────────────
  function confetti(count = 36) {
    const symbols = ['🎉', '✨', '🛡', '⭐', '🏆', '⚔'];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('span');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.top = '70vh';
      c.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      c.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 1900);
    }
  }

  // ── Particle layer (continuous drift + event bursts) ─────────────────
  const particles = [];
  function resizeParticles() {
    const dpr = window.devicePixelRatio || 1;
    particleCanvas.width = window.innerWidth * dpr;
    particleCanvas.height = window.innerHeight * dpr;
    particleCanvas.style.width = window.innerWidth + 'px';
    particleCanvas.style.height = window.innerHeight + 'px';
    const ctx = particleCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeParticles();
  window.addEventListener('resize', resizeParticles);

  function spawnParticleBurst({ x, y, color, count = 18, speed = 5, gravity = 0.04, life = 60 }) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const v = speed * (0.6 + Math.random() * 0.7);
      particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 1,
        gravity,
        life,
        maxLife: life,
        color,
        size: 2 + Math.random() * 2,
      });
    }
  }
  function spawnAmbientParticle() {
    if (particles.length > 200) return;
    particles.push({
      x: Math.random() * window.innerWidth,
      y: window.innerHeight + 20,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.3 - Math.random() * 0.4,
      gravity: -0.005,
      life: 320 + Math.random() * 200,
      maxLife: 520,
      color: Math.random() > 0.5 ? 'rgba(255, 155, 61, 0.55)' : 'rgba(76, 177, 255, 0.45)',
      size: 1 + Math.random() * 1.6,
      ambient: true,
    });
  }
  let ambientTick = 0;
  function tickParticles() {
    const ctx = particleCanvas.getContext('2d');
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ambientTick++;
    if (ambientTick % 6 === 0) spawnAmbientParticle();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
      if (p.life <= 0 || p.y > window.innerHeight + 30 || p.y < -30) {
        particles.splice(i, 1); continue;
      }
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.fillStyle = p.color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tickParticles);
  }
  requestAnimationFrame(tickParticles);

  function castleCenter(side) {
    const el = side === 'red' ? castleRed : castleBlue;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function battleCenter() {
    const r = $('battle-zone').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ── totals ────────────────────────────────────────────────────────────
  function refreshTotals() {
    tFindings.textContent = state.findings;
    tFixes.textContent = state.fixes;
    tRounds.textContent = state.lastRound;
    tStreak.textContent = state.streak + '/' + state.convergeTarget;
    if (state.lastRound) roundPill.textContent = 'round ' + state.lastRound;
    if (state.lastStrategy) strategyPill.textContent = state.lastStrategy;
  }

  // ── chart (cumulative findings vs fixes line plot, with area fill) ────
  function drawChart() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (canvas.width !== cssW * dpr) {
      canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const points = state.iterPoints;
    const pad = { l: 36, r: 14, t: 24, b: 26 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const maxRound = Math.max(1, points.length ? points[points.length - 1].round : 1);
    const maxY = Math.max(2, ...points.map(p => Math.max(p.findings, p.fixes)));

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
      ctx.fillStyle = 'rgba(214,222,240,0.5)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round((maxY * (4 - i)) / 4).toString(), pad.l - 6, y);
    }
    const step = Math.max(1, Math.ceil(maxRound / 8));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let r = 1; r <= maxRound; r += step) {
      const x = pad.l + (w * (r - 1)) / Math.max(1, maxRound - 1);
      ctx.fillText(r.toString(), x, pad.t + h + 4);
    }

    function projX(r) { return pad.l + (w * (r - 1)) / Math.max(1, maxRound - 1); }
    function projY(v) { return pad.t + h - (h * v) / maxY; }

    function drawSeries(getter, color, glow, fillTop) {
      if (!points.length) return;
      // area fill
      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
      grad.addColorStop(0, fillTop);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = projX(p.round); const y = projY(getter(p));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      const lastX = projX(points[points.length - 1].round);
      const firstX = projX(points[0].round);
      ctx.lineTo(lastX, pad.t + h);
      ctx.lineTo(firstX, pad.t + h);
      ctx.closePath();
      ctx.fill();
      // line
      ctx.shadowColor = glow; ctx.shadowBlur = 16;
      ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = projX(p.round); const y = projY(getter(p));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
      // dots
      ctx.fillStyle = color;
      points.forEach((p) => {
        const x = projX(p.round); const y = projY(getter(p));
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      });
    }

    drawSeries((p) => p.findings, '#ff4f3a', 'rgba(255,79,58,0.55)', 'rgba(255,79,58,0.20)');
    drawSeries((p) => p.fixes, '#4cb1ff', 'rgba(76,177,255,0.55)', 'rgba(76,177,255,0.20)');

    // legend
    ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4f3a'; ctx.fillRect(pad.l, pad.t - 14, 10, 10);
    ctx.fillStyle = '#e9eef9'; ctx.fillText(' findings (red team)', pad.l + 12, pad.t - 9);
    ctx.fillStyle = '#4cb1ff'; ctx.fillRect(pad.l + 170, pad.t - 14, 10, 10);
    ctx.fillStyle = '#e9eef9'; ctx.fillText(' fixes (blue team)', pad.l + 182, pad.t - 9);
  }

  // ── apply event ───────────────────────────────────────────────────────
  function recordIterPoint(round) {
    if (!state.iterPoints.length || state.iterPoints[state.iterPoints.length - 1].round !== round) {
      state.iterPoints.push({ round, findings: state.findings, fixes: state.fixes });
    } else {
      const p = state.iterPoints[state.iterPoints.length - 1];
      p.findings = state.findings; p.fixes = state.fixes;
    }
  }

  function handleEvent(ev, replay = false) {
    if (!ev || !ev.type) return;
    if (ev.round) state.lastRound = ev.round;
    if (ev.strategy_id) state.lastStrategy = ev.strategy_id;

    switch (ev.type) {
      case 'round_start': {
        recordIterPoint(ev.round);
        break;
      }
      case 'red_scanning': break;
      case 'red_attack': {
        state.findings++;
        state.streak = 0;
        state.consecutiveDefenses = 0;
        recordIterPoint(ev.round);
        // damage to BLUE castle when red scores
        damage('blue', 14);
        pushRope(-22);
        bumpScore(scoreRedEl, state.findings);
        fireClash();
        flashScreen('red');
        document.body.classList.remove('shake-red');
        void document.body.offsetHeight;
        document.body.classList.add('shake-red');
        if (!replay) {
          const c = battleCenter();
          spawnParticleBurst({ x: c.x, y: c.y, color: 'rgba(255, 79, 58, 1)', count: 22, speed: 6 });
        }
        flashOverlay({
          emoji: '⚔',
          title: 'RED TEAM ATTACK',
          sub: `${(ev.severity || '').toUpperCase()} · ${ev.title || 'unknown'}`,
          tone: 'red',
        });
        pushHistoryItem({
          kind: 'red',
          title: `🔴 R${ev.round} · ${ev.title || '(untitled)'}`,
          meta: `[${(ev.severity || '?').toUpperCase()}] file: ${ev.file || 'n/a'}  ·  ${truncate(ev.attack_vector, 140)}`,
        });
        if (state.soundOn && !replay && window.YieldosSounds) window.YieldosSounds.attack();
        break;
      }
      case 'blue_activated': {
        flashOverlay({
          emoji: '🛡',
          title: 'BLUE TEAM ACTIVATED',
          sub: 'sintetizando patch contra: ' + (ev.finding_title || ''),
          tone: 'blue',
          durationMs: 1300,
        });
        flashScreen('blue');
        pushHistoryItem({
          kind: 'blue',
          title: `🛡 R${ev.round} · blue team activado`,
          meta: 'target: ' + (ev.finding_title || ''),
        });
        if (state.soundOn && !replay && window.YieldosSounds) window.YieldosSounds.activate();
        break;
      }
      case 'blue_defended': {
        state.fixes++;
        state.consecutiveDefenses++;
        recordIterPoint(ev.round);
        // damage to RED castle when blue defends
        damage('red', 18);
        heal('blue', 6);
        pushRope(34);
        bumpScore(scoreBlueEl, state.fixes);
        fireClash();
        flashScreen('green');
        if (state.consecutiveDefenses >= 2) flashCombo(`COMBO ×${state.consecutiveDefenses} · blue team encadena defensas`);
        flashOverlay({
          emoji: '🎉',
          title: '¡DEFENDIDO!',
          sub: truncate(ev.fix_summary, 220),
          tone: 'green',
          durationMs: 2400,
        });
        pushHistoryItem({
          kind: 'defended',
          title: `✅ R${ev.round} · DEFENDIDO`,
          meta: truncate(ev.fix_summary, 200),
        });
        if (!replay) {
          confetti();
          const c = battleCenter();
          spawnParticleBurst({ x: c.x, y: c.y, color: 'rgba(86, 211, 100, 1)', count: 28, speed: 7, gravity: 0.06 });
          spawnParticleBurst({ x: c.x, y: c.y, color: 'rgba(76, 177, 255, 1)', count: 18, speed: 5, gravity: 0.04 });
        }
        if (state.soundOn && !replay && window.YieldosSounds) window.YieldosSounds.defended();
        break;
      }
      case 'blue_failed': {
        flashOverlay({ emoji: '⚠️', title: 'PATCH FAILED', sub: truncate(ev.reason, 200), tone: 'yellow' });
        flashScreen('red');
        pushHistoryItem({ kind: 'failed', title: `⚠ R${ev.round} · patch failed`, meta: truncate(ev.reason, 180) });
        if (state.soundOn && !replay && window.YieldosSounds) window.YieldosSounds.failed();
        break;
      }
      case 'round_clean': {
        state.streak = ev.streak || (state.streak + 1);
        state.convergeTarget = ev.target || state.convergeTarget;
        recordIterPoint(ev.round);
        pushRope(8);
        heal('blue', 3); heal('red', 1);
        pushHistoryItem({
          kind: 'clean',
          title: `○ R${ev.round} · clean (streak ${ev.streak}/${ev.target})`,
          meta: ev.strategy_id || '',
        });
        if (state.soundOn && !replay && window.YieldosSounds) window.YieldosSounds.clean();
        break;
      }
      case 'converged': {
        flashOverlay({
          emoji: '🏁',
          title: '¡VICTORIA TOTAL!',
          sub: `${ev.rounds} rounds · ${ev.findings} findings · ${ev.fixes_applied} fixes — el blue team ganó la partida`,
          tone: 'green',
          durationMs: 4000,
        });
        flashScreen('green');
        flashCombo('🏆 PENTEST CONVERGED — el blue team ganó la batalla');
        if (!replay) {
          for (let i = 0; i < 4; i++) setTimeout(() => confetti(60), i * 400);
          const c = battleCenter();
          for (let i = 0; i < 6; i++) setTimeout(() => spawnParticleBurst({ x: c.x + (Math.random() - 0.5) * 200, y: c.y, color: 'rgba(245, 196, 81, 1)', count: 30, speed: 8 }), i * 200);
        }
        if (state.soundOn && !replay && window.YieldosSounds) window.YieldosSounds.converged();
        break;
      }
      case 'budget_exhausted': {
        flashOverlay({ emoji: '⏱', title: 'BUDGET EXHAUSTED', sub: `pausado tras ${ev.rounds} rounds`, tone: 'yellow' });
        break;
      }
      default: break;
    }

    refreshTotals();
    drawChart();
  }

  function truncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  // ── SSE wiring ────────────────────────────────────────────────────────
  function connect() {
    setConn('warn', 'connecting…');
    const es = new EventSource('/events');
    es.addEventListener('hello', () => setConn('ok', 'live'));
    es.addEventListener('history', (e) => {
      try {
        const past = JSON.parse(e.data);
        for (const ev of past) handleEvent(ev, true);
      } catch (_) {}
    });
    ['round_start', 'red_scanning', 'red_attack', 'blue_activated',
     'blue_defended', 'blue_failed', 'round_clean', 'converged',
     'budget_exhausted'].forEach((t) => {
      es.addEventListener(t, (e) => {
        try { handleEvent(JSON.parse(e.data), false); } catch (_) {}
      });
    });
    es.onerror = () => setConn('fail', 'reconnecting…');
    es.onopen = () => setConn('ok', 'live');
  }

  // ── sound toggle / test ───────────────────────────────────────────────
  soundBtn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    if (window.YieldosSounds) window.YieldosSounds.setEnabled(state.soundOn);
    soundBtn.textContent = state.soundOn ? '🔊 ON' : '🔇 OFF';
  });
  soundTestBtn.addEventListener('click', () => {
    unlockAudio();
    if (window.YieldosSounds) window.YieldosSounds.defended();
    flashCombo('🎺 audio test ok');
  });

  // ── boot ──────────────────────────────────────────────────────────────
  refreshTotals();
  drawChart();
  setRope(0);
  connect();
  window.addEventListener('resize', drawChart);
})();
