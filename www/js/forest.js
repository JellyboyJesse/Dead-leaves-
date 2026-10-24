// The canopy, the wind and the leaves. The wind decides when a leaf lets go;
// the leaf's landing is what plays the note.
import { degreeFreq } from './species.js';

const HANGING = 1, BARE = 2;

export class Forest {
  constructor(state, audio) {
    this.state = state;
    this.audio = audio;
    this.sites = [];
    this.regrowAt = [];
    this.leaves = [];
    this.nextId = 1;
    this.gustNext = 0;
    this.gustEnd = 0;
    this.gustPower = 1;
    this.windNow = 0;
    this.rainEnd = 0;
    this.rainCheck = 0;
    this.onLand = null;
    this.playing = false;
    this.seasonT0 = 0;
    this.seasonShift = 0;
    this.season = null;
    this.syncSites();
  }

  get cols() { return this.state.globals.columns; }

  // Match the hanging leaves to the grid (1 = a site with a leaf)
  syncSites() {
    const g = this.state.grid, cols = this.cols;
    const old = this.sites;
    this.sites = []; this.regrowAt = [];
    for (let r = 0; r < 6; r++) {
      this.sites.push([]); this.regrowAt.push([]);
      for (let c = 0; c < cols; c++) {
        const on = g[r][c] === 1;
        const prev = old[r] ? old[r][c] : undefined;
        this.sites[r].push(on ? (prev === BARE ? BARE : HANGING) : 0);
        this.regrowAt[r].push(0);
      }
    }
  }

  setSite(r, c, on) {
    this.state.grid[r][c] = on ? 1 : 0;
    this.sites[r][c] = on ? HANGING : 0;
  }

  rand() { return Math.random(); }
  bi() { return Math.random() * 2 - 1; }

  gustNow(power = 1) {
    const now = this.audio.now;
    this.gustEnd = now + 0.6 + 0.6 * power;
    this.gustPower = power;
    this.gustNext = now + this.state.globals.gustEvery * (0.6 + 0.8 * this.rand());
  }

  startRain(seconds) {
    const now = this.audio.now;
    this.rainEnd = now + seconds;
    this.audio.rainBurst(0.6 + 0.4 * this.rand(), seconds);
  }

  // Where we are in the seasonal year (0 = start of spring), or null when seasons are off
  seasonPhase(now) {
    const g = this.state.globals;
    if (!g.seasons) return null;
    const len = Math.max(30, g.seasonMinutes * 60);
    return ((((now - this.seasonT0) / len + this.seasonShift) % 1) + 1) % 1;
  }

  jumpToSeason(index) {
    const now = this.audio.now;
    const g = this.state.globals;
    const len = Math.max(30, g.seasonMinutes * 60);
    this.seasonShift = index / 4 + 0.02 - ((now - this.seasonT0) / len);
  }

