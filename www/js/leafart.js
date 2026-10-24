// Leaf drawings. Each species is drawn once, in detail, to small offscreen
// sprites: the fresh leaf, its paler underside, four browning stages with more
// and more holes eaten through, and the vein skeleton left at the end.
// The scene stacks these to show a leaf decaying.

const S = 160;            // sprite size in pixels
const U = S / 2.7;        // pixels per leaf unit (a leaf runs from x = -1 to 1)
const AUTUMN = [122, 82, 48];
const DARK = [58, 40, 26];

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function css(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

// ---- outlines ----
// A simple blade along the midrib: width profile, toothed or lobed margin, optional heart base.
function blade(o) {
  const N = 180, up = [], lo = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let w = o.W * Math.pow(Math.sin(Math.PI * Math.pow(u, o.k)), o.e);
    let m = 1;
    if (o.lobes && u > 0.08 && u < 0.97) m *= (1 - o.lobes.d) + o.lobes.d * Math.pow(Math.abs(Math.sin(Math.PI * o.lobes.n * u)), 0.55);
    if (o.teeth && u > 0.06 && u < 0.985) {
      const f = (u * o.teeth.n) % 1;
      m *= 1 - o.teeth.d * f;
      if (o.teeth.n2) m *= 1 - (o.teeth.d2 || 0.03) * ((u * o.teeth.n2) % 1);
    }
    let x = -1 + 2 * u;
    if (o.cord) x -= o.cord * 0.5 * Math.sin(Math.PI * Math.min(u / 0.32, 1));
    up.push([x, -w * m]);
    lo.push([x, w * m * (1 + (o.asym || 0))]);
  }
  return { pts: up.concat(lo.reverse()), W: o.W, k: o.k, e: o.e, cord: o.cord || 0, lobes: o.lobes };
}

function bladeWidth(o, u) { return o.W * Math.pow(Math.sin(Math.PI * Math.pow(u, o.k)), o.e); }

// Palmate (maple): a radius around a centre, with five pointed, toothed lobes
function palmate() {
  const c = [-0.32, 0], pts = [];
  const lobes = [[0, 1], [0.92, 0.86], [-0.92, 0.86], [1.85, 0.52], [-1.85, 0.52]];
  for (let i = 0; i <= 360; i++) {
    const th = -Math.PI + (i / 360) * Math.PI * 2;
    let r = 0.3;
    for (const [a, amp] of lobes) { const d = th - a; r += amp * Math.exp(-(d * d) / (2 * 0.24 * 0.24)) * 0.82; }
    if (r > 0.45) r *= 1 - 0.07 * ((Math.abs(th) * 14) % 1);
    if (Math.abs(th) > 2.75) r = Math.min(r, 0.12);
    pts.push([c[0] + Math.cos(th) * r * 1.18, c[1] + Math.sin(th) * r * 1.18]);
  }
  return { pts, c, lobes };
}

// Heart (linden, poplar): broad, pointed tip, notched base where the stem joins
function heart(o) {
  const c = [-0.2, 0], pts = [];
  const R = (th) => {
    let r = o.r0 + o.c1 * Math.cos(th) + o.tip * Math.exp(-(th * th) / (2 * 0.24 * 0.24))
      - o.notch * Math.exp(-((Math.abs(th) - Math.PI) ** 2) / (2 * 0.2 * 0.2));
    if (o.teeth) r *= 1 - o.teeth * ((Math.abs(th) * 9) % 1) * (Math.abs(th) < 2.9 ? 1 : 0);
    return r;
  };
  for (let i = 0; i <= 360; i++) {
    const th = -Math.PI + (i / 360) * Math.PI * 2, r = R(th);
    pts.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r * o.sq * (th > 0 ? 1 + (o.asym || 0) : 1)]);
  }
  const sinus = [c[0] - R(Math.PI), 0], tipP = [c[0] + R(0), 0];
  return { pts, c, R, sinus, tipP, o };
}

