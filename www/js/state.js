// Forest state, global parameters, presets and saving.
import { speciesDefaults, SCALES } from './species.js';

export const GLOBAL_PARAMS = [
  { group: 'Time', items: [
    { key: 'spy', label: 'Year length', min: 0.25, max: 8, step: 0.05, unit: 's', hint: 'Seconds of sound per year of decay' },
    { key: 'temp', label: 'Temperature', min: 0, max: 25, step: 0.5, unit: '°C', hint: 'Decay roughly doubles every 10 °C' },
    { key: 'priming', label: 'Priming', min: 0, max: 1, step: 0.01, hint: 'More litter on the ground speeds up all decay' },
    { key: 'rainChance', label: 'Rain', min: 0, max: 1, step: 0.01, hint: 'How often showers come. Rain leaches leaves and brightens every note' },
    { key: 'seasons', label: 'Seasons', options: ['Off', 'On'], seg: true, bool: true },
    { key: 'seasonMinutes', label: 'Season year', min: 1, max: 20, step: 0.5, unit: 'min', hint: 'Spring regrows the canopy, autumn drops it, winter is the long tail', showIf: 'seasons' },
    { key: 'jump', label: 'Jump to', jump: true, showIf: 'seasons' }
  ] },
  { group: 'Wind', items: [
    { key: 'wind', label: 'Wind', min: 0, max: 2, step: 0.01 },
    { key: 'gustStrength', label: 'Gust force', min: 1, max: 10, step: 0.1, unit: '×' },
    { key: 'gustEvery', label: 'Gust gap', min: 1, max: 20, step: 0.5, unit: 's' },
    { key: 'regrow', label: 'Regrow', min: 1, max: 30, step: 0.5, unit: 's', hint: 'How long a bare twig waits for a new leaf' }
  ] },
  { group: 'Ground', items: [
    { key: 'groundBed', label: 'Rustle', min: 0, max: 1, step: 0.01 },
    { key: 'crackle', label: 'Crackle', min: 0, max: 1, step: 0.01 },
    { key: 'windNoise', label: 'Wind sound', min: 0, max: 1, step: 0.01 },
    { key: 'absorption', label: 'Damping', min: 0, max: 1, step: 0.01, hint: 'Piled-up leaves soften the reverb' }
  ] },
  { group: 'Space', items: [
    { key: 'reverbSize', label: 'Reverb size', min: 0.5, max: 8, step: 0.1, unit: 's' },
    { key: 'reverbMix', label: 'Reverb', min: 0, max: 1, step: 0.01 },
    { key: 'master', label: 'Volume', min: 0, max: 1, step: 0.01 }
  ] },
  { group: 'Setup', items: [
    { key: 'root', label: 'Root', min: 28, max: 64, step: 1, int: true, note: true, stepper: true },
    { key: 'scale', label: 'Scale', options: Object.keys(SCALES) },
    { key: 'columns', label: 'Columns', options: [8, 12, 16], seg: true },
    { key: 'maxVoices', label: 'Voices', min: 8, max: 48, step: 4, int: true, hint: 'Lower this if the sound crackles' }
  ] }
];

export const PRESET_NOTES = {
  'Park in October': 'Six mixed trees, light wind',
  'Pine stand': 'Slow drones, cold and dark',
  'Rain garden': 'Fast leaves and frequent showers',
  'Glass orchard': 'Bright partials in a big room',
  'Windstorm': 'Dense gusts across twelve columns',
  'Slow rot': 'Long lags, cold ground, years per phrase'
};

export const DEFAULT_GLOBALS = {
  spy: 1.5, temp: 10, priming: 0.3, rainChance: 0.15, seasons: false, seasonMinutes: 4,
  wind: 0.8, gustStrength: 5, gustEvery: 5, regrow: 6,
  groundBed: 0.5, crackle: 0.4, windNoise: 0.35,
  reverbSize: 3.2, reverbMix: 0.35, absorption: 0.5, master: 0.8,
  root: 45, scale: 'Minor pentatonic', maxVoices: 24, columns: 8
};

const DEFAULT_SLOTS = [
  ['linden', 0, 2], ['ash', 3, 1], ['birch', 1, 1], ['maple', 0, 1], ['oak', 3, 0], ['pine', 0, 0]
];

const DEFAULT_GRID = [
  [0, 0, 1, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 1, 0, 0],
  [1, 0, 0, 1, 0, 0, 0, 1],
  [0, 0, 0, 1, 0, 0, 1, 0],
  [1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0, 0]
];

function makeSlot(type, degree, octave, extra = {}) {
  return { ...speciesDefaults(type), degree, octave, ...extra };
}

export function defaultState() {
  return {
    version: 1,
    globals: { ...DEFAULT_GLOBALS },
    slots: DEFAULT_SLOTS.map(([t, d, o]) => makeSlot(t, d, o)),
    grid: DEFAULT_GRID.map((r) => r.slice())
  };
}

