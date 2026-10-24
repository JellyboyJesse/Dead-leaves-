// Editors: canopy grid, forest settings, species settings and presets.
import { ENGINES, TAILS, SPECIES_PARAMS, LIBRARY, speciesDefaults, stagedCurve, halfLife, noteName, degreeFreq } from './species.js';
import { GLOBAL_PARAMS, BUILT_IN_PRESETS, normalise, loadUserPresets, saveUserPresets } from './state.js';
import { SITE } from './forest.js';

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids) if (kid) e.append(kid);
  return e;
}

function fmtValue(def, v) {
  if (def.note) return noteName(v);
  const unit = def.unit ? (def.unit === '%' || def.unit === '×' ? def.unit : ' ' + def.unit) : '';
  if (def.int) return `${v}${unit}`;
  const abs = Math.abs(v);
  const s = def.log ? Math.round(v).toString() : abs >= 100 ? v.toFixed(0) : abs >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s + unit;
}

// A labelled range slider bound to obj[def.key]
function slider(def, obj, onChange, labelText) {
  const val = el('span', { class: 'val' });
  const id = 'p-' + Math.random().toString(36).slice(2, 9);
  const input = el('input', { type: 'range', id });
  if (def.log) { input.min = 0; input.max = 1000; input.step = 1; }
  else { input.min = def.min; input.max = def.max; input.step = def.step; }
  const toSlider = (v) => def.log ? Math.round(1000 * Math.log(v / def.min) / Math.log(def.max / def.min)) : v;
  const fromSlider = (s) => def.log ? def.min * Math.pow(def.max / def.min, s / 1000) : Number(s);
  const refresh = () => { input.value = toSlider(obj[def.key]); val.textContent = fmtValue(def, obj[def.key]); };
  input.addEventListener('input', () => {
    let v = fromSlider(input.value);
    if (def.int) v = Math.round(v);
    obj[def.key] = v;
    val.textContent = fmtValue(def, v);
    onChange(def.key, v);
  });
  refresh();
  const label = el('label', { for: id, text: labelText || def.label });
  const row = el('div', { class: 'ctl' }, el('div', { class: 'ctl-head' }, label, val), input);
  if (def.hint) row.append(el('div', { class: 'hint', text: def.hint }));
  row.refresh = refresh;
  return row;
}

function select(label, options, value, onChange) {
  const id = 's-' + Math.random().toString(36).slice(2, 9);
  const s = el('select', { id });
  for (const o of options) {
    const opt = el('option', { value: o.value, text: o.label });
    if (String(o.value) === String(value)) opt.selected = true;
    s.append(opt);
  }
  s.addEventListener('change', () => onChange(s.value));
  return el('div', { class: 'ctl' }, el('div', { class: 'ctl-head' }, el('label', { for: id, text: label })), s);
}

export class UI {
  constructor(app) {
    this.app = app;
    this.selected = 0;
    this.cells = [];
    this.dots = [];
    this.sparks = [];
  }

  get state() { return this.app.state; }

  build() {
    this.buildGrid();
    this.buildTabs();
    this.renderForest();
    this.renderSpecies();
    this.renderPresets();
  }

  // ---------- canopy grid ----------
  buildGrid() {
    const wrap = document.getElementById('grid');
    wrap.innerHTML = '';
    const cols = this.state.globals.columns;
    wrap.style.setProperty('--cols', cols);
    this.cells = []; this.dots = []; this.sparks = [];
    const top = el('div', { class: 'grid-row cursor-row' }, el('span'));
    for (let c = 0; c < cols; c++) { const d = el('i'); this.dots.push(d); top.append(d); }
    wrap.append(top);
    for (let r = 0; r < 6; r++) {
      const slot = this.state.slots[r];
      const lib = LIBRARY[slot.type] || LIBRARY.linden;
      const spark = el('canvas', { class: 'spark', 'aria-hidden': 'true' });
      this.sparks.push(spark);
      const label = el('button', { class: 'row-label' + (r === this.selected ? ' sel' : ''), style: `--c:${lib.color}`, 'aria-label': `Edit ${lib.name}`,
        onclick: () => { this.select(r); this.showTab('species'); } },
        el('span', { class: 'row-name', text: lib.name }), spark);
      const row = el('div', { class: 'grid-row' }, label);
      this.cells.push([]);
      for (let c = 0; c < cols; c++) {
        const b = el('button', { class: 'cell', style: `--c:${lib.color}`, 'aria-label': `${lib.name} site ${c + 1}`,
          onclick: () => { const on = !this.state.grid[r][c]; this.app.forest.setSite(r, c, on); this.app.changed(); } });
        this.cells[r].push(b); row.append(b);
      }
      wrap.append(row);
    }
    this.drawSparks();
  }

