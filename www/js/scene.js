// Draws the canopy, falling leaves, rain and the litter layer.
// A landed leaf shows its own decay: the soft tissue fades and browns,
// the lignin veins stay longest, so old leaves end as skeletons.
import { LIBRARY } from './species.js';
import { SITE } from './forest.js';
import { drawLeafArt } from './leafart.js';


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
    new MutationObserver(() => this.readTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
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

  get groundY() { return this.H - 16; }
  rowGap() { return Math.min(17, (this.H * 0.38) / 6); }
  rowY(r) { return (this.forest.season ? 36 : 22) + r * this.rowGap(); }
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

  drawLeaf(type, x, y, rot, len, state) {
    const lib = LIBRARY[type] || LIBRARY.linden;
    drawLeafArt(this.cx, type in LIBRARY ? type : 'linden', lib.color, x, y, rot, len, state);
  }

  frame(tReal, dt) {
    this.size();
    const cx = this.cx, W = this.W, H = this.H, f = this.forest, st = f.state;
    const now = this.audio.now;
    const wind = f.windNow;
    cx.clearRect(0, 0, W, H);

    // ground
    const gy = this.groundY;
    cx.strokeStyle = this.groundCol; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(0, gy + 6.5); cx.lineTo(W, gy + 6.5); cx.stroke();

    // the seasonal year, as a thin line across the top
    if (f.season) {
      const p = f.season.phase, x0 = 10, x1 = W - 10, y = 9;
      cx.strokeStyle = this.groundCol; cx.lineWidth = 2; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(x0, y); cx.lineTo(x1, y); cx.stroke();
      cx.strokeStyle = this.ink; cx.beginPath(); cx.moveTo(x0, y); cx.lineTo(x0 + (x1 - x0) * p, y); cx.stroke();
      cx.fillStyle = this.ink;
      for (let k = 1; k < 4; k++) { cx.beginPath(); cx.arc(x0 + ((x1 - x0) * k) / 4, y, 1.5, 0, Math.PI * 2); cx.fill(); }
      cx.font = '11px system-ui, sans-serif'; cx.textAlign = 'right'; cx.fillText(f.season.name, x1, y + 15);
      cx.lineCap = 'butt';
    }

    // canopy: hanging leaves and bare twigs
    for (let r = 0; r < 6; r++) {
      const slot = st.slots[r];
      for (let c = 0; c < f.cols; c++) {
        const site = f.sites[r][c];
        if (!site) continue;
        const x = this.colX(c), y = this.rowY(r);
        if (site === SITE.HANGING) {
          const sway = Math.sin(tReal * (1.2 + 0.15 * r) + c * 1.7 + r) * (0.12 + wind * 0.35);
          this.drawLeaf(slot.type, x, y + 2, Math.PI / 2 + sway + 0.3 * wind, 9, { tumble: 0.9 + 0.1 * Math.cos(tReal * 1.7 + c + r) });
        } else {
          cx.fillStyle = this.twig; cx.globalAlpha = 0.5;
          cx.beginPath(); cx.arc(x, y - 7, 1.5, 0, Math.PI * 2); cx.fill();
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
      const x0 = this.colX(l.c), y0 = this.rowY(l.r);
      const age = now - l.t0;
      if (age < 0) return true;
      const len = 12 * l.size;
      if (!l.landed || now < l.tl) {
        const p = Math.min(1, age / l.F);
        const ease = p * p * (3 - 2 * p) * 0.35 + p * 0.65;
        const x = x0 + Math.sin(age * 2.6 + l.ph) * 16 * (1 - 0.4 * p) + l.drift * age;
        const y = y0 + (gy + l.off - y0) * ease;
        const rot = Math.sin(age * 2.6 + l.ph + 1.2) * 1.1 + l.rot;
        this.drawLeaf(slot.type, x, y, rot, len, { tumble: Math.cos(age * (2.2 + l.size) + l.ph) * l.flip });
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
      this.drawLeaf(slot.type, x, gy + l.off * 0.4, l.rot * 0.6, len, { soft, brown, veins, tumble: l.flip * 0.7 });
      return true;
    });
  }
}
