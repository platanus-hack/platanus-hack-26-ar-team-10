// Chiptune-style sound effects for the yieldOS pentest dashboard.
//
// We synthesize everything with WebAudio (no audio files = zero copyright
// concerns, instant load, evokes the Age-of-Empires style of triumphant
// brass / clangs without infringing). Each effect is a tiny composition
// of oscillators + envelopes triggered on demand.
//
// The sound system stays disabled until the user clicks anywhere
// (browser autoplay policy), then enables itself silently.

(function () {
  let ctx = null;
  let enabled = true;
  let unlocked = false;

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
    } catch (_) { return null; }
    return ctx;
  }

  // Browsers require a user gesture to start audio. Wire any click/keydown
  // to resume the context once.
  function unlock() {
    if (unlocked) return;
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    unlocked = true;
  }
  window.addEventListener('click', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });

  function envelope(node, gain, attack, hold, release, peak = 0.4) {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + attack);
    gain.gain.setValueAtTime(peak, now + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release);
    node.start(now);
    node.stop(now + attack + hold + release + 0.05);
  }

  function tone({ freq, type = 'square', attack = 0.01, hold = 0.05, release = 0.15, peak = 0.25, detune = 0, dest = null }) {
    if (!ensureCtx() || !enabled) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(dest || ctx.destination);
    envelope(osc, gain, attack, hold, release, peak);
  }

  function noiseBurst({ duration = 0.18, peak = 0.3, filterFreq = 1500, filterType = 'lowpass' }) {
    if (!ensureCtx() || !enabled) return;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  }

  // ── public effects ──────────────────────────────────────────────────

  // Red team attacks: low descending growl + clang of swords
  function playAttack() {
    if (!ensureCtx() || !enabled) return;
    // Descending square-wave growl
    tone({ freq: 220, type: 'sawtooth', attack: 0.005, hold: 0.06, release: 0.12, peak: 0.18 });
    setTimeout(() => tone({ freq: 165, type: 'sawtooth', attack: 0.005, hold: 0.06, release: 0.18, peak: 0.16 }), 60);
    setTimeout(() => tone({ freq: 110, type: 'sawtooth', attack: 0.005, hold: 0.05, release: 0.25, peak: 0.14 }), 130);
    // Sword clang
    setTimeout(() => noiseBurst({ duration: 0.12, peak: 0.28, filterFreq: 3500, filterType: 'highpass' }), 180);
    setTimeout(() => tone({ freq: 1200, type: 'square', attack: 0.001, hold: 0.02, release: 0.1, peak: 0.18 }), 195);
  }

  // Blue team activated: ascending chime, alert tone
  function playActivate() {
    if (!ensureCtx() || !enabled) return;
    [392, 523, 659].forEach((f, i) => {
      setTimeout(() => tone({ freq: f, type: 'triangle', attack: 0.004, hold: 0.06, release: 0.18, peak: 0.22 }), i * 70);
    });
  }

  // Blue team defended: triumphant short fanfare (C-E-G-C ascending, brass-ish)
  function playDefended() {
    if (!ensureCtx() || !enabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      setTimeout(() => {
        tone({ freq: f, type: 'square', attack: 0.005, hold: 0.08, release: 0.18, peak: 0.22 });
        tone({ freq: f * 0.5, type: 'triangle', attack: 0.005, hold: 0.08, release: 0.2, peak: 0.16 });
      }, i * 90);
    });
    setTimeout(() => {
      tone({ freq: 1046.5, type: 'square', attack: 0.005, hold: 0.16, release: 0.32, peak: 0.26 });
      tone({ freq: 1318.5, type: 'triangle', attack: 0.005, hold: 0.16, release: 0.32, peak: 0.18 });
    }, 360);
  }

  // Patch failed: descending dissonant pair
  function playFailed() {
    if (!ensureCtx() || !enabled) return;
    tone({ freq: 261, type: 'sawtooth', attack: 0.005, hold: 0.1, release: 0.3, peak: 0.18 });
    setTimeout(() => tone({ freq: 233, type: 'sawtooth', attack: 0.005, hold: 0.12, release: 0.4, peak: 0.16 }), 120);
  }

  // Red round clean: tiny tick (red team came up empty)
  function playClean() {
    if (!ensureCtx() || !enabled) return;
    tone({ freq: 880, type: 'square', attack: 0.001, hold: 0.02, release: 0.06, peak: 0.08 });
  }

  // Final convergence: full triumphant fanfare (longer)
  function playConverged() {
    if (!ensureCtx() || !enabled) return;
    const melody = [
      { f: 523, dur: 120 }, { f: 659, dur: 120 }, { f: 783, dur: 120 }, { f: 1046, dur: 240 },
      { f: 783, dur: 120 }, { f: 1046, dur: 360 },
    ];
    let t = 0;
    for (const n of melody) {
      const start = t;
      setTimeout(() => {
        tone({ freq: n.f, type: 'square', attack: 0.005, hold: n.dur / 1000 - 0.04, release: 0.12, peak: 0.24 });
        tone({ freq: n.f * 0.5, type: 'triangle', attack: 0.005, hold: n.dur / 1000 - 0.04, release: 0.14, peak: 0.16 });
      }, start);
      t += n.dur;
    }
  }

  function setEnabled(v) { enabled = !!v; }
  function isEnabled() { return enabled; }

  window.YieldosSounds = {
    attack: playAttack,
    activate: playActivate,
    defended: playDefended,
    failed: playFailed,
    clean: playClean,
    converged: playConverged,
    setEnabled,
    isEnabled,
    unlock: unlock,
  };
})();