  drawSparks() {
    const temp = this.state.globals.temp;
    this.sparks.forEach((cv, r) => {
      const slot = this.state.slots[r];
      const color = (LIBRARY[slot.type] || LIBRARY.linden).color;
      const d = window.devicePixelRatio || 1, w = 56, h = 14;
      cv.width = w * d; cv.height = h * d;
      const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
      const c = stagedCurve(slot, 4, 80, temp);
      g.beginPath(); g.moveTo(0, h);
      for (let i = 0; i <= 80; i++) g.lineTo((i / 80) * w, h - 1 - (c.L[i] + c.C[i] + c.R[i]) * c.att[i] * (h - 2));
      g.lineTo(w, h); g.closePath();
      g.fillStyle = color; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = color; g.lineWidth = 1.2;
      g.beginPath();
      for (let i = 0; i <= 80; i++) { const y = h - 1 - (c.L[i] + c.C[i] + c.R[i]) * c.att[i] * (h - 2); i ? g.lineTo((i / 80) * w, y) : g.moveTo(0, y); }
      g.stroke();
    });
  }

  // Called every animation frame: reflect hanging, bare and empty sites
  updateGrid() {
    const f = this.app.forest;
    for (let r = 0; r < 6; r++) for (let c = 0; c < f.cols; c++) {
      const b = this.cells[r] && this.cells[r][c];
      if (!b) continue;
      const s = f.sites[r][c];
      const cls = s === SITE.HANGING ? 'cell on' : s === SITE.BARE ? 'cell bare' : 'cell';
      if (b.className.replace(' flash', '') !== cls) b.className = cls + (b.classList.contains('flash') ? ' flash' : '');
    }
  }

