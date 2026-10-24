// Draws the canopy, falling leaves, rain and the litter layer.
// A landed leaf shows its own decay: the soft tissue fades and browns,
// the lignin veins stay longest, so old leaves end as skeletons.
import { LIBRARY } from './species.js';
import { SITE } from './forest.js';

function P(d) { return new Path2D(d); }

// Shapes are drawn along x from -1 (stem) to 1 (tip)
const SHAPES = {
  heart: P('M-1 0 C-1.1 -0.75 -0.2 -0.95 0.05 -0.55 C0.35 -0.3 0.75 -0.15 1 0 C0.75 0.15 0.35 0.3 0.05 0.55 C-0.2 0.95 -1.1 0.75 -1 0Z'),
  lance: P('M-1 0 C-0.6 -0.32 0.3 -0.3 1 0 C0.3 0.3 -0.6 0.32 -1 0Z'),
  willow: P('M-1 0 C-0.5 -0.16 0.4 -0.14 1 0 C0.4 0.14 -0.5 0.16 -1 0Z'),
  ovate: P('M-1 0 C-1 -0.62 -0.1 -0.62 0.25 -0.42 L0.4 -0.38 L0.45 -0.3 L0.6 -0.26 L0.65 -0.18 L0.82 -0.12 L1 0 L0.82 0.12 L0.65 0.18 L0.6 0.26 L0.45 0.3 L0.4 0.38 L0.25 0.42 C-0.1 0.62 -1 0.62 -1 0Z'),
  serrate: P('M-1 0 L-0.7 -0.22 L-0.6 -0.3 L-0.45 -0.28 L-0.35 -0.34 L-0.2 -0.31 L-0.1 -0.35 L0.05 -0.3 L0.15 -0.32 L0.3 -0.26 L0.42 -0.26 L0.55 -0.19 L0.68 -0.17 L0.8 -0.1 L1 0 L0.8 0.1 L0.68 0.17 L0.55 0.19 L0.42 0.26 L0.3 0.26 L0.15 0.32 L0.05 0.3 L-0.1 0.35 L-0.2 0.31 L-0.35 0.34 L-0.45 0.28 L-0.6 0.3 L-0.7 0.22Z'),
  palmate: P('M-1 0 L-0.55 -0.1 L-0.75 -0.62 L-0.35 -0.42 L-0.25 -0.9 L0.05 -0.4 L0.35 -0.62 L0.3 -0.2 L1 0 L0.3 0.2 L0.35 0.62 L0.05 0.4 L-0.25 0.9 L-0.35 0.42 L-0.75 0.62 L-0.55 0.1Z'),
  lobed: P('M-1 0 C-0.9 -0.25 -0.7 -0.15 -0.6 -0.3 C-0.5 -0.5 -0.35 -0.25 -0.25 -0.45 C-0.12 -0.65 0.05 -0.3 0.15 -0.5 C0.3 -0.68 0.45 -0.3 0.55 -0.42 C0.7 -0.5 0.85 -0.25 1 0 C0.85 0.25 0.7 0.5 0.55 0.42 C0.45 0.3 0.3 0.68 0.15 0.5 C0.05 0.3 -0.12 0.65 -0.25 0.45 C-0.35 0.25 -0.5 0.5 -0.6 0.3 C-0.7 0.15 -0.9 0.25 -1 0Z'),
  fan: P('M-1 0 L0.55 -0.75 C0.85 -0.55 1 -0.25 0.95 -0.05 L0.75 0 L0.95 0.05 C1 0.25 0.85 0.55 0.55 0.75Z'),
  needle: null
};
const VEINS = P('M-1 0 L0.95 0 M-0.3 0 L0.1 -0.3 M-0.3 0 L0.1 0.3 M0.2 0 L0.5 -0.22 M0.2 0 L0.5 0.22');
const PALM_VEINS = P('M-1 0 L0.95 0 M-0.55 0 L-0.25 -0.8 M-0.55 0 L-0.25 0.8 M-0.55 0 L-0.7 -0.55 M-0.55 0 L-0.7 0.55');

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
const SOIL = [92, 70, 48];