// Fan (ginkgo): spreads from the stem, notched in the middle, wavy edge
function fan() {
  const b = [-0.8, 0], pts = [b];
  for (let i = 0; i <= 200; i++) {
    const th = -1.05 + (i / 200) * 2.1;
    const r = 1.32 * (1 - 0.26 * Math.exp(-(th * th) / 0.004)) * (1 + 0.025 * Math.sin(th * 34));
    pts.push([b[0] + Math.cos(th) * r, b[1] + Math.sin(th) * r]);
  }
  pts.push(b);
  return { pts, b };
}

const SPECIES = {
  linden: { kind: 'heart', o: { r0: 0.72, c1: 0.1, tip: 0.3, notch: 0.28, sq: 0.95, asym: 0.1, teeth: 0.035 } },
  poplar: { kind: 'heart', o: { r0: 0.72, c1: -0.05, tip: 0.36, notch: 0.12, sq: 0.92, teeth: 0.03 } },
  birch: { kind: 'blade', o: { W: 0.52, k: 0.72, e: 0.85, teeth: { n: 13, d: 0.08, n2: 39, d2: 0.025 } }, veins: 'pinnate', pairs: 8 },
  beech: { kind: 'blade', o: { W: 0.46, k: 0.85, e: 0.8, lobes: { n: 9, d: 0.06 } }, veins: 'straight', pairs: 9 },
  oak: { kind: 'blade', o: { W: 0.5, k: 1.4, e: 0.75, lobes: { n: 4.5, d: 0.5 } }, veins: 'lobes', pairs: 5 },
  chestnut: { kind: 'blade', o: { W: 0.3, k: 1, e: 0.9, teeth: { n: 19, d: 0.14 } }, veins: 'straight', pairs: 17 },
  willow: { kind: 'blade', o: { W: 0.17, k: 1, e: 0.9, teeth: { n: 34, d: 0.03 } }, veins: 'pinnate', pairs: 12 },
  maple: { kind: 'palmate' },
  ginkgo: { kind: 'fan' },
  ash: { kind: 'pinnate', pairs: 3, leaf: { W: 0.16, k: 0.95, e: 0.9, teeth: { n: 10, d: 0.05 } }, size: 0.42 },
  rowan: { kind: 'pinnate', pairs: 4, leaf: { W: 0.15, k: 1, e: 0.9, teeth: { n: 12, d: 0.12 } }, size: 0.34 },
  pine: { kind: 'needle' }
};

function trace(g, pts, close = true) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0] * U, p[1] * U) : g.moveTo(p[0] * U, p[1] * U)));
  if (close) g.closePath();
}

