// Species library, parameter definitions and tuning.
// The decay numbers are plausible ballparks for temperate leaf litter,
// chosen for musical range rather than fitted to any one study.

export const ENGINES = [
  { id: 'bell', label: 'Bell', character: 'Ratio', body: 'Feedback' },
  { id: 'pluck', label: 'Pluck', character: 'Ring', body: 'Bowing' },
  { id: 'rustle', label: 'Rustle', character: 'Spread', body: 'Resonance' },
  { id: 'glass', label: 'Glass', character: 'Stretch', body: 'Partials' },
  { id: 'wood', label: 'Wood', character: 'Bar–drum', body: 'Ring' },
  { id: 'drone', label: 'Drone', character: 'Detune', body: 'Sub' },
  { id: 'grain', label: 'Grain', character: 'Density', body: 'Size' },
  { id: 'sample', label: 'Sample', character: 'Position', body: 'Grain size' }
];

export const TAILS = [
  { id: 'none', label: 'None' },
  { id: 'sub', label: 'Sub' },
  { id: 'earth', label: 'Earth' },
  { id: 'metal', label: 'Metal' }
];

// Parameter definitions drive the editor. Groups appear in this order.
export const SPECIES_PARAMS = [
  { group: 'Envelope', items: [
    { key: 'fall', label: 'Attack', min: 0, max: 6, step: 0.1, unit: 'mo', hint: 'Leaf fall: how long the litter takes to build up' },
    { key: 'soluble', label: 'Soluble', min: 0, max: 45, step: 1, unit: '%', hint: 'The part that washes out first' },
    { key: 'leach', label: 'Leach rate', min: 2, max: 60, step: 0.5, unit: '/yr' },
    { key: 'lag', label: 'Lag', min: 0, max: 10, step: 0.1, unit: 'mo', hint: 'Sustain: microbes colonising' },
    { key: 'kc', label: 'Cellulose k', min: 0.1, max: 6, step: 0.05, unit: '/yr', hint: 'Release speed' },
    { key: 'lignin', label: 'Lignin', min: 0, max: 60, step: 1, unit: '%', hint: 'The tough part that lingers' },
    { key: 'kr', label: 'Lignin k', min: 0.01, max: 0.8, step: 0.01, unit: '/yr', hint: 'Tail speed' }
  ] },
  { group: 'Sound', items: [
    { key: 'character', label: 'Character', min: 0, max: 1, step: 0.01, engineLabel: 'character' },
    { key: 'body', label: 'Body', min: 0, max: 1, step: 0.01, engineLabel: 'body' },
    { key: 'brightness', label: 'Brightness', min: 0, max: 1, step: 0.01 },
    { key: 'tone', label: 'Tone', min: 200, max: 16000, step: 1, log: true, unit: 'Hz' },
    { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01 },
    { key: 'impact', label: 'Crunch', min: 0, max: 1, step: 0.01, hint: 'The landing sound' },
    { key: 'tailLevel', label: 'Tail', min: 0, max: 1, step: 0.01 },
    { key: 'level', label: 'Level', min: 0, max: 1, step: 0.01 },
    { key: 'send', label: 'Reverb', min: 0, max: 1, step: 0.01 }
  ] },
  { group: 'Pitch', items: [
    { key: 'degree', label: 'Note', min: 0, max: 15, step: 1, int: true, stepper: true },
    { key: 'octave', label: 'Octave', min: -1, max: 4, step: 1, int: true, stepper: true },
    { key: 'wander', label: 'Wander', min: 0, max: 1, step: 0.01, hint: 'Chance a leaf lands on a neighbouring note' },
    { key: 'scatter', label: 'Scatter', min: 0, max: 50, step: 1, unit: 'ct' },
    { key: 'sag', label: 'Sag', min: 0, max: 7, step: 0.1, unit: 'st', hint: 'Pitch drop as the leaf decays' }
  ] },
  { group: 'Leaf', items: [
    { key: 'loose', label: 'Looseness', min: 0.05, max: 2.5, step: 0.05, hint: 'How easily the wind takes it' },
    { key: 'fallTime', label: 'Fall time', min: 0.6, max: 6, step: 0.1, unit: 's' },
    { key: 'sizeVar', label: 'Size spread', min: 0, max: 1, step: 0.01, hint: 'Bigger leaves sit a little lower and louder' },
    { key: 'waterVar', label: 'Water spread', min: 0, max: 1, step: 0.01, hint: 'Wetter leaves are brighter and decay faster' },
    { key: 'panSpread', label: 'Stereo', min: 0, max: 1, step: 0.01 }
  ] }
];

