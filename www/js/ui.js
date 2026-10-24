// Canopy grid, tree editor, forest settings and presets.
import { ENGINES, TAILS, SPECIES_PARAMS, LIBRARY, SCALES, speciesDefaults, stagedCurve, halfLife, noteName, degreeFreq } from './species.js';
import { GLOBAL_PARAMS, BUILT_IN_PRESETS, PRESET_NOTES, normalise, loadUserPresets, saveUserPresets } from './state.js';
import { SITE } from './forest.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) e.append(kid);
  return e;
}

function svg(viewBox, d, cls) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox); s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d);
  s.append(p);
  return s;
}

const GLYPHS = {
  bell: 'M1 7C4 1 6 1 8 7S12 13 15 7S19 2 22 7S26 11 29 7',
  pluck: 'M1 7L4 1L7 13L10 3L13 11L16 5L19 9L22 6L25 8L29 7',
  rustle: 'M1 7L3 4L4 10L6 5L7 9L9 3L10 11L12 6L13 8L15 2L16 12L18 6L19 8L21 4L22 10L24 6L25 9L27 5L29 7',
  glass: 'M5 13V3M10 13V6M15 13V2M20 13V8M25 13V10',
  wood: 'M1 7H6L8 2L10 12L12 4L14 9L16 6L18 8H29',
  drone: 'M1 12L8 2V12L15 2V12L22 2V12L29 2',
  grain: 'M3 8h.5M7 4h.5M10 10h.5M14 6h.5M17 2h.5M20 9h.5M24 5h.5M27 11h.5'
};
const LEAF_GLYPH = 'M3 15C3 7 8 3 15 3C15 10 11 15 3 15Z';

function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

function fmtValue(def, v) {
  const unit = def.unit ? (def.unit === '%' || def.unit === '×' ? def.unit : ' ' + def.unit) : '';
  if (def.int) return `${v}${unit}`;
  if (def.log) return v >= 1000 ? (v / 1000).toFixed(1) + 'k' + (def.unit === 'Hz' ? '' : unit) : Math.round(v) + unit;
  const a = Math.abs(v);
  return (a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)) + unit;
}

// One compact line: label, slider, value
function row(def, obj, onChange, labelText) {
  const id = 'p-' + def.key + '-' + Math.random().toString(36).slice(2, 7);
  const input = el('input', { type: 'range', id });
  const out = el('output', { for: id });
  if (def.log) { input.min = 0; input.max = 1000; input.step = 1; } else { input.min = def.min; input.max = def.max; input.step = def.step; }
  const toS = (v) => def.log ? Math.round(1000 * Math.log(v / def.min) / Math.log(def.max / def.min)) : v;
  const fromS = (s) => def.log ? def.min * Math.pow(def.max / def.min, s / 1000) : Number(s);
  const paint = () => {
    const p = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--p', p + '%');
  };
  const refresh = () => { input.value = toS(obj[def.key]); out.textContent = fmtValue(def, obj[def.key]); paint(); };
  input.addEventListener('input', () => {
    let v = fromS(input.value); if (def.int) v = Math.round(v);
    obj[def.key] = v; out.textContent = fmtValue(def, v); paint();
    onChange(def.key, v);
  });
  refresh();
  const r = el('div', { class: 'row' }, el('label', { for: id, text: labelText || def.label }), input, out);
  const frag = document.createDocumentFragment();
  frag.append(r);
  if (def.hint) frag.append(el('div', { class: 'row', 'aria-hidden': 'true' }, el('span'), el('span', { class: 'row-hint', text: def.hint })));
  r.refresh = refresh;
  return frag;
}

function stepper(label, display, onStep) {
  const span = el('span', { text: display(), 'aria-live': 'polite' });
  const btn = (d, t, aria) => el('button', { text: t, 'aria-label': aria, onclick: () => { onStep(d); span.textContent = display(); } });
  return el('div', { class: 'row row-wide' }, el('span', { class: 'lbl', text: label }),
    el('div', { class: 'stepper' }, btn(-1, '−', `Lower ${label.toLowerCase()}`), span, btn(1, '+', `Raise ${label.toLowerCase()}`)));
}

