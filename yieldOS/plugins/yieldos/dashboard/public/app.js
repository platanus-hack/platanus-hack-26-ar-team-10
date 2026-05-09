// yieldOS pentest dashboard — frontend logic.
//
// Listens to /events (SSE), maintains the in-memory battle state, redraws
// the two charts (cumulative iteration line + history list), animates the
// tug-of-war rope, and triggers the matching chiptune effect.

(function () {
  // ── state ─────────────────────────────────────────────────────────────
  const state = {
    rounds: [],            // { round, strategy, type, ts, ...}
    findings: 0,
    fixes: 0,
    streak: 0,
    convergeTarget: 5,
    tugBalance: 0,         // -100 (full red) … +100 (full blue)
    lastRound: 0,
    lastStrategy: null,
    iterPoints: [],        // { round, findings, fixes }
    soundOn: true,
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
  const canvas = $('chart-iter');

  function setConn(state, label) {
    connPill.textContent = label;
    connPill.className = 'pill ' + (state === 'ok' ? 'pill-ok' : state === 'fail' ? 'pill-fail' : 'pill-warn');
  }

  // ── tug of war ────────────────────────────────────────────────────────
  function setTug(balance) {
    state.tugBalance = Math.max(-100, Math.min(100, balance));
    // Map -100..+100 to 0%..100% along the track.
    const pct = 50 + state.tugBalance / 2;
    tugRope.style.left = pct + '%';
  }

  function pushTug(deltaForBlue) {
    // Positive = blue gains; negative = red gains.
    setTug(state.tugBalance + deltaForBlue);
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
    while (historyEl.children.length > 60) historyEl.removeChild(historyEl.lastChild);
  }

  // ── confetti for celebrations ─────────────────────────────────────────
  function confetti(count = 28) {
    const symbols = ['🎉', '✨', '🛡', '⭐', '🏆'];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('span');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.top = '70vh';
      c.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      c.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 1800);
    }
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

  // ── chart (cumulative findings vs fixes line plot) ────────────────────
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
    const pad = { l: 36, r: 14, t: 16, b: 26 };
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
    // x labels (every Nth round)
    const step = Math.ceil(maxRound / 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let r = 1; r <= maxRound; r += step) {
      const x = pad.l + (w * (r - 1)) / Math.max(1, maxRound - 1);
      ctx.fillText(r.toString(), x, pad.t + h + 4);
    }

    function projX(r) { return pad.l + (w * (r - 1)) / Math.max(1, maxRound - 1); }
    function projY(v) { return pad.t + h - (h * v) / maxY; }

    function drawSeries(getter, color, glow) {
      if (!points.length) return;
      ctx.shadowColor = glow; ctx.shadowBlur = 14;
      ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
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
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      });
    }

    drawSeries((p) => p.findings, '#e0463a', 'rgba(224,70,58,0.45)');
    drawSeries((p) => p.fixes, '#3da4ff', 'rgba(61,164,255,0.45)');

    // legend
    ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e0463a'; ctx.fillRect(pad.l, pad.t - 10, 10, 10);
    ctx.fillStyle = '#d6def0'; ctx.fillText(' findings (red team)', pad.l + 12, pad.t - 5);
    ctx.fillStyle = '#3da4ff'; ctx.fillRect(pad.l + 170, pad.t - 10, 10, 10);
    ctx.fillStyle = '#d6def0'; ctx.fillText(' fixes (blue team)', pad.l + 182, pad.t - 5);
  }

  // ── apply event ───────────────────────────────────────────────────────
  function recordIterPoint(round) {
    // Make sure we have a point for every round (sparse jsonl is fine).
    if (!state.iterPoints.length || state.iterPoints[state.iterPoints.length - 1].round !== round) {
      state.iterPoints.push({ round, findings: state.findings, fixes: state.fixes });
    } else {
      const p = state.iterPoints[state.iterPoints.length - 1];
      p.findings = state.findings; p.fixes = state.fixes;
    }
  }

  function handleEvent(ev) {
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
        recordIterPoint(ev.round);
        pushTug(-22);
        document.body.classList.remove('shake-red');
        // Force reflow so the animation re-fires on consecutive attacks.
        // eslint-disable-next-line no-unused-expressions
        document.body.offsetHeight;
        document.body.classList.add('shake-red');
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
        if (state.soundOn && window.YieldosSounds) window.YieldosSounds.attack();
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
        pushHistoryItem({
          kind: 'blue',
          title: `🛡 R${ev.round} · blue team activado`,
          meta: 'target: ' + (ev.finding_title || ''),
        });
        if (state.soundOn && window.YieldosSounds) window.YieldosSounds.activate();
        break;
      }
      case 'blue_defended': {
        state.fixes++;
        recordIterPoint(ev.round);
        pushTug(34);
        flashOverlay({
          emoji: '🎉',
          title: '¡DEFENDIDO!',
          sub: truncate(ev.fix_summary, 220),
          tone: 'green',
          durationMs: 2200,
        });
        pushHistoryItem({
          kind: 'defended',
          title: `✅ R${ev.round} · DEFENDIDO`,
          meta: truncate(ev.fix_summary, 200),
        });
        confetti();
        if (state.soundOn && window.YieldosSounds) window.YieldosSounds.defended();
        break;
      }
      case 'blue_failed': {
        flashOverlay({ emoji: '⚠️', title: 'PATCH FAILED', sub: truncate(ev.reason, 200), tone: 'yellow' });
        pushHistoryItem({ kind: 'failed', title: `⚠ R${ev.round} · patch failed`, meta: truncate(ev.reason, 180) });
        if (state.soundOn && window.YieldosSounds) window.YieldosSounds.failed();
        break;
      }
      case 'round_clean': {
        state.streak = ev.streak || (state.streak + 1);
        state.convergeTarget = ev.target || state.convergeTarget;
        recordIterPoint(ev.round);
        pushTug(8);
        pushHistoryItem({
          kind: 'clean',
          title: `○ R${ev.round} · clean (streak ${ev.streak}/${ev.target})`,
          meta: ev.strategy_id || '',
        });
        if (state.soundOn && window.YieldosSounds) window.YieldosSounds.clean();
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
        for (let i = 0; i < 3; i++) setTimeout(() => confetti(50), i * 400);
        if (state.soundOn && window.YieldosSounds) window.YieldosSounds.converged();
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
        for (const ev of past) {
          // Re-apply with sound disabled so the page does not bleat on load.
          const original = state.soundOn; state.soundOn = false;
          handleEvent(ev);
          state.soundOn = original;
        }
      } catch (_) {}
    });
    ['round_start', 'red_scanning', 'red_attack', 'blue_activated',
     'blue_defended', 'blue_failed', 'round_clean', 'converged',
     'budget_exhausted'].forEach((t) => {
      es.addEventListener(t, (e) => {
        try { handleEvent(JSON.parse(e.data)); } catch (_) {}
      });
    });
    es.onerror = () => {
      setConn('fail', 'reconnecting…');
      // EventSource will auto-reconnect; we just update the pill.
    };
    es.onopen = () => setConn('ok', 'live');
  }

  // ── sound toggle ──────────────────────────────────────────────────────
  soundBtn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    if (window.YieldosSounds) window.YieldosSounds.setEnabled(state.soundOn);
    soundBtn.textContent = state.soundOn ? '🔊 ON' : '🔇 OFF';
  });

  // ── boot ──────────────────────────────────────────────────────────────
  refreshTotals();
  drawChart();
  setTug(0);
  connect();
  window.addEventListener('resize', drawChart);
})();