export class Scene {
  constructor(canvas, forest, audio) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.forest = forest;
    this.audio = audio;
    this.W = 0; this.H = 0;
    this.drops = [];
    this.streaks = [];
    this.readTheme();
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', () => this.readTheme());
  }

  readTheme() {
    const cs = getComputedStyle(document.documentElement);
    this.ink = cs.getPropertyValue('--muted').trim() || '#888';
    this.groundCol = cs.getPropertyValue('--ground').trim() || '#6b5a45';
    this.twig = cs.getPropertyValue('--twig').trim() || '#8a7a66';
    this.rainCol = cs.getPropertyValue('--rain').trim() || 'rgba(120,150,190,.6)';
  }

  size() {
    const d = window.devicePixelRatio || 1;
    const w = this.cv.clientWidth || 340, h = this.cv.clientHeight || 300;
    if (w !== this.W || h !== this.H) {
      this.W = w; this.H = h;
      this.cv.width = Math.round(w * d); this.cv.height = Math.round(h * d);
      this.cx.setTransform(d, 0, 0, d, 0, 0);
    }
  }

  get groundY() { return this.H - 30; }
  rowGap() { return Math.min(17, (this.H * 0.38) / 6); }
  rowY(r) { return 22 + r * this.rowGap(); }
  colX(c) { return ((c + 0.5) / this.forest.cols) * this.W; }

  // Which hanging leaf, if any, is under a tap
  hit(x, y) {
    let best = null, bd = 22 * 22;
    for (let r = 0; r < 6; r++) for (let c = 0; c < this.forest.cols; c++) {
      if (this.forest.sites[r][c] !== SITE.HANGING) continue;
      const dx = x - this.colX(c), dy = y - this.rowY(r), d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { r, c }; }
    }
    return best;
  }

  drawLeaf(type, x, y, rot, len, fillCol, fillA, veinA, flip = 1) {
    const cx = this.cx, sp = LIBRARY[type] || LIBRARY.linden;
    cx.save();
    cx.translate(x, y); cx.rotate(rot); cx.scale(len, len * flip);
    if (sp.shape === 'needle') {
      cx.lineCap = 'round';
      cx.strokeStyle = rgba(fillCol, Math.max(fillA, veinA * 0.8));
      cx.lineWidth = 0.13;
      cx.beginPath(); cx.moveTo(-1, 0); cx.lineTo(1, -0.28); cx.moveTo(-1, 0); cx.lineTo(1, 0.28); cx.stroke();
    } else {
      const path = SHAPES[sp.shape] || SHAPES.ovate;
      if (fillA > 0.01) { cx.fillStyle = rgba(fillCol, fillA); cx.fill(path); }
      if (veinA > 0.02) {
        cx.lineWidth = 0.06;
        cx.strokeStyle = rgba(mix(fillCol, SOIL, 0.5), veinA);
        cx.stroke(sp.shape === 'palmate' ? PALM_VEINS : VEINS);
        if (fillA < 0.35) { cx.lineWidth = 0.04; cx.strokeStyle = rgba(mix(fillCol, SOIL, 0.4), veinA * 0.6); cx.stroke(path); }
      }
    }
    cx.restore();
  }

  frame(tReal, dt) {
    this.size();
    const cx = this.cx, W = this.W, H = this.H, f = this.forest, st = f.state;
    const now = this.audio.now;
    const wind = f.windNow;
    cx.clearRect(0, 0, W, H);

    // ground
    const gy = this.groundY;
    cx.fillStyle = this.groundCol;
    cx.globalAlpha = 0.12 + Math.min(0.25, this.audio.mass / 40);
    cx.fillRect(0, gy + 4, W, H - gy - 4);
    cx.globalAlpha = 1;
    cx.strokeStyle = this.groundCol; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(0, gy + 4.5); cx.lineTo(W, gy + 4.5); cx.stroke();

    // canopy: a faint branch per row, hanging leaves and bare twigs
    cx.strokeStyle = this.twig; cx.lineWidth = 1; cx.globalAlpha = 0.22;
    for (let r = 0; r < 6; r++) { const y = this.rowY(r) - 7; cx.beginPath(); cx.moveTo(4, y); cx.lineTo(W - 4, y); cx.stroke(); }
    cx.globalAlpha = 1;
    for (let r = 0; r < 6; r++) {
      const slot = st.slots[r], col = hexToRgb((LIBRARY[slot.type] || LIBRARY.linden).color);
      for (let c = 0; c < f.cols; c++) {
        const site = f.sites[r][c];
        if (!site) continue;
        const x = this.colX(c), y = this.rowY(r);
        if (site === SITE.HANGING) {
          const sway = Math.sin(tReal * (1.2 + 0.15 * r) + c * 1.7 + r) * (0.12 + wind * 0.35);
          this.drawLeaf(slot.type, x, y, Math.PI / 2 + sway + 0.3 * wind, 8, col, 1, 0.5);
        } else {
          cx.fillStyle = this.twig; cx.globalAlpha = 0.5;
          cx.beginPath(); cx.arc(x, y - 6, 1.6, 0, Math.PI * 2); cx.fill();
          cx.globalAlpha = 1;
        }
      }
    }

    // wind streaks during gusts
    const gusting = now < f.gustEnd;
    if (gusting && Math.random() < 0.22) this.streaks.push({ x: -40, y: 20 + Math.random() * (gy - 40), v: 260 + Math.random() * 200, len: 30 + Math.random() * 50 });
    cx.strokeStyle = this.ink; cx.lineWidth = 1;
    this.streaks = this.streaks.filter((s) => {
      s.x += s.v * dt;
      cx.globalAlpha = 0.18; cx.beginPath(); cx.moveTo(s.x, s.y); cx.lineTo(s.x + s.len, s.y); cx.stroke();
      return s.x < W + 40;
    });
    cx.globalAlpha = 1;

    // rain
    const rain = this.audio.rain;
    if (rain > 0.02) for (let k = 0; k < rain * 4; k++) this.drops.push({ x: Math.random() * (W + 60) - 30, y: -10, v: 420 + Math.random() * 200 });
    cx.strokeStyle = this.rainCol; cx.lineWidth = 1;
    this.drops = this.drops.filter((d) => {
      d.y += d.v * dt; d.x += wind * 40 * dt;
      cx.beginPath(); cx.moveTo(d.x, d.y); cx.lineTo(d.x + wind * 2, d.y + 9); cx.stroke();
      return d.y < gy + 4;
    });
    if (this.drops.length > 300) this.drops.splice(0, this.drops.length - 300);

    // leaves in the air and on the ground
    const states = this.audio.voiceState;
    const stale = performance.now() - this.audio.lastStateAt > 500;
    f.leaves = f.leaves.filter((l) => {
      const slot = st.slots[l.r];
      const col = hexToRgb((LIBRARY[slot.type] || LIBRARY.linden).color);
      const x0 = this.colX(l.c), y0 = this.rowY(l.r);
      const age = now - l.t0;
      if (age < 0) return true;
      const len = 10 * l.size;
      if (!l.landed || now < l.tl) {
        const p = Math.min(1, age / l.F);
        const ease = p * p * (3 - 2 * p) * 0.35 + p * 0.65;
        const x = x0 + Math.sin(age * 2.6 + l.ph) * 16 * (1 - 0.4 * p) + l.drift * age;
        const y = y0 + (gy + l.off - y0) * ease;
        const rot = Math.sin(age * 2.6 + l.ph + 1.2) * 1.1 + l.rot;
        this.drawLeaf(slot.type, x, y, rot, len, col, 1, 0.5, l.flip);
        l.lx = x;
        return true;
      }
      // landed: follow the voice's decay
      const x = l.audition ? x0 : (l.lx !== undefined ? l.lx : x0);
      const v = states.get(l.id);
      let soft, veins, brown;
      if (v) {
        l.seen = true;
        const Lr = v.L, Cr = v.C, Rr = v.R;
        soft = Math.min(1, 0.15 * Lr + 0.85 * Cr) * Math.max(0.3, v.att);
        veins = Math.max(soft, Math.min(1, Rr)) * Math.max(0.3, v.att);
        brown = 1 - Math.min(1, 0.6 * Lr + 0.4 * Cr);
        l.last = [soft, veins, brown];
      } else {
        // no voice: either it hasn't reported yet, it was dropped, or it has finished
        const sinceLand = now - l.tl;
        if (!l.seen && sinceLand < 0.6 && !stale) { soft = 1; veins = 0.5; brown = 0; }
        else {
          l.gone += dt;
          const k = Math.max(0, 1 - l.gone / 1.2);
          const last = l.last || [0.6, 0.6, 0.5];
          soft = last[0] * k; veins = last[1] * k; brown = last[2];
          if (k <= 0) return false;
        }
      }
      const c2 = mix(col, SOIL, Math.min(0.85, brown * 0.85));
      this.drawLeaf(slot.type, x, gy + l.off * 0.4, l.rot * 0.6, len * (0.75 + 0.25 * soft), c2, soft, veins, l.flip);
      return true;
    });
  }
}