function seg(options, value, onPick, label) {
  const g = el('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const o of options) {
    g.append(el('button', { text: o.label, 'aria-pressed': String(o.value) === String(value) ? 'true' : 'false', onclick: (e) => {
      g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      e.currentTarget.setAttribute('aria-pressed', 'true');
      onPick(o.value);
    } }));
  }
  return g;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.selected = 0;
    this.cells = []; this.dots = []; this.sparks = [];
    this.treeSec = safeGet('leaffall.treeSec') || 'Envelope';
    this.forestSec = safeGet('leaffall.forestSec') || 'Time';
    this.handles = [];
    this.drag = null;
  }

  get state() { return this.app.state; }

  build() {
    this.buildGrid();
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => this.showTab(t.dataset.tab)));
    this.renderTree();
    this.renderForest();
    this.renderPresets();
  }

  showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'panel-' + name; });
    if (name === 'tree') requestAnimationFrame(() => this.drawEnvelope());
  }

  // ---------- canopy ----------
  buildGrid() {
    const wrap = document.getElementById('grid');
    wrap.innerHTML = '';
    const cols = this.state.globals.columns;
    wrap.style.setProperty('--cols', cols);
    this.cells = []; this.dots = []; this.sparks = [];
    const top = el('div', { class: 'grid-row cursor-row', 'aria-hidden': 'true' }, el('span'));
    for (let c = 0; c < cols; c++) { const d = el('i'); this.dots.push(d); top.append(d); }
    wrap.append(top);
    for (let r = 0; r < 6; r++) {
      const slot = this.state.slots[r], lib = LIBRARY[slot.type] || LIBRARY.linden;
      const spark = el('canvas', { class: 'spark', 'aria-hidden': 'true' });
      this.sparks.push(spark);
      const label = el('button', { class: 'row-label' + (r === this.selected ? ' sel' : ''), style: `--c:${lib.color}`, 'aria-label': `Edit ${lib.name}`,
        onclick: () => { this.select(r); this.showTab('tree'); } },
        el('span', { class: 'row-name', text: lib.name }), spark);
      const rowEl = el('div', { class: 'grid-row' }, label);
      this.cells.push([]);
      for (let c = 0; c < cols; c++) {
        const b = el('button', { class: 'cell', style: `--c:${lib.color}`, 'aria-label': `${lib.name}, site ${c + 1}`,
          onclick: () => { this.app.forest.setSite(r, c, !this.state.grid[r][c]); this.app.changed(); } });
        this.cells[r].push(b); rowEl.append(b);
      }
      wrap.append(rowEl);
    }
    this.drawSparks();
  }

  drawSparks() {
    const temp = this.state.globals.temp;
    this.sparks.forEach((cv, r) => {
      const slot = this.state.slots[r], color = (LIBRARY[slot.type] || LIBRARY.linden).color;
      const d = window.devicePixelRatio || 1, w = 64, h = 12;
      cv.width = w * d; cv.height = h * d;
      const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
      const c = stagedCurve(slot, 4, 64, temp);
      const Y = (i) => h - 1 - (c.L[i] + c.C[i] + c.R[i]) * c.att[i] * (h - 2);
      g.beginPath(); g.moveTo(0, h);
      for (let i = 0; i <= 64; i++) g.lineTo((i / 64) * w, Y(i));
      g.lineTo(w, h); g.closePath(); g.fillStyle = color; g.globalAlpha = 0.25; g.fill(); g.globalAlpha = 1;
      g.beginPath(); for (let i = 0; i <= 64; i++) i ? g.lineTo((i / 64) * w, Y(i)) : g.moveTo(0, Y(0));
      g.strokeStyle = color; g.lineWidth = 1.2; g.stroke();
    });
  }

  updateGrid() {
    const f = this.app.forest;
    for (let r = 0; r < 6; r++) for (let c = 0; c < f.cols; c++) {
      const b = this.cells[r] && this.cells[r][c];
      if (!b) continue;
      const s = f.sites[r][c];
      const want = s === SITE.HANGING ? 'on' : s === SITE.BARE ? 'bare' : '';
      if (b.dataset.s !== want) {
        b.dataset.s = want;
        b.classList.toggle('on', want === 'on'); b.classList.toggle('bare', want === 'bare');
      }
    }
  }

  landed(leaf) {
    this.dots.forEach((d, i) => d.classList.toggle('lit', i === leaf.c));
    const b = this.cells[leaf.r] && this.cells[leaf.r][leaf.c];
    if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 200); }
  }

  select(r) {
    this.selected = r;
    document.querySelectorAll('.row-label').forEach((b, i) => b.classList.toggle('sel', i === r));
    this.renderTree();
  }

  // ---------- tree editor ----------
  renderTree() {
    const panel = document.getElementById('panel-tree');
    panel.innerHTML = '';
    const r = this.selected, slot = this.state.slots[r];
    const lib = LIBRARY[slot.type] || LIBRARY.linden;
    const engine = ENGINES.find((e) => e.id === slot.engine) || ENGINES[0];

    // which row
    const pick = el('div', { class: 'tree-pick', role: 'group', 'aria-label': 'Choose a row' });
    this.state.slots.forEach((s, i) => {
      const l = LIBRARY[s.type] || LIBRARY.linden;
      pick.append(el('button', { class: 'tree-chip' + (i === r ? ' sel' : ''), style: `--c:${l.color}`, 'aria-pressed': i === r ? 'true' : 'false', onclick: () => this.select(i) },
        el('i'), document.createTextNode(l.name)));
    });
    panel.append(pick);

    const card = el('div', { class: 'card', style: `--c:${lib.color}` });
    const typeSel = el('select', { id: 'tree-type', 'aria-label': 'Tree species' });
    for (const [k, v] of Object.entries(LIBRARY)) { const o = el('option', { value: k, text: v.name }); if (k === slot.type) o.selected = true; typeSel.append(o); }
    typeSel.addEventListener('change', () => {
      this.state.slots[r] = { ...speciesDefaults(typeSel.value), degree: slot.degree, octave: slot.octave };
      this.buildGrid(); this.renderTree(); this.app.changed();
    });
    card.append(el('div', { class: 'card-head' },
      el('div', { class: 'swatch' }, svg('0 0 18 18', LEAF_GLYPH)),
      el('div', { class: 'species-select' }, typeSel),
      el('div', { class: 'card-actions' },
        el('button', { text: 'Reset', title: 'Back to this tree’s defaults', onclick: () => { this.state.slots[r] = { ...speciesDefaults(slot.type), degree: slot.degree, octave: slot.octave }; this.afterChange(true); } }),
        el('button', { class: 'btn-ink', text: 'Play', 'aria-label': `Play one ${lib.name.toLowerCase()} leaf`, onclick: () => this.app.audition(r) }))));

    const engines = el('div', { class: 'engines', role: 'group', 'aria-label': 'Sound engine' });
    for (const e of ENGINES) {
      engines.append(el('button', { class: 'engine' + (e.id === slot.engine ? ' sel' : ''), 'aria-pressed': e.id === slot.engine ? 'true' : 'false',
        onclick: () => { slot.engine = e.id; this.renderTree(); this.app.changed(); } },
        svg('0 0 30 14', GLYPHS[e.id], e.id === 'grain' ? 'dots' : ''), el('span', { text: e.label })));
    }
    // eighth cell: vary
    engines.append(el('button', { class: 'engine', title: 'Nudge every sound and envelope setting a little', onclick: () => { this.vary(slot); this.afterChange(false); } },
      svg('0 0 30 14', 'M3 10C8 10 8 4 13 4S18 10 23 10M23 10l-3-3M23 10l3-3'), el('span', { text: 'Vary' })));
    card.append(engines);

    const secs = ['Envelope', 'Sound', 'Pitch', 'Leaf'];
    if (!secs.includes(this.treeSec)) this.treeSec = 'Envelope';
    const body = el('div', { class: 'rows' });
    card.append(seg(secs.map((s) => ({ value: s, label: s })), this.treeSec, (v) => { this.treeSec = v; safeSet('leaffall.treeSec', v); this.fillTreeSection(body, slot, engine); }, 'Tree settings'));
    card.append(body);
    this.fillTreeSection(body, slot, engine);
    panel.append(card);
  }

  fillTreeSection(body, slot, engine) {
    body.innerHTML = '';
    const grp = SPECIES_PARAMS.find((g) => g.group === this.treeSec);
    const onChange = (key) => {
      if (grp.group === 'Envelope') { this.drawEnvelope(); this.drawSparks(); }
      this.app.changed();
    };
    if (grp.group === 'Envelope') {
      const lib = LIBRARY[slot.type] || LIBRARY.linden;
      const cv = el('canvas', { id: 'envelope', role: 'img', 'aria-label': 'Decay envelope. Drag the points to shape it.' });
      body.append(el('div', { class: 'env' }, cv));
      body.append(el('div', { class: 'env-read' }, el('span', { id: 'env-read', text: '' }), el('span', { id: 'env-life' })));
      body.append(el('div', { class: 'legend', 'aria-hidden': 'true' },
        el('span', { style: '--c:#4A90D9' }, el('i'), document.createTextNode('Soluble')),
        el('span', { style: `--c:${lib.color}` }, el('i'), document.createTextNode('Cellulose')),
        el('span', { style: '--c:#8A7FD6' }, el('i'), document.createTextNode('Lignin'))));
      const det = el('details', {}, el('summary', { text: 'Exact values' }));
      const rows = el('div', { class: 'rows' });
      for (const def of grp.items) rows.append(row(def, slot, onChange));
      det.append(rows);
      body.append(det);
      this.envRows = rows;
      this.bindEnvelope(cv, slot);
      requestAnimationFrame(() => this.drawEnvelope());
      return;
    }
    if (grp.group === 'Sound') {
      body.append(el('div', { class: 'row row-wide' }, el('span', { class: 'lbl', text: 'Tail layer' }),
        seg(TAILS.map((t) => ({ value: t.id, label: t.label })), slot.tail, (v) => { slot.tail = v; this.app.changed(); }, 'Tail layer')));
    }
    for (const def of grp.items) {
      if (def.stepper && def.key === 'degree') {
        body.append(stepper('Note', () => this.noteLabel(slot), (d) => { slot.degree = Math.max(0, Math.min(15, slot.degree + d)); this.app.changed(); }));
      } else if (def.stepper && def.key === 'octave') {
        body.append(stepper('Octave', () => String(slot.octave), (d) => { slot.octave = Math.max(-1, Math.min(4, slot.octave + d)); this.app.changed(); }));
      } else {
        const label = def.engineLabel ? engine[def.engineLabel] : def.label;
        body.append(row(def, slot, onChange, label));
      }
    }
  }

  noteLabel(slot) {
    const g = this.state.globals;
    if (!SCALES[g.scale]) return `H${slot.degree + 1}`;
    const f = degreeFreq(g.root, g.scale, slot.degree, slot.octave);
    return noteName(Math.round(69 + 12 * Math.log2(f / 440)));
  }

  afterChange(grid) {
    if (grid) this.buildGrid(); else this.drawSparks();
    this.renderTree();
    this.app.changed();
  }

  vary(slot) {
    for (const grp of SPECIES_PARAMS) {
      if (grp.group === 'Pitch') continue;
      for (const def of grp.items) {
        let v = def.log ? slot[def.key] * Math.pow(2, (Math.random() * 2 - 1) * 0.7) : slot[def.key] + (Math.random() * 2 - 1) * (def.max - def.min) * 0.12;
        slot[def.key] = Math.min(def.max, Math.max(def.min, Math.round(v / def.step) * def.step));
      }
    }
  }

  // ---------- envelope with draggable points ----------
  envGeom(cv) {
    const w = cv.clientWidth || 320, h = 170;
    const pad = { l: 8, r: 10, t: 18, b: 22 };
    const years = 4;
    return { w, h, years, pad,
      X: (t) => pad.l + (t / years) * (w - pad.l - pad.r),
      Y: (v) => pad.t + (1 - v) * (h - pad.t - pad.b),
      T: (x) => ((x - pad.l) / (w - pad.l - pad.r)) * years,
      V: (y) => 1 - (y - pad.t) / (h - pad.t - pad.b) };
  }

  handlePoints(slot, curve, g) {
    const q = Math.pow(2, (this.state.globals.temp - 10) / 10);
    const n = curve.L.length - 1;
    const at = (t) => { const i = Math.max(0, Math.min(n, Math.round((t / g.years) * n))); return (curve.L[i] + curve.C[i] + curve.R[i]) * curve.att[i]; };
    const a = slot.fall / 12;
    const d = Math.min(g.years, a + 2.3 / (slot.leach * q));
    const s = Math.min(g.years, Math.max(slot.lag / 12, d + 0.15));
    const r = Math.min(g.years, slot.lag / 12 + Math.LN2 / (slot.kc * q));
    return [
      { id: 'A', name: 'Attack', t: a, v: at(a) },
      { id: 'D', name: 'Leaching', t: d, v: 1 - slot.soluble / 100 },
      { id: 'S', name: 'Lag', t: s, v: at(s) },
      { id: 'R', name: 'Cellulose', t: r, v: at(r) },
      { id: 'T', name: 'Lignin', t: g.years * 0.92, v: slot.lignin / 100 }
    ];
  }

  bindEnvelope(cv, slot) {
    const q = () => Math.pow(2, (this.state.globals.temp - 10) / 10);
    const pos = (e) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    cv.addEventListener('pointerdown', (e) => {
      const p = pos(e), g = this.envGeom(cv);
      let best = null, bd = 26 * 26;
      for (const h of this.handles) { const dx = g.X(h.t) - p.x, dy = g.Y(h.v) - p.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = h; } }
      if (!best) return;
      this.drag = best.id; cv.setPointerCapture(e.pointerId); e.preventDefault();
      this.drawEnvelope();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const p = pos(e), g = this.envGeom(cv);
      const t = clamp(g.T(p.x), 0, g.years), v = clamp(g.V(p.y), 0, 1);
      const a = slot.fall / 12;
      switch (this.drag) {
        case 'A': slot.fall = Math.round(clamp(t * 12, 0, 6) * 10) / 10; break;
        case 'D':
          slot.soluble = Math.round(clamp((1 - v) * 100, 0, 45));
          if (t > a + 0.01) slot.leach = Math.round(clamp(2.3 / (q() * (t - a)), 2, 60) * 2) / 2;
          break;
        case 'S': slot.lag = Math.round(clamp(t * 12, 0, 10) * 10) / 10; break;
        case 'R': if (t > slot.lag / 12 + 0.02) slot.kc = Math.round(clamp(Math.LN2 / (q() * (t - slot.lag / 12)), 0.1, 6) * 20) / 20; break;
        case 'T': slot.lignin = Math.round(clamp(v * 100, 0, 60)); break;
      }
      this.drawEnvelope();
    });
    const end = () => {
      if (!this.drag) return;
      this.drag = null;
      this.drawEnvelope(); this.drawSparks();
      if (this.envRows) this.envRows.querySelectorAll('.row').forEach((r) => r.refresh && r.refresh());
      this.app.changed();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  drawEnvelope() {
    const cv = document.getElementById('envelope');
    if (!cv || !cv.clientWidth) return;
    const slot = this.state.slots[this.selected], lib = LIBRARY[slot.type] || LIBRARY.linden;
    const g = this.envGeom(cv), d = window.devicePixelRatio || 1;
    cv.width = g.w * d; cv.height = g.h * d;
    const cx = cv.getContext('2d'); cx.setTransform(d, 0, 0, d, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim(), muted = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line-strong').trim(), surf = css.getPropertyValue('--surface').trim();
    const temp = this.state.globals.temp, n = 200;
    const c = stagedCurve(slot, g.years, n, temp);
    const tAt = (i) => (i / n) * g.years;
    cx.strokeStyle = line; cx.lineWidth = 1;
    for (const v of [0, 0.5, 1]) { cx.beginPath(); cx.moveTo(g.pad.l, g.Y(v) + 0.5); cx.lineTo(g.w - g.pad.r, g.Y(v) + 0.5); cx.stroke(); }
    cx.fillStyle = muted; cx.font = '10px system-ui, sans-serif'; cx.textAlign = 'center';
    for (let y = 1; y <= g.years; y++) cx.fillText(y + ' yr', Math.min(g.w - 16, g.X(y)), g.h - 6);
    const layers = [
      { lo: () => 0, hi: (i) => c.R[i], col: '#8A7FD6' },
      { lo: (i) => c.R[i], hi: (i) => c.R[i] + c.C[i], col: lib.color },
      { lo: (i) => c.R[i] + c.C[i], hi: (i) => c.R[i] + c.C[i] + c.L[i], col: '#4A90D9' }
    ];
    for (const L of layers) {
      cx.beginPath();
      for (let i = 0; i <= n; i++) cx.lineTo(g.X(tAt(i)), g.Y(L.hi(i) * c.att[i]));
      for (let i = n; i >= 0; i--) cx.lineTo(g.X(tAt(i)), g.Y(L.lo(i) * c.att[i]));
      cx.closePath(); cx.fillStyle = L.col; cx.globalAlpha = 0.28; cx.fill(); cx.globalAlpha = 1;
    }
    cx.beginPath();
    for (let i = 0; i <= n; i++) { const y = g.Y((c.L[i] + c.C[i] + c.R[i]) * c.att[i]); i ? cx.lineTo(g.X(tAt(i)), y) : cx.moveTo(g.X(0), y); }
    cx.strokeStyle = ink; cx.lineWidth = 1.6; cx.lineJoin = 'round'; cx.stroke();
    // lignin level guide
    cx.setLineDash([3, 4]); cx.strokeStyle = '#8A7FD6'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(g.X(g.years * 0.6), g.Y(slot.lignin / 100)); cx.lineTo(g.X(g.years), g.Y(slot.lignin / 100)); cx.stroke();
    cx.setLineDash([]);
    // handles
    this.handles = this.handlePoints(slot, c, g);
    cx.font = '500 10px system-ui, sans-serif';
    for (const h of this.handles) {
      const x = g.X(h.t), y = g.Y(h.v), active = this.drag === h.id;
      cx.beginPath(); cx.arc(x, y, active ? 9 : 7, 0, Math.PI * 2);
      cx.fillStyle = active ? ink : surf; cx.fill();
      cx.strokeStyle = ink; cx.lineWidth = 1.5; cx.stroke();
      cx.fillStyle = active ? surf : ink; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(h.id, x, y + 0.5);
    }
    cx.textBaseline = 'alphabetic';
    // readouts
    const read = document.getElementById('env-read'), life = document.getElementById('env-life');
    if (read) {
      const h = this.handles.find((x) => x.id === this.drag);
      const msg = {
        A: `Attack <b>${slot.fall.toFixed(1)} months</b>`,
        D: `Soluble <b>${slot.soluble}%</b>, leaching at <b>${slot.leach}/yr</b>`,
        S: `Lag <b>${slot.lag.toFixed(1)} months</b>`,
        R: `Cellulose k <b>${slot.kc.toFixed(2)}/yr</b>`,
        T: `Lignin <b>${slot.lignin}%</b>`
      };
      read.innerHTML = h ? msg[h.id] : 'Drag A, D, S, R or T';
    }
    if (life) {
      const hl = halfLife(slot, temp), spy = this.state.globals.spy;
      life.textContent = hl === null ? 'Half left after 12 yr' : `Half gone in ${hl < 1.5 ? Math.round(hl * 12) + ' mo' : hl.toFixed(1) + ' yr'} · ${(hl * spy).toFixed(1)} s`;
    }
  }

  // ---------- forest ----------
  renderForest() {
    const panel = document.getElementById('panel-forest');
    panel.innerHTML = '';
    const g = this.state.globals;
    const card = el('div', { class: 'card' });
    const names = GLOBAL_PARAMS.map((x) => x.group);
    if (!names.includes(this.forestSec)) this.forestSec = names[0];
    const body = el('div', { class: 'rows' });
    card.append(seg(names.map((n) => ({ value: n, label: n })), this.forestSec, (v) => { this.forestSec = v; safeSet('leaffall.forestSec', v); this.fillForest(body); }, 'Forest settings'));
    card.append(body);
    this.fillForest(body);
    panel.append(card);
  }

  fillForest(body) {
    body.innerHTML = '';
    const g = this.state.globals;
    const grp = GLOBAL_PARAMS.find((x) => x.group === this.forestSec);
    for (const def of grp.items) {
      if (def.stepper) {
        body.append(stepper(def.label, () => noteName(g.root), (d) => { g.root = Math.max(def.min, Math.min(def.max, g.root + d)); this.app.changed(); this.renderTree(); }));
      } else if (def.seg) {
        body.append(el('div', { class: 'row row-wide' }, el('span', { class: 'lbl', text: def.label }),
          seg(def.options.map((o) => ({ value: o, label: String(o) })), g[def.key], (v) => { g[def.key] = Number(v); this.app.resizeColumns(Number(v)); this.app.changed(); }, def.label)));
      } else if (def.options) {
        const id = 'g-' + def.key;
        const s = el('select', { id });
        for (const o of def.options) { const op = el('option', { value: o, text: o }); if (o === g[def.key]) op.selected = true; s.append(op); }
        s.addEventListener('change', () => { g[def.key] = s.value; this.app.changed(); this.renderTree(); });
        body.append(el('div', { class: 'row row-wide' }, el('label', { for: id, text: def.label }), s));
      } else {
        body.append(row(def, g, (key) => { if (key === 'temp') { this.drawSparks(); this.drawEnvelope(); } this.app.changed(); }));
      }
    }
  }

  // ---------- presets ----------
  renderPresets() {
    const panel = document.getElementById('panel-presets');
    panel.innerHTML = '';
    const grid = el('div', { class: 'preset-grid' });
    for (const name of Object.keys(BUILT_IN_PRESETS)) {
      grid.append(el('button', { class: 'preset', onclick: () => this.app.load(BUILT_IN_PRESETS[name]()) },
        el('b', { text: name }), el('small', { text: PRESET_NOTES[name] || '' })));
    }
    panel.append(grid);

    const mine = el('div', { class: 'card' }, el('p', { class: 'sub', text: 'Your forests' }));
    const presets = loadUserPresets();
    const names = Object.keys(presets);
    if (!names.length) mine.append(el('p', { class: 'note', text: 'Nothing saved yet. Name the forest you are hearing and save it.' }));
    for (const name of names) {
      mine.append(el('div', { class: 'list-row' },
        el('button', { class: 'grow', text: name, onclick: () => this.app.load(normalise(presets[name])) }),
        el('button', { text: 'Delete', 'aria-label': `Delete ${name}`, onclick: () => { delete presets[name]; saveUserPresets(presets); this.renderPresets(); } })));
    }
    const nameIn = el('input', { type: 'text', id: 'preset-name', placeholder: 'Hasenheide, November', 'aria-label': 'Name for this forest', maxlength: 40 });
    const err = el('p', { class: 'note', role: 'alert' });
    nameIn.addEventListener('input', () => { err.textContent = ''; });
    mine.append(el('div', { class: 'list-row' }, nameIn, el('button', { class: 'btn-ink', text: 'Save', onclick: () => {
      const n = nameIn.value.trim();
      if (!n) { err.textContent = 'Give the forest a name first.'; return; }
      presets[n] = JSON.parse(JSON.stringify(this.state)); saveUserPresets(presets); this.renderPresets();
    } })), err);
    panel.append(mine);

    const share = el('details', { class: 'card' }, el('summary', { text: 'Share as text' }));
    const ta = el('textarea', { id: 'share-text', rows: 4, 'aria-label': 'Forest as text', spellcheck: 'false' });
    const msg = el('p', { class: 'note', role: 'status' });
    share.append(ta, el('div', { class: 'list-row' },
      el('button', { text: 'Copy current', onclick: async () => {
        ta.value = JSON.stringify(this.state);
        try { await navigator.clipboard.writeText(ta.value); msg.textContent = 'Copied.'; } catch (e) { ta.select(); msg.textContent = 'Selected. Copy it from here.'; }
      } }),
      el('button', { text: 'Load pasted', onclick: () => {
        try { this.app.load(normalise(JSON.parse(ta.value))); msg.textContent = 'Loaded.'; } catch (e) { msg.textContent = 'That text is not a forest. Paste the whole thing.'; }
      } })), msg);
    panel.append(share);
  }

  refreshAll() {
    this.buildGrid();
    this.renderTree();
    this.renderForest();
  }
}
