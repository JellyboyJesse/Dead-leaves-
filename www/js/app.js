import { AudioEngine, encodeWav, toMono } from './audio.js';
import { putSample, getSample, deleteSample, newKey } from './samples.js';
import { Forest } from './forest.js';
import { Scene } from './scene.js';
import { UI } from './ui.js';
import { loadState, saveState, normalise } from './state.js';

class App {
  constructor() {
    this.state = loadState();
    this.audio = new AudioEngine();
    this.forest = new Forest(this.state, this.audio);
    this.scene = new Scene(document.getElementById('scene'), this.forest, this.audio);
    this.ui = new UI(this);
    this.playBtn = document.getElementById('play');
    this.statusEl = document.getElementById('status');
    this.errEl = document.getElementById('audio-error');
    this.wakeLock = null;
    this.takes = [];
    this.takeCount = 0;
    this.recBtn = document.getElementById('record');
    this.recLabel = document.getElementById('rec-label');
    this.forest.onLand = (l) => this.ui.landed(l);
    this.audio.onState = () => this.audio.updateDamping();
  }

  init() {
    this.ui.build();
    this.ui.showTab('tree');
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.recBtn.addEventListener('click', () => this.toggleRecord());
    document.getElementById('rain').addEventListener('click', () => this.withAudio(() => this.forest.startRain(10)));
    document.getElementById('gust').addEventListener('click', () => this.withAudio(() => this.forest.gustNow(1.4)));
    document.getElementById('panic').addEventListener('click', () => { this.audio.panic(); this.forest.clearGround(); });
    const cv = document.getElementById('scene');
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect();
      const hit = this.scene.hit(e.clientX - r.left, e.clientY - r.top);
      this.withAudio(() => { if (hit) this.forest.release(hit.r, hit.c, false); else this.forest.gustNow(1); });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.forest.playing) this.requestWakeLock();
    });
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      this.forest.update(dt);
      this.scene.frame(t / 1000, dt);
      this.ui.updateGrid();
      this.updateStatus();
      this.updateRecLabel();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async ensureAudio() {
    try {
      const fresh = !this.audio.ready;
      await this.audio.start();
      this.audio.setGlobals(this.state.globals);
      if (fresh) this.restoreSamples();
      this.errEl.hidden = true;
      return true;
    } catch (e) {
      this.errEl.textContent = 'Sound could not start. ' + (e && e.message ? e.message : '');
      this.errEl.hidden = false;
      return false;
    }
  }

  async withAudio(fn) {
    if (!this.audio.ready && !(await this.ensureAudio())) return;
    if (!this.forest.playing) await this.play();
    fn();
  }

  async play() {
    if (!(await this.ensureAudio())) return;
    this.forest.playing = true;
    this.forest.gustNext = this.audio.now + 2.5;
    if (this.state.globals.seasons && !this.seasonStarted) this.seasonsChanged();
    this.setPlayButton(true);
    this.requestWakeLock();
  }

  stop() {
    this.forest.playing = false;
    this.audio.panic();
    this.forest.leaves = [];
    this.setPlayButton(false);
    if (this.wakeLock) { this.wakeLock.release().catch(() => {}); this.wakeLock = null; }
  }

  setPlayButton(on) {
    this.playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.playBtn.setAttribute('aria-label', on ? 'Stop' : 'Play');
    this.playBtn.querySelector('.play-label').textContent = on ? 'Stop' : 'Play';
  }

  togglePlay() { if (this.forest.playing) this.stop(); else this.play(); }

  async requestWakeLock() {
    try { if (navigator.wakeLock) this.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed here */ }
  }

  audition(r) { this.withAudio(() => this.forest.audition(r)); }

  changed() {
    this.audio.setGlobals(this.state.globals);
    saveState(this.state);
  }

  resizeColumns(cols) {
    const g = this.state.grid;
    for (let r = 0; r < 6; r++) {
      const row = g[r];
      while (row.length < cols) row.push(0);
      row.length = cols;
    }
    this.forest.syncSites();
    this.ui.buildGrid();
  }

  load(st) {
    const fresh = normalise(st);
    this.state.globals = fresh.globals;
    this.state.slots = fresh.slots;
    this.state.grid = fresh.grid;
    this.forest.syncSites();
    this.ui.refreshAll();
    this.changed();
    if (this.audio.ready) this.restoreSamples();
    if (this.state.globals.seasons) this.seasonsChanged(); else { this.audio.tempOverride = null; this.forest.season = null; }
  }

  // ---------- seasons ----------
  seasonsChanged() {
    const f = this.forest;
    this.seasonStarted = true;
    f.seasonT0 = this.audio.now;
    f.seasonShift = 0.45; // start in late summer, so autumn arrives soon
    if (!this.state.globals.seasons) { this.audio.tempOverride = null; this.audio.setTemp(this.state.globals.temp); f.season = null; }
  }

  // ---------- recording ----------
  async toggleRecord() {
    if (this.audio.recChunks) { await this.finishRecording(); return; }
    if (!this.audio.ready && !(await this.ensureAudio())) return;
    if (!this.forest.playing) await this.play();
    if (this.audio.startRecording()) this.recBtn.setAttribute('aria-pressed', 'true');
  }

  async finishRecording() {
    const rec = await this.audio.stopRecording();
    this.recBtn.setAttribute('aria-pressed', 'false');
    this.recLabel.textContent = 'Rec';
    if (!rec || rec.L.length < rec.rate * 0.2) return;
    const blob = encodeWav(rec.L, rec.R, rec.rate);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
    this.takes.unshift({ name: `Leaf Fall ${stamp}` + (this.takeCount++ ? ` (${this.takeCount})` : ''), seconds: rec.L.length / rec.rate, blob, url: URL.createObjectURL(blob), L: rec.L, R: rec.R, rate: rec.rate });
    while (this.takes.length > 4) { const old = this.takes.pop(); URL.revokeObjectURL(old.url); }
    this.ui.renderTakes(this.takes);
  }

  updateRecLabel() {
    if (!this.audio.recChunks) return;
    const s = this.audio.recSeconds;
    const txt = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if (this.recLabel.textContent !== txt) this.recLabel.textContent = txt;
    if (s > 600) this.finishRecording(); // ten minutes keeps the file a sensible size
  }

  deleteTake(t) {
    URL.revokeObjectURL(t.url);
    this.takes = this.takes.filter((x) => x !== t);
    this.ui.renderTakes(this.takes);
  }

  async saveTake(t) {
    const file = t.name.replace(/[^\w\- .()]/g, '').replace(/ /g, '-') + '.wav';
    const cap = window.Capacitor;
    try {
      if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
        const FS = cap.Plugins && cap.Plugins.Filesystem, Share = cap.Plugins && cap.Plugins.Share;
        if (!FS || !Share) return 'Saving needs a newer build of the app.';
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(t.blob); });
        const out = await FS.writeFile({ path: file, data: b64, directory: 'CACHE' });
        await Share.share({ title: t.name, files: [out.uri], dialogTitle: 'Save or send the recording' });
        return '';
      }
      const a = document.createElement('a');
      a.href = t.url; a.download = file; document.body.append(a); a.click(); a.remove();
      return `Saved as ${file}.`;
    } catch (e) {
      return e && /cancel/i.test(String(e.message || e)) ? '' : 'The recording could not be saved.';
    }
  }

  // ---------- recorded sounds for the Sample engine ----------
  async setSample(r, sample) {
    const slot = this.state.slots[r];
    const old = slot.sampleKey;
    const key = newKey();
    await putSample(key, sample);
    this.audio.sendSample(key, sample.data, sample.rate);
    slot.sampleKey = key; slot.sampleName = sample.name; slot.engine = 'sample';
    if (old && !this.state.slots.some((s) => s.sampleKey === old)) { deleteSample(old); this.audio.sendSample(old, null); }
    this.changed();
  }

  async loadSampleFile(r, file) {
    if (!this.audio.ready && !(await this.ensureAudio())) return false;
    try {
      const m = await this.audio.decode(await file.arrayBuffer());
      await this.setSample(r, { name: file.name.replace(/\.[^.]+$/, ''), data: m.data, rate: m.rate });
      return true;
    } catch (e) { return false; }
  }

  async useTake(t, r) {
    if (!this.audio.ready && !(await this.ensureAudio())) return;
    const m = toMono([t.L, t.R], t.rate);
    await this.setSample(r, { name: t.name, data: m.data, rate: m.rate });
  }

  clearSample(r) {
    const slot = this.state.slots[r], key = slot.sampleKey;
    slot.sampleKey = null; slot.sampleName = null;
    if (key && !this.state.slots.some((s) => s.sampleKey === key)) { deleteSample(key); this.audio.sendSample(key, null); }
    this.changed();
  }

  async restoreSamples() {
    const keys = new Set(this.state.slots.map((s) => s.sampleKey).filter(Boolean));
    for (const key of keys) {
      const s = await getSample(key);
      if (s) this.audio.sendSample(key, s.data, s.rate);
      else this.state.slots.forEach((slot) => { if (slot.sampleKey === key) { slot.sampleKey = null; slot.sampleName = null; } });
    }
  }

  updateStatus() {
    const n = this.audio.voiceState.size;
    const mass = this.audio.mass;
    const parts = [];
    if (this.forest.playing) {
      parts.push(`${n} ${n === 1 ? 'leaf' : 'leaves'} sounding`);
      parts.push(`litter ${mass.toFixed(1)}`);
      if (this.forest.season) parts.push(this.forest.season.name.toLowerCase());
      if (this.audio.rain > 0.05) parts.push('raining');
    } else parts.push('The wind sets the rhythm');
    const txt = parts.join(' · ');
    if (this.statusEl.textContent !== txt) this.statusEl.textContent = txt;
  }
}

const app = new App();
app.init();
window.leafFall = app;