  // How the year bends the forest's settings
  seasonFactors(p) {
    if (p === null) return { wind: 1, loose: 1, temp: 0, rain: 1, regrow: true, name: '' };
    const bump = (c, w) => { let d = Math.abs(p - c); d = Math.min(d, 1 - d); return Math.exp(-(d * d) / (2 * w * w)); };
    return {
      wind: 0.45 + 1.1 * bump(0.62, 0.12) + 0.35 * bump(0.85, 0.1),
      loose: 0.08 + 3.2 * bump(0.63, 0.09) + 0.9 * bump(0.78, 0.06),
      temp: 8 * Math.cos(2 * Math.PI * (p - 0.375)),
      rain: 0.5 + 1.4 * bump(0.55, 0.1) + 0.9 * bump(0.12, 0.08),
      regrow: p < 0.27,
      name: ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(p * 4) % 4]
    };
  }

  update(dt) {
    if (!this.playing || !this.audio.ready) return;
    const g = this.state.globals;
    const now = this.audio.now;
    const phase = this.seasonPhase(now);
    const sf = this.seasonFactors(phase);
    this.season = phase === null ? null : { phase, name: sf.name };
    // the year warms and cools the ground, which speeds and slows decay
    const temp = g.temp + sf.temp;
    if (phase === null) { if (this.audio.tempOverride != null) { this.audio.tempOverride = null; this.audio.setTemp(g.temp); } }
    else if (this.audio.tempOverride == null || Math.abs(temp - this.audio.tempOverride) > 0.2) { this.audio.tempOverride = temp; this.audio.setTemp(temp); }
    // gusts arrive irregularly around the chosen spacing
    if (now >= this.gustNext) this.gustNow(0.6 + 0.8 * this.rand());
    const gusting = now < this.gustEnd;
    const mult = gusting ? g.gustStrength * this.gustPower : 1;
    const wind = g.wind * sf.wind;
    const target = wind * (gusting ? 1 + 0.12 * g.gustStrength * this.gustPower : 1);
    this.windNow += (target - this.windNow) * Math.min(1, dt * 2.5);
    this.audio.setWind(this.windNow);
    // occasional rain showers
    if (now > this.rainCheck) {
      this.rainCheck = now + 1;
      if (now > this.rainEnd && this.rand() < (g.rainChance * sf.rain) / 40) this.startRain(6 + this.rand() * 10);
    }
    // leaves letting go, and bare twigs regrowing (only in spring when seasons are on)
    const springLeft = phase === null ? 0 : Math.max(1, (0.27 - phase) * g.seasonMinutes * 60);
    for (let r = 0; r < 6; r++) {
      const s = this.state.slots[r];
      for (let c = 0; c < this.cols; c++) {
        const site = this.sites[r][c];
        if (site === HANGING) {
          const lambda = 0.22 * wind * s.loose * sf.loose * mult;
          if (this.rand() < 1 - Math.exp(-lambda * dt)) this.release(r, c, gusting);
        } else if (site === BARE) {
          if (phase === null) { if (now >= this.regrowAt[r][c]) this.sites[r][c] = HANGING; }
          else if (sf.regrow && this.rand() < (dt * 1.6) / springLeft) this.sites[r][c] = HANGING;
        }
      }
    }
    // landings
    for (const l of this.leaves) {
      if (!l.landed && now >= l.tl) { l.landed = true; if (this.onLand) this.onLand(l); }
    }
  }

  // Build one leaf's note: every leaf is a little different
  buildNote(r, col, gust) {
    const s = this.state.slots[r], g = this.state.globals;
    const size = 1 + s.sizeVar * this.bi() * 0.35;
    const water = 1 + s.waterVar * this.bi() * 0.4;
    let degree = s.degree;
    if (this.rand() < s.wander) degree += (this.rand() < 0.5 ? -1 : 1) * (this.rand() < 0.3 ? 2 : 1);
    const cents = s.scatter * this.bi() + (1 - size) * 60;
    const freq = Math.min(6000, Math.max(20, degreeFreq(g.root, g.scale, degree, s.octave) * Math.pow(2, cents / 1200)));
    const colFrac = this.cols > 1 ? col / (this.cols - 1) : 0.5;
    const pan = (colFrac * 2 - 1) * s.panSpread * 0.85 + this.bi() * 0.15 * s.panSpread;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    return {
      engine: s.engine, freq, sampleKey: s.sampleKey || null,
      vel: clamp(0.62 + 0.3 * this.rand() + (gust ? 0.12 : 0), 0, 1),
      level: s.level * Math.sqrt(size), send: s.send, pan,
      character: s.character, brightness: clamp(s.brightness + (water - 1) * 0.5, 0, 1), body: s.body,
      tone: s.tone, drive: s.drive, impact: s.impact,
      crunch: clamp(this.audio.mass / 8, 0, 1) * (1 - 0.7 * this.audio.rain),
      tail: s.tail, tailLevel: s.tailLevel, sag: s.sag,
      soluble: clamp(s.soluble * water, 0, 60), lignin: s.lignin,
      leach: s.leach * water, kc: s.kc * (0.7 + 0.3 * water), kr: s.kr,
      fall: s.fall, lag: s.lag / water
    };
  }

  release(r, c, gust = false) {
    const s = this.state.slots[r], g = this.state.globals;
    const now = this.audio.now;
    const F = s.fallTime * (0.85 + 0.3 * this.rand());
    const id = this.nextId++;
    this.sites[r][c] = BARE;
    this.regrowAt[r][c] = now + F + g.regrow * (0.7 + 0.6 * this.rand());
    this.audio.note(id, now + F, this.buildNote(r, c, gust));
    this.leaves.push({
      id, r, c, t0: now, tl: now + F, F, landed: false,
      ph: this.rand() * 6.28, off: this.rand() * 10 - 4, rot: this.bi() * 0.5,
      drift: (this.windNow * 18 + this.bi() * 10) * (gust ? 1.6 : 1),
      flip: this.rand() < 0.5 ? -1 : 1, size: 0.85 + 0.3 * this.rand(), gone: 0
    });
    if (this.leaves.length > 220) this.leaves.splice(0, this.leaves.length - 220);
  }

  // Play a slot straight away, from the editor
  audition(r) {
    if (!this.audio.ready) return;
    const now = this.audio.now;
    const c = Math.floor(this.cols / 2);
    const id = this.nextId++;
    this.audio.note(id, now + 0.02, this.buildNote(r, c, false));
    this.leaves.push({ id, r, c, t0: now - 10, tl: now, F: 0.01, landed: true, audition: true,
      ph: 0, off: this.rand() * 6 - 3, rot: this.bi() * 0.4, drift: 0, flip: 1, size: 1, gone: 0 });
  }

  clearGround() {
    this.leaves = this.leaves.filter((l) => !l.landed);
  }
}

export const SITE = { HANGING, BARE };