  landed(leaf) {
    this.dots.forEach((d, i) => d.classList.toggle('lit', i === leaf.c));
    const b = this.cells[leaf.r] && this.cells[leaf.r][leaf.c];
    if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 220); }
  }

  // ---------- tabs ----------
  buildTabs() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => this.showTab(t.dataset.tab)));
  }

  showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'panel-' + name; });
  }

  select(r) {
    this.selected = r;
    document.querySelectorAll('.row-label').forEach((b, i) => b.classList.toggle('sel', i === r));
    this.renderSpecies();
  }

  // ---------- forest settings ----------
  renderForest() {
    const panel = document.getElementById('panel-forest');
    panel.innerHTML = '';
    const g = this.state.globals;
    for (const grp of GLOBAL_PARAMS) {
      const box = el('section', { class: 'group' }, el('h3', { text: grp.group }));
      for (const def of grp.items) {
        if (def.options) {
          box.append(select(def.label, def.options.map((o) => ({ value: o, label: String(o) })), g[def.key], (v) => {
            g[def.key] = def.key === 'columns' ? Number(v) : v;
            if (def.key === 'columns') this.app.resizeColumns(Number(v));
            this.app.changed();
          }));
        } else {
          box.append(slider(def, g, (key) => {
            if (key === 'temp') { this.drawSparks(); this.drawEnvelope(); }
            this.app.changed();
          }));
        }
      }
      panel.append(box);
    }
  }

  // ---------- species settings ----------
  renderSpecies() {
    const panel = document.getElementById('panel-species');
    panel.innerHTML = '';
    const r = this.selected, slot = this.state.slots[r];
    const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Tree rows' });
    this.state.slots.forEach((s, i) => {
      const lib = LIBRARY[s.type] || LIBRARY.linden;
      chips.append(el('button', { class: 'chip' + (i === r ? ' sel' : ''), style: `--c:${lib.color}`, 'aria-pressed': i === r ? 'true' : 'false', onclick: () => this.select(i) },
        el('span', { class: 'dot' }), el('span', { text: lib.name })));
    });
    panel.append(chips);

    const engine = ENGINES.find((e) => e.id === slot.engine) || ENGINES[0];
    const head = el('section', { class: 'group' });
    head.append(select('Tree', Object.entries(LIBRARY).map(([k, v]) => ({ value: k, label: v.name })), slot.type, (v) => {
      const keep = { degree: slot.degree, octave: slot.octave };
      this.state.slots[r] = { ...speciesDefaults(v), ...keep };
      this.afterSlotChange(true);
    }));
    head.append(select('Engine', ENGINES.map((e) => ({ value: e.id, label: e.label })), slot.engine, (v) => { slot.engine = v; this.afterSlotChange(true); }));
    head.append(select('Tail (lignin layer)', TAILS.map((t) => ({ value: t.id, label: t.label })), slot.tail, (v) => { slot.tail = v; this.afterSlotChange(); }));

    const env = el('canvas', { id: 'envelope', class: 'envelope', role: 'img', 'aria-label': 'Decay envelope for this tree' });
    const envInfo = el('p', { class: 'env-info', id: 'env-info' });
    head.append(el('div', { class: 'env-wrap' }, env, envInfo));
    const freq = degreeFreq(this.state.globals.root, this.state.globals.scale, slot.degree, slot.octave);
    head.append(el('div', { class: 'btns' },
      el('button', { class: 'primary', text: 'Play a leaf', onclick: () => this.app.audition(r) }),
      el('button', { text: 'Vary', title: 'Nudge every setting a little', onclick: () => { this.vary(slot); this.afterSlotChange(true); } }),
      el('button', { text: 'Reset tree', onclick: () => { const keep = { degree: slot.degree, octave: slot.octave }; this.state.slots[r] = { ...speciesDefaults(slot.type), ...keep }; this.afterSlotChange(true); } })));
    head.append(el('p', { class: 'hint', id: 'pitch-info', text: `Base note ${freq.toFixed(1)} Hz` }));
    panel.append(head);

    for (const grp of SPECIES_PARAMS) {
      const box = el('section', { class: 'group' }, el('h3', { text: grp.group }));
      for (const def of grp.items) {
        const label = def.engineLabel ? `${def.label} · ${engine[def.engineLabel]}` : def.label;
        box.append(slider(def, slot, (key) => {
          if (['fall', 'soluble', 'leach', 'lag', 'kc', 'lignin', 'kr'].includes(key)) { this.drawEnvelope(); this.drawSparks(); }
          if (key === 'degree' || key === 'octave') {
            const f = degreeFreq(this.state.globals.root, this.state.globals.scale, slot.degree, slot.octave);
            document.getElementById('pitch-info').textContent = `Base note ${f.toFixed(1)} Hz`;
          }
          this.app.changed();
        }, label));
      }
      panel.append(box);
    }
    requestAnimationFrame(() => this.drawEnvelope());
  }

  afterSlotChange(rebuildGrid) {
    if (rebuildGrid) this.buildGrid();
    this.renderSpecies();
    this.drawSparks();
    this.app.changed();
  }

  vary(slot) {
    for (const grp of SPECIES_PARAMS) for (const def of grp.items) {
      if (def.int || grp.group === 'Pitch') continue;
      const span = def.max - def.min;
      let v = slot[def.key] + (Math.random() * 2 - 1) * span * 0.12;
      if (def.log) v = slot[def.key] * Math.pow(2, (Math.random() * 2 - 1) * 0.7);
      slot[def.key] = Math.min(def.max, Math.max(def.min, Math.round(v / def.step) * def.step));
    }
  }

  drawEnvelope() {
    const cv = document.getElementById('envelope');
    if (!cv) return;
    const slot = this.state.slots[this.selected];
    const lib = LIBRARY[slot.type] || LIBRARY.linden;
    const d = window.devicePixelRatio || 1, w = cv.clientWidth || 320, h = 120;
    cv.width = w * d; cv.height = h * d;
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    const temp = this.state.globals.temp;
    const years = 4, n = 160, c = stagedCurve(slot, years, n, temp);
    const top = 14, bot = h - 16, X = (i) => (i / n) * w, Y = (v) => bot - v * (bot - top);
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#888';
    g.strokeStyle = muted; g.globalAlpha = 0.25; g.lineWidth = 1;
    [0, 0.5, 1].forEach((v) => { g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w, Y(v)); g.stroke(); });
    g.globalAlpha = 1;
    const layers = [
      { lo: () => 0, hi: (i) => c.R[i], col: '#7B6BD6' },
      { lo: (i) => c.R[i], hi: (i) => c.R[i] + c.C[i], col: lib.color },
      { lo: (i) => c.R[i] + c.C[i], hi: (i) => c.R[i] + c.C[i] + c.L[i], col: '#4A90D9' }
    ];
    for (const L of layers) {
      g.beginPath();
      for (let i = 0; i <= n; i++) g.lineTo(X(i), Y(L.hi(i) * c.att[i]));
      for (let i = n; i >= 0; i--) g.lineTo(X(i), Y(L.lo(i) * c.att[i]));
      g.closePath(); g.fillStyle = L.col; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
      g.beginPath();
      for (let i = 0; i <= n; i++) { const y = Y(L.hi(i) * c.att[i]); i ? g.lineTo(X(i), y) : g.moveTo(0, y); }
      g.strokeStyle = L.col; g.lineWidth = 1.5; g.stroke();
    }
    g.fillStyle = muted; g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
    for (let y = 1; y <= years; y++) g.fillText(y + ' yr', Math.min(w - 16, X((y / years) * n)), h - 3);
    // stage markers: attack, leach, sustain (lag), release (cellulose), tail
    const q = Math.pow(2, (temp - 10) / 10);
    const marks = [0, slot.fall / 12, slot.fall / 12 + 0.25 / (slot.leach * q / 15), Math.max(slot.fall / 12, slot.lag / 12), slot.lag / 12 + 1.5 / (slot.kc * q), years];
    for (let i = 1; i < marks.length; i++) marks[i] = Math.min(years, Math.max(marks[i - 1], marks[i]));
    const names = ['A', 'D', 'S', 'R', 'tail'];
    g.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      const x0 = (marks[i] / years) * w, x1 = (marks[i + 1] / years) * w;
      if (x1 - x0 >= 18) g.fillText(names[i], (x0 + x1) / 2, 11);
    }
    const hl = halfLife(slot, temp);
    const info = document.getElementById('env-info');
    if (info) {
      const spy = this.state.globals.spy;
      const txt = hl === null ? 'Half the mass is still there after 12 years' :
        `Half gone after ${hl < 1.5 ? Math.round(hl * 12) + ' months' : hl.toFixed(1) + ' years'} · ${(hl * spy).toFixed(1)} s of sound`;
      info.textContent = `Blue soluble, ${lib.name.toLowerCase()} cellulose, violet lignin. ${txt}`;
    }
  }

  // ---------- presets ----------
  renderPresets() {
    const panel = document.getElementById('panel-presets');
    panel.innerHTML = '';
    const built = el('section', { class: 'group' }, el('h3', { text: 'Forests' }));
    const list = el('div', { class: 'preset-list' });
    for (const name of Object.keys(BUILT_IN_PRESETS)) {
      list.append(el('button', { text: name, onclick: () => this.app.load(BUILT_IN_PRESETS[name]()) }));
    }
    built.append(list);
    panel.append(built);

    const mine = el('section', { class: 'group' }, el('h3', { text: 'Your forests' }));
    const presets = loadUserPresets();
    const names = Object.keys(presets);
    if (!names.length) mine.append(el('p', { class: 'hint', text: 'Save the current forest to keep it here.' }));
    for (const name of names) {
      mine.append(el('div', { class: 'preset-row' },
        el('button', { text: name, class: 'grow', onclick: () => this.app.load(normalise(presets[name])) }),
        el('button', { text: 'Delete', 'aria-label': `Delete ${name}`, onclick: () => { delete presets[name]; saveUserPresets(presets); this.renderPresets(); } })));
    }
    const nameIn = el('input', { type: 'text', placeholder: 'Autumn in Neukölln', 'aria-label': 'Name for this forest', maxlength: 40 });
    const err = el('p', { class: 'error', role: 'alert' });
    nameIn.addEventListener('input', () => { err.textContent = ''; });
    mine.append(el('div', { class: 'preset-row' }, nameIn, el('button', { class: 'primary', text: 'Save', onclick: () => {
      const n = nameIn.value.trim();
      if (!n) { err.textContent = 'Give the forest a name first.'; return; }
      presets[n] = JSON.parse(JSON.stringify(this.state)); saveUserPresets(presets); this.renderPresets();
    } })), err);
    panel.append(mine);

    const share = el('section', { class: 'group' }, el('h3', { text: 'Share as text' }));
    const ta = el('textarea', { rows: 4, 'aria-label': 'Forest as text', spellcheck: 'false' });
    const msg = el('p', { class: 'hint', role: 'status' });
    share.append(ta, el('div', { class: 'btns' },
      el('button', { text: 'Show current', onclick: () => { ta.value = JSON.stringify(this.state); msg.textContent = ''; } }),
      el('button', { text: 'Copy', onclick: async () => {
        if (!ta.value) ta.value = JSON.stringify(this.state);
        try { await navigator.clipboard.writeText(ta.value); msg.textContent = 'Copied.'; } catch (e) { ta.select(); msg.textContent = 'Select the text and copy it.'; }
      } }),
      el('button', { text: 'Load text', onclick: () => {
        try { this.app.load(normalise(JSON.parse(ta.value))); msg.textContent = 'Loaded.'; } catch (e) { msg.textContent = 'That text is not a forest. Paste the whole thing.'; }
      } })), msg);
    panel.append(share);
  }

  // After loading a preset or changing columns
  refreshAll() {
    this.buildGrid();
    this.renderForest();
    this.renderSpecies();
  }
}
