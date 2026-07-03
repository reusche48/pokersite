// Synthesized sound effects via Web Audio API — no audio files needed.
let ctx = null;
let masterGain = null;
let muted = false;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Resume on first user gesture (autoplay policy)
if (typeof window !== 'undefined') {
  const resume = () => { try { ensureCtx(); } catch {} window.removeEventListener('pointerdown', resume); };
  window.addEventListener('pointerdown', resume);
}

export function setMuted(m) {
  muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
}

export function isMuted() { return muted; }

// ── primitives ──────────────────────────────────────

function noiseBuffer(duration) {
  const c = ensureCtx();
  const buf = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Short filtered-noise swoosh (card deal)
function swoosh(at = 0) {
  const c = ensureCtx();
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(0.15);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.5;
  bp.frequency.setValueAtTime(1200, t);
  bp.frequency.exponentialRampToValueAtTime(4000, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  src.connect(bp).connect(g).connect(masterGain);
  src.start(t);
  src.stop(t + 0.16);
}

// Single chip clink (triangle blip + click)
function clink(at = 0, freqBase = 2800) {
  const c = ensureCtx();
  const t = c.currentTime + at;
  const freq = freqBase + (Math.random() - 0.5) * 600;

  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.05);

  // tiny noise transient
  const click = c.createBufferSource();
  click.buffer = noiseBuffer(0.015);
  const hg = c.createGain();
  hg.gain.setValueAtTime(0.08, t);
  hg.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  click.connect(hp).connect(hg).connect(masterGain);
  click.start(t);
}

// Triangle note for fanfare
function note(freq, at, dur = 0.18, vol = 0.15) {
  const c = ensureCtx();
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// ── public effects ──────────────────────────────────

const EFFECTS = {
  card_deal() { swoosh(); },

  chip_bet() {
    clink(0);
    clink(0.025);
    if (Math.random() > 0.5) clink(0.05);
  },

  chip_stack() {
    for (let i = 0; i < 5; i++) clink(i * 0.035, 2600 + i * 100);
  },

  chip_win() {
    for (let i = 0; i < 9; i++) clink(i * 0.045, 3200 - i * 150);
    // soft noise swell underneath
    const c = ensureCtx();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.5);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(lp).connect(g).connect(masterGain);
    src.start(t);
  },

  victory_fanfare() {
    // C5 E5 G5 arpeggio + final chord
    note(523.25, 0);
    note(659.25, 0.12);
    note(783.99, 0.24);
    note(523.25, 0.4, 0.6, 0.1);
    note(659.25, 0.4, 0.6, 0.1);
    note(783.99, 0.4, 0.6, 0.1);
    note(1046.5, 0.4, 0.6, 0.12);
  },

  // Tense heartbeat for all-in run-outs: thump-thump … thump-thump
  suspense() {
    const c = ensureCtx();
    function thump(at) {
      const t = c.currentTime + at;
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(58, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
      const g = c.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      osc.connect(g).connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.2);
    }
    // 8 heartbeat pairs ≈ 7 seconds of tension
    for (let i = 0; i < 8; i++) {
      thump(i * 0.85);
      thump(i * 0.85 + 0.22);
    }
  },

  button_click() {
    const c = ensureCtx();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.012);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.01);
    src.connect(bp).connect(g).connect(masterGain);
    src.start(t);
  },

  casino_ambient() { /* no-op: synthesized ambience sounds bad */ },
};

export function playSfx(name) {
  if (muted) return;
  try {
    ensureCtx();
    EFFECTS[name]?.();
  } catch (e) {
    // AudioContext not allowed yet — ignore silently
  }
}
