// Runs the audio worklet outside the browser and checks each engine:
// no NaNs, no clipping, a sensible loudness, and an envelope that decays.
// Usage: node tests/engine-test.mjs [--wav]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SR = 48000;
let registered = null;
globalThis.sampleRate = SR;
globalThis.currentTime = 0;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: (m) => { this.lastState = m; }, onmessage: null }; } };
globalThis.registerProcessor = (name, cls) => { if (name === 'leaf-processor') registered = cls; };
const src = fs.readFileSync(path.join(here, '../www/js/leaf-worklet.js'), 'utf8');
new Function(src)();

const ENGINES = ['bell', 'pluck', 'rustle', 'glass', 'wood', 'drone', 'grain', 'sample'];
const base = {
  freq: 220, vel: 1, level: 0.8, send: 0.3, pan: 0, character: 0.4, brightness: 0.7, body: 0.5,
  sampleKey: 'test', tone: 9000, drive: 0.1, impact: 0.4, crunch: 0.3, tail: 'sub', tailLevel: 0.5, sag: 0.5,
  soluble: 20, lignin: 20, leach: 15, kc: 1.5, kr: 0.15, fall: 1, lag: 2
};

// A test recording: a decaying chord with some noise, 2 s
const SAMPLE = new Float32Array(SR * 2);
for (let i = 0; i < SAMPLE.length; i++) { const t = i / SR; SAMPLE[i] = (Math.sin(2 * Math.PI * 261.63 * t) + 0.5 * Math.sin(2 * Math.PI * 392 * t)) * 0.5 * Math.exp(-t) + (Math.random() - 0.5) * 0.05; }

function render(params, seconds, globals = {}, extra = () => {}) {
  const p = new registered();
  p.onMessage({ type: 'sample', key: 'test', data: SAMPLE, rate: SR });
  p.onMessage({ type: 'globals', g: { spy: 1.5, wind: 0, groundBed: 0, crackle: 0, windNoise: 0, ...globals } });
  p.onMessage({ type: 'note', id: 1, when: 0.01, p: params });
  const blocks = Math.ceil(seconds * SR / 128);
  const L = new Float32Array(blocks * 128), R = new Float32Array(blocks * 128);
  globalThis.currentTime = 0;
  for (let b = 0; b < blocks; b++) {
    extra(p, b * 128 / SR);
    const o = [new Float32Array(128), new Float32Array(128)], s = [new Float32Array(128), new Float32Array(128)];
    p.process([], [o, s]);
    L.set(o[0], b * 128); R.set(o[1], b * 128);
    globalThis.currentTime += 128 / SR;
  }
  return { L, R, p };
}

function stats(buf) {
  let peak = 0, nan = 0;
  for (const x of buf) { if (!Number.isFinite(x)) nan++; else peak = Math.max(peak, Math.abs(x)); }
  const win = SR * 0.25, rms = [];
  for (let i = 0; i + win <= buf.length; i += win) {
    let s = 0; for (let j = 0; j < win; j++) s += buf[i + j] * buf[i + j];
    rms.push(Math.sqrt(s / win));
  }
  return { peak, nan, rms };
}

function writeWav(file, L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, b);
}

const wav = process.argv.includes('--wav');
const outDir = path.join(here, 'out');
if (wav) fs.mkdirSync(outDir, { recursive: true });
let failed = 0;
const fmt = (a) => a.map((x) => x.toFixed(3)).join(' ');

for (const engine of ENGINES) {
  for (const freq of [55, 220, 880]) {
    const { L, R } = render({ ...base, engine, freq }, 7);
    const s = stats(L);
    const avg = s.rms.slice(1, 8).reduce((a, b) => a + b, 0) / 7;
    const endRms = s.rms[s.rms.length - 1];
    const ok = s.nan === 0 && s.peak < 1.0 && avg > 0.004 && endRms < avg;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine.padEnd(6)} ${String(freq).padStart(4)}Hz peak ${s.peak.toFixed(3)} rms(0.25-2s) ${avg.toFixed(4)} end ${endRms.toFixed(4)}`);
    if (freq === 220) console.log('      rms curve: ' + fmt(s.rms.filter((_, i) => i % 2 === 0)));
    if (wav && freq === 220) writeWav(path.join(outDir, `${engine}.wav`), L, R);
  }
}

// All tails, all at once, rain and textures on
for (const tail of ['none', 'sub', 'earth', 'metal']) {
  const { L } = render({ ...base, engine: 'glass', tail, tailLevel: 1 }, 5);
  const s = stats(L);
  const ok = s.nan === 0 && s.peak < 1;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} tail ${tail.padEnd(6)} peak ${s.peak.toFixed(3)}`);
}

// A dense forest: many notes, wind, rain, textures, extreme settings
{
  const p = new registered();
  p.onMessage({ type: 'globals', g: { spy: 1, wind: 1.5, groundBed: 1, crackle: 1, windNoise: 1, priming: 1, maxVoices: 32, temp: 25 } });
  p.onMessage({ type: 'rain', amount: 1, dur: 4 });
  let id = 0;
  const L = new Float32Array(SR * 8);
  globalThis.currentTime = 0;
  const blocks = L.length / 128;
  let maxQueued = 0, maxVoices = 0;
  for (let b = 0; b < blocks; b++) {
    if (b % 40 === 0) {
      const engine = ENGINES[id % ENGINES.length];
      p.onMessage({ type: 'note', id: ++id, when: globalThis.currentTime + 0.05, p: { ...base, engine, freq: 55 * Math.pow(2, (id % 24) / 6), drive: id % 3 ? 1 : 0, brightness: 1, character: (id % 5) / 4, body: (id % 7) / 6 } });
    }
    const o = [new Float32Array(128), new Float32Array(128)], s = [new Float32Array(128), new Float32Array(128)];
    p.process([], [o, s]);
    L.set(o[0], b * 128);
    maxVoices = Math.max(maxVoices, p.voices.filter((v) => v.active).length);
    maxQueued = Math.max(maxQueued, p.queue.length);
    globalThis.currentTime += 128 / SR;
  }
  const s = stats(L);
  const ok = s.nan === 0 && maxVoices <= 32;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} dense forest: notes ${id}, peak ${s.peak.toFixed(2)} (limiter downstream), max voices ${maxVoices}, max queued ${maxQueued}`);
  if (wav) writeWav(path.join(outDir, 'dense.wav'), L, L);
}

// Speed: how many voices fit in real time on this machine
{
  const p = new registered();
  p.onMessage({ type: 'globals', g: { spy: 4, maxVoices: 48, wind: 1, groundBed: 1, crackle: 1, windNoise: 1 } });
  for (let i = 0; i < 48; i++) p.onMessage({ type: 'note', id: i, when: 0, p: { ...base, engine: ENGINES[i % 7], freq: 110 + i * 7, body: 1, character: 0.7 } });
  globalThis.currentTime = 0;
  const blocks = Math.round(SR * 2 / 128);
  const t0 = performance.now();
  for (let b = 0; b < blocks; b++) {
    const o = [new Float32Array(128), new Float32Array(128)], s = [new Float32Array(128), new Float32Array(128)];
    p.process([], [o, s]);
    globalThis.currentTime += 128 / SR;
  }
  const ms = performance.now() - t0;
  console.log(`info 48 voices: 2 s of audio rendered in ${ms.toFixed(0)} ms (${(2000 / ms).toFixed(1)}x real time)`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