const COMMON = {
  brightness: 0.7, tone: 9000, drive: 0.1, impact: 0.35, tailLevel: 0.4, level: 0.8, send: 0.35,
  wander: 0.12, scatter: 6, sag: 0.4, sizeVar: 0.3, waterVar: 0.3, panSpread: 0.6
};

export const LIBRARY = {
  linden: { name: 'Linden', shape: 'heart', color: '#2A78D6', engine: 'bell', tail: 'sub', character: 0.25, body: 0.2, brightness: 0.8,
    soluble: 25, lignin: 10, leach: 15, lag: 1, kc: 3.0, kr: 0.3, fall: 1, loose: 1.0, fallTime: 2.2 },
  ash: { name: 'Ash', shape: 'lance', color: '#EB6834', engine: 'pluck', tail: 'earth', character: 0.45, body: 0.25,
    soluble: 20, lignin: 14, leach: 15, lag: 1.5, kc: 2.2, kr: 0.22, fall: 1.5, loose: 0.85, fallTime: 1.8 },
  birch: { name: 'Birch', shape: 'ovate', color: '#1BAF7A', engine: 'rustle', tail: 'sub', tailLevel: 0.25, character: 0.3, body: 0.55, brightness: 0.75,
    soluble: 18, lignin: 16, leach: 15, lag: 2, kc: 1.8, kr: 0.18, fall: 2, loose: 0.7, fallTime: 2.4 },
  maple: { name: 'Maple', shape: 'palmate', color: '#EDA100', engine: 'glass', tail: 'metal', tailLevel: 0.3, character: 0.35, body: 0.6,
    soluble: 15, lignin: 20, leach: 15, lag: 2.5, kc: 1.3, kr: 0.15, fall: 2, loose: 0.6, fallTime: 2.8 },
  oak: { name: 'Oak', shape: 'lobed', color: '#E87BA4', engine: 'wood', tail: 'earth', tailLevel: 0.5, character: 0.2, body: 0.5, brightness: 0.55,
    soluble: 12, lignin: 25, leach: 12, lag: 3, kc: 0.9, kr: 0.12, fall: 3, loose: 0.4, fallTime: 1.6 },
  pine: { name: 'Pine', shape: 'needle', color: '#6250D6', engine: 'drone', tail: 'sub', tailLevel: 0.6, character: 0.5, body: 0.5, brightness: 0.35, send: 0.5,
    soluble: 10, lignin: 30, leach: 10, lag: 5, kc: 0.5, kr: 0.08, fall: 3, loose: 0.3, fallTime: 3.0 },
  beech: { name: 'Beech', shape: 'ovate', color: '#B07A3E', engine: 'wood', tail: 'metal', tailLevel: 0.35, character: 0.6, body: 0.75, brightness: 0.6,
    soluble: 10, lignin: 28, leach: 10, lag: 4, kc: 0.7, kr: 0.1, fall: 2.5, loose: 0.35, fallTime: 2.0 },
  willow: { name: 'Willow', shape: 'willow', color: '#5A9E2E', engine: 'grain', tail: 'none', character: 0.5, body: 0.35, brightness: 0.75,
    soluble: 26, lignin: 8, leach: 18, lag: 0.5, kc: 3.2, kr: 0.35, fall: 1, loose: 1.1, fallTime: 2.6 },
  ginkgo: { name: 'Ginkgo', shape: 'fan', color: '#D9B21F', engine: 'glass', tail: 'sub', tailLevel: 0.3, character: 0.8, body: 0.8, brightness: 0.85,
    soluble: 22, lignin: 12, leach: 15, lag: 1, kc: 2.6, kr: 0.25, fall: 0.5, loose: 0.5, fallTime: 2.4 },
  chestnut: { name: 'Chestnut', shape: 'serrate', color: '#C4502A', engine: 'pluck', tail: 'earth', tailLevel: 0.45, character: 0.7, body: 0.65, brightness: 0.6,
    soluble: 14, lignin: 22, leach: 12, lag: 3, kc: 1.0, kr: 0.12, fall: 2.5, loose: 0.45, fallTime: 2.0 },
  poplar: { name: 'Poplar', shape: 'heart', color: '#2FA3C4', engine: 'rustle', tail: 'none', character: 0.6, body: 0.3, brightness: 0.8,
    soluble: 20, lignin: 14, leach: 15, lag: 1.5, kc: 2.0, kr: 0.2, fall: 1.5, loose: 1.2, fallTime: 2.5 },
  rowan: { name: 'Rowan', shape: 'lance', color: '#D9403F', engine: 'bell', tail: 'metal', tailLevel: 0.25, character: 0.55, body: 0.45,
    soluble: 22, lignin: 12, leach: 15, lag: 1, kc: 2.4, kr: 0.25, fall: 1, loose: 0.8, fallTime: 2.0 }
};