function randomGrid(cols, density, seed) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return Array.from({ length: 6 }, () => Array.from({ length: cols }, () => (rnd() < density ? 1 : 0)));
}

export const BUILT_IN_PRESETS = {
  'Park in October': () => defaultState(),
  'Pine stand': () => {
    const st = defaultState();
    Object.assign(st.globals, { spy: 3, temp: 6, wind: 0.5, gustEvery: 8, regrow: 10, reverbSize: 5.5, reverbMix: 0.5, root: 38, scale: 'Dorian', crackle: 0.7 });
    st.slots = [makeSlot('pine', 4, 1, { engine: 'drone', tailLevel: 0.4 }), makeSlot('beech', 2, 1), makeSlot('pine', 2, 0),
      makeSlot('oak', 4, 0), makeSlot('pine', 0, 0, { character: 0.8, body: 0.8 }), makeSlot('chestnut', 0, -1, { engine: 'drone', brightness: 0.25 })];
    st.grid = randomGrid(8, 0.35, 11);
    return st;
  },
  'Rain garden': () => {
    const st = defaultState();
    Object.assign(st.globals, { spy: 1, temp: 15, rainChance: 0.8, priming: 0.6, wind: 1, groundBed: 0.7, scale: 'Major pentatonic', root: 50 });
    st.slots = [makeSlot('willow', 2, 2), makeSlot('poplar', 4, 1), makeSlot('birch', 1, 1), makeSlot('linden', 0, 1), makeSlot('ginkgo', 3, 0), makeSlot('ash', 0, 0)];
    st.grid = randomGrid(8, 0.4, 5);
    return st;
  },
  'Glass orchard': () => {
    const st = defaultState();
    Object.assign(st.globals, { scale: 'Lydian', root: 48, reverbMix: 0.6, reverbSize: 5, wind: 0.6, spy: 2 });
    st.slots = [makeSlot('ginkgo', 6, 1), makeSlot('maple', 4, 1), makeSlot('rowan', 2, 1), makeSlot('linden', 0, 1),
      makeSlot('maple', 4, 0, { character: 0.9 }), makeSlot('ginkgo', 0, 0, { engine: 'bell', character: 0.15 })];
    st.grid = randomGrid(8, 0.3, 21);
    return st;
  },
  'Windstorm': () => {
    const st = defaultState();
    Object.assign(st.globals, { wind: 1.8, gustStrength: 8, gustEvery: 3, regrow: 2, spy: 0.6, maxVoices: 32, windNoise: 0.7, crackle: 0.8, columns: 12 });
    st.grid = randomGrid(12, 0.55, 3);
    return st;
  },
  'Slow rot': () => {
    const st = defaultState();
    Object.assign(st.globals, { spy: 6, temp: 3, priming: 0, wind: 0.35, regrow: 14, reverbSize: 7, reverbMix: 0.55, scale: 'In-sen', root: 40 });
    st.slots.forEach((s) => { s.lag = Math.min(10, s.lag * 2); s.sag = 1.5; });
    st.grid = randomGrid(8, 0.25, 9);
    return st;
  }
};

const KEY = 'leaffall.state.v1';
const PKEY = 'leaffall.presets.v1';

function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* storage unavailable */ } }

// Fills in anything missing so older or hand-edited saves still load.
export function normalise(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const st = { version: 1, globals: { ...base.globals, ...(raw.globals || {}) }, slots: [], grid: [] };
  for (let i = 0; i < 6; i++) {
    const s = (raw.slots && raw.slots[i]) || base.slots[i];
    st.slots.push({ ...speciesDefaults(s.type || base.slots[i].type), ...base.slots[i], ...s });
  }
  const cols = [8, 12, 16].includes(Number(st.globals.columns)) ? Number(st.globals.columns) : 8;
  st.globals.columns = cols;
  if (!SCALES.hasOwnProperty(st.globals.scale)) st.globals.scale = base.globals.scale;
  for (let r = 0; r < 6; r++) {
    const row = (raw.grid && raw.grid[r]) || [];
    st.grid.push(Array.from({ length: cols }, (_, c) => (row[c] ? 1 : 0)));
  }
  return st;
}

export function loadState() {
  const txt = safeGet(KEY);
  if (!txt) return defaultState();
  try { return normalise(JSON.parse(txt)); } catch (e) { return defaultState(); }
}

let saveTimer = 0;
export function saveState(st) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => safeSet(KEY, JSON.stringify(st)), 400);
}

export function loadUserPresets() {
  try { return JSON.parse(safeGet(PKEY) || '{}') || {}; } catch (e) { return {}; }
}

export function saveUserPresets(p) { safeSet(PKEY, JSON.stringify(p)); }