// Shape plus vein paths for a species, in leaf units
function geometry(type) {
  const sp = SPECIES[type] || SPECIES.linden;
  const shapes = [];    // filled outlines
  const veins = [];     // [points, width] main and secondary veins
  const fine = [];      // tertiary network
  const stem = [[-1.28, 0.02], [-1, 0]];
  const r = rng(type.length * 977 + type.charCodeAt(0));
  if (sp.kind === 'blade') {
    const b = blade(sp.o);
    shapes.push(b.pts);
    veins.push([[[-1, 0], [0.97, 0]], 1.7]);
    const pairs = sp.pairs || 6;
    if (sp.veins === 'palmate3') {
      for (const s of [-1, 1]) {
        veins.push([[[-0.9, 0], [-0.55, s * 0.32], [-0.15, s * 0.55]], 1.1]);
        veins.push([[[-0.92, 0], [-0.9, s * 0.35], [-0.78, s * 0.55]], 0.8]);
      }
      for (let i = 1; i <= 4; i++) {
        const u = 0.35 + i * 0.13;
        for (const s of [-1, 1]) {
          const x = -1 + 2 * u, w = bladeWidth(sp.o, Math.min(0.99, u + 0.08)) * 0.88;
          veins.push([[[x, 0], [x + 0.12, s * w * 0.6], [x + 0.24, s * w]], 0.8]);
        }
      }
    } else {
      for (let i = 1; i <= pairs; i++) {
        const u = 0.08 + (i / (pairs + 1)) * 0.86;
        for (const s of [-1, 1]) {
          const x = -1 + 2 * u;
          const reach = sp.veins === 'straight' ? 0.22 : 0.3;
          const u2 = Math.min(0.99, u + reach / 2);
          let w = bladeWidth(sp.o, u2) * (sp.veins === 'lobes' ? 1 : 0.9);
          if (sp.o.lobes && sp.veins === 'lobes') {
            // aim at the nearest lobe tip
            const n = sp.o.lobes.n, k = Math.round(u * n - 0.5) + 0.5, ul = Math.min(0.97, Math.max(0.12, k / n));
            const xl = -1 + 2 * ul, wl = bladeWidth(sp.o, ul) * 0.95;
            veins.push([[[x, 0], [(x + xl) / 2, s * wl * 0.45], [xl, s * wl]], 0.9]);
            continue;
          }
          const mid = sp.veins === 'straight' ? [x + reach * 0.5, s * w * 0.5] : [x + reach * 0.25, s * w * 0.62];
          veins.push([[[x, 0], mid, [x + reach, s * w]], sp.veins === 'straight' ? 0.75 : 0.85]);
        }
      }
    }
    // tertiary net: short crossing lines inside the blade
    for (let i = 0; i < 90; i++) {
      const u = 0.06 + r() * 0.9, x = -1 + 2 * u, w = bladeWidth(sp.o, u) * 0.85;
      const y = (r() * 2 - 1) * w, a = r() * Math.PI;
      fine.push([[x, y], [x + Math.cos(a) * 0.09, y + Math.sin(a) * 0.09]]);
    }
  } else if (sp.kind === 'heart') {
    const h = heart(sp.o);
    shapes.push(h.pts);
    stem[1] = h.sinus; stem[0] = [h.sinus[0] - 0.3, 0.03];
    veins.push([[h.sinus, h.tipP], 1.6]);
    for (const sgn of [-1, 1]) {
      // two strong veins from the base, then pinnate ones off the midrib
      const th2 = sgn * 2.0, end = [h.c[0] + Math.cos(th2) * h.R(th2) * 0.85, Math.sin(th2) * h.R(th2) * 0.85 * sp.o.sq];
      veins.push([[h.sinus, [h.sinus[0] + 0.1, end[1] * 0.75], end], 1.1]);
      for (let k = 1; k <= 4; k++) {
        const f = k / 5, x = h.sinus[0] + (h.tipP[0] - h.sinus[0]) * f;
        const th = sgn * (0.45 + 0.75 * (1 - f));
        const ex = [h.c[0] + Math.cos(th) * h.R(th) * 0.9, Math.sin(th) * h.R(th) * 0.9 * sp.o.sq];
        veins.push([[[x, 0], [x + (ex[0] - x) * 0.4, ex[1] * 0.55], ex], 0.8]);
      }
    }
    for (let i = 0; i < 110; i++) {
      const th = r() * Math.PI * 2, rr = r() * 0.85 * h.R(th);
      const x = h.c[0] + Math.cos(th) * rr, y = Math.sin(th) * rr * sp.o.sq, a = r() * Math.PI;
      fine.push([[x, y], [x + Math.cos(a) * 0.08, y + Math.sin(a) * 0.08]]);
    }
  } else if (sp.kind === 'palmate') {
    const p = palmate();
    shapes.push(p.pts);
    stem[1] = [-0.4, 0]; stem[0] = [-1.3, 0.03];
    for (const [a, amp] of p.lobes) {
      const tip = [p.c[0] + Math.cos(a) * (0.3 + amp * 0.82) * 1.12, p.c[1] + Math.sin(a) * (0.3 + amp * 0.82) * 1.12];
      veins.push([[p.c, [p.c[0] + (tip[0] - p.c[0]) * 0.5, p.c[1] + (tip[1] - p.c[1]) * 0.5], tip], a === 0 ? 1.6 : 1.2]);
      for (let k = 1; k <= 3; k++) {
        const f = k / 4.2, px = p.c[0] + (tip[0] - p.c[0]) * f, py = p.c[1] + (tip[1] - p.c[1]) * f;
        for (const s of [-1, 1]) {
          const b = a + s * 0.75, l = 0.22 * amp * (1.1 - f * 0.5);
          veins.push([[[px, py], [px + Math.cos(b) * l, py + Math.sin(b) * l]], 0.7]);
        }
      }
    }
    for (let i = 0; i < 110; i++) {
      const th = r() * Math.PI * 2, rr = r() * 0.95;
      const x = p.c[0] + Math.cos(th) * rr, y = p.c[1] + Math.sin(th) * rr, a = r() * Math.PI;
      fine.push([[x, y], [x + Math.cos(a) * 0.08, y + Math.sin(a) * 0.08]]);
    }
  } else if (sp.kind === 'fan') {
    const f = fan();
    shapes.push(f.pts);
    stem[1] = [-0.8, 0]; stem[0] = [-1.25, 0.03];
    for (let i = 0; i < 18; i++) {
      const th = -0.98 + (i / 17) * 1.96, rr = 1.22 * (1 - 0.24 * Math.exp(-(th * th) / 0.004));
      const mid = [f.b[0] + Math.cos(th) * rr * 0.45, f.b[1] + Math.sin(th) * rr * 0.45];
      veins.push([[f.b, mid], 0.75]);
      for (const s of [-0.04, 0.04]) veins.push([[mid, [f.b[0] + Math.cos(th + s) * rr * 0.97, f.b[1] + Math.sin(th + s) * rr * 0.97]], 0.55]);
    }
  } else if (sp.kind === 'pinnate') {
    stem[1] = [-1, 0];
    veins.push([[[-1, 0], [1.02, 0]], 1.3]);
    const pairs = sp.pairs;
    const lb = blade(sp.leaf);
    const place = (cx0, cy0, ang, sc) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const tf = (p) => [cx0 + (p[0] + 1) * sc * ca / 1 * 0.5 - p[1] * sc * sa * 0.5, cy0 + (p[0] + 1) * sc * sa * 0.5 + p[1] * sc * ca * 0.5];
      shapes.push(lb.pts.map(tf));
      veins.push([[tf([-1, 0]), tf([0.95, 0])], 0.8]);
      for (let i = 1; i <= 4; i++) {
        const u = i / 5, x = -1 + 2 * u, w = bladeWidth(sp.leaf, Math.min(0.99, u + 0.1)) * 0.85;
        for (const s of [-1, 1]) veins.push([[tf([x, 0]), tf([x + 0.3, s * w])], 0.45]);
      }
    };
    for (let i = 0; i < pairs; i++) {
      const x = -0.75 + (i / pairs) * 1.45;
      place(x, 0, -0.95, sp.size * 2);
      place(x, 0, 0.95, sp.size * 2);
    }
    place(1.25 - sp.size * 2, 0, 0, sp.size * 2);
  } else if (sp.kind === 'needle') {
    stem[0] = [-1.12, 0]; stem[1] = [-0.95, 0];
    for (const a of [-0.07, 0.07]) {
      const ca = Math.cos(a), sa = Math.sin(a), pts = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40, w = 0.06 * Math.pow(1 - t, 0.3); pts.push([-0.95 + t * 2 * ca, t * 2 * sa - w]); }
      for (let i = 40; i >= 0; i--) { const t = i / 40, w = 0.06 * Math.pow(1 - t, 0.3); pts.push([-0.95 + t * 2 * ca, t * 2 * sa + w]); }
      shapes.push(pts);
      veins.push([[[-0.95, 0], [-0.95 + 1.9 * ca, 1.9 * sa]], 0.5]);
    }
  }
  return { shapes, veins, fine, stem, kind: sp.kind };
}