export function speciesDefaults(type) {
  const s = LIBRARY[type] || LIBRARY.linden;
  const { name, shape, color, ...rest } = s;
  return { type, ...COMMON, ...rest };
}

export const SCALES = {
  'Minor pentatonic': [0, 3, 5, 7, 10],
  'Major pentatonic': [0, 2, 4, 7, 9],
  'In-sen': [0, 1, 5, 7, 10],
  'Dorian': [0, 2, 3, 5, 7, 9, 10],
  'Aeolian': [0, 2, 3, 5, 7, 8, 10],
  'Lydian': [0, 2, 4, 6, 7, 9, 11],
  'Whole tone': [0, 2, 4, 6, 8, 10],
  'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  'Harmonic series': null
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(midi) { return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }

// Frequency for a scale degree and octave above the root
export function degreeFreq(rootMidi, scaleName, degree, octave) {
  const rootHz = 440 * Math.pow(2, (rootMidi - 69) / 12);
  const scale = SCALES[scaleName];
  if (!scale) return rootHz * (Math.max(0, degree) + 1) * Math.pow(2, octave); // harmonic series
  const len = scale.length;
  const d = Math.floor(degree);
  const wrap = Math.floor(d / len);
  const idx = ((d % len) + len) % len;
  return rootHz * Math.pow(2, (scale[idx] + 12 * (wrap + octave)) / 12);
}

// The staged decay model, sampled for drawing. Same equations as the worklet.
export function stagedCurve(p, years = 4, steps = 200, temp = 10) {
  const q = Math.pow(2, (temp - 10) / 10);
  const s = p.soluble / 100, g = Math.min(p.lignin / 100, 0.98 - s), c = Math.max(0.02, 1 - s - g);
  const tl = p.lag / 12, w = 0.03 + tl * 0.08, ta = p.fall / 12;
  let L = s, C = c, R = g;
  const out = { L: [], C: [], R: [], att: [] };
  const dt = years / steps;
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const x = ta > 0 ? Math.min(1, t / ta) : 1;
    out.att.push(x * x * (3 - 2 * x));
    out.L.push(L); out.C.push(C); out.R.push(R);
    const a = tl <= 0 ? 1 : 1 / (1 + Math.exp(-(t - tl) / w));
    L *= Math.exp(-p.leach * q * dt);
    C *= Math.exp(-p.kc * q * a * dt);
    R *= Math.exp(-p.kr * q * dt);
  }
  return out;
}

export function halfLife(p, temp = 10) {
  const c = stagedCurve(p, 12, 1200, temp);
  for (let i = 0; i < c.L.length; i++) if (c.L[i] + c.C[i] + c.R[i] <= 0.5) return (i / 1200) * 12;
  return null;
}
