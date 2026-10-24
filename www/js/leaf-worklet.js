// Leaf Fall sound engine. Runs on the audio thread.
// Every landed leaf becomes a voice. A voice's loudness and colour come from
// the staged decay model: soluble (leached fast), cellulose (after a microbial
// lag) and lignin (the long tail). Seven engines turn that into sound.

const TABLE_SIZE = 4096;
const SINE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) SINE[i] = Math.sin((i / TABLE_SIZE) * Math.PI * 2);

function sin01(ph) {
  // ph is a phase in cycles, any value
  ph -= Math.floor(ph);
  const x = ph * TABLE_SIZE;
  const i = x | 0;
  const f = x - i;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * f;
}

const ENGINES = ['bell', 'pluck', 'rustle', 'glass', 'wood', 'drone', 'grain'];
// Loudness balance between engines (tuned by ear and by the RMS test)
const ENGINE_GAIN = [0.42, 3.0, 5.0, 0.6, 3.5, 0.68, 1.05];
const TAILS = ['none', 'sub', 'earth', 'metal'];
const MAX_POLY = 48;
const KS_SIZE = 8192;

class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() { // xorshift32, 0..1
    let x = this.s;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  bi() { return this.next() * 2 - 1; }
}

// Topology-preserving state-variable filter (Simper)
class Svf {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.a1 = 0; this.a2 = 0; this.a3 = 0; this.k = 1; this.low = 0; this.band = 0; this.high = 0; }
  set(fc, q, sr) {
    const f = Math.min(Math.max(fc, 10), sr * 0.45);
    const g = Math.tan(Math.PI * f / sr);
    this.k = 1 / Math.max(q, 0.05);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  tick(v0) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2; this.band = v1; this.high = v0 - this.k * v1 - v2;
    return v2;
  }
  reset() { this.ic1 = 0; this.ic2 = 0; }
}

const WOOD_BAR = [1, 2.756, 5.404, 8.933];
const WOOD_MEM = [1, 1.594, 2.136, 2.296];

