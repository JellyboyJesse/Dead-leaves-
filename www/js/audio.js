// Audio graph: the leaf worklet, a generated reverb whose tone is damped by the
// litter on the ground, and a limiter so dense passages never clip.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.ready = false;
    this.voiceState = new Map(); // id -> { E, att, L, C, R }
    this.mass = 0;
    this.rain = 0;
    this.lastStateAt = 0;
    this.onState = null;
    this.irTimer = 0;
    this.irSize = 0;
  }

  async start() {
    if (this.ready) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('This browser has no Web Audio.');
    this.ctx = new AC({ latencyHint: 'playback' });
    if (!this.ctx.audioWorklet) throw new Error('This browser has no AudioWorklet. Try a recent Chrome.');
    await this.ctx.audioWorklet.addModule(new URL('./leaf-worklet.js', import.meta.url));
    const ctx = this.ctx;
    this.node = new AudioWorkletNode(ctx, 'leaf-processor', {
      numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2]
    });
    this.dry = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.damp = ctx.createBiquadFilter();
    this.damp.type = 'lowpass'; this.damp.frequency.value = 9000; this.damp.Q.value = 0.5;
    this.wet = ctx.createGain();
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10; this.limiter.knee.value = 6; this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004; this.limiter.release.value = 0.25;
    this.node.connect(this.dry, 0);
    this.node.connect(this.convolver, 1);
    this.convolver.connect(this.damp); this.damp.connect(this.wet);
    this.dry.connect(this.master); this.wet.connect(this.master);
    this.tap = new AudioWorkletNode(ctx, 'tap-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    this.master.connect(this.limiter); this.limiter.connect(this.tap); this.tap.connect(ctx.destination);
    this.tap.port.onmessage = (e) => this.onTap(e.data);
    this.recChunks = null;
    this.node.port.onmessage = (e) => this.handle(e.data);
    if (ctx.state !== 'running') await ctx.resume();
    this.ready = true;
  }

  handle(m) {
    if (m.type !== 'state') return;
    const map = new Map();
    const v = m.v;
    for (let i = 0; i < v.length; i += 6) map.set(v[i], { E: v[i + 1], att: v[i + 2], L: v[i + 3], C: v[i + 4], R: v[i + 5] });
    this.voiceState = map;
    this.mass = m.mass;
    this.rain = m.rain;
    this.lastStateAt = performance.now();
    if (this.onState) this.onState(m);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setGlobals(g) {
    if (!this.ready) return;
    this.node.port.postMessage({ type: 'globals', g: {
      spy: g.spy, temp: this.tempOverride ?? g.temp, priming: g.priming, groundBed: g.groundBed, crackle: g.crackle,
      windNoise: g.windNoise, maxVoices: g.maxVoices
    } });
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(g.master * 0.9, t, 0.05);
    this.wet.gain.setTargetAtTime(g.reverbMix * 1.4, t, 0.05);
    this.dry.gain.setTargetAtTime(1 - g.reverbMix * 0.35, t, 0.05);
    this.absorption = g.absorption;
    if (Math.abs(g.reverbSize - this.irSize) > 0.01) {
      clearTimeout(this.irTimer);
      this.irTimer = setTimeout(() => this.buildReverb(g.reverbSize), this.irSize ? 250 : 0);
    }
  }

  setTemp(t) {
    if (this.ready) this.node.port.postMessage({ type: 'globals', g: { temp: t } });
  }

  // ---- recorded sounds ----
  sendSample(key, data, rate) {
    if (!this.ready) return;
    const copy = data ? data.slice() : null;
    this.node.port.postMessage({ type: 'sample', key, data: copy, rate }, copy ? [copy.buffer] : []);
  }

  async decode(arrayBuffer) {
    const buf = await this.ctx.decodeAudioData(arrayBuffer);
    return toMono(buf.numberOfChannels === 1 ? [buf.getChannelData(0)] : [buf.getChannelData(0), buf.getChannelData(1)], buf.sampleRate);
  }

  // ---- recording the output ----
  startRecording() {
    if (!this.ready || this.recChunks) return false;
    this.recChunks = []; this.recStart = this.ctx.currentTime;
    this.tap.port.postMessage({ type: 'start' });
    return true;
  }

  stopRecording() {
    if (!this.recChunks) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.recResolve = resolve;
      this.tap.port.postMessage({ type: 'stop' });
    });
  }

  get recSeconds() { return this.recChunks ? this.ctx.currentTime - this.recStart : 0; }

  onTap(m) {
    if (m.type === 'chunk' && this.recChunks) this.recChunks.push(m);
    if (m.type === 'stopped' && this.recResolve) {
      const chunks = this.recChunks || [];
      this.recChunks = null;
      const n = chunks.reduce((a, c) => a + c.l.length, 0);
      const L = new Float32Array(n), R = new Float32Array(n);
      let o = 0;
      for (const c of chunks) { L.set(c.l, o); R.set(c.r, o); o += c.l.length; }
      const resolve = this.recResolve; this.recResolve = null;
      resolve({ L, R, rate: this.ctx.sampleRate });
    }
  }

  setWind(w) {
    if (this.ready) this.node.port.postMessage({ type: 'globals', g: { wind: w } });
  }

  // Litter on the ground damps the reverb's high end
  updateDamping() {
    if (!this.ready) return;
    const massN = Math.min(1, this.mass / 8);
    const fc = 900 + 11000 * Math.pow(1 - (this.absorption || 0) * massN, 2);
    this.damp.frequency.setTargetAtTime(fc, this.ctx.currentTime, 0.3);
  }

  buildReverb(size) {
    if (!this.ctx) return;
    this.irSize = size;
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(size * sr));
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0, seed = 1234 + ch * 777;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        const n = seed / 1073741823.5 - 1;
        const t = i / len;
        const a = 0.9 - 0.85 * t; // darker as it fades
        lp += a * (n - lp);
        const pre = i < sr * 0.012 ? i / (sr * 0.012) : 1;
        d[i] = lp * Math.pow(1 - t, 2.2) * pre * 0.6;
      }
    }
    this.convolver.buffer = buf;
  }

  note(id, when, p) {
    if (this.ready) this.node.port.postMessage({ type: 'note', id, when, p });
  }

  rainBurst(amount, dur) {
    if (this.ready) this.node.port.postMessage({ type: 'rain', amount, dur });
  }

  panic() {
    if (this.ready) this.node.port.postMessage({ type: 'panic' });
  }

  async suspend() { if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend(); }
}

// Mix to mono, trim to 20 seconds and normalise, for use as a tree's sound
export function toMono(channels, rate) {
  const len = Math.min(channels[0].length, Math.round(rate * 20));
  const out = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i++) out[i] += ch[i] / channels.length;
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 1e-4) for (let i = 0; i < len; i++) out[i] *= 0.9 / peak;
  return { data: out, rate };
}

// 16-bit stereo WAV
export function encodeWav(L, R, rate) {
  const n = L.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
    v.setInt16(o, l < 0 ? l * 32768 : l * 32767, true); v.setInt16(o + 2, r < 0 ? r * 32768 : r * 32767, true); o += 4;
  }
  return new Blob([buf], { type: 'audio/wav' });
}
