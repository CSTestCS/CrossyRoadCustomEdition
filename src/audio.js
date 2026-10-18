// Tiny WebAudio synth for sound effects (no audio files needed).
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'square', vol = 0.08, slide = 0, delay = 0 } = {}) {
  const a = ac();
  if (!a || muted) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, freq = 800, delay = 0 } = {}) {
  const a = ac();
  if (!a || muted) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  unlock: () => ac(),
  hop: () => tone(520, 0.08, { type: 'triangle', vol: 0.06, slide: 300 }),
  squash: () => { tone(160, 0.25, { vol: 0.12, slide: -100 }); noise(0.2, { vol: 0.15, freq: 1200 }); },
  splash: () => noise(0.5, { vol: 0.25, freq: 2200 }),
  eagle: () => { tone(900, 0.35, { type: 'sawtooth', vol: 0.06, slide: -500 }); },
  zap: () => { noise(0.25, { vol: 0.3, freq: 6000 }); tone(80, 0.6, { type: 'sawtooth', vol: 0.1, slide: -40 }); },
  thunder: (far) => noise(far ? 1.8 : 1.2, { vol: far ? 0.12 : 0.35, freq: far ? 300 : 600, delay: far ? 0.3 : 0 }),
  honk: (loud) => { tone(330, 0.18, { type: 'square', vol: loud ? 0.05 : 0.025 }); tone(415, 0.18, { type: 'square', vol: loud ? 0.04 : 0.02 }); },
  ding: () => { tone(1250, 0.15, { type: 'sine', vol: 0.06 }); tone(1250, 0.15, { type: 'sine', vol: 0.06, delay: 0.3 }); },
  record: () => [660, 880, 1100].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.07, delay: i * 0.1 })),
  weather: () => tone(440, 0.3, { type: 'sine', vol: 0.05, slide: 220 }),
  setMuted: (m) => { muted = m; },
  get muted() { return muted; },
};