function softclip(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

class Voice {
  constructor(index) {
    this.index = index;
    this.active = false;
    this.rng = new Rng(1234 + index * 7919);
    this.ks = new Float32Array(KS_SIZE);
    this.f = [new Svf(), new Svf(), new Svf(), new Svf()];
    this.tone = new Svf();
    this.impactF = new Svf();
    this.tailF = new Svf();
    this.ph = new Float64Array(12);
    this.ginc = new Float64Array(10);
    this.gamp = new Float64Array(10);
    this.grains = [];
    for (let i = 0; i < 12; i++) this.grains.push({ on: false, ph: 0, inc: 0, pos: 0, len: 1, amp: 0 });
  }

  start(n, sr, offset) {
    const p = n.p;
    this.active = true;
    this.id = n.id;
    this.delay = offset;
    this.fade = 1; this.fadeStep = 0; this.killing = false;
    this.t = 0; // years since landing
    this.age = 0; // seconds since landing
    this.engine = Math.max(0, ENGINES.indexOf(p.engine));
    this.tailType = Math.max(0, TAILS.indexOf(p.tail));
    this.f0 = p.freq;
    this.vel = p.vel;
    this.level = p.level;
    this.send = p.send;
    const pan = Math.min(1, Math.max(-1, p.pan));
    this.panL = Math.cos((pan + 1) * Math.PI / 4);
    this.panR = Math.sin((pan + 1) * Math.PI / 4);
    this.char = p.character; this.brightP = p.brightness; this.body = p.body;
    this.toneHz = p.tone; this.drive = p.drive; this.impact = p.impact;
    this.tailLevel = p.tailLevel; this.sag = p.sag;
    // staged decay pools, as fractions of the leaf's dry mass
    const s = Math.max(0, p.soluble) / 100, g = Math.max(0, p.lignin) / 100;
    this.L0 = s; this.R0 = Math.min(g, 0.98 - s); this.C0 = Math.max(0.02, 1 - this.L0 - this.R0);
    this.L = this.L0; this.C = this.C0; this.R = this.R0;
    this.kl = p.leach; this.kc = p.kc; this.kr = p.kr;
    this.ta = Math.max(0, p.fall) / 12; // months -> years
    this.tl = Math.max(0, p.lag) / 12;
    this.wl = Math.max(0.02, this.tl / 4);
    this.E = 1; this.att = this.ta > 0 ? 0 : 1;
    this.amp = 0; this.ampT = 0; this.br = this.brightP; this.tailA = 0; this.tailT = 0;
    this.sagMul = 1;
    // per-engine state
    for (const fl of this.f) fl.reset();
    this.tone.reset(); this.impactF.reset(); this.tailF.reset();
    this.ph.fill(0);
    for (let i = 0; i < this.ph.length; i++) this.ph[i] = this.rng.next();
    this.impEnv = 1;
    this.impDecay = Math.exp(-1 / (sr * (0.012 + 0.03 * p.crunch)));
    this.impFreq = 900 + 2600 * p.crunch + 1500 * this.brightP;
    this.ampT = 0; this.tailT = 0;
    this.fm = 0; this.lpS = 0; this.flut = 0; this.flutT = 0; this.ksW = 0; this.ksS = 0; this.dcX = 0; this.dcY = 0;
    for (const gr of this.grains) gr.on = false;
    if (this.engine === 1) this.exciteKs(sr);
    this.woodHit = this.engine === 4 ? 1 : 0;
  }

  exciteKs(sr) {
    this.ks.fill(0);
    const period = Math.min(KS_SIZE - 4, Math.max(2, sr / this.f0));
    let lp = 0;
    const a = 0.15 + 0.85 * this.brightP;
    for (let i = 0; i < Math.ceil(period); i++) {
      lp += a * (this.rng.bi() - lp);
      this.ks[i] = lp;
    }
    this.ksW = Math.ceil(period) % KS_SIZE;
  }
}

class LeafProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.voices = [];
    for (let i = 0; i < MAX_POLY; i++) this.voices.push(new Voice(i));
    this.queue = [];
    this.g = {
      spy: 1.5, temp: 10, priming: 0.3, groundBed: 0.5, crackle: 0.5, windNoise: 0.4,
      maxVoices: 24, wind: 0.3, rainDur: 8
    };
    this.rain = 0; this.rainTarget = 0; this.rainLeft = 0;
    this.mass = 0;
    this.rng = new Rng(98765);
    this.windF = [new Svf(), new Svf()];
    this.crackF = [new Svf(), new Svf()];
    this.rustleF = [new Svf(), new Svf()];
    this.hissF = new Svf();
    this.pinkL = 0; this.pinkR = 0;
    this.drops = [];
    for (let i = 0; i < 10; i++) this.drops.push({ on: false, ph: 0, inc: 0, amp: 0, dec: 0, pan: 0 });
    this.windSm = 0;
    this.stateCounter = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    if (m.type === 'note') {
      this.queue.push(m);
      this.queue.sort((a, b) => a.when - b.when);
      if (this.queue.length > 64) this.queue.splice(0, this.queue.length - 64);
    } else if (m.type === 'globals') {
      Object.assign(this.g, m.g);
    } else if (m.type === 'rain') {
      this.rainTarget = Math.min(1, m.amount);
      this.rainLeft = m.dur;
    } else if (m.type === 'panic') {
      this.queue.length = 0;
      for (const v of this.voices) if (v.active) { v.killing = true; v.fadeStep = 1 / 256; }
    }
  }

  assign(now, blockDur) {
    const sr = this.sr;
    while (this.queue.length && this.queue[0].when < now + blockDur) {
      const n = this.queue[0];
      if (n.when < now - 0.5) { this.queue.shift(); continue; } // too late, drop it
      let free = null, count = 0, quiet = null;
      for (const v of this.voices) {
        if (v.active) {
          count++;
          if (!v.killing && (!quiet || v.amp * v.fade < quiet.amp * quiet.fade)) quiet = v;
        } else if (!free) free = v;
      }
      if (free && count < this.g.maxVoices) {
        const offset = Math.max(0, Math.min(127, Math.round((n.when - now) * sr)));
        free.start(n, sr, offset);
        this.queue.shift();
      } else {
        // steal the quietest voice with a short fade; the note waits a block or two
        if (quiet) { quiet.killing = true; quiet.fadeStep = 1 / 192; }
        break;
      }
    }
  }

  process(inputs, outputs) {
    const out = outputs[0], send = outputs[1];
    const oL = out[0], oR = out[1] || out[0];
    const sL = send[0], sR = send[1] || send[0];
    const N = oL.length;
    const sr = this.sr, g = this.g;
    const now = currentTime;
    const blockDur = N / sr;
    if (!this.buf || this.buf.length !== N) { this.buf = new Float32Array(N); this.tbuf = new Float32Array(N); }
    const buf = this.buf, tbuf = this.tbuf;
    this.assign(now, blockDur);

    // rain envelope
    if (this.rainLeft > 0) this.rainLeft -= blockDur; else this.rainTarget = 0;
    this.rain += (this.rainTarget - this.rain) * (1 - Math.exp(-blockDur / 1.2));

    const tempQ = Math.pow(2, (g.temp - 10) / 10);
    const prime = 1 + g.priming * Math.min(3, this.mass / 4);
    const q = tempQ * prime;
    const dtY = blockDur / Math.max(0.05, g.spy);
    let mass = 0;

    for (const v of this.voices) {
      if (!v.active) continue;
      if (v.delay >= N) { v.delay -= N; continue; }
      // ---- the staged decay envelope, once per block ----
      if (v.ta > 0) { const x = Math.min(1, v.t / v.ta); v.att = x * x * (3 - 2 * x); } else v.att = 1;
      const lagA = v.tl <= 0 ? 1 : 1 / (1 + Math.exp(-(v.t - v.tl) / v.wl));
      v.L *= Math.exp(-v.kl * q * (1 + 3 * this.rain) * dtY);
      v.C *= Math.exp(-v.kc * q * (1 + 0.6 * this.rain) * lagA * dtY);
      v.R *= Math.exp(-v.kr * q * dtY);
      v.E = v.L + v.C + v.R;
      mass += v.E * v.att;
      const lf = v.L0 > 0 ? v.L / v.L0 : 0, cf = v.C / v.C0;
      v.br = Math.min(1, Math.max(0, v.brightP * (0.2 + 0.55 * lf + 0.45 * cf) + 0.35 * this.rain * cf));
      const ampPrev = v.ampT;
      v.ampT = v.E * v.att * v.vel * v.level * ENGINE_GAIN[v.engine];
      const tailPrev = v.tailT;
      const soft = (v.L + v.C) / (v.L0 + v.C0);
      v.tailT = v.tailType === 0 ? 0 : v.tailLevel * v.R * 2.5 * (1 - 0.8 * soft) * v.att * v.vel * v.level;
      v.sagMul = Math.pow(2, -v.sag * (1 - v.E) / 12);
      const f = v.f0 * v.sagMul;
      v.t += dtY; v.age += blockDur;

      const start = v.delay; v.delay = 0;
      if (start > 0) buf.fill(0, 0, start);
      this.renderEngine(v, f, buf, start, N);
      const hasTail = v.tailType !== 0 && (v.tailT > 1e-5 || tailPrev > 1e-5);
      if (hasTail) this.renderTail(v, f, tbuf, start, N);
      const hasImpact = v.impEnv > 1e-4;
      if (hasImpact) v.impactF.set(v.impFreq, 1.2, sr);
      v.tone.set(Math.min(sr * 0.45, v.toneHz * (0.3 + 0.7 * v.br)), 0.7, sr);

      // ---- mix the layers, shape, place in stereo ----
      const span = N - start;
      const dAmp = (v.ampT - ampPrev) / span, dTail = (v.tailT - tailPrev) / span;
      let amp = ampPrev, tailA = tailPrev;
      const drive = v.drive > 0.01 ? 1 + v.drive * 7 : 0, dNorm = drive ? 1 / Math.sqrt(drive) : 1;
      const impAmt = v.impact * v.vel * 0.9;
      const pL = v.panL, pR = v.panR, snd = v.send;
      const tone = v.tone, impF = v.impactF;
      for (let i = start; i < N; i++) {
        amp += dAmp; tailA += dTail;
        let x = buf[i] * amp;
        if (hasTail) x += tbuf[i] * tailA;
        if (hasImpact) { x += impF.tick(v.rng.bi()) * v.impEnv * impAmt; v.impEnv *= v.impDecay; }
        x = tone.tick(x);
        if (drive) x = softclip(x * drive) * dNorm;
        if (v.killing) { v.fade -= v.fadeStep; if (v.fade <= 0) { v.fade = 0; v.active = false; break; } x *= v.fade; }
        const y = x - v.dcX + 0.995 * v.dcY; v.dcX = x; v.dcY = y;
        const l = y * pL, r = y * pR;
        oL[i] += l; oR[i] += r; sL[i] += l * snd; sR[i] += r * snd;
      }
      // finished?
      if (v.active && v.age > 0.3 && v.att >= 1 && v.ampT < 2e-4 && v.tailT < 2e-4 && v.impEnv < 1e-4) v.active = false;
      if (v.active && v.t > 12 && !v.killing) { v.killing = true; v.fadeStep = 1 / 1024; }
    }
    this.mass = mass;
    this.textures(oL, oR, sL, sR, N, blockDur);

    // keep everything finite, whatever happens upstream
    for (let i = 0; i < N; i++) {
      if (oL[i] !== oL[i] || oL[i] === Infinity || oL[i] === -Infinity) oL[i] = 0;
      if (oR[i] !== oR[i] || oR[i] === Infinity || oR[i] === -Infinity) oR[i] = 0;
      if (sL[i] !== sL[i] || sL[i] === Infinity || sL[i] === -Infinity) sL[i] = 0;
      if (sR[i] !== sR[i] || sR[i] === Infinity || sR[i] === -Infinity) sR[i] = 0;
    }

    if (++this.stateCounter >= 12) {
      this.stateCounter = 0;
      const v = [];
      for (const vo of this.voices) if (vo.active) v.push(vo.id, vo.E, vo.att, vo.L0 > 0 ? vo.L / vo.L0 : 0, vo.C / vo.C0, vo.R0 > 0 ? vo.R / vo.R0 : 0);
      this.port.postMessage({ type: 'state', t: now, v, mass, rain: this.rain, queued: this.queue.length });
    }
    return true;
  }

  // Fills buf[start..N) with one engine's raw output at unit loudness.
  renderEngine(v, f, buf, start, N) {
    const sr = this.sr, br = v.br, ch = v.char, body = v.body, rng = v.rng, ph = v.ph;
    switch (v.engine) {
      case 0: { // bell: two-operator FM with modulator feedback
        const incC = f / sr, incM = (f * (0.5 + ch * 6.5)) / sr;
        const index = (0.3 + 7 * br) * 0.159, fb = body * 0.35;
        let pc = ph[0], pm = ph[1], m = v.fm;
        for (let i = start; i < N; i++) {
          pm += incM; m = sin01(pm + fb * m);
          pc += incC; buf[i] = sin01(pc + index * m);
        }
        ph[0] = pc - Math.floor(pc); ph[1] = pm - Math.floor(pm); v.fm = m;
        break;
      }
      case 1: { // pluck: Karplus-Strong, optionally bowed by decomposers
        const t60 = 0.25 + ch * 9;
        const gk = Math.pow(10, -3 / (t60 * f));
        const damp = 0.12 + 0.88 * br;
        const bow = body * 0.06 * (v.C / v.C0);
        const D = Math.min(KS_SIZE - 4, Math.max(2, sr / f - 0.5));
        const ks = v.ks;
        let w = v.ksW, s1 = v.ksS;
        for (let i = start; i < N; i++) {
          let r = w - D; if (r < 0) r += KS_SIZE;
          const ri = r | 0, fr = r - ri;
          const a = ks[ri], b = ks[ri + 1 < KS_SIZE ? ri + 1 : 0];
          const s = a + (b - a) * fr;
          s1 += damp * (s - s1);
          ks[w] = s1 * gk + (bow ? rng.bi() * bow : 0);
          w = w + 1 < KS_SIZE ? w + 1 : 0;
          buf[i] = s * 1.4;
        }
        v.ksW = w; v.ksS = s1;
        break;
      }
      case 2: { // rustle: noise through three tuned band-passes plus papery hiss
        const q = 4 + body * 90;
        const f0 = v.f[0], f1 = v.f[1], f2 = v.f[2], f3 = v.f[3];
        f0.set(f, q, sr); f1.set(f * 2 * (1 + ch * 0.31), q, sr); f2.set(f * 3 * (1 + ch * 0.47), q, sr); f3.set(2500 + 5000 * br, 0.8, sr);
        const norm = Math.sqrt(q) * 0.9;
        const w0 = f0.k * norm * 0.6, w1 = f1.k * br * norm * 0.6, w2 = f2.k * br * br * norm * 0.6, w3 = 0.25 * br;
        let flT = v.flutT, fl = v.flut;
        for (let i = start; i < N; i++) {
          const n = rng.bi();
          flT += 0.0015 * (rng.bi() - flT);
          fl += 0.004 * (Math.abs(flT) * 6 - fl);
          const env = 0.35 + 0.65 * (fl < 1 ? fl : 1);
          f0.tick(n); f1.tick(n); f2.tick(n); f3.tick(n);
          buf[i] = (f0.band * w0 + f1.band * w1 + f2.band * w2 + f3.band * w3) * env;
        }
        v.flutT = flT; v.flut = fl;
        break;
      }
      case 3: { // glass: stretched additive partials; the high ones fade first
        const count = 3 + Math.round(body * 5);
        const B = ch * 0.03;
        const inc = v.ginc, am = v.gamp;
        let used = 0, norm = 0;
        for (let n = 1; n <= count; n++) {
          const fn = f * n * Math.sqrt(1 + B * n * n);
          if (fn > sr * 0.45) break;
          inc[used] = fn / sr;
          am[used] = Math.exp(-(n - 1) * (1 - br) * 1.4) / Math.pow(n, 0.6);
          norm += am[used]; used++;
        }
        const k = norm > 0 ? 1 / Math.sqrt(norm * 1.6) : 0;
        for (let j = 0; j < used; j++) am[j] *= k;
        for (let i = start; i < N; i++) buf[i] = 0;
        for (let j = 0; j < used; j++) {
          let p = ph[j + 1]; const d = inc[j], a = am[j];
          for (let i = start; i < N; i++) { p += d; buf[i] += sin01(p) * a; }
          ph[j + 1] = p - Math.floor(p);
        }
        break;
      }
      case 4: { // wood: struck modal resonators, rubbed as the cellulose goes
        const bar = WOOD_BAR, mem = WOOD_MEM;
        const q = 25 + body * 420;
        for (let m = 0; m < 4; m++) v.f[m].set(f * (bar[m] + (mem[m] - bar[m]) * ch), q * (1 - m * 0.15), sr);
        const norm = Math.sqrt(q) * 0.9;
        const f0 = v.f[0], f1 = v.f[1], f2 = v.f[2], f3 = v.f[3];
        const w0 = f0.k * norm, w1 = f1.k * br * 0.7 * norm, w2 = f2.k * br * br * 0.5 * norm, w3 = f3.k * br * br * br * 0.35 * norm;
        const rubAmt = (0.08 + 0.5 * (v.C / v.C0)) * 1.6 * Math.sqrt(220 / f);
        const hitGain = Math.sqrt(q) * (220 / f);
        let hit = v.woodHit;
        for (let i = start; i < N; i++) {
          const exc = hit * hitGain + rng.bi() * rubAmt;
          hit *= 0.6;
          f0.tick(exc); f1.tick(exc); f2.tick(exc); f3.tick(exc);
          buf[i] = f0.band * w0 + f1.band * w1 + f2.band * w2 + f3.band * w3;
        }
        v.woodHit = hit;
        break;
      }
      case 5: { // drone: three detuned saws, a sub, and needle clicks
        const lp = v.f[0], ck = v.f[1];
        lp.set(Math.min(sr * 0.4, f * (1.2 + br * 28)), 0.9 + body * 2.5, sr);
        ck.set(5500, 0.7, sr);
        const det = ch * 0.012;
        const d0 = (f * (1 - det)) / sr, d1 = f / sr, d2 = (f * (1 + det)) / sr, ds = (f * 0.5) / sr;
        const sub = body * 0.8;
        const clickP = ((2 + 40 * body) * (v.C / v.C0 + 0.15)) / sr;
        const ckW = ck.k * 0.8;
        let p0 = ph[0], p1 = ph[1], p2 = ph[2], p3 = ph[3];
        for (let i = start; i < N; i++) {
          p0 += d0; if (p0 >= 1) p0 -= 1;
          p1 += d1; if (p1 >= 1) p1 -= 1;
          p2 += d2; if (p2 >= 1) p2 -= 1;
          p3 += ds; if (p3 >= 1) p3 -= 1;
          const s = ((2 * p0 - 1) - polyBlep(p0, d0) + (2 * p1 - 1) - polyBlep(p1, d1) + (2 * p2 - 1) - polyBlep(p2, d2)) / 3 + sin01(p3) * sub;
          const c = rng.next() < clickP ? (0.5 + rng.next()) * 1.5 : 0;
          ck.tick(c);
          buf[i] = lp.tick(s) + ck.band * ckW;
        }
        ph[0] = p0; ph[1] = p1; ph[2] = p2; ph[3] = p3;
        break;
      }
      case 6: { // grain: a swarm of short tuned grains
        const rate = ((3 + ch * 70) * (0.3 + 0.7 * Math.min(1, v.E))) / sr;
        const grains = v.grains;
        for (let i = start; i < N; i++) buf[i] = 0;
        // schedule new grains for this block
        for (let i = start; i < N; i++) {
          if (rng.next() >= rate) continue;
          for (const gr of grains) {
            if (gr.on) continue;
            let h = 1;
            const r = rng.next();
            if (r < 0.35 * br) h = 2; if (r < 0.2 * br) h = 3; if (r < 0.1 * br * br) h = 5;
            if (rng.next() < 0.25) h *= 0.5;
            gr.on = true; gr.pos = -(i - start); gr.len = Math.max(32, (0.008 + body * 0.18) * sr * (0.6 + 0.8 * rng.next()));
            gr.inc = (f * h * (1 + rng.bi() * 0.004)) / sr; gr.ph = rng.next(); gr.amp = (0.5 + 0.5 * rng.next()) * 0.55;
            break;
          }
        }
        for (const gr of grains) {
          if (!gr.on) continue;
          const winInc = 0.5 / gr.len;
          let pos = gr.pos, p = gr.ph;
          for (let i = start; i < N; i++) {
            if (pos < 0) { pos++; continue; }
            const w = sin01(pos * winInc);
            p += gr.inc;
            buf[i] += sin01(p) * w * w * gr.amp;
            if (++pos >= gr.len) { gr.on = false; break; }
          }
          gr.pos = pos; gr.ph = p - Math.floor(p);
        }
        break;
      }
      default: buf.fill(0, start, N);
    }
  }

  // The lignin layer: what is left when the soft tissue has gone.
  renderTail(v, f, buf, start, N) {
    const sr = this.sr, ph = v.ph, rng = v.rng;
    switch (v.tailType) {
      case 1: { // sub: a pure octave below
        const d = (f * 0.5) / sr; let p = ph[10];
        for (let i = start; i < N; i++) { p += d; buf[i] = sin01(p) * 0.6; }
        ph[10] = p - Math.floor(p); break;
      }
      case 2: { // earth: dark filtered rumble at the root
        const fl = v.tailF; fl.set(Math.max(30, f * 0.7), 2.5, sr); const w = fl.k * 3.0;
        for (let i = start; i < N; i++) { fl.tick(rng.bi()); buf[i] = fl.band * w; }
        break;
      }
      case 3: { // metal: ring modulation, a slightly mineral ring
        const d1 = (f * 1.414) / sr, d2 = (f * 0.5) / sr; let p1 = ph[10], p2 = ph[11];
        for (let i = start; i < N; i++) { p1 += d1; p2 += d2; buf[i] = sin01(p1) * sin01(p2) * 0.55; }
        ph[10] = p1 - Math.floor(p1); ph[11] = p2 - Math.floor(p2); break;
      }
      default: buf.fill(0, start, N);
    }
  }

  textures(oL, oR, sL, sR, N, blockDur) {
    const g = this.g, sr = this.sr, rng = this.rng;
    this.windSm += (g.wind - this.windSm) * (1 - Math.exp(-blockDur / 0.4));
    const w = this.windSm;
    const massN = Math.min(1, this.mass / 6);
    this.windF[0].set(180 + w * 1400, 0.6, sr); this.windF[1].set(200 + w * 1500, 0.6, sr);
    this.rustleF[0].set(3200, 1.1, sr); this.rustleF[1].set(3600, 1.1, sr);
    this.crackF[0].set(4200, 2.5, sr); this.crackF[1].set(5300, 2.5, sr);
    this.hissF.set(6000, 0.7, sr);
    const windAmp = g.windNoise * w * 0.18;
    const rustleAmp = g.groundBed * massN * (0.15 + w) * 0.08;
    const crackRate = g.crackle * (massN * 25 + w * massN * 50);
    const dropRate = this.rain * 90;
    const hissAmp = this.rain * 0.025;
    for (let i = 0; i < N; i++) {
      // wind: pinkish noise through a moving band-pass
      this.pinkL += 0.08 * (rng.bi() - this.pinkL);
      this.pinkR += 0.08 * (rng.bi() - this.pinkR);
      let l = 0, r = 0;
      if (windAmp > 1e-5) {
        this.windF[0].tick(this.pinkL); this.windF[1].tick(this.pinkR);
        l += this.windF[0].band * windAmp * 3; r += this.windF[1].band * windAmp * 3;
      }
      if (rustleAmp > 1e-5) {
        this.rustleF[0].tick(rng.bi()); this.rustleF[1].tick(rng.bi());
        const fl = 0.5 + 0.5 * Math.sin(i * 0.0007 + currentTime * 3.1);
        l += this.rustleF[0].band * rustleAmp * fl; r += this.rustleF[1].band * rustleAmp * fl;
      }
      // crackle: sparse clicks from the litter layer
      let cl = 0, cr = 0;
      if (crackRate > 0 && rng.next() < crackRate / sr) {
        const a = rng.next() * 0.9;
        if (rng.next() < 0.5) cl = a; else cr = a;
      }
      this.crackF[0].tick(cl); this.crackF[1].tick(cr);
      l += this.crackF[0].band * 0.5; r += this.crackF[1].band * 0.5;
      // rain: drops are tiny decaying pings, plus hiss
      if (dropRate > 0 && rng.next() < dropRate / sr) {
        for (const d of this.drops) {
          if (d.on) continue;
          d.on = true; d.ph = 0; d.inc = (1400 + rng.next() * 4200) / sr; d.amp = 0.04 + rng.next() * 0.08;
          d.dec = Math.exp(-1 / (sr * (0.006 + rng.next() * 0.02))); d.pan = rng.next();
          break;
        }
      }
      for (const d of this.drops) {
        if (!d.on) continue;
        d.ph += d.inc; d.inc *= 0.99996;
        const s = sin01(d.ph) * d.amp;
        l += s * (1 - d.pan); r += s * d.pan;
        d.amp *= d.dec; if (d.amp < 1e-4) d.on = false;
      }
      if (hissAmp > 1e-5) { this.hissF.tick(rng.bi()); l += this.hissF.high * hissAmp; r += this.hissF.high * hissAmp * 0.9; }
      oL[i] += l; oR[i] += r;
      sL[i] += l * 0.35; sR[i] += r * 0.35;
    }
  }
}

registerProcessor('leaf-processor', LeafProcessor);
