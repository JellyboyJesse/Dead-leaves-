import { AudioEngine } from './audio.js';
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
    this.forest.onLand = (l) => this.ui.landed(l);
    this.audio.onState = () => this.audio.updateDamping();
  }

  init() {
    this.ui.build();
    this.ui.showTab('tree');
    this.playBtn.addEventListener('click', () => this.togglePlay());
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
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async ensureAudio() {
    try {
      await this.audio.start();
      this.audio.setGlobals(this.state.globals);
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
  }

  updateStatus() {
    const n = this.audio.voiceState.size;
    const mass = this.audio.mass;
    const parts = [];
    if (this.forest.playing) {
      parts.push(`${n} ${n === 1 ? 'leaf' : 'leaves'} sounding`);
      parts.push(`litter ${mass.toFixed(1)}`);
      if (this.audio.rain > 0.05) parts.push('raining');
    } else parts.push('The wind sets the rhythm');
    const txt = parts.join(' · ');
    if (this.statusEl.textContent !== txt) this.statusEl.textContent = txt;
  }
}

const app = new App();
app.init();
window.leafFall = app;