function drawVeins(g, geo, col, scale = 1, alpha = 1) {
  g.strokeStyle = css(col, alpha); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [pts, w] of geo.veins) {
    g.lineWidth = w * scale;
    g.beginPath();
    if (pts.length === 3) { g.moveTo(pts[0][0] * U, pts[0][1] * U); g.quadraticCurveTo(pts[1][0] * U, pts[1][1] * U, pts[2][0] * U, pts[2][1] * U); }
    else { g.moveTo(pts[0][0] * U, pts[0][1] * U); g.lineTo(pts[1][0] * U, pts[1][1] * U); }
    g.stroke();
  }
}

function clipShapes(g, geo) {
  g.beginPath();
  for (const s of geo.shapes) {
    s.forEach((p, i) => (i ? g.lineTo(p[0] * U, p[1] * U) : g.moveTo(p[0] * U, p[1] * U)));
    g.closePath();
  }
  g.clip();
}

function canvas() {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  return [c, g];
}

function drawStem(g, geo, col) {
  g.strokeStyle = css(col); g.lineCap = 'round'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(geo.stem[0][0] * U, geo.stem[0][1] * U); g.lineTo(geo.stem[1][0] * U, geo.stem[1][1] * U); g.stroke();
}

// Painted blade: soft light from above, a darker rim, faint speckle, veins
function paintBlade(g, geo, base, opts) {
  const r = rng(opts.seed);
  const light = mix(base, [255, 255, 255], opts.lift), shade = mix(base, [0, 0, 0], 0.22);
  g.save();
  clipShapes(g, geo);
  const gr = g.createLinearGradient(-0.3 * U, -1 * U, 0.3 * U, 1 * U);
  gr.addColorStop(0, css(light)); gr.addColorStop(0.55, css(base)); gr.addColorStop(1, css(shade));
  g.fillStyle = gr; g.fillRect(-S / 2, -S / 2, S, S);
  // speckle and mottling
  for (let i = 0; i < 260; i++) {
    const x = (r() - 0.5) * S, y = (r() - 0.5) * S, rad = 0.5 + r() * 1.4;
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  for (const [x0, y0, rr, a] of opts.blotches || []) {
    const bg = g.createRadialGradient(x0 * U, y0 * U, 0, x0 * U, y0 * U, rr * U);
    bg.addColorStop(0, css(opts.blotchCol, a)); bg.addColorStop(1, css(opts.blotchCol, 0));
    g.fillStyle = bg; g.fillRect(-S / 2, -S / 2, S, S);
  }
  // fine network, then the main veins
  g.strokeStyle = css(opts.veinCol, 0.18); g.lineWidth = 0.5;
  for (const [a, b] of geo.fine) { g.beginPath(); g.moveTo(a[0] * U, a[1] * U); g.lineTo(b[0] * U, b[1] * U); g.stroke(); }
  drawVeins(g, geo, opts.veinCol, 1, opts.veinA);
  g.restore();
  // rim
  g.strokeStyle = css(shade, 0.55); g.lineWidth = 0.9;
  for (const s of geo.shapes) { trace(g, s); g.stroke(); }
}

const cache = new Map();

export function leafSprites(type, color) {
  const key = type + color;
  if (cache.has(key)) return cache.get(key);
  const geo = geometry(type);
  const base = hex(color);
  const r = rng(type.length * 131 + 7);
  const out = { unit: U, size: S };

  // fresh
  {
    const [c, g] = canvas();
    drawStem(g, geo, mix(base, DARK, 0.45));
    paintBlade(g, geo, base, { seed: 11, lift: 0.28, veinCol: mix(base, [255, 255, 255], 0.45), veinA: 0.85 });
    out.fresh = c;
  }
  // underside: paler, veins raised
  {
    const [c, g] = canvas();
    const pale = mix(base, [235, 235, 225], 0.35);
    drawStem(g, geo, mix(base, DARK, 0.35));
    paintBlade(g, geo, pale, { seed: 12, lift: 0.15, veinCol: mix(pale, [255, 255, 255], 0.55), veinA: 1 });
    drawVeins(g, geo, mix(pale, [0, 0, 0], 0.15), 0.35, 0.5);
    out.under = c;
  }
  // browning, with holes eaten through in later stages
  const blotches = [];
  for (let i = 0; i < 7; i++) blotches.push([(r() * 2 - 1) * 0.75, (r() * 2 - 1) * 0.35, 0.12 + r() * 0.18, 0.35 + r() * 0.3]);
  out.brown = [];
  const holes = [];
  for (let i = 0; i < 60; i++) holes.push([(r() * 2 - 1) * 0.95, (r() * 2 - 1) * 0.6, 0.02 + r() * 0.07]);
  for (let st = 0; st < 4; st++) {
    const [c, g] = canvas();
    const tone = mix(mix(base, AUTUMN, 0.7 + st * 0.08), DARK, st * 0.07);
    drawStem(g, geo, mix(tone, DARK, 0.4));
    paintBlade(g, geo, tone, { seed: 20 + st, lift: 0.12, veinCol: mix(tone, DARK, 0.35), veinA: 0.9, blotches: blotches.slice(0, 2 + st * 2), blotchCol: DARK });
    if (st > 0) {
      g.globalCompositeOperation = 'destination-out';
      const n = [0, 10, 26, 60][st];
      for (let i = 0; i < n; i++) {
        const [x, y, rad] = holes[i];
        g.beginPath();
        for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2, rr = rad * (0.7 + 0.6 * r()) * (1 + st * 0.35); g.lineTo((x + Math.cos(a) * rr) * U, (y + Math.sin(a) * rr * 0.8) * U); }
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    out.brown.push(c);
  }
  // skeleton: just the veins and a ghost of the outline
  {
    const [c, g] = canvas();
    const v = mix(base, [176, 146, 110], 0.7);
    drawStem(g, geo, v);
    g.save(); clipShapes(g, geo);
    g.strokeStyle = css(v, 0.45); g.lineWidth = 0.6;
    for (const [a, b] of geo.fine) { g.beginPath(); g.moveTo(a[0] * U, a[1] * U); g.lineTo(b[0] * U, b[1] * U); g.stroke(); }
    g.restore();
    drawVeins(g, geo, v, 1.4, 1);
    g.strokeStyle = css(v, 0.25); g.lineWidth = 0.6;
    for (const s of geo.shapes) { trace(g, s); g.stroke(); }
    out.skeleton = c;
  }
  cache.set(key, out);
  return out;
}

// Draw one leaf. len is half the leaf's length in CSS pixels.
// state: { tumble (-1..1 squash, negative shows the underside), soft, brown, veins, alpha }
export function drawLeafArt(cx, type, color, x, y, rot, len, state = {}) {
  const sp = leafSprites(type, color);
  const k = len / sp.unit;
  const tumble = state.tumble === undefined ? 1 : state.tumble;
  cx.save();
  cx.translate(x, y); cx.rotate(rot); cx.scale(k, k * Math.max(0.12, Math.abs(tumble)));
  const o = -sp.size / 2;
  const alpha = state.alpha === undefined ? 1 : state.alpha;
  if (state.soft === undefined) {
    cx.globalAlpha = alpha;
    cx.drawImage(tumble < 0 ? sp.under : sp.fresh, o, o);
  } else {
    const soft = state.soft, brown = state.brown || 0, veins = state.veins || 0;
    if (veins > 0.02) { cx.globalAlpha = Math.min(1, veins) * alpha; cx.drawImage(sp.skeleton, o, o); }
    // tissue: fresh fades into brown, then holes open as the soft parts go
    const stage = soft > 0.7 ? 0 : soft > 0.45 ? 1 : soft > 0.22 ? 2 : 3;
    const tissueA = stage === 3 ? soft / 0.22 : 1;
    if (brown < 0.98 && stage === 0) { cx.globalAlpha = (1 - brown) * alpha; cx.drawImage(sp.fresh, o, o); }
    cx.globalAlpha = Math.min(1, (stage === 0 ? brown : 1) * tissueA) * alpha;
    if (cx.globalAlpha > 0.01) cx.drawImage(sp.brown[stage], o, o);
  }
  cx.restore();
}
